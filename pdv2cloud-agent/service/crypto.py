from cryptography.fernet import Fernet
import keyring
import logging
from pathlib import Path
import json

logger = logging.getLogger("PDV2Cloud.Crypto")

# Fallback key storage for when Windows Credential Manager is not available (LocalSystem account)
FALLBACK_KEY_FILE = Path("C:/ProgramData/PDV2Cloud/.crypto_key")


class SecureConfig:
    def __init__(self):
        """
        Initialize encryption with graceful fallback.
        CRITICAL: Must not raise exceptions to avoid Error 1053 when running as Windows Service.
        """
        try:
            self.key = self._get_or_create_key()
            self.cipher = Fernet(self.key)
            logger.info("Encryption initialized successfully")
        except Exception as exc:
            logger.error("Failed to initialize encryption: %s", exc)
            # Fallback to a basic cipher with generated key instead of crashing
            logger.warning("Using fallback encryption key - this is less secure but prevents service crash")
            self.key = Fernet.generate_key()
            self.cipher = Fernet(self.key)

    def _get_or_create_key(self) -> bytes:
        """
        Try Windows Credential Manager first, fallback to file-based storage.
        This prevents Error 1053 when running as LocalSystem account.
        """
        # Try Windows Credential Manager first
        try:
            key = keyring.get_password("PDV2Cloud", "encryption_key")
            if key:
                logger.info("Encryption key loaded from Windows Credential Manager")
                return key.encode()
        except Exception as exc:
            logger.warning("Cannot access Windows Credential Manager: %s", exc)
            logger.info("This is normal when running as LocalSystem account")

        # Fallback to file-based key storage
        try:
            if FALLBACK_KEY_FILE.exists():
                with open(FALLBACK_KEY_FILE, "r") as f:
                    data = json.load(f)
                    key = data.get("key")
                    if key:
                        logger.info("Encryption key loaded from fallback file")
                        return key.encode()
        except Exception as exc:
            logger.warning("Cannot read fallback key file: %s", exc)

        # Generate new key and store it
        logger.info("Generating new encryption key")
        key = Fernet.generate_key().decode()

        # Try to save to Credential Manager
        try:
            keyring.set_password("PDV2Cloud", "encryption_key", key)
            logger.info("Encryption key stored in Windows Credential Manager")
        except Exception as exc:
            logger.warning("Cannot save to Windows Credential Manager: %s", exc)
            logger.info("Saving to fallback file instead")

            # Save to fallback file
            try:
                FALLBACK_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
                with open(FALLBACK_KEY_FILE, "w") as f:
                    json.dump({"key": key}, f)
                # Make file hidden on Windows
                import ctypes
                ctypes.windll.kernel32.SetFileAttributesW(str(FALLBACK_KEY_FILE), 2)  # FILE_ATTRIBUTE_HIDDEN
                logger.info("Encryption key stored in fallback file")
            except Exception as file_exc:
                logger.error("Cannot save encryption key to fallback file: %s", file_exc)

        return key.encode()

    def encrypt(self, data: str) -> str:
        return self.cipher.encrypt(data.encode()).decode()

    def decrypt(self, encrypted_data: str) -> str:
        return self.cipher.decrypt(encrypted_data.encode()).decode()
