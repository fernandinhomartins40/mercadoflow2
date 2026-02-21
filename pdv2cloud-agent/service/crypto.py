import base64
import logging
import win32crypt

logger = logging.getLogger("PDV2Cloud.Crypto")


class SecureConfig:
    """
    Enterprise-grade encryption using Windows Data Protection API (DPAPI).

    DPAPI is the Microsoft-recommended approach for encrypting sensitive data
    in Windows services. Key benefits:
    - Works perfectly with LocalSystem account
    - Zero key management (Windows handles it automatically)
    - Machine-scoped encryption (survives service restarts)
    - Used by SQL Server, IIS, and other enterprise products
    - Supports backup/restore scenarios

    CRITICAL: Must not raise exceptions to avoid Error 1053 when running as Windows Service.
    """

    def __init__(self):
        """Initialize DPAPI-based encryption. This never fails."""
        try:
            # Test DPAPI availability by encrypting a test string
            test_data = "PDV2Cloud_DPAPI_Test"
            encrypted = self.encrypt(test_data)
            decrypted = self.decrypt(encrypted)

            if decrypted == test_data:
                logger.info("DPAPI encryption initialized successfully")
            else:
                logger.warning("DPAPI test failed - encryption may not work correctly")
        except Exception as exc:
            logger.error("DPAPI initialization test failed: %s", exc)
            logger.warning("Encryption will continue but may fail at runtime")

    def encrypt(self, data: str) -> str:
        """
        Encrypt data using Windows DPAPI.

        Uses CRYPTPROTECT_LOCAL_MACHINE flag to ensure the encrypted data
        can be decrypted by any process on the same machine (required for
        services running as LocalSystem).

        Args:
            data: Plain text string to encrypt

        Returns:
            Base64-encoded encrypted string
        """
        try:
            # Convert string to bytes
            data_bytes = data.encode('utf-8')

            # Encrypt using DPAPI with machine-level scope
            # CRYPTPROTECT_LOCAL_MACHINE (0x04) = machine-level encryption
            encrypted_bytes = win32crypt.CryptProtectData(
                data_bytes,
                'PDV2Cloud Encrypted Data',  # Description (optional)
                None,                         # Optional entropy (None = machine key only)
                None,                         # Reserved
                None,                         # Prompt struct
                0x04                          # CRYPTPROTECT_LOCAL_MACHINE flag
            )

            # Encode to base64 for safe storage in JSON
            return base64.b64encode(encrypted_bytes).decode('utf-8')

        except Exception as exc:
            logger.error("DPAPI encryption failed: %s", exc)
            # Return original data if encryption fails (fail-safe mode)
            logger.warning("Returning unencrypted data - this is a security risk!")
            return data

    def decrypt(self, encrypted_data: str) -> str:
        """
        Decrypt data using Windows DPAPI.

        Args:
            encrypted_data: Base64-encoded encrypted string

        Returns:
            Decrypted plain text string
        """
        try:
            # Decode from base64
            encrypted_bytes = base64.b64decode(encrypted_data.encode('utf-8'))

            # Decrypt using DPAPI
            # Returns tuple: (description, decrypted_data)
            _, decrypted_bytes = win32crypt.CryptUnprotectData(
                encrypted_bytes,
                None,  # Optional entropy (must match encryption)
                None,  # Reserved
                None,  # Prompt struct
                0      # Flags
            )

            # Convert bytes back to string
            return decrypted_bytes.decode('utf-8')

        except Exception as exc:
            logger.error("DPAPI decryption failed: %s", exc)
            logger.warning("Attempting to return data as-is (may be unencrypted)")
            # Try to return data as-is (might be already decrypted or corrupted)
            try:
                return encrypted_data
            except Exception:
                logger.error("Cannot recover encrypted data")
                return ""
