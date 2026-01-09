#!/usr/bin/env python3
"""
Tests for Priority Scoring Algorithm
=====================================

Tests the priority_scorer.py module functionality including:
- Priority score calculation with weighted sum formula
- Priority level assignment (critical/high/medium/low)
- Breakdown calculation with individual factor contributions
- Batch feature recalculation
- Feature sorting by priority
- Edge cases and boundary conditions
"""

import pytest

from runners.roadmap.priority_scorer import (
    PriorityLevel,
    PriorityScore,
    DEFAULT_WEIGHTS,
    PRIORITY_THRESHOLDS,
    calculate_priority,
    get_priority_level,
    calculate_priority_with_breakdown,
    recalculate_priorities,
    sort_by_priority,
)


class TestCalculatePriority:
    """Tests for calculate_priority function."""

    def test_default_values_return_midpoint(self):
        """Default values (all 50) should return 50."""
        score = calculate_priority()
        assert score == 50.0

    def test_all_max_values_return_100(self):
        """All maximum values should return 100."""
        score = calculate_priority(
            acceleration=100.0,
            impact=100.0,
            feasibility=100.0,
            strategic_alignment=100.0,
            dependency=100.0,
        )
        assert score == 100.0

    def test_all_min_values_return_0(self):
        """All minimum values should return 0."""
        score = calculate_priority(
            acceleration=0.0,
            impact=0.0,
            feasibility=0.0,
            strategic_alignment=0.0,
            dependency=0.0,
        )
        assert score == 0.0

    def test_weighted_sum_calculation(self):
        """Verify weighted sum formula is applied correctly."""
        # acceleration=30%, impact=25%, feasibility=20%, strategic=15%, dependency=10%
        # Score = 100*0.30 + 80*0.25 + 60*0.20 + 40*0.15 + 20*0.10
        #       = 30 + 20 + 12 + 6 + 2 = 70
        score = calculate_priority(
            acceleration=100.0,
            impact=80.0,
            feasibility=60.0,
            strategic_alignment=40.0,
            dependency=20.0,
        )
        assert score == 70.0

    def test_acceleration_weight_is_30_percent(self):
        """Acceleration factor should contribute 30% of value."""
        # Only acceleration=100, others=0
        score = calculate_priority(
            acceleration=100.0,
            impact=0.0,
            feasibility=0.0,
            strategic_alignment=0.0,
            dependency=0.0,
        )
        assert score == 30.0

    def test_impact_weight_is_25_percent(self):
        """Impact factor should contribute 25% of value."""
        score = calculate_priority(
            acceleration=0.0,
            impact=100.0,
            feasibility=0.0,
            strategic_alignment=0.0,
            dependency=0.0,
        )
        assert score == 25.0

    def test_feasibility_weight_is_20_percent(self):
        """Feasibility factor should contribute 20% of value."""
        score = calculate_priority(
            acceleration=0.0,
            impact=0.0,
            feasibility=100.0,
            strategic_alignment=0.0,
            dependency=0.0,
        )
        assert score == 20.0

    def test_strategic_alignment_weight_is_15_percent(self):
        """Strategic alignment factor should contribute 15% of value."""
        score = calculate_priority(
            acceleration=0.0,
            impact=0.0,
            feasibility=0.0,
            strategic_alignment=100.0,
            dependency=0.0,
        )
        assert score == 15.0

    def test_dependency_weight_is_10_percent(self):
        """Dependency factor should contribute 10% of value."""
        score = calculate_priority(
            acceleration=0.0,
            impact=0.0,
            feasibility=0.0,
            strategic_alignment=0.0,
            dependency=100.0,
        )
        assert score == 10.0

    def test_values_above_100_are_clamped(self):
        """Values above 100 should be clamped to 100."""
        score = calculate_priority(
            acceleration=150.0,
            impact=200.0,
            feasibility=100.0,
            strategic_alignment=100.0,
            dependency=100.0,
        )
        assert score == 100.0

    def test_values_below_0_are_clamped(self):
        """Values below 0 should be clamped to 0."""
        score = calculate_priority(
            acceleration=-50.0,
            impact=-100.0,
            feasibility=0.0,
            strategic_alignment=0.0,
            dependency=0.0,
        )
        assert score == 0.0

    def test_custom_weights(self):
        """Custom weights should override defaults."""
        custom_weights = {
            "acceleration": 0.50,  # 50%
            "impact": 0.50,  # 50%
            "feasibility": 0.0,
            "strategic_alignment": 0.0,
            "dependency": 0.0,
        }
        score = calculate_priority(
            acceleration=100.0,
            impact=100.0,
            feasibility=100.0,
            strategic_alignment=100.0,
            dependency=100.0,
            weights=custom_weights,
        )
        assert score == 100.0

    def test_custom_weights_different_distribution(self):
        """Custom weights with different distribution."""
        custom_weights = {
            "acceleration": 1.0,  # 100%
            "impact": 0.0,
            "feasibility": 0.0,
            "strategic_alignment": 0.0,
            "dependency": 0.0,
        }
        score = calculate_priority(
            acceleration=50.0,
            impact=100.0,
            feasibility=100.0,
            strategic_alignment=100.0,
            dependency=100.0,
            weights=custom_weights,
        )
        assert score == 50.0

    def test_partial_custom_weights(self):
        """Custom weights can be partial (missing keys use 0)."""
        partial_weights = {
            "acceleration": 0.5,
            "impact": 0.5,
            # Missing: feasibility, strategic_alignment, dependency
        }
        score = calculate_priority(
            acceleration=100.0,
            impact=100.0,
            feasibility=100.0,
            strategic_alignment=100.0,
            dependency=100.0,
            weights=partial_weights,
        )
        # 100*0.5 + 100*0.5 + 0 + 0 + 0 = 100
        assert score == 100.0


