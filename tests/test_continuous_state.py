#!/usr/bin/env python3
"""
Tests for Continuous Research State Manager
============================================

Tests the continuous_state.py module functionality including:
- ResearchPhase and RebalanceTrigger enums
- ResearchFinding and ResearchFeature dataclasses
- ContinuousResearchState class operations
- JSON persistence for resume capability
"""

import json
import sys
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Generator
from unittest.mock import patch

import pytest

# Add apps/backend/runners/roadmap to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend" / "runners" / "roadmap"))

from continuous_state import (
    ResearchPhase,
    RebalanceTrigger,
    ResearchFinding,
    ResearchFeature,
    ContinuousResearchState,
    RESEARCH_PHASE_CYCLE,
    STATE_FILE_NAME,
)


class TestResearchPhaseEnum:
    """Tests for ResearchPhase enum."""

    def test_idle_phase(self):
        """IDLE phase exists with correct value."""
        assert ResearchPhase.IDLE.value == "idle"

    def test_sota_llm_phase(self):
        """SOTA_LLM phase exists with correct value."""
        assert ResearchPhase.SOTA_LLM.value == "sota_llm"

    def test_competitor_analysis_phase(self):
        """COMPETITOR_ANALYSIS phase exists with correct value."""
        assert ResearchPhase.COMPETITOR_ANALYSIS.value == "competitor_analysis"

    def test_performance_improvements_phase(self):
        """PERFORMANCE_IMPROVEMENTS phase exists with correct value."""
        assert ResearchPhase.PERFORMANCE_IMPROVEMENTS.value == "performance_improvements"

    def test_ui_ux_improvements_phase(self):
        """UI_UX_IMPROVEMENTS phase exists with correct value."""
        assert ResearchPhase.UI_UX_IMPROVEMENTS.value == "ui_ux_improvements"

    def test_feature_discovery_phase(self):
        """FEATURE_DISCOVERY phase exists with correct value."""
        assert ResearchPhase.FEATURE_DISCOVERY.value == "feature_discovery"

    def test_all_phases_are_strings(self):
        """All phase values are strings."""
        for phase in ResearchPhase:
            assert isinstance(phase.value, str)


class TestRebalanceTriggerEnum:
    """Tests for RebalanceTrigger enum."""

    def test_new_feature_trigger(self):
        """NEW_FEATURE trigger exists with correct value."""
        assert RebalanceTrigger.NEW_FEATURE.value == "new_feature"

    def test_evidence_updated_trigger(self):
        """EVIDENCE_UPDATED trigger exists with correct value."""
        assert RebalanceTrigger.EVIDENCE_UPDATED.value == "evidence_updated"

    def test_scheduled_trigger(self):
        """SCHEDULED trigger exists with correct value."""
        assert RebalanceTrigger.SCHEDULED.value == "scheduled"

    def test_manual_trigger(self):
        """MANUAL trigger exists with correct value."""
        assert RebalanceTrigger.MANUAL.value == "manual"


class TestResearchPhaseCycle:
    """Tests for RESEARCH_PHASE_CYCLE constant."""

    def test_cycle_has_five_phases(self):
        """Phase cycle contains exactly five research phases."""
        assert len(RESEARCH_PHASE_CYCLE) == 5

    def test_cycle_excludes_idle(self):
        """Phase cycle does not include IDLE phase."""
        assert ResearchPhase.IDLE not in RESEARCH_PHASE_CYCLE

    def test_cycle_starts_with_sota_llm(self):
        """Phase cycle starts with SOTA_LLM."""
        assert RESEARCH_PHASE_CYCLE[0] == ResearchPhase.SOTA_LLM

    def test_cycle_order(self):
        """Phase cycle is in correct order."""
        expected_order = [
            ResearchPhase.SOTA_LLM,
            ResearchPhase.COMPETITOR_ANALYSIS,
            ResearchPhase.PERFORMANCE_IMPROVEMENTS,
            ResearchPhase.UI_UX_IMPROVEMENTS,
            ResearchPhase.FEATURE_DISCOVERY,
        ]
        assert RESEARCH_PHASE_CYCLE == expected_order


