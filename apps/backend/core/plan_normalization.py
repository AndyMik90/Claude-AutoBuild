"""
Implementation Plan Normalization Utilities
===========================================

Small helpers for normalizing common LLM/legacy field variants in
implementation_plan.json without changing status semantics.
"""

from typing import Any


def normalize_subtask_aliases(subtask: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Normalize common subtask field aliases.

    - If `id` is missing and `subtask_id` exists, copy it into `id` as a string.
    - If `description` is missing/empty and `title` is a non-empty string, copy it
      into `description`.
    """

    normalized = dict(subtask)
    changed = False

    id_value = normalized.get("id")
    id_missing = (
        "id" not in normalized
        or id_value is None
        or (isinstance(id_value, str) and not id_value.strip())
    )
    if id_missing and "subtask_id" in normalized:
        subtask_id = normalized.get("subtask_id")
        if subtask_id is not None:
            subtask_id_str = str(subtask_id).strip()
            if subtask_id_str:
                normalized["id"] = subtask_id_str
                changed = True

    description_value = normalized.get("description")
    description_missing = (
        "description" not in normalized
        or description_value is None
        or (isinstance(description_value, str) and not description_value.strip())
    )
    title = normalized.get("title")
    if description_missing and isinstance(title, str):
        title_str = title.strip()
        if title_str:
            normalized["description"] = title_str
            changed = True

    return normalized, changed
