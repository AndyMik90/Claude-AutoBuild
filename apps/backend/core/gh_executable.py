#!/usr/bin/env python3
"""
GitHub CLI (gh) Executable Finder
==================================

Utility to find the gh executable, with platform-specific fallbacks.
Similar to git_executable.py but for GitHub CLI.

When running from Electron, the PATH may not include common installation
locations like /opt/homebrew/bin on macOS. This module handles detection.
"""

import os
import shutil
import subprocess
from pathlib import Path

_cached_gh_path: str | None = None


def get_gh_executable() -> str:
    """Find the gh executable, with platform-specific fallbacks.

    Returns the path to gh executable. Checks multiple sources:
    1. CLAUDE_CODE_GH_PATH env var (set by Electron frontend)
    2. shutil.which (if gh is in PATH)
    3. Common installation locations (Homebrew on macOS, Program Files on Windows)
    4. Platform-specific 'which'/'where' commands

    Caches the result after first successful find.
    """
    global _cached_gh_path

    # Return cached result if available
    if _cached_gh_path is not None:
        return _cached_gh_path

    gh_path = _find_gh_executable()
    _cached_gh_path = gh_path
    return gh_path


def _find_gh_executable() -> str:
    """Internal function to find gh executable."""
    # 1. Check CLAUDE_CODE_GH_PATH (can be set by Electron frontend)
    gh_env_path = os.environ.get("CLAUDE_CODE_GH_PATH")
    if gh_env_path:
        try:
            if os.path.isfile(gh_env_path):
                return gh_env_path
        except OSError:
            pass  # Invalid path or permission error - try next method

    # 2. Try shutil.which (works if gh is in PATH)
    gh_path = shutil.which("gh")
    if gh_path:
        return gh_path

    # 3. macOS: check Homebrew installation locations
    if os.name == "posix" and os.uname().sysname == "Darwin":
        homebrew_paths = [
            "/opt/homebrew/bin/gh",  # Apple Silicon
            "/usr/local/bin/gh",  # Intel Mac
        ]
        for path in homebrew_paths:
            try:
                if os.path.isfile(path):
                    return path
            except OSError:
                continue

    # 4. Linux: check common installation locations
    if os.name == "posix" and os.uname().sysname == "Linux":
        linux_paths = [
            "/usr/bin/gh",
            "/usr/local/bin/gh",
            os.path.expanduser("~/.local/bin/gh"),
        ]
        for path in linux_paths:
            try:
                if os.path.isfile(path):
                    return path
            except OSError:
                continue

    # 5. Windows-specific: check common installation locations
    if os.name == "nt":
        common_paths = [
            os.path.expandvars(r"%PROGRAMFILES%\GitHub CLI\gh.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\GitHub CLI\gh.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe"),
            r"C:\Program Files\GitHub CLI\gh.exe",
            r"C:\Program Files (x86)\GitHub CLI\gh.exe",
        ]
        for path in common_paths:
            try:
                if os.path.isfile(path):
                    return path
            except OSError:
                continue

        # Try 'where' command with shell=True
        try:
            result = subprocess.run(
                "where gh",
                capture_output=True,
                text=True,
                timeout=5,
                shell=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                found_path = result.stdout.strip().split("\n")[0].strip()
                if found_path and os.path.isfile(found_path):
                    return found_path
        except (subprocess.TimeoutExpired, OSError):
            pass  # 'where' command failed - fall through to default

    # Default fallback - let subprocess handle it (may fail)
    return "gh"


def run_gh(
    args: list[str],
    cwd: Path | str | None = None,
    timeout: int = 120,
    input_data: str | None = None,
) -> subprocess.CompletedProcess:
    """Run a gh command with proper executable finding.

    Args:
        args: gh command arguments (without 'gh' prefix)
        cwd: Working directory for the command
        timeout: Command timeout in seconds (default: 120 for network ops)
        input_data: Optional string data to pass to stdin

    Returns:
        CompletedProcess with command results.

    Raises:
        FileNotFoundError: If gh executable cannot be found.
    """
    gh = get_gh_executable()
    return subprocess.run(
        [gh] + args,
        cwd=cwd,
        input=input_data,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
