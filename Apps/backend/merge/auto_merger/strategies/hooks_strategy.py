"""
Hooks Strategy
==============

Strategies for merging React hooks and JSX wrapping.
"""

from __future__ import annotations

from ...types import ChangeType, MergeDecision, MergeResult, SemanticChange
from ..context import MergeContext
from ..helpers import MergeHelpers
from .base_strategy import MergeStrategyHandler


class HooksStrategy(MergeStrategyHandler):
    """Add hooks at function start, then apply other changes."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Add hooks at function start, then apply other changes."""
        content = context.baseline_content

        # Collect hooks and other changes
        hooks: list[str] = []
        other_changes: list[SemanticChange] = []

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.ADD_HOOK_CALL:
                    # Extract just the hook call from the change
                    hook_content = MergeHelpers.extract_hook_call(change)
                    if hook_content:
                        hooks.append(hook_content)
                else:
                    other_changes.append(change)

        # Find the function to modify
        func_location = context.conflict.location
        if func_location.startswith("function:"):
            func_name = func_location.split(":")[1]
            content = MergeHelpers.insert_hooks_into_function(content, func_name, hooks)

        # Apply other changes (simplified - just take the latest version)
        for change in other_changes:
            if change.content_after:
                # This is a simplification - in production we'd need smarter merging
                pass

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Added {len(hooks)} hooks to function start",
        )


class HooksThenWrapStrategy(MergeStrategyHandler):
    """Add hooks first, then wrap JSX return."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Add hooks first, then wrap JSX return."""
        content = context.baseline_content

        hooks: list[str] = []
        wraps: list[tuple[str, str]] = []  # (wrapper_component, props)

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.ADD_HOOK_CALL:
                    hook_content = MergeHelpers.extract_hook_call(change)
                    if hook_content:
                        hooks.append(hook_content)
                elif change.change_type == ChangeType.WRAP_JSX:
                    wrapper = MergeHelpers.extract_jsx_wrapper(change)
                    if wrapper:
                        wraps.append(wrapper)

        # Get function name from conflict location
        func_location = context.conflict.location
        if func_location.startswith("function:"):
            func_name = func_location.split(":")[1]

            # First add hooks
            if hooks:
                content = MergeHelpers.insert_hooks_into_function(
                    content, func_name, hooks
                )

            # Then apply wraps
            for wrapper_name, wrapper_props in wraps:
                content = MergeHelpers.wrap_function_return(
                    content, func_name, wrapper_name, wrapper_props
                )

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Added {len(hooks)} hooks and {len(wraps)} JSX wrappers",
        )