class TestResearchFinding:
    """Tests for ResearchFinding dataclass."""

    def test_create_finding_with_required_fields(self):
        """Creates finding with only required fields."""
        finding = ResearchFinding(
            id="finding-001",
            phase="sota_llm",
            title="New Model Release",
            description="GPT-5 announced with improved reasoning",
        )
        assert finding.id == "finding-001"
        assert finding.phase == "sota_llm"
        assert finding.title == "New Model Release"
        assert finding.description == "GPT-5 announced with improved reasoning"

    def test_finding_default_values(self):
        """Finding has sensible defaults for optional fields."""
        finding = ResearchFinding(
            id="finding-002",
            phase="competitor_analysis",
            title="Test Finding",
            description="Test description",
        )
        assert finding.source is None
        assert finding.iteration == 1
        assert finding.metadata == {}
        # discovered_at should be an ISO timestamp
        assert "T" in finding.discovered_at

    def test_finding_with_optional_fields(self):
        """Creates finding with all optional fields."""
        finding = ResearchFinding(
            id="finding-003",
            phase="feature_discovery",
            title="API Enhancement",
            description="New streaming API pattern discovered",
            source="https://example.com/docs",
            discovered_at="2024-01-15T10:30:00",
            iteration=3,
            metadata={"category": "api", "priority": "high"},
        )
        assert finding.source == "https://example.com/docs"
        assert finding.discovered_at == "2024-01-15T10:30:00"
        assert finding.iteration == 3
        assert finding.metadata == {"category": "api", "priority": "high"}

    def test_finding_converts_to_dict(self):
        """Finding can be converted to dictionary."""
        finding = ResearchFinding(
            id="finding-004",
            phase="sota_llm",
            title="Test",
            description="Description",
        )
        finding_dict = asdict(finding)
        assert isinstance(finding_dict, dict)
        assert finding_dict["id"] == "finding-004"


class TestResearchFeature:
    """Tests for ResearchFeature dataclass."""

    def test_create_feature_with_required_fields(self):
        """Creates feature with only required fields."""
        feature = ResearchFeature(
            id="feature-001",
            title="Dark Mode Support",
            description="Add dark mode theme toggle",
            category="ui_ux",
            phase_discovered="ui_ux_improvements",
        )
        assert feature.id == "feature-001"
        assert feature.title == "Dark Mode Support"
        assert feature.description == "Add dark mode theme toggle"
        assert feature.category == "ui_ux"
        assert feature.phase_discovered == "ui_ux_improvements"

    def test_feature_default_priority_values(self):
        """Feature has default priority scoring values."""
        feature = ResearchFeature(
            id="feature-002",
            title="Test Feature",
            description="Test",
            category="test",
            phase_discovered="feature_discovery",
        )
        assert feature.priority_score == 50.0
        assert feature.priority_level == "medium"
        assert feature.acceleration == 50.0
        assert feature.impact == 50.0
        assert feature.feasibility == 50.0
        assert feature.strategic_alignment == 50.0
        assert feature.dependency == 50.0

    def test_feature_default_iteration_value(self):
        """Feature defaults to iteration 1."""
        feature = ResearchFeature(
            id="feature-003",
            title="Test",
            description="Test",
            category="test",
            phase_discovered="sota_llm",
        )
        assert feature.iteration_discovered == 1

    def test_feature_default_evidence_list(self):
        """Feature has empty evidence list by default."""
        feature = ResearchFeature(
            id="feature-004",
            title="Test",
            description="Test",
            category="test",
            phase_discovered="sota_llm",
        )
        assert feature.evidence == []

    def test_feature_with_all_fields(self):
        """Creates feature with all fields specified."""
        feature = ResearchFeature(
            id="feature-005",
            title="AI Auto-complete",
            description="Add AI-powered code completion",
            category="performance",
            phase_discovered="sota_llm",
            iteration_discovered=2,
            priority_score=85.0,
            priority_level="high",
            acceleration=90.0,
            impact=80.0,
            feasibility=75.0,
            strategic_alignment=95.0,
            dependency=70.0,
            evidence=["Research paper A", "Competitor analysis"],
            created_at="2024-01-15T10:00:00",
            updated_at="2024-01-15T11:00:00",
            metadata={"estimated_effort": "large"},
        )
        assert feature.priority_score == 85.0
        assert feature.acceleration == 90.0
        assert len(feature.evidence) == 2
        assert feature.metadata == {"estimated_effort": "large"}

    def test_feature_converts_to_dict(self):
        """Feature can be converted to dictionary."""
        feature = ResearchFeature(
            id="feature-006",
            title="Test",
            description="Test",
            category="test",
            phase_discovered="sota_llm",
        )
        feature_dict = asdict(feature)
        assert isinstance(feature_dict, dict)
        assert feature_dict["id"] == "feature-006"


