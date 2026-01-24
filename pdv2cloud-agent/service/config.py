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
    if "api_key" not in config and "api_token" in config:
        config["api_key"] = config.get("api_token", "")
        config["api_key_encrypted"] = config.get("api_token_encrypted", "")
    encrypted = config.get("api_key_encrypted") or config.get("api_token_encrypted")
    plain = config.get("api_key") or config.get("api_token")
    if encrypted:
        try:
            config["api_key"] = secure_config.decrypt(encrypted)
        except Exception:
            pass
    elif plain:
        config["api_key_encrypted"] = secure_config.encrypt(plain)
        config["api_key"] = ""
        save_config(config)
        config["api_key"] = plain
    return config


def save_config(config: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