class TestGetPriorityLevel:
    """Tests for get_priority_level function."""

    def test_critical_level_at_80(self):
        """Score of 80 should be critical."""
        level = get_priority_level(80.0)
        assert level == PriorityLevel.CRITICAL

    def test_critical_level_at_90(self):
        """Score of 90 should be critical."""
        level = get_priority_level(90.0)
        assert level == PriorityLevel.CRITICAL

    def test_critical_level_at_100(self):
        """Score of 100 should be critical."""
        level = get_priority_level(100.0)
        assert level == PriorityLevel.CRITICAL

    def test_high_level_at_60(self):
        """Score of 60 should be high."""
        level = get_priority_level(60.0)
        assert level == PriorityLevel.HIGH

    def test_high_level_at_79(self):
        """Score of 79 should be high."""
        level = get_priority_level(79.0)
        assert level == PriorityLevel.HIGH

    def test_medium_level_at_40(self):
        """Score of 40 should be medium."""
        level = get_priority_level(40.0)
        assert level == PriorityLevel.MEDIUM

    def test_medium_level_at_59(self):
        """Score of 59 should be medium."""
        level = get_priority_level(59.0)
        assert level == PriorityLevel.MEDIUM

    def test_low_level_at_0(self):
        """Score of 0 should be low."""
        level = get_priority_level(0.0)
        assert level == PriorityLevel.LOW

    def test_low_level_at_39(self):
        """Score of 39 should be low."""
        level = get_priority_level(39.0)
        assert level == PriorityLevel.LOW

    def test_score_above_100_clamped(self):
        """Score above 100 should clamp to critical."""
        level = get_priority_level(150.0)
        assert level == PriorityLevel.CRITICAL

    def test_score_below_0_clamped(self):
        """Score below 0 should clamp to low."""
        level = get_priority_level(-50.0)
        assert level == PriorityLevel.LOW

    def test_boundary_79_99(self):
        """Score of 79.99 should be high (not critical)."""
        level = get_priority_level(79.99)
        assert level == PriorityLevel.HIGH

    def test_boundary_59_99(self):
        """Score of 59.99 should be medium (not high)."""
        level = get_priority_level(59.99)
        assert level == PriorityLevel.MEDIUM

    def test_boundary_39_99(self):
        """Score of 39.99 should be low (not medium)."""
        level = get_priority_level(39.99)
        assert level == PriorityLevel.LOW


