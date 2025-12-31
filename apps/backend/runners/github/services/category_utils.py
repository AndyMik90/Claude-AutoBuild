"""
Category Mapping Utilities
===========================

Shared utilities for mapping AI-generated category names to valid ReviewCategory enum values.

This module provides a centralized category mapping system used across all PR reviewers
(orchestrator, follow-up, parallel) to ensure consistent category normalization.
"""

from __future__ import annotations

try:
    from ..models import ReviewCategory
except (ImportError, ValueError, SystemError):
    from models import ReviewCategory


# Map AI-generated category names to valid ReviewCategory enum values
CATEGORY_MAPPING: dict[str, ReviewCategory] = {
    # Direct matches (already valid ReviewCategory values)
    "security": ReviewCategory.SECURITY,
    "quality": ReviewCategory.QUALITY,
    "style": ReviewCategory.STYLE,
    "test": ReviewCategory.TEST,
    "docs": ReviewCategory.DOCS,
    "pattern": ReviewCategory.PATTERN,
    "performance": ReviewCategory.PERFORMANCE,
    "redundancy": ReviewCategory.REDUNDANCY,
    "verification_failed": ReviewCategory.VERIFICATION_FAILED,
    # AI-generated alternatives that need mapping
    "logic": ReviewCategory.QUALITY,  # Logic errors → quality
    "codebase_fit": ReviewCategory.PATTERN,  # Codebase fit → pattern adherence
    "correctness": ReviewCategory.QUALITY,  # Code correctness → quality
    "consistency": ReviewCategory.PATTERN,  # Code consistency → pattern adherence
    "testing": ReviewCategory.TEST,  # Testing → test
    "documentation": ReviewCategory.DOCS,  # Documentation → docs
    "bug": ReviewCategory.QUALITY,  # Bug → quality
    "error_handling": ReviewCategory.QUALITY,  # Error handling → quality
    "maintainability": ReviewCategory.QUALITY,  # Maintainability → quality
    "readability": ReviewCategory.STYLE,  # Readability → style
    "best_practices": ReviewCategory.PATTERN,  # Best practices → pattern (hyphen normalized to underscore)
    "architecture": ReviewCategory.PATTERN,  # Architecture → pattern
    "complexity": ReviewCategory.QUALITY,  # Complexity → quality
    "dead_code": ReviewCategory.REDUNDANCY,  # Dead code → redundancy
    "unused": ReviewCategory.REDUNDANCY,  # Unused code → redundancy
    # Follow-up specific mappings
    "regression": ReviewCategory.QUALITY,  # Regression → quality
    "incomplete_fix": ReviewCategory.QUALITY,  # Incomplete fix → quality
}


def map_category(raw_category: str) -> ReviewCategory:
    """
    Map an AI-generated category string to a valid ReviewCategory enum.

    Args:
        raw_category: Raw category string from AI (e.g., "best-practices", "logic", "security")

    Returns:
        ReviewCategory: Normalized category enum value. Defaults to QUALITY if unknown.

    Examples:
        >>> map_category("security")
        ReviewCategory.SECURITY
        >>> map_category("best-practices")
        ReviewCategory.PATTERN
        >>> map_category("unknown-category")
        ReviewCategory.QUALITY
    """
    # Normalize: lowercase, strip whitespace, replace hyphens with underscores
    normalized = raw_category.lower().strip().replace("-", "_")

    # Look up in mapping, default to QUALITY for unknown categories
    return CATEGORY_MAPPING.get(normalized, ReviewCategory.QUALITY)
