"""
Auto-Fix Utilities
==================

Automated fixes for common implementation plan issues.
"""

import json
from pathlib import Path

from core.plan_normalization import normalize_subtask_aliases


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
    except (OSError, json.JSONDecodeError):
        return False

    fixed = False

    # Support older/simple plans that use top-level "subtasks" (or "chunks")
    if "phases" not in plan and (
        isinstance(plan.get("subtasks"), list) or isinstance(plan.get("chunks"), list)
    ):
        subtasks = plan.get("subtasks") or plan.get("chunks") or []
        plan["phases"] = [
            {
                "id": "1",
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

        if "phase" not in phase and "phase_id" in phase:
            phase_id = phase.get("phase_id")
            phase_id_str = str(phase_id).strip() if phase_id is not None else ""
            phase_num: int | None = None
            if isinstance(phase_id, int) and not isinstance(phase_id, bool):
                phase_num = phase_id
            elif (
                isinstance(phase_id, float)
                and not isinstance(phase_id, bool)
                and phase_id.is_integer()
            ):
                phase_num = int(phase_id)
            elif isinstance(phase_id, str) and phase_id_str.isdigit():
                phase_num = int(phase_id_str)

            if phase_num is not None:
                if "id" not in phase:
                    phase["id"] = str(phase_num)
                    fixed = True
                phase["phase"] = phase_num
                fixed = True
            elif "id" not in phase and phase_id is not None:
                phase["id"] = phase_id_str
                fixed = True

        if "phase" not in phase:
            phase["phase"] = i + 1
            fixed = True

        depends_on_raw = phase.get("depends_on", [])
        if isinstance(depends_on_raw, list):
            normalized_depends_on = [
                str(d).strip() for d in depends_on_raw if d is not None
            ]
        elif depends_on_raw is None:
            normalized_depends_on = []
        else:
            normalized_depends_on = [str(depends_on_raw).strip()]
        if normalized_depends_on != depends_on_raw:
            phase["depends_on"] = normalized_depends_on
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
            normalized, changed = normalize_subtask_aliases(subtask)
            if changed:
                subtask.update(normalized)
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
        try:
            with open(plan_file, "w", encoding="utf-8") as f:
                json.dump(plan, f, indent=2, ensure_ascii=False)
        except OSError:
            return False
        print(f"Auto-fixed: {plan_file}")

    return fixed