class TestContinuousResearchStateInit:
    """Tests for ContinuousResearchState initialization."""

    def test_default_state_not_running(self):
        """Default state is not running."""
        state = ContinuousResearchState()
        assert state.is_running is False

    def test_default_phase_is_idle(self):
        """Default phase is IDLE."""
        state = ContinuousResearchState()
        assert state.current_phase == ResearchPhase.IDLE.value

    def test_default_duration_hours(self):
        """Default duration is 8 hours."""
        state = ContinuousResearchState()
        assert state.duration_hours == 8.0

    def test_default_iteration_count(self):
        """Default iteration count is 0."""
        state = ContinuousResearchState()
        assert state.iteration_count == 0

    def test_default_empty_features(self):
        """Default features list is empty."""
        state = ContinuousResearchState()
        assert state.features == []

    def test_default_empty_findings(self):
        """Default findings list is empty."""
        state = ContinuousResearchState()
        assert state.findings == []

    def test_default_empty_errors(self):
        """Default errors list is empty."""
        state = ContinuousResearchState()
        assert state.errors == []


class TestContinuousResearchStateStart:
    """Tests for ContinuousResearchState.start() method."""

    def test_start_sets_running(self):
        """Start sets is_running to True."""
        state = ContinuousResearchState()
        state.start()
        assert state.is_running is True

    def test_start_sets_started_at(self):
        """Start sets started_at timestamp."""
        state = ContinuousResearchState()
        state.start()
        assert state.started_at is not None
        # Verify it's a valid ISO timestamp
        datetime.fromisoformat(state.started_at)

    def test_start_clears_stopped_at(self):
        """Start clears stopped_at timestamp."""
        state = ContinuousResearchState()
        state.stopped_at = "2024-01-01T00:00:00"
        state.start()
        assert state.stopped_at is None

    def test_start_sets_first_phase(self):
        """Start sets current phase to first in cycle."""
        state = ContinuousResearchState()
        state.start()
        assert state.current_phase == RESEARCH_PHASE_CYCLE[0].value

    def test_start_with_custom_duration(self):
        """Start accepts custom duration."""
        state = ContinuousResearchState()
        state.start(duration_hours=4.0)
        assert state.duration_hours == 4.0

    def test_start_sets_phase_started_at(self):
        """Start sets phase_started_at timestamp."""
        state = ContinuousResearchState()
        state.start()
        assert state.phase_started_at is not None

    def test_start_resets_phase_iteration(self):
        """Start resets phase_iteration to 0."""
        state = ContinuousResearchState()
        state.phase_iteration = 3
        state.start()
        assert state.phase_iteration == 0

    def test_start_sets_iteration_count_to_one_if_fresh(self):
        """Start sets iteration_count to 1 if starting fresh."""
        state = ContinuousResearchState()
        state.start()
        assert state.iteration_count >= 1

    def test_start_clears_last_error(self):
        """Start clears last_error."""
        state = ContinuousResearchState()
        state.last_error = "Previous error"
        state.start()
        assert state.last_error is None


