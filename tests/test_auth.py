#!/usr/bin/env python3
"""
Tests for core/auth module.

Tests authentication token management and SDK environment variable handling,
including the PYTHONPATH isolation fix for ACS-251.
"""

import platform
from unittest.mock import patch

from core.auth import get_sdk_env_vars


class TestGetSdkEnvVars:
    """Tests for get_sdk_env_vars() function."""

    def test_pythonpath_is_always_set_in_result(self, monkeypatch):
        """
        PYTHONPATH should always be present in result, even when empty.

        When no SDK env vars are set, PYTHONPATH is still explicitly set to
        empty string to override any inherited value from the parent process.
        """
        # Clear all SDK env vars
        for var in [
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_MODEL",
            "NO_PROXY",
            "DISABLE_TELEMETRY",
        ]:
            monkeypatch.delenv(var, raising=False)

        result = get_sdk_env_vars()

        # PYTHONPATH should always be present, even if empty
        assert "PYTHONPATH" in result
        assert result["PYTHONPATH"] == ""

    def test_includes_anthropic_base_url_when_set(self, monkeypatch):
        """Should include ANTHROPIC_BASE_URL when set."""
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://api.example.com")

        result = get_sdk_env_vars()

        assert result.get("ANTHROPIC_BASE_URL") == "https://api.example.com"

    def test_includes_anthropic_auth_token_when_set(self, monkeypatch):
        """Should include ANTHROPIC_AUTH_TOKEN when set."""
        monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "sk-test-token")

        result = get_sdk_env_vars()

        assert result.get("ANTHROPIC_AUTH_TOKEN") == "sk-test-token"

    def test_pythonpath_isolation_from_parent_process(self, monkeypatch):
        """
        Test ACS-251 fix: PYTHONPATH from parent process should be overridden.

        This ensures that Auto-Claude's PYTHONPATH (which may point to Python 3.12
        packages) doesn't pollute agent subprocess environments, preventing
        failures when working on external projects with different Python versions.
        """
        # Simulate parent process having a PYTHONPATH set
        monkeypatch.setenv(
            "PYTHONPATH",
            "/path/to/auto-claude/backend:/path/to/python3.12/site-packages",
        )

        result = get_sdk_env_vars()

        # PYTHONPATH should be explicitly overridden to empty string
        # This prevents the SDK from inheriting the parent's PYTHONPATH
        assert "PYTHONPATH" in result
        assert result["PYTHONPATH"] == ""

    def test_skips_empty_env_vars(self, monkeypatch):
        """Should not include env vars with empty values."""
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "")
        monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "")

        result = get_sdk_env_vars()

        # Empty vars should not be in result (except PYTHONPATH which is explicitly set)
        assert "ANTHROPIC_BASE_URL" not in result
        assert "ANTHROPIC_AUTH_TOKEN" not in result
        # PYTHONPATH should still be present as explicit override
        assert result["PYTHONPATH"] == ""

    def test_on_windows_auto_detects_git_bash_path(self, monkeypatch):
        """On Windows, should auto-detect git-bash path if not set."""
        # Mock platform.system to simulate Windows for cross-platform testing
        with patch.object(platform, "system", return_value="Windows"):
            # Mock _find_git_bash_path to return a path
            with patch(
                "core.auth._find_git_bash_path",
                return_value="C:/Program Files/Git/bin/bash.exe",
            ):
                monkeypatch.delenv("CLAUDE_CODE_GIT_BASH_PATH", raising=False)

                result = get_sdk_env_vars()

                assert (
                    result.get("CLAUDE_CODE_GIT_BASH_PATH")
                    == "C:/Program Files/Git/bin/bash.exe"
                )

    def test_preserves_existing_git_bash_path_on_windows(self, monkeypatch):
        """On Windows, should preserve existing CLAUDE_CODE_GIT_BASH_PATH."""
        # Mock platform.system to simulate Windows for cross-platform testing
        with patch.object(platform, "system", return_value="Windows"):
            monkeypatch.setenv("CLAUDE_CODE_GIT_BASH_PATH", "C:/Custom/bash.exe")

            result = get_sdk_env_vars()

            assert result.get("CLAUDE_CODE_GIT_BASH_PATH") == "C:/Custom/bash.exe"

    def test_on_non_windows_git_bash_not_added(self, monkeypatch):
        """On non-Windows platforms, CLAUDE_CODE_GIT_BASH_PATH should not be auto-added."""
        # Mock platform.system to simulate Linux for cross-platform testing
        # When platform is not Windows, _find_git_bash_path is never called
        with patch.object(platform, "system", return_value="Linux"):
            monkeypatch.delenv("CLAUDE_CODE_GIT_BASH_PATH", raising=False)

            result = get_sdk_env_vars()

            # Should not have CLAUDE_CODE_GIT_BASH_PATH
            assert "CLAUDE_CODE_GIT_BASH_PATH" not in result
