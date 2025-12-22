"""
Predictive Bug Prevention
==========================

Generates pre-implementation checklists to prevent common bugs BEFORE they happen.
Uses historical data from memory system and pattern analysis to predict likely issues.

The key insight: Most bugs are predictable based on:
1. Type of work (API, frontend, database, etc.)
2. Past failures in similar subtasks
3. Known gotchas in this codebase
4. Missing integration points

Usage:
    from prediction import BugPredictor, generate_subtask_checklist

    # Full API
    predictor = BugPredictor(spec_dir)
    checklist = predictor.generate_checklist(subtask)
    markdown = predictor.format_checklist_markdown(checklist)

    # Convenience function
    markdown = generate_subtask_checklist(spec_dir, subtask)
"""

from pathlib import Path

# Public API exports
from .models import PredictedIssue, PreImplementationChecklist
from .predictor import BugPredictor

__all__ = [
    "BugPredictor",
    "PredictedIssue",
    "PreImplementationChecklist",
    "generate_subtask_checklist",
]


def generate_subtask_checklist(spec_dir: Path, subtask: dict) -> str:
    """
    Convenience function to generate and format a checklist for a subtask.

    Args:
        spec_dir: Path to spec directory
        subtask: Subtask dictionary

    Returns:
        Markdown-formatted checklist
    """
    predictor = BugPredictor(spec_dir)
    checklist = predictor.generate_checklist(subtask)
    return predictor.format_checklist_markdown(checklist)
