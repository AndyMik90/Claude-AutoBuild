"""
GitHub Automation Runners
=========================

Standalone runner system for GitHub automation:
- PR Review: AI-powered code review with fix suggestions
- Issue Triage: Duplicate/spam/feature-creep detection
- Issue Auto-Fix: Automatic spec creation and execution from issues

This is SEPARATE from the main task execution pipeline (spec_runner, run.py, etc.)
to maintain modularity and avoid breaking existing features.
"""

from .models import (
    AutoFixState,
    AutoFixStatus,
    GitHubRunnerConfig,
    PRReviewFinding,
    PRReviewResult,
    ReviewCategory,
    ReviewSeverity,
    TriageCategory,
    TriageResult,
)
from .orchestrator import GitHubOrchestrator

__all__ = [
    # Orchestrator
    "GitHubOrchestrator",
    # Models
    "PRReviewResult",
    "PRReviewFinding",
    "TriageResult",
    "AutoFixState",
    "GitHubRunnerConfig",
    # Enums
    "ReviewSeverity",
    "ReviewCategory",
    "TriageCategory",
    "AutoFixStatus",
]
