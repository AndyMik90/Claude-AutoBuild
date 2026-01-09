"""
Priority scoring algorithm for roadmap features.

Uses a weighted sum formula to calculate priority scores (0-100) and maps them
to priority levels (critical/high/medium/low).
"""

from dataclasses import dataclass
from enum import Enum
from typing import TypedDict


class PriorityLevel(str, Enum):
    """Priority levels for features."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PriorityWeights(TypedDict, total=False):
    """Weights for priority scoring factors (all values 0-100)."""

    acceleration: float  # Development acceleration impact (30%)
    impact: float  # User/business impact (25%)
    feasibility: float  # Implementation feasibility (20%)
    strategic_alignment: float  # Alignment with project strategy (15%)
    dependency: float  # Inverse of dependency complexity (10%)


# Default weights for priority calculation
DEFAULT_WEIGHTS: dict[str, float] = {
    "acceleration": 0.30,
    "impact": 0.25,
    "feasibility": 0.20,
    "strategic_alignment": 0.15,
    "dependency": 0.10,
}

# Thresholds for mapping scores to priority levels
PRIORITY_THRESHOLDS: dict[PriorityLevel, tuple[float, float]] = {
    PriorityLevel.CRITICAL: (80.0, 100.0),
    PriorityLevel.HIGH: (60.0, 80.0),
    PriorityLevel.MEDIUM: (40.0, 60.0),
    PriorityLevel.LOW: (0.0, 40.0),
}


@dataclass
class PriorityScore:
    """Result of priority calculation."""

    score: float  # 0-100
    level: PriorityLevel
    breakdown: dict[str, float]  # Individual weighted scores by factor


def calculate_priority(
    acceleration: float = 50.0,
    impact: float = 50.0,
    feasibility: float = 50.0,
    strategic_alignment: float = 50.0,
    dependency: float = 50.0,
    weights: dict[str, float] | None = None,
) -> float:
    """
    Calculate priority score using weighted sum formula.

    All input values should be 0-100. Returns a score 0-100.

    Weights (default):
    - acceleration: 30% - How much this feature accelerates development
    - impact: 25% - User/business impact
    - feasibility: 20% - How feasible to implement
    - strategic_alignment: 15% - Alignment with project strategy
    - dependency: 10% - Inverse of dependency complexity (100 = no deps, 0 = many deps)

    Args:
        acceleration: Development acceleration score (0-100)
        impact: User/business impact score (0-100)
        feasibility: Implementation feasibility score (0-100)
        strategic_alignment: Strategic alignment score (0-100)
        dependency: Dependency simplicity score (0-100, higher = fewer deps)
        weights: Optional custom weights (must sum to 1.0)

    Returns:
        Priority score (0-100)
    """
    w = weights if weights is not None else DEFAULT_WEIGHTS

    # Clamp input values to 0-100
    values = {
        "acceleration": max(0.0, min(100.0, acceleration)),
        "impact": max(0.0, min(100.0, impact)),
        "feasibility": max(0.0, min(100.0, feasibility)),
        "strategic_alignment": max(0.0, min(100.0, strategic_alignment)),
        "dependency": max(0.0, min(100.0, dependency)),
    }

    # Calculate weighted sum
    score = sum(values[factor] * w.get(factor, 0.0) for factor in values)

    # Clamp final score to 0-100
    return max(0.0, min(100.0, score))


def get_priority_level(score: float) -> PriorityLevel:
    """
    Map a priority score to a priority level.

    Args:
        score: Priority score (0-100)

    Returns:
        PriorityLevel enum value
    """
    clamped_score = max(0.0, min(100.0, score))

    for level, (low, high) in PRIORITY_THRESHOLDS.items():
        if low <= clamped_score < high:
            return level
        # Handle edge case for score == 100
        if clamped_score == 100.0 and level == PriorityLevel.CRITICAL:
            return level

    # Default fallback (should not reach here with valid input)
    return PriorityLevel.LOW


def calculate_priority_with_breakdown(
    acceleration: float = 50.0,
    impact: float = 50.0,
    feasibility: float = 50.0,
    strategic_alignment: float = 50.0,
    dependency: float = 50.0,
    weights: dict[str, float] | None = None,
) -> PriorityScore:
    """
    Calculate priority score with detailed breakdown.

    Returns a PriorityScore dataclass containing the total score, priority level,
    and breakdown of individual weighted contributions.

    Args:
        acceleration: Development acceleration score (0-100)
        impact: User/business impact score (0-100)
        feasibility: Implementation feasibility score (0-100)
        strategic_alignment: Strategic alignment score (0-100)
        dependency: Dependency simplicity score (0-100)
        weights: Optional custom weights

    Returns:
        PriorityScore with score, level, and breakdown
    """
    w = weights if weights is not None else DEFAULT_WEIGHTS

    # Clamp input values to 0-100
    values = {
        "acceleration": max(0.0, min(100.0, acceleration)),
        "impact": max(0.0, min(100.0, impact)),
        "feasibility": max(0.0, min(100.0, feasibility)),
        "strategic_alignment": max(0.0, min(100.0, strategic_alignment)),
        "dependency": max(0.0, min(100.0, dependency)),
    }

    # Calculate individual weighted contributions
    breakdown = {factor: values[factor] * w.get(factor, 0.0) for factor in values}

    # Calculate total score
    score = sum(breakdown.values())
    score = max(0.0, min(100.0, score))

    return PriorityScore(
        score=score,
        level=get_priority_level(score),
        breakdown=breakdown,
    )


def recalculate_priorities(
    features: list[dict],
    weights: dict[str, float] | None = None,
) -> list[dict]:
    """
    Recalculate priority scores for a list of features.

    Each feature dict should have score fields (acceleration, impact, etc.).
    This function adds/updates priority_score and priority_level fields.

    Args:
        features: List of feature dictionaries
        weights: Optional custom weights

    Returns:
        Updated list of features with priority scores
    """
    for feature in features:
        score = calculate_priority(
            acceleration=feature.get("acceleration", 50.0),
            impact=feature.get("impact", 50.0),
            feasibility=feature.get("feasibility", 50.0),
            strategic_alignment=feature.get("strategic_alignment", 50.0),
            dependency=feature.get("dependency", 50.0),
            weights=weights,
        )
        feature["priority_score"] = round(score, 2)
        feature["priority_level"] = get_priority_level(score).value

    return features


def sort_by_priority(features: list[dict], descending: bool = True) -> list[dict]:
    """
    Sort features by priority score.

    Args:
        features: List of feature dictionaries with priority_score field
        descending: If True, highest priority first (default)

    Returns:
        Sorted list of features
    """
    return sorted(
        features,
        key=lambda f: f.get("priority_score", 0.0),
        reverse=descending,
    )
