"""Tests for configuration validation.

Validates that:
- Default JWT secret is rejected in production (DEBUG=false)
- Default JWT secret is allowed in development (DEBUG=true)
- Custom JWT secrets work in all environments
"""

import os
import pytest
from unittest.mock import patch


class TestJWTSecretValidation:
    """Test JWT secret validation in production vs development."""

    def test_default_jwt_secret_rejected_in_production(self):
        """Default JWT secret should raise error when DEBUG=false."""
        # Clear cached settings
        from config import get_settings
        get_settings.cache_clear()

        with patch.dict(
            os.environ,
            {
                "DEBUG": "false",
                "JWT_SECRET_KEY": "changeme-generate-a-secure-key",
            },
            clear=False,
        ):
            # Clear cache again to pick up new env
            get_settings.cache_clear()

            with pytest.raises(ValueError) as exc_info:
                # Import fresh to trigger validation
                from pydantic_settings import BaseSettings
                from config import Settings
                Settings()

            assert "JWT_SECRET_KEY must be changed" in str(exc_info.value)

    def test_default_jwt_secret_allowed_in_debug_mode(self):
        """Default JWT secret should be allowed when DEBUG=true."""
        from config import get_settings
        get_settings.cache_clear()

        with patch.dict(
            os.environ,
            {
                "DEBUG": "true",
                "JWT_SECRET_KEY": "changeme-generate-a-secure-key",
            },
            clear=False,
        ):
            get_settings.cache_clear()

            from config import Settings
            settings = Settings()

            # Should not raise, should have the default secret
            assert settings.jwt_secret_key == "changeme-generate-a-secure-key"
            assert settings.debug is True

    def test_custom_jwt_secret_allowed_in_production(self):
        """Custom JWT secret should be allowed in production."""
        from config import get_settings
        get_settings.cache_clear()

        with patch.dict(
            os.environ,
            {
                "DEBUG": "false",
                "JWT_SECRET_KEY": "my-super-secure-production-secret-key-12345",
            },
            clear=False,
        ):
            get_settings.cache_clear()

            from config import Settings
            settings = Settings()

            # Should not raise
            assert settings.jwt_secret_key == "my-super-secure-production-secret-key-12345"
            assert settings.debug is False


class TestCORSConfiguration:
    """Test CORS origins configuration from environment."""

    def test_cors_origins_from_comma_separated_string(self):
        """CORS origins should parse from comma-separated string."""
        from config import get_settings
        get_settings.cache_clear()

        with patch.dict(
            os.environ,
            {
                "DEBUG": "true",
                "CORS_ALLOWED_ORIGINS": "http://localhost:3000,http://localhost:5173,https://myapp.com",
            },
            clear=False,
        ):
            get_settings.cache_clear()

            from config import Settings
            settings = Settings()

            assert len(settings.cors_allowed_origins) == 3
            assert "http://localhost:3000" in settings.cors_allowed_origins
            assert "http://localhost:5173" in settings.cors_allowed_origins
            assert "https://myapp.com" in settings.cors_allowed_origins

    def test_cors_origins_handles_whitespace(self):
        """CORS origins should handle whitespace around origins."""
        from config import get_settings
        get_settings.cache_clear()

        with patch.dict(
            os.environ,
            {
                "DEBUG": "true",
                "CORS_ALLOWED_ORIGINS": " http://localhost:3000 , http://localhost:5173 ",
            },
            clear=False,
        ):
            get_settings.cache_clear()

            from config import Settings
            settings = Settings()

            assert len(settings.cors_allowed_origins) == 2
            assert "http://localhost:3000" in settings.cors_allowed_origins
            assert "http://localhost:5173" in settings.cors_allowed_origins
