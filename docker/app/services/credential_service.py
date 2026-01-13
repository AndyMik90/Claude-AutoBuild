"""Credential encryption service using Fernet.

Provides secure storage for API keys and tokens using symmetric encryption.
"""

import base64
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class CredentialEncryptionError(Exception):
    """Exception for credential encryption errors."""

    def __init__(self, message: str, code: str = "encryption_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class CredentialService:
    """Service for encrypting and decrypting credentials.

    Uses Fernet symmetric encryption with a key derived from the
    environment's CREDENTIAL_ENCRYPTION_KEY.
    """

    def __init__(self, encryption_key: Optional[str] = None):
        """Initialize the credential service.

        Args:
            encryption_key: Base64-encoded Fernet key or a passphrase.
                           If not provided, will use CREDENTIAL_ENCRYPTION_KEY from env.
        """
        self._fernet: Optional[Fernet] = None
        self._key = encryption_key or os.environ.get("CREDENTIAL_ENCRYPTION_KEY")

        if self._key:
            self._fernet = self._create_fernet(self._key)

    @property
    def is_configured(self) -> bool:
        """Check if encryption is configured."""
        return self._fernet is not None

    def _create_fernet(self, key: str) -> Fernet:
        """Create a Fernet instance from a key or passphrase.

        If the key is a valid 32-byte base64-encoded Fernet key, use it directly.
        Otherwise, derive a key from it using PBKDF2.
        """
        # Try to use as a direct Fernet key first
        try:
            # Check if it's a valid base64-encoded 32-byte key
            decoded = base64.urlsafe_b64decode(key)
            if len(decoded) == 32:
                return Fernet(key)
        except Exception:
            pass

        # Derive key from passphrase using PBKDF2
        # Use a fixed salt for reproducibility (in production, store salt separately)
        salt = b"auto-claude-credential-salt-v1"
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=480000,  # OWASP recommended minimum
        )
        derived_key = base64.urlsafe_b64encode(kdf.derive(key.encode("utf-8")))
        return Fernet(derived_key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a plaintext string.

        Args:
            plaintext: The string to encrypt.

        Returns:
            Base64-encoded encrypted string.

        Raises:
            CredentialEncryptionError: If encryption is not configured.
        """
        if not self._fernet:
            raise CredentialEncryptionError(
                "Encryption key not configured",
                "no_encryption_key",
            )

        encrypted = self._fernet.encrypt(plaintext.encode("utf-8"))
        return encrypted.decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        """Decrypt an encrypted string.

        Args:
            ciphertext: The base64-encoded encrypted string.

        Returns:
            The decrypted plaintext string.

        Raises:
            CredentialEncryptionError: If decryption fails.
        """
        if not self._fernet:
            raise CredentialEncryptionError(
                "Encryption key not configured",
                "no_encryption_key",
            )

        try:
            decrypted = self._fernet.decrypt(ciphertext.encode("utf-8"))
            return decrypted.decode("utf-8")
        except InvalidToken:
            raise CredentialEncryptionError(
                "Invalid or corrupted ciphertext",
                "invalid_ciphertext",
            )
        except Exception as e:
            raise CredentialEncryptionError(
                f"Decryption failed: {str(e)}",
                "decryption_failed",
            )

    def encrypt_or_none(self, plaintext: Optional[str]) -> Optional[str]:
        """Encrypt a string if provided, return None otherwise.

        Args:
            plaintext: The string to encrypt, or None.

        Returns:
            Encrypted string or None.
        """
        if plaintext is None or plaintext == "":
            return None
        return self.encrypt(plaintext)

    def decrypt_or_none(self, ciphertext: Optional[str]) -> Optional[str]:
        """Decrypt a string if provided, return None otherwise.

        Args:
            ciphertext: The encrypted string, or None.

        Returns:
            Decrypted string or None.
        """
        if ciphertext is None or ciphertext == "":
            return None
        return self.decrypt(ciphertext)

    @staticmethod
    def generate_key() -> str:
        """Generate a new Fernet encryption key.

        Returns:
            A base64-encoded 32-byte key suitable for use as CREDENTIAL_ENCRYPTION_KEY.
        """
        return Fernet.generate_key().decode("utf-8")


# Singleton instance
_credential_service: Optional[CredentialService] = None


def get_credential_service(encryption_key: Optional[str] = None) -> CredentialService:
    """Get or create the credential service singleton.

    Args:
        encryption_key: Optional key to initialize with. Only used on first call.

    Returns:
        CredentialService instance.
    """
    global _credential_service
    if _credential_service is None:
        _credential_service = CredentialService(encryption_key)
    return _credential_service


def reset_credential_service() -> None:
    """Reset the credential service singleton (for testing)."""
    global _credential_service
    _credential_service = None
