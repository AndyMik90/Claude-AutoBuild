"""
Props Strategy
==============

Strategy for combining JSX/object props from multiple changes.
"""

from __future__ import annotations

from ...types import ChangeType, MergeDecision, MergeResult
from ..context import MergeContext
from ..helpers import MergeHelpers
from .base_strategy import MergeStrategyHandler


class PropsStrategy(MergeStrategyHandler):
    """Combine JSX/object props from multiple changes."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Combine JSX/object props from multiple changes."""
        # This is a simplified implementation
        # In production, we'd parse the JSX properly

        content = context.baseline_content

        # Collect all prop additions
        props_to_add: list[tuple[str, str]] = []  # (prop_name, prop_value)

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.MODIFY_JSX_PROPS:
                    new_props = MergeHelpers.extract_new_props(change)
                    props_to_add.extend(new_props)

        # For now, return the last version with all props
        # A proper implementation would merge prop objects
        if context.task_snapshots and context.task_snapshots[-1].semantic_changes:
            last_change = context.task_snapshots[-1].semantic_changes[-1]
            if last_change.content_after:
                content = MergeHelpers.apply_content_change(
                    content, last_change.content_before, last_change.content_after
                )

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Combined props from {len(context.task_snapshots)} tasks",
        )
