#!/usr/bin/env python3
"""
Tests for Authentication System
================================

Tests the auth.py module functionality including:
- Environment variable token resolution
- System credential store integration (macOS, Windows, Linux)
- Token source detection
- Token validation and format checking
"""

import json
import os
import platform
from unittest.mock import MagicMock, Mock

import pytest
from core.auth import (
    AUTH_TOKEN_ENV_VARS,
    ensure_claude_code_oauth_token,
    get_auth_token,
    get_auth_token_source,
    get_sdk_env_vars,
    get_token_from_keychain,
    require_auth_token,
)


class TestEnvVarTokenResolution:
    """Tests for environment variable token resolution."""

    @pytest.fixture(autouse=True)
    def clear_env(self):
        """Clear auth environment variables before each test."""
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)
        yield
        # Cleanup after test
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)

    def test_claude_oauth_token_from_env(self):
        """Reads CLAUDE_CODE_OAUTH_TOKEN from environment."""
        test_token = "sk-ant-oat01-test-token"
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = test_token

        token = get_auth_token()
        assert token == test_token

    def test_anthropic_auth_token_from_env(self):
        """Reads ANTHROPIC_AUTH_TOKEN from environment."""
        test_token = "sk-ant-oat01-test-enterprise-token"
        os.environ["ANTHROPIC_AUTH_TOKEN"] = test_token

        token = get_auth_token()
        assert token == test_token

    def test_claude_oauth_takes_precedence(self):
        """CLAUDE_CODE_OAUTH_TOKEN takes precedence over ANTHROPIC_AUTH_TOKEN."""
        claude_token = "sk-ant-oat01-claude-token"
        anthropic_token = "sk-ant-oat01-anthropic-token"

        os.environ["ANTHROPIC_AUTH_TOKEN"] = anthropic_token
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = claude_token

        token = get_auth_token()
        assert token == claude_token

    def test_no_token_returns_none(self):
        """Returns None when no auth token is configured."""
        token = get_auth_token()
        assert token is None

    def test_token_source_from_env(self):
        """Identifies environment variable as token source."""
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = "sk-ant-oat01-test-token"

        source = get_auth_token_source()
        assert source == "CLAUDE_CODE_OAUTH_TOKEN"

    def test_empty_token_ignored(self):
        """Empty string tokens are ignored."""
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = ""
        os.environ["ANTHROPIC_AUTH_TOKEN"] = "sk-ant-oat01-test-token"

        token = get_auth_token()
        # Should get ANTHROPIC_AUTH_TOKEN since CLAUDE_CODE_OAUTH_TOKEN is empty
        assert token == "sk-ant-oat01-test-token"


class TestMacOSKeychain:
    """Tests for macOS keychain token retrieval."""

    def test_macos_keychain_success(self, monkeypatch):
        """Successfully retrieves token from macOS keychain."""
        test_token = "sk-ant-oat01-macos-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = credentials

        monkeypatch.setattr(platform, "system", lambda: "Darwin")
        monkeypatch.setattr("subprocess.run", Mock(return_value=mock_result))

        token = get_token_from_keychain()
        assert token == test_token

    def test_macos_keychain_command_failure(self, monkeypatch):
        """Returns None when security command fails."""
        mock_result = Mock()
        mock_result.returncode = 1

        monkeypatch.setattr(platform, "system", lambda: "Darwin")
        monkeypatch.setattr("subprocess.run", Mock(return_value=mock_result))

        token = get_token_from_keychain()
        assert token is None

    def test_macos_keychain_invalid_json(self, monkeypatch):
        """Returns None when keychain returns invalid JSON."""
        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = "invalid json"

        monkeypatch.setattr(platform, "system", lambda: "Darwin")
        monkeypatch.setattr("subprocess.run", Mock(return_value=mock_result))

        token = get_token_from_keychain()
        assert token is None

    def test_macos_keychain_invalid_token_format(self, monkeypatch):
        """Returns None when token doesn't start with sk-ant-oat01-."""
        credentials = json.dumps({"claudeAiOauth": {"accessToken": "invalid-token"}})

        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = credentials

        monkeypatch.setattr(platform, "system", lambda: "Darwin")
        monkeypatch.setattr("subprocess.run", Mock(return_value=mock_result))

        token = get_token_from_keychain()
        assert token is None


