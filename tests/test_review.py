#!/usr/bin/env python3
"""
Tests for Human Review System
=============================

Tests the review.py module functionality including:
- ReviewState dataclass (persistence, load/save)
- Approval and rejection workflows
- Spec change detection (hash validation)
- Display functions
- Review status summary
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from review import (
    ReviewState,
    ReviewChoice,
    REVIEW_STATE_FILE,
    get_review_status_summary,
    get_review_menu_options,
    extract_section,
    truncate_text,
)
from review.state import _compute_file_hash, _compute_spec_hash


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def review_spec_dir(tmp_path: Path) -> Path:
    """Create a spec directory with spec.md and implementation_plan.json."""
    spec_dir = tmp_path / "spec"
    spec_dir.mkdir(parents=True)

    # Create spec.md
    spec_content = """# Test Feature

## Overview

This is a test feature specification for unit testing purposes.

## Workflow Type

**Type**: feature

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `app/main.py` | backend | Add new endpoint |
| `src/components/Test.tsx` | frontend | Add new component |

## Files to Create

| File | Service | Purpose |
|------|---------|---------|
| `app/utils/helper.py` | backend | Helper functions |

## Success Criteria

The task is complete when:

- [ ] New endpoint responds correctly
- [ ] Component renders without errors
- [ ] All tests pass
"""
    (spec_dir / "spec.md").write_text(spec_content)

    # Create implementation_plan.json
    plan = {
        "feature": "Test Feature",
        "workflow_type": "feature",
        "services_involved": ["backend", "frontend"],
        "phases": [
            {
                "phase": 1,
                "name": "Backend Foundation",
                "type": "setup",
                "chunks": [
                    {
                        "id": "chunk-1-1",
                        "description": "Add new endpoint",
                        "service": "backend",
                        "status": "pending",
                    },
                ],
            },
        ],
        "final_acceptance": ["Feature works correctly"],
        "summary": {
            "total_phases": 1,
            "total_chunks": 1,
        },
    }
    (spec_dir / "implementation_plan.json").write_text(json.dumps(plan, indent=2))

    return spec_dir


@pytest.fixture
def approved_state() -> ReviewState:
    """Create an approved ReviewState."""
    return ReviewState(
        approved=True,
        approved_by="test_user",
        approved_at="2024-01-15T10:30:00",
        feedback=["Looks good!", "Minor suggestion added."],
        spec_hash="abc123",
        review_count=2,
    )


@pytest.fixture
def pending_state() -> ReviewState:
    """Create a pending (not approved) ReviewState."""
    return ReviewState(
        approved=False,
        approved_by="",
        approved_at="",
        feedback=["Need more details on API."],
        spec_hash="",
        review_count=1,
    )


# =============================================================================
# REVIEW STATE - BASIC FUNCTIONALITY
# =============================================================================

class TestReviewStateBasics:
    """Tests for ReviewState basic functionality."""

    def test_default_state(self):
        """New ReviewState has correct defaults."""
        state = ReviewState()

        assert state.approved is False
        assert state.approved_by == ""
        assert state.approved_at == ""
        assert state.feedback == []
        assert state.spec_hash == ""
        assert state.review_count == 0

    def test_to_dict(self, approved_state: ReviewState):
        """to_dict() returns correct dictionary."""
        d = approved_state.to_dict()

        assert d["approved"] is True
        assert d["approved_by"] == "test_user"
        assert d["approved_at"] == "2024-01-15T10:30:00"
        assert d["feedback"] == ["Looks good!", "Minor suggestion added."]
        assert d["spec_hash"] == "abc123"
        assert d["review_count"] == 2

    def test_from_dict(self):
        """from_dict() creates correct ReviewState."""
        data = {
            "approved": True,
            "approved_by": "user1",
            "approved_at": "2024-02-20T14:00:00",
            "feedback": ["Test feedback"],
            "spec_hash": "xyz789",
            "review_count": 5,
        }

        state = ReviewState.from_dict(data)

        assert state.approved is True
        assert state.approved_by == "user1"
        assert state.approved_at == "2024-02-20T14:00:00"
        assert state.feedback == ["Test feedback"]
        assert state.spec_hash == "xyz789"
        assert state.review_count == 5

    def test_from_dict_with_missing_fields(self):
        """from_dict() handles missing fields with defaults."""
        data = {"approved": True}

        state = ReviewState.from_dict(data)

        assert state.approved is True
        assert state.approved_by == ""
        assert state.approved_at == ""
        assert state.feedback == []
        assert state.spec_hash == ""
        assert state.review_count == 0

    def test_from_dict_empty(self):
        """from_dict() handles empty dictionary."""
        state = ReviewState.from_dict({})

        assert state.approved is False
        assert state.approved_by == ""
        assert state.review_count == 0


# =============================================================================
# REVIEW STATE - LOAD/SAVE
# =============================================================================

class TestReviewStatePersistence:
    """Tests for ReviewState load and save operations."""

    def test_save_creates_file(self, tmp_path: Path):
        """save() creates review_state.json file."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state = ReviewState(approved=True, approved_by="user")
        state.save(spec_dir)

        state_file = spec_dir / REVIEW_STATE_FILE
        assert state_file.exists()

    def test_save_writes_correct_json(self, tmp_path: Path):
        """save() writes correct JSON content."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state = ReviewState(
            approved=True,
            approved_by="test_user",
            approved_at="2024-01-01T00:00:00",
            feedback=["Good work"],
            spec_hash="hash123",
            review_count=3,
        )
        state.save(spec_dir)

        state_file = spec_dir / REVIEW_STATE_FILE
        with open(state_file) as f:
            data = json.load(f)

        assert data["approved"] is True
        assert data["approved_by"] == "test_user"
        assert data["feedback"] == ["Good work"]
        assert data["review_count"] == 3

    def test_load_existing_file(self, tmp_path: Path):
        """load() reads existing review_state.json file."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        # Create state file manually
        data = {
            "approved": True,
            "approved_by": "manual_user",
            "approved_at": "2024-03-15T09:00:00",
            "feedback": ["Manually created"],
            "spec_hash": "manual_hash",
            "review_count": 1,
        }
        state_file = spec_dir / REVIEW_STATE_FILE
        state_file.write_text(json.dumps(data))

        state = ReviewState.load(spec_dir)

        assert state.approved is True
        assert state.approved_by == "manual_user"
        assert state.feedback == ["Manually created"]

    def test_load_missing_file(self, tmp_path: Path):
        """load() returns empty state when file doesn't exist."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state = ReviewState.load(spec_dir)

        assert state.approved is False
        assert state.approved_by == ""
        assert state.review_count == 0

    def test_load_corrupted_json(self, tmp_path: Path):
        """load() returns empty state for corrupted JSON."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state_file = spec_dir / REVIEW_STATE_FILE
        state_file.write_text("{ invalid json }")

        state = ReviewState.load(spec_dir)

        assert state.approved is False
        assert state.review_count == 0

    def test_load_empty_file(self, tmp_path: Path):
        """load() returns empty state for empty file."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state_file = spec_dir / REVIEW_STATE_FILE
        state_file.write_text("")

        state = ReviewState.load(spec_dir)

        assert state.approved is False

    def test_save_and_load_roundtrip(self, tmp_path: Path):
        """save() and load() preserve state correctly."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        original = ReviewState(
            approved=True,
            approved_by="roundtrip_user",
            approved_at="2024-06-01T12:00:00",
            feedback=["First review", "Second review"],
            spec_hash="roundtrip_hash",
            review_count=7,
        )
        original.save(spec_dir)

        loaded = ReviewState.load(spec_dir)

        assert loaded.approved == original.approved
        assert loaded.approved_by == original.approved_by
        assert loaded.approved_at == original.approved_at
        assert loaded.feedback == original.feedback
        assert loaded.spec_hash == original.spec_hash
        assert loaded.review_count == original.review_count