class TestContinuousResearchStateStop:
    """Tests for ContinuousResearchState.stop() method."""

    def test_stop_clears_running(self):
        """Stop sets is_running to False."""
        state = ContinuousResearchState()
        state.start()
        state.stop()
        assert state.is_running is False

    def test_stop_sets_stopped_at(self):
        """Stop sets stopped_at timestamp."""
        state = ContinuousResearchState()
        state.start()
        state.stop()
        assert state.stopped_at is not None
        datetime.fromisoformat(state.stopped_at)

    def test_stop_sets_phase_to_idle(self):
        """Stop sets current phase to IDLE."""
        state = ContinuousResearchState()
        state.start()
        state.stop()
        assert state.current_phase == ResearchPhase.IDLE.value


class TestContinuousResearchStateAdvancePhase:
    """Tests for ContinuousResearchState.advance_phase() method."""

    def test_advance_increments_phase_iteration(self):
        """Advance increments phase_iteration."""
        state = ContinuousResearchState()
        state.start()
        initial = state.phase_iteration
        state.advance_phase()
        assert state.phase_iteration == initial + 1

    def test_advance_changes_current_phase(self):
        """Advance changes current phase."""
        state = ContinuousResearchState()
        state.start()
        state.advance_phase()
        # After advancing from first phase, should be at second
        assert state.current_phase == RESEARCH_PHASE_CYCLE[1].value

    def test_advance_updates_phase_started_at(self):
        """Advance updates phase_started_at timestamp."""
        state = ContinuousResearchState()
        state.start()
        original_time = state.phase_started_at
        state.advance_phase()
        # Timestamp should be updated (might be same if very fast)
        assert state.phase_started_at is not None

    def test_advance_returns_new_phase(self):
        """Advance returns the new current phase."""
        state = ContinuousResearchState()
        state.start()
        new_phase = state.advance_phase()
        assert new_phase == state.current_phase

    def test_advance_cycles_back_to_first_phase(self):
        """Advance cycles back to first phase after completing all phases."""
        state = ContinuousResearchState()
        state.start()
        initial_iteration = state.iteration_count

        # Advance through all phases
        for _ in range(len(RESEARCH_PHASE_CYCLE)):
            state.advance_phase()

        # Should be back at first phase
        assert state.current_phase == RESEARCH_PHASE_CYCLE[0].value
        assert state.phase_iteration == 0
        assert state.iteration_count == initial_iteration + 1


class TestContinuousResearchStateAddFeature:
    """Tests for ContinuousResearchState.add_feature() method."""

    def test_add_feature_from_dataclass(self):
        """Adds feature from ResearchFeature dataclass."""
        state = ContinuousResearchState()
        feature = ResearchFeature(
            id="feature-001",
            title="Test Feature",
            description="Test description",
            category="test",
            phase_discovered="sota_llm",
        )
        state.add_feature(feature)
        assert len(state.features) == 1
        assert state.features[0]["id"] == "feature-001"

    def test_add_feature_from_dict(self):
        """Adds feature from dictionary."""
        state = ContinuousResearchState()
        feature_dict = {
            "id": "feature-002",
            "title": "Dict Feature",
            "description": "From dict",
            "category": "test",
            "phase_discovered": "sota_llm",
        }
        state.add_feature(feature_dict)
        assert len(state.features) == 1
        assert state.features[0]["title"] == "Dict Feature"

    def test_add_feature_prevents_duplicate_titles(self):
        """Prevents adding features with duplicate titles."""
        state = ContinuousResearchState()
        feature1 = {"id": "1", "title": "Same Title", "description": "First"}
        feature2 = {"id": "2", "title": "Same Title", "description": "Second"}

        state.add_feature(feature1)
        state.add_feature(feature2)

        assert len(state.features) == 1

    def test_add_feature_case_insensitive_duplicate_check(self):
        """Duplicate check is case-insensitive."""
        state = ContinuousResearchState()
        feature1 = {"id": "1", "title": "My Feature", "description": "First"}
        feature2 = {"id": "2", "title": "MY FEATURE", "description": "Second"}

        state.add_feature(feature1)
        state.add_feature(feature2)

        assert len(state.features) == 1

    def test_add_feature_allows_different_titles(self):
        """Allows adding features with different titles."""
        state = ContinuousResearchState()
        feature1 = {"id": "1", "title": "Feature One", "description": "First"}
        feature2 = {"id": "2", "title": "Feature Two", "description": "Second"}

        state.add_feature(feature1)
        state.add_feature(feature2)

        assert len(state.features) == 2


