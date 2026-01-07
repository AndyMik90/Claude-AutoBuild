"""
Security Profile Management
============================

Manages security profiles for projects, including caching and validation.
Uses project_analyzer to create dynamic security profiles based on detected stacks.
"""

from pathlib import Path

from project_analyzer import (
    SecurityProfile,
    get_or_create_profile,
)

from .constants import ALLOWLIST_FILENAME, PROFILE_FILENAME

# =============================================================================
# GLOBAL STATE
# =============================================================================

# Cache the security profile to avoid re-analyzing on every command
_cached_profile: SecurityProfile | None = None
_cached_project_dir: Path | None = None
_cached_spec_dir: Path | None = None  # Track spec directory for cache key
_cached_profile_mtime: float | None = None  # Track file modification time
_cached_allowlist_mtime: float | None = None  # Track allowlist modification time


def _get_profile_path(project_dir: Path) -> Path:
    """Get the security profile file path for a project."""
    return project_dir / PROFILE_FILENAME


def _get_allowlist_path(project_dir: Path) -> Path:
    """Get the allowlist file path for a project."""
    return project_dir / ALLOWLIST_FILENAME


def _get_profile_mtime(project_dir: Path) -> float | None:
    """Get the modification time of the security profile file, or None if not exists."""
    profile_path = _get_profile_path(project_dir)
    try:
        return profile_path.stat().st_mtime
    except OSError:
        return None


def _get_allowlist_mtime(project_dir: Path) -> float | None:
    """Get the modification time of the allowlist file, or None if not exists."""
    allowlist_path = _get_allowlist_path(project_dir)
    try:
        return allowlist_path.stat().st_mtime
    except OSError:
        return None


def get_security_profile(
    project_dir: Path, spec_dir: Path | None = None
) -> SecurityProfile:
    """
    Get the security profile for a project, using cache when possible.

    The cache is invalidated when:
    - The project directory changes
    - The security profile file is created (was None, now exists)
    - The security profile file is modified (mtime changed)
    - The allowlist file is created, modified, or deleted

    Args:
        project_dir: Project root directory
        spec_dir: Optional spec directory

    Returns:
        SecurityProfile for the project
    """
    global _cached_profile
    global _cached_project_dir
    global _cached_spec_dir
    global _cached_profile_mtime
    global _cached_allowlist_mtime

    project_dir = Path(project_dir).resolve()
    resolved_spec_dir = Path(spec_dir).resolve() if spec_dir else None

    # Check if cache is valid (both project_dir and spec_dir must match)
    if (
        _cached_profile is not None
        and _cached_project_dir == project_dir
        and _cached_spec_dir == resolved_spec_dir
    ):
        # Check if files have been created or modified since caching
        current_profile_mtime = _get_profile_mtime(project_dir)
        current_allowlist_mtime = _get_allowlist_mtime(project_dir)

        # Cache is valid if both mtimes are unchanged
        if (
            current_profile_mtime == _cached_profile_mtime
            and current_allowlist_mtime == _cached_allowlist_mtime
        ):
            return _cached_profile

        # File was created, modified, or deleted - invalidate cache
        # (This happens when analyzer creates the file after agent starts,
        # or when user adds/updates the allowlist)

    # Analyze and cache
    _cached_profile = get_or_create_profile(project_dir, spec_dir)
    _cached_project_dir = project_dir
    _cached_spec_dir = resolved_spec_dir
    _cached_profile_mtime = _get_profile_mtime(project_dir)
    _cached_allowlist_mtime = _get_allowlist_mtime(project_dir)

    return _cached_profile


def reset_profile_cache() -> None:
    """Reset the cached profile (useful for testing or re-analysis)."""
    global _cached_profile
    global _cached_project_dir
    global _cached_spec_dir
    global _cached_profile_mtime
    global _cached_allowlist_mtime
    _cached_profile = None
    _cached_project_dir = None
    _cached_spec_dir = None
    _cached_profile_mtime = None
    _cached_allowlist_mtime = None
