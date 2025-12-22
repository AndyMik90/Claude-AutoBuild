#!/usr/bin/env python3
"""
Analyzer facade module.

Provides backward compatibility for scripts that import from analyzer.py at the root.
Actual implementation is in analysis/analyzer.py.
"""

from analysis.analyzer import (
    ProjectAnalyzer,
    ServiceAnalyzer,
    analyze_project,
    analyze_service,
    main,
)

__all__ = [
    "ServiceAnalyzer",
    "ProjectAnalyzer",
    "analyze_project",
    "analyze_service",
    "main",
]

if __name__ == "__main__":
    main()
