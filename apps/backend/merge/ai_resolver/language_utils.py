"""
Language Utilities
==================

Utilities for language detection and location analysis.

This module provides functions for inferring programming languages
from file paths and checking if code locations overlap.
"""

from __future__ import annotations


def infer_language(file_path: str) -> str:
    """
    Infer programming language from file path.

    Args:
        file_path: Path to the file

    Returns:
        Language identifier string
    """
    ext_map = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".jsx": "jsx",
        ".go": "go",
        ".rs": "rust",
        ".java": "java",
        ".kt": "kotlin",
        ".swift": "swift",
        ".rb": "ruby",
        ".php": "php",
        ".css": "css",
        ".html": "html",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".md": "markdown",
    }

    for ext, lang in ext_map.items():
        if file_path.endswith(ext):
            return lang
    return "text"


def locations_overlap(loc1: str, loc2: str) -> bool:
    """
    Check if two code locations might overlap.

    Args:
        loc1: First location string
        loc2: Second location string

    Returns:
        True if locations likely overlap
    """
    # Simple heuristic: if one contains the other or they share a prefix
    if loc1 == loc2:
        return True
    if loc1.startswith(loc2) or loc2.startswith(loc1):
        return True
    # Check for function/class containment
    if loc1.startswith("function:") and loc2.startswith("function:"):
        return loc1.split(":")[1] == loc2.split(":")[1]
    return False