# =============================================================================
# REVIEW STATE - APPROVAL METHODS
# =============================================================================

class TestReviewStateApproval:
    """Tests for approve(), reject(), and related methods."""

    def test_is_approved_true(self, approved_state: ReviewState):
        """is_approved() returns True for approved state."""
        assert approved_state.is_approved() is True

    def test_is_approved_false(self, pending_state: ReviewState):
        """is_approved() returns False for pending state."""
        assert pending_state.is_approved() is False

    def test_approve_sets_fields(self, review_spec_dir: Path):
        """approve() sets all required fields correctly."""
        state = ReviewState()

        # Freeze time for consistent testing
        with patch("review.state.datetime") as mock_datetime:
            mock_datetime.now.return_value.isoformat.return_value = "2024-07-01T10:00:00"
            state.approve(review_spec_dir, approved_by="approver")

        assert state.approved is True
        assert state.approved_by == "approver"
        assert state.approved_at == "2024-07-01T10:00:00"
        assert state.spec_hash != ""  # Hash should be computed
        assert state.review_count == 1

    def test_approve_increments_review_count(self, review_spec_dir: Path):
        """approve() increments review_count each time."""
        state = ReviewState(review_count=3)

        state.approve(review_spec_dir, approved_by="user", auto_save=False)

        assert state.review_count == 4

    def test_approve_auto_saves(self, review_spec_dir: Path):
        """approve() saves state when auto_save=True (default)."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user")

        state_file = review_spec_dir / REVIEW_STATE_FILE
        assert state_file.exists()

        loaded = ReviewState.load(review_spec_dir)
        assert loaded.approved is True

    def test_approve_no_auto_save(self, review_spec_dir: Path):
        """approve() doesn't save when auto_save=False."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user", auto_save=False)

        state_file = review_spec_dir / REVIEW_STATE_FILE
        assert not state_file.exists()

    def test_reject_clears_approval(self, review_spec_dir: Path):
        """reject() clears approval fields."""
        state = ReviewState(
            approved=True,
            approved_by="old_user",
            approved_at="2024-01-01T00:00:00",
            spec_hash="old_hash",
            review_count=5,
        )

        state.reject(review_spec_dir, auto_save=False)

        assert state.approved is False
        assert state.approved_by == ""
        assert state.approved_at == ""
        assert state.spec_hash == ""
        assert state.review_count == 6  # Still incremented

    def test_invalidate_keeps_feedback(self, review_spec_dir: Path):
        """invalidate() keeps feedback history."""
        state = ReviewState(
            approved=True,
            approved_by="user",
            feedback=["Important feedback"],
            spec_hash="hash",
        )

        state.invalidate(review_spec_dir, auto_save=False)

        assert state.approved is False
        assert state.spec_hash == ""
        assert state.feedback == ["Important feedback"]  # Preserved
        assert state.approved_by == "user"  # Kept as history


