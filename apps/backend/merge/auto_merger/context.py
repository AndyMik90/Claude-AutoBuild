"""
Merge Context
=============

Context data structures for merge operations.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..types import ConflictRegion, TaskSnapshot


@dataclass
class MergeContext:
    """Context for a merge operation."""

    file_path: str
    baseline_content: str
    task_snapshots: list[TaskSnapshot]
    conflict: ConflictRegion