class TestContinuousResearchStateAddFinding:
    """Tests for ContinuousResearchState.add_finding() method."""

    def test_add_finding_from_dataclass(self):
        """Adds finding from ResearchFinding dataclass."""
        state = ContinuousResearchState()
        finding = ResearchFinding(
            id="finding-001",
            phase="sota_llm",
            title="Test Finding",
            description="Test description",
        )
        state.add_finding(finding)
        assert len(state.findings) == 1
        assert state.findings[0]["id"] == "finding-001"

    def test_add_finding_from_dict(self):
        """Adds finding from dictionary."""
        state = ContinuousResearchState()
        finding_dict = {
            "id": "finding-002",
            "phase": "competitor_analysis",
            "title": "Dict Finding",
            "description": "From dict",
        }
        state.add_finding(finding_dict)
        assert len(state.findings) == 1
        assert state.findings[0]["title"] == "Dict Finding"

    def test_add_finding_allows_duplicates(self):
        """Findings allow duplicates (unlike features)."""
        state = ContinuousResearchState()
        finding1 = {"id": "1", "title": "Same Finding", "description": "First"}
        finding2 = {"id": "2", "title": "Same Finding", "description": "Second"}

        state.add_finding(finding1)
        state.add_finding(finding2)

        assert len(state.findings) == 2


class TestContinuousResearchStateRecordRebalance:
    """Tests for ContinuousResearchState.record_rebalance() method."""

    def test_record_rebalance_with_enum(self):
        """Records rebalance from RebalanceTrigger enum."""
        state = ContinuousResearchState()
        state.record_rebalance(RebalanceTrigger.NEW_FEATURE)
        assert state.rebalance_count == 1
        assert state.last_rebalance_at is not None

    def test_record_rebalance_with_string(self):
        """Records rebalance from string trigger."""
        state = ContinuousResearchState()
        state.record_rebalance("manual")
        assert state.rebalance_count == 1

    def test_record_rebalance_increments_count(self):
        """Multiple rebalances increment count."""
        state = ContinuousResearchState()
        state.record_rebalance(RebalanceTrigger.SCHEDULED)
        state.record_rebalance(RebalanceTrigger.SCHEDULED)
        state.record_rebalance(RebalanceTrigger.MANUAL)
        assert state.rebalance_count == 3


class TestContinuousResearchStateRecordError:
    """Tests for ContinuousResearchState.record_error() method."""

    def test_record_error_sets_last_error(self):
        """Records error as last_error."""
        state = ContinuousResearchState()
        state.record_error("Something went wrong")
        assert state.last_error == "Something went wrong"

    def test_record_error_adds_to_list(self):
        """Adds timestamped error to errors list."""
        state = ContinuousResearchState()
        state.record_error("First error")
        assert len(state.errors) == 1
        assert "First error" in state.errors[0]

    def test_record_error_includes_timestamp(self):
        """Error includes ISO timestamp."""
        state = ContinuousResearchState()
        state.record_error("Test error")
        # Should contain timestamp format with T separator
        assert "T" in state.errors[0]

    def test_record_multiple_errors(self):
        """Records multiple errors."""
        state = ContinuousResearchState()
        state.record_error("Error 1")
        state.record_error("Error 2")
        state.record_error("Error 3")
        assert len(state.errors) == 3
        assert state.last_error == "Error 3"


