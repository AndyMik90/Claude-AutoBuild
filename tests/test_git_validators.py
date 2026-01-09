"""
Tests for Git Validators
=========================

Tests for security/git_validators.py - git commit secret scanning validation.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from security.git_validators import validate_git_commit


class TestValidateGitCommit:
    """Tests for validate_git_commit function."""

    def test_non_git_command_allowed(self):
        """Non-git commands pass through."""
        ok, msg = validate_git_commit("ls -la")
        assert ok is True
        assert msg == ""

    def test_empty_command_allowed(self):
        """Empty command passes through."""
        ok, msg = validate_git_commit("")
        assert ok is True

    def test_git_add_allowed(self):
        """git add commands pass through (not commit)."""
        ok, msg = validate_git_commit("git add .")
        assert ok is True
        assert msg == ""

    def test_git_push_allowed(self):
        """git push commands pass through."""
        ok, msg = validate_git_commit("git push origin main")
        assert ok is True
        assert msg == ""

    def test_git_status_allowed(self):
        """git status commands pass through."""
        ok, msg = validate_git_commit("git status")
        assert ok is True

    def test_git_diff_allowed(self):
        """git diff commands pass through."""
        ok, msg = validate_git_commit("git diff HEAD")
        assert ok is True

    def test_invalid_shlex_parsing(self):
        """Invalid shell syntax returns error."""
        ok, msg = validate_git_commit("git commit -m 'unclosed quote")
        assert ok is False
        assert "parse" in msg.lower()

    def test_git_commit_no_staged_files(self):
        """git commit with no staged files passes (scanner handles it)."""
        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=[])
        mock_scanner.scan_files = MagicMock(return_value=[])
        mock_scanner.mask_secret = MagicMock(return_value="***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit -m 'test'")
            assert ok is True

    def test_git_commit_no_secrets(self):
        """git commit with no secrets detected passes."""
        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=["file.py"])
        mock_scanner.scan_files = MagicMock(return_value=[])
        mock_scanner.mask_secret = MagicMock(return_value="***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit -m 'test'")
            assert ok is True

    def test_git_commit_with_secrets_blocked(self):
        """git commit with secrets detected is blocked."""
        mock_match = MagicMock()
        mock_match.file_path = "config.py"
        mock_match.line_number = 10
        mock_match.pattern_name = "API Key"
        mock_match.matched_text = "sk-abc123456789"

        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=["config.py"])
        mock_scanner.scan_files = MagicMock(return_value=[mock_match])
        mock_scanner.mask_secret = MagicMock(return_value="sk-abc***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit -m 'test'")

            assert ok is False
            assert "SECRETS DETECTED" in msg
            assert "config.py" in msg
            assert "API Key" in msg

    def test_git_commit_scanner_not_available(self):
        """git commit passes if scanner module not available."""
        # When ImportError occurs for scan_secrets, commit should be allowed
        with patch.dict("sys.modules", {"scan_secrets": None}):
            # Force reimport to trigger ImportError path
            ok, msg = validate_git_commit("git commit -m 'test'")
            # Should allow commit when scanner unavailable
            assert ok is True

    def test_git_commit_amend_also_checked(self):
        """git commit --amend is also validated."""
        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=[])
        mock_scanner.scan_files = MagicMock(return_value=[])
        mock_scanner.mask_secret = MagicMock(return_value="***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit --amend")
            assert ok is True

    def test_not_git_command_starts_with_git(self):
        """Commands starting with 'git' but not git pass through."""
        ok, msg = validate_git_commit("github-cli pr list")
        assert ok is True


class TestSecretDetectionMessages:
    """Tests for secret detection error message formatting."""

    def test_message_includes_action_required(self):
        """Error message includes actionable instructions."""
        mock_match = MagicMock()
        mock_match.file_path = "app.py"
        mock_match.line_number = 5
        mock_match.pattern_name = "AWS Secret Key"
        mock_match.matched_text = "AKIAIOSFODNN7EXAMPLE"

        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=["app.py"])
        mock_scanner.scan_files = MagicMock(return_value=[mock_match])
        mock_scanner.mask_secret = MagicMock(return_value="AKIA***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit -m 'test'")

            assert "ACTION REQUIRED" in msg
            assert "environment variables" in msg
            assert ".env" in msg

    def test_message_includes_false_positive_hint(self):
        """Error message includes false positive handling hint."""
        mock_match = MagicMock()
        mock_match.file_path = "test.py"
        mock_match.line_number = 1
        mock_match.pattern_name = "Generic Secret"
        mock_match.matched_text = "test_secret_123"

        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=["test.py"])
        mock_scanner.scan_files = MagicMock(return_value=[mock_match])
        mock_scanner.mask_secret = MagicMock(return_value="test***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit -m 'test'")

            assert "FALSE POSITIVE" in msg
            assert ".secretsignore" in msg

    def test_multiple_files_with_secrets(self):
        """Multiple files with secrets are all reported."""
        match1 = MagicMock()
        match1.file_path = "config.py"
        match1.line_number = 10
        match1.pattern_name = "API Key"
        match1.matched_text = "key1"

        match2 = MagicMock()
        match2.file_path = "settings.py"
        match2.line_number = 20
        match2.pattern_name = "Password"
        match2.matched_text = "pass1"

        mock_scanner = MagicMock()
        mock_scanner.get_staged_files = MagicMock(return_value=["config.py", "settings.py"])
        mock_scanner.scan_files = MagicMock(return_value=[match1, match2])
        mock_scanner.mask_secret = MagicMock(return_value="***")

        with patch.dict("sys.modules", {"scan_secrets": mock_scanner}):
            ok, msg = validate_git_commit("git commit -m 'test'")

            assert "config.py" in msg
            assert "settings.py" in msg