# =============================================================================
# REVIEW STATE - HASH VALIDATION
# =============================================================================

class TestSpecHashValidation:
    """Tests for spec change detection using hash."""

    def test_compute_file_hash_existing_file(self, tmp_path: Path):
        """_compute_file_hash() returns hash for existing file."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Hello, World!")

        file_hash = _compute_file_hash(test_file)

        # Verify it's a valid MD5 hash
        assert len(file_hash) == 32
        assert all(c in "0123456789abcdef" for c in file_hash)

    def test_compute_file_hash_missing_file(self, tmp_path: Path):
        """_compute_file_hash() returns empty string for missing file."""
        missing_file = tmp_path / "nonexistent.txt"

        file_hash = _compute_file_hash(missing_file)

        assert file_hash == ""

    def test_compute_file_hash_deterministic(self, tmp_path: Path):
        """_compute_file_hash() returns same hash for same content."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("Consistent content")

        hash1 = _compute_file_hash(test_file)
        hash2 = _compute_file_hash(test_file)

        assert hash1 == hash2

    def test_compute_file_hash_different_content(self, tmp_path: Path):
        """_compute_file_hash() returns different hash for different content."""
        test_file = tmp_path / "test.txt"

        test_file.write_text("Content A")
        hash_a = _compute_file_hash(test_file)

        test_file.write_text("Content B")
        hash_b = _compute_file_hash(test_file)

        assert hash_a != hash_b

    def test_compute_spec_hash(self, review_spec_dir: Path):
        """_compute_spec_hash() computes combined hash of spec files."""
        spec_hash = _compute_spec_hash(review_spec_dir)

        # Should be a valid MD5 hash
        assert len(spec_hash) == 32
        assert all(c in "0123456789abcdef" for c in spec_hash)

    def test_compute_spec_hash_changes_on_spec_edit(self, review_spec_dir: Path):
        """_compute_spec_hash() changes when spec.md is modified."""
        hash_before = _compute_spec_hash(review_spec_dir)

        # Modify spec.md
        spec_file = review_spec_dir / "spec.md"
        spec_file.write_text("Modified content")

        hash_after = _compute_spec_hash(review_spec_dir)

        assert hash_before != hash_after

    def test_compute_spec_hash_changes_on_plan_edit(self, review_spec_dir: Path):
        """_compute_spec_hash() changes when plan is modified."""
        hash_before = _compute_spec_hash(review_spec_dir)

        # Modify implementation_plan.json
        plan_file = review_spec_dir / "implementation_plan.json"
        plan_file.write_text('{"modified": true}')

        hash_after = _compute_spec_hash(review_spec_dir)

        assert hash_before != hash_after

    def test_is_approval_valid_with_matching_hash(self, review_spec_dir: Path):
        """is_approval_valid() returns True when hash matches."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user", auto_save=False)

        assert state.is_approval_valid(review_spec_dir) is True

    def test_is_approval_valid_with_changed_spec(self, review_spec_dir: Path):
        """is_approval_valid() returns False when spec changed."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user", auto_save=False)

        # Modify spec after approval
        spec_file = review_spec_dir / "spec.md"
        spec_file.write_text("New content after approval")

        assert state.is_approval_valid(review_spec_dir) is False

    def test_is_approval_valid_not_approved(self, review_spec_dir: Path):
        """is_approval_valid() returns False when not approved."""
        state = ReviewState(approved=False)

        assert state.is_approval_valid(review_spec_dir) is False

    def test_is_approval_valid_legacy_no_hash(self, review_spec_dir: Path):
        """is_approval_valid() returns True for legacy approvals without hash."""
        state = ReviewState(
            approved=True,
            approved_by="legacy_user",
            spec_hash="",  # No hash (legacy approval)
        )

        assert state.is_approval_valid(review_spec_dir) is True


