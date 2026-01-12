#!/usr/bin/env python3
"""
JSON Recovery Utility
=====================

Detects and repairs corrupted JSON files in specs directories.

Usage:
    python -m cli.recovery --project-dir /path/to/project --detect
    python -m cli.recovery --project-dir /path/to/project --spec-id 004-feature --delete
    python -m cli.recovery --project-dir /path/to/project --all --delete
"""

import argparse
import json
import sys
import uuid
from pathlib import Path

from cli.utils import find_specs_dir


def check_json_file(filepath: Path) -> tuple[bool, str | None]:
    """
    Check if a JSON file is valid.

    Returns:
        (is_valid, error_message)
    """
    try:
        with open(filepath, encoding="utf-8") as f:
            json.load(f)
        return True, None
    except json.JSONDecodeError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


def detect_corrupted_files(specs_dir: Path) -> list[tuple[Path, str]]:
    """
    Scan specs directory recursively for corrupted JSON files.

    Returns:
        List of (filepath, error_message) tuples
    """
    corrupted = []

    if not specs_dir.exists():
        return corrupted

    # Recursively scan for JSON files (includes nested files like memory/*.json)
    for json_file in specs_dir.rglob("*.json"):
        is_valid, error = check_json_file(json_file)
        if not is_valid:
            # Type narrowing: error is str when is_valid is False
            assert error is not None
            corrupted.append((json_file, error))

    return corrupted


def backup_corrupted_file(filepath: Path) -> bool:
    """
    Backup a corrupted file by renaming it with a .corrupted suffix.

    Args:
        filepath: Path to the corrupted file

    Returns:
        True if backed up successfully, False otherwise
    """
    try:
        # Create backup before deleting
        base_backup_path = filepath.with_suffix(f"{filepath.suffix}.corrupted")
        backup_path = base_backup_path

        # Handle existing backup files by generating unique name with UUID
        if backup_path.exists():
            # Use UUID for unique naming to avoid races
            unique_suffix = uuid.uuid4().hex[:8]
            backup_path = filepath.with_suffix(
                f"{filepath.suffix}.corrupted.{unique_suffix}"
            )

        filepath.rename(backup_path)
        print(f"  [BACKUP] Moved corrupted file to: {backup_path}")
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to backup file: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detect and repair corrupted JSON files in specs directories"
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        help="Specs directory path (overrides auto-detection)",
    )
    parser.add_argument(
        "--detect",
        action="store_true",
        help="Detect corrupted JSON files",
    )
    parser.add_argument(
        "--spec-id",
        type=str,
        help="Specific spec ID to fix (e.g., 004-feature)",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Delete corrupted files (creates .corrupted backup)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Fix all corrupted files (requires --delete)",
    )

    args = parser.parse_args()

    # Validate --all requires --delete
    if args.all and not args.delete:
        parser.error("--all requires --delete")

    # Find specs directory
    if args.specs_dir:
        specs_dir = args.specs_dir
    else:
        specs_dir = find_specs_dir(args.project_dir)

    print(f"[INFO] Scanning specs directory: {specs_dir}")

    # Default to detect mode if no flags provided
    if not args.detect and not args.delete:
        args.detect = True

    # Detect corrupted files (dry-run when detect-only, otherwise for deletion)
    corrupted = detect_corrupted_files(specs_dir)

    # Detect-only mode: show results and exit
    if args.detect and not args.delete:
        if not corrupted:
            print("[OK] No corrupted JSON files found")
            sys.exit(0)

        print(f"\n[FOUND] {len(corrupted)} corrupted file(s):\n")
        for filepath, error in corrupted:
            print(f"  - {filepath.relative_to(specs_dir.parent)}")
            print(f"    Error: {error}")
        print()
        # Exit with error code when corrupted files are found
        sys.exit(1)

    # Delete corrupted files
    if args.delete:
        if args.spec_id:
            # Delete specific spec
            spec_dir = (specs_dir / args.spec_id).resolve()
            specs_dir_resolved = specs_dir.resolve()
            # Validate path doesn't escape specs directory
            if not spec_dir.is_relative_to(specs_dir_resolved):
                print("[ERROR] Invalid spec ID: path traversal detected")
                sys.exit(1)

            if not spec_dir.exists():
                print(f"[ERROR] Spec directory not found: {spec_dir}")
                sys.exit(1)

            print(f"[INFO] Processing spec: {args.spec_id}")
            has_failures = False
            for json_file in spec_dir.rglob("*.json"):
                is_valid, error = check_json_file(json_file)
                if not is_valid:
                    print(f"  [CORRUPTED] {json_file.name}")
                    if not backup_corrupted_file(json_file):
                        has_failures = True

            if has_failures:
                sys.exit(1)

        elif args.all:
            # Delete all corrupted files
            # Use the already-detected corrupted list, or re-scan if needed
            if not corrupted:
                corrupted = detect_corrupted_files(specs_dir)
            if not corrupted:
                print("[OK] No corrupted files to delete")
                sys.exit(0)

            print(f"\n[INFO] Backing up {len(corrupted)} corrupted file(s):\n")
            has_failures = False
            for filepath, _ in corrupted:
                # backup_corrupted_file prints its own [BACKUP] message
                if not backup_corrupted_file(filepath):
                    has_failures = True

            if has_failures:
                sys.exit(1)

        else:
            print("[ERROR] Must specify --spec-id or --all with --delete")
            sys.exit(1)


if __name__ == "__main__":
    main()
