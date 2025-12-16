"""
Append Strategy
===============

Strategies for appending functions, methods, and statements.
"""

from __future__ import annotations

from pathlib import Path

from ...types import ChangeType, MergeDecision, MergeResult
from ..context import MergeContext
from ..helpers import MergeHelpers
from .base_strategy import MergeStrategyHandler


class AppendFunctionsStrategy(MergeStrategyHandler):
    """Append new functions to the file."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Append new functions to the file."""
        content = context.baseline_content

        # Collect all new functions
        new_functions: list[str] = []

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if (
                    change.change_type == ChangeType.ADD_FUNCTION
                    and change.content_after
                ):
                    new_functions.append(change.content_after)

        # Append at the end (before any module.exports in JS)
        ext = Path(context.file_path).suffix.lower()
        insert_pos = MergeHelpers.find_function_insert_position(content, ext)

        if insert_pos is not None:
            lines = content.split("\n")
            for func in new_functions:
                lines.insert(insert_pos, "")
                lines.insert(insert_pos + 1, func)
                insert_pos += 2 + func.count("\n")
            content = "\n".join(lines)
        else:
            # Just append at the end
            for func in new_functions:
                content += f"\n\n{func}"

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Appended {len(new_functions)} new functions",
        )


class AppendMethodsStrategy(MergeStrategyHandler):
    """Append new methods to a class."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Append new methods to a class."""
        content = context.baseline_content

        # Collect new methods by class
        new_methods: dict[str, list[str]] = {}

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.ADD_METHOD and change.content_after:
                    # Extract class name from location
                    class_name = (
                        change.target.split(".")[0] if "." in change.target else None
                    )
                    if class_name:
                        if class_name not in new_methods:
                            new_methods[class_name] = []
                        new_methods[class_name].append(change.content_after)

        # Insert methods into their classes
        for class_name, methods in new_methods.items():
            content = MergeHelpers.insert_methods_into_class(
                content, class_name, methods
            )

        total_methods = sum(len(m) for m in new_methods.values())
        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Added {total_methods} methods to {len(new_methods)} classes",
        )


class AppendStatementsStrategy(MergeStrategyHandler):
    """Append statements (variables, comments, etc.)."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Append statements (variables, comments, etc.)."""
        content = context.baseline_content

        additions: list[str] = []

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.is_additive and change.content_after:
                    additions.append(change.content_after)

        # Append at appropriate location
        for addition in additions:
            content += f"\n{addition}"

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Appended {len(additions)} statements",
        )


# Convenience class to group all append strategies
class AppendStrategy:
    """Namespace for append strategies."""

    Functions = AppendFunctionsStrategy
    Methods = AppendMethodsStrategy
    Statements = AppendStatementsStrategy
