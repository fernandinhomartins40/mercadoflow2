import json
import logging
import logging.handlers
import time
from datetime import datetime
from pathlib import Path
import threading
import schedule
from http.server import HTTPServer, BaseHTTPRequestHandler

from .config import load_config_secure, save_config
from .crypto import SecureConfig
from .queue_manager import QueueManager
from .watcher import FileWatcher
from .transmitter import APITransmitter
from .connection_manager import ConnectionManager
from .watch_guardian import WatchPathGuardian
from .messages import classify_error, get_friendly_error, is_transient_error, STATUS_MESSAGES, UPDATE_PHASE_LABELS
from .json_logger import configure_json_logging
from .updater import UpdateChecker

STATUS_FILE = Path("C:/ProgramData/PDV2Cloud/status.json")
LOG_DIR = Path("C:/ProgramData/PDV2Cloud/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("PDV2Cloud")
configure_json_logging(logger, str(LOG_DIR / "agent.log"))


def update_status(
    queue_manager: QueueManager,
    online: bool,
    last_processed: str | None,
    last_error: dict | None = None,
    update_info: dict | None = None,
) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    queue_stats = {
        "total": 0,
        "pending": 0,
        "processing": 0,
        "sent": 0,
        "error": 0,
        "dead_letter": 0,
        **(queue_manager.stats() or {}),
    }

    # Determine user-friendly status message
    if update_info and update_info.get("phase") in ("baixando", "instalando", "aguardando_janela"):
        status_msg = STATUS_MESSAGES.get("updating", "Atualizando o agente...")
    elif not online:
        status_msg = STATUS_MESSAGES["offline"]
    elif queue_stats.get("error", 0) > 0:
        status_msg = STATUS_MESSAGES["error"]
    elif queue_stats.get("pending", 0) > 0 or queue_stats.get("processing", 0) > 0:
        status_msg = STATUS_MESSAGES["processing"]
    else:
        status_msg = STATUS_MESSAGES["idle"] if queue_stats.get("total", 0) == 0 else STATUS_MESSAGES["online"]

    status = {
        "timestamp": datetime.utcnow().isoformat(),
        "online": online,
        "status_message": status_msg,
        "queue": queue_stats,
        "last_processed": last_processed,
        "last_error": last_error,
    }
    if update_info:
        status["update"] = update_info
    STATUS_FILE.write_text(json.dumps(status, indent=2), encoding="utf-8")


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(STATUS_FILE.read_bytes() if STATUS_FILE.exists() else b"{}")

    def log_message(self, format, *args):  # silencia logs do HTTPServer no stdout
        pass


class ServiceApp:
    def __init__(self):
        self.secure_config = SecureConfig()

        # Carrega config com fallback para modo standby se ainda não configurado
        try:
            self.config = load_config_secure(self.secure_config)
        except FileNotFoundError:
            logger.warning("Configuration file not found. Service will run in standby mode until configured.")
            self.config = {
                "api_url": "",
                "api_key": "",
                "market_id": "",
                "watch_paths": [],
                "xsd_paths": [],
                "retry_interval_minutes": 5,
                "poll_interval_seconds": 10,
                "healthcheck_enabled": True,
                "healthcheck_port": 8765,
                "auto_update_enabled": True,
            }

        api_key = self.config.get("api_key", "")
        if not api_key:
            logger.warning("API key not configured. Service running in standby mode.")

        self.queue_manager = QueueManager()

        # Evento disparado pelo watcher ao detectar arquivo novo — acorda o loop imediatamente
        self._new_file_event = threading.Event()
        self.file_watcher = FileWatcher(
            self.config.get("watch_paths", []),
            self.queue_manager,
            self.config.get("xsd_paths", []),
            on_new_file=self._on_new_file_detected,
        )
        self.transmitter = APITransmitter(
            self.config.get("api_url", ""),
            self.config.get("api_key", ""),
            self.config.get("market_id", ""),
        )

        # ConnectionManager substitui o heartbeat manual — controla online/offline
        # com backoff adaptativo e notifica ao reconectar.
        self.connection_manager = ConnectionManager(
            transmitter=self.transmitter,
            on_reconnect=[self._on_reconnected],
            on_disconnect=[self._on_disconnected],
        )

        self.stop_event = threading.Event()
        self.last_processed = None
        self.last_error = None
        self._update_info: dict | None = None   # fase e progresso de update para status.json

        configured_api_url = self.config.get("api_url") or None
        self.update_checker = UpdateChecker(
            base_url=configured_api_url,
            on_progress=self._on_update_progress,
        )

        # WatchPathGuardian — re-monta observer se pasta sumir (HD removido, etc.)
        self.watch_guardian = WatchPathGuardian(self.file_watcher)

    # ── Callbacks do ConnectionManager ──────────────────────────────────────

    def _on_new_file_detected(self):
        """Chamado pelo watcher ao detectar novo arquivo. Acorda o loop principal."""
        self._new_file_event.set()

    def _on_reconnected(self):
        """Chamado pelo ConnectionManager quando a conexão é restabelecida."""
        logger.info("Conexão restabelecida — processando fila imediatamente")
        self.last_error = None
        # Acorda o main loop para processar itens pendentes sem esperar o poll
        self._new_file_event.set()
        update_status(self.queue_manager, True, self.last_processed, None, update_info=self._update_info)

    def _on_disconnected(self):
        """Chamado pelo ConnectionManager quando a conexão cai."""
        error_msg = get_friendly_error("connection_refused")
        self.last_error = error_msg
        update_status(self.queue_manager, False, self.last_processed, error_msg, update_info=self._update_info)

    # ── Startup ─────────────────────────────────────────────────────────────

    def start(self):
        logger.info("Starting PDV2Cloud service")

        # Envolvemos o startup inteiro para evitar timeout do Windows Service Control Manager
        try:
            try:
                recovered = self.queue_manager.reset_stuck_processing(max_age_minutes=5)
                if recovered:
                    logger.info("Recovered %s stuck items back to PENDING", recovered)
                deleted = self.queue_manager.cleanup_sent(max_age_days=30)
                if deleted:
                    logger.info("Cleaned up %s SENT items older than retention window", deleted)
            except Exception as exc:
                logger.warning("Queue maintenance failed: %s", exc)

            self.file_watcher.start()
            try:
                scanned = self.file_watcher.scan_existing()
                if scanned:
                    logger.info("Initial scan enqueued %s existing files", scanned)
            except Exception as exc:
                logger.warning("Initial scan failed: %s", exc)

            threading.Thread(target=self.file_watcher.loop, args=(self.stop_event,), daemon=True).start()

            # Hydrate agent config em background (busca market_id via API se ausente)
            if self.config.get("api_key") and not self.config.get("market_id"):
                threading.Thread(target=self._hydrate_agent_config, daemon=True).start()

            # ── ConnectionManager ──────────────────────────────────────────
            # Só inicia se houver credenciais — em modo standby fica quieto
            if self.config.get("api_url") and self.config.get("api_key"):
                self.connection_manager.start()
                # Probe imediato para mostrar status no UI sem esperar 2 min
                self.connection_manager.force_probe()
            else:
                update_status(self.queue_manager, False, self.last_processed, None, update_info=None)

            # ── WatchPathGuardian ─────────────────────────────────────────
            initially_scheduled = set(self.file_watcher.watch_paths)
            self.watch_guardian.start(initially_scheduled=initially_scheduled)

            # ── Scheduler de tarefas periódicas ───────────────────────────
            retry_interval = self.config.get("retry_interval_minutes", 5)
            schedule.every(retry_interval).minutes.do(self._retry_errors)
            schedule.every(6).hours.do(self._resurrect_dead_letters)
            schedule.every(10).minutes.do(self._reconcile_sent_invoices)
            schedule.every().day.at("03:00").do(lambda: self.queue_manager.cleanup_sent(max_age_days=30))
            schedule.every().day.at("04:00").do(self._check_for_updates)

            update_status(self.queue_manager, self.connection_manager.is_online(), self.last_processed, self.last_error)

            # Reconciliação inicial em background (verifica notas que podem ter
            # sido enviadas antes de um crash e estão marcadas como SENT localmente)
            threading.Thread(target=self._reconcile_sent_invoices, daemon=True).start()

            if self.config.get("healthcheck_enabled", True):
                threading.Thread(target=self._start_health_server, daemon=True).start()

            # Loop principal em thread não-daemon para não ser morto pelo Windows SCM
            threading.Thread(target=self._main_loop, daemon=False).start()
            logger.info("PDV2Cloud service started successfully")

        except Exception as exc:
            logger.error("CRITICAL: Service startup failed: %s", exc, exc_info=True)
            logger.warning("Service running in degraded mode - check logs for errors")

    def _main_loop(self):
        """Loop principal de processamento.

        Acorda de duas formas:
        1. Imediatamente quando o watcher detecta arquivo novo (_new_file_event).
        2. Pelo poll_interval_seconds como fallback (garante retry e heartbeat periódicos).
        """
        poll_interval = self.config.get("poll_interval_seconds", 10)
        while not self.stop_event.is_set():
            self._new_file_event.wait(timeout=poll_interval)
            self._new_file_event.clear()

            if self.stop_event.is_set():
                break

            # Debounce: aguarda o watcher confirmar que o arquivo fechou
            time.sleep(2)

            self.process_queue()
            schedule.run_pending()
            update_status(
                self.queue_manager,
                self.connection_manager.is_online(),
                self.last_processed,
                self.last_error,
                update_info=self._update_info,
            )

    def stop(self):
        self.stop_event.set()
        self.connection_manager.stop()
        self.watch_guardian.stop()
        self.file_watcher.stop()
        logger.info("PDV2Cloud service stopped")

    # ── Processamento da fila ───────────────────────────────────────────────

    def process_queue(self):
        pending = self.queue_manager.next_pending(50)
        if not pending:
            return

        for item in pending:
            self.queue_manager.mark_processing(item.id)
            payload = json.loads(item.payload_json)
            try:
                ok = self.transmitter.send_invoice(payload)
                if ok:
                    self.last_error = None
                    self.queue_manager.mark_sent(item.id)
                    self.last_processed = datetime.utcnow().isoformat()
                else:
                    dead = item.tentativas + 1 >= 5
                    error_msg = get_friendly_error("unknown_error")
                    self.last_error = error_msg
                    self.queue_manager.mark_error(item.id, error_msg["message"], dead_letter=dead)
            except Exception as exc:
                error_type = classify_error(exc)
                error_msg = get_friendly_error(error_type, str(exc))
                self.last_error = error_msg
                logger.error("Processing error [%s]: %s", error_type, error_msg["technical"])

                # Erros transitórios: recoloca em ERROR para retry automático.
                # Erros permanentes (XML inválido, permissão): vai direto para
                # DEAD_LETTER se já tentou o suficiente, senão marca ERROR normal.
                if is_transient_error(error_type):
                    # Transitório: tenta até 5x antes de ir para dead letter
                    dead = item.tentativas + 1 >= 5
                else:
                    # Permanente (XML corrompido, encoding): dead letter imediato
                    # após 2 tentativas (dá margem para arquivo ainda sendo escrito)
                    dead = item.tentativas + 1 >= 2

                self.queue_manager.mark_error(item.id, error_msg["message"], dead_letter=dead)

    # ── Tarefas periódicas ──────────────────────────────────────────────────

    def _retry_errors(self):
        """Recoloca itens ERROR em PENDING para nova tentativa."""
        self.queue_manager.reset_errors()

    def _resurrect_dead_letters(self):
        """Ressuscita itens DEAD_LETTER antigos que podem ter falhado por indisponibilidade."""
        try:
            revived = self.queue_manager.resurrect_dead_letters()
            if revived:
                # Acorda o loop para processar imediatamente
                self._new_file_event.set()
        except Exception as exc:
            logger.warning("Dead letter resurrection falhou: %s", exc)

    def _reconcile_sent_invoices(self):
        """Verifica se as notas marcadas como SENT existem de fato no servidor."""
        api_url = self.config.get("api_url")
        api_key = self.config.get("api_key")
        if not api_url or not api_key:
            return
        if not self.connection_manager.is_online():
            return  # Não tenta reconciliar offline — gastaria recursos inutilmente

        try:
            known_sent = self.queue_manager.get_sent_chaves_for_reconciliation(limit=200)
            if not known_sent:
                return

            presence = self.transmitter.check_invoice_presence(known_sent)
            missing = presence.get("missing") or []
            if not missing:
                return

            requeued = self.queue_manager.requeue_missing_sent(missing)
            if requeued:
                logger.warning(
                    "Remote reconciliation requeued %s invoices missing on server",
                    requeued,
                )
                self._new_file_event.set()
        except Exception as exc:
            logger.warning("Sent invoice reconciliation failed: %s", exc)

    def _on_update_progress(self, phase: str, pct: int):
        """Recebe progresso do UpdateChecker e publica no status.json."""
        label = UPDATE_PHASE_LABELS.get(phase, phase)
        self._update_info = {"phase": phase, "label": label, "percent": pct}
        update_status(
            self.queue_manager,
            self.connection_manager.is_online(),
            self.last_processed,
            self.last_error,
            update_info=self._update_info,
        )

    def _check_for_updates(self):
        try:
            if not self.config.get("auto_update_enabled", True):
                return
            logger.info("Verificando atualizações disponíveis...")
            performed = self.update_checker.perform_auto_update()
            if performed:
                logger.info("Atualização iniciada ou em espera pela janela de manutenção.")
            else:
                # Limpa update_info do status quando não há nada pendente
                self._update_info = None
                update_status(
                    self.queue_manager,
                    self.connection_manager.is_online(),
                    self.last_processed,
                    self.last_error,
                )
        except Exception as exc:
            logger.error("Verificação de atualização falhou: %s", exc)
            self._update_info = None

    def _start_health_server(self):
        try:
            port = int(self.config.get("healthcheck_port", 8765))
            server = HTTPServer(("localhost", port), HealthHandler)
            logger.info("Health check server listening on localhost:%d", port)
            server.serve_forever()
        except Exception as exc:
            logger.error("Health check server failed to start: %s", exc)

    def _hydrate_agent_config(self):
        if self.config.get("market_id"):
            return
        api_key = self.config.get("api_key")
        api_url = self.config.get("api_url")
        if not api_key or not api_url:
            return
        try:
            transmitter = APITransmitter(
                api_url,
                api_key,
                self.config.get("market_id", ""),
            )
            profile = transmitter.get_agent_profile()
            market_id = profile.get("marketId")
            if market_id:
                self.config["market_id"] = market_id
                self.transmitter.market_id = market_id
                save_config(self.config)
        except Exception as exc:
            logger.warning("Nao foi possivel resolver o mercado via API: %s", exc)


if __name__ == "__main__":
    app = ServiceApp()
    try:
        app.start()
    except KeyboardInterrupt:
        app.stop()
