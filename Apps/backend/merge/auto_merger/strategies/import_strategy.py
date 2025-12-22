"""
Import Strategy
===============

Strategy for combining import statements from multiple tasks.
"""

from __future__ import annotations

from pathlib import Path

from ...types import ChangeType, MergeDecision, MergeResult
from ..context import MergeContext
from ..helpers import MergeHelpers
from .base_strategy import MergeStrategyHandler


class ImportStrategy(MergeStrategyHandler):
    """Combine import statements from multiple tasks."""

    def execute(self, context: MergeContext) -> MergeResult:
        """Combine import statements from multiple tasks."""
        lines = context.baseline_content.split("\n")
        ext = Path(context.file_path).suffix.lower()

        # Collect all imports to add
        imports_to_add: list[str] = []
        imports_to_remove: set[str] = set()

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.ADD_IMPORT and change.content_after:
                    imports_to_add.append(change.content_after.strip())
                elif (
                    change.change_type == ChangeType.REMOVE_IMPORT
                    and change.content_before
                ):
                    imports_to_remove.add(change.content_before.strip())

        # Find where imports end in the file
        import_end_line = MergeHelpers.find_import_section_end(lines, ext)

        # Remove duplicates and already-present imports
        existing_imports = set()
        for i, line in enumerate(lines[:import_end_line]):
            stripped = line.strip()
            if MergeHelpers.is_import_line(stripped, ext):
                existing_imports.add(stripped)

        # Deduplicate imports_to_add and filter out existing/removed imports
        seen_imports = set()
        new_imports = []
        for imp in imports_to_add:
            if (
                imp not in existing_imports
                and imp not in imports_to_remove
                and imp not in seen_imports
            ):
                new_imports.append(imp)
                seen_imports.add(imp)

        # Remove imports that should be removed
        result_lines = []
        for line in lines:
            if line.strip() not in imports_to_remove:
                result_lines.append(line)

        # Insert new imports at the import section end
        if new_imports:
            # Find insert position in result_lines
            insert_pos = MergeHelpers.find_import_section_end(result_lines, ext)
            for imp in reversed(new_imports):
                result_lines.insert(insert_pos, imp)

        merged_content = "\n".join(result_lines)

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=merged_content,
            conflicts_resolved=[context.conflict],
            explanation=f"Combined {len(new_imports)} imports from {len(context.task_snapshots)} tasks",
        )
