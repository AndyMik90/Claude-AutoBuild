"""
Metrics Collector
=================

Collects and stores build metrics in a privacy-conscious manner.
No code content is stored - only timing, counts, and metadata.
"""

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass
class PhaseMetrics:
    """
    Metrics for a single build phase.

    Attributes:
        name: Phase name (e.g., "planning", "coding", "qa")
        duration_seconds: Time spent in phase
        tokens_used: Total tokens used (input + output)
        success: Whether phase completed successfully
        error: Error message if failed
        files_modified: Number of files modified
        files_created: Number of files created
    """

    name: str
    duration_seconds: float = 0.0
    tokens_used: int = 0
    success: bool = True
    error: str | None = None
    files_modified: int = 0
    files_created: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "name": self.name,
            "duration_seconds": self.duration_seconds,
            "tokens_used": self.tokens_used,
            "success": self.success,
            "error": self.error,
            "files_modified": self.files_modified,
            "files_created": self.files_created,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PhaseMetrics":
        """Create from dictionary."""
        return cls(
            name=data.get("name", "unknown"),
            duration_seconds=data.get("duration_seconds", 0.0),
            tokens_used=data.get("tokens_used", 0),
            success=data.get("success", True),
            error=data.get("error"),
            files_modified=data.get("files_modified", 0),
            files_created=data.get("files_created", 0),
        )