class TestPriorityLevelEnum:
    """Tests for PriorityLevel enum."""

    def test_critical_value(self):
        """CRITICAL should have string value 'critical'."""
        assert PriorityLevel.CRITICAL.value == "critical"

    def test_high_value(self):
        """HIGH should have string value 'high'."""
        assert PriorityLevel.HIGH.value == "high"

    def test_medium_value(self):
        """MEDIUM should have string value 'medium'."""
        assert PriorityLevel.MEDIUM.value == "medium"

    def test_low_value(self):
        """LOW should have string value 'low'."""
        assert PriorityLevel.LOW.value == "low"

    def test_is_str_subclass(self):
        """PriorityLevel should be a string enum."""
        assert isinstance(PriorityLevel.CRITICAL, str)


class TestDefaultWeights:
    """Tests for DEFAULT_WEIGHTS constant."""

    def test_weights_sum_to_one(self):
        """Default weights should sum to 1.0."""
        total = sum(DEFAULT_WEIGHTS.values())
        assert abs(total - 1.0) < 0.001

    def test_has_all_factors(self):
        """Default weights should have all five factors."""
        expected_factors = {
            "acceleration",
            "impact",
            "feasibility",
            "strategic_alignment",
            "dependency",
        }
        assert set(DEFAULT_WEIGHTS.keys()) == expected_factors

    def test_acceleration_weight(self):
        """Acceleration weight should be 0.30."""
        assert DEFAULT_WEIGHTS["acceleration"] == 0.30

    def test_impact_weight(self):
        """Impact weight should be 0.25."""
        assert DEFAULT_WEIGHTS["impact"] == 0.25

    def test_feasibility_weight(self):
        """Feasibility weight should be 0.20."""
        assert DEFAULT_WEIGHTS["feasibility"] == 0.20

    def test_strategic_alignment_weight(self):
        """Strategic alignment weight should be 0.15."""
        assert DEFAULT_WEIGHTS["strategic_alignment"] == 0.15

    def test_dependency_weight(self):
        """Dependency weight should be 0.10."""
        assert DEFAULT_WEIGHTS["dependency"] == 0.10


class TestPriorityThresholds:
    """Tests for PRIORITY_THRESHOLDS constant."""

    def test_has_all_levels(self):
        """Thresholds should cover all priority levels."""
        assert set(PRIORITY_THRESHOLDS.keys()) == {
            PriorityLevel.CRITICAL,
            PriorityLevel.HIGH,
            PriorityLevel.MEDIUM,
            PriorityLevel.LOW,
        }

    def test_critical_range(self):
        """Critical should be 80-100."""
        assert PRIORITY_THRESHOLDS[PriorityLevel.CRITICAL] == (80.0, 100.0)

    def test_high_range(self):
        """High should be 60-80."""
        assert PRIORITY_THRESHOLDS[PriorityLevel.HIGH] == (60.0, 80.0)

    def test_medium_range(self):
        """Medium should be 40-60."""
        assert PRIORITY_THRESHOLDS[PriorityLevel.MEDIUM] == (40.0, 60.0)

    def test_low_range(self):
        """Low should be 0-40."""
        assert PRIORITY_THRESHOLDS[PriorityLevel.LOW] == (0.0, 40.0)


