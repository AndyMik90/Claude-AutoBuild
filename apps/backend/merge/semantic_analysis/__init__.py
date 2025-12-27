"""
Semantic analyzer package for AST-based code analysis.

This package provides modular semantic analysis capabilities:
- models.py: Data structures for extracted elements
- python_analyzer.py: Python-specific AST extraction
- js_analyzer.py: JavaScript/TypeScript-specific AST extraction
- comparison.py: Element comparison and change classification
- regex_analyzer.py: Fallback regex-based analysis
"""

from .models import ExtractedElement

__all__ = ["ExtractedElement"]
