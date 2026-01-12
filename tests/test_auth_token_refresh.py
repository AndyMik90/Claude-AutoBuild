#!/usr/bin/env python3
"""
Tests for OAuth Token Refresh Functionality
============================================

Tests the automatic token refresh logic in core/auth.py.
"""

import json
import os
import time
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

import pytest

# Import the module under test
from core.auth import (
    is_token_expired,
    refresh_oauth_token,
    get_full_credentials,
    get_auth_token_source,
    save_credentials,
    TOKEN_REFRESH_BUFFER_SECONDS,
    OAUTH_TOKEN_URL,
    OAUTH_CLIENT_ID,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def reloaded_auth_with_custom_url(monkeypatch):
    """Fixture to set a custom URL and reload the auth module."""
    import importlib
    import core.auth

    monkeypatch.setenv("CLAUDE_OAUTH_TOKEN_URL", "https://custom.example.com/token")

    # Reload module to pick up the new env var
    importlib.reload(core.auth)

    yield core.auth

    # Teardown: monkeypatch automatically reverts the env var.
    # Reload the module to reset its state for other tests.
    importlib.reload(core.auth)


# =============================================================================
# is_token_expired() Tests
# =============================================================================


class TestIsTokenExpired:
    """Tests for the is_token_expired function."""

    def test_token_not_expired_future(self):
        """Token with future expiry should not be expired."""
        # 1 hour from now (in milliseconds)
        creds = {"expiresAt": int((time.time() + 3600) * 1000)}
        assert not is_token_expired(creds)

    def test_token_expired_past(self):
        """Token with past expiry should be expired."""
        # 1 hour ago (in milliseconds)
        creds = {"expiresAt": int((time.time() - 3600) * 1000)}
        assert is_token_expired(creds)

    def test_token_expired_within_buffer(self):
        """Token expiring within buffer period should be considered expired."""
        # 1 minute from now (less than 5 minute buffer)
        creds = {"expiresAt": int((time.time() + 60) * 1000)}
        assert is_token_expired(creds)

    def test_token_not_expired_outside_buffer(self):
        """Token expiring outside buffer period should not be expired."""
        # 10 minutes from now (more than 5 minute buffer)
        creds = {"expiresAt": int((time.time() + 600) * 1000)}
        assert not is_token_expired(creds)

    def test_token_no_expiry_field(self):
        """Token without expiresAt should not be considered expired."""
        creds = {"accessToken": "some-token"}
        assert not is_token_expired(creds)

    def test_token_none_expiry(self):
        """Token with None expiresAt should not be considered expired."""
        creds = {"expiresAt": None}
        assert not is_token_expired(creds)

    def test_token_zero_expiry(self):
        """Token with 0 expiresAt should not be considered expired (no info)."""
        creds = {"expiresAt": 0}
        # 0 means we have no expiry info, so assume valid
        assert not is_token_expired(creds)

    def test_token_expired_exactly_at_buffer(self):
        """Token expiring just past buffer boundary should not be expired."""
        # Just past buffer (5 minutes + 2 seconds from now) to avoid timing issues
        creds = {"expiresAt": int((time.time() + TOKEN_REFRESH_BUFFER_SECONDS + 2) * 1000)}
        # Past the boundary, it should NOT be expired
        assert not is_token_expired(creds)

    def test_token_expired_one_second_before_buffer(self):
        """Token expiring 1 second before buffer ends should be expired."""
        creds = {"expiresAt": int((time.time() + TOKEN_REFRESH_BUFFER_SECONDS - 1) * 1000)}
        assert is_token_expired(creds)


# =============================================================================
# refresh_oauth_token() Tests
# =============================================================================


class TestRefreshOAuthToken:
    """Tests for the refresh_oauth_token function."""

    @patch("core.auth.requests.post")
    def test_refresh_success(self, mock_post):
        """Successful token refresh should return new credentials."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "new-access-token",
            "refresh_token": "new-refresh-token",
            "expires_in": 28800,
        }
        mock_post.return_value = mock_response

        result = refresh_oauth_token("old-refresh-token")

        assert result is not None
        assert result["accessToken"] == "new-access-token"
        assert result["refreshToken"] == "new-refresh-token"
        assert "expiresAt" in result
        # expiresAt should be roughly 8 hours from now (in milliseconds)
        expected_expiry = int((time.time() + 28800) * 1000)
        assert abs(result["expiresAt"] - expected_expiry) < 5000  # Within 5 seconds

        # Verify the request was made correctly
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs[0][0] == OAUTH_TOKEN_URL
        assert call_kwargs[1]["json"]["grant_type"] == "refresh_token"
        assert call_kwargs[1]["json"]["refresh_token"] == "old-refresh-token"
        assert call_kwargs[1]["json"]["client_id"] == OAUTH_CLIENT_ID

    @patch("core.auth.requests.post")
    def test_refresh_failure_401(self, mock_post):
        """401 response should return None."""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_post.return_value = mock_response

        result = refresh_oauth_token("invalid-refresh-token")
        assert result is None

    @patch("core.auth.requests.post")
    def test_refresh_failure_400(self, mock_post):
        """400 response should return None."""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_post.return_value = mock_response

        result = refresh_oauth_token("bad-refresh-token")
        assert result is None

    @patch("core.auth.requests.post")
    def test_refresh_network_error(self, mock_post):
        """Network error should return None without crashing."""
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError("Network unreachable")

        result = refresh_oauth_token("some-refresh-token")
        assert result is None

    @patch("core.auth.requests.post")
    def test_refresh_timeout(self, mock_post):
        """Timeout should return None without crashing."""
        import requests

        mock_post.side_effect = requests.exceptions.Timeout("Request timed out")

        result = refresh_oauth_token("some-refresh-token")
        assert result is None

    def test_refresh_none_token(self):
        """None refresh token should return None immediately."""
        result = refresh_oauth_token(None)
        assert result is None

    def test_refresh_empty_token(self):
        """Empty refresh token should return None immediately."""
        result = refresh_oauth_token("")
        assert result is None

    @patch("core.auth.requests.post")
    def test_refresh_uses_configured_url(self, mock_post):
        """Should use the configured token URL."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_in": 3600,
        }
        mock_post.return_value = mock_response

        refresh_oauth_token("test-token")

        # Verify URL was used
        call_args = mock_post.call_args
        assert call_args[0][0] == OAUTH_TOKEN_URL

    @patch("core.auth.requests.post")
    def test_refresh_missing_access_token_in_response(self, mock_post):
        """200 response without access_token should return None."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        # Response is 200 but missing access_token (e.g., error response)
        mock_response.json.return_value = {
            "error": "something_went_wrong",
            "refresh_token": "refresh",
        }
        mock_post.return_value = mock_response

        result = refresh_oauth_token("some-refresh-token")
        assert result is None


# =============================================================================
# get_full_credentials() Tests
# =============================================================================


class TestGetFullCredentials:
    """Tests for the get_full_credentials function."""

    @patch("core.auth._get_full_credentials_from_store")
    def test_env_var_oauth_token_no_store(self, mock_store, monkeypatch):
        """CLAUDE_CODE_OAUTH_TOKEN without store creds returns no refresh info."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "env-oauth-token")
        mock_store.return_value = None  # No store credentials

        result = get_full_credentials()

        assert result is not None
        assert result["accessToken"] == "env-oauth-token"
        assert result["refreshToken"] is None
        assert result["expiresAt"] is None

    @patch("core.auth._get_full_credentials_from_store")
    def test_env_var_oauth_token_with_store(self, mock_store, monkeypatch):
        """CLAUDE_CODE_OAUTH_TOKEN with store creds merges refresh info."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "env-oauth-token")
        mock_store.return_value = {
            "accessToken": "store-token",
            "refreshToken": "store-refresh",
            "expiresAt": 1234567890000,
        }

        result = get_full_credentials()

        assert result is not None
        assert result["accessToken"] == "env-oauth-token"  # Uses env token
        assert result["refreshToken"] == "store-refresh"  # Keeps store refresh
        assert result["expiresAt"] == 1234567890000  # Keeps store expiry

    def test_env_var_anthropic_auth(self, monkeypatch):
        """ANTHROPIC_AUTH_TOKEN has priority and no refresh."""
        # Clear other env vars
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "anthropic-auth-token")

        result = get_full_credentials()

        assert result is not None
        assert result["accessToken"] == "anthropic-auth-token"
        assert result["refreshToken"] is None  # Enterprise tokens don't refresh

    @patch("core.auth._get_full_credentials_from_store")
    def test_fallback_to_store(self, mock_store, monkeypatch):
        """Should use credential store if no env vars set."""
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)

        mock_store.return_value = {
            "accessToken": "store-token",
            "refreshToken": "store-refresh",
            "expiresAt": 1234567890000,
        }

        result = get_full_credentials()

        assert result is not None
        assert result["accessToken"] == "store-token"
        assert result["refreshToken"] == "store-refresh"
        mock_store.assert_called_once()


# =============================================================================
# get_auth_token() Integration Tests
# =============================================================================


class TestGetAuthTokenWithRefresh:
    """Tests for get_auth_token() with automatic refresh."""

    @patch("core.auth.get_full_credentials")
    @patch("core.auth.is_token_expired")
    def test_token_not_expired_returns_as_is(self, mock_expired, mock_creds, monkeypatch):
        """Non-expired token should be returned without refresh attempt."""
        mock_creds.return_value = {
            "accessToken": "sk-ant-oat01-valid-token",
            "refreshToken": "sk-ant-ort01-refresh",
            "expiresAt": int((time.time() + 3600) * 1000),
        }
        mock_expired.return_value = False

        from core.auth import get_auth_token

        result = get_auth_token()

        assert result == "sk-ant-oat01-valid-token"

    @patch("core.auth.save_credentials")
    @patch("core.auth.refresh_oauth_token")
    @patch("core.auth.get_full_credentials")
    @patch("core.auth.is_token_expired")
    def test_expired_token_refresh_success(
        self, mock_expired, mock_creds, mock_refresh, mock_save, monkeypatch
    ):
        """Expired token with successful refresh returns new token."""
        mock_creds.return_value = {
            "accessToken": "sk-ant-oat01-old-token",
            "refreshToken": "sk-ant-ort01-refresh",
            "expiresAt": int((time.time() - 3600) * 1000),
        }
        mock_expired.return_value = True
        mock_refresh.return_value = {
            "accessToken": "sk-ant-oat01-new-token",
            "refreshToken": "sk-ant-ort01-new-refresh",
            "expiresAt": int((time.time() + 28800) * 1000),
        }
        mock_save.return_value = True

        from core.auth import get_auth_token

        result = get_auth_token()

        assert result == "sk-ant-oat01-new-token"
        mock_refresh.assert_called_once_with("sk-ant-ort01-refresh")
        mock_save.assert_called_once()

    @patch("core.auth.refresh_oauth_token")
    @patch("core.auth.get_full_credentials")
    @patch("core.auth.is_token_expired")
    def test_expired_token_refresh_fails_returns_original(
        self, mock_expired, mock_creds, mock_refresh, monkeypatch
    ):
        """Expired token with failed refresh returns original (graceful degradation)."""
        mock_creds.return_value = {
            "accessToken": "sk-ant-oat01-original-token",
            "refreshToken": "sk-ant-ort01-refresh",
            "expiresAt": int((time.time() - 3600) * 1000),
        }
        mock_expired.return_value = True
        mock_refresh.return_value = None  # Refresh failed

        from core.auth import get_auth_token

        result = get_auth_token()

        # Should return original token as fallback
        assert result == "sk-ant-oat01-original-token"

    @patch("core.auth.get_full_credentials")
    @patch("core.auth.is_token_expired")
    def test_expired_token_no_refresh_token_returns_original(
        self, mock_expired, mock_creds, monkeypatch
    ):
        """Expired token without refresh token returns original (graceful degradation)."""
        mock_creds.return_value = {
            "accessToken": "sk-ant-oat01-original-token",
            "refreshToken": None,  # No refresh token
            "expiresAt": int((time.time() - 3600) * 1000),
        }
        mock_expired.return_value = True

        from core.auth import get_auth_token

        result = get_auth_token()

        # Should return original token as fallback
        assert result == "sk-ant-oat01-original-token"

    @patch("core.auth.get_full_credentials")
    def test_no_credentials_returns_none(self, mock_creds, monkeypatch):
        """No credentials should return None."""
        mock_creds.return_value = None

        from core.auth import get_auth_token

        result = get_auth_token()

        assert result is None


# =============================================================================
# Linux Credential Store Tests
# =============================================================================


class TestLinuxCredentials:
    """Tests for Linux credential store operations."""

    @patch("core.auth.platform.system")
    @patch("core.auth.os.path.exists")
    def test_linux_read_credentials(self, mock_exists, mock_system, monkeypatch):
        """Linux should read from ~/.claude/credentials.json."""
        # Clear env vars
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)

        mock_system.return_value = "Linux"
        mock_exists.return_value = True

        # Use valid token format (sk-ant-oat01-...) required by the function
        cred_data = {
            "claudeAiOauth": {
                "accessToken": "sk-ant-oat01-test-linux-token",
                "refreshToken": "sk-ant-ort01-test-refresh-token",
                "expiresAt": 1735123456789,
            }
        }

        # Use read_data parameter for mock_open (works with json.load)
        with patch("builtins.open", mock_open(read_data=json.dumps(cred_data))):
            from core.auth import _get_full_credentials_linux

            result = _get_full_credentials_linux()

        assert result is not None
        assert result["accessToken"] == "sk-ant-oat01-test-linux-token"
        assert result["refreshToken"] == "sk-ant-ort01-test-refresh-token"
        assert result["expiresAt"] == 1735123456789

    @patch("core.auth.platform.system")
    @patch("core.auth.os.path.exists")
    def test_linux_no_credentials_file(self, mock_exists, mock_system, monkeypatch):
        """Linux should return None if no credentials file exists."""
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)

        mock_system.return_value = "Linux"
        mock_exists.return_value = False

        from core.auth import _get_full_credentials_linux

        result = _get_full_credentials_linux()
        assert result is None


# =============================================================================
# save_credentials() Tests
# =============================================================================


class TestSaveCredentials:
    """Tests for the save_credentials function."""

    @patch("core.auth.platform.system")
    @patch("core.auth._save_credentials_linux")
    def test_save_linux(self, mock_save_linux, mock_system):
        """Should use Linux save on Linux platform."""
        mock_system.return_value = "Linux"
        mock_save_linux.return_value = True

        creds = {
            "accessToken": "new-token",
            "refreshToken": "new-refresh",
            "expiresAt": 1234567890000,
        }

        result = save_credentials(creds)

        assert result is True
        mock_save_linux.assert_called_once_with(creds)

    @patch("core.auth.platform.system")
    @patch("core.auth._save_credentials_macos")
    def test_save_macos(self, mock_save_macos, mock_system):
        """Should use macOS save on Darwin platform."""
        mock_system.return_value = "Darwin"
        mock_save_macos.return_value = True

        creds = {"accessToken": "token", "refreshToken": "refresh", "expiresAt": 123}

        result = save_credentials(creds)

        assert result is True
        mock_save_macos.assert_called_once_with(creds)

    @patch("core.auth.platform.system")
    @patch("core.auth._save_credentials_windows")
    def test_save_windows(self, mock_save_windows, mock_system):
        """Should use Windows save on Windows platform."""
        mock_system.return_value = "Windows"
        mock_save_windows.return_value = True

        creds = {"accessToken": "token", "refreshToken": "refresh", "expiresAt": 123}

        result = save_credentials(creds)

        assert result is True
        mock_save_windows.assert_called_once_with(creds)


# =============================================================================
# Integration Tests (with temporary files)
# =============================================================================


class TestLinuxCredentialIntegration:
    """Integration tests for Linux credential file operations."""

    def test_save_and_read_linux(self, tmp_path, monkeypatch):
        """Test full save/read cycle on Linux."""
        # Setup temp credentials file
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        cred_file = claude_dir / "credentials.json"

        # Patch the home directory expansion
        monkeypatch.setattr(
            "core.auth.os.path.expanduser",
            lambda p: str(tmp_path / p.replace("~", "").lstrip("/")),
        )

        from core.auth import _save_credentials_linux, _get_full_credentials_linux

        # Save credentials (use valid token format for read validation)
        creds = {
            "accessToken": "sk-ant-oat01-test-access-token",
            "refreshToken": "sk-ant-ort01-test-refresh-token",
            "expiresAt": int((time.time() + 3600) * 1000),
        }
        result = _save_credentials_linux(creds)
        assert result is True

        # Verify file was created
        assert cred_file.exists()

        # Verify permissions (should be 0600)
        import stat

        file_stat = cred_file.stat()
        assert (file_stat.st_mode & 0o777) == 0o600

        # Read back
        read_creds = _get_full_credentials_linux()
        assert read_creds is not None
        assert read_creds["accessToken"] == "sk-ant-oat01-test-access-token"
        assert read_creds["refreshToken"] == "sk-ant-ort01-test-refresh-token"

    def test_save_preserves_other_data(self, tmp_path, monkeypatch):
        """Saving credentials should preserve other data in the file."""
        claude_dir = tmp_path / ".claude"
        claude_dir.mkdir()
        cred_file = claude_dir / "credentials.json"

        # Pre-populate with other data
        existing_data = {
            "otherKey": "otherValue",
            "claudeAiOauth": {
                "accessToken": "old-token",
                "refreshToken": "old-refresh",
                "expiresAt": 1000,
            },
        }
        cred_file.write_text(json.dumps(existing_data))

        monkeypatch.setattr(
            "core.auth.os.path.expanduser",
            lambda p: str(tmp_path / p.replace("~", "").lstrip("/")),
        )

        from core.auth import _save_credentials_linux

        # Save new credentials (use valid token format for consistency)
        new_creds = {
            "accessToken": "sk-ant-oat01-new-token",
            "refreshToken": "sk-ant-ort01-new-refresh",
            "expiresAt": 2000,
        }
        _save_credentials_linux(new_creds)

        # Read back and verify
        with open(cred_file) as f:
            saved_data = json.load(f)

        assert saved_data["otherKey"] == "otherValue"  # Preserved
        assert saved_data["claudeAiOauth"]["accessToken"] == "sk-ant-oat01-new-token"  # Updated


# =============================================================================
# Environment Variable Configuration Tests
# =============================================================================


class TestOAuthConfiguration:
    """Tests for OAuth configuration via environment variables."""

    def test_default_token_url(self, monkeypatch):
        """Default token URL should be Anthropic's console API."""
        import importlib
        import core.auth

        # Clear env var and reload module to get true default
        monkeypatch.delenv("CLAUDE_OAUTH_TOKEN_URL", raising=False)
        importlib.reload(core.auth)

        try:
            assert core.auth.OAUTH_TOKEN_URL == "https://console.anthropic.com/v1/oauth/token"
        finally:
            # Restore module state
            importlib.reload(core.auth)

    def test_default_client_id(self, monkeypatch):
        """Default client ID should be Claude Code CLI's client ID."""
        import importlib
        import core.auth

        monkeypatch.delenv("CLAUDE_OAUTH_CLIENT_ID", raising=False)
        importlib.reload(core.auth)

        try:
            assert core.auth.OAUTH_CLIENT_ID == "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
        finally:
            importlib.reload(core.auth)

    def test_default_buffer_seconds(self, monkeypatch):
        """Default buffer should be 300 seconds (5 minutes)."""
        import importlib
        import core.auth

        monkeypatch.delenv("CLAUDE_TOKEN_REFRESH_BUFFER_SECONDS", raising=False)
        importlib.reload(core.auth)

        try:
            assert core.auth.TOKEN_REFRESH_BUFFER_SECONDS == 300
        finally:
            importlib.reload(core.auth)

    def test_custom_token_url(self, reloaded_auth_with_custom_url):
        """Custom token URL should be picked up from environment."""
        auth_module = reloaded_auth_with_custom_url
        assert auth_module.OAUTH_TOKEN_URL == "https://custom.example.com/token"


