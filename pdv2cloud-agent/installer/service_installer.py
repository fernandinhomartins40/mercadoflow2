import sys
from pathlib import Path
import subprocess
import win32serviceutil
import win32service

SERVICE_NAME = "MercadoFlowAgent"
SERVICE_CLASS = "service.windows_service.MercadoFlowService"
SERVICE_DISPLAY_NAME = "Agente Mercado Flow"
SERVICE_DESCRIPTION = "Coleta e transmite as notas fiscais do PDV para o Mercado Flow"

# Serviço das versões anteriores (PDV2Cloud). É removido durante a instalação
# para que a máquina não fique com dois agentes disputando as mesmas pastas.
LEGACY_SERVICE_NAME = "PDV2CloudAgent"

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
    """Resolve pythonservice.exe via pywin32 helper; fallback to python.exe."""
    try:
        located = win32serviceutil.LocatePythonServiceExe()
        if located:
            return str(located)
    except Exception:
        # Continue with local fallbacks below.
        pass

    root_candidate = Path(sys.prefix) / "pythonservice.exe"
    if root_candidate.exists():
        return str(root_candidate)

    scripts_candidate = Path(sys.prefix) / "Scripts" / "pythonservice.exe"
    if scripts_candidate.exists():
        return str(scripts_candidate)

    return sys.executable


def _service_exists(service_name: str = SERVICE_NAME) -> bool:
    try:
        win32serviceutil.QueryServiceStatus(service_name)
        return True
    except Exception:
        return False


def _service_state(service_name: str = SERVICE_NAME) -> int | None:
    try:
        status = win32serviceutil.QueryServiceStatus(service_name)
        return status[1]
    except Exception:
        return None


def _remove_service(service_name: str) -> None:
    """Para e remove um serviço, tolerando qualquer etapa que já esteja feita."""
    if not _service_exists(service_name):
        return

    try:
        state = _service_state(service_name)
        if state is not None and state != win32service.SERVICE_STOPPED:
            try:
                win32serviceutil.StopService(service_name)
            except Exception:
                pass
    except Exception:
        pass

    try:
        win32serviceutil.RemoveService(service_name)
    except Exception as exc:
        print(f"WARNING: Failed to remove service {service_name}: {exc}")


def _remove_legacy_service() -> None:
    """Desinstala o agente PDV2Cloud anterior, se ainda estiver presente."""
    if _service_exists(LEGACY_SERVICE_NAME):
        print(f"Removendo serviço legado {LEGACY_SERVICE_NAME}...")
        _remove_service(LEGACY_SERVICE_NAME)


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
    _remove_service(SERVICE_NAME)


def install():
    _ensure_service_importable()
    _remove_legacy_service()
    _remove_existing_service_if_any()

    win32serviceutil.InstallService(
        pythonClassString=SERVICE_CLASS,
        serviceName=SERVICE_NAME,
        displayName=SERVICE_DISPLAY_NAME,
        description=SERVICE_DESCRIPTION,
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
