"""
Maestro Migration Utilities
============================

Handles migration from .auto-claude to .maestro directory structure.
"""

import shutil
from pathlib import Path
from typing import Optional


def migrate_auto_claude_to_maestro(project_path: Path) -> bool:
    """
    Migrate .auto-claude directory to .maestro.

    Args:
        project_path: Path to the project root directory

    Returns:
        True if migration occurred, False otherwise

    Raises:
        OSError: If migration fails due to filesystem errors
    """
    old_dir = project_path / ".auto-claude"
    new_dir = project_path / ".maestro"

    # No migration needed
    if not old_dir.exists():
        return False

    # Already migrated
    if new_dir.exists():
        return False

    # Perform migration
    try:
        shutil.move(str(old_dir), str(new_dir))
        print(f"Migrated {old_dir} → {new_dir}")
        return True
    except (OSError, shutil.Error) as e:
        print(f"Migration failed: {e}")
        raise


def check_migration_needed(project_path: Path) -> bool:
    """
    Check if project needs migration from .auto-claude to .maestro.

    Args:
        project_path: Path to the project root directory

    Returns:
        True if migration is needed, False otherwise
    """
    old_dir = project_path / ".auto-claude"
    new_dir = project_path / ".maestro"

    # Migration needed if old dir exists and new doesn't
    return old_dir.exists() and not new_dir.exists()


def migrate_security_file(project_path: Path) -> bool:
    """
    Migrate .auto-claude-security.json to .maestro-security.json.

    Args:
        project_path: Path to the project root directory

    Returns:
        True if migration occurred, False otherwise
    """
    old_file = project_path / ".auto-claude-security.json"
    new_file = project_path / ".maestro-security.json"

    if not old_file.exists():
        return False

    if new_file.exists():
        return False

    try:
        shutil.copy2(str(old_file), str(new_file))
        old_file.unlink()  # Remove old file after successful copy
        print(f"Migrated {old_file} → {new_file}")
        return True
    except (OSError, shutil.Error) as e:
        print(f"Security file migration failed: {e}")
        raise


def migrate_status_file(project_path: Path) -> bool:
    """
    Migrate .auto-claude-status to .maestro-status.

    Args:
        project_path: Path to the project root directory

    Returns:
        True if migration occurred, False otherwise
    """
    old_file = project_path / ".auto-claude-status"
    new_file = project_path / ".maestro-status"

    if not old_file.exists():
        return False

    if new_file.exists():
        return False

    try:
        shutil.copy2(str(old_file), str(new_file))
        old_file.unlink()
        print(f"Migrated {old_file} → {new_file}")
        return True
    except (OSError, shutil.Error) as e:
        print(f"Status file migration failed: {e}")
        raise


def migrate_all(project_path: Path) -> dict[str, bool]:
    """
    Perform all necessary migrations for a project.

    Args:
        project_path: Path to the project root directory

    Returns:
        Dictionary with migration results:
        {
            "directory": bool,  # True if .auto-claude → .maestro migrated
            "security": bool,   # True if security file migrated
            "status": bool      # True if status file migrated
        }
    """
    results = {
        "directory": migrate_auto_claude_to_maestro(project_path),
        "security": migrate_security_file(project_path),
        "status": migrate_status_file(project_path),
    }

    migrated_count = sum(1 for v in results.values() if v)
    if migrated_count > 0:
        print(f"Migration complete: {migrated_count} item(s) migrated")
    else:
        print("No migration needed (already on .maestro)")

    return results