@dataclass
class BuildMetrics:
    """
    Metrics for a complete build.

    Tracks timing, resource usage, and outcomes across all phases.
    Privacy-conscious: no code content is stored.

    Attributes:
        spec_name: Name of the spec being built
        provider: LLM provider used (claude, openai, gemini, ollama)
        model: Model identifier
        complexity: Spec complexity (simple, standard, complex)
        start_time: Build start timestamp (ISO format)
        end_time: Build end timestamp (ISO format)
        total_duration_seconds: Total build time
        phases: Metrics for each phase
        success: Whether build completed successfully
        qa_iterations: Number of QA fix cycles
        total_tokens: Total tokens across all phases
        total_files_modified: Total files modified
        total_files_created: Total files created
        cost_estimate_usd: Estimated cost based on provider pricing
    """

    spec_name: str
    provider: str = "claude"
    model: str = ""
    complexity: str = "standard"
    start_time: str = ""
    end_time: str = ""
    total_duration_seconds: float = 0.0
    phases: list[PhaseMetrics] = field(default_factory=list)
    success: bool = False
    qa_iterations: int = 0
    total_tokens: int = 0
    total_files_modified: int = 0
    total_files_created: int = 0
    cost_estimate_usd: float = 0.0

    # Internal tracking (not serialized)
    _build_start: float = field(default=0.0, repr=False)
    _phase_start: float = field(default=0.0, repr=False)
    _current_phase: str = field(default="", repr=False)

    def start_build(self) -> None:
        """Mark the start of a build."""
        self._build_start = time.time()
        self.start_time = datetime.now().isoformat()

    def end_build(self, success: bool = True) -> None:
        """Mark the end of a build."""
        self.end_time = datetime.now().isoformat()
        self.total_duration_seconds = time.time() - self._build_start
        self.success = success
        self._calculate_totals()

    def start_phase(self, name: str) -> None:
        """Mark the start of a phase."""
        self._phase_start = time.time()
        self._current_phase = name

    def end_phase(
        self,
        success: bool = True,
        tokens_used: int = 0,
        files_modified: int = 0,
        files_created: int = 0,
        error: str | None = None,
    ) -> None:
        """
        Mark the end of a phase and record metrics.

        Args:
            success: Whether phase succeeded
            tokens_used: Tokens used in this phase
            files_modified: Files modified in this phase
            files_created: Files created in this phase
            error: Error message if failed
        """
        if not self._current_phase:
            return

        duration = time.time() - self._phase_start
        phase = PhaseMetrics(
            name=self._current_phase,
            duration_seconds=duration,
            tokens_used=tokens_used,
            success=success,
            error=error,
            files_modified=files_modified,
            files_created=files_created,
        )
        self.phases.append(phase)
        self._current_phase = ""

    def record_phase(
        self,
        name: str,
        duration: float,
        tokens: int = 0,
        success: bool = True,
        files_modified: int = 0,
        files_created: int = 0,
        error: str | None = None,
    ) -> None:
        """
        Record a phase with explicit values (for post-hoc recording).

        Args:
            name: Phase name
            duration: Duration in seconds
            tokens: Tokens used
            success: Whether phase succeeded
            files_modified: Files modified
            files_created: Files created
            error: Error message if failed
        """
        phase = PhaseMetrics(
            name=name,
            duration_seconds=duration,
            tokens_used=tokens,
            success=success,
            error=error,
            files_modified=files_modified,
            files_created=files_created,
        )
        self.phases.append(phase)

    def record_qa_iteration(self) -> None:
        """Record a QA iteration."""
        self.qa_iterations += 1

    def set_provider_info(
        self,
        provider: str,
        model: str,
        pricing_per_million: dict[str, float] | None = None,
    ) -> None:
        """
        Set provider information and estimate costs.

        Args:
            provider: Provider name
            model: Model identifier
            pricing_per_million: Dict with 'input' and 'output' pricing
        """
        self.provider = provider
        self.model = model

        if pricing_per_million:
            self._calculate_cost(pricing_per_million)

    def _calculate_totals(self) -> None:
        """Calculate total metrics from phases."""
        self.total_tokens = sum(p.tokens_used for p in self.phases)
        self.total_files_modified = sum(p.files_modified for p in self.phases)
        self.total_files_created = sum(p.files_created for p in self.phases)

    def _calculate_cost(self, pricing: dict[str, float]) -> None:
        """Calculate cost estimate based on token usage and pricing."""
        # Assume 50/50 input/output split for estimation
        avg_price = (pricing.get("input", 0) + pricing.get("output", 0)) / 2
        self.cost_estimate_usd = (self.total_tokens / 1_000_000) * avg_price

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization (privacy-safe)."""
        return {
            "spec_name": self.spec_name,
            "provider": self.provider,
            "model": self.model,
            "complexity": self.complexity,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "total_duration_seconds": self.total_duration_seconds,
            "phases": [p.to_dict() for p in self.phases],
            "success": self.success,
            "qa_iterations": self.qa_iterations,
            "total_tokens": self.total_tokens,
            "total_files_modified": self.total_files_modified,
            "total_files_created": self.total_files_created,
            "cost_estimate_usd": self.cost_estimate_usd,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BuildMetrics":
        """Create from dictionary."""
        metrics = cls(
            spec_name=data.get("spec_name", "unknown"),
            provider=data.get("provider", "claude"),
            model=data.get("model", ""),
            complexity=data.get("complexity", "standard"),
            start_time=data.get("start_time", ""),
            end_time=data.get("end_time", ""),
            total_duration_seconds=data.get("total_duration_seconds", 0.0),
            success=data.get("success", False),
            qa_iterations=data.get("qa_iterations", 0),
            total_tokens=data.get("total_tokens", 0),
            total_files_modified=data.get("total_files_modified", 0),
            total_files_created=data.get("total_files_created", 0),
            cost_estimate_usd=data.get("cost_estimate_usd", 0.0),
        )

        phases_data = data.get("phases", [])
        metrics.phases = [PhaseMetrics.from_dict(p) for p in phases_data]

        return metrics


def get_metrics_dir() -> Path:
    """Get the metrics storage directory."""
    # Check for custom path
    custom_path = os.environ.get("AUTO_CLAUDE_METRICS_DIR")
    if custom_path:
        path = Path(custom_path)
        path.mkdir(parents=True, exist_ok=True)
        return path

    # Default to auto-claude/metrics/
    auto_claude_dir = Path(__file__).parent.parent
    metrics_dir = auto_claude_dir / "metrics"
    metrics_dir.mkdir(parents=True, exist_ok=True)
    return metrics_dir


def save_metrics(metrics: BuildMetrics) -> Path:
    """
    Save build metrics to JSON file.

    Args:
        metrics: BuildMetrics to save

    Returns:
        Path to saved file
    """
    metrics_dir = get_metrics_dir()

    # Generate filename from spec name and timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(
        c if c.isalnum() or c == "-" else "_" for c in metrics.spec_name
    )
    filename = f"{safe_name}_{timestamp}.json"

    filepath = metrics_dir / filename
    with open(filepath, "w") as f:
        json.dump(metrics.to_dict(), f, indent=2)

    return filepath


def load_metrics(filepath: Path | str) -> BuildMetrics:
    """
    Load metrics from a JSON file.

    Args:
        filepath: Path to metrics file

    Returns:
        BuildMetrics object
    """
    with open(filepath) as f:
        data = json.load(f)
    return BuildMetrics.from_dict(data)


def load_all_metrics(limit: int | None = None) -> list[BuildMetrics]:
    """
    Load all metrics from the metrics directory.

    Args:
        limit: Maximum number of metrics to load (most recent first)

    Returns:
        List of BuildMetrics, sorted by start time (newest first)
    """
    metrics_dir = get_metrics_dir()
    metrics_files = sorted(metrics_dir.glob("*.json"), reverse=True)

    if limit:
        metrics_files = metrics_files[:limit]

    metrics_list = []
    for filepath in metrics_files:
        try:
            metrics_list.append(load_metrics(filepath))
        except (json.JSONDecodeError, KeyError):
            continue

    return metrics_list
