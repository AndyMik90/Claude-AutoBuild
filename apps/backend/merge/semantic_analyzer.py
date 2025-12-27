"""
Semantic Analyzer
=================

Analyzes code changes at a semantic level using tree-sitter.

This module provides AST-based analysis of code changes, extracting
meaningful semantic changes like "added import", "modified function",
"wrapped JSX element" rather than line-level diffs.

When tree-sitter is not available, falls back to regex-based heuristics.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from .types import ChangeType, FileAnalysis

# Import debug utilities
try:
    from debug import (
        debug,
        debug_detailed,
        debug_error,
        debug_success,
        debug_verbose,
        is_debug_enabled,
    )
except ImportError:
    # Fallback if debug module not available
    def debug(*args, **kwargs):
        pass

    def debug_detailed(*args, **kwargs):
        pass

    def debug_verbose(*args, **kwargs):
        pass

    def debug_success(*args, **kwargs):
        pass

    def debug_error(*args, **kwargs):
        pass

    def is_debug_enabled():
        return False


logger = logging.getLogger(__name__)
MODULE = "merge.semantic_analyzer"

# Try to import tree-sitter - it's optional but recommended
TREE_SITTER_AVAILABLE = False
try:
    import tree_sitter  # noqa: F401
    from tree_sitter import Language, Node, Parser, Tree

    TREE_SITTER_AVAILABLE = True
    logger.info("tree-sitter available, using AST-based analysis")
except ImportError:
    logger.warning("tree-sitter not available, using regex-based fallback")
    Tree = None
    Node = None

# Try to import language bindings
LANGUAGES_AVAILABLE: dict[str, Any] = {}
if TREE_SITTER_AVAILABLE:
    try:
        import tree_sitter_python as tspython

        LANGUAGES_AVAILABLE[".py"] = tspython.language()
    except ImportError:
        pass

    try:
        import tree_sitter_javascript as tsjs

        LANGUAGES_AVAILABLE[".js"] = tsjs.language()
        LANGUAGES_AVAILABLE[".jsx"] = tsjs.language()
    except ImportError:
        pass

    try:
        import tree_sitter_typescript as tsts

        LANGUAGES_AVAILABLE[".ts"] = tsts.language_typescript()
        LANGUAGES_AVAILABLE[".tsx"] = tsts.language_tsx()
    except ImportError:
        pass

# Import our modular components
from .semantic_analysis.comparison import compare_elements
from .semantic_analysis.models import ExtractedElement
from .semantic_analysis.regex_analyzer import analyze_with_regex

if TREE_SITTER_AVAILABLE:
    from .semantic_analysis.js_analyzer import extract_js_elements
    from .semantic_analysis.python_analyzer import extract_python_elements


class SemanticAnalyzer:
    """
    Analyzes code changes at a semantic level.

    Uses tree-sitter for AST-based analysis when available,
    falling back to regex-based heuristics when not.

    Example:
        analyzer = SemanticAnalyzer()
        analysis = analyzer.analyze_diff("src/App.tsx", before_code, after_code)
        for change in analysis.changes:
            print(f"{change.change_type.value}: {change.target}")
    """

    def __init__(self):
        """Initialize the analyzer with available parsers."""
        self._parsers: dict[str, Parser] = {}

        debug(
            MODULE,
            "Initializing SemanticAnalyzer",
            tree_sitter_available=TREE_SITTER_AVAILABLE,
        )

        if TREE_SITTER_AVAILABLE:
            for ext, lang in LANGUAGES_AVAILABLE.items():
                parser = Parser()
                parser.language = Language(lang)
                self._parsers[ext] = parser
                debug_detailed(MODULE, f"Initialized parser for {ext}")
            debug_success(
                MODULE,
                "SemanticAnalyzer initialized",
                parsers=list(self._parsers.keys()),
            )
        else:
            debug(MODULE, "Using regex-based fallback (tree-sitter not available)")

    def analyze_diff(
        self,
        file_path: str,
        before: str,
        after: str,
        task_id: str | None = None,
    ) -> FileAnalysis:
        """
        Analyze the semantic differences between two versions of a file.

        Args:
            file_path: Path to the file being analyzed
            before: Content before changes
            after: Content after changes
            task_id: Optional task ID for context

        Returns:
            FileAnalysis containing semantic changes
        """
        ext = Path(file_path).suffix.lower()

        debug(
            MODULE,
            f"Analyzing diff for {file_path}",
            file_path=file_path,
            extension=ext,
            before_length=len(before),
            after_length=len(after),
            task_id=task_id,
        )

        # Use tree-sitter if available for this language
        if ext in self._parsers:
            debug_detailed(MODULE, f"Using tree-sitter parser for {ext}")
            analysis = self._analyze_with_tree_sitter(file_path, before, after, ext)
        else:
            debug_detailed(MODULE, f"Using regex fallback for {ext}")
            analysis = analyze_with_regex(file_path, before, after, ext)

        debug_success(
            MODULE,
            f"Analysis complete for {file_path}",
            changes_found=len(analysis.changes),
            functions_modified=len(analysis.functions_modified),
            functions_added=len(analysis.functions_added),
            imports_added=len(analysis.imports_added),
            total_lines_changed=analysis.total_lines_changed,
        )

        # Log each change at verbose level
        for change in analysis.changes:
            debug_verbose(
                MODULE,
                f"  Change: {change.change_type.value}",
                target=change.target,
                location=change.location,
                lines=f"{change.line_start}-{change.line_end}",
            )

        return analysis

    def _analyze_with_tree_sitter(
        self,
        file_path: str,
        before: str,
        after: str,
        ext: str,
    ) -> FileAnalysis:
        """Analyze using tree-sitter AST parsing."""
        parser = self._parsers[ext]

        tree_before = parser.parse(bytes(before, "utf-8"))
        tree_after = parser.parse(bytes(after, "utf-8"))

        # Extract structural elements from both versions
        elements_before = self._extract_elements(tree_before, before, ext)
        elements_after = self._extract_elements(tree_after, after, ext)

        # Compare and generate semantic changes
        changes = compare_elements(elements_before, elements_after, ext)

        # Build the analysis
        analysis = FileAnalysis(file_path=file_path, changes=changes)

        # Populate summary fields
        for change in changes:
            if change.change_type in {
                ChangeType.MODIFY_FUNCTION,
                ChangeType.ADD_HOOK_CALL,
            }:
                analysis.functions_modified.add(change.target)
            elif change.change_type == ChangeType.ADD_FUNCTION:
                analysis.functions_added.add(change.target)
            elif change.change_type == ChangeType.ADD_IMPORT:
                analysis.imports_added.add(change.target)
            elif change.change_type == ChangeType.REMOVE_IMPORT:
                analysis.imports_removed.add(change.target)
            elif change.change_type in {
                ChangeType.MODIFY_CLASS,
                ChangeType.ADD_METHOD,
            }:
                analysis.classes_modified.add(change.target.split(".")[0])

            analysis.total_lines_changed += change.line_end - change.line_start + 1

        return analysis

    def _extract_elements(
        self,
        tree: Tree,
        source: str,
        ext: str,
    ) -> dict[str, ExtractedElement]:
        """Extract structural elements from a syntax tree."""
        elements: dict[str, ExtractedElement] = {}
        source_bytes = bytes(source, "utf-8")

        def get_text(node: Node) -> str:
            return source_bytes[node.start_byte : node.end_byte].decode("utf-8")

        def get_line(byte_pos: int) -> int:
            # Convert byte position to line number (1-indexed)
            return source[:byte_pos].count("\n") + 1

        # Language-specific extraction
        if ext == ".py":
            extract_python_elements(tree.root_node, elements, get_text, get_line)
        elif ext in {".js", ".jsx", ".ts", ".tsx"}:
            extract_js_elements(tree.root_node, elements, get_text, get_line, ext)

        return elements

    def analyze_file(self, file_path: str, content: str) -> FileAnalysis:
        """
        Analyze a single file's structure (not a diff).

        Useful for capturing baseline state.

        Args:
            file_path: Path to the file
            content: File content

        Returns:
            FileAnalysis with structural elements (no changes, just structure)
        """
        # Analyze against empty string to get all elements as "additions"
        return self.analyze_diff(file_path, "", content)

    @property
    def supported_extensions(self) -> set[str]:
        """Get the set of supported file extensions."""
        if TREE_SITTER_AVAILABLE:
            # Tree-sitter extensions plus regex fallbacks
            return set(self._parsers.keys()) | {".py", ".js", ".jsx", ".ts", ".tsx"}
        else:
            # Only regex-supported extensions
            return {".py", ".js", ".jsx", ".ts", ".tsx"}

    def is_supported(self, file_path: str) -> bool:
        """Check if a file type is supported for semantic analysis."""
        ext = Path(file_path).suffix.lower()
        return ext in self.supported_extensions


# Re-export ExtractedElement for backwards compatibility
__all__ = ["SemanticAnalyzer", "ExtractedElement"]
