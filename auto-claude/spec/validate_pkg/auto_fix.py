"""
Auto-Fix Utilities
==================

Automated fixes for common implementation plan issues.
"""

import json
from pathlib import Path


def auto_fix_plan(spec_dir: Path) -> bool:
    """Attempt to auto-fix common implementation_plan.json issues.

    Args:
        spec_dir: Path to the spec directory

    Returns:
        True if fixes were applied, False otherwise
    """
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return False

    try:
        with open(plan_file) as f:
            plan = json.load(f)
    except json.JSONDecodeError:
        return False

    fixed = False

    # Fix missing top-level fields
    if "feature" not in plan:
        plan["feature"] = "Unnamed Feature"
        fixed = True

    if "workflow_type" not in plan:
        plan["workflow_type"] = "feature"
        fixed = True

    if "phases" not in plan:
        plan["phases"] = []
        fixed = True

    # Fix phases
    for i, phase in enumerate(plan.get("phases", [])):
        if "phase" not in phase:
            phase["phase"] = i + 1
            fixed = True

        if "name" not in phase:
            phase["name"] = f"Phase {i + 1}"
            fixed = True

        if "subtasks" not in phase:
            phase["subtasks"] = []
            fixed = True

        # Fix subtasks
        for j, subtask in enumerate(phase.get("subtasks", [])):
            if "id" not in subtask:
                subtask["id"] = f"subtask-{i + 1}-{j + 1}"
                fixed = True

            if "description" not in subtask:
                subtask["description"] = "No description"
                fixed = True

            if "status" not in subtask:
                subtask["status"] = "pending"
                fixed = True

    if fixed:
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        print(f"Auto-fixed: {plan_file}")

    return fixed
