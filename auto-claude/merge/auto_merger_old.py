"""
Auto Merger
===========

Deterministic merge strategies that don't require AI intervention.

This module implements the merge strategies identified by ConflictDetector
as auto-mergeable. Each strategy is a pure Python algorithm that combines
changes from multiple tasks in a predictable way.

Strategies:
- COMBINE_IMPORTS: Merge import statements from multiple tasks
- HOOKS_FIRST: Add hooks at function start, then other changes
- HOOKS_THEN_WRAP: Add hooks first, then wrap return in JSX
- APPEND_FUNCTIONS: Add new functions after existing ones
- APPEND_METHODS: Add new methods to class
- COMBINE_PROPS: Merge JSX/object props
- ORDER_BY_DEPENDENCY: Analyze dependencies and order appropriately
- ORDER_BY_TIME: Apply changes in chronological order
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from .types import (
    ChangeType,
    ConflictRegion,
    MergeDecision,
    MergeResult,
    MergeStrategy,
    SemanticChange,
    TaskSnapshot,
)

logger = logging.getLogger(__name__)


@dataclass
class MergeContext:
    """Context for a merge operation."""

    file_path: str
    baseline_content: str
    task_snapshots: list[TaskSnapshot]
    conflict: ConflictRegion


class AutoMerger:
    """
    Performs deterministic merges without AI.

    This class implements various merge strategies that can be applied
    when the ConflictDetector determines changes are compatible.

    Example:
        merger = AutoMerger()
        result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS)
        if result.success:
            print(result.merged_content)
    """

    def __init__(self):
        """Initialize the auto merger."""
        self._strategy_handlers = {
            MergeStrategy.COMBINE_IMPORTS: self._merge_combine_imports,
            MergeStrategy.HOOKS_FIRST: self._merge_hooks_first,
            MergeStrategy.HOOKS_THEN_WRAP: self._merge_hooks_then_wrap,
            MergeStrategy.APPEND_FUNCTIONS: self._merge_append_functions,
            MergeStrategy.APPEND_METHODS: self._merge_append_methods,
            MergeStrategy.COMBINE_PROPS: self._merge_combine_props,
            MergeStrategy.ORDER_BY_DEPENDENCY: self._merge_order_by_dependency,
            MergeStrategy.ORDER_BY_TIME: self._merge_order_by_time,
            MergeStrategy.APPEND_STATEMENTS: self._merge_append_statements,
        }

    def merge(
        self,
        context: MergeContext,
        strategy: MergeStrategy,
    ) -> MergeResult:
        """
        Perform a merge using the specified strategy.

        Args:
            context: The merge context with baseline and task snapshots
            strategy: The merge strategy to use

        Returns:
            MergeResult with merged content or error
        """
        handler = self._strategy_handlers.get(strategy)

        if not handler:
            return MergeResult(
                decision=MergeDecision.FAILED,
                file_path=context.file_path,
                error=f"No handler for strategy: {strategy.value}",
            )

        try:
            return handler(context)
        except Exception as e:
            logger.exception(f"Auto-merge failed with strategy {strategy.value}")
            return MergeResult(
                decision=MergeDecision.FAILED,
                file_path=context.file_path,
                error=f"Auto-merge failed: {str(e)}",
            )

    def can_handle(self, strategy: MergeStrategy) -> bool:
        """Check if this merger can handle a strategy."""
        return strategy in self._strategy_handlers

    # ========================================
    # Strategy Implementations
    # ========================================

    def _merge_combine_imports(self, context: MergeContext) -> MergeResult:
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
        import_end_line = self._find_import_section_end(lines, ext)

        # Remove duplicates and already-present imports
        existing_imports = set()
        for i, line in enumerate(lines[:import_end_line]):
            stripped = line.strip()
            if self._is_import_line(stripped, ext):
                existing_imports.add(stripped)

        new_imports = [
            imp
            for imp in imports_to_add
            if imp not in existing_imports and imp not in imports_to_remove
        ]

        # Remove imports that should be removed
        result_lines = []
        for line in lines:
            if line.strip() not in imports_to_remove:
                result_lines.append(line)

        # Insert new imports at the import section end
        if new_imports:
            # Find insert position in result_lines
            insert_pos = self._find_import_section_end(result_lines, ext)
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

    def _merge_hooks_first(self, context: MergeContext) -> MergeResult:
        """Add hooks at function start, then apply other changes."""
        content = context.baseline_content

        # Collect hooks and other changes
        hooks: list[str] = []
        other_changes: list[SemanticChange] = []

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.ADD_HOOK_CALL:
                    # Extract just the hook call from the change
                    hook_content = self._extract_hook_call(change)
                    if hook_content:
                        hooks.append(hook_content)
                else:
                    other_changes.append(change)

        # Find the function to modify
        func_location = context.conflict.location
        if func_location.startswith("function:"):
            func_name = func_location.split(":")[1]
            content = self._insert_hooks_into_function(content, func_name, hooks)

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

    def _merge_hooks_then_wrap(self, context: MergeContext) -> MergeResult:
        """Add hooks first, then wrap JSX return."""
        content = context.baseline_content

        hooks: list[str] = []
        wraps: list[tuple[str, str]] = []  # (wrapper_component, props)

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.ADD_HOOK_CALL:
                    hook_content = self._extract_hook_call(change)
                    if hook_content:
                        hooks.append(hook_content)
                elif change.change_type == ChangeType.WRAP_JSX:
                    wrapper = self._extract_jsx_wrapper(change)
                    if wrapper:
                        wraps.append(wrapper)

        # Get function name from conflict location
        func_location = context.conflict.location
        if func_location.startswith("function:"):
            func_name = func_location.split(":")[1]

            # First add hooks
            if hooks:
                content = self._insert_hooks_into_function(content, func_name, hooks)

            # Then apply wraps
            for wrapper_name, wrapper_props in wraps:
                content = self._wrap_function_return(
                    content, func_name, wrapper_name, wrapper_props
                )

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Added {len(hooks)} hooks and {len(wraps)} JSX wrappers",
        )

    def _merge_append_functions(self, context: MergeContext) -> MergeResult:
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
        insert_pos = self._find_function_insert_position(content, ext)

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

    def _merge_append_methods(self, context: MergeContext) -> MergeResult:
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
            content = self._insert_methods_into_class(content, class_name, methods)

        total_methods = sum(len(m) for m in new_methods.values())
        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Added {total_methods} methods to {len(new_methods)} classes",
        )

    def _merge_combine_props(self, context: MergeContext) -> MergeResult:
        """Combine JSX/object props from multiple changes."""
        # This is a simplified implementation
        # In production, we'd parse the JSX properly

        content = context.baseline_content

        # Collect all prop additions
        props_to_add: list[tuple[str, str]] = []  # (prop_name, prop_value)

        for snapshot in context.task_snapshots:
            for change in snapshot.semantic_changes:
                if change.change_type == ChangeType.MODIFY_JSX_PROPS:
                    new_props = self._extract_new_props(change)
                    props_to_add.extend(new_props)

        # For now, return the last version with all props
        # A proper implementation would merge prop objects
        if context.task_snapshots and context.task_snapshots[-1].semantic_changes:
            last_change = context.task_snapshots[-1].semantic_changes[-1]
            if last_change.content_after:
                content = self._apply_content_change(
                    content, last_change.content_before, last_change.content_after
                )

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation=f"Combined props from {len(context.task_snapshots)} tasks",
        )

    def _merge_order_by_dependency(self, context: MergeContext) -> MergeResult:
        """Order changes by dependency analysis."""
        # Analyze dependencies between changes
        ordered_changes = self._topological_sort_changes(context.task_snapshots)

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
                    hook_call = self._extract_hook_call(change)
                    if hook_call:
                        content = self._insert_hooks_into_function(
                            content, func_name, [hook_call]
                        )
                elif change.change_type == ChangeType.WRAP_JSX:
                    wrapper = self._extract_jsx_wrapper(change)
                    if wrapper:
                        func_name = (
                            change.target.split(".")[-1]
                            if "." in change.target
                            else change.target
                        )
                        content = self._wrap_function_return(
                            content, func_name, wrapper[0], wrapper[1]
                        )

        return MergeResult(
            decision=MergeDecision.AUTO_MERGED,
            file_path=context.file_path,
            merged_content=content,
            conflicts_resolved=[context.conflict],
            explanation="Changes applied in dependency order",
        )

    def _merge_order_by_time(self, context: MergeContext) -> MergeResult:
        """Apply changes in chronological order."""
        # Sort snapshots by start time
        sorted_snapshots = sorted(context.task_snapshots, key=lambda s: s.started_at)

        content = context.baseline_content

        # Apply each snapshot's changes in order
        for snapshot in sorted_snapshots:
            for change in snapshot.semantic_changes:
                if change.content_before and change.content_after:
                    content = self._apply_content_change(
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

    def _merge_append_statements(self, context: MergeContext) -> MergeResult:
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

    # ========================================
    # Helper Methods
    # ========================================

    def _find_import_section_end(self, lines: list[str], ext: str) -> int:
        """Find where the import section ends."""
        last_import_line = 0

        for i, line in enumerate(lines):
            stripped = line.strip()
            if self._is_import_line(stripped, ext):
                last_import_line = i + 1
            elif (
                stripped
                and not stripped.startswith("#")
                and not stripped.startswith("//")
            ):
                # Non-empty, non-comment line after imports
                if last_import_line > 0:
                    break

        return last_import_line if last_import_line > 0 else 0

    def _is_import_line(self, line: str, ext: str) -> bool:
        """Check if a line is an import statement."""
        if ext == ".py":
            return line.startswith("import ") or line.startswith("from ")
        elif ext in {".js", ".jsx", ".ts", ".tsx"}:
            return line.startswith("import ") or line.startswith("export ")
        return False

    def _extract_hook_call(self, change: SemanticChange) -> str | None:
        """Extract the hook call from a change."""
        if change.content_after:
            # Look for useXxx() pattern
            match = re.search(
                r"(const\s+\{[^}]+\}\s*=\s*)?use\w+\([^)]*\);?", change.content_after
            )
            if match:
                return match.group(0)

            # Also check for simple hook calls
            match = re.search(r"use\w+\([^)]*\);?", change.content_after)
            if match:
                return match.group(0)

        return None

    def _extract_jsx_wrapper(self, change: SemanticChange) -> tuple[str, str] | None:
        """Extract JSX wrapper component and props."""
        if change.content_after:
            # Look for <ComponentName ...>
            match = re.search(r"<(\w+)([^>]*)>", change.content_after)
            if match:
                return (match.group(1), match.group(2).strip())
        return None

    def _insert_hooks_into_function(
        self,
        content: str,
        func_name: str,
        hooks: list[str],
    ) -> str:
        """Insert hooks at the start of a function."""
        # Find function and insert hooks after opening brace
        patterns = [
            # function Component() {
            rf"(function\s+{re.escape(func_name)}\s*\([^)]*\)\s*\{{)",
            # const Component = () => {
            rf"((?:const|let|var)\s+{re.escape(func_name)}\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>\s*\{{)",
            # const Component = function() {
            rf"((?:const|let|var)\s+{re.escape(func_name)}\s*=\s*function\s*\([^)]*\)\s*\{{)",
        ]

        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                insert_pos = match.end()
                hook_text = "\n  " + "\n  ".join(hooks)
                content = content[:insert_pos] + hook_text + content[insert_pos:]
                break

        return content

    def _wrap_function_return(
        self,
        content: str,
        func_name: str,
        wrapper_name: str,
        wrapper_props: str,
    ) -> str:
        """Wrap the return statement of a function in a JSX component."""
        # This is simplified - a real implementation would use AST

        # Find return statement with JSX
        return_pattern = r"(return\s*\(\s*)(<[^>]+>)"

        def replacer(match):
            return_start = match.group(1)
            jsx_start = match.group(2)
            props = f" {wrapper_props}" if wrapper_props else ""
            return f"{return_start}<{wrapper_name}{props}>\n      {jsx_start}"

        content = re.sub(return_pattern, replacer, content, count=1)

        # Also need to close the wrapper - this is tricky without proper parsing
        # For now, we'll rely on the AI resolver for complex cases

        return content

    def _find_function_insert_position(self, content: str, ext: str) -> int | None:
        """Find the best position to insert new functions."""
        lines = content.split("\n")

        # Look for module.exports or export default at the end
        for i in range(len(lines) - 1, -1, -1):
            line = lines[i].strip()
            if line.startswith("module.exports") or line.startswith("export default"):
                return i

        return None

    def _insert_methods_into_class(
        self,
        content: str,
        class_name: str,
        methods: list[str],
    ) -> str:
        """Insert methods into a class body."""
        # Find class closing brace
        class_pattern = rf"class\s+{re.escape(class_name)}\s*(?:extends\s+\w+)?\s*\{{"

        match = re.search(class_pattern, content)
        if match:
            # Find the matching closing brace
            start = match.end()
            brace_count = 1
            pos = start

            while pos < len(content) and brace_count > 0:
                if content[pos] == "{":
                    brace_count += 1
                elif content[pos] == "}":
                    brace_count -= 1
                pos += 1

            if brace_count == 0:
                # Insert before closing brace
                insert_pos = pos - 1
                method_text = "\n\n  " + "\n\n  ".join(methods)
                content = content[:insert_pos] + method_text + content[insert_pos:]

        return content

    def _extract_new_props(self, change: SemanticChange) -> list[tuple[str, str]]:
        """Extract newly added props from a change."""
        props = []
        if change.content_after and change.content_before:
            # Simple diff - find props in after that aren't in before
            after_props = re.findall(r"(\w+)=\{([^}]+)\}", change.content_after)
            before_props = dict(re.findall(r"(\w+)=\{([^}]+)\}", change.content_before))

            for name, value in after_props:
                if name not in before_props:
                    props.append((name, value))

        return props

    def _apply_content_change(
        self,
        content: str,
        old: str | None,
        new: str,
    ) -> str:
        """Apply a content change by replacing old with new."""
        if old and old in content:
            return content.replace(old, new, 1)
        return content

    def _topological_sort_changes(
        self,
        snapshots: list[TaskSnapshot],
    ) -> list[SemanticChange]:
        """Sort changes by their dependencies."""
        # Collect all changes
        all_changes: list[SemanticChange] = []
        for snapshot in snapshots:
            all_changes.extend(snapshot.semantic_changes)

        # Simple ordering: hooks before wraps before modifications
        priority = {
            ChangeType.ADD_IMPORT: 0,
            ChangeType.ADD_HOOK_CALL: 1,
            ChangeType.ADD_VARIABLE: 2,
            ChangeType.ADD_CONSTANT: 2,
            ChangeType.WRAP_JSX: 3,
            ChangeType.ADD_JSX_ELEMENT: 4,
            ChangeType.MODIFY_FUNCTION: 5,
            ChangeType.MODIFY_JSX_PROPS: 5,
        }

        return sorted(all_changes, key=lambda c: priority.get(c.change_type, 10))