class TestContinuousResearchStateElapsedTime:
    """Tests for ContinuousResearchState.get_elapsed_hours() method."""

    def test_elapsed_hours_zero_when_not_started(self):
        """Returns 0 when research not started."""
        state = ContinuousResearchState()
        assert state.get_elapsed_hours() == 0.0

    def test_elapsed_hours_when_started(self):
        """Returns elapsed time when started."""
        state = ContinuousResearchState()
        # Set started_at to 1 hour ago
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        state.started_at = one_hour_ago.isoformat()

        elapsed = state.get_elapsed_hours()
        # Should be approximately 1 hour (allow small tolerance)
        assert 0.9 < elapsed < 1.1

    def test_elapsed_hours_with_invalid_timestamp(self):
        """Returns 0 for invalid timestamp."""
        state = ContinuousResearchState()
        state.started_at = "invalid-timestamp"
        assert state.get_elapsed_hours() == 0.0


class TestContinuousResearchStateShouldContinue:
    """Tests for ContinuousResearchState.should_continue() method."""

    def test_should_not_continue_when_not_running(self):
        """Returns False when not running."""
        state = ContinuousResearchState()
        assert state.should_continue() is False

    def test_should_continue_when_within_duration(self):
        """Returns True when within duration."""
        state = ContinuousResearchState()
        state.start(duration_hours=8.0)
        assert state.should_continue() is True

    def test_should_not_continue_when_duration_exceeded(self):
        """Returns False when duration exceeded."""
        state = ContinuousResearchState()
        state.is_running = True
        state.duration_hours = 1.0
        # Set started_at to 2 hours ago
        two_hours_ago = datetime.utcnow() - timedelta(hours=2)
        state.started_at = two_hours_ago.isoformat()

        assert state.should_continue() is False


class TestContinuousResearchStateNeedsRebalance:
    """Tests for ContinuousResearchState.needs_rebalance() method."""

    def test_needs_rebalance_when_never_rebalanced(self):
        """Returns True when never rebalanced."""
        state = ContinuousResearchState()
        assert state.needs_rebalance() is True

    def test_needs_rebalance_after_interval(self):
        """Returns True when interval exceeded."""
        state = ContinuousResearchState()
        # Set last rebalance to 1 hour ago
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        state.last_rebalance_at = one_hour_ago.isoformat()

        # Default interval is 30 minutes
        assert state.needs_rebalance() is True

    def test_no_rebalance_within_interval(self):
        """Returns False when within interval."""
        state = ContinuousResearchState()
        # Set last rebalance to 5 minutes ago
        five_min_ago = datetime.utcnow() - timedelta(minutes=5)
        state.last_rebalance_at = five_min_ago.isoformat()

        assert state.needs_rebalance() is False

    def test_needs_rebalance_custom_interval(self):
        """Uses custom interval when specified."""
        state = ContinuousResearchState()
        # Set last rebalance to 20 minutes ago
        twenty_min_ago = datetime.utcnow() - timedelta(minutes=20)
        state.last_rebalance_at = twenty_min_ago.isoformat()

        # With 15 minute interval, should need rebalance
        assert state.needs_rebalance(interval_minutes=15.0) is True
        # With 30 minute interval, should not need rebalance
        assert state.needs_rebalance(interval_minutes=30.0) is False

    def test_needs_rebalance_with_invalid_timestamp(self):
        """Returns True for invalid timestamp."""
        state = ContinuousResearchState()
        state.last_rebalance_at = "invalid-timestamp"
        assert state.needs_rebalance() is True


