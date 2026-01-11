"""
Auto-Fix Utilities
==================

Automated fixes for common implementation plan issues.
"""

import json
from pathlib import Path


def _normalize_status(value: object) -> str:
    """Normalize common status variants to schema-compliant values."""
    if not isinstance(value, str):
        return "pending"

    normalized = value.strip().lower()
    if normalized in {"pending", "in_progress", "completed", "blocked", "failed"}:
        return normalized

    # Common non-standard variants produced by LLMs or legacy tooling
    if normalized in {"not_started", "not started", "todo", "to_do", "backlog"}:
        return "pending"
    if normalized in {"in-progress", "inprogress", "working"}:
        return "in_progress"
    if normalized in {"done", "complete", "completed_successfully"}:
        return "completed"

    # Unknown values fall back to pending to prevent deadlocks in execution
    return "pending"


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
        with open(plan_file, encoding="utf-8") as f:
            plan = json.load(f)
    except json.JSONDecodeError:
        return False

    fixed = False

    # Support older/simple plans that use top-level "subtasks" (or "chunks")
    if "phases" not in plan and (
        isinstance(plan.get("subtasks"), list) or isinstance(plan.get("chunks"), list)
    ):
        subtasks = plan.get("subtasks", plan.get("chunks", [])) or []
        plan["phases"] = [
            {
                "phase": 1,
                "name": "Phase 1",
                "subtasks": subtasks,
            }
        ]
        plan.pop("subtasks", None)
        plan.pop("chunks", None)
        fixed = True

    # Fix missing top-level fields
    if "feature" not in plan:
        plan["feature"] = plan.get("title") or plan.get("spec_id") or "Unnamed Feature"
        fixed = True

    if "workflow_type" not in plan:
        plan["workflow_type"] = "feature"
        fixed = True

    if "phases" not in plan:
        plan["phases"] = []
        fixed = True

    # Fix phases
    for i, phase in enumerate(plan.get("phases", [])):
        # Normalize common phase field aliases
        if "name" not in phase and "title" in phase:
            phase["name"] = phase.get("title")
            fixed = True

        if "id" not in phase and "phase" not in phase and "phase_id" in phase:
            phase_id = phase.get("phase_id")
            if isinstance(phase_id, (int, float)):
                phase["phase"] = int(phase_id)
            elif isinstance(phase_id, str) and phase_id.strip().isdigit():
                phase["phase"] = int(phase_id.strip())
            else:
                phase["id"] = str(phase_id)
            fixed = True

        if "phase" not in phase:
            phase["phase"] = i + 1
            fixed = True

        if "name" not in phase:
            phase["name"] = f"Phase {i + 1}"
            fixed = True

        if "subtasks" not in phase:
            phase["subtasks"] = phase.get("chunks", [])
            fixed = True
        elif "chunks" in phase and not phase.get("subtasks"):
            # If subtasks exists but is empty, fall back to chunks if present
            phase["subtasks"] = phase.get("chunks", [])
            fixed = True

        # Fix subtasks
        for j, subtask in enumerate(phase.get("subtasks", [])):
            # Normalize common subtask field aliases
            if "id" not in subtask and "subtask_id" in subtask:
                subtask["id"] = str(subtask.get("subtask_id"))
                fixed = True

            if (
                ("description" not in subtask or not subtask.get("description"))
                and "title" in subtask
                and subtask.get("title")
            ):
                subtask["description"] = subtask.get("title")
                fixed = True

            if "id" not in subtask:
                subtask["id"] = f"subtask-{i + 1}-{j + 1}"
                fixed = True

            if "description" not in subtask:
                subtask["description"] = "No description"
                fixed = True

            if "status" not in subtask:
                subtask["status"] = "pending"
                fixed = True
            else:
                normalized_status = _normalize_status(subtask.get("status"))
                if subtask.get("status") != normalized_status:
                    subtask["status"] = normalized_status
                    fixed = True

    if fixed:
        with open(plan_file, "w", encoding="utf-8") as f:
            json.dump(plan, f, indent=2, ensure_ascii=False)
        print(f"Auto-fixed: {plan_file}")

    return fixed