class TestCalculatePriorityWithBreakdown:
    """Tests for calculate_priority_with_breakdown function."""

    def test_returns_priority_score_dataclass(self):
        """Should return a PriorityScore dataclass."""
        result = calculate_priority_with_breakdown()
        assert isinstance(result, PriorityScore)

    def test_score_matches_calculate_priority(self):
        """Score should match calculate_priority result."""
        result = calculate_priority_with_breakdown(
            acceleration=80.0,
            impact=70.0,
            feasibility=60.0,
            strategic_alignment=50.0,
            dependency=40.0,
        )
        expected_score = calculate_priority(
            acceleration=80.0,
            impact=70.0,
            feasibility=60.0,
            strategic_alignment=50.0,
            dependency=40.0,
        )
        assert result.score == expected_score

    def test_level_matches_get_priority_level(self):
        """Level should match get_priority_level result."""
        result = calculate_priority_with_breakdown(
            acceleration=100.0,
            impact=100.0,
            feasibility=100.0,
            strategic_alignment=100.0,
            dependency=100.0,
        )
        assert result.level == PriorityLevel.CRITICAL

    def test_breakdown_contains_all_factors(self):
        """Breakdown should contain all five factors."""
        result = calculate_priority_with_breakdown()
        expected_factors = {
            "acceleration",
            "impact",
            "feasibility",
            "strategic_alignment",
            "dependency",
        }
        assert set(result.breakdown.keys()) == expected_factors

    def test_breakdown_values_are_weighted(self):
        """Breakdown values should be input * weight."""
        result = calculate_priority_with_breakdown(
            acceleration=100.0,
            impact=80.0,
            feasibility=60.0,
            strategic_alignment=40.0,
            dependency=20.0,
        )
        assert result.breakdown["acceleration"] == 100.0 * 0.30  # 30
        assert result.breakdown["impact"] == 80.0 * 0.25  # 20
        assert result.breakdown["feasibility"] == 60.0 * 0.20  # 12
        assert result.breakdown["strategic_alignment"] == 40.0 * 0.15  # 6
        assert result.breakdown["dependency"] == 20.0 * 0.10  # 2

    def test_breakdown_sum_equals_score(self):
        """Sum of breakdown values should equal total score."""
        result = calculate_priority_with_breakdown(
            acceleration=75.0,
            impact=65.0,
            feasibility=55.0,
            strategic_alignment=45.0,
            dependency=35.0,
        )
        breakdown_sum = sum(result.breakdown.values())
        assert abs(breakdown_sum - result.score) < 0.001

    def test_with_custom_weights(self):
        """Should work with custom weights."""
        custom_weights = {
            "acceleration": 0.5,
            "impact": 0.5,
            "feasibility": 0.0,
            "strategic_alignment": 0.0,
            "dependency": 0.0,
        }
        result = calculate_priority_with_breakdown(
            acceleration=100.0,
            impact=100.0,
            weights=custom_weights,
        )
        assert result.score == 100.0
        assert result.breakdown["acceleration"] == 50.0
        assert result.breakdown["impact"] == 50.0

    def test_values_clamped_in_breakdown(self):
        """Input values should be clamped in breakdown calculation."""
        result = calculate_priority_with_breakdown(
            acceleration=150.0,  # Should clamp to 100
            impact=0.0,
            feasibility=0.0,
            strategic_alignment=0.0,
            dependency=0.0,
        )
        # 100 * 0.30 = 30, not 150 * 0.30
        assert result.breakdown["acceleration"] == 30.0


