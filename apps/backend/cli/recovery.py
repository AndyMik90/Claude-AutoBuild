#!/usr/bin/env python3
"""
JSON Recovery Utility
=====================

Detects and repairs corrupted JSON files in specs directories.

Usage:
    python -m cli.recovery --project-dir /path/to/project --detect
    python -m cli.recovery --project-dir /path/to/project --fix
    python -m cli.recovery --project-dir /path/to/project --spec-id 004-feature --delete
"""

import argparse
import json
import sys
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
    Scan specs directory for corrupted JSON files.

    Returns:
        List of (filepath, error_message) tuples
    """
    corrupted = []

    if not specs_dir.exists():
        return corrupted

    for spec_dir in specs_dir.iterdir():
        if not spec_dir.is_dir():
            continue

        # Check all JSON files in spec directory
        for json_file in spec_dir.glob("*.json"):
            is_valid, error = check_json_file(json_file)
            if not is_valid:
                corrupted.append((json_file, error))

    return corrupted


def delete_corrupted_file(filepath: Path) -> bool:
    """
    Delete a corrupted file.

    Returns:
        True if deleted, False otherwise
    """
    try:
        # Create backup before deleting
        backup_path = filepath.with_suffix(f"{filepath.suffix}.corrupted")
        filepath.rename(backup_path)
        print(f"  [BACKUP] Moved corrupted file to: {backup_path}")
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to delete file: {e}")
        return False


def main():
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

    # Find specs directory
    if args.specs_dir:
        specs_dir = args.specs_dir
    else:
        specs_dir = find_specs_dir(args.project_dir)

    print(f"[INFO] Scanning specs directory: {specs_dir}")

    # Detect corrupted files
    if args.detect or not args.delete:
        corrupted = detect_corrupted_files(specs_dir)

        if not corrupted:
            print("[OK] No corrupted JSON files found")
            sys.exit(0)

        print(f"\n[FOUND] {len(corrupted)} corrupted file(s):\n")
        for filepath, error in corrupted:
            print(f"  - {filepath.relative_to(specs_dir.parent)}")
            print(f"    Error: {error[:100]}...")
        print()

    # Delete corrupted files
    if args.delete:
        if args.spec_id:
            # Delete specific spec
            spec_dir = specs_dir / args.spec_id
            if not spec_dir.exists():
                print(f"[ERROR] Spec directory not found: {spec_dir}")
                sys.exit(1)

            print(f"[INFO] Processing spec: {args.spec_id}")
            for json_file in spec_dir.glob("*.json"):
                is_valid, error = check_json_file(json_file)
                if not is_valid:
                    print(f"  [CORRUPTED] {json_file.name}")
                    delete_corrupted_file(json_file)

        elif args.all:
            # Delete all corrupted files
            corrupted = detect_corrupted_files(specs_dir)
            if not corrupted:
                print("[OK] No corrupted files to delete")
                sys.exit(0)

            print(f"\n[INFO] Deleting {len(corrupted)} corrupted file(s):\n")
            for filepath, _ in corrupted:
                print(f"  [DELETE] {filepath.relative_to(specs_dir.parent)}")
                delete_corrupted_file(filepath)

        else:
            print("[ERROR] Must specify --spec-id or --all with --delete")
            sys.exit(1)


if __name__ == "__main__":
    main()