# =============================================================================
# REVIEW STATE - FEEDBACK
# =============================================================================

class TestReviewStateFeedback:
    """Tests for feedback functionality."""

    def test_add_feedback(self, tmp_path: Path):
        """add_feedback() adds timestamped feedback."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state = ReviewState()
        state.add_feedback("Great work!", spec_dir, auto_save=False)

        assert len(state.feedback) == 1
        # Should have timestamp prefix
        assert "]" in state.feedback[0]
        assert "Great work!" in state.feedback[0]

    def test_add_multiple_feedback(self, tmp_path: Path):
        """add_feedback() accumulates feedback."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state = ReviewState()
        state.add_feedback("First comment", spec_dir, auto_save=False)
        state.add_feedback("Second comment", spec_dir, auto_save=False)

        assert len(state.feedback) == 2
        assert "First comment" in state.feedback[0]
        assert "Second comment" in state.feedback[1]

    def test_add_feedback_auto_saves(self, tmp_path: Path):
        """add_feedback() saves when auto_save=True."""
        spec_dir = tmp_path / "spec"
        spec_dir.mkdir()

        state = ReviewState()
        state.add_feedback("Saved feedback", spec_dir, auto_save=True)

        loaded = ReviewState.load(spec_dir)
        assert len(loaded.feedback) == 1
        assert "Saved feedback" in loaded.feedback[0]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

class TestHelperFunctions:
    """Tests for helper functions."""

    def testextract_section_found(self):
        """extract_section() extracts content correctly."""
        content = """# Title

## Overview

This is the overview section.

## Details

This is the details section.
"""
        overview = extract_section(content, "## Overview")

        assert "This is the overview section." in overview
        assert "This is the details section." not in overview

    def testextract_section_not_found(self):
        """extract_section() returns empty string when not found."""
        content = """# Title

## Existing Section

Content here.
"""
        result = extract_section(content, "## Missing Section")

        assert result == ""

    def testextract_section_last_section(self):
        """extract_section() handles last section correctly."""
        content = """# Title

## First

First content.

## Last

Last content.
"""
        last = extract_section(content, "## Last")

        assert "Last content." in last

    def testtruncate_text_short(self):
        """truncate_text() returns short text unchanged."""
        short_text = "Short text"

        result = truncate_text(short_text, max_lines=10, max_chars=100)

        assert result == "Short text"

    def testtruncate_text_too_many_lines(self):
        """truncate_text() truncates by line count."""
        long_text = "\n".join(f"Line {i}" for i in range(20))

        result = truncate_text(long_text, max_lines=5, max_chars=1000)

        # Should contain 5 lines from original + "..." on new line
        lines = result.split("\n")
        assert lines[-1] == "..."
        assert len(lines) <= 6  # 5 content lines + "..." line
        assert "Line 0" in result
        assert "Line 4" in result

    def testtruncate_text_too_many_chars(self):
        """truncate_text() truncates by character count."""
        long_text = "A" * 500

        result = truncate_text(long_text, max_lines=100, max_chars=100)

        assert len(result) <= 100
        assert result.endswith("...")


# =============================================================================
# REVIEW STATUS SUMMARY
# =============================================================================

class TestReviewStatusSummary:
    """Tests for get_review_status_summary()."""

    def test_summary_approved_valid(self, review_spec_dir: Path):
        """Summary for approved and valid state."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="summary_user")

        summary = get_review_status_summary(review_spec_dir)

        assert summary["approved"] is True
        assert summary["valid"] is True
        assert summary["approved_by"] == "summary_user"
        assert summary["spec_changed"] is False

    def test_summary_approved_stale(self, review_spec_dir: Path):
        """Summary for approved but stale state."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user")

        # Modify spec after approval
        (review_spec_dir / "spec.md").write_text("Changed!")

        summary = get_review_status_summary(review_spec_dir)

        assert summary["approved"] is True
        assert summary["valid"] is False
        assert summary["spec_changed"] is True

    def test_summary_not_approved(self, review_spec_dir: Path):
        """Summary for not approved state."""
        summary = get_review_status_summary(review_spec_dir)

        assert summary["approved"] is False
        assert summary["valid"] is False
        assert summary["approved_by"] == ""

    def test_summary_with_feedback(self, review_spec_dir: Path):
        """Summary includes feedback count."""
        state = ReviewState(feedback=["One", "Two", "Three"])
        state.save(review_spec_dir)

        summary = get_review_status_summary(review_spec_dir)

        assert summary["feedback_count"] == 3


# =============================================================================
# REVIEW MENU OPTIONS
# =============================================================================

