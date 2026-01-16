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
    encrypted = config.get("api_token_encrypted")
    plain = config.get("api_token")
    if encrypted:
        try:
            config["api_token"] = secure_config.decrypt(encrypted)
        except Exception:
            pass
    elif plain:
        config["api_token_encrypted"] = secure_config.encrypt(plain)
        config["api_token"] = ""
        save_config(config)
        config["api_token"] = plain
    return config


def save_config(config: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")
