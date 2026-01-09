"""
Continuous research state manager with JSON persistence.

Manages the state of continuous research mode, including running status,
current phase, iteration count, discovered features, and findings.
Supports persistence to JSON for resume capability after interruptions.
"""

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any


class ResearchPhase(str, Enum):
    """Phases of continuous research."""

    IDLE = "idle"
    SOTA_LLM = "sota_llm"  # State-of-the-art LLM developments
    COMPETITOR_ANALYSIS = "competitor_analysis"
    PERFORMANCE_IMPROVEMENTS = "performance_improvements"
    UI_UX_IMPROVEMENTS = "ui_ux_improvements"
    FEATURE_DISCOVERY = "feature_discovery"


class RebalanceTrigger(str, Enum):
    """Events that trigger priority queue rebalancing."""

    NEW_FEATURE = "new_feature"
    EVIDENCE_UPDATED = "evidence_updated"
    SCHEDULED = "scheduled"  # Every 30 minutes
    MANUAL = "manual"


# Default state file name
STATE_FILE_NAME = "continuous_research_state.json"

# Phases in cycle order
RESEARCH_PHASE_CYCLE: list[ResearchPhase] = [
    ResearchPhase.SOTA_LLM,
    ResearchPhase.COMPETITOR_ANALYSIS,
    ResearchPhase.PERFORMANCE_IMPROVEMENTS,
    ResearchPhase.UI_UX_IMPROVEMENTS,
    ResearchPhase.FEATURE_DISCOVERY,
]


