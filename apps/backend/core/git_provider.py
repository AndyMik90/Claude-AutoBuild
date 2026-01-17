"""
Git Provider Detection
======================

Auto-detect git provider from remote URL and provide provider-specific operations.
"""

from __future__ import annotations

import subprocess
from enum import Enum
from pathlib import Path


class GitProvider(str, Enum):
    """Git provider types."""

    GITHUB = "github"
    GITLAB = "gitlab"
    AUTO_DETECT = "auto"  # Special value for auto-detection


def detect_provider_from_remote(project_dir: Path) -> GitProvider:
    """
    Detect git provider by parsing remote.origin.url.

    Args:
        project_dir: Project directory path

    Returns:
        GitProvider.GITHUB or GitProvider.GITLAB
        Defaults to GitProvider.GITHUB if cannot detect
    """
    try:
        result = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            return GitProvider.GITHUB  # Default fallback

        remote_url = result.stdout.strip().lower()

        # GitLab detection patterns
        if any(
            pattern in remote_url
            for pattern in [
                "gitlab.com",
                "gitlab:",
                "/gitlab/",
                "@gitlab.",
                "//gitlab.",  # https://gitlab.mycompany.com
                ":gitlab.",  # git@gitlab.mycompany.com
            ]
        ):
            return GitProvider.GITLAB

        # GitHub detection patterns (default)
        return GitProvider.GITHUB

    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.CalledProcessError):
        return GitProvider.GITHUB  # Fail-safe default


def get_provider_config(project_dir: Path, provider_setting: str | None) -> GitProvider:
    """
    Get final provider choice using fallback chain:
    1. Explicit project setting (if not "auto")
    2. Auto-detection from git remote
    3. Default to GitHub

    Args:
        project_dir: Project directory path
        provider_setting: User's choice from settings ("auto", "github", "gitlab", or None)

    Returns:
        GitProvider enum value (never returns AUTO_DETECT)
    """
    # Normalize provider setting to lowercase for case-insensitive comparison
    normalized_setting = provider_setting.lower() if provider_setting else None

    # If user explicitly chose a provider (not auto), use it
    if normalized_setting and normalized_setting != "auto":
        try:
            return GitProvider(normalized_setting)
        except ValueError:
            pass  # Invalid value, fall through to auto-detect

    # Auto-detect or fallback
    return detect_provider_from_remote(project_dir)
