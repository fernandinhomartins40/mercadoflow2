import sys
from pathlib import Path
import win32serviceutil

SERVICE_SCRIPT = Path(__file__).resolve().parent.parent / "service" / "windows_service.py"


def install():
    win32serviceutil.InstallService(
        pythonClassString="service.windows_service.PDV2CloudService",
        serviceName="PDV2CloudAgent",
        displayName="PDV2Cloud Collector Agent",
        description="Coleta e transmite dados de vendas para PDV2Cloud",
        exeName=sys.executable,
        exeArgs=f"{SERVICE_SCRIPT}",
    )
    win32serviceutil.StartService("PDV2CloudAgent")


def remove():
    try:
        win32serviceutil.StopService("PDV2CloudAgent")
    except Exception:
        pass
    win32serviceutil.RemoveService("PDV2CloudAgent")


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