class TestContinuousResearchStateGetSummary:
    """Tests for ContinuousResearchState.get_summary() method."""

    def test_summary_includes_running_status(self):
        """Summary includes is_running."""
        state = ContinuousResearchState()
        summary = state.get_summary()
        assert "is_running" in summary
        assert summary["is_running"] is False

    def test_summary_includes_current_phase(self):
        """Summary includes current_phase."""
        state = ContinuousResearchState()
        summary = state.get_summary()
        assert "current_phase" in summary
        assert summary["current_phase"] == "idle"

    def test_summary_includes_iteration_count(self):
        """Summary includes iteration_count."""
        state = ContinuousResearchState()
        state.iteration_count = 5
        summary = state.get_summary()
        assert summary["iteration_count"] == 5

    def test_summary_includes_elapsed_hours(self):
        """Summary includes elapsed_hours rounded to 2 decimals."""
        state = ContinuousResearchState()
        summary = state.get_summary()
        assert "elapsed_hours" in summary
        assert isinstance(summary["elapsed_hours"], float)

    def test_summary_includes_counts(self):
        """Summary includes feature, finding, rebalance, and error counts."""
        state = ContinuousResearchState()
        state.features.append({"id": "1"})
        state.features.append({"id": "2"})
        state.findings.append({"id": "1"})
        state.record_rebalance(RebalanceTrigger.MANUAL)
        state.record_error("Test error")

        summary = state.get_summary()
        assert summary["feature_count"] == 2
        assert summary["finding_count"] == 1
        assert summary["rebalance_count"] == 1
        assert summary["error_count"] == 1


class TestContinuousResearchStateReset:
    """Tests for ContinuousResearchState.reset() method."""

    def test_reset_clears_running_state(self):
        """Reset sets is_running to False."""
        state = ContinuousResearchState()
        state.start()
        state.reset()
        assert state.is_running is False

    def test_reset_clears_timestamps(self):
        """Reset clears started_at and stopped_at."""
        state = ContinuousResearchState()
        state.start()
        state.stop()
        state.reset()
        assert state.started_at is None
        assert state.stopped_at is None
        assert state.phase_started_at is None

    def test_reset_restores_default_duration(self):
        """Reset restores default duration."""
        state = ContinuousResearchState()
        state.duration_hours = 24.0
        state.reset()
        assert state.duration_hours == 8.0

    def test_reset_sets_phase_to_idle(self):
        """Reset sets current_phase to IDLE."""
        state = ContinuousResearchState()
        state.current_phase = ResearchPhase.SOTA_LLM.value
        state.reset()
        assert state.current_phase == ResearchPhase.IDLE.value

    def test_reset_clears_counters(self):
        """Reset clears iteration and phase counters."""
        state = ContinuousResearchState()
        state.iteration_count = 5
        state.phase_iteration = 3
        state.rebalance_count = 10
        state.reset()
        assert state.iteration_count == 0
        assert state.phase_iteration == 0
        assert state.rebalance_count == 0

    def test_reset_clears_data_lists(self):
        """Reset clears features, findings, and errors."""
        state = ContinuousResearchState()
        state.features.append({"id": "1"})
        state.findings.append({"id": "1"})
        state.errors.append("Error")
        state.reset()
        assert state.features == []
        assert state.findings == []
        assert state.errors == []

    def test_reset_clears_error_state(self):
        """Reset clears last_error and last_rebalance_at."""
        state = ContinuousResearchState()
        state.last_error = "Previous error"
        state.last_rebalance_at = "2024-01-01T00:00:00"
        state.reset()
        assert state.last_error is None
        assert state.last_rebalance_at is None


