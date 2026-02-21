from cryptography.fernet import Fernet
import keyring
import logging

logger = logging.getLogger("PDV2Cloud.Crypto")


class SecureConfig:
    def __init__(self):
        try:
            self.key = self._get_or_create_key()
            self.cipher = Fernet(self.key)
            logger.info("Encryption initialized successfully")
        except Exception as exc:
            logger.error("Failed to initialize encryption: %s", exc)
            raise

    def _get_or_create_key(self) -> bytes:
        try:
            key = keyring.get_password("PDV2Cloud", "encryption_key")
            if not key:
                logger.info("Generating new encryption key")
                key = Fernet.generate_key().decode()
                keyring.set_password("PDV2Cloud", "encryption_key", key)
                logger.info("Encryption key stored in Windows Credential Manager")
            return key.encode()
        except Exception as exc:
            logger.error("Keyring access failed: %s", exc)
            raise

    def encrypt(self, data: str) -> str:
        return self.cipher.encrypt(data.encode()).decode()

    def decrypt(self, encrypted_data: str) -> str:
        return self.cipher.decrypt(encrypted_data.encode()).decode()
