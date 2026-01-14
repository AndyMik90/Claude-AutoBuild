#!/usr/bin/env python3
"""
GitHub CLI Executable Finder
============================

Utility to find the gh (GitHub CLI) executable, with platform-specific fallbacks.
"""

import os
import shutil
import subprocess

_cached_gh_path: str | None = None


def invalidate_gh_cache() -> None:
    """Invalidate the cached gh executable path.

    Useful when gh may have been uninstalled, updated, or when
    GITHUB_CLI_PATH environment variable has changed.
    """
    global _cached_gh_path
    _cached_gh_path = None


def _verify_gh_executable(path: str) -> bool:
    """Verify that a path is a valid gh executable by checking version.

    Args:
        path: Path to the potential gh executable

    Returns:
        True if the path points to a valid gh executable, False otherwise
    """
    try:
        result = subprocess.run(
            [path, "--version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


def _run_where_command(command: str) -> str | None:
    """Run a Windows 'where' command and return the first result.

    Args:
        command: The command to run (e.g., "where gh")

    Returns:
        First path found, or None if command failed
    """
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=5,
            shell=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            found_path = result.stdout.strip().split("\n")[0].strip()
            if found_path and os.path.isfile(found_path):
                return found_path
    except (subprocess.TimeoutExpired, OSError):
        pass
    return None


def get_gh_executable() -> str | None:
    """Find the gh executable, with platform-specific fallbacks.

    Returns the path to gh executable, or None if not found.

    Priority order:
    1. GITHUB_CLI_PATH env var (user-configured path from frontend)
    2. shutil.which (if gh is in PATH)
    3. Homebrew paths on macOS
    4. Windows Program Files paths
    5. Windows 'where' command

    Caches the result after first successful find. Use invalidate_gh_cache()
    to force re-detection (e.g., after gh installation/uninstallation).
    """
    global _cached_gh_path

    # Return cached result if available
    if _cached_gh_path is not None:
        return _cached_gh_path

    _cached_gh_path = _find_gh_executable()
    return _cached_gh_path


def _find_gh_executable() -> str | None:
    """Internal function to find gh executable."""
    # 1. Check GITHUB_CLI_PATH env var (set by Electron frontend)
    env_path = os.environ.get("GITHUB_CLI_PATH")
    if env_path and os.path.isfile(env_path) and _verify_gh_executable(env_path):
        return env_path

    # 2. Try shutil.which (works if gh is in PATH)
    gh_path = shutil.which("gh")
    if gh_path and _verify_gh_executable(gh_path):
        return gh_path

    # 3. macOS-specific: check Homebrew paths
    if os.name != "nt":  # Unix-like systems (macOS, Linux)
        homebrew_paths = [
            "/opt/homebrew/bin/gh",  # Apple Silicon
            "/usr/local/bin/gh",  # Intel Mac
            "/home/linuxbrew/.linuxbrew/bin/gh",  # Linux Homebrew
        ]
        for path in homebrew_paths:
            if os.path.isfile(path) and _verify_gh_executable(path):
                return path

    # 4. Windows-specific: check Program Files paths
    if os.name == "nt":
        windows_paths = [
            os.path.expandvars(r"%PROGRAMFILES%\GitHub CLI\gh.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\GitHub CLI\gh.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe"),
            r"C:\Program Files\GitHub CLI\gh.exe",
            r"C:\Program Files (x86)\GitHub CLI\gh.exe",
        ]
        for path in windows_paths:
            if os.path.isfile(path) and _verify_gh_executable(path):
                return path

        # 5. Try 'where' command with shell=True (more reliable on Windows)
        return _run_where_command("where gh")

    return None
