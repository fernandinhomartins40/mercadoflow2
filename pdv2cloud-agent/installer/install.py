from pathlib import Path
from service.config import ensure_config
from installer.download_xsd import ensure_xsd


def main():
    template_path = Path(__file__).parent.parent / "config" / "config.json.template"
    ensure_config(template_path)
    ensure_xsd()
    print("Config initialized")


if __name__ == "__main__":
    main()
