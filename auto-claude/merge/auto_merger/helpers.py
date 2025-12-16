"""
Merge Helpers
=============

Helper utilities for merge operations.
"""

from __future__ import annotations

import re

from ..types import ChangeType, SemanticChange


class MergeHelpers:
    """Helper methods for merge operations."""

    @staticmethod
    def find_import_section_end(lines: list[str], ext: str) -> int:
        """Find where the import section ends."""
        last_import_line = 0

        for i, line in enumerate(lines):
            stripped = line.strip()
            if MergeHelpers.is_import_line(stripped, ext):
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

    @staticmethod
    def is_import_line(line: str, ext: str) -> bool:
        """Check if a line is an import statement."""
        if ext == ".py":
            return line.startswith("import ") or line.startswith("from ")
        elif ext in {".js", ".jsx", ".ts", ".tsx"}:
            return line.startswith("import ") or line.startswith("export ")
        return False

    @staticmethod
    def extract_hook_call(change: SemanticChange) -> str | None:
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

    @staticmethod
    def extract_jsx_wrapper(change: SemanticChange) -> tuple[str, str] | None:
        """Extract JSX wrapper component and props."""
        if change.content_after:
            # Look for <ComponentName ...>
            match = re.search(r"<(\w+)([^>]*)>", change.content_after)
            if match:
                return (match.group(1), match.group(2).strip())
        return None

    @staticmethod
    def insert_hooks_into_function(
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

    @staticmethod
    def wrap_function_return(
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

    @staticmethod
    def find_function_insert_position(content: str, ext: str) -> int | None:
        """Find the best position to insert new functions."""
        lines = content.split("\n")

        # Look for module.exports or export default at the end
        for i in range(len(lines) - 1, -1, -1):
            line = lines[i].strip()
            if line.startswith("module.exports") or line.startswith("export default"):
                return i

        return None

    @staticmethod
    def insert_methods_into_class(
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

    @staticmethod
    def extract_new_props(change: SemanticChange) -> list[tuple[str, str]]:
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

    @staticmethod
    def apply_content_change(
        content: str,
        old: str | None,
        new: str,
    ) -> str:
        """Apply a content change by replacing old with new."""
        if old and old in content:
            return content.replace(old, new, 1)
        return content

    @staticmethod
    def topological_sort_changes(
        snapshots: list,
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
