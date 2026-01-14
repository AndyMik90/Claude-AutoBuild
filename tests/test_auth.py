"""
Tests for core/auth module.

Tests authentication token management and SDK environment variable handling,
including the PYTHONPATH isolation fix for ACS-251.
"""

import os
import pytest

# Set up path for imports
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "apps" / "backend"
sys.path.insert(0, str(backend_path))


class TestGetSdkEnvVars:
    """Tests for get_sdk_env_vars() function."""

    def test_returns_empty_dict_when_no_env_vars_set(self, monkeypatch):
        """Should return empty dict when no SDK env vars are set."""
        # Clear all SDK env vars
        for var in [
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_MODEL",
            "NO_PROXY",
            "DISABLE_TELEMETRY",
        ]:
            monkeypatch.delenv(var, raising=False)

        from core.auth import get_sdk_env_vars

        result = get_sdk_env_vars()

        # Should have PYTHONPATH explicitly set to empty string
        assert result.get("PYTHONPATH") == ""

    def test_includes_anthropic_base_url_when_set(self, monkeypatch):
        """Should include ANTHROPIC_BASE_URL when set."""
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://api.example.com")

        from core.auth import get_sdk_env_vars

        result = get_sdk_env_vars()

        assert result.get("ANTHROPIC_BASE_URL") == "https://api.example.com"

    def test_includes_anthropic_auth_token_when_set(self, monkeypatch):
        """Should include ANTHROPIC_AUTH_TOKEN when set."""
        monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "sk-test-token")

        from core.auth import get_sdk_env_vars

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
        monkeypatch.setenv("PYTHONPATH", "/path/to/auto-claude/backend:/path/to/python3.12/site-packages")

        from core.auth import get_sdk_env_vars

        result = get_sdk_env_vars()

        # PYTHONPATH should be explicitly overridden to empty string
        # This prevents the SDK from inheriting the parent's PYTHONPATH
        assert "PYTHONPATH" in result
        assert result["PYTHONPATH"] == ""

    def test_empty_pythonpath_overrides_parent_value(self, monkeypatch):
        """
        Empty PYTHONPATH string should override parent's value.

        The SDK merges os.environ with the provided env dict using
        {**os.environ, **user_env}, so our explicit PYTHONPATH=""
        should override any inherited value.
        """
        monkeypatch.setenv("PYTHONPATH", "/some/random/path")

        from core.auth import get_sdk_env_vars

        result = get_sdk_env_vars()

        # Empty string ensures Python doesn't add extra paths to sys.path
        assert result["PYTHONPATH"] == ""

    def test_skips_empty_env_vars(self, monkeypatch):
        """Should not include env vars with empty values."""
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "")
        monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "")

        from core.auth import get_sdk_env_vars

        result = get_sdk_env_vars()

        # Empty vars should not be in result (except PYTHONPATH which is explicitly set)
        assert "ANTHROPIC_BASE_URL" not in result
        assert "ANTHROPIC_AUTH_TOKEN" not in result
        # PYTHONPATH should still be present as explicit override
        assert result["PYTHONPATH"] == ""

    def test_on_windows_auto_detects_git_bash_path(self, monkeypatch):
        """On Windows, should auto-detect git-bash path if not set."""
        # This test is platform-specific
        import platform

        if platform.system() != "Windows":
            pytest.skip("This test only runs on Windows")

        # Mock _find_git_bash_path to return a path
        from unittest.mock import patch

        with patch("core.auth._find_git_bash_path", return_value="C:/Program Files/Git/bin/bash.exe"):
            monkeypatch.delenv("CLAUDE_CODE_GIT_BASH_PATH", raising=False)

            from core.auth import get_sdk_env_vars

            result = get_sdk_env_vars()

            assert result.get("CLAUDE_CODE_GIT_BASH_PATH") == "C:/Program Files/Git/bin/bash.exe"

    def test_preserves_existing_git_bash_path_on_windows(self, monkeypatch):
        """On Windows, should preserve existing CLAUDE_CODE_GIT_BASH_PATH."""
        import platform

        if platform.system() != "Windows":
            pytest.skip("This test only runs on Windows")

        monkeypatch.setenv("CLAUDE_CODE_GIT_BASH_PATH", "C:/Custom/bash.exe")

        from core.auth import get_sdk_env_vars

        result = get_sdk_env_vars()

        assert result.get("CLAUDE_CODE_GIT_BASH_PATH") == "C:/Custom/bash.exe"
