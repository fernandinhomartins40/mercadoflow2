"""
Gerencia o estado de conexão com o backend e implementa backoff adaptativo.

Quando online:  heartbeat a cada HEARTBEAT_ONLINE_SECONDS (120s).
Quando offline: re-tenta com backoff exponencial a partir de BACKOFF_BASE_SECONDS,
                dobrando até BACKOFF_MAX_SECONDS — evita flood de requisições em
                caso de queda prolongada do servidor.
Ao reconectar:  notifica callbacks registrados para disparar reprocessamento
                imediato da fila sem aguardar o próximo ciclo do main loop.
"""

import logging
import threading
import time
from typing import Callable, List

logger = logging.getLogger("PDV2Cloud.Connection")

HEARTBEAT_ONLINE_SECONDS = 120   # intervalo normal quando conectado
BACKOFF_BASE_SECONDS     = 15    # primeiro retry após queda
BACKOFF_MAX_SECONDS      = 300   # teto do backoff (5 min)
PROBE_TIMEOUT_SECONDS    = 10    # timeout do heartbeat individual

# Se o backend responde mas rejeita a chave, não faz sentido continuar tentando.
_FATAL_HTTP_CODES = {401, 403}


class ConnectionManager:
    """
    Roda em uma thread dedicada e mantém a visão canônica de online/offline.

    Uso:
        cm = ConnectionManager(transmitter, on_reconnect=[flush_queue_fn])
        cm.start()          # inicia thread de monitoramento
        cm.stop()           # para a thread ao encerrar o serviço
        cm.is_online()      # True/False
        cm.force_probe()    # acorda imediatamente (ex: ao iniciar serviço)
    """

    def __init__(
        self,
        transmitter,
        on_reconnect: List[Callable] | None = None,
        on_disconnect: List[Callable] | None = None,
    ):
        self._transmitter = transmitter
        self._on_reconnect: List[Callable] = on_reconnect or []
        self._on_disconnect: List[Callable] = on_disconnect or []

        self._online = False
        self._consecutive_failures = 0
        self._fatal_auth_error = False   # 401/403 → para de tentar

        self._stop_event = threading.Event()
        self._wake_event = threading.Event()   # permite acordar antecipadamente
        self._lock = threading.Lock()

        self._thread = threading.Thread(
            target=self._run, name="ConnectionMonitor", daemon=True
        )

    # ── Public API ──────────────────────────────────────────────────────────

    def start(self):
        self._thread.start()
        logger.info("ConnectionManager started")

    def stop(self):
        self._stop_event.set()
        self._wake_event.set()   # desbloqueia sleep para encerrar rápido

    def is_online(self) -> bool:
        with self._lock:
            return self._online

    def force_probe(self):
        """Acorda o monitor imediatamente (ex: logo ao iniciar o serviço)."""
        self._wake_event.set()

    def register_on_reconnect(self, fn: Callable):
        self._on_reconnect.append(fn)

    def register_on_disconnect(self, fn: Callable):
        self._on_disconnect.append(fn)

    # ── Internal loop ───────────────────────────────────────────────────────

    def _run(self):
        while not self._stop_event.is_set():
            delay = self._probe_and_schedule()
            # Aguarda o delay calculado OU acorda antecipadamente via force_probe()
            self._wake_event.wait(timeout=delay)
            self._wake_event.clear()

    def _probe_and_schedule(self) -> float:
        """Executa um heartbeat e retorna quantos segundos esperar até o próximo."""
        if self._fatal_auth_error:
            # Chave inválida: fica dormindo; não adianta tentar.
            logger.debug("ConnectionManager dormindo: erro de autenticação fatal")
            return BACKOFF_MAX_SECONDS

        api_url = getattr(self._transmitter, "base_url", "")
        api_key = getattr(self._transmitter, "api_key", "")
        if not api_url or not api_key:
            logger.debug("ConnectionManager: api_url/api_key não configurados")
            return BACKOFF_MAX_SECONDS

        was_online = self.is_online()
        success, fatal = self._do_heartbeat()

        if fatal:
            self._fatal_auth_error = True
            self._set_online(False)
            logger.error("Autenticação rejeitada pelo servidor (401/403). "
                         "Configure uma nova chave de acesso.")
            return BACKOFF_MAX_SECONDS

        if success:
            prev_failures = self._consecutive_failures
            self._consecutive_failures = 0
            self._set_online(True)

            if not was_online and prev_failures > 0:
                logger.info("Conexão restabelecida após %d tentativa(s) falha(s)",
                            prev_failures)
                self._notify(self._on_reconnect)

            return HEARTBEAT_ONLINE_SECONDS
        else:
            self._consecutive_failures += 1
            self._set_online(False)

            if was_online:
                logger.warning("Conexão com o servidor perdida. Iniciando backoff.")
                self._notify(self._on_disconnect)

            delay = min(
                BACKOFF_BASE_SECONDS * (2 ** (self._consecutive_failures - 1)),
                BACKOFF_MAX_SECONDS,
            )
            logger.debug(
                "Offline (falha #%d). Próxima tentativa em %.0fs",
                self._consecutive_failures, delay,
            )
            return delay

    def _do_heartbeat(self) -> tuple[bool, bool]:
        """
        Retorna (sucesso, fatal).
        fatal=True indica 401/403 — autenticação inválida, não adianta retentar.
        """
        try:
            ok = self._transmitter.send_heartbeat()
            return bool(ok), False
        except Exception as exc:
            import requests.exceptions as req_exc
            if isinstance(exc, req_exc.HTTPError):
                code = getattr(getattr(exc, "response", None), "status_code", 0)
                if code in _FATAL_HTTP_CODES:
                    return False, True
            logger.debug("Heartbeat falhou: %s", exc)
            return False, False

    def _set_online(self, value: bool):
        with self._lock:
            self._online = value

    @staticmethod
    def _notify(callbacks: List[Callable]):
        for fn in callbacks:
            try:
                fn()
            except Exception as exc:
                logger.warning("Callback de conexão falhou: %s", exc)