# =============================================================================
# get_auth_token_source() Tests
# =============================================================================


class TestGetAuthTokenSource:
    """Tests for the get_auth_token_source function priority logic."""

    @patch("core.auth._get_full_credentials_from_store")
    def test_enterprise_token_has_highest_priority(self, mock_store, monkeypatch):
        """ANTHROPIC_AUTH_TOKEN should take priority over all other sources."""
        monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "enterprise-token")
        monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token")
        mock_store.return_value = {"accessToken": "sk-ant-oat01-store-token"}

        assert get_auth_token_source() == "ANTHROPIC_AUTH_TOKEN"

    @patch("core.auth._get_full_credentials_from_store")
    def test_oauth_env_var_priority_over_store(self, mock_store, monkeypatch):
        """CLAUDE_CODE_OAUTH_TOKEN should take priority over credential store."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token")
        mock_store.return_value = {"accessToken": "sk-ant-oat01-store-token"}

        assert get_auth_token_source() == "CLAUDE_CODE_OAUTH_TOKEN"

    @patch("core.auth._get_full_credentials_from_store")
    @patch("core.auth.platform.system")
    def test_linux_store_when_no_env_vars(self, mock_system, mock_store, monkeypatch):
        """Linux credential store should be returned when no env vars set."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        mock_system.return_value = "Linux"
        mock_store.return_value = {"accessToken": "sk-ant-oat01-store-token"}

        assert get_auth_token_source() == "Linux credential file"

    @patch("core.auth._get_full_credentials_from_store")
    @patch("core.auth.platform.system")
    def test_macos_keychain_when_no_env_vars(self, mock_system, mock_store, monkeypatch):
        """macOS Keychain should be returned when no env vars set."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        mock_system.return_value = "Darwin"
        mock_store.return_value = {"accessToken": "sk-ant-oat01-store-token"}

        assert get_auth_token_source() == "macOS Keychain"

    @patch("core.auth._get_full_credentials_from_store")
    @patch("core.auth.platform.system")
    def test_windows_store_when_no_env_vars(self, mock_system, mock_store, monkeypatch):
        """Windows credential file should be returned when no env vars set."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        mock_system.return_value = "Windows"
        mock_store.return_value = {"accessToken": "sk-ant-oat01-store-token"}

        assert get_auth_token_source() == "Windows credential file"

    @patch("core.auth._get_full_credentials_from_store")
    def test_returns_none_when_no_sources(self, mock_store, monkeypatch):
        """Should return None when no token sources are available."""
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)
        mock_store.return_value = None

        assert get_auth_token_source() is None
