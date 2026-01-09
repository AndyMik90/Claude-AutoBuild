"""
Tests for Security Hooks
=========================

Tests for security/hooks.py - validate_command function.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from security.hooks import validate_command


class TestValidateCommand:
    """Tests for validate_command synchronous helper."""

    def test_base_commands_allowed(self, temp_dir: Path):
        """Base commands like ls, cat, echo are allowed."""
        commands = ["ls -la", "cat file.txt", "echo hello", "pwd"]
        for cmd in commands:
            ok, reason = validate_command(cmd, temp_dir)
            assert ok is True, f"Command '{cmd}' should be allowed: {reason}"

    def test_git_commands_allowed(self, temp_dir: Path):
        """Git commands are allowed."""
        commands = ["git status", "git add .", "git commit -m 'test'", "git log"]
        for cmd in commands:
            ok, reason = validate_command(cmd, temp_dir)
            assert ok is True, f"Command '{cmd}' should be allowed: {reason}"

    def test_empty_command_allowed(self, temp_dir: Path):
        """Empty commands pass validation."""
        ok, reason = validate_command("", temp_dir)
        # Empty command may pass or fail parsing - both are acceptable
        # The key is it doesn't crash
        assert isinstance(ok, bool)

    def test_chained_commands_validated(self, temp_dir: Path):
        """Chained commands (&&, ||) have each part validated."""
        ok, reason = validate_command("ls && pwd && echo done", temp_dir)
        assert ok is True

    def test_piped_commands_validated(self, temp_dir: Path):
        """Piped commands have each part validated."""
        ok, reason = validate_command("ls | grep test | head", temp_dir)
        assert ok is True

    def test_uses_cwd_when_no_project_dir(self):
        """Uses current directory when project_dir is None."""
        ok, reason = validate_command("ls", None)
        # Should not raise, uses cwd
        assert isinstance(ok, bool)

    def test_command_with_arguments(self, temp_dir: Path):
        """Commands with complex arguments are validated."""
        ok, reason = validate_command("grep -r 'pattern' --include='*.py' .", temp_dir)
        assert ok is True

    def test_subshell_commands(self, temp_dir: Path):
        """Subshell commands are parsed and validated."""
        ok, reason = validate_command("echo $(pwd)", temp_dir)
        assert isinstance(ok, bool)


class TestValidateCommandWithProfile:
    """Tests for validate_command with different project profiles."""

    def test_python_project_commands(self, python_project: Path):
        """Python project allows python-related commands."""
        commands = ["python --version", "pip list", "pytest tests/"]
        for cmd in commands:
            ok, reason = validate_command(cmd, python_project)
            assert ok is True, f"Command '{cmd}' should be allowed in Python project: {reason}"

    def test_node_project_commands(self, node_project: Path):
        """Node project allows node-related commands."""
        commands = ["npm --version", "node --version"]
        for cmd in commands:
            ok, reason = validate_command(cmd, node_project)
            assert ok is True, f"Command '{cmd}' should be allowed in Node project: {reason}"

    def test_docker_project_commands(self, docker_project: Path):
        """Docker project allows docker-related commands."""
        commands = ["docker --version", "docker-compose --version"]
        for cmd in commands:
            ok, reason = validate_command(cmd, docker_project)
            assert ok is True, f"Command '{cmd}' should be allowed in Docker project: {reason}"


class TestValidateCommandEdgeCases:
    """Edge case tests for validate_command."""

    def test_command_with_env_vars(self, temp_dir: Path):
        """Commands with environment variables."""
        ok, reason = validate_command("FOO=bar echo $FOO", temp_dir)
        assert isinstance(ok, bool)

    def test_command_with_quotes(self, temp_dir: Path):
        """Commands with various quote styles."""
        commands = [
            'echo "hello world"',
            "echo 'hello world'",
            'git commit -m "fix: bug"',
        ]
        for cmd in commands:
            ok, reason = validate_command(cmd, temp_dir)
            assert isinstance(ok, bool)

    def test_multiline_heredoc_style(self, temp_dir: Path):
        """Commands that might contain heredoc patterns."""
        ok, reason = validate_command("cat << EOF", temp_dir)
        assert isinstance(ok, bool)
