"""
Data models for bug prediction system.
"""

from dataclasses import dataclass, field


@dataclass
class PredictedIssue:
    """A potential issue that might occur during implementation."""

    category: str  # "integration", "pattern", "edge_case", "security", "performance"
    description: str
    likelihood: str  # "high", "medium", "low"
    prevention: str  # How to avoid it

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "category": self.category,
            "description": self.description,
            "likelihood": self.likelihood,
            "prevention": self.prevention,
        }


@dataclass
class PreImplementationChecklist:
    """Complete checklist for a subtask before implementation."""

    subtask_id: str
    subtask_description: str
    predicted_issues: list[PredictedIssue] = field(default_factory=list)
    patterns_to_follow: list[str] = field(default_factory=list)
    files_to_reference: list[str] = field(default_factory=list)
    common_mistakes: list[str] = field(default_factory=list)
    verification_reminders: list[str] = field(default_factory=list)