class TestRecalculatePriorities:
    """Tests for recalculate_priorities function."""

    def test_empty_list_returns_empty(self):
        """Empty feature list should return empty list."""
        result = recalculate_priorities([])
        assert result == []

    def test_adds_priority_score_field(self):
        """Should add priority_score field to features."""
        features = [{"name": "Feature A", "acceleration": 80.0}]
        result = recalculate_priorities(features)
        assert "priority_score" in result[0]

    def test_adds_priority_level_field(self):
        """Should add priority_level field to features."""
        features = [{"name": "Feature A", "acceleration": 80.0}]
        result = recalculate_priorities(features)
        assert "priority_level" in result[0]

    def test_priority_level_is_string(self):
        """priority_level should be string (not enum)."""
        features = [{"name": "Feature A", "acceleration": 100.0, "impact": 100.0,
                     "feasibility": 100.0, "strategic_alignment": 100.0, "dependency": 100.0}]
        result = recalculate_priorities(features)
        assert result[0]["priority_level"] == "critical"
        assert isinstance(result[0]["priority_level"], str)

    def test_uses_default_values_for_missing_fields(self):
        """Missing score fields should use default value (50)."""
        features = [{"name": "Feature A"}]  # No score fields
        result = recalculate_priorities(features)
        # All defaults = 50, so score should be 50
        assert result[0]["priority_score"] == 50.0

    def test_processes_multiple_features(self):
        """Should process all features in list."""
        features = [
            {"name": "Feature A", "acceleration": 100.0, "impact": 100.0,
             "feasibility": 100.0, "strategic_alignment": 100.0, "dependency": 100.0},
            {"name": "Feature B", "acceleration": 0.0, "impact": 0.0,
             "feasibility": 0.0, "strategic_alignment": 0.0, "dependency": 0.0},
        ]
        result = recalculate_priorities(features)
        assert len(result) == 2
        assert result[0]["priority_score"] == 100.0
        assert result[1]["priority_score"] == 0.0

    def test_priority_score_is_rounded(self):
        """Priority score should be rounded to 2 decimal places."""
        features = [{"name": "Feature A", "acceleration": 33.333}]
        result = recalculate_priorities(features)
        score = result[0]["priority_score"]
        # Check it's rounded (not many decimal places)
        assert score == round(score, 2)

    def test_preserves_existing_fields(self):
        """Should preserve existing feature fields."""
        features = [{
            "name": "Feature A",
            "description": "A test feature",
            "custom_field": "value",
            "acceleration": 80.0,
        }]
        result = recalculate_priorities(features)
        assert result[0]["name"] == "Feature A"
        assert result[0]["description"] == "A test feature"
        assert result[0]["custom_field"] == "value"

    def test_with_custom_weights(self):
        """Should use custom weights when provided."""
        features = [{"name": "Feature A", "acceleration": 100.0, "impact": 0.0,
                     "feasibility": 0.0, "strategic_alignment": 0.0, "dependency": 0.0}]
        custom_weights = {"acceleration": 1.0, "impact": 0.0, "feasibility": 0.0,
                          "strategic_alignment": 0.0, "dependency": 0.0}
        result = recalculate_priorities(features, weights=custom_weights)
        assert result[0]["priority_score"] == 100.0

    def test_mutates_original_list(self):
        """Should mutate the original feature list (returns same list)."""
        features = [{"name": "Feature A"}]
        result = recalculate_priorities(features)
        assert result is features  # Same list object


class TestSortByPriority:
    """Tests for sort_by_priority function."""

    def test_empty_list_returns_empty(self):
        """Empty list should return empty list."""
        result = sort_by_priority([])
        assert result == []

    def test_sorts_descending_by_default(self):
        """Should sort highest priority first by default."""
        features = [
            {"name": "Low", "priority_score": 20.0},
            {"name": "High", "priority_score": 80.0},
            {"name": "Medium", "priority_score": 50.0},
        ]
        result = sort_by_priority(features)
        assert result[0]["name"] == "High"
        assert result[1]["name"] == "Medium"
        assert result[2]["name"] == "Low"

    def test_sorts_ascending_when_specified(self):
        """Should sort lowest priority first when descending=False."""
        features = [
            {"name": "High", "priority_score": 80.0},
            {"name": "Low", "priority_score": 20.0},
            {"name": "Medium", "priority_score": 50.0},
        ]
        result = sort_by_priority(features, descending=False)
        assert result[0]["name"] == "Low"
        assert result[1]["name"] == "Medium"
        assert result[2]["name"] == "High"

    def test_handles_missing_priority_score(self):
        """Features without priority_score should sort as 0."""
        features = [
            {"name": "With Score", "priority_score": 50.0},
            {"name": "No Score"},
        ]
        result = sort_by_priority(features)
        assert result[0]["name"] == "With Score"
        assert result[1]["name"] == "No Score"

    def test_preserves_order_for_equal_scores(self):
        """Features with equal scores should maintain relative order."""
        features = [
            {"name": "First", "priority_score": 50.0},
            {"name": "Second", "priority_score": 50.0},
            {"name": "Third", "priority_score": 50.0},
        ]
        result = sort_by_priority(features)
        # Python's sort is stable, so order should be preserved
        assert result[0]["name"] == "First"
        assert result[1]["name"] == "Second"
        assert result[2]["name"] == "Third"

    def test_returns_new_list(self):
        """Should return a new list, not mutate original."""
        features = [
            {"name": "B", "priority_score": 20.0},
            {"name": "A", "priority_score": 80.0},
        ]
        result = sort_by_priority(features)
        # Original should be unchanged
        assert features[0]["name"] == "B"
        # Result should be sorted
        assert result[0]["name"] == "A"

    def test_handles_single_item(self):
        """Single item list should return same item."""
        features = [{"name": "Only", "priority_score": 50.0}]
        result = sort_by_priority(features)
        assert len(result) == 1
        assert result[0]["name"] == "Only"


