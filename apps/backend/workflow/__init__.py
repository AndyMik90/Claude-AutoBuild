"""
Workflow Pattern System
========================

Defines workflow patterns for intelligent task delegation.
Each pattern represents a predefined sequence of agent operations
for common development scenarios (bug fixes, features, refactoring, etc.).
"""

from workflow.base import WorkflowPattern, WorkflowStep

__all__ = ["WorkflowPattern", "WorkflowStep"]