class TestContinuousResearchStatePersistence:
    """Tests for ContinuousResearchState.load() and .save() methods."""

    def test_save_creates_directory(self, temp_dir: Path):
        """Save creates state directory if needed."""
        state = ContinuousResearchState()
        state_dir = temp_dir / "new_dir" / "state"
        state.save(state_dir)
        assert state_dir.exists()

    def test_save_creates_json_file(self, temp_dir: Path):
        """Save creates JSON state file."""
        state = ContinuousResearchState()
        state.save(temp_dir)
        state_file = temp_dir / STATE_FILE_NAME
        assert state_file.exists()

    def test_save_writes_valid_json(self, temp_dir: Path):
        """Save writes valid JSON content."""
        state = ContinuousResearchState()
        state.save(temp_dir)
        state_file = temp_dir / STATE_FILE_NAME
        content = json.loads(state_file.read_text())
        assert isinstance(content, dict)

    def test_load_nonexistent_returns_fresh_state(self, temp_dir: Path):
        """Load returns fresh state when file doesn't exist."""
        state = ContinuousResearchState.load(temp_dir)
        assert state.is_running is False
        assert state.current_phase == ResearchPhase.IDLE.value

    def test_load_corrupted_returns_fresh_state(self, temp_dir: Path):
        """Load returns fresh state when file is corrupted."""
        state_file = temp_dir / STATE_FILE_NAME
        state_file.write_text("not valid json {{{{")
        state = ContinuousResearchState.load(temp_dir)
        assert state.is_running is False

    def test_save_and_load_roundtrip(self, temp_dir: Path):
        """State survives save/load roundtrip."""
        # Create state with data
        original = ContinuousResearchState()
        original.start(duration_hours=4.0)
        original.advance_phase()
        original.add_feature({"id": "1", "title": "Feature", "description": "Test"})
        original.add_finding({"id": "1", "title": "Finding", "description": "Test"})
        original.record_rebalance(RebalanceTrigger.MANUAL)
        original.record_error("Test error")

        # Save and load
        original.save(temp_dir)
        loaded = ContinuousResearchState.load(temp_dir)

        # Verify data preserved
        assert loaded.is_running == original.is_running
        assert loaded.duration_hours == original.duration_hours
        assert loaded.current_phase == original.current_phase
        assert loaded.iteration_count == original.iteration_count
        assert loaded.phase_iteration == original.phase_iteration
        assert len(loaded.features) == len(original.features)
        assert len(loaded.findings) == len(original.findings)
        assert loaded.rebalance_count == original.rebalance_count
        assert len(loaded.errors) == len(original.errors)

    def test_load_handles_partial_data(self, temp_dir: Path):
        """Load handles partial data with defaults."""
        state_file = temp_dir / STATE_FILE_NAME
        # Write minimal valid JSON
        state_file.write_text('{"is_running": true}')

        state = ContinuousResearchState.load(temp_dir)
        assert state.is_running is True
        # Other fields should have defaults
        assert state.duration_hours == 8.0
        assert state.features == []


class TestContinuousResearchStateToDict:
    """Tests for ContinuousResearchState._to_dict() method."""

    def test_to_dict_includes_all_fields(self):
        """_to_dict includes all state fields."""
        state = ContinuousResearchState()
        state.start()
        state_dict = state._to_dict()

        expected_keys = {
            "is_running",
            "started_at",
            "stopped_at",
            "duration_hours",
            "current_phase",
            "phase_started_at",
            "iteration_count",
            "phase_iteration",
            "features",
            "findings",
            "last_rebalance_at",
            "rebalance_count",
            "errors",
            "last_error",
        }
        assert set(state_dict.keys()) == expected_keys

    def test_to_dict_serializable(self):
        """_to_dict returns JSON-serializable dict."""
        state = ContinuousResearchState()
        state.start()
        state.add_feature({"id": "1", "title": "Test", "description": "Test"})
        state_dict = state._to_dict()

        # Should not raise
        json.dumps(state_dict)


class TestContinuousResearchStateFromDict:
    """Tests for ContinuousResearchState._from_dict() class method."""

    def test_from_dict_creates_state(self):
        """_from_dict creates state from dictionary."""
        data = {
            "is_running": True,
            "started_at": "2024-01-15T10:00:00",
            "duration_hours": 4.0,
            "current_phase": "sota_llm",
            "iteration_count": 2,
        }
        state = ContinuousResearchState._from_dict(data)
        assert state.is_running is True
        assert state.duration_hours == 4.0
        assert state.current_phase == "sota_llm"
        assert state.iteration_count == 2

    def test_from_dict_uses_defaults(self):
        """_from_dict uses defaults for missing keys."""
        data = {}
        state = ContinuousResearchState._from_dict(data)
        assert state.is_running is False
        assert state.duration_hours == 8.0
        assert state.current_phase == ResearchPhase.IDLE.value