class TestReviewMenuOptions:
    """Tests for review menu configuration."""

    def test_get_review_menu_options_count(self):
        """get_review_menu_options() returns correct number of options."""
        options = get_review_menu_options()

        assert len(options) == 5

    @pytest.mark.xfail(
        reason="Test isolation issue: review module mocked by test_spec_pipeline.py persists due to Python import caching. Passes when run individually.",
        strict=False,
    )
    def test_get_review_menu_options_keys(self):
        """get_review_menu_options() has correct keys."""
        options = get_review_menu_options()
        keys = [opt.key for opt in options]

        assert ReviewChoice.APPROVE.value in keys
        assert ReviewChoice.EDIT_SPEC.value in keys
        assert ReviewChoice.EDIT_PLAN.value in keys
        assert ReviewChoice.FEEDBACK.value in keys
        assert ReviewChoice.REJECT.value in keys

    def test_get_review_menu_options_have_labels(self):
        """All menu options have labels and descriptions."""
        options = get_review_menu_options()

        for opt in options:
            assert opt.label != ""
            assert opt.description != ""

    def test_review_choice_enum_values(self):
        """ReviewChoice enum has expected values."""
        assert ReviewChoice.APPROVE.value == "approve"
        assert ReviewChoice.EDIT_SPEC.value == "edit_spec"
        assert ReviewChoice.EDIT_PLAN.value == "edit_plan"
        assert ReviewChoice.FEEDBACK.value == "feedback"
        assert ReviewChoice.REJECT.value == "reject"


# =============================================================================
# FULL REVIEW FLOW (INTEGRATION)
# =============================================================================

class TestFullReviewFlow:
    """Integration tests for full review workflow."""

    def test_full_approval_flow(self, review_spec_dir: Path):
        """Test complete approval flow."""
        # 1. Initially not approved
        state = ReviewState.load(review_spec_dir)
        assert not state.is_approved()

        # 2. Add feedback
        state.add_feedback("Needs minor changes", review_spec_dir)

        # 3. Approve
        state.approve(review_spec_dir, approved_by="reviewer")

        # 4. Verify state
        assert state.is_approved()
        assert state.is_approval_valid(review_spec_dir)

        # 5. Reload and verify persisted
        reloaded = ReviewState.load(review_spec_dir)
        assert reloaded.is_approved()
        assert reloaded.approved_by == "reviewer"
        assert len(reloaded.feedback) == 1

    def test_approval_invalidation_on_change(self, review_spec_dir: Path):
        """Test that spec changes invalidate approval."""
        # 1. Approve initially
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user")
        assert state.is_approval_valid(review_spec_dir)

        # 2. Modify spec.md
        spec_file = review_spec_dir / "spec.md"
        original_content = spec_file.read_text()
        spec_file.write_text(original_content + "\n## New Section\n\nAdded content.")

        # 3. Approval should now be invalid
        assert not state.is_approval_valid(review_spec_dir)

        # 4. Re-approve with new hash
        state.approve(review_spec_dir, approved_by="user")
        assert state.is_approval_valid(review_spec_dir)

    def test_rejection_flow(self, review_spec_dir: Path):
        """Test rejection workflow."""
        # 1. Approve first
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="user")
        assert state.is_approved()

        # 2. Reject
        state.reject(review_spec_dir)

        # 3. Verify state
        assert not state.is_approved()

        # 4. Reload and verify
        reloaded = ReviewState.load(review_spec_dir)
        assert not reloaded.is_approved()

    def test_auto_approve_flow(self, review_spec_dir: Path):
        """Test auto-approve workflow."""
        state = ReviewState()
        state.approve(review_spec_dir, approved_by="auto")

        assert state.is_approved()
        assert state.approved_by == "auto"
        assert state.is_approval_valid(review_spec_dir)

    def test_multiple_review_sessions(self, review_spec_dir: Path):
        """Test multiple review sessions increment count correctly."""
        state = ReviewState()
        assert state.review_count == 0

        # First review - approve
        state.approve(review_spec_dir, approved_by="user1")
        assert state.review_count == 1

        # Modify spec to invalidate
        (review_spec_dir / "spec.md").write_text("Changed content")
        state.invalidate(review_spec_dir)

        # Second review - reject
        state.reject(review_spec_dir)
        assert state.review_count == 2

        # Third review - approve again
        state.approve(review_spec_dir, approved_by="user2")
        assert state.review_count == 3


# =============================================================================
# INTEGRATION TESTS - FULL REVIEW WORKFLOW
# =============================================================================

