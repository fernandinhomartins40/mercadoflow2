import sys
from pathlib import Path
import subprocess
import win32serviceutil
import win32service

SERVICE_NAME = "PDV2CloudAgent"
SERVICE_CLASS = "service.windows_service.PDV2CloudService"

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


def _resolve_python_service_exe() -> str:
    """Prefer pythonservice.exe for SCM integration; fallback to python.exe."""
    embedded_candidate = Path(sys.prefix) / "Scripts" / "pythonservice.exe"
    if embedded_candidate.exists():
        return str(embedded_candidate)

    try:
        located = win32serviceutil.LocatePythonServiceExe()
        if located:
            return str(located)
    except Exception:
        pass

    return sys.executable


def _service_exists() -> bool:
    try:
        win32serviceutil.QueryServiceStatus(SERVICE_NAME)
        return True
    except Exception:
        return False


def _service_state() -> int | None:
    try:
        status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)
        return status[1]
    except Exception:
        return None


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


def _ensure_service_importable() -> None:
    try:
        __import__("service.windows_service")
    except Exception as exc:
        raise RuntimeError(
            "Cannot import 'service.windows_service'. "
            "Verify embedded Python path configuration (pythonXY._pth must include '..')."
        ) from exc


def _remove_existing_service_if_any() -> None:
    if not _service_exists():
        return

    try:
        state = _service_state()
        if state is not None and state != win32service.SERVICE_STOPPED:
            try:
                win32serviceutil.StopService(SERVICE_NAME)
            except Exception:
                pass
    except Exception:
        pass

    try:
        win32serviceutil.RemoveService(SERVICE_NAME)
    except Exception as exc:
        print(f"WARNING: Failed to remove existing service before reinstall: {exc}")


def install():
    _ensure_service_importable()
    _remove_existing_service_if_any()

    win32serviceutil.InstallService(
        pythonClassString=SERVICE_CLASS,
        serviceName=SERVICE_NAME,
        displayName="PDV2Cloud Collector Agent",
        description="Coleta e transmite dados de vendas para PDV2Cloud",
        exeName=_resolve_python_service_exe(),
        startType=win32service.SERVICE_AUTO_START,
    )

    _ensure_service_autostart()
    _ensure_service_permissions()

    # Try to start service, but don't fail installation if it times out
    # Service may need configuration before it can start successfully
    try:
        win32serviceutil.StartService(SERVICE_NAME)
        print("Service started successfully")
    except Exception as exc:
        print(f"WARNING: Service installed but failed to start: {exc}")
        print("You can start the service manually after configuration")


def remove():
    stop()
    if _service_exists():
        win32serviceutil.RemoveService(SERVICE_NAME)


def start():
    if not _service_exists():
        raise RuntimeError("Service is not installed")
    if _service_state() == win32service.SERVICE_RUNNING:
        print("Service already running")
        return
    win32serviceutil.StartService(SERVICE_NAME)
    print("Service started")


def stop():
    if not _service_exists():
        print("Service is not installed")
        return
    if _service_state() == win32service.SERVICE_STOPPED:
        print("Service already stopped")
        return
    win32serviceutil.StopService(SERVICE_NAME)
    print("Service stopped")


def restart():
    stop()
    start()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: service_installer.py install|remove|start|stop|restart")
        sys.exit(1)
    if sys.argv[1] == "install":
        install()
    elif sys.argv[1] == "remove":
        remove()
    elif sys.argv[1] == "start":
        start()
    elif sys.argv[1] == "stop":
        stop()
    elif sys.argv[1] == "restart":
        restart()
    else:
        print("Unknown command")
        sys.exit(1)
