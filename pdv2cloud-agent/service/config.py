import json
import logging
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger("PDV2Cloud.Config")

# Hosts aceitos com http:// (só desenvolvimento local).
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

CONFIG_DIR = Path("C:/ProgramData/PDV2Cloud")
CONFIG_FILE = CONFIG_DIR / "config.json"


def ensure_config(template_path: Path) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        data = json.loads(template_path.read_text(encoding="utf-8"))
        CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        raise FileNotFoundError(f"Config not found: {CONFIG_FILE}")
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def load_config_secure(secure_config) -> dict:
    config = load_config()

    # Migration: handle legacy api_token field
    needs_migration = False
    if "api_token" in config or "api_token_encrypted" in config:
        needs_migration = True
        if "api_key" not in config:
            config["api_key"] = config.get("api_token", "")
        if "api_key_encrypted" not in config:
            config["api_key_encrypted"] = config.get("api_token_encrypted", "")

    encrypted = config.get("api_key_encrypted")
    plain = config.get("api_key")

    runtime_api_key = ""
    if encrypted:
        try:
            runtime_api_key = secure_config.decrypt(encrypted)
            config["api_key"] = runtime_api_key
        except Exception:
            pass
    elif plain:
        runtime_api_key = plain
        try:
            config["api_key_encrypted"] = secure_config.encrypt(plain)
            config["api_key"] = ""
            needs_migration = True
        except Exception as exc:
            # Sem cifra disponível: a chave fica só em memória. Não regravamos o
            # arquivo por causa dela (o texto puro que já estava lá é do
            # instalador; apagar faria o agente perder a chave). Na próxima
            # inicialização com DPAPI funcionando, a migração acontece.
            logger.error(
                "Nao foi possivel cifrar a api_key com DPAPI (%s). A chave sera usada "
                "so em memoria e NAO sera gravada cifrada nem em claro por este processo.",
                exc,
            )

    # Remove legacy fields after migration
    if needs_migration:
        if "api_token" in config:
            del config["api_token"]
        if "api_token_encrypted" in config:
            del config["api_token_encrypted"]
        save_config(config)

    # Always keep the plain key only in memory for runtime use.
    if runtime_api_key:
        config["api_key"] = runtime_api_key

    return config


def save_config(config: dict) -> None:
    """
    Grava a config. A api_key em claro existe só em memória: se já há versão
    cifrada, o campo vai vazio para o disco. Se não há versão cifrada (DPAPI
    falhou), o campo em claro não é escrito por cima do que já está no disco.
    """
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    to_write = dict(config)
    if to_write.get("api_key_encrypted"):
        to_write["api_key"] = ""
    elif to_write.get("api_key"):
        to_write["api_key"] = _api_key_on_disk()
    CONFIG_FILE.write_text(json.dumps(to_write, indent=2), encoding="utf-8")


def _api_key_on_disk() -> str:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8")).get("api_key", "") or ""
    except Exception:
        return ""


def validate_api_url(url: str) -> tuple[bool, str]:
    """
    Aceita https:// e, só para desenvolvimento, http:// em localhost/127.0.0.1.
    Devolve (ok, motivo). URL vazia é "não configurada" (ok=True).
    """
    if not url:
        return True, ""
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False, f"api_url invalida: {url!r}"
    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").lower()
    if scheme == "https" and host:
        return True, ""
    if scheme == "http" and host in _LOCAL_HOSTS:
        return True, ""
    if scheme == "http":
        return False, (
            f"api_url usa http:// ({url}). A chave do agente iria sem criptografia. "
            "Use https:// (http:// so e aceito para localhost/127.0.0.1)."
        )
    return False, f"api_url invalida: {url!r} (use https://)"
