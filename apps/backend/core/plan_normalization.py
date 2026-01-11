"""
Implementation Plan Normalization Utilities
===========================================

Small helpers for normalizing common LLM/legacy field variants in
implementation_plan.json without changing status semantics.
"""


def normalize_subtask_aliases(subtask: dict) -> tuple[dict, bool]:
    """Normalize common subtask field aliases.

    - If `id` is missing and `subtask_id` exists, copy it into `id` as a string.
    - If `description` is missing/empty and `title` is a non-empty string, copy it
      into `description`.
    """

    normalized = dict(subtask)
    changed = False

    if "id" not in normalized and "subtask_id" in normalized:
        subtask_id = normalized.get("subtask_id")
        if subtask_id is not None:
            normalized["id"] = str(subtask_id)
            changed = True

    title = normalized.get("title")
    if (not normalized.get("description")) and title:
        normalized["description"] = title
        changed = True

    return normalized, changed
