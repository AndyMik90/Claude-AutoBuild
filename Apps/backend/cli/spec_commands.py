"""
Spec Commands
=============

CLI commands for managing specs (listing, finding, etc.)
"""

import sys
from pathlib import Path

# Ensure parent directory is in path for imports (before other imports)
_PARENT_DIR = Path(__file__).parent.parent
if str(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_DIR))

from progress import count_subtasks
from workspace import get_existing_build_worktree

from .utils import get_specs_dir


def list_specs(project_dir: Path, dev_mode: bool = False) -> list[dict]:
    """
    List all specs in the project.

    Args:
        project_dir: Project root directory
        dev_mode: If True, use dev/auto-claude/specs/

    Returns:
        List of spec info dicts with keys: number, name, path, status, progress
    """
    specs_dir = get_specs_dir(project_dir, dev_mode)
    specs = []

    if not specs_dir.exists():
        return specs

    for spec_folder in sorted(specs_dir.iterdir()):
        if not spec_folder.is_dir():
            continue

        # Parse folder name (e.g., "001-initial-app")
        folder_name = spec_folder.name
        parts = folder_name.split("-", 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue

        number = parts[0]
        name = parts[1]

        # Check for spec.md
        spec_file = spec_folder / "spec.md"
        if not spec_file.exists():
            continue

        # Check for existing build in worktree
        has_build = get_existing_build_worktree(project_dir, folder_name) is not None

        # Check progress via implementation_plan.json
        plan_file = spec_folder / "implementation_plan.json"
        if plan_file.exists():
            completed, total = count_subtasks(spec_folder)
            if total > 0:
                if completed == total:
                    status = "complete"
                else:
                    status = "in_progress"
                progress = f"{completed}/{total}"
            else:
                status = "initialized"
                progress = "0/0"
        else:
            status = "pending"
            progress = "-"

        # Add build indicator
        if has_build:
            status = f"{status} (has build)"

        specs.append(
            {
                "number": number,
                "name": name,
                "folder": folder_name,
                "path": spec_folder,
                "status": status,
                "progress": progress,
                "has_build": has_build,
            }
        )

    return specs


def print_specs_list(project_dir: Path, dev_mode: bool = False) -> None:
    """Print a formatted list of all specs."""
    specs = list_specs(project_dir, dev_mode)

    if not specs:
        print("\nNo specs found.")
        print("\nCreate your first spec:")
        print("  claude /spec")
        return

    print("\n" + "=" * 70)
    print("  AVAILABLE SPECS")
    print("=" * 70)
    print()

    # Status symbols
    status_symbols = {
        "complete": "[OK]",
        "in_progress": "[..]",
        "initialized": "[--]",
        "pending": "[  ]",
    }

    for spec in specs:
        # Get base status for symbol
        base_status = spec["status"].split(" ")[0]
        symbol = status_symbols.get(base_status, "[??]")

        print(f"  {symbol} {spec['folder']}")
        status_line = f"       Status: {spec['status']} | Subtasks: {spec['progress']}"
        print(status_line)
        print()

    print("-" * 70)
    print("\nTo run a spec:")
    print("  python auto-claude/run.py --spec 001")
    print("  python auto-claude/run.py --spec 001-feature-name")
    print()