class TestWindowsCredentialFiles:
    """Tests for Windows credential file token retrieval."""

    def test_windows_credential_file_success(self, monkeypatch, tmp_path):
        """Successfully retrieves token from Windows credential file."""
        test_token = "sk-ant-oat01-windows-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        # Create a temporary credential file
        cred_file = tmp_path / ".credentials.json"
        cred_file.write_text(credentials)

        monkeypatch.setattr(platform, "system", lambda: "Windows")
        monkeypatch.setattr(
            os.path, "expandvars", lambda p: str(cred_file).replace("\\", "/")
        )

        token = get_token_from_keychain()
        assert token == test_token

    def test_windows_credential_file_not_found(self, monkeypatch):
        """Returns None when credential file doesn't exist."""
        monkeypatch.setattr(platform, "system", lambda: "Windows")
        monkeypatch.setattr(os.path, "exists", lambda x: False)

        token = get_token_from_keychain()
        assert token is None

    def test_windows_credential_file_invalid_json(self, monkeypatch, tmp_path):
        """Returns None when credential file contains invalid JSON."""
        cred_file = tmp_path / ".credentials.json"
        cred_file.write_text("invalid json")

        monkeypatch.setattr(platform, "system", lambda: "Windows")
        monkeypatch.setattr(
            os.path, "expandvars", lambda p: str(cred_file).replace("\\", "/")
        )
        monkeypatch.setattr(os.path, "exists", lambda x: str(x).endswith(".json"))

        token = get_token_from_keychain()
        assert token is None


class TestLinuxSecretService:
    """Tests for Linux Secret Service token retrieval."""

    def test_linux_secret_service_not_installed(self, monkeypatch):
        """Returns None when secretstorage is not installed."""
        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", None)

        token = get_token_from_keychain()
        assert token is None

    def test_linux_secret_service_dbus_not_available(self, monkeypatch):
        """Returns None when DBus is not available."""
        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception

        # Make get_default_collection raise exception
        mock_ss.get_default_collection.side_effect = Exception("DBus not available")

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        assert token is None

    def test_linux_secret_service_success(self, monkeypatch):
        """Successfully retrieves token from Linux secret service."""
        test_token = "sk-ant-oat01-linux-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        # Mock secretstorage
        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        # Mock collection
        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = False
        mock_collection.unlock.return_value = None

        # Mock item
        mock_item = MagicMock()
        mock_item.get_label.return_value = "Claude Code-credentials"
        mock_item.get_secret.return_value = credentials
        mock_item.is_locked.return_value = False

        mock_collection.search_items.return_value = [mock_item]
        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        assert token == test_token

    def test_linux_secret_service_exact_label_match_only(self, monkeypatch):
        """Only matches exact 'Claude Code-credentials' label."""
        test_token = "sk-ant-oat01-linux-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = False

        # Mock item with similar but not exact label
        mock_item = MagicMock()
        mock_item.get_label.return_value = (
            "Some-Claude-Code-Thing"  # Similar but not exact
        )
        mock_item.get_secret.return_value = credentials

        mock_collection.search_items.return_value = [mock_item]
        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        # Should return None because label doesn't match exactly
        assert token is None

    def test_linux_secret_service_locked_collection_unlock_fails(self, monkeypatch):
        """Returns None when collection is locked and unlock fails."""

        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = True
        mock_collection.unlock.side_effect = Exception("Unlock failed")

        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        assert token is None

    def test_linux_secret_service_no_matching_item(self, monkeypatch):
        """Returns None when no matching credential found."""
        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = False
        mock_collection.search_items.return_value = []  # No items found

        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        assert token is None

    def test_linux_secret_service_invalid_json(self, monkeypatch):
        """Returns None when stored secret contains invalid JSON."""
        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = False

        mock_item = MagicMock()
        mock_item.get_label.return_value = "Claude Code-credentials"
        mock_item.get_secret.return_value = "invalid json"

        mock_collection.search_items.return_value = [mock_item]
        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        assert token is None

    def test_linux_secret_service_invalid_token_format(self, monkeypatch):
        """Returns None when token doesn't start with sk-ant-oat01-."""
        credentials = json.dumps({"claudeAiOauth": {"accessToken": "invalid-token"}})

        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = False

        mock_item = MagicMock()
        mock_item.get_label.return_value = "Claude Code-credentials"
        mock_item.get_secret.return_value = credentials

        mock_collection.search_items.return_value = [mock_item]
        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        token = get_token_from_keychain()
        assert token is None


