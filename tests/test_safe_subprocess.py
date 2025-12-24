"""Tests for safe_subprocess module."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import pytest

from auto_claude.core.safe_subprocess import (
    safe_run,
    safe_run_capture,
    safe_shell,
    is_command_safe,
    quote_command,
    CommandBlockedError,
    TimeoutError,
)


class TestIsCommandSafe:
    """Tests for is_command_safe function."""

    def test_safe_commands(self) -> None:
        """Test that normal commands are allowed."""
        safe_commands = [
            ["git", "status"],
            ["python", "--version"],
            ["echo", "hello"],
            ["ls", "-la"],
        ]

        for cmd in safe_commands:
            is_safe, reason = is_command_safe(cmd)
            assert is_safe, f"Command {cmd} should be safe, got: {reason}"

    def test_blocked_rm_rf_root(self) -> None:
        """Test that rm -rf / is blocked."""
        is_safe, reason = is_command_safe(["rm", "-rf", "/"])
        assert not is_safe
        assert "blocked" in reason.lower()

    def test_blocked_fork_bomb(self) -> None:
        """Test that fork bomb is blocked."""
        is_safe, reason = is_command_safe(":(){:|:&};:")
        assert not is_safe

    def test_blocked_sudo(self) -> None:
        """Test that sudo commands are blocked."""
        is_safe, reason = is_command_safe("sudo rm -rf /tmp")
        assert not is_safe
        assert "sudo" in reason.lower()

    def test_string_command(self) -> None:
        """Test with string command."""
        is_safe, _ = is_command_safe("echo hello")
        assert is_safe


class TestSafeRun:
    """Tests for safe_run function."""

    def test_simple_command(self) -> None:
        """Test running a simple command."""
        result = safe_run([sys.executable, "--version"])

        assert result.returncode == 0
        assert "Python" in result.stdout or "Python" in result.stderr

    def test_command_with_output(self) -> None:
        """Test capturing command output."""
        result = safe_run([sys.executable, "-c", "print('hello')"])

        assert result.returncode == 0
        assert "hello" in result.stdout

    def test_command_failure(self) -> None:
        """Test command that fails."""
        result = safe_run([sys.executable, "-c", "exit(1)"])

        assert result.returncode == 1

    def test_check_raises_on_failure(self) -> None:
        """Test that check=True raises on failure."""
        with pytest.raises(subprocess.CalledProcessError):
            safe_run([sys.executable, "-c", "exit(1)"], check=True)

    def test_blocked_command_raises(self) -> None:
        """Test that blocked commands raise CommandBlockedError."""
        with pytest.raises(CommandBlockedError):
            safe_run(["sudo", "rm", "-rf", "/tmp"])

    def test_timeout(self) -> None:
        """Test command timeout."""
        with pytest.raises(TimeoutError):
            safe_run(
                [sys.executable, "-c", "import time; time.sleep(10)"],
                timeout=1,
            )

    def test_working_directory(self, tmp_path: Path) -> None:
        """Test running command in specific directory."""
        result = safe_run(
            [sys.executable, "-c", "import os; print(os.getcwd())"],
            cwd=tmp_path,
        )

        assert str(tmp_path) in result.stdout


class TestSafeRunCapture:
    """Tests for safe_run_capture function."""

    def test_captures_stdout(self) -> None:
        """Test capturing stdout."""
        stdout, stderr, returncode = safe_run_capture(
            [sys.executable, "-c", "print('hello stdout')"]
        )

        assert returncode == 0
        assert "hello stdout" in stdout

    def test_captures_stderr(self) -> None:
        """Test capturing stderr."""
        stdout, stderr, returncode = safe_run_capture(
            [sys.executable, "-c", "import sys; sys.stderr.write('hello stderr')"]
        )

        assert "hello stderr" in stderr

    def test_truncates_large_output(self) -> None:
        """Test that large output is truncated."""
        # Generate output larger than max_output
        code = "print('x' * 2000)"
        stdout, stderr, returncode = safe_run_capture(
            [sys.executable, "-c", code],
            max_output=100,
        )

        assert len(stdout) < 200  # Should be truncated
        assert "truncated" in stdout.lower()


class TestSafeShell:
    """Tests for safe_shell function."""

    def test_shell_command(self) -> None:
        """Test running shell command."""
        result = safe_shell("echo hello")

        assert result.returncode == 0
        assert "hello" in result.stdout

    def test_shell_with_pipe(self) -> None:
        """Test shell command with pipe."""
        result = safe_shell("echo hello | cat")

        assert result.returncode == 0
        assert "hello" in result.stdout

    def test_blocked_shell_command(self) -> None:
        """Test that blocked shell commands raise."""
        with pytest.raises(CommandBlockedError):
            safe_shell("sudo rm -rf /")


class TestQuoteCommand:
    """Tests for quote_command function."""

    def test_simple_command(self) -> None:
        """Test quoting simple command."""
        result = quote_command(["echo", "hello"])
        assert result == "echo hello"

    def test_command_with_spaces(self) -> None:
        """Test quoting command with spaces in arguments."""
        result = quote_command(["echo", "hello world"])
        assert "hello world" in result or "'hello world'" in result

    def test_command_with_special_chars(self) -> None:
        """Test quoting command with special characters."""
        result = quote_command(["echo", "hello;world"])
        # Should be quoted to prevent shell interpretation
        assert "'" in result or '"' in result or "\\" in result
