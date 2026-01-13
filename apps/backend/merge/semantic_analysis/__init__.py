"""
Semantic analyzer package for code analysis.

This package provides modular semantic analysis capabilities:
- models.py: Data structures for extracted elements
- comparison.py: Element comparison and change classification
- regex_analyzer.py: Regex-based analysis for code changes
"""

from .models import ExtractedElement

__all__ = ["ExtractedElement"]
