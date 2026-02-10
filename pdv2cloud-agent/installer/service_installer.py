import sys
from pathlib import Path
import subprocess
import win32serviceutil
import win32service

SERVICE_NAME = "PDV2CloudAgent"
SERVICE_SCRIPT = Path(__file__).resolve().parent.parent / "service" / "windows_service.py"

# Grant Interactive Users start/stop rights so the UI can control the service without elevation.
SERVICE_SDDL = (
    "D:"
    "(A;;CCLCSWRPWPDTLOCRRC;;;SY)"
    "(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)"
    "(A;;CCLCSWRPWPDTLOCRRC;;;IU)"
    "(A;;CCLCSWLOCRRC;;;SU)"
)


def _run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _service_exists() -> bool:
    try:
        win32serviceutil.QueryServiceStatus(SERVICE_NAME)
        return True
    except Exception:
        return False


def _ensure_service_autostart() -> None:
    try:
        # `sc` requires the space after `start=`. Passing args keeps it intact.
        _run(["sc", "config", SERVICE_NAME, "start=", "auto"])
    except Exception as exc:
        print(f"WARNING: Failed to set service start type: {exc}")


def _ensure_service_permissions() -> None:
    try:
        _run(["sc", "sdset", SERVICE_NAME, SERVICE_SDDL])
    except Exception as exc:
        print(f"WARNING: Failed to set service permissions: {exc}")


def install():
    if not _service_exists():
        win32serviceutil.InstallService(
            pythonClassString="service.windows_service.PDV2CloudService",
            serviceName=SERVICE_NAME,
            displayName="PDV2Cloud Collector Agent",
            description="Coleta e transmite dados de vendas para PDV2Cloud",
            exeName=sys.executable,
            exeArgs=f"{SERVICE_SCRIPT}",
            startType=win32service.SERVICE_AUTO_START,
        )

    _ensure_service_autostart()
    _ensure_service_permissions()
    win32serviceutil.StartService(SERVICE_NAME)


def remove():
    try:
        win32serviceutil.StopService(SERVICE_NAME)
    except Exception:
        pass
    win32serviceutil.RemoveService(SERVICE_NAME)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: service_installer.py install|remove")
        sys.exit(1)
    if sys.argv[1] == "install":
        install()
    elif sys.argv[1] == "remove":
        remove()
    else:
        print("Unknown command")
        sys.exit(1)
