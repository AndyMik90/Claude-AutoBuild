#!/usr/bin/env python3
"""
Git Executable Finder
======================

Utility to find the git executable, with Windows-specific fallbacks.
Separated into its own module to avoid circular imports.
"""

import os
import shutil
import subprocess
from pathlib import Path

_cached_git_path: str | None = None


def get_git_executable() -> str:
    """Find the git executable, with Windows-specific fallbacks.

    Returns the path to git executable. On Windows, checks multiple sources:
    1. CLAUDE_CODE_GIT_BASH_PATH env var (set by Electron frontend)
    2. shutil.which (if git is in PATH)
    3. Common installation locations
    4. Windows 'where' command

    Caches the result after first successful find.
    """
    global _cached_git_path

    # Return cached result if available
    if _cached_git_path is not None:
        return _cached_git_path

    git_path = _find_git_executable()
    _cached_git_path = git_path
    return git_path


def _find_git_executable() -> str:
    """Internal function to find git executable."""
    # 1. Check CLAUDE_CODE_GIT_BASH_PATH (set by Electron frontend)
    # This env var points to bash.exe, we can derive git.exe from it
    bash_path = os.environ.get("CLAUDE_CODE_GIT_BASH_PATH")
    if bash_path:
        try:
            bash_path_obj = Path(bash_path)
            if bash_path_obj.exists():
                git_dir = bash_path_obj.parent.parent
                # Try cmd/git.exe first (preferred), then bin/git.exe
                for git_subpath in ["cmd/git.exe", "bin/git.exe"]:
                    git_path = git_dir / git_subpath
                    if git_path.is_file():
                        return str(git_path)
        except (OSError, ValueError):
            pass

    # 2. Try shutil.which (works if git is in PATH)
    git_path = shutil.which("git")
    if git_path:
        return git_path

    # 3. Windows-specific: check common installation locations
    if os.name == "nt":
        common_paths = [
            os.path.expandvars(r"%PROGRAMFILES%\Git\cmd\git.exe"),
            os.path.expandvars(r"%PROGRAMFILES%\Git\bin\git.exe"),
            os.path.expandvars(r"%PROGRAMFILES(X86)%\Git\cmd\git.exe"),
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\cmd\git.exe"),
            r"C:\Program Files\Git\cmd\git.exe",
            r"C:\Program Files (x86)\Git\cmd\git.exe",
        ]
        for path in common_paths:
            try:
                if os.path.isfile(path):
                    return path
            except OSError:
                continue

        # 4. Try 'where' command with shell=True (more reliable on Windows)
        try:
            result = subprocess.run(
                "where git",
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
            pass

    # Default fallback - let subprocess handle it (may fail)
    return "git"


def run_git(
    args: list[str],
    cwd: Path | str | None = None,
    timeout: int = 60,
    input_data: str | None = None,
) -> subprocess.CompletedProcess:
    """Run a git command with proper executable finding.

    Args:
        args: Git command arguments (without 'git' prefix)
        cwd: Working directory for the command
        timeout: Command timeout in seconds (default: 60)
        input_data: Optional string data to pass to stdin

    Returns:
        CompletedProcess with command results.
    """
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
