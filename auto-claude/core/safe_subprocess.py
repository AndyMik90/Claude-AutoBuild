"""
Safe Subprocess Utilities
=========================

Provides secure subprocess execution with:
- Timeout enforcement
- Output capture with size limits
- Security guards against dangerous commands
- Cross-platform compatibility

Usage:
    from core.safe_subprocess import safe_run, safe_run_capture

    # Run command with timeout
    result = safe_run(["git", "status"], timeout=30)

    # Capture output
    stdout, stderr, returncode = safe_run_capture(["python", "--version"])
"""

from __future__ import annotations

import logging
import subprocess
import shlex
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)

# Maximum output size to capture (1MB)
MAX_OUTPUT_SIZE = 1024 * 1024

# Default timeout in seconds
DEFAULT_TIMEOUT = 60

# Commands that should never be executed
BLOCKED_COMMANDS = frozenset([
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=/dev/zero",
    "dd if=/dev/random",
    ":(){:|:&};:",  # Fork bomb
    "chmod -R 777 /",
    "chown -R",
])

# Dangerous command prefixes
DANGEROUS_PREFIXES = (
    "sudo ",
    "su ",
    "doas ",
)


class SubprocessError(Exception):
    """Base exception for subprocess errors."""
    pass


class CommandBlockedError(SubprocessError):
    """Raised when a command is blocked for security reasons."""
    pass


class TimeoutError(SubprocessError):
    """Raised when a command times out."""
    pass


def is_command_safe(command: str | Sequence[str]) -> tuple[bool, str]:
    """
    Check if a command is safe to execute.

    Args:
        command: Command string or sequence

    Returns:
        Tuple of (is_safe, reason)
    """
    if isinstance(command, str):
        cmd_str = command
    else:
        cmd_str = " ".join(str(c) for c in command)

    cmd_lower = cmd_str.lower().strip()

    # Check blocked commands
    for blocked in BLOCKED_COMMANDS:
        if blocked in cmd_lower:
            return False, f"Command contains blocked pattern: {blocked}"

    # Check dangerous prefixes
    for prefix in DANGEROUS_PREFIXES:
        if cmd_lower.startswith(prefix):
            return False, f"Command starts with dangerous prefix: {prefix}"

    return True, ""


def safe_run(
    command: Sequence[str],
    cwd: Path | str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    check: bool = False,
    env: dict | None = None,
) -> subprocess.CompletedProcess:
    """
    Run a command safely with timeout and security checks.

    Args:
        command: Command and arguments as a sequence
        cwd: Working directory
        timeout: Maximum execution time in seconds
        check: If True, raise on non-zero exit code
        env: Environment variables (None = inherit)

    Returns:
        CompletedProcess instance

    Raises:
        CommandBlockedError: If command is blocked for security
        TimeoutError: If command exceeds timeout
        subprocess.CalledProcessError: If check=True and command fails
    """
    # Security check
    is_safe, reason = is_command_safe(command)
    if not is_safe:
        raise CommandBlockedError(reason)

    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            timeout=timeout,
            capture_output=True,
            text=True,
            env=env,
        )

        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode,
                command,
                result.stdout,
                result.stderr,
            )

        return result

    except subprocess.TimeoutExpired as e:
        logger.warning(f"Command timed out after {timeout}s: {command}")
        raise TimeoutError(f"Command timed out after {timeout}s") from e


def safe_run_capture(
    command: Sequence[str],
    cwd: Path | str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    max_output: int = MAX_OUTPUT_SIZE,
    env: dict | None = None,
) -> tuple[str, str, int]:
    """
    Run a command and capture output with size limits.

    Args:
        command: Command and arguments as a sequence
        cwd: Working directory
        timeout: Maximum execution time in seconds
        max_output: Maximum output size to capture
        env: Environment variables (None = inherit)

    Returns:
        Tuple of (stdout, stderr, returncode)

    Raises:
        CommandBlockedError: If command is blocked for security
        TimeoutError: If command exceeds timeout
    """
    result = safe_run(command, cwd=cwd, timeout=timeout, env=env)

    stdout = result.stdout[:max_output] if result.stdout else ""
    stderr = result.stderr[:max_output] if result.stderr else ""

    if result.stdout and len(result.stdout) > max_output:
        stdout += f"\n... (truncated, {len(result.stdout) - max_output} bytes omitted)"

    if result.stderr and len(result.stderr) > max_output:
        stderr += f"\n... (truncated, {len(result.stderr) - max_output} bytes omitted)"

    return stdout, stderr, result.returncode


def safe_shell(
    command: str,
    cwd: Path | str | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    check: bool = False,
    env: dict | None = None,
) -> subprocess.CompletedProcess:
    """
    Run a shell command safely.

    This is less secure than safe_run() as it uses shell=True.
    Prefer safe_run() when possible.

    Args:
        command: Shell command string
        cwd: Working directory
        timeout: Maximum execution time in seconds
        check: If True, raise on non-zero exit code
        env: Environment variables (None = inherit)

    Returns:
        CompletedProcess instance

    Raises:
        CommandBlockedError: If command is blocked for security
        TimeoutError: If command exceeds timeout
    """
    # Security check
    is_safe, reason = is_command_safe(command)
    if not is_safe:
        raise CommandBlockedError(reason)

    logger.debug(f"Running shell command: {command}")

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            timeout=timeout,
            capture_output=True,
            text=True,
            env=env,
        )

        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode,
                command,
                result.stdout,
                result.stderr,
            )

        return result

    except subprocess.TimeoutExpired as e:
        logger.warning(f"Shell command timed out after {timeout}s: {command}")
        raise TimeoutError(f"Command timed out after {timeout}s") from e


def quote_command(command: Sequence[str]) -> str:
    """
    Quote a command sequence for safe shell execution.

    Args:
        command: Command and arguments

    Returns:
        Shell-safe quoted string
    """
    return " ".join(shlex.quote(str(arg)) for arg in command)
