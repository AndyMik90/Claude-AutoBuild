"""
DEPRECATED: Review Confidence Scoring
=====================================

This module is DEPRECATED and will be removed in a future version.

The confidence scoring approach has been replaced with EVIDENCE-BASED VALIDATION:
- Instead of assigning confidence scores (0-100), findings now require concrete
  code evidence proving the issue exists.
- Simple rule: If you can't show the actual problematic code, don't report it.
- Validation is binary: either the evidence exists in the file or it doesn't.

For new code, use evidence-based validation in pydantic_models.py and models.py instead.

Legacy Usage (deprecated):
    scorer = ConfidenceScorer(learning_tracker=tracker)

    # Score a finding
    scored = scorer.score_finding(finding, context)
    print(f"Confidence: {scored.confidence}%")
    print(f"False positive risk: {scored.false_positive_risk}")

    # Get explanation
    print(scorer.explain_confidence(scored))

Migration:
    - Instead of `confidence: float`, use `evidence: str` with actual code snippets
    - Instead of filtering by confidence threshold, verify evidence exists in file
    - See pr_finding_validator.md for the new evidence-based approach
"""

from __future__ import annotations

import warnings

warnings.warn(
    "The confidence module is deprecated. Use evidence-based validation instead. "
    "See models.py 'evidence' field and pr_finding_validator.md for the new approach.",
    DeprecationWarning,
    stacklevel=2,
)

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# Import learning tracker if available
try:
    from .learning import LearningPattern, LearningTracker
except (ImportError, ValueError, SystemError):
    LearningTracker = None
    LearningPattern = None


class FalsePositiveRisk(str, Enum):
    """Likelihood that a finding is a false positive."""

    LOW = "low"  # <10% chance
    MEDIUM = "medium"  # 10-30% chance
    HIGH = "high"  # >30% chance
    UNKNOWN = "unknown"


class ConfidenceLevel(str, Enum):
    """Confidence level categories."""

    VERY_HIGH = "very_high"  # 90%+
    HIGH = "high"  # 75-90%
    MEDIUM = "medium"  # 50-75%
    LOW = "low"  # <50%


@dataclass
class ConfidenceFactors:
    """
    Factors that contribute to confidence score.
    """

    # Pattern-based factors
    pattern_matches: int = 0  # Similar patterns found
    pattern_accuracy: float = 0.0  # Historical accuracy of this pattern

    # Context factors
    file_type_accuracy: float = 0.0  # Accuracy for this file type
    category_accuracy: float = 0.0  # Accuracy for this category

    # Evidence factors
    code_evidence_count: int = 0  # Code references supporting finding
    similar_findings_count: int = 0  # Similar findings in codebase

    # Historical factors
    historical_sample_size: int = 0  # How many similar cases we've seen
    historical_accuracy: float = 0.0  # Accuracy on similar cases

    # Severity factors
    severity_weight: float = 1.0  # Higher severity = more scrutiny

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_matches": self.pattern_matches,
            "pattern_accuracy": self.pattern_accuracy,
            "file_type_accuracy": self.file_type_accuracy,
            "category_accuracy": self.category_accuracy,
            "code_evidence_count": self.code_evidence_count,
            "similar_findings_count": self.similar_findings_count,
            "historical_sample_size": self.historical_sample_size,
            "historical_accuracy": self.historical_accuracy,
            "severity_weight": self.severity_weight,
        }


@dataclass
class ScoredFinding:
    """
    A finding with confidence scoring.
    """

    finding_id: str
    original_finding: dict[str, Any]

    # Confidence score (0-100)
    confidence: float
    confidence_level: ConfidenceLevel

    # False positive risk
    false_positive_risk: FalsePositiveRisk

    # Factors that contributed
    factors: ConfidenceFactors

    # Evidence for the finding
    evidence: list[str] = field(default_factory=list)

    # Explanation basis
    explanation_basis: str = ""

    @property
    def is_high_confidence(self) -> bool:
        return self.confidence >= 75.0

    @property
    def should_highlight(self) -> bool:
        """Should this finding be highlighted to the user?"""
        return (
            self.is_high_confidence
            and self.false_positive_risk != FalsePositiveRisk.HIGH
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "finding_id": self.finding_id,
            "original_finding": self.original_finding,
            "confidence": self.confidence,
            "confidence_level": self.confidence_level.value,
            "false_positive_risk": self.false_positive_risk.value,
            "factors": self.factors.to_dict(),
            "evidence": self.evidence,
            "explanation_basis": self.explanation_basis,
        }