@dataclass
class ResearchFinding:
    """A single research finding from continuous research."""

    id: str
    phase: str
    title: str
    description: str
    source: str | None = None
    discovered_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    iteration: int = 1
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResearchFeature:
    """A feature discovered during continuous research."""

    id: str
    title: str
    description: str
    category: str
    phase_discovered: str
    iteration_discovered: int = 1
    priority_score: float = 50.0
    priority_level: str = "medium"
    acceleration: float = 50.0
    impact: float = 50.0
    feasibility: float = 50.0
    strategic_alignment: float = 50.0
    dependency: float = 50.0
    evidence: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ContinuousResearchState:
    """
    State for continuous research mode.

    Tracks the current status of continuous research, including running state,
    current phase, iteration count, accumulated features, and findings.
    Supports JSON serialization for persistence and resume capability.
    """

    # Running state
    is_running: bool = False
    started_at: str | None = None
    stopped_at: str | None = None
    duration_hours: float = 8.0  # Target duration in hours

    # Phase tracking
    current_phase: str = ResearchPhase.IDLE.value
    phase_started_at: str | None = None
    iteration_count: int = 0
    phase_iteration: int = 0  # Phase index within current iteration

    # Accumulated data
    features: list[dict[str, Any]] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)

    # Rebalancing tracking
    last_rebalance_at: str | None = None
    rebalance_count: int = 0

    # Error tracking
    errors: list[str] = field(default_factory=list)
    last_error: str | None = None

    @classmethod
    def load(cls, state_dir: Path) -> "ContinuousResearchState":
        """
        Load state from JSON file.

        Args:
            state_dir: Directory containing the state file

        Returns:
            ContinuousResearchState instance (new if file doesn't exist)
        """
        state_file = state_dir / STATE_FILE_NAME
        if not state_file.exists():
            return cls()

        try:
            with open(state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return cls._from_dict(data)
        except (json.JSONDecodeError, OSError):
            # Return fresh state if file is corrupted
            return cls()

    @classmethod
    def _from_dict(cls, data: dict[str, Any]) -> "ContinuousResearchState":
        """Create state from dictionary."""
        return cls(
            is_running=data.get("is_running", False),
            started_at=data.get("started_at"),
            stopped_at=data.get("stopped_at"),
            duration_hours=data.get("duration_hours", 8.0),
            current_phase=data.get("current_phase", ResearchPhase.IDLE.value),
            phase_started_at=data.get("phase_started_at"),
            iteration_count=data.get("iteration_count", 0),
            phase_iteration=data.get("phase_iteration", 0),
            features=data.get("features", []),
            findings=data.get("findings", []),
            last_rebalance_at=data.get("last_rebalance_at"),
            rebalance_count=data.get("rebalance_count", 0),
            errors=data.get("errors", []),
            last_error=data.get("last_error"),
        )

    def save(self, state_dir: Path) -> None:
        """
        Save state to JSON file.

        Args:
            state_dir: Directory to save the state file
        """
        state_dir.mkdir(parents=True, exist_ok=True)
        state_file = state_dir / STATE_FILE_NAME

        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(self._to_dict(), f, indent=2)

    def _to_dict(self) -> dict[str, Any]:
        """Convert state to dictionary for serialization."""
        return {
            "is_running": self.is_running,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "duration_hours": self.duration_hours,
            "current_phase": self.current_phase,
            "phase_started_at": self.phase_started_at,
            "iteration_count": self.iteration_count,
            "phase_iteration": self.phase_iteration,
            "features": self.features,
            "findings": self.findings,
            "last_rebalance_at": self.last_rebalance_at,
            "rebalance_count": self.rebalance_count,
            "errors": self.errors,
            "last_error": self.last_error,
        }

    def start(self, duration_hours: float = 8.0) -> None:
        """
        Start continuous research session.

        Args:
            duration_hours: Target duration for research session
        """
        self.is_running = True
        self.started_at = datetime.utcnow().isoformat()
        self.stopped_at = None
        self.duration_hours = duration_hours
        self.current_phase = RESEARCH_PHASE_CYCLE[0].value
        self.phase_started_at = datetime.utcnow().isoformat()
        self.phase_iteration = 0
        self.iteration_count = max(1, self.iteration_count)  # Start at 1 if fresh
        self.last_error = None

    def stop(self) -> None:
        """Stop continuous research session gracefully."""
        self.is_running = False
        self.stopped_at = datetime.utcnow().isoformat()
        self.current_phase = ResearchPhase.IDLE.value

    def advance_phase(self) -> str:
        """
        Advance to the next research phase.

        Returns:
            The new current phase name
        """
        self.phase_iteration += 1

        if self.phase_iteration >= len(RESEARCH_PHASE_CYCLE):
            # Complete iteration, start new cycle
            self.phase_iteration = 0
            self.iteration_count += 1

        self.current_phase = RESEARCH_PHASE_CYCLE[self.phase_iteration].value
        self.phase_started_at = datetime.utcnow().isoformat()

        return self.current_phase

    def add_feature(self, feature: ResearchFeature | dict[str, Any]) -> None:
        """
        Add a discovered feature.

        Args:
            feature: Feature to add (dataclass or dict)
        """
        if isinstance(feature, ResearchFeature):
            feature_dict = asdict(feature)
        else:
            feature_dict = feature

        # Avoid duplicates based on title similarity
        existing_titles = {f.get("title", "").lower() for f in self.features}
        new_title = feature_dict.get("title", "").lower()

        if new_title and new_title not in existing_titles:
            self.features.append(feature_dict)

    def add_finding(self, finding: ResearchFinding | dict[str, Any]) -> None:
        """
        Add a research finding.

        Args:
            finding: Finding to add (dataclass or dict)
        """
        if isinstance(finding, ResearchFinding):
            finding_dict = asdict(finding)
        else:
            finding_dict = finding

        self.findings.append(finding_dict)

    def record_rebalance(self, trigger: RebalanceTrigger | str) -> None:
        """
        Record that a rebalancing occurred.

        Args:
            trigger: What triggered the rebalancing
        """
        if isinstance(trigger, RebalanceTrigger):
            trigger = trigger.value

        self.last_rebalance_at = datetime.utcnow().isoformat()
        self.rebalance_count += 1

    def record_error(self, error: str) -> None:
        """
        Record an error during research.

        Args:
            error: Error message
        """
        self.last_error = error
        self.errors.append(f"{datetime.utcnow().isoformat()}: {error}")

    def get_elapsed_hours(self) -> float:
        """
        Get hours elapsed since research started.

        Returns:
            Hours elapsed (0 if not started)
        """
        if not self.started_at:
            return 0.0

        try:
            start = datetime.fromisoformat(self.started_at)
            elapsed = datetime.utcnow() - start
            return elapsed.total_seconds() / 3600
        except ValueError:
            return 0.0

    def should_continue(self) -> bool:
        """
        Check if research should continue running.

        Returns:
            True if should continue, False if duration exceeded or stopped
        """
        if not self.is_running:
            return False

        return self.get_elapsed_hours() < self.duration_hours

    def needs_rebalance(self, interval_minutes: float = 30.0) -> bool:
        """
        Check if priority queue needs scheduled rebalancing.

        Args:
            interval_minutes: Minutes between scheduled rebalances

        Returns:
            True if rebalancing is due
        """
        if not self.last_rebalance_at:
            return True

        try:
            last = datetime.fromisoformat(self.last_rebalance_at)
            elapsed = datetime.utcnow() - last
            return elapsed.total_seconds() >= interval_minutes * 60
        except ValueError:
            return True

    def get_summary(self) -> dict[str, Any]:
        """
        Get a summary of current research state.

        Returns:
            Dictionary with summary statistics
        """
        return {
            "is_running": self.is_running,
            "current_phase": self.current_phase,
            "iteration_count": self.iteration_count,
            "elapsed_hours": round(self.get_elapsed_hours(), 2),
            "duration_hours": self.duration_hours,
            "feature_count": len(self.features),
            "finding_count": len(self.findings),
            "rebalance_count": self.rebalance_count,
            "error_count": len(self.errors),
        }

    def reset(self) -> None:
        """Reset state to initial values (for fresh start)."""
        self.is_running = False
        self.started_at = None
        self.stopped_at = None
        self.duration_hours = 8.0
        self.current_phase = ResearchPhase.IDLE.value
        self.phase_started_at = None
        self.iteration_count = 0
        self.phase_iteration = 0
        self.features = []
        self.findings = []
        self.last_rebalance_at = None
        self.rebalance_count = 0
        self.errors = []
        self.last_error = None
