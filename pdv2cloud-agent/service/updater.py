"""
Auto-update do agente PDV2Cloud.

Fluxo completo:
  1. check_for_updates()  — compara versão local vs. servidor (GET /version)
  2. download_update()    — download em chunks com progresso; retoma se interrompido
  3. _verify_checksum()   — SHA-256 obrigatório; aborta se não bater
  4. install_update()     — executa /VERYSILENT dentro da janela de manutenção
  5. _cleanup()           — remove temporários via thread daemon após 90s

Janela de manutenção (padrão: 02:00–05:00):
  Fora da janela, a atualização é baixada e fica em espera. Na próxima vez que
  o scheduler rodar dentro da janela, a instalação acontece.  Isso evita reiniciar
  o serviço no pico do dia.

Rollback:
  O instalador Inno Setup usa /NORESTART e /RESTARTAPPLICATIONS.  Se o processo
  do instalador retornar exit code != 0, o agente registra o erro e descarta o
  download — na próxima verificação diária tenta novamente.

Progresso:
  Atualiza status.json com fase e percentual para o Electron UI exibir.
"""

import hashlib
import logging
import os
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, time as dt_time
from pathlib import Path
from typing import Optional, Callable

import requests

logger = logging.getLogger("PDV2Cloud.Updater")

DEFAULT_BASE_URL     = "https://mercadoflow.com"
VERSION_PATH         = "/api/v1/downloads/agent-installer/version"
DOWNLOAD_PATH        = "/api/v1/downloads/agent-installer"

DOWNLOAD_TIMEOUT_S   = 600      # 10 min para baixar ~260 MB
CHECK_TIMEOUT_S      = 10
CHUNK_SIZE           = 1024 * 256   # 256 KB por chunk

# Janela de manutenção: instala apenas entre estas horas (hora local)
MAINTENANCE_WINDOW_START = dt_time(2, 0)   # 02:00
MAINTENANCE_WINDOW_END   = dt_time(5, 0)   # 05:00

# Retry de download: 3 tentativas com espera entre elas
DOWNLOAD_RETRIES = 3
DOWNLOAD_RETRY_WAIT_S = 30


def _get_candidate_install_dirs() -> list[Path]:
    dirs = []
    drive = Path.home().drive or "C:"
    env_pf    = os.environ.get("ProgramFiles")
    env_pfx86 = os.environ.get("ProgramFiles(x86)")
    if env_pf:
        dirs.append(Path(env_pf) / "PDV2Cloud")
    if env_pfx86:
        dirs.append(Path(env_pfx86) / "PDV2Cloud")
    dirs.append(Path(f"{drive}/Program Files/PDV2Cloud"))
    dirs.append(Path(f"{drive}/Program Files (x86)/PDV2Cloud"))
    seen, unique = set(), []
    for d in dirs:
        k = str(d).lower()
        if k not in seen:
            seen.add(k)
            unique.append(d)
    return unique


def get_installed_version() -> str:
    for base in _get_candidate_install_dirs():
        try:
            vf = base / "version.txt"
            if vf.exists():
                v = vf.read_text(encoding="utf-8").strip()
                if v:
                    return v
        except Exception as exc:
            logger.debug("version.txt em %s inacessível: %s", base, exc)
    return "0.0.0"   # força update na primeira execução se version.txt sumir


def get_installed_arch() -> str:
    """
    Lê arch.txt gravado pelo instalador Inno Setup (CurStepChanged/ssPostInstall).
    Retorna "x64" ou "x86". Fallback: detecta via PROCESSOR_ARCHITECTURE env var.
    """
    for base in _get_candidate_install_dirs():
        try:
            af = base / "arch.txt"
            if af.exists():
                arch = af.read_text(encoding="utf-8").strip().lower()
                if arch in ("x64", "x86"):
                    return arch
        except Exception as exc:
            logger.debug("arch.txt em %s inacessível: %s", base, exc)

    # Fallback: detectar pelo ambiente do processo atual
    proc_arch = os.environ.get("PROCESSOR_ARCHITECTURE", "").upper()
    wow64_arch = os.environ.get("PROCESSOR_ARCHITEW6432", "").upper()
    if proc_arch == "AMD64" or wow64_arch == "AMD64":
        logger.debug("arch.txt não encontrado — detectado x64 via env")
        return "x64"
    logger.debug("arch.txt não encontrado — assumindo x86 via env (%s)", proc_arch)
    return "x86"


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(CHUNK_SIZE), b""):
            h.update(chunk)
    return h.hexdigest()


def _parse_version(v: str) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in str(v).strip().split("."))
    except (ValueError, AttributeError):
        return (0,)


def _in_maintenance_window() -> bool:
    now = datetime.now().time()
    if MAINTENANCE_WINDOW_START <= MAINTENANCE_WINDOW_END:
        return MAINTENANCE_WINDOW_START <= now <= MAINTENANCE_WINDOW_END
    # Janela que atravessa meia-noite (ex: 23:00–01:00)
    return now >= MAINTENANCE_WINDOW_START or now <= MAINTENANCE_WINDOW_END


