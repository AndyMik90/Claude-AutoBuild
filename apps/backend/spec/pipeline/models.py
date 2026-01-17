"""
Pipeline Models and Utilities
==============================

Data structures, helper functions, and utilities for the spec creation pipeline.
"""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path
from typing import TYPE_CHECKING

from init import init_auto_claude_dir
from task_logger import update_task_logger_path
from ui import Icons, highlight, muted, print_status

if TYPE_CHECKING:
    from core.workspace.models import SpecNumberLock


def get_specs_dir(project_dir: Path) -> Path:
    """Get the specs directory path.

    IMPORTANT: Only .auto-claude/ is considered an "installed" auto-claude.
    The auto-claude/ folder (if it exists) is SOURCE CODE being developed,
    not an installation. This allows Auto Claude to be used to develop itself.

    This function also ensures .auto-claude is added to .gitignore on first use.

    Args:
        project_dir: The project root directory

    Returns:
        Path to the specs directory within .auto-claude/
    """
    # Initialize .auto-claude directory and ensure it's in .gitignore
    init_auto_claude_dir(project_dir)

    # Return the specs directory path
    return project_dir / ".auto-claude" / "specs"


def cleanup_orphaned_pending_folders(specs_dir: Path) -> None:
    """Remove orphaned pending folders that have no substantial content.

    Args:
        specs_dir: The specs directory to clean up
    """
    if not specs_dir.exists():
        return

    orphaned = []
    for folder in specs_dir.glob("[0-9][0-9][0-9]-pending"):
        if not folder.is_dir():
            continue

        # Check if folder has substantial content
        requirements_file = folder / "requirements.json"
        spec_file = folder / "spec.md"
        plan_file = folder / "implementation_plan.json"

        if requirements_file.exists() or spec_file.exists() or plan_file.exists():
            continue

        # Check folder age - only clean up folders older than 10 minutes
        try:
            folder_mtime = datetime.fromtimestamp(folder.stat().st_mtime)
            if datetime.now() - folder_mtime < timedelta(minutes=10):
                continue
        except OSError:
            # Can't get folder modification time - skip to avoid false positives
            continue

        orphaned.append(folder)

    # Clean up orphaned folders
    for folder in orphaned:
        try:
            shutil.rmtree(folder)
        except OSError:
            # Ignore cleanup errors - folder may have been deleted or is in use
            pass


def find_existing_spec_for_task(
    specs_dir: Path, task_description: str, similarity_threshold: float = 0.7
) -> list[dict]:
    """Find existing specs that might be for the same feature/task.

    Uses both name matching and task_description comparison from requirements.json.

    Args:
        specs_dir: The specs directory to search
        task_description: The task description to match against
        similarity_threshold: Minimum similarity ratio (0.0 to 1.0) to consider a match

    Returns:
        List of dicts with 'path', 'name', 'similarity', 'status', 'task_description'
    """
    if not specs_dir.exists() or not task_description:
        return []

    matches = []
    task_lower = task_description.lower().strip()

    # Generate expected name from task description for comparison
    expected_name = generate_spec_name(task_description)

    for folder in sorted(specs_dir.glob("[0-9][0-9][0-9]-*")):
        if not folder.is_dir():
            continue

        folder_name = folder.name
        # Extract name part (after the number prefix)
        name_part = folder_name[4:] if len(folder_name) > 4 else folder_name

        # Skip pure "pending" folders that have no content
        if name_part == "pending":
            # Check if it has any useful content
            has_content = (
                (folder / "requirements.json").exists()
                or (folder / "spec.md").exists()
                or (folder / "implementation_plan.json").exists()
            )
            if not has_content:
                continue

        # Calculate name similarity
        name_similarity = SequenceMatcher(None, expected_name, name_part).ratio()

        # Also check task_description in requirements.json if it exists
        existing_task = ""
        requirements_file = folder / "requirements.json"
        if requirements_file.exists():
            try:
                with open(requirements_file, encoding="utf-8") as f:
                    req = json.load(f)
                    existing_task = req.get("task_description", "").lower().strip()
            except (json.JSONDecodeError, OSError):
                # Skip if requirements.json is malformed or unreadable - use empty task
                pass

        # Calculate task description similarity
        task_similarity = 0.0
        if existing_task:
            task_similarity = SequenceMatcher(None, task_lower, existing_task).ratio()

        # Use the higher of the two similarities
        best_similarity = max(name_similarity, task_similarity)

        if best_similarity >= similarity_threshold:
            # Determine status
            status = _get_spec_status(folder)

            matches.append(
                {
                    "path": folder,
                    "name": folder_name,
                    "similarity": best_similarity,
                    "status": status,
                    "task_description": existing_task or name_part,
                }
            )

    # Sort by similarity (highest first)
    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches


def _get_spec_status(spec_dir: Path) -> str:
    """Get the status of a spec directory.

    Args:
        spec_dir: Path to the spec directory

    Returns:
        Status string: 'complete', 'in_progress', 'initialized', 'pending', or 'incomplete'
    """
    spec_file = spec_dir / "spec.md"
    plan_file = spec_dir / "implementation_plan.json"
    requirements_file = spec_dir / "requirements.json"

    if not requirements_file.exists() and not spec_file.exists():
        return "incomplete"

    if not spec_file.exists():
        return "pending"

    if not plan_file.exists():
        return "initialized"

    # Check plan progress
    try:
        with open(plan_file, encoding="utf-8") as f:
            plan = json.load(f)
            tasks = plan.get("tasks", [])
            if not tasks:
                return "initialized"

            completed = sum(
                1
                for t in tasks
                for s in t.get("subtasks", [])
                if s.get("status") == "done"
            )
            total = sum(len(t.get("subtasks", [])) for t in tasks)

            if total > 0 and completed == total:
                return "complete"
            elif completed > 0:
                return "in_progress"
    except (json.JSONDecodeError, OSError):
        # Unable to read plan file - default to initialized status
        pass

    return "initialized"


def prompt_for_existing_spec_action(
    matches: list[dict], task_description: str
) -> tuple[str, Path | None]:
    """Prompt user to choose action when existing specs are found.

    Args:
        matches: List of matching specs from find_existing_spec_for_task
        task_description: The new task description

    Returns:
        Tuple of (action, spec_path) where action is 'reuse', 'overwrite', or 'new'
        and spec_path is the chosen spec (or None for 'new')
    """
    print()
    print_status("Found existing spec(s) that may be for the same task:", "warning")
    print()

    for i, match in enumerate(matches[:5], 1):  # Show top 5 matches
        similarity_pct = int(match["similarity"] * 100)
        status_str = match["status"]
        print(
            f"  [{i}] {highlight(match['name'])} "
            f"({similarity_pct}% match, {status_str})"
        )
        if match.get("task_description"):
            task_preview = match["task_description"][:80]
            if len(match["task_description"]) > 80:
                task_preview += "..."
            print(f"      {muted(task_preview)}")
        print()

    print("  [N] Create NEW spec (ignore existing)")
    print()

    while True:
        try:
            choice = (
                input(
                    "  Choose an option "
                    "(1-5 to select, R to reuse #1, O to overwrite #1, N for new): "
                )
                .strip()
                .upper()
            )
        except (EOFError, KeyboardInterrupt):
            return ("new", None)

        if choice == "N" or choice == "":
            return ("new", None)

        if choice == "R":
            return ("reuse", matches[0]["path"])

        if choice == "O":
            return ("overwrite", matches[0]["path"])

        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(matches[:5]):
                # Ask what to do with this spec
                print()
                print(f"  Selected: {highlight(matches[idx]['name'])}")
                print("  [R] Reuse - continue from where it left off")
                print("  [O] Overwrite - delete and start fresh")
                print("  [C] Cancel - go back")
                print()

                try:
                    action = input("  Action: ").strip().upper()
                except (EOFError, KeyboardInterrupt):
                    # User cancelled - go back to the main selection menu
                    continue

                if action == "R":
                    return ("reuse", matches[idx]["path"])
                elif action == "O":
                    return ("overwrite", matches[idx]["path"])
                # C or anything else = go back
                continue


def cleanup_incomplete_pending_folders(specs_dir: Path, force: bool = False) -> int:
    """Clean up incomplete -pending folders more aggressively.

    This removes:
    - Folders ending in -pending with no substantial content
    - Folders with nested number patterns like 001-001-pending (duplicate retries)

    Args:
        specs_dir: The specs directory to clean up
        force: If True, skip the age check

    Returns:
        Number of folders cleaned up
    """
    if not specs_dir.exists():
        return 0

    cleaned = 0
    # Matches 001-001-, 002-003-, etc.
    nested_pattern = re.compile(r"^(\d{3})-(\d{3})-")

    for folder in list(specs_dir.iterdir()):
        if not folder.is_dir():
            continue

        folder_name = folder.name
        should_clean = False
        reason = ""

        # Check for nested number pattern (duplicate retry bug)
        if nested_pattern.match(folder_name):
            should_clean = True
            reason = "nested number pattern (duplicate retry)"

        # Check for empty or minimal pending folders
        elif folder_name.endswith("-pending") or "-pending-" in folder_name:
            # Check if folder has substantial content
            has_requirements = (folder / "requirements.json").exists()
            has_spec = (folder / "spec.md").exists()
            has_plan = (folder / "implementation_plan.json").exists()

            if not (has_requirements or has_spec or has_plan):
                # No substantial content
                if force:
                    should_clean = True
                    reason = "empty pending folder"
                else:
                    # Check age - only clean up folders older than 5 minutes
                    try:
                        folder_mtime = datetime.fromtimestamp(folder.stat().st_mtime)
                        if datetime.now() - folder_mtime >= timedelta(minutes=5):
                            should_clean = True
                            reason = "stale empty pending folder"
                    except OSError:
                        # Can't get folder mtime - skip cleanup to be safe
                        pass

        if should_clean:
            try:
                shutil.rmtree(folder)
                cleaned += 1
                print_status(f"Cleaned up: {folder_name} ({reason})", "info")
            except OSError as e:
                print_status(f"Failed to clean up {folder_name}: {e}", "warning")

    return cleaned


