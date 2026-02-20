"""
Auto-update module for PDV2Cloud agent.
Checks for updates and downloads/installs them automatically.
"""
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Dict
import requests

logger = logging.getLogger("PDV2Cloud.Updater")

UPDATE_CHECK_URL = "https://mercadoflow.com/api/v1/downloads/agent-installer/version"
INSTALLER_DOWNLOAD_URL = "https://mercadoflow.com/api/v1/downloads/agent-installer"

def get_installed_version() -> str:
    """Read the installed version from version.txt file."""
    try:
        version_file = Path("C:/Program Files (x86)/PDV2Cloud/version.txt")
        if version_file.exists():
            return version_file.read_text().strip()
    except Exception as e:
        logger.warning(f"Failed to read version file: {e}")
    return "1.0.0"  # Fallback to default

CURRENT_VERSION = get_installed_version()


class UpdateChecker:
    def __init__(self, current_version: str = CURRENT_VERSION):
        self.current_version = current_version
        self.update_available = False
        self.latest_version = None
        self.download_url = INSTALLER_DOWNLOAD_URL

    def check_for_updates(self) -> bool:
        """
        Check if a new version is available.

        Returns:
            True if update is available, False otherwise
        """
        try:
            response = requests.get(UPDATE_CHECK_URL, timeout=10)
            response.raise_for_status()

            data = response.json()
            self.latest_version = data.get("version", self.current_version)

            # Compare versions
            if self._is_newer_version(self.latest_version, self.current_version):
                self.update_available = True
                logger.info(f"Update available: {self.latest_version} (current: {self.current_version})")
                return True
            else:
                logger.info(f"Already on latest version: {self.current_version}")
                return False

        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to check for updates: {e}")
            return False

    def _is_newer_version(self, new_ver: str, current_ver: str) -> bool:
        """
        Compare version strings (semantic versioning).

        Args:
            new_ver: New version string (e.g., "1.2.3")
            current_ver: Current version string

        Returns:
            True if new_ver is newer than current_ver
        """
        try:
            new_parts = [int(x) for x in new_ver.split(".")]
            current_parts = [int(x) for x in current_ver.split(".")]

            # Pad with zeros if needed
            while len(new_parts) < 3:
                new_parts.append(0)
            while len(current_parts) < 3:
                current_parts.append(0)

            return new_parts > current_parts
        except (ValueError, AttributeError):
            return False

    def download_update(self, target_path: Optional[Path] = None) -> Optional[Path]:
        """
        Download the latest installer.

        Args:
            target_path: Where to save the installer (default: temp directory)

        Returns:
            Path to downloaded installer, or None if failed
        """
        if not self.update_available:
            logger.info("No update available to download")
            return None

        try:
            if target_path is None:
                target_path = Path(tempfile.gettempdir()) / f"PDV2Cloud-Setup-{self.latest_version}.exe"

            logger.info(f"Downloading update from {self.download_url}")

            response = requests.get(self.download_url, stream=True, timeout=300)
            response.raise_for_status()

            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0

            with open(target_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100
                            if downloaded % (1024 * 1024) == 0:  # Log every MB
                                logger.info(f"Download progress: {progress:.1f}%")

            logger.info(f"Update downloaded successfully to {target_path}")
            return target_path

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to download update: {e}")
            return None
        except IOError as e:
            logger.error(f"Failed to save update: {e}")
            return None

    def install_update(self, installer_path: Path, silent: bool = True) -> bool:
        """
        Install the downloaded update.

        Args:
            installer_path: Path to the installer executable
            silent: Run silent installation (default: True)

        Returns:
            True if installation started successfully
        """
        if not installer_path.exists():
            logger.error(f"Installer not found: {installer_path}")
            return False

        try:
            args = [str(installer_path)]

            if silent:
                args.extend([
                    "/VERYSILENT",
                    "/SUPPRESSMSGBOXES",
                    "/NORESTART",
                    "/CLOSEAPPLICATIONS",
                    "/RESTARTAPPLICATIONS"
                ])

            logger.info(f"Starting update installation: {' '.join(args)}")

            # Start installer and detach
            subprocess.Popen(
                args,
                creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                close_fds=True
            )

            logger.info("Update installation started. Service will be restarted automatically.")
            return True

        except Exception as e:
            logger.error(f"Failed to start installer: {e}")
            return False

    def perform_auto_update(self) -> bool:
        """
        Check, download, and install update automatically.

        Returns:
            True if update was performed successfully
        """
        logger.info("Starting auto-update check...")

        if not self.check_for_updates():
            return False

        installer_path = self.download_update()
        if installer_path is None:
            return False

        success = self.install_update(installer_path, silent=True)

        if success:
            # Schedule cleanup of temp installer after installation
            self._schedule_cleanup(installer_path)

        return success

    def _schedule_cleanup(self, path: Path):
        """Schedule deletion of temporary installer file."""
        # Create a cleanup script that deletes the installer after a delay
        cleanup_script = f"""
import time
import os
from pathlib import Path

time.sleep(60)  # Wait 1 minute for installation to complete
try:
    Path(r'{path}').unlink(missing_ok=True)
except Exception:
    pass
"""
        cleanup_file = path.parent / "cleanup_installer.py"
        cleanup_file.write_text(cleanup_script)

        # Run cleanup script in background
        subprocess.Popen(
            [r"C:\Program Files\PDV2Cloud\python\python.exe", str(cleanup_file)],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True
        )


def get_update_status() -> Dict:
    """
    Get current update status information.

    Returns:
        Dictionary with update status
    """
    checker = UpdateChecker()
    has_update = checker.check_for_updates()

    return {
        "current_version": checker.current_version,
        "latest_version": checker.latest_version,
        "update_available": has_update,
        "download_url": checker.download_url if has_update else None
    }


if __name__ == "__main__":
    # Test the updater
    logging.basicConfig(level=logging.INFO)

    checker = UpdateChecker()

    print(f"Current version: {checker.current_version}")

    if checker.check_for_updates():
        print(f"Update available: {checker.latest_version}")

        user_input = input("Download and install? (y/n): ")
        if user_input.lower() == 'y':
            if checker.perform_auto_update():
                print("Update started successfully!")
            else:
                print("Update failed.")
    else:
        print("No updates available.")
