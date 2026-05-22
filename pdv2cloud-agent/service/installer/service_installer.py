"""
Registra, atualiza e inicia o serviço Windows do PDV2Cloud.

Uso (chamado pelo Inno Setup via [Run]):
    python -m installer.service_installer install
    python -m installer.service_installer start
    python -m installer.service_installer stop
    python -m installer.service_installer restart
    python -m installer.service_installer uninstall

O script:
  1. Corrige pywin32 (DLLs + pythonservice.exe) via fix_pywin32
  2. Registra (ou re-registra) o serviço usando win32serviceutil
  3. Inicia o serviço e aguarda até ficar RUNNING
"""

import os
import sys
import time
import subprocess
from pathlib import Path

SERVICE_NAME = "PDV2CloudAgent"
START_TIMEOUT_S = 30


def _fix_pywin32():
    try:
        from installer.fix_pywin32 import (
            copy_dlls_to_system32,
            copy_dlls_to_python_home,
            copy_dlls_to_scripts,
            install_pythonservice,
        )
        copy_dlls_to_system32()
        copy_dlls_to_python_home()
        copy_dlls_to_scripts()
        install_pythonservice()
        print("[OK] pywin32 configurado")
    except Exception as exc:
        print(f"[AVISO] fix_pywin32 falhou (pode ser ignorado em reinstalações): {exc}")


def _run(args: list, check=False) -> int:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.strip())
    if result.stderr:
        print(result.stderr.strip())
    if check and result.returncode != 0:
        raise RuntimeError(f"Comando falhou (exit {result.returncode}): {' '.join(args)}")
    return result.returncode


def _service_status() -> str:
    """Retorna o estado atual do serviço: 'running', 'stopped', 'not_found' ou 'unknown'."""
    try:
        import win32service
        import win32serviceutil
        status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)[1]
        mapping = {
            win32service.SERVICE_RUNNING:       "running",
            win32service.SERVICE_STOPPED:       "stopped",
            win32service.SERVICE_START_PENDING:  "starting",
            win32service.SERVICE_STOP_PENDING:   "stopping",
        }
        return mapping.get(status, "unknown")
    except Exception:
        return "not_found"


def cmd_stop():
    status = _service_status()
    if status in ("not_found", "stopped"):
        print(f"[INFO] Serviço já está parado ou não existe ({status})")
        return
    print(f"[INFO] Parando {SERVICE_NAME}...")
    _run(["net", "stop", SERVICE_NAME])
    for _ in range(15):
        time.sleep(1)
        if _service_status() == "stopped":
            print("[OK] Serviço parado")
            return
    print("[AVISO] Timeout aguardando serviço parar — forçando kill...")
    _run(["taskkill", "/F", "/FI", f"SERVICES eq {SERVICE_NAME}"])


def cmd_uninstall():
    cmd_stop()
    if _service_status() == "not_found":
        print("[INFO] Serviço não registrado — nada a remover")
        return
    print(f"[INFO] Removendo registro do serviço {SERVICE_NAME}...")
    _run(["sc", "delete", SERVICE_NAME])
    time.sleep(1)
    print("[OK] Serviço removido")


def cmd_install():
    print("=" * 50)
    print("PDV2Cloud — Instalação do Serviço Windows")
    print("=" * 50)

    # 1. pywin32
    _fix_pywin32()

    # 2. Remove registro antigo se existir
    if _service_status() != "not_found":
        print("[INFO] Serviço existente detectado — re-registrando...")
        cmd_uninstall()
        time.sleep(1)

    # 3. Caminho para windows_service.py
    # Inno Setup define WorkingDir={app}\service, então CWD já é o diretório do serviço
    service_module = Path(os.getcwd()) / "windows_service.py"
    if not service_module.exists():
        # Fallback: relativo ao próprio script
        service_module = Path(__file__).parent.parent / "windows_service.py"

    python_exe = Path(sys.executable)

    print(f"[INFO] Registrando serviço: {python_exe} {service_module} install")
    rc = _run([str(python_exe), str(service_module), "--startup", "auto", "install"])
    if rc != 0:
        print("[ERRO] Falha ao registrar serviço")
        sys.exit(1)
    print("[OK] Serviço registrado com auto-start")

    # 4. Iniciar
    cmd_start()


def cmd_start():
    status = _service_status()
    if status == "running":
        print("[INFO] Serviço já está rodando")
        return
    if status == "not_found":
        print("[ERRO] Serviço não registrado — execute 'install' primeiro")
        sys.exit(1)

    print(f"[INFO] Iniciando {SERVICE_NAME}...")
    _run(["net", "start", SERVICE_NAME])

    deadline = time.time() + START_TIMEOUT_S
    while time.time() < deadline:
        time.sleep(2)
        if _service_status() == "running":
            print("[OK] Serviço iniciado com sucesso")
            return

    print(f"[AVISO] Serviço não confirmou RUNNING em {START_TIMEOUT_S}s — verifique o Event Viewer")


def cmd_restart():
    cmd_stop()
    time.sleep(2)
    cmd_start()


def main():
    if len(sys.argv) < 2:
        print("Uso: python -m installer.service_installer <install|start|stop|restart|uninstall>")
        sys.exit(1)

    command = sys.argv[1].lower()
    commands = {
        "install":   cmd_install,
        "start":     cmd_start,
        "stop":      cmd_stop,
        "restart":   cmd_restart,
        "uninstall": cmd_uninstall,
    }

    if command not in commands:
        print(f"[ERRO] Comando desconhecido: {command}")
        sys.exit(1)

    commands[command]()


if __name__ == "__main__":
    main()
