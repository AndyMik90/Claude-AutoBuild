"""
Data models for roadmap generation.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class RoadmapPhaseResult:
    """Result of a roadmap phase execution."""

    phase: str
    success: bool
    output_files: list[str]
    errors: list[str]
    retries: int


@dataclass
class RoadmapConfig:
    """Configuration for roadmap generation."""

    project_dir: Path
    output_dir: Path
    model: str = "sonnet"  # Changed from "opus" (fix #433)
    refresh: bool = False  # Force regeneration even if roadmap exists
    enable_competitor_analysis: bool = False  # Enable competitor analysis phase


@dataclass
class RoadmapFeature:
    """A feature in the roadmap with dependencies."""

    id: str
    title: str
    description: str
    dependencies: List[str]  # List of feature IDs this feature depends on
    status: str  # e.g., "planned", "in_progress", "completed"
    reverseDependencies: List[str] | None = None  # List of feature IDs that depend on this feature
    dependencyValidation: dict | None = None  # Validation metadata for dependencies