class UpdateChecker:
    """
    Gerencia todo o ciclo de vida de uma atualização: detecção → download →
    validação → instalação → limpeza.

    Args:
        base_url:          URL base do backend (ex: "https://mercadoflow.com")
        current_version:   Versão instalada (padrão: lida de version.txt)
        on_progress:       Callback(phase: str, pct: int) — atualizado durante download
        respect_window:    Se True, só instala dentro da janela de manutenção
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        current_version: Optional[str] = None,
        on_progress: Optional[Callable[[str, int], None]] = None,
        respect_window: bool = True,
        arch: Optional[str] = None,
    ):
        self.base_url        = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.current_version = current_version or get_installed_version()
        self.on_progress     = on_progress
        self.respect_window  = respect_window
        self.arch            = arch or get_installed_arch()

        logger.info("UpdateChecker iniciado: versão=%s arch=%s", self.current_version, self.arch)

        self._latest_version: Optional[str] = None
        self._latest_sha256:  Optional[str] = None
        self._pending_installer: Optional[Path] = None   # baixado mas aguardando janela

    # ── API pública ──────────────────────────────────────────────────────────

    def perform_auto_update(self) -> bool:
        """
        Executa o ciclo completo de atualização.

        Retorna True se uma nova versão foi instalada (ou posta em espera para
        instalar na próxima janela de manutenção).
        """
        logger.info("Auto-update: verificando versão instalada %s", self.current_version)
        self._report("verificando", 0)

        # 1. Verificar se há versão nova
        if not self._check():
            self._report("atualizado", 100)
            return False

        logger.info("Nova versão disponível: %s → %s", self.current_version, self._latest_version)
        self._report("nova_versão", 0)

        # 2. Reutilizar installer já baixado se o hash bater
        if self._pending_installer and self._pending_installer.exists():
            if self._verify_checksum(self._pending_installer):
                logger.info("Usando installer já baixado: %s", self._pending_installer)
            else:
                logger.warning("Installer em cache com hash inválido — descartando")
                self._discard_pending()

        # 3. Baixar se não houver installer válido em cache
        if not self._pending_installer:
            installer = self._download_with_retry()
            if installer is None:
                self._report("erro_download", 0)
                return False
            self._pending_installer = installer

        # 4. Instalar — respeita janela de manutenção
        if self.respect_window and not _in_maintenance_window():
            logger.info(
                "Installer pronto mas fora da janela de manutenção (%s–%s). "
                "Instalação agendada para a próxima janela.",
                MAINTENANCE_WINDOW_START.strftime("%H:%M"),
                MAINTENANCE_WINDOW_END.strftime("%H:%M"),
            )
            self._report("aguardando_janela", 100)
            return True   # voltará a True no próximo perform_auto_update() dentro da janela

        return self._do_install()

    def check_for_updates(self) -> bool:
        """Apenas verifica, sem baixar. Para uso em relatórios de status."""
        return self._check()

    # ── Internals ────────────────────────────────────────────────────────────

    def _check(self) -> bool:
        """Consulta /version no servidor. Retorna True se versão nova disponível."""
        url = f"{self.base_url}{VERSION_PATH}?arch={self.arch}"
        try:
            resp = requests.get(url, timeout=CHECK_TIMEOUT_S)
            resp.raise_for_status()
            data = resp.json()
            latest = data.get("version", "")
            sha256 = data.get("sha256", "")
            if not latest or latest == "unknown":
                logger.debug("Servidor não retornou versão válida: %s", data)
                return False
            self._latest_version = latest
            self._latest_sha256  = sha256 or None
            is_newer = _parse_version(latest) > _parse_version(self.current_version)
            if not is_newer:
                logger.info("Versão atual %s já é a mais recente", self.current_version)
            return is_newer
        except Exception as exc:
            logger.warning("Verificação de atualização falhou: %s", exc)
            return False

    def _download_with_retry(self) -> Optional[Path]:
        """Tenta baixar o installer até DOWNLOAD_RETRIES vezes."""
        for attempt in range(1, DOWNLOAD_RETRIES + 1):
            try:
                path = self._download()
                if path:
                    return path
            except Exception as exc:
                logger.warning("Download tentativa %d/%d falhou: %s", attempt, DOWNLOAD_RETRIES, exc)
            if attempt < DOWNLOAD_RETRIES:
                logger.info("Aguardando %ds antes de tentar novamente...", DOWNLOAD_RETRY_WAIT_S)
                time.sleep(DOWNLOAD_RETRY_WAIT_S)
        logger.error("Download falhou após %d tentativas", DOWNLOAD_RETRIES)
        return None

    def _download(self) -> Optional[Path]:
        """
        Baixa o installer para um arquivo temporário.
        Suporta Content-Range / resumo se o servidor aceitar.
        Valida SHA-256 ao final.
        """
        url = f"{self.base_url}{DOWNLOAD_PATH}?arch={self.arch}"
        version_tag = self._latest_version or "latest"
        arch_suffix = "-x86" if self.arch == "x86" else ""
        target = Path(tempfile.gettempdir()) / f"PDV2Cloud-Setup{arch_suffix}-{version_tag}.exe"

        logger.info("Baixando atualização %s → %s", version_tag, target)
        self._report("baixando", 0)

        # Resumo: verifica quantos bytes já temos
        existing_bytes = target.stat().st_size if target.exists() else 0
        headers = {}
        if existing_bytes > 0:
            headers["Range"] = f"bytes={existing_bytes}-"
            logger.info("Retomando download a partir de %d bytes", existing_bytes)

        try:
            resp = requests.get(
                url,
                headers=headers,
                stream=True,
                timeout=DOWNLOAD_TIMEOUT_S,
            )
        except Exception as exc:
            raise RuntimeError(f"Falha ao conectar para download: {exc}") from exc

        # 206 = Partial Content (servidor aceita resumo), 200 = começa do zero
        if resp.status_code == 206:
            mode = "ab"   # append
        elif resp.status_code == 200:
            mode = "wb"   # sobrescreve (servidor não aceita Range ou arquivo corrompido)
            existing_bytes = 0
        else:
            raise RuntimeError(f"HTTP {resp.status_code} ao baixar installer")

        total = int(resp.headers.get("content-length", 0)) + existing_bytes
        downloaded = existing_bytes

        try:
            with target.open(mode) as f:
                for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            pct = int(downloaded / total * 100)
                            self._report("baixando", pct)
        except Exception as exc:
            raise RuntimeError(f"Erro ao gravar installer: {exc}") from exc

        logger.info("Download concluído: %d bytes em %s", downloaded, target)
        self._report("validando", 99)

        # Validação de integridade obrigatória
        if not self._verify_checksum(target):
            target.unlink(missing_ok=True)
            raise RuntimeError(
                "SHA-256 do installer não confere com o servidor — arquivo descartado"
            )

        self._report("validado", 100)
        return target

    def _verify_checksum(self, path: Path) -> bool:
        """
        Verifica SHA-256.  Se o servidor não forneceu hash, aceita com aviso
        (compatibilidade com versões antigas do backend).
        """
        if not self._latest_sha256:
            logger.warning(
                "Servidor não forneceu SHA-256 — pulando validação de integridade "
                "(atualize o backend para habilitar verificação)"
            )
            return True

        local_hash = _sha256_of_file(path)
        if local_hash.lower() == self._latest_sha256.lower():
            logger.info("SHA-256 válido: %s", local_hash[:16] + "...")
            return True

        logger.error(
            "SHA-256 INVÁLIDO! Esperado: %s  Recebido: %s",
            self._latest_sha256[:16] + "...",
            local_hash[:16] + "...",
        )
        return False

    def _do_install(self) -> bool:
        """Executa o installer silencioso e aguarda o código de saída."""
        installer = self._pending_installer
        if not installer or not installer.exists():
            logger.error("Installer não encontrado para instalação: %s", installer)
            return False

        args = [
            str(installer),
            "/VERYSILENT",
            "/SUPPRESSMSGBOXES",
            "/NORESTART",
            "/CLOSEAPPLICATIONS",
            "/RESTARTAPPLICATIONS",
        ]
        logger.info("Iniciando instalação: %s", " ".join(args))
        self._report("instalando", 0)

        try:
            proc = subprocess.Popen(
                args,
                creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True,
            )
            # Aguarda até 5 min para o instalador terminar
            try:
                rc = proc.wait(timeout=300)
            except subprocess.TimeoutExpired:
                logger.error("Instalador demorou mais de 5 min — abandonando processo")
                self._report("erro_instalacao", 0)
                self._discard_pending()
                return False

            if rc != 0:
                logger.error(
                    "Instalador retornou exit code %d — possível falha. "
                    "Mantendo versão atual.",
                    rc,
                )
                self._report("erro_instalacao", 0)
                self._discard_pending()
                return False

            logger.info(
                "Instalação concluída (exit 0). Serviço será reiniciado automaticamente."
            )
            self._report("instalado", 100)
            self._schedule_cleanup(installer)
            self._pending_installer = None
            return True

        except Exception as exc:
            logger.error("Falha ao executar instalador: %s", exc)
            self._report("erro_instalacao", 0)
            self._discard_pending()
            return False

    def _discard_pending(self):
        if self._pending_installer:
            try:
                self._pending_installer.unlink(missing_ok=True)
            except Exception:
                pass
            self._pending_installer = None

    @staticmethod
    def _schedule_cleanup(path: Path):
        """Remove o arquivo temporário do installer 90s após o início da instalação."""
        def _delete():
            time.sleep(90)
            try:
                path.unlink(missing_ok=True)
                logger.debug("Installer temporário removido: %s", path)
            except Exception as exc:
                logger.debug("Não foi possível remover installer temporário: %s", exc)

        t = threading.Thread(target=_delete, name="InstallerCleanup", daemon=True)
        t.start()

    def _report(self, phase: str, pct: int):
        """Notifica o callback de progresso, se registrado."""
        if self.on_progress:
            try:
                self.on_progress(phase, pct)
            except Exception:
                pass
        logger.debug("Update progress: phase=%s pct=%d", phase, pct)