class TestRequireAuthToken:
    """Tests for require_auth_token function."""

    @pytest.fixture(autouse=True)
    def clear_env(self):
        """Clear auth environment variables before each test."""
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)
        yield
        # Cleanup after test
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)

    def test_require_token_returns_valid_token(self):
        """Returns token when valid token exists."""
        test_token = "sk-ant-oat01-test-token"
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = test_token

        token = require_auth_token()
        assert token == test_token

    def test_require_token_raises_when_missing(self):
        """Raises ValueError when no token is configured."""
        with pytest.raises(ValueError, match="No OAuth token found"):
            require_auth_token()

    def test_error_message_includes_macos_instructions(self, monkeypatch):
        """Error message includes macOS setup instructions."""
        monkeypatch.setattr(platform, "system", lambda: "Darwin")

        with pytest.raises(ValueError) as exc_info:
            require_auth_token()

        error_msg = str(exc_info.value)
        assert "macOS Keychain" in error_msg
        assert "claude setup-token" in error_msg

    def test_error_message_includes_windows_instructions(self, monkeypatch):
        """Error message includes Windows setup instructions."""
        monkeypatch.setattr(platform, "system", lambda: "Windows")

        with pytest.raises(ValueError) as exc_info:
            require_auth_token()

        error_msg = str(exc_info.value)
        assert "Windows Credential Manager" in error_msg
        assert "claude setup-token" in error_msg

    def test_error_message_includes_linux_instructions(self, monkeypatch):
        """Error message includes Linux setup instructions."""
        monkeypatch.setattr(platform, "system", lambda: "Linux")

        with pytest.raises(ValueError) as exc_info:
            require_auth_token()

        error_msg = str(exc_info.value)
        assert "secret service" in error_msg.lower()
        assert "gnome-keyring" in error_msg.lower()
        assert "claude setup-token" in error_msg


class TestEnsureClaudeCodeOAuthToken:
    """Tests for ensure_claude_code_oauth_token function."""

    @pytest.fixture(autouse=True)
    def clear_env(self):
        """Clear auth environment variables before each test."""
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)
        os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None)
        yield
        # Cleanup after test
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)
        os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None)

    def test_does_nothing_when_already_set(self):
        """Doesn't modify env var when CLAUDE_CODE_OAUTH_TOKEN is already set."""
        existing_token = "sk-ant-oat01-existing-token"
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = existing_token

        ensure_claude_code_oauth_token()

        assert os.environ["CLAUDE_CODE_OAUTH_TOKEN"] == existing_token

    def test_copies_from_anthropic_auth_token(self):
        """Copies ANTHROPIC_AUTH_TOKEN to CLAUDE_CODE_OAUTH_TOKEN."""
        anthropic_token = "sk-ant-oat01-anthropic-token"
        os.environ["ANTHROPIC_AUTH_TOKEN"] = anthropic_token

        ensure_claude_code_oauth_token()

        assert os.environ["CLAUDE_CODE_OAUTH_TOKEN"] == anthropic_token

    def test_does_nothing_when_no_token_available(self, monkeypatch):
        """Doesn't set env var when no auth token is available."""
        monkeypatch.setattr(platform, "system", lambda: "Linux")
        # Ensure keychain returns None
        monkeypatch.setattr("core.auth.get_token_from_keychain", lambda: None)

        ensure_claude_code_oauth_token()

        assert "CLAUDE_CODE_OAUTH_TOKEN" not in os.environ


