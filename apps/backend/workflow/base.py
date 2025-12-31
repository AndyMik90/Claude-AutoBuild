"""
Workflow Pattern Base Classes
==============================

Defines the base classes for workflow patterns used in the
intelligent task delegation system.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class WorkflowStep:
    """
    A single step in a workflow pattern.

    Each step represents one agent operation with specific inputs
    and expected outputs.
    """

    agent_type: str  # Which agent to use (e.g., "planner", "coder", "qa_reviewer")
    prompt_key: str  # Key for prompt template
    output_file: Optional[str] = None  # Where to save results (relative to delegation dir)
    depends_on: List[str] = field(default_factory=list)  # Which steps must complete first
    optional: bool = False  # If True, skip on failure instead of failing the workflow

    def __repr__(self) -> str:
        optional_str = " (optional)" if self.optional else ""
        return f"WorkflowStep({self.agent_type}{optional_str})"


class WorkflowPattern(ABC):
    """
    Base class for workflow patterns.

    A workflow pattern defines a sequence of agent operations
    for a specific type of task (bug fix, feature development, etc.).
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Pattern name (e.g., 'bug-resolution')."""

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what this pattern does."""

    @property
    @abstractmethod
    def triggers(self) -> List[str]:
        """Keywords that trigger this pattern (e.g., ['bug', 'fix', 'error'])."""

    @abstractmethod
    def get_steps(self, task_context: Dict[str, Any]) -> List[WorkflowStep]:
        """
        Get workflow steps based on task context.

        Args:
            task_context: Dictionary containing task information and analysis

        Returns:
            List of WorkflowStep objects in execution order
        """

    def estimate_complexity(self, task: str) -> str:
        """
        Estimate task complexity: 'simple' or 'complex'.

        Simple tasks use faster/cheaper models (Haiku).
        Complex tasks use more capable models (Sonnet).

        Args:
            task: The task description

        Returns:
            'simple' or 'complex'
        """
        # Default to complex for safety
        # Subclasses can override for smarter detection
        return "complex"

    def score_match(self, task: str) -> int:
        """
        Score how well this pattern matches the given task.

        Higher score = better match.

        Args:
            task: The task description

        Returns:
            Score (number of trigger keywords found in task)
        """
        task_lower = task.lower()
        return sum(1 for trigger in self.triggers if trigger in task_lower)

    def __repr__(self) -> str:
        return f"WorkflowPattern({self.name})"


# Registry for all workflow patterns
_pattern_registry: Dict[str, 'WorkflowPattern'] = {}


def register_pattern(pattern_class: 'WorkflowPattern') -> 'WorkflowPattern':
    """Decorator to register a workflow pattern."""
    instance = pattern_class()
    _pattern_registry[instance.name] = pattern_class
    return pattern_class


def get_pattern(name: str) -> Optional[WorkflowPattern]:
    """
    Get a workflow pattern by name.

    Args:
        name: Pattern name (e.g., 'bug-resolution')

    Returns:
        WorkflowPattern instance or None if not found
    """
    pattern_class = _pattern_registry.get(name)
    if pattern_class:
        return pattern_class()
    return None


def get_all_patterns() -> List[WorkflowPattern]:
    """Get all registered workflow patterns."""
    return [pattern_class() for pattern_class in _pattern_registry.values()]


def select_best_pattern(task: str) -> WorkflowPattern:
    """
    Select the best matching pattern for a given task.

    Args:
        task: The task description

    Returns:
        Best matching WorkflowPattern (defaults to feature-development if no match)
    """
    patterns = get_all_patterns()

    # Score each pattern by trigger keyword matches
    scored_patterns = [
        (pattern, pattern.score_match(task)) for pattern in patterns
    ]

    # Sort by score (highest first)
    scored_patterns.sort(key=lambda x: x[1], reverse=True)

    # Return highest-scoring pattern, or default if no matches
    if scored_patterns and scored_patterns[0][1] > 0:
        return scored_patterns[0][0]

    # Default to feature-development pattern
    default = get_pattern("feature-development")
    if default:
        return default

    # If feature-development doesn't exist, return first available
    if patterns:
        return patterns[0]

    raise RuntimeError("No workflow patterns registered")
