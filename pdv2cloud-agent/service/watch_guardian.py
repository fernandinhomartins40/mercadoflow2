"""
WatchPathGuardian — monitora continuamente se as pastas configuradas estão
acessíveis e re-monta o observer watchdog quando uma pasta volta a existir.

Problema que resolve:
    O observer do watchdog para silenciosamente de entregar eventos se a pasta
    monitorada for removida (ex: HD externo desconectado, pasta renomeada, drive
    de rede cai). O serviço continua rodando sem erros visíveis, mas nenhuma
    nota é coletada até um reinício manual.

Solução:
    Uma thread dedicada verifica a cada CHECK_INTERVAL_SECONDS se todas as
    pastas configuradas estão acessíveis.

    - Se uma pasta está acessível mas não tem schedule ativo no observer →
      re-agenda e dispara scan_existing() para não perder notas chegadas durante
      a ausência.
    - Se uma pasta desapareceu → registra no status mas não trava.
    - Se o observer inteiro travou (is_alive() == False) → reinicia o observer.
"""

import logging
import threading
import time
from pathlib import Path

from watchdog.observers import Observer

logger = logging.getLogger("PDV2Cloud.WatchGuardian")

CHECK_INTERVAL_SECONDS = 30   # frequência de verificação das pastas


class WatchPathGuardian:
    """
    Usa o mesmo FileWatcher existente como fonte de verdade; apenas verifica
    saúde do observer e re-monta rotas ausentes.
    """

    def __init__(self, file_watcher, check_interval: int = CHECK_INTERVAL_SECONDS):
        self._watcher = file_watcher
        self._check_interval = check_interval
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run, name="WatchGuardian", daemon=True
        )
        # Rastreia quais caminhos já estão com schedule ativo
        self._scheduled_paths: set[Path] = set()

    # ── Public API ──────────────────────────────────────────────────────────

    def start(self, initially_scheduled: set[Path] | None = None):
        if initially_scheduled:
            self._scheduled_paths = set(initially_scheduled)
        self._thread.start()
        logger.info("WatchPathGuardian iniciado (verificação a cada %ds)",
                    self._check_interval)

    def stop(self):
        self._stop_event.set()

    # ── Internal ────────────────────────────────────────────────────────────

    def _run(self):
        while not self._stop_event.is_set():
            self._stop_event.wait(timeout=self._check_interval)
            if self._stop_event.is_set():
                break
            try:
                self._check()
            except Exception as exc:
                logger.error("WatchGuardian verificação falhou: %s", exc)

    def _check(self):
        watcher = self._watcher
        observer: Observer = watcher.observer

        # 1. Observer travado → reinicia completamente
        if watcher._started and not observer.is_alive():
            logger.warning("Observer watchdog morreu — reiniciando...")
            self._restart_observer()
            return

        # 2. Verifica cada pasta configurada
        for path in watcher.watch_paths:
            if not path.exists():
                if path in self._scheduled_paths:
                    logger.warning(
                        "Pasta monitorada desapareceu: %s — aguardando retorno", path
                    )
                    self._scheduled_paths.discard(path)
                continue

            # Pasta voltou (ou nunca foi agendada)
            if path not in self._scheduled_paths:
                logger.info("Pasta monitorada voltou/apareceu: %s — re-agendando", path)
                self._remount_path(path)

    def _remount_path(self, path: Path):
        watcher = self._watcher
        observer: Observer = watcher.observer

        try:
            path.mkdir(parents=True, exist_ok=True)
            observer.schedule(watcher.handler, str(path), recursive=True)
            self._scheduled_paths.add(path)
            logger.info("Observer re-agendado para: %s", path)

            # Varre arquivos que chegaram enquanto a pasta estava inacessível
            try:
                recovered = 0
                for p in sorted(path.rglob("*")):
                    if p.is_file():
                        from .watcher import _is_valid_file
                        if _is_valid_file(p):
                            watcher._process_file(p)
                            recovered += 1
                if recovered:
                    logger.info(
                        "Re-scan após re-mount: %d arquivo(s) enfileirado(s) de %s",
                        recovered, path,
                    )
            except Exception as exc:
                logger.warning("Re-scan de %s falhou: %s", path, exc)

        except Exception as exc:
            logger.error("Falha ao re-agendar pasta %s: %s", path, exc)

    def _restart_observer(self):
        watcher = self._watcher
        try:
            try:
                watcher.observer.stop()
                watcher.observer.join(timeout=5)
            except Exception:
                pass

            watcher.observer = Observer()
            watcher._started = False
            self._scheduled_paths.clear()

            # Re-agenda todas as pastas acessíveis
            for path in watcher.watch_paths:
                if path.exists():
                    try:
                        watcher.observer.schedule(
                            watcher.handler, str(path), recursive=True
                        )
                        self._scheduled_paths.add(path)
                    except Exception as exc:
                        logger.warning("Falha ao re-agendar %s: %s", path, exc)

            if self._scheduled_paths:
                watcher.observer.start()
                watcher._started = True
                logger.info(
                    "Observer reiniciado com %d pasta(s)", len(self._scheduled_paths)
                )
                # Re-scan completo após restart
                try:
                    recovered = watcher.scan_existing()
                    if recovered:
                        logger.info("Re-scan pós-restart: %d arquivo(s) enfileirado(s)", recovered)
                except Exception as exc:
                    logger.warning("Re-scan pós-restart falhou: %s", exc)
            else:
                logger.warning("Observer reiniciado mas sem pastas acessíveis")

        except Exception as exc:
            logger.error("Falha crítica ao reiniciar observer: %s", exc)