@dataclass
class ReviewContext:
    """
    Context for scoring a review.
    """

    file_types: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    change_size: str = "medium"  # small/medium/large
    pr_author: str = ""
    is_external_contributor: bool = False


class ConfidenceScorer:
    """
    Scores confidence for review findings.

    Uses historical data, pattern matching, and evidence to provide
    calibrated confidence scores.
    """

    # Base weights for different factors
    PATTERN_WEIGHT = 0.25
    HISTORY_WEIGHT = 0.30
    EVIDENCE_WEIGHT = 0.25
    CATEGORY_WEIGHT = 0.20

    # Minimum sample size for reliable historical data
    MIN_SAMPLE_SIZE = 10

    def __init__(
        self,
        learning_tracker: Any | None = None,
        patterns: list[Any] | None = None,
    ):
        """
        Initialize confidence scorer.

        Args:
            learning_tracker: LearningTracker for historical data
            patterns: Pre-computed patterns for scoring
        """
        self.learning_tracker = learning_tracker
        self.patterns = patterns or []

    def score_finding(
        self,
        finding: dict[str, Any],
        context: ReviewContext | None = None,
    ) -> ScoredFinding:
        """
        Score confidence for a single finding.

        Args:
            finding: The finding to score
            context: Review context

        Returns:
            ScoredFinding with confidence score
        """
        context = context or ReviewContext()
        factors = ConfidenceFactors()

        # Extract finding metadata
        finding_id = finding.get("id", str(hash(str(finding))))
        severity = finding.get("severity", "medium")
        category = finding.get("category", "")
        file_path = finding.get("file", "")
        evidence = finding.get("evidence", [])

        # Set severity weight
        severity_weights = {
            "critical": 1.2,
            "high": 1.1,
            "medium": 1.0,
            "low": 0.9,
            "info": 0.8,
        }
        factors.severity_weight = severity_weights.get(severity.lower(), 1.0)

        # Score based on evidence
        factors.code_evidence_count = len(evidence)
        evidence_score = min(1.0, len(evidence) * 0.2)  # Up to 5 pieces = 100%

        # Score based on patterns
        pattern_score = self._score_patterns(category, file_path, context, factors)

        # Score based on historical accuracy
        history_score = self._score_history(category, context, factors)

        # Score based on category
        category_score = self._score_category(category, factors)

        # Calculate weighted confidence
        raw_confidence = (
            pattern_score * self.PATTERN_WEIGHT
            + history_score * self.HISTORY_WEIGHT
            + evidence_score * self.EVIDENCE_WEIGHT
            + category_score * self.CATEGORY_WEIGHT
        )

        # Apply severity weight
        raw_confidence *= factors.severity_weight

        # Convert to 0-100 scale
        confidence = min(100.0, max(0.0, raw_confidence * 100))

        # Determine confidence level
        if confidence >= 90:
            confidence_level = ConfidenceLevel.VERY_HIGH
        elif confidence >= 75:
            confidence_level = ConfidenceLevel.HIGH
        elif confidence >= 50:
            confidence_level = ConfidenceLevel.MEDIUM
        else:
            confidence_level = ConfidenceLevel.LOW

        # Determine false positive risk
        false_positive_risk = self._assess_false_positive_risk(
            confidence, factors, context
        )

        # Build explanation basis
        explanation_basis = self._build_explanation(factors, context)

        return ScoredFinding(
            finding_id=finding_id,
            original_finding=finding,
            confidence=round(confidence, 1),
            confidence_level=confidence_level,
            false_positive_risk=false_positive_risk,
            factors=factors,
            evidence=evidence,
            explanation_basis=explanation_basis,
        )

    def score_findings(
        self,
        findings: list[dict[str, Any]],
        context: ReviewContext | None = None,
    ) -> list[ScoredFinding]:
        """
        Score multiple findings.

        Args:
            findings: List of findings
            context: Review context

        Returns:
            List of scored findings, sorted by confidence
        """
        scored = [self.score_finding(f, context) for f in findings]
        # Sort by confidence descending
        scored.sort(key=lambda s: s.confidence, reverse=True)
        return scored

    def _score_patterns(
        self,
        category: str,
        file_path: str,
        context: ReviewContext,
        factors: ConfidenceFactors,
    ) -> float:
        """Score based on pattern matching."""
        if not self.patterns:
            return 0.5  # Neutral if no patterns

        matches = 0
        total_accuracy = 0.0

        # Get file extension
        file_ext = file_path.split(".")[-1] if "." in file_path else ""

        for pattern in self.patterns:
            pattern_type = getattr(
                pattern, "pattern_type", pattern.get("pattern_type", "")
            )
            pattern_context = getattr(pattern, "context", pattern.get("context", {}))
            pattern_accuracy = getattr(
                pattern, "accuracy", pattern.get("accuracy", 0.5)
            )

            # Check for file type match
            if pattern_type == "file_type_accuracy":
                if pattern_context.get("file_type") == file_ext:
                    matches += 1
                    total_accuracy += pattern_accuracy
                    factors.file_type_accuracy = pattern_accuracy

            # Check for category match
            if pattern_type == "category_accuracy":
                if pattern_context.get("category") == category:
                    matches += 1
                    total_accuracy += pattern_accuracy
                    factors.category_accuracy = pattern_accuracy

        factors.pattern_matches = matches

        if matches > 0:
            factors.pattern_accuracy = total_accuracy / matches
            return factors.pattern_accuracy

        return 0.5  # Neutral if no matches

    def _score_history(
        self,
        category: str,
        context: ReviewContext,
        factors: ConfidenceFactors,
    ) -> float:
        """Score based on historical accuracy."""
        if not self.learning_tracker:
            return 0.5  # Neutral if no history

        try:
            # Get accuracy stats
            stats = self.learning_tracker.get_accuracy()
            factors.historical_sample_size = stats.total_predictions

            if stats.total_predictions >= self.MIN_SAMPLE_SIZE:
                factors.historical_accuracy = stats.accuracy
                return stats.accuracy
            else:
                # Not enough data, return neutral with penalty
                return 0.5 * (stats.total_predictions / self.MIN_SAMPLE_SIZE)

        except Exception as e:
            # Log the error for debugging while returning neutral score
            import logging

            logging.getLogger(__name__).warning(
                f"Error scoring history for category '{category}': {e}"
            )
            return 0.5

    def _score_category(
        self,
        category: str,
        factors: ConfidenceFactors,
    ) -> float:
        """Score based on category reliability."""
        # Categories with higher inherent confidence
        high_confidence_categories = {
            "security": 0.85,
            "bug": 0.75,
            "error_handling": 0.70,
            "performance": 0.65,
        }

        # Categories with lower inherent confidence
        low_confidence_categories = {
            "style": 0.50,
            "naming": 0.45,
            "documentation": 0.40,
            "nitpick": 0.35,
        }

        if category.lower() in high_confidence_categories:
            return high_confidence_categories[category.lower()]
        elif category.lower() in low_confidence_categories:
            return low_confidence_categories[category.lower()]

        return 0.6  # Default for unknown categories

    def _assess_false_positive_risk(
        self,
        confidence: float,
        factors: ConfidenceFactors,
        context: ReviewContext,
    ) -> FalsePositiveRisk:
        """Assess risk of false positive."""
        # Low confidence = high false positive risk
        if confidence < 50:
            return FalsePositiveRisk.HIGH
        elif confidence < 75:
            # Check additional factors
            if factors.historical_sample_size < self.MIN_SAMPLE_SIZE:
                return FalsePositiveRisk.HIGH
            elif factors.historical_accuracy < 0.7:
                return FalsePositiveRisk.MEDIUM
            else:
                return FalsePositiveRisk.MEDIUM
        else:
            # High confidence
            if factors.code_evidence_count >= 3:
                return FalsePositiveRisk.LOW
            elif factors.historical_accuracy >= 0.85:
                return FalsePositiveRisk.LOW
            else:
                return FalsePositiveRisk.MEDIUM

    def _build_explanation(
        self,
        factors: ConfidenceFactors,
        context: ReviewContext,
    ) -> str:
        """Build explanation for confidence score."""
        parts = []

        if factors.historical_sample_size > 0:
            parts.append(
                f"Based on {factors.historical_sample_size} similar patterns "
                f"with {factors.historical_accuracy * 100:.0f}% accuracy"
            )

        if factors.pattern_matches > 0:
            parts.append(f"Matched {factors.pattern_matches} known patterns")

        if factors.code_evidence_count > 0:
            parts.append(f"Supported by {factors.code_evidence_count} code references")

        if not parts:
            parts.append("Initial assessment without historical data")

        return ". ".join(parts)

    def explain_confidence(self, scored: ScoredFinding) -> str:
        """
        Get a human-readable explanation of the confidence score.

        Args:
            scored: The scored finding

        Returns:
            Explanation string
        """
        lines = [
            f"Confidence: {scored.confidence}% ({scored.confidence_level.value})",
            f"False positive risk: {scored.false_positive_risk.value}",
            "",
            "Basis:",
            f"  {scored.explanation_basis}",
        ]

        if scored.factors.historical_sample_size > 0:
            lines.append(
                f"  Historical accuracy: {scored.factors.historical_accuracy * 100:.0f}% "
                f"({scored.factors.historical_sample_size} samples)"
            )

        if scored.evidence:
            lines.append(f"  Evidence: {len(scored.evidence)} code references")

        return "\n".join(lines)

    def filter_by_confidence(
        self,
        scored_findings: list[ScoredFinding],
        min_confidence: float = 50.0,
        exclude_high_fp_risk: bool = False,
    ) -> list[ScoredFinding]:
        """
        Filter findings by confidence threshold.

        Args:
            scored_findings: List of scored findings
            min_confidence: Minimum confidence to include
            exclude_high_fp_risk: Exclude high false positive risk

        Returns:
            Filtered list
        """
        result = []
        for finding in scored_findings:
            if finding.confidence < min_confidence:
                continue
            if (
                exclude_high_fp_risk
                and finding.false_positive_risk == FalsePositiveRisk.HIGH
            ):
                continue
            result.append(finding)
        return result

    def get_summary(
        self,
        scored_findings: list[ScoredFinding],
    ) -> dict[str, Any]:
        """
        Get summary statistics for scored findings.

        Args:
            scored_findings: List of scored findings

        Returns:
            Summary dict
        """
        if not scored_findings:
            return {
                "total": 0,
                "avg_confidence": 0.0,
                "by_level": {},
                "by_risk": {},
            }

        by_level: dict[str, int] = {}
        by_risk: dict[str, int] = {}
        total_confidence = 0.0

        for finding in scored_findings:
            level = finding.confidence_level.value
            by_level[level] = by_level.get(level, 0) + 1

            risk = finding.false_positive_risk.value
            by_risk[risk] = by_risk.get(risk, 0) + 1

            total_confidence += finding.confidence

        return {
            "total": len(scored_findings),
            "avg_confidence": total_confidence / len(scored_findings),
            "by_level": by_level,
            "by_risk": by_risk,
            "high_confidence_count": by_level.get("very_high", 0)
            + by_level.get("high", 0),
            "low_risk_count": by_risk.get("low", 0),
        }
