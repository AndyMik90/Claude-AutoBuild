"""
Ordering Strategy
=================

Strategies for ordering changes by dependency or time.
"""

from __future__ import annotations

from ...types import ChangeType, MergeDecision, MergeResult
from ..context import MergeContext
from ..helpers import MergeHelpers
from .base_strategy import MergeStrategyHandler


class OrderByDependencyStrategy(MergeStrategyHandler):
    """Order changes by dependency analysis."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Order changes by dependency analysis."""
        # Analyze dependencies between changes
        ordered_changes = MergeHelpers.topological_sort_changes(context.task_snapshots)

        content = context.baseline_content

        # Apply changes in dependency order
        for change in ordered_changes:
            if change.content_after:
                if change.change_type == ChangeType.ADD_HOOK_CALL:
                    func_name = (
                        change.target.split(".")[-1]
                        if "." in change.target
                        else change.target
                    )
                    hook_call = MergeHelpers.extract_hook_call(change)
                    if hook_call:
                        content = MergeHelpers.insert_hooks_into_function(
                            content, func_name, [hook_call]
                        )
                elif change.change_type == ChangeType.WRAP_JSX:
                    wrapper = MergeHelpers.extract_jsx_wrapper(change)
                    if wrapper:
                        func_name = (
                            change.target.split(".")[-1]
                            if "." in change.target
                            else change.target
                        )
                        content = MergeHelpers.wrap_function_return(
                            content, func_name, wrapper[0], wrapper[1]
                        )

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation="Changes applied in dependency order",
        )


class OrderByTimeStrategy(MergeStrategyHandler):
    """Apply changes in chronological order."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Apply changes in chronological order."""
        # Sort snapshots by start time
        sorted_snapshots = sorted(context.task_snapshots, key=lambda s: s.started_at)

        content = context.baseline_content

        # Apply each snapshot's changes in order
        for snapshot in sorted_snapshots:
            for change in snapshot.semantic_changes:
                if change.content_before and change.content_after:
                    content = MergeHelpers.apply_content_change(
                        content, change.content_before, change.content_after
                    )
                elif change.content_after and not change.content_before:
                    # Addition - handled by other strategies
                    pass

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Applied {len(sorted_snapshots)} changes in chronological order",
        )


# Convenience class to group ordering strategies
class OrderingStrategy:
    """Namespace for ordering strategies."""

    ByDependency = OrderByDependencyStrategy
    ByTime = OrderByTimeStrategy
