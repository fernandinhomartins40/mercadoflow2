from pathlib import Path
import subprocess
from service.config import ensure_config
from installer.download_xsd import ensure_xsd


def ensure_programdata_permissions() -> None:
    """
    Allow standard users to edit config/logs in C:\\ProgramData\\PDV2Cloud.

    The installer runs elevated, but the desktop UI usually runs as a normal user.
    Without this ACL, saving config.json from the UI fails with EPERM/Access denied.

    We grant Modify to the built-in Users group using its SID to avoid locale issues.
    """
    target_dir = Path("C:/ProgramData/PDV2Cloud")
    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            [
                "icacls",
                str(target_dir),
                "/grant",
                "*S-1-5-32-545:(OI)(CI)M",
                "/T",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        print("ProgramData permissions updated")
    except Exception as exc:
        # Don't fail install on ACL issues (some environments may block ACL changes).
        print(f"WARNING: Failed to update ProgramData permissions: {exc}")


def main():
    template_path = Path(__file__).parent.parent / "config" / "config.json.template"
    ensure_config(template_path)
    ensure_xsd()
    ensure_programdata_permissions()
    print("Config initialized")


if __name__ == "__main__":
    main()
