from cryptography.fernet import Fernet
import keyring


class SecureConfig:
    def __init__(self):
        self.key = self._get_or_create_key()
        self.cipher = Fernet(self.key)

    def _get_or_create_key(self) -> bytes:
        key = keyring.get_password("PDV2Cloud", "encryption_key")
        if not key:
            key = Fernet.generate_key().decode()
            keyring.set_password("PDV2Cloud", "encryption_key", key)
        return key.encode()

    def encrypt(self, data: str) -> str:
        return self.cipher.encrypt(data.encode()).decode()

    def decrypt(self, encrypted_data: str) -> str:
        return self.cipher.decrypt(encrypted_data.encode()).decode()
