#!/usr/bin/env python3
"""
WSL Utilities for Auto-Claude Backend
======================================

Provides utilities for running commands in WSL when Auto-Claude is operating
on a project stored in the WSL filesystem.

The frontend (Electron) detects WSL paths and passes these environment variables:
- AUTO_CLAUDE_WSL_MODE: "true" if the project is in WSL filesystem
- AUTO_CLAUDE_WSL_DISTRO: WSL distribution name (e.g., "Ubuntu")
- AUTO_CLAUDE_WSL_PROJECT_PATH: Linux path to the project (e.g., "/home/user/project")

When these are set, git commands should be executed through wsl.exe to ensure
proper operation on the WSL filesystem.
"""

import os
import subprocess
from pathlib import Path


def is_wsl_mode() -> bool:
    """Check if we're operating on a WSL project.

    Returns:
        True if AUTO_CLAUDE_WSL_MODE is set to "true"
    """
    return os.environ.get("AUTO_CLAUDE_WSL_MODE", "").lower() == "true"


def get_wsl_distro() -> str | None:
    """Get the WSL distribution name.

    Returns:
        The distro name (e.g., "Ubuntu") or None if not in WSL mode
    """
    if not is_wsl_mode():
        return None
    return os.environ.get("AUTO_CLAUDE_WSL_DISTRO")


def get_wsl_project_path() -> str | None:
    """Get the Linux path to the project in WSL.

    Returns:
        The Linux path (e.g., "/home/user/project") or None if not in WSL mode
    """
    if not is_wsl_mode():
        return None
    return os.environ.get("AUTO_CLAUDE_WSL_PROJECT_PATH")


def windows_to_wsl_path(windows_path: str | Path, distro: str | None = None) -> str:
    """Convert a Windows WSL UNC path to a Linux path.

    Handles paths like:
    - \\\\wsl$\\Ubuntu\\home\\user -> /home/user
    - \\\\wsl.localhost\\Ubuntu\\home\\user -> /home/user

    Args:
        windows_path: Windows path (possibly a WSL UNC path)
        distro: Optional distro name (not used in conversion, for future use)

    Returns:
        Linux path if it was a WSL path, otherwise the original path
    """
    path_str = str(windows_path)

    # Check for WSL UNC path patterns
    # \\wsl$\Ubuntu\path or \\wsl.localhost\Ubuntu\path
    import re

    pattern = r"^\\\\wsl(?:\$|\.localhost)\\([^\\]+)\\?(.*)$"
    match = re.match(pattern, path_str, re.IGNORECASE)

    if match:
        # Extract the path portion after the distro name
        linux_path = match.group(2)
        # Convert backslashes to forward slashes
        linux_path = linux_path.replace("\\", "/")
        # Ensure it starts with /
        if not linux_path.startswith("/"):
            linux_path = "/" + linux_path
        return linux_path

    # Not a WSL path, return as-is
    return path_str


def translate_cwd_for_wsl(cwd: str | Path | None) -> str | None:
    """Translate a working directory for WSL execution.

    If in WSL mode and cwd is provided:
    - If cwd is a Windows WSL UNC path, convert it to Linux path
    - If cwd is the same as the project path, use the WSL project path

    Args:
        cwd: Working directory (Windows path)

    Returns:
        Linux path suitable for WSL execution, or None
    """
    if cwd is None:
        return None

    cwd_str = str(cwd)

    # If it's already a Linux-style path, return as-is
    if cwd_str.startswith("/"):
        return cwd_str

    # Try to convert WSL UNC path
    linux_path = windows_to_wsl_path(cwd_str)

    # If conversion succeeded (path changed), return it
    if linux_path != cwd_str:
        return linux_path

    # If the path couldn't be converted (not a WSL UNC path), return None
    # Don't fall back to project path as that could cause commands to run
    # in an unintended directory
    return None


def run_in_wsl(
    command: str,
    args: list[str],
    cwd: str | Path | None = None,
    timeout: int = 60,
    input_data: str | None = None,
) -> subprocess.CompletedProcess:
    """Run a command in WSL.

    Args:
        command: The command to run (e.g., "git")
        args: Command arguments
        cwd: Working directory (will be translated to Linux path)
        timeout: Command timeout in seconds
        input_data: Optional string data to pass to stdin

    Returns:
        CompletedProcess with command results
    """
    distro = get_wsl_distro()
    if not distro:
        raise RuntimeError("WSL distro not configured (AUTO_CLAUDE_WSL_DISTRO not set)")

    # Build wsl.exe command
    wsl_args = ["-d", distro]

    # Add working directory if provided
    linux_cwd = translate_cwd_for_wsl(cwd)
    if linux_cwd:
        wsl_args.extend(["--cd", linux_cwd])

    # Add the actual command and its arguments
    wsl_args.append(command)
    wsl_args.extend(args)

    try:
        return subprocess.run(
            ["wsl.exe"] + wsl_args,
            input=input_data,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(
            args=["wsl.exe"] + wsl_args,
            returncode=-1,
            stdout="",
            stderr=f"Command timed out after {timeout} seconds",
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(
            args=["wsl.exe"] + wsl_args,
            returncode=-1,
            stdout="",
            stderr="wsl.exe not found. Ensure WSL is installed.",
        )


def run_git_wsl(
    args: list[str],
    cwd: str | Path | None = None,
    timeout: int = 60,
    input_data: str | None = None,
) -> subprocess.CompletedProcess:
    """Run a git command, using WSL if in WSL mode.

    This is a convenience wrapper that automatically detects WSL mode
    and runs git through wsl.exe when needed.

    Args:
        args: Git command arguments (without 'git' prefix)
        cwd: Working directory
        timeout: Command timeout in seconds
        input_data: Optional string data to pass to stdin

    Returns:
        CompletedProcess with command results
    """
    if is_wsl_mode():
        return run_in_wsl("git", args, cwd=cwd, timeout=timeout, input_data=input_data)

    # Not in WSL mode - use regular git
    # Import here to avoid circular dependency
    from core.git_executable import get_git_executable

    git = get_git_executable()
    try:
        return subprocess.run(
            [git] + args,
            cwd=cwd,
            input=input_data,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(
            args=[git] + args,
            returncode=-1,
            stdout="",
            stderr=f"Command timed out after {timeout} seconds",
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(
            args=[git] + args,
            returncode=-1,
            stdout="",
            stderr="Git executable not found. Please ensure git is installed and in PATH.",
        )
