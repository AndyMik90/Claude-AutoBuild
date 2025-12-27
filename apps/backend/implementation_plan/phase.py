#!/usr/bin/env python3
"""
Phase Models
============

Defines a group of subtasks with dependencies and progress tracking.
"""

from dataclasses import dataclass, field

from .enums import PhaseType, SubtaskStatus
from .subtask import Subtask


@dataclass
class Phase:
    """A group of subtasks with dependencies."""

    phase: int
    name: str
    type: PhaseType = PhaseType.IMPLEMENTATION
    subtasks: list[Subtask] = field(default_factory=list)
    depends_on: list[int] = field(default_factory=list)
    parallel_safe: bool = False  # Can subtasks in this phase run in parallel?

    # Backwards compatibility: chunks is an alias for subtasks
    @property
    def chunks(self) -> list[Subtask]:
        """Alias for subtasks (backwards compatibility)."""
        return self.subtasks

    @chunks.setter
    def chunks(self, value: list[Subtask]):
        """Alias for subtasks (backwards compatibility)."""
        self.subtasks = value

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        result = {
            "phase": self.phase,
            "name": self.name,
            "type": self.type.value,
            "subtasks": [s.to_dict() for s in self.subtasks],
            # Also include 'chunks' for backwards compatibility
            "chunks": [s.to_dict() for s in self.subtasks],
        }
        if self.depends_on:
            result["depends_on"] = self.depends_on
        if self.parallel_safe:
            result["parallel_safe"] = True
        return result

    @classmethod
    def from_dict(cls, data: dict, fallback_phase: int = 1) -> "Phase":
        """Create Phase from dict. Uses fallback_phase if 'phase' field is missing."""
        # Support both 'subtasks' and 'chunks' keys for backwards compatibility
        subtask_data = data.get("subtasks", data.get("chunks", []))
        return cls(
            phase=data.get("phase", fallback_phase),
            name=data.get("name", f"Phase {fallback_phase}"),
            type=PhaseType(data.get("type", "implementation")),
            subtasks=[Subtask.from_dict(s) for s in subtask_data],
            depends_on=data.get("depends_on", []),
            parallel_safe=data.get("parallel_safe", False),
        )

    def is_complete(self) -> bool:
        """Check if all subtasks in this phase are done."""
        return all(s.status == SubtaskStatus.COMPLETED for s in self.subtasks)

    def get_pending_subtasks(self) -> list[Subtask]:
        """Get subtasks that can be worked on."""
        return [s for s in self.subtasks if s.status == SubtaskStatus.PENDING]

    # Backwards compatibility alias
    def get_pending_chunks(self) -> list[Subtask]:
        """Alias for get_pending_subtasks (backwards compatibility)."""
        return self.get_pending_subtasks()

    def get_progress(self) -> tuple[int, int]:
        """Get (completed, total) subtask counts."""
        done = sum(1 for s in self.subtasks if s.status == SubtaskStatus.COMPLETED)
        return done, len(self.subtasks)