class TestTokenSourceDetection:
    """Tests for get_auth_token_source function."""

    @pytest.fixture(autouse=True)
    def clear_env(self):
        """Clear auth environment variables before each test."""
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)
        yield
        # Cleanup after test
        for var in AUTH_TOKEN_ENV_VARS:
            os.environ.pop(var, None)

    def test_source_env_var_claude_oauth(self):
        """Identifies CLAUDE_CODE_OAUTH_TOKEN as source."""
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = "sk-ant-oat01-test-token"

        source = get_auth_token_source()
        assert source == "CLAUDE_CODE_OAUTH_TOKEN"

    def test_source_env_var_anthropic_auth(self):
        """Identifies ANTHROPIC_AUTH_TOKEN as source."""
        os.environ["ANTHROPIC_AUTH_TOKEN"] = "sk-ant-oat01-test-token"

        source = get_auth_token_source()
        assert source == "ANTHROPIC_AUTH_TOKEN"

    def test_source_macos_keychain(self, monkeypatch):
        """Identifies macOS Keychain as source."""
        test_token = "sk-ant-oat01-macos-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = credentials

        monkeypatch.setattr(platform, "system", lambda: "Darwin")
        monkeypatch.setattr("subprocess.run", Mock(return_value=mock_result))

        source = get_auth_token_source()
        assert source == "macOS Keychain"

    def test_source_windows_credential_files(self, monkeypatch, tmp_path):
        """Identifies Windows Credential Files as source."""
        test_token = "sk-ant-oat01-windows-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        cred_file = tmp_path / ".credentials.json"
        cred_file.write_text(credentials)

        monkeypatch.setattr(platform, "system", lambda: "Windows")
        monkeypatch.setattr(
            os.path, "expandvars", lambda p: str(cred_file).replace("\\", "/")
        )

        source = get_auth_token_source()
        assert source == "Windows Credential Files"

    def test_source_linux_secret_service(self, monkeypatch):
        """Identifies Linux Secret Service as source."""
        test_token = "sk-ant-oat01-linux-token"
        credentials = json.dumps({"claudeAiOauth": {"accessToken": test_token}})

        mock_ss = MagicMock()
        mock_ss.exceptions = MagicMock()
        mock_ss.exceptions.SecretServiceNotAvailableException = Exception
        mock_ss.exceptions.SecretStorageException = Exception

        mock_collection = MagicMock()
        mock_collection.is_locked.return_value = False

        mock_item = MagicMock()
        mock_item.get_label.return_value = "Claude Code-credentials"
        mock_item.get_secret.return_value = credentials

        mock_collection.search_items.return_value = [mock_item]
        mock_ss.get_default_collection.return_value = mock_collection

        monkeypatch.setattr(platform, "system", lambda: "Linux")
        monkeypatch.setattr("core.auth.secretstorage", mock_ss)

        source = get_auth_token_source()
        assert source == "Linux Secret Service"

    def test_source_none_when_not_found(self):
        """Returns None when no token source is found."""
        source = get_auth_token_source()
        assert source is None


class TestSdkEnvVars:
    """Tests for get_sdk_env_vars function."""

    def test_returns_non_empty_vars(self, monkeypatch):
        """Only returns non-empty environment variables."""
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        monkeypatch.setenv("ANTHROPIC_MODEL", "")  # Empty, should be excluded
        monkeypatch.setenv("DISABLE_TELEMETRY", "1")

        env = get_sdk_env_vars()

        assert "ANTHROPIC_BASE_URL" in env
        assert env["ANTHROPIC_BASE_URL"] == "https://api.anthropic.com"
        assert "ANTHROPIC_MODEL" not in env  # Empty value excluded
        assert "DISABLE_TELEMETRY" in env
        assert env["DISABLE_TELEMETRY"] == "1"

    def test_includes_claude_git_bash_on_windows(self, monkeypatch):
        """Auto-detects git-bash path on Windows."""
        monkeypatch.setattr(platform, "system", lambda: "Windows")
        monkeypatch.setattr(
            "core.auth._find_git_bash_path",
            lambda: "C:\\Program Files\\Git\\bin\\bash.exe",
        )

        env = get_sdk_env_vars()

        assert "CLAUDE_CODE_GIT_BASH_PATH" in env
        assert "Git\\bin\\bash.exe" in env["CLAUDE_CODE_GIT_BASH_PATH"]

    def test_does_not_include_git_bash_on_non_windows(self, monkeypatch):
        """Doesn't include git-bash path on non-Windows platforms."""
        monkeypatch.setattr(platform, "system", lambda: "Darwin")

        env = get_sdk_env_vars()

        assert "CLAUDE_CODE_GIT_BASH_PATH" not in env

    def test_does_not_overwrite_existing_git_bash_path(self, monkeypatch):
        """Respects existing CLAUDE_CODE_GIT_BASH_PATH environment variable."""
        existing_path = "/custom/bash.exe"
        monkeypatch.setenv("CLAUDE_CODE_GIT_BASH_PATH", existing_path)

        monkeypatch.setattr(platform, "system", lambda: "Windows")

        env = get_sdk_env_vars()

        assert env["CLAUDE_CODE_GIT_BASH_PATH"] == existing_path
