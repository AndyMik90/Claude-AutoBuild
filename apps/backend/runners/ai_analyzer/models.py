"""
Data models and type definitions for AI analyzer.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any


class AnalyzerType(str, Enum):
    """Available analyzer types."""

    CODE_RELATIONSHIPS = "code_relationships"
    BUSINESS_LOGIC = "business_logic"
    ARCHITECTURE = "architecture"
    SECURITY = "security"
    PERFORMANCE = "performance"
    CODE_QUALITY = "code_quality"

    @classmethod
    def all_analyzers(cls) -> list[str]:
        """Get list of all analyzer names."""
        return [a.value for a in cls]


@dataclass
class CostEstimate:
    """Cost estimation data."""

    estimated_tokens: int
    estimated_cost_usd: float
    files_to_analyze: int
    routes_count: int = 0
    models_count: int = 0


@dataclass
class AnalysisResult:
    """Result from a complete AI analysis."""

    analysis_timestamp: str
    project_dir: str
    cost_estimate: dict[str, Any]
    overall_score: int
    analyzers: dict[str, dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "analysis_timestamp": self.analysis_timestamp,
            "project_dir": self.project_dir,
            "cost_estimate": self.cost_estimate,
            "overall_score": self.overall_score,
            **self.analyzers,
        }


@dataclass
class Vulnerability:
    """Security vulnerability finding."""

    type: str
    severity: str
    location: str
    description: str
    recommendation: str


@dataclass
class PerformanceBottleneck:
    """Performance bottleneck finding."""

    type: str
    severity: str
    location: str
    description: str
    impact: str
    fix: str


@dataclass
class CodeSmell:
    """Code quality issue."""

    type: str
    location: str
    lines: int | None = None
    recommendation: str = ""