def create_spec_dir(specs_dir: Path, lock: SpecNumberLock | None = None) -> Path:
    """Create a new spec directory with incremented number and placeholder name.

    Args:
        specs_dir: The parent specs directory
        lock: Optional SpecNumberLock for coordinated numbering across worktrees.
              If provided, uses global scan to prevent spec number collisions.
              If None, uses local scan only (legacy behavior for single process).

    Returns:
        Path to the new spec directory
    """
    if lock is not None:
        # Use global coordination via lock - scans main project + all worktrees
        next_num = lock.get_next_spec_number()
    else:
        # Legacy local scan (fallback for cases without lock)
        existing = list(specs_dir.glob("[0-9][0-9][0-9]-*"))

        if existing:
            # Find the HIGHEST folder number
            numbers = []
            for folder in existing:
                try:
                    num = int(folder.name[:3])
                    numbers.append(num)
                except ValueError:
                    # Folder name doesn't start with a number - skip
                    pass
            next_num = max(numbers) + 1 if numbers else 1
        else:
            next_num = 1

    # Start with placeholder - will be renamed after requirements gathering
    name = "pending"
    return specs_dir / f"{next_num:03d}-{name}"


def generate_spec_name(task_description: str) -> str:
    """Generate a clean kebab-case name from task description.

    Args:
        task_description: The task description to convert

    Returns:
        A kebab-case name suitable for a directory
    """
    skip_words = {
        "a",
        "an",
        "the",
        "to",
        "for",
        "of",
        "in",
        "on",
        "at",
        "by",
        "with",
        "and",
        "or",
        "but",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
        "this",
        "that",
        "these",
        "those",
        "i",
        "you",
        "we",
        "they",
        "it",
        "add",
        "create",
        "make",
        "implement",
        "build",
        "new",
        "using",
        "use",
        "via",
        "from",
    }

    # Clean and tokenize
    text = task_description.lower()
    text = "".join(c if c.isalnum() or c == " " else " " for c in text)
    words = text.split()

    # Filter out skip words and short words
    meaningful = [w for w in words if w not in skip_words and len(w) > 2]

    # Take first 4 meaningful words
    name_parts = meaningful[:4]

    if not name_parts:
        name_parts = words[:4]

    return "-".join(name_parts) if name_parts else "spec"


def rename_spec_dir_from_requirements(spec_dir: Path) -> bool:
    """Rename spec directory based on requirements.json task description.

    Args:
        spec_dir: The current spec directory

    Returns:
        Tuple of (success, new_spec_dir). If success is False, new_spec_dir is the original.
    """
    requirements_file = spec_dir / "requirements.json"

    if not requirements_file.exists():
        return False

    try:
        with open(requirements_file, encoding="utf-8") as f:
            req = json.load(f)

        task_desc = req.get("task_description", "")
        if not task_desc:
            return False

        # Generate new name
        new_name = generate_spec_name(task_desc)

        # Extract the number prefix from current dir
        current_name = spec_dir.name
        if current_name[:3].isdigit():
            prefix = current_name[:4]  # "001-"
        else:
            prefix = ""

        new_dir_name = f"{prefix}{new_name}"
        new_spec_dir = spec_dir.parent / new_dir_name

        # Don't rename if it's already a good name (not "pending")
        if "pending" not in current_name:
            return True

        # Don't rename if target already exists
        if new_spec_dir.exists():
            return True

        # Rename the directory
        shutil.move(str(spec_dir), str(new_spec_dir))

        # Update the global task logger to use the new path
        update_task_logger_path(new_spec_dir)

        print_status(f"Spec folder: {highlight(new_dir_name)}", "success")
        return True

    except (json.JSONDecodeError, OSError) as e:
        print_status(f"Could not rename spec folder: {e}", "warning")
        return False


# Phase display configuration
PHASE_DISPLAY: dict[str, tuple[str, str]] = {
    "discovery": ("PROJECT DISCOVERY", Icons.FOLDER),
    "historical_context": ("HISTORICAL CONTEXT", Icons.SEARCH),
    "requirements": ("REQUIREMENTS GATHERING", Icons.FILE),
    "complexity_assessment": ("COMPLEXITY ASSESSMENT", Icons.GEAR),
    "research": ("INTEGRATION RESEARCH", Icons.SEARCH),
    "context": ("CONTEXT DISCOVERY", Icons.FOLDER),
    "quick_spec": ("QUICK SPEC", Icons.LIGHTNING),
    "spec_writing": ("SPEC DOCUMENT CREATION", Icons.FILE),
    "self_critique": ("SPEC SELF-CRITIQUE", Icons.GEAR),
    "planning": ("IMPLEMENTATION PLANNING", Icons.SUBTASK),
    "validation": ("FINAL VALIDATION", Icons.SUCCESS),
}
