"""JWT token service for authentication."""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Any
import uuid

from jose import jwt, JWTError

from config import get_settings


class TokenError(Exception):
    """Exception raised for token-related errors."""
    pass


class JWTService:
    """Service for creating and validating JWT tokens."""

    def __init__(self):
        settings = get_settings()
        self.secret_key = settings.jwt_secret_key
        self.algorithm = settings.jwt_algorithm
        self.access_token_expire_minutes = settings.jwt_access_token_expire_minutes
        self.refresh_token_expire_days = settings.jwt_refresh_token_expire_days

    def create_access_token(
        self,
        user_id: uuid.UUID,
        email: str,
        role: str,
        expires_delta: Optional[timedelta] = None,
    ) -> str:
        """Create a new access token.

        Args:
            user_id: User's UUID
            email: User's email
            role: User's role (admin/user)
            expires_delta: Optional custom expiration time

        Returns:
            Encoded JWT access token
        """
        if expires_delta is None:
            expires_delta = timedelta(minutes=self.access_token_expire_minutes)

        expire = datetime.utcnow() + expires_delta

        payload = {
            "sub": str(user_id),
            "email": email,
            "role": role,
            "type": "access",
            "exp": expire,
            "iat": datetime.utcnow(),
            "jti": str(uuid.uuid4()),  # Unique token ID
        }

        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def create_refresh_token(
        self,
        user_id: uuid.UUID,
        expires_delta: Optional[timedelta] = None,
    ) -> tuple[str, str, datetime]:
        """Create a new refresh token.

        Refresh tokens are random strings that get hashed before storage.

        Args:
            user_id: User's UUID
            expires_delta: Optional custom expiration time

        Returns:
            Tuple of (raw_token, token_hash, expires_at)
        """
        if expires_delta is None:
            expires_delta = timedelta(days=self.refresh_token_expire_days)

        expires_at = datetime.utcnow() + expires_delta

        # Generate a cryptographically secure random token
        raw_token = secrets.token_urlsafe(32)

        # Hash the token for storage
        token_hash = self._hash_token(raw_token)

        return raw_token, token_hash, expires_at

    def decode_access_token(self, token: str) -> dict[str, Any]:
        """Decode and validate an access token.

        Args:
            token: JWT access token

        Returns:
            Token payload dictionary

        Raises:
            TokenError: If token is invalid or expired
        """
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
            )

            # Verify it's an access token
            if payload.get("type") != "access":
                raise TokenError("Invalid token type")

            return payload

        except JWTError as e:
            raise TokenError(f"Invalid token: {str(e)}")

    def verify_refresh_token(self, raw_token: str, stored_hash: str) -> bool:
        """Verify a refresh token against its stored hash.

        Args:
            raw_token: The raw refresh token from the client
            stored_hash: The hash stored in the database

        Returns:
            True if token matches, False otherwise
        """
        return secrets.compare_digest(
            self._hash_token(raw_token),
            stored_hash,
        )

    def _hash_token(self, token: str) -> str:
        """Hash a token for storage.

        Uses SHA-256 for fast, secure hashing.

        Args:
            token: Raw token string

        Returns:
            Hex-encoded hash
        """
        return hashlib.sha256(token.encode()).hexdigest()

    def get_token_user_id(self, token: str) -> Optional[uuid.UUID]:
        """Extract user ID from an access token without full validation.

        Useful for logging/debugging. Does NOT validate expiration.

        Args:
            token: JWT access token

        Returns:
            User UUID or None if extraction fails
        """
        try:
            # Decode without verification
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[self.algorithm],
                options={"verify_exp": False},
            )
            user_id_str = payload.get("sub")
            if user_id_str:
                return uuid.UUID(user_id_str)
            return None
        except (JWTError, ValueError):
            return None


# Singleton instance
_jwt_service: Optional[JWTService] = None


def get_jwt_service() -> JWTService:
    """Get the JWT service singleton."""
    global _jwt_service
    if _jwt_service is None:
        _jwt_service = JWTService()
    return _jwt_service
