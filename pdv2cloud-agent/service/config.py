import json
from pathlib import Path

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
        config["api_key_encrypted"] = secure_config.encrypt(plain)
        config["api_key"] = ""
        needs_migration = True

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
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
