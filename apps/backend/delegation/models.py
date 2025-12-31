"""
Delegation Data Models
======================

Defines data models for the delegation system.
"""

import json
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class DelegationStatus(str, Enum):
    """Status of a delegation workflow."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class StepResult:
    """Result of executing a single workflow step."""

    step_name: str
    agent_type: str
    status: str  # "completed", "failed", "skipped"
    output: Optional[str] = None
    error: Optional[str] = None
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "step_name": self.step_name,
            "agent_type": self.agent_type,
            "status": self.status,
            "output": self.output,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


@dataclass
class DelegationContext:
    """
    Context for a delegation workflow.

    Contains all the state needed to track and coordinate
    a multi-agent workflow.
    """

    task: str  # Original task description
    delegation_id: str  # Unique identifier (e.g., "001-fix-button")
    delegation_dir: Path  # Working directory
    pattern_name: str  # Selected workflow pattern
    complexity: str  # "simple" or "complex"
    model: str  # Claude model to use
    status: DelegationStatus = DelegationStatus.PENDING
    current_step: int = 0
    total_steps: int = 0
    step_results: List[StepResult] = field(default_factory=list)
    previous_outputs: Dict[str, str] = field(default_factory=dict)
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "task": self.task,
            "delegation_id": self.delegation_id,
            "delegation_dir": str(self.delegation_dir),
            "pattern_name": self.pattern_name,
            "complexity": self.complexity,
            "model": self.model,
            "status": self.status.value,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "step_results": [r.to_dict() for r in self.step_results],
            "previous_outputs": self.previous_outputs,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }

    def save(self) -> None:
        """Save context to delegation.json file."""
        metadata_file = self.delegation_dir / "delegation.json"
        with open(metadata_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, delegation_dir: Path) -> Optional["DelegationContext"]:
        """Load context from delegation.json file."""
        metadata_file = delegation_dir / "delegation.json"
        if not metadata_file.exists():
            return None

        with open(metadata_file) as f:
            data = json.load(f)

        # Reconstruct StepResult objects
        step_results = [
            StepResult(**sr) for sr in data.get("step_results", [])
        ]

        return cls(
            task=data["task"],
            delegation_id=data["delegation_id"],
            delegation_dir=Path(data["delegation_dir"]),
            pattern_name=data["pattern_name"],
            complexity=data["complexity"],
            model=data["model"],
            status=DelegationStatus(data["status"]),
            current_step=data["current_step"],
            total_steps=data["total_steps"],
            step_results=step_results,
            previous_outputs=data.get("previous_outputs", {}),
            started_at=data["started_at"],
            completed_at=data.get("completed_at"),
        )


def generate_delegation_name(task: str) -> str:
    """
    Generate a delegation ID from a task description.

    Creates a short, URL-friendly identifier based on the task.
    Examples:
    - "Fix the broken login button" -> "001-fix-login-button"
    - "Add user authentication" -> "002-add-user-authentication"

    Args:
        task: The task description

    Returns:
        Delegation ID (e.g., "001-fix-button")
    """
    # Extract key words from task
    # Remove common words and keep meaningful terms
    words_to_remove = {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
        "been", "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "must", "shall", "can",
        "need", "make", "get", "give", "help", "show", "use", "when", "how",
    }

    # Clean and tokenize
    task_clean = re.sub(r'[^\w\s-]', '', task.lower())
    words = task_clean.split()

    # Filter out common words
    key_words = [w for w in words if w not in words_to_remove and len(w) > 2]

    # Limit to 3 key words for brevity
    if len(key_words) > 3:
        key_words = key_words[:3]

    # Create slug
    if key_words:
        slug = "-".join(key_words)
    else:
        # Fallback if no key words found
        slug = "task"

    # Note: The numeric prefix will be assigned by the caller
    # based on existing delegations
    return slug


def get_next_delegation_number(delegations_dir: Path) -> int:
    """
    Get the next sequential delegation number.

    Args:
        delegations_dir: Directory containing delegation subdirectories

    Returns:
        Next number to use (e.g., 1 for first delegation)
    """
    if not delegations_dir.exists():
        return 1

    # Find all numbered delegation directories
    existing_numbers = []
    for item in delegations_dir.iterdir():
        if item.is_dir():
            # Try to extract number from directory name (e.g., "001-fix-button")
            match = re.match(r'^(\d+)-', item.name)
            if match:
                existing_numbers.append(int(match.group(1)))

    if not existing_numbers:
        return 1

    return max(existing_numbers) + 1


def create_delegation_id(task: str, delegations_dir: Path) -> str:
    """
    Create a complete delegation ID with numeric prefix.

    Args:
        task: The task description
        delegations_dir: Directory containing delegation subdirectories

    Returns:
        Complete delegation ID (e.g., "001-fix-button")
    """
    number = get_next_delegation_number(delegations_dir)
    slug = generate_delegation_name(task)
    return f"{number:03d}-{slug}"