class TestPriorityScoreDataclass:
    """Tests for PriorityScore dataclass."""

    def test_has_score_field(self):
        """Should have score field."""
        ps = PriorityScore(score=75.0, level=PriorityLevel.HIGH, breakdown={})
        assert ps.score == 75.0

    def test_has_level_field(self):
        """Should have level field."""
        ps = PriorityScore(score=75.0, level=PriorityLevel.HIGH, breakdown={})
        assert ps.level == PriorityLevel.HIGH

    def test_has_breakdown_field(self):
        """Should have breakdown field."""
        breakdown = {"acceleration": 30.0, "impact": 25.0}
        ps = PriorityScore(score=55.0, level=PriorityLevel.MEDIUM, breakdown=breakdown)
        assert ps.breakdown == breakdown


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_float_precision(self):
        """Should handle floating point precision issues."""
        # Values that might cause precision issues
        score = calculate_priority(
            acceleration=33.33,
            impact=33.33,
            feasibility=33.33,
            strategic_alignment=33.33,
            dependency=33.33,
        )
        # Result should be close to 33.33
        assert 33.0 < score < 34.0

    def test_very_small_values(self):
        """Should handle very small values."""
        score = calculate_priority(
            acceleration=0.001,
            impact=0.001,
            feasibility=0.001,
            strategic_alignment=0.001,
            dependency=0.001,
        )
        assert score > 0.0
        assert score < 0.01

    def test_integer_inputs(self):
        """Should handle integer inputs."""
        score = calculate_priority(
            acceleration=100,
            impact=80,
            feasibility=60,
            strategic_alignment=40,
            dependency=20,
        )
        assert isinstance(score, float)
        assert score == 70.0

    def test_mixed_int_float_inputs(self):
        """Should handle mixed int and float inputs."""
        score = calculate_priority(
            acceleration=100,
            impact=80.5,
            feasibility=60,
            strategic_alignment=40.0,
            dependency=20,
        )
        assert isinstance(score, float)

    def test_boundary_at_exactly_80(self):
        """Score of exactly 80 should be critical."""
        level = get_priority_level(80.0)
        assert level == PriorityLevel.CRITICAL

    def test_boundary_at_exactly_60(self):
        """Score of exactly 60 should be high."""
        level = get_priority_level(60.0)
        assert level == PriorityLevel.HIGH

    def test_boundary_at_exactly_40(self):
        """Score of exactly 40 should be medium."""
        level = get_priority_level(40.0)
        assert level == PriorityLevel.MEDIUM

    def test_boundary_at_exactly_0(self):
        """Score of exactly 0 should be low."""
        level = get_priority_level(0.0)
        assert level == PriorityLevel.LOW
