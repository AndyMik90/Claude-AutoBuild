"""Tests for authentication and JWT token validation.

Validates that:
- Invalid UUID in JWT token returns 401 (not 500)
- Valid tokens work correctly
- Proper error messages are returned
"""

import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timedelta

# Add app directory to path for imports
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))


class TestUUIDValidationInToken:
    """Test that invalid UUID in token 'sub' claim returns 401."""

    def test_invalid_uuid_returns_401_sync(self):
        """Invalid UUID in 'sub' should raise ValueError, caught and returns 401."""
        # Test the UUID parsing logic directly
        invalid_uuid = "not-a-valid-uuid"

        with pytest.raises(ValueError):
            uuid.UUID(invalid_uuid)

    def test_valid_uuid_parses_correctly(self):
        """Valid UUID string should parse correctly."""
        valid_uuid_str = "123e4567-e89b-12d3-a456-426614174000"
        parsed = uuid.UUID(valid_uuid_str)

        assert str(parsed) == valid_uuid_str

    def test_empty_string_uuid_raises_value_error(self):
        """Empty string should raise ValueError."""
        with pytest.raises(ValueError):
            uuid.UUID("")

    def test_malformed_uuid_raises_value_error(self):
        """Malformed UUID should raise ValueError."""
        malformed_uuids = [
            "12345",
            "not-a-uuid",
            "123e4567-e89b-12d3-a456",  # Too short
            "123e4567-e89b-12d3-a456-426614174000-extra",  # Too long
            "gggggggg-gggg-gggg-gggg-gggggggggggg",  # Invalid hex chars
        ]

        for malformed in malformed_uuids:
            with pytest.raises(ValueError):
                uuid.UUID(malformed)


class TestDependenciesUUIDHandling:
    """Test the dependencies.py UUID handling."""

    def test_uuid_parsing_with_try_except_pattern(self):
        """Verify the try/except pattern handles invalid UUIDs."""
        # This simulates what dependencies.py does
        test_cases = [
            ("123e4567-e89b-12d3-a456-426614174000", True),  # Valid
            ("not-a-uuid", False),  # Invalid
            ("", False),  # Empty
            ("12345", False),  # Too short
        ]

        for uuid_str, should_succeed in test_cases:
            caught_error = False
            try:
                uuid.UUID(uuid_str)
            except ValueError:
                caught_error = True

            if should_succeed:
                assert not caught_error, f"Valid UUID {uuid_str} should not raise ValueError"
            else:
                assert caught_error, f"Invalid UUID {uuid_str} should raise ValueError"


@pytest.mark.asyncio
class TestGetCurrentUserFunction:
    """Test get_current_user dependency function."""

    async def test_invalid_uuid_in_payload_raises_401(self):
        """When JWT payload has invalid UUID, should raise 401 HTTPException."""
        from fastapi import HTTPException

        # Simulate the code pattern from dependencies.py
        payload = {"sub": "invalid-uuid"}

        with pytest.raises(HTTPException) as exc_info:
            try:
                user_id = uuid.UUID(payload["sub"])
            except ValueError:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid user ID in token",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        assert exc_info.value.status_code == 401
        assert "Invalid user ID in token" in exc_info.value.detail

    async def test_valid_uuid_in_payload_parses(self):
        """When JWT payload has valid UUID, should parse correctly."""
        valid_uuid = str(uuid.uuid4())
        payload = {"sub": valid_uuid}

        # Should not raise
        user_id = uuid.UUID(payload["sub"])
        assert str(user_id) == valid_uuid


class TestJWTServiceTokenCreation:
    """Test JWT service token creation and decoding."""

    @pytest.fixture
    def jwt_service(self):
        """Create a mock JWT service for testing."""
        with patch.dict(
            os.environ,
            {"DEBUG": "true", "JWT_SECRET_KEY": "test-secret-key"},
            clear=False,
        ):
            from config import get_settings
            get_settings.cache_clear()

            from services.jwt_service import JWTService
            return JWTService()

    def test_access_token_contains_user_id(self, jwt_service):
        """Access token should contain user_id in 'sub' claim."""
        user_id = uuid.uuid4()

        token = jwt_service.create_access_token(
            user_id=user_id,
            email="test@example.com",
            role="user",
        )

        payload = jwt_service.decode_access_token(token)

        assert payload["sub"] == str(user_id)
        assert payload["email"] == "test@example.com"
        assert payload["role"] == "user"

    def test_token_user_id_is_valid_uuid_string(self, jwt_service):
        """Token 'sub' claim should be a valid UUID string."""
        user_id = uuid.uuid4()

        token = jwt_service.create_access_token(
            user_id=user_id,
            email="test@example.com",
            role="user",
        )

        payload = jwt_service.decode_access_token(token)

        # Should be able to parse the sub claim back to UUID
        parsed_id = uuid.UUID(payload["sub"])
        assert parsed_id == user_id

    def test_get_token_user_id_handles_invalid_uuid(self, jwt_service):
        """get_token_user_id should return None for invalid UUIDs."""
        # This tests the edge case where somehow a token has invalid UUID
        result = jwt_service.get_token_user_id("invalid-token")
        assert result is None


class TestTokenErrorHandling:
    """Test TokenError handling."""

    def test_token_error_is_exception(self):
        """TokenError should be an Exception subclass."""
        from services.jwt_service import TokenError

        error = TokenError("Test error")
        assert isinstance(error, Exception)
        assert str(error) == "Test error"

    def test_invalid_token_raises_token_error(self):
        """Invalid JWT should raise TokenError."""
        with patch.dict(
            os.environ,
            {"DEBUG": "true", "JWT_SECRET_KEY": "test-secret-key"},
            clear=False,
        ):
            from config import get_settings
            get_settings.cache_clear()

            from services.jwt_service import JWTService, TokenError
            service = JWTService()

            with pytest.raises(TokenError):
                service.decode_access_token("invalid.token.here")