class TestFullReviewWorkflowIntegration:
    """
    Integration tests for the complete review workflow.

    These tests verify the full flow from spec creation through
    approval, build readiness check, and invalidation scenarios.
    """

    @pytest.fixture
    def complete_spec_dir(self, tmp_path: Path) -> Path:
        """Create a complete spec directory mimicking real spec_runner output."""
        spec_dir = tmp_path / "specs" / "001-test-feature"
        spec_dir.mkdir(parents=True)

        # Create a realistic spec.md
        spec_content = """# Specification: Test Feature Implementation

## Overview

This is a test feature that adds new functionality to the system.
It involves changes to both backend and frontend components.

## Workflow Type

**Type**: feature

**Rationale**: New capability requiring multiple coordinated changes.

## Task Scope

### Services Involved
- **backend** - API endpoints and business logic
- **frontend** - UI components and state management

### This Task Will:
- [ ] Add new REST API endpoint
- [ ] Create frontend form component
- [ ] Add validation logic
- [ ] Write unit tests

### Out of Scope:
- Database schema changes
- Authentication modifications

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `app/api/routes.py` | backend | Add new endpoint |
| `src/components/Form.tsx` | frontend | Add form component |
| `app/services/processor.py` | backend | Add business logic |

## Files to Create

| File | Service | Purpose |
|------|---------|---------|
| `app/api/handlers/new_feature.py` | backend | Handler implementation |
| `src/components/NewFeature/index.tsx` | frontend | New component |
| `tests/test_new_feature.py` | backend | Unit tests |

## Requirements

### Functional Requirements

1. **API Endpoint**
   - Description: New endpoint for feature data
   - Acceptance: Returns correct JSON response

2. **Form Component**
   - Description: User-facing form for data entry
   - Acceptance: Form validates and submits correctly

## Success Criteria

The task is complete when:

- [ ] API endpoint returns correct response format
- [ ] Form component renders without errors
- [ ] Form validation works correctly
- [ ] Unit tests pass with >80% coverage
- [ ] Integration tests pass
"""
        (spec_dir / "spec.md").write_text(spec_content)

        # Create a realistic implementation_plan.json
        plan = {
            "feature": "Test Feature Implementation",
            "workflow_type": "feature",
            "services_involved": ["backend", "frontend"],
            "phases": [
                {
                    "phase": 1,
                    "name": "Backend Foundation",
                    "type": "setup",
                    "depends_on": [],
                    "parallel_safe": True,
                    "chunks": [
                        {
                            "id": "chunk-1-1",
                            "description": "Create API endpoint handler",
                            "service": "backend",
                            "files_to_create": ["app/api/handlers/new_feature.py"],
                            "files_to_modify": ["app/api/routes.py"],
                            "status": "pending",
                        },
                        {
                            "id": "chunk-1-2",
                            "description": "Add business logic",
                            "service": "backend",
                            "files_to_modify": ["app/services/processor.py"],
                            "status": "pending",
                        },
                    ],
                },
                {
                    "phase": 2,
                    "name": "Frontend Implementation",
                    "type": "implementation",
                    "depends_on": [1],
                    "parallel_safe": False,
                    "chunks": [
                        {
                            "id": "chunk-2-1",
                            "description": "Create form component",
                            "service": "frontend",
                            "files_to_create": ["src/components/NewFeature/index.tsx"],
                            "files_to_modify": ["src/components/Form.tsx"],
                            "status": "pending",
                        },
                    ],
                },
                {
                    "phase": 3,
                    "name": "Testing",
                    "type": "testing",
                    "depends_on": [1, 2],
                    "parallel_safe": True,
                    "chunks": [
                        {
                            "id": "chunk-3-1",
                            "description": "Add unit tests",
                            "service": "backend",
                            "files_to_create": ["tests/test_new_feature.py"],
                            "status": "pending",
                        },
                    ],
                },
            ],
            "final_acceptance": [
                "All API endpoints work correctly",
                "Frontend components render without errors",
                "All tests pass",
            ],
            "summary": {
                "total_phases": 3,
                "total_chunks": 4,
                "services_involved": ["backend", "frontend"],
                "parallelism": {
                    "max_parallel_phases": 1,
                    "recommended_workers": 2,
                },
            },
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:00:00",
        }
        (spec_dir / "implementation_plan.json").write_text(json.dumps(plan, indent=2))

        return spec_dir

    def test_full_review_flow(self, complete_spec_dir: Path):
        """
        Test the complete review flow from start to finish.

        This test verifies:
        1. Initial state is not approved
        2. Approval creates review_state.json
        3. After approval, is_approval_valid returns True
        4. Modifying spec invalidates approval
        5. Re-approval works correctly
        """
        # 1. Initial state - no approval
        state = ReviewState.load(complete_spec_dir)
        assert not state.is_approved()
        assert not state.is_approval_valid(complete_spec_dir)

        # Verify review_state.json doesn't exist yet
        state_file = complete_spec_dir / REVIEW_STATE_FILE
        assert not state_file.exists()

        # 2. User adds feedback before approving
        state.add_feedback("Please clarify the API response format", complete_spec_dir)

        # 3. User approves
        state.approve(complete_spec_dir, approved_by="developer")

        # Verify state file was created
        assert state_file.exists()

        # 4. Verify approval is valid
        assert state.is_approved()
        assert state.is_approval_valid(complete_spec_dir)
        assert state.approved_by == "developer"
        assert state.approved_at != ""
        assert state.spec_hash != ""
        assert state.review_count == 1
        assert len(state.feedback) == 1

        # 5. Simulate run.py check - should pass
        reloaded = ReviewState.load(complete_spec_dir)
        assert reloaded.is_approval_valid(complete_spec_dir)

        # 6. Modify spec.md (simulating user edit)
        spec_file = complete_spec_dir / "spec.md"
        original_content = spec_file.read_text()
        spec_file.write_text(original_content + "\n\n## Additional Notes\n\nSome extra information.\n")

        # 7. Approval should now be invalid (spec changed)
        assert not reloaded.is_approval_valid(complete_spec_dir)

        # 8. Reload and verify still shows approved but invalid
        fresh_state = ReviewState.load(complete_spec_dir)
        assert fresh_state.approved is True  # Still marked approved
        assert not fresh_state.is_approval_valid(complete_spec_dir)  # But not valid

        # 9. Re-approve after changes
        fresh_state.approve(complete_spec_dir, approved_by="developer")
        assert fresh_state.is_approval_valid(complete_spec_dir)
        assert fresh_state.review_count == 2

    def test_run_py_approval_check_simulation(self, complete_spec_dir: Path):
        """
        Test the approval check logic as run.py would use it.

        This simulates the exact check that run.py performs before
        starting a build.
        """
        # Initial state - run.py would block
        review_state = ReviewState.load(complete_spec_dir)
        build_should_proceed = review_state.is_approval_valid(complete_spec_dir)
        assert not build_should_proceed, "Build should be blocked without approval"

        # After approval - run.py would proceed
        review_state.approve(complete_spec_dir, approved_by="user")
        build_should_proceed = review_state.is_approval_valid(complete_spec_dir)
        assert build_should_proceed, "Build should proceed after approval"

        # Simulate force flag bypass (even without valid approval)
        review_state.reject(complete_spec_dir)
        force_flag = True
        if force_flag:
            # run.py with --force would proceed even without approval
            build_should_proceed = True
        else:
            build_should_proceed = review_state.is_approval_valid(complete_spec_dir)
        assert build_should_proceed, "Force flag should bypass approval check"

    def test_spec_change_detection_accuracy(self, complete_spec_dir: Path):
        """
        Test that spec change detection works for various types of changes.
        """
        # Approve initially
        state = ReviewState()
        state.approve(complete_spec_dir, approved_by="user", auto_save=False)
        original_hash = state.spec_hash
        assert state.is_approval_valid(complete_spec_dir)

        # Test 1: Whitespace-only change should change hash
        spec_file = complete_spec_dir / "spec.md"
        original_content = spec_file.read_text()
        spec_file.write_text(original_content + "\n\n\n")
        assert not state.is_approval_valid(complete_spec_dir)

        # Restore
        spec_file.write_text(original_content)
        assert state.is_approval_valid(complete_spec_dir)

        # Test 2: Plan modification should invalidate
        plan_file = complete_spec_dir / "implementation_plan.json"
        plan_content = plan_file.read_text()
        plan = json.loads(plan_content)
        plan["phases"][0]["chunks"][0]["status"] = "completed"
        plan_file.write_text(json.dumps(plan, indent=2))
        assert not state.is_approval_valid(complete_spec_dir)

        # Test 3: New hash should be different
        state.approve(complete_spec_dir, approved_by="user", auto_save=False)
        assert state.spec_hash != original_hash

    def test_feedback_persistence_across_sessions(self, complete_spec_dir: Path):
        """
        Test that feedback is preserved across review sessions.
        """
        # First session - add feedback
        state1 = ReviewState()
        state1.add_feedback("First review comment", complete_spec_dir)
        state1.add_feedback("Another observation", complete_spec_dir)

        # Simulate new session
        state2 = ReviewState.load(complete_spec_dir)
        assert len(state2.feedback) == 2
        assert "First review comment" in state2.feedback[0]
        assert "Another observation" in state2.feedback[1]

        # Add more feedback in second session
        state2.add_feedback("Follow-up from second review", complete_spec_dir)

        # Third session - verify all feedback
        state3 = ReviewState.load(complete_spec_dir)
        assert len(state3.feedback) == 3

    def test_auto_approve_workflow(self, complete_spec_dir: Path):
        """
        Test the auto-approve workflow (--auto-approve flag).
        """
        # Simulate spec_runner.py with --auto-approve
        state = ReviewState()
        state.approve(complete_spec_dir, approved_by="auto")

        assert state.is_approved()
        assert state.approved_by == "auto"
        assert state.is_approval_valid(complete_spec_dir)

        # Verify state file
        loaded = ReviewState.load(complete_spec_dir)
        assert loaded.approved_by == "auto"

    def test_rejection_preserves_history(self, complete_spec_dir: Path):
        """
        Test that rejection properly clears approval but preserves feedback.
        """
        # Initial approval with feedback
        state = ReviewState()
        state.add_feedback("Looks good initially", complete_spec_dir, auto_save=False)
        state.approve(complete_spec_dir, approved_by="first_reviewer")

        original_feedback = state.feedback.copy()
        assert state.is_approved()

        # Reject
        state.reject(complete_spec_dir)

        assert not state.is_approved()
        assert not state.is_approval_valid(complete_spec_dir)
        assert state.approved_by == ""  # Cleared
        assert state.approved_at == ""  # Cleared
        assert state.spec_hash == ""  # Cleared
        assert state.feedback == original_feedback  # Preserved
        assert state.review_count == 2  # Incremented

    def test_invalidate_vs_reject_difference(self, complete_spec_dir: Path):
        """
        Test the difference between invalidate() and reject().

        invalidate() - Used when spec changes; keeps approved_by as history
        reject() - User explicitly rejects; clears all approval info
        """
        # Setup: Approved state
        state = ReviewState()
        state.approve(complete_spec_dir, approved_by="original_approver")
        state.add_feedback("Initial feedback", complete_spec_dir, auto_save=False)

        # Test invalidate() - keeps history
        state_for_invalidate = ReviewState.from_dict(state.to_dict())
        state_for_invalidate.invalidate(complete_spec_dir, auto_save=False)

        assert not state_for_invalidate.approved
        assert state_for_invalidate.approved_by == "original_approver"  # Kept as history
        assert state_for_invalidate.approved_at == ""  # Cleared
        assert state_for_invalidate.spec_hash == ""  # Cleared
        assert len(state_for_invalidate.feedback) == 1  # Preserved

        # Test reject() - clears everything
        state_for_reject = ReviewState.from_dict(state.to_dict())
        state_for_reject.reject(complete_spec_dir, auto_save=False)

        assert not state_for_reject.approved
        assert state_for_reject.approved_by == ""  # Cleared
        assert state_for_reject.approved_at == ""  # Cleared
        assert state_for_reject.spec_hash == ""  # Cleared
        assert len(state_for_reject.feedback) == 1  # Preserved

    def test_status_summary_reflects_current_state(self, complete_spec_dir: Path):
        """
        Test that get_review_status_summary() accurately reflects state.
        """
        # Not approved
        summary1 = get_review_status_summary(complete_spec_dir)
        assert not summary1["approved"]
        assert not summary1["valid"]
        assert summary1["review_count"] == 0

        # Approved
        state = ReviewState()
        state.add_feedback("Test feedback", complete_spec_dir)
        state.approve(complete_spec_dir, approved_by="test_user")

        summary2 = get_review_status_summary(complete_spec_dir)
        assert summary2["approved"]
        assert summary2["valid"]
        assert summary2["approved_by"] == "test_user"
        assert summary2["feedback_count"] == 1
        assert not summary2["spec_changed"]

        # Spec changed
        (complete_spec_dir / "spec.md").write_text("Changed content")

        summary3 = get_review_status_summary(complete_spec_dir)
        assert summary3["approved"]  # Still marked approved
        assert not summary3["valid"]  # But not valid
        assert summary3["spec_changed"]

    def test_concurrent_access_safety(self, complete_spec_dir: Path):
        """
        Test that multiple load/save operations don't corrupt state.

        While not truly concurrent (no threading), this tests
        that sequential load/modify/save operations work correctly.
        """
        # First process loads and starts modifying
        state1 = ReviewState.load(complete_spec_dir)
        state1.add_feedback("Feedback from process 1", complete_spec_dir, auto_save=False)

        # Second process loads and modifies
        state2 = ReviewState.load(complete_spec_dir)
        state2.add_feedback("Feedback from process 2", complete_spec_dir)

        # First process saves (overwrites second's changes)
        state1.save(complete_spec_dir)

        # Verify final state (last writer wins)
        final = ReviewState.load(complete_spec_dir)
        assert len(final.feedback) == 1
        assert "process 1" in final.feedback[0]

    def test_review_count_tracks_all_interactions(self, complete_spec_dir: Path):
        """
        Test that review_count accurately tracks user interactions.
        """
        state = ReviewState()
        assert state.review_count == 0

        # Approve
        state.approve(complete_spec_dir, approved_by="user")
        assert state.review_count == 1

        # Invalidate (spec changed)
        state.invalidate(complete_spec_dir)
        # Note: invalidate doesn't increment review_count

        # Re-approve
        state.approve(complete_spec_dir, approved_by="user")
        assert state.review_count == 2

        # Reject
        state.reject(complete_spec_dir)
        assert state.review_count == 3

        # Approve again
        state.approve(complete_spec_dir, approved_by="user")
        assert state.review_count == 4
