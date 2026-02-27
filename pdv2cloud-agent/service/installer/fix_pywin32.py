"""
Fix pywin32 installation for Windows services.

This script performs the critical post-installation steps that pip install skips:
1. Copies pywintypes DLLs to the correct locations
2. Registers COM objects
3. Installs pythonservice.exe

Based on best practices from:
- https://github.com/mhammond/pywin32/issues/1771
- https://github.com/mhammond/pywin32/issues/2056
- https://mail.python.org/pipermail/python-win32/2009-January/008646.html
"""
import os
import sys
import shutil
from pathlib import Path

def find_pywin32_system32():
    """Find the pywin32_system32 directory"""
    site_packages = Path(sys.prefix) / "Lib" / "site-packages"

    # Try standard location
    pywin32_system32 = site_packages / "pywin32_system32"
    if pywin32_system32.exists():
        return pywin32_system32

    # Try direct in site-packages (embedded python)
    if (site_packages / "pywintypes311.dll").exists():
        return site_packages

    return None

def get_python_version_number():
    """Get Python version as string like '311' for Python 3.11"""
    return f"{sys.version_info.major}{sys.version_info.minor}"

def copy_dlls_to_system32():
    """Copy pywin32 DLLs to Windows System32 directory"""
    pywin32_dir = find_pywin32_system32()
    if not pywin32_dir:
        print("ERROR: Cannot find pywin32_system32 directory")
        return False

    py_ver = get_python_version_number()
    system32 = Path(os.environ.get('SystemRoot', 'C:\\Windows')) / "System32"

    dlls_to_copy = [
        f"pywintypes{py_ver}.dll",
        f"pythoncom{py_ver}.dll",
    ]

    print(f"Copying DLLs from {pywin32_dir} to {system32}...")

    for dll_name in dlls_to_copy:
        src = pywin32_dir / dll_name
        dst = system32 / dll_name

        if not src.exists():
            print(f"  WARNING: {src} not found, skipping")
            continue

        try:
            shutil.copy2(src, dst)
            print(f"  [OK] Copied {dll_name} to System32")
        except PermissionError:
            print(f"  ERROR: Permission denied copying {dll_name}")
            print("  Run this script as Administrator!")
            return False
        except Exception as e:
            print(f"  ERROR: Failed to copy {dll_name}: {e}")
            return False

    return True

def _copy_dlls_to_target(target_dir: Path, label: str):
    """Copy pywin32 runtime DLLs to a target directory."""
    pywin32_dir = find_pywin32_system32()
    if not pywin32_dir:
        return False

    py_ver = get_python_version_number()
    target_dir.mkdir(parents=True, exist_ok=True)

    dlls_to_copy = [
        f"pywintypes{py_ver}.dll",
        f"pythoncom{py_ver}.dll",
    ]

    print(f"Copying DLLs to {target_dir}...")

    for dll_name in dlls_to_copy:
        src = pywin32_dir / dll_name
        dst = target_dir / dll_name

        if not src.exists():
            continue

        try:
            shutil.copy2(src, dst)
            print(f"  [OK] Copied {dll_name} to {label}")
        except Exception as e:
            print(f"  WARNING: Failed to copy {dll_name} to {label}: {e}")

    return True


def copy_dlls_to_python_home():
    """Copy DLLs next to python.exe/pythonXY.dll (required by pythonservice.exe)."""
    python_home = Path(sys.prefix)
    return _copy_dlls_to_target(python_home, "Python Home")


def copy_dlls_to_scripts():
    """Copy DLLs to Scripts directory for compatibility."""
    scripts_dir = Path(sys.prefix) / "Scripts"
    return _copy_dlls_to_target(scripts_dir, "Scripts")


def install_pythonservice():
    """Copy pythonservice.exe to Python home and Scripts."""
    site_packages = Path(sys.prefix) / "Lib" / "site-packages"
    win32_dir = site_packages / "win32"

    if not win32_dir.exists():
        print("ERROR: win32 directory not found in site-packages")
        return False

    pythonservice_src = win32_dir / "pythonservice.exe"
    if not pythonservice_src.exists():
        print(f"ERROR: pythonservice.exe not found at {pythonservice_src}")
        return False

    targets = [
        (Path(sys.prefix), "Python Home"),
        (Path(sys.prefix) / "Scripts", "Scripts"),
    ]

    copied_any = False
    for dst_dir, label in targets:
        dst_dir.mkdir(parents=True, exist_ok=True)
        pythonservice_dst = dst_dir / "pythonservice.exe"
        try:
            shutil.copy2(pythonservice_src, pythonservice_dst)
            print(f"  [OK] Installed pythonservice.exe to {label}: {pythonservice_dst}")
            copied_any = True
        except Exception as e:
            print(f"  WARNING: Failed to install pythonservice.exe to {label}: {e}")

    return copied_any

def verify_installation():
    """Verify that pywin32 is properly installed"""
    print("\nVerifying pywin32 installation...")

    errors = []

    # Test imports
    try:
        import win32serviceutil
        print("  [OK] win32serviceutil import OK")
    except Exception as e:
        errors.append(f"Cannot import win32serviceutil: {e}")

    try:
        import pywintypes
        print("  [OK] pywintypes import OK")
    except Exception as e:
        errors.append(f"Cannot import pywintypes: {e}")

    try:
        import pythoncom
        print("  [OK] pythoncom import OK")
    except Exception as e:
        errors.append(f"Cannot import pythoncom: {e}")

    # Check pythonservice.exe (prefer Python home)
    root_pythonservice = Path(sys.prefix) / "pythonservice.exe"
    scripts_pythonservice = Path(sys.prefix) / "Scripts" / "pythonservice.exe"
    if root_pythonservice.exists():
        print(f"  [OK] pythonservice.exe found at {root_pythonservice}")
    elif scripts_pythonservice.exists():
        print(f"  [OK] pythonservice.exe found at {scripts_pythonservice}")
    else:
        errors.append(f"pythonservice.exe not found at {root_pythonservice} or {scripts_pythonservice}")

    if errors:
        print("\n[FAILED] Verification FAILED:")
        for error in errors:
            print(f"  - {error}")
        return False

    print("\n[SUCCESS] Verification PASSED - pywin32 is properly configured!")
    return True

def main():
    print("=" * 60)
    print("PDV2Cloud - pywin32 Post-Installation Fix")
    print("=" * 60)
    print()

    # Check if running as admin
    try:
        is_admin = os.getuid() == 0
    except AttributeError:
        import ctypes
        is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0

    if not is_admin:
        print("[WARNING] Not running as Administrator")
        print("Some operations may fail. Consider running as Administrator.")
        print()

    # Step 1: Copy DLLs to System32
    if not copy_dlls_to_system32():
        print("\n[FAILED] FAILED to copy DLLs to System32")
        return 1

    # Step 2: Copy DLLs to Python home (required for service host)
    copy_dlls_to_python_home()

    # Step 3: Copy DLLs to Scripts (compatibility)
    copy_dlls_to_scripts()

    # Step 4: Install pythonservice.exe
    if not install_pythonservice():
        print("\n[FAILED] FAILED to install pythonservice.exe")
        return 1

    # Step 5: Verify
    if not verify_installation():
        return 1

    print("\n" + "=" * 60)
    print("[SUCCESS] pywin32 is now properly configured for Windows services")
    print("=" * 60)
    return 0

if __name__ == "__main__":
    sys.exit(main())
