#!/usr/bin/env python3
"""
Tests for QA Report Module
===========================

Tests the qa/report.py module functionality including:
- Iteration tracking (get_iteration_history, record_iteration)
- Recurring issue detection (_normalize_issue_key, _issue_similarity, has_recurring_issues)
- Recurring issue summary (get_recurring_issue_summary)
- No-test project handling (check_test_discovery, is_no_test_project)
- Manual test plan creation (create_manual_test_plan)

Note: This test module mocks all dependencies to avoid importing
the Claude SDK which is not available in the test environment.
"""

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# =============================================================================
# MOCK SETUP - Must happen before ANY imports from auto-claude
# =============================================================================

# Store original modules for cleanup
_original_modules = {}
_mocked_module_names = [
    'claude_agent_sdk',
    'ui',
    'progress',
    'task_logger',
    'linear_updater',
    'client',
]

for name in _mocked_module_names:
    if name in sys.modules:
        _original_modules[name] = sys.modules[name]

# Mock claude_agent_sdk FIRST (before any other imports)
mock_sdk = MagicMock()
mock_sdk.ClaudeSDKClient = MagicMock()
mock_sdk.ClaudeAgentOptions = MagicMock()
mock_sdk.ClaudeCodeOptions = MagicMock()
sys.modules['claude_agent_sdk'] = mock_sdk

# Mock UI module (used by progress)
mock_ui = MagicMock()
mock_ui.Icons = MagicMock()
mock_ui.icon = MagicMock(return_value="")
mock_ui.color = MagicMock()
mock_ui.Color = MagicMock()
mock_ui.success = MagicMock(return_value="")
mock_ui.error = MagicMock(return_value="")
mock_ui.warning = MagicMock(return_value="")
mock_ui.info = MagicMock(return_value="")
mock_ui.muted = MagicMock(return_value="")
mock_ui.highlight = MagicMock(return_value="")
mock_ui.bold = MagicMock(return_value="")
mock_ui.box = MagicMock(return_value="")
mock_ui.divider = MagicMock(return_value="")
mock_ui.progress_bar = MagicMock(return_value="")
mock_ui.print_header = MagicMock()
mock_ui.print_section = MagicMock()
mock_ui.print_status = MagicMock()
mock_ui.print_phase_status = MagicMock()
mock_ui.print_key_value = MagicMock()
sys.modules['ui'] = mock_ui

# Mock progress module
mock_progress = MagicMock()
mock_progress.count_subtasks = MagicMock(return_value=(3, 3))
mock_progress.is_build_complete = MagicMock(return_value=True)
sys.modules['progress'] = mock_progress

# Mock task_logger
mock_task_logger = MagicMock()
mock_task_logger.LogPhase = MagicMock()
mock_task_logger.LogEntryType = MagicMock()
mock_task_logger.get_task_logger = MagicMock(return_value=None)
sys.modules['task_logger'] = mock_task_logger

# Mock linear_updater
mock_linear = MagicMock()
mock_linear.is_linear_enabled = MagicMock(return_value=False)
mock_linear.LinearTaskState = MagicMock()
mock_linear.linear_qa_started = MagicMock()
mock_linear.linear_qa_approved = MagicMock()
mock_linear.linear_qa_rejected = MagicMock()
mock_linear.linear_qa_max_iterations = MagicMock()
sys.modules['linear_updater'] = mock_linear

# Mock client module
mock_client = MagicMock()
mock_client.create_client = MagicMock()
sys.modules['client'] = mock_client

# Now we can safely add the auto-claude path and import
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

# Import report functions directly to avoid going through qa/__init__.py
from qa.report import (
    # Iteration tracking
    get_iteration_history,
    record_iteration,
    # Recurring issue detection
    _normalize_issue_key,
    _issue_similarity,
    has_recurring_issues,
    get_recurring_issue_summary,
    # No-test project handling
    check_test_discovery,
    is_no_test_project,
    create_manual_test_plan,
    # Configuration
    RECURRING_ISSUE_THRESHOLD,
    ISSUE_SIMILARITY_THRESHOLD,
)

from qa.criteria import (
    load_implementation_plan,
    save_implementation_plan,
)


# =============================================================================
# FIXTURES
# =============================================================================


# Cleanup fixture to restore original modules after all tests in this module
@pytest.fixture(scope="module", autouse=True)
def cleanup_mocked_modules():
    """Restore original modules after all tests in this module complete."""
    yield  # Run all tests first
    # Cleanup: restore original modules or remove mocks
    for name in _mocked_module_names:
        if name in _original_modules:
            sys.modules[name] = _original_modules[name]
        elif name in sys.modules:
            del sys.modules[name]


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def spec_dir(temp_dir):
    """Create a spec directory with basic structure."""
    spec = temp_dir / "spec"
    spec.mkdir()
    return spec


@pytest.fixture
def project_dir(temp_dir):
    """Create a project directory."""
    project = temp_dir / "project"
    project.mkdir()
    return project


@pytest.fixture
def spec_with_plan(spec_dir):
    """Create a spec directory with implementation plan."""
    plan = {
        "spec_name": "test-spec",
        "qa_signoff": {
            "status": "pending",
            "qa_session": 0,
        }
    }
    plan_file = spec_dir / "implementation_plan.json"
    with open(plan_file, "w") as f:
        json.dump(plan, f)
    return spec_dir


# =============================================================================
# ITERATION TRACKING TESTS
# =============================================================================


class TestIterationTracking:
    """Tests for iteration tracking functionality."""

    def test_get_iteration_history_empty(self, spec_dir):
        """Test getting history from empty spec."""
        history = get_iteration_history(spec_dir)
        assert history == []

    def test_get_iteration_history_no_plan(self, spec_dir):
        """Test getting history when no plan exists."""
        history = get_iteration_history(spec_dir)
        assert history == []

    def test_get_iteration_history_no_history_key(self, spec_dir):
        """Test getting history when plan exists but no history key."""
        plan = {"spec_name": "test"}
        save_implementation_plan(spec_dir, plan)

        history = get_iteration_history(spec_dir)
        assert history == []

    def test_get_iteration_history_with_data(self, spec_dir):
        """Test getting history when data exists."""
        plan = {
            "spec_name": "test",
            "qa_iteration_history": [
                {"iteration": 1, "status": "rejected", "issues": []},
                {"iteration": 2, "status": "approved", "issues": []},
            ]
        }
        save_implementation_plan(spec_dir, plan)

        history = get_iteration_history(spec_dir)
        assert len(history) == 2
        assert history[0]["iteration"] == 1
        assert history[1]["status"] == "approved"

    def test_record_iteration_creates_history(self, spec_with_plan):
        """Test that recording an iteration creates history."""
        issues = [{"title": "Test issue", "type": "error"}]
        result = record_iteration(spec_with_plan, 1, "rejected", issues, 5.5)

        assert result is True

        history = get_iteration_history(spec_with_plan)
        assert len(history) == 1
        assert history[0]["iteration"] == 1
        assert history[0]["status"] == "rejected"
        assert history[0]["issues"] == issues
        assert history[0]["duration_seconds"] == 5.5

    def test_record_multiple_iterations(self, spec_with_plan):
        """Test recording multiple iterations."""
        record_iteration(spec_with_plan, 1, "rejected", [{"title": "Issue 1"}])
        record_iteration(spec_with_plan, 2, "rejected", [{"title": "Issue 2"}])
        record_iteration(spec_with_plan, 3, "approved", [])

        history = get_iteration_history(spec_with_plan)
        assert len(history) == 3
        assert history[0]["iteration"] == 1
        assert history[1]["iteration"] == 2
        assert history[2]["iteration"] == 3

    def test_record_iteration_updates_stats(self, spec_with_plan):
        """Test that recording updates qa_stats."""
        record_iteration(spec_with_plan, 1, "rejected", [{"title": "Error", "type": "error"}])
        record_iteration(spec_with_plan, 2, "rejected", [{"title": "Warning", "type": "warning"}])

        plan = load_implementation_plan(spec_with_plan)
        stats = plan.get("qa_stats", {})

        assert stats["total_iterations"] == 2
        assert stats["last_iteration"] == 2
        assert stats["last_status"] == "rejected"
        assert "error" in stats["issues_by_type"]
        assert "warning" in stats["issues_by_type"]

    def test_record_iteration_no_duration(self, spec_with_plan):
        """Test recording without duration."""
        record_iteration(spec_with_plan, 1, "approved", [])

        history = get_iteration_history(spec_with_plan)
        assert "duration_seconds" not in history[0]

    def test_record_iteration_no_plan_file(self, spec_dir):
        """Test recording when plan file doesn't exist."""
        # Should create the file
        result = record_iteration(spec_dir, 1, "rejected", [])

        assert result is True
        plan = load_implementation_plan(spec_dir)
        assert "qa_iteration_history" in plan

    def test_record_iteration_rounds_duration(self, spec_with_plan):
        """Test that duration is rounded to 2 decimal places."""
        record_iteration(spec_with_plan, 1, "rejected", [], 12.345678)

        history = get_iteration_history(spec_with_plan)
        assert history[0]["duration_seconds"] == 12.35

    def test_record_iteration_includes_timestamp(self, spec_with_plan):
        """Test that timestamp is included in record."""
        record_iteration(spec_with_plan, 1, "rejected", [])

        history = get_iteration_history(spec_with_plan)
        assert "timestamp" in history[0]
        # Verify it's a valid ISO format timestamp
        assert "T" in history[0]["timestamp"]

    def test_record_iteration_counts_issues_by_type(self, spec_with_plan):
        """Test that issues are counted by type."""
        record_iteration(spec_with_plan, 1, "rejected", [
            {"title": "Error 1", "type": "error"},
            {"title": "Error 2", "type": "error"},
            {"title": "Warning 1", "type": "warning"},
        ])

        plan = load_implementation_plan(spec_with_plan)
        assert plan["qa_stats"]["issues_by_type"]["error"] == 2
        assert plan["qa_stats"]["issues_by_type"]["warning"] == 1

    def test_record_iteration_unknown_issue_type(self, spec_with_plan):
        """Test issues without type are counted as unknown."""
        record_iteration(spec_with_plan, 1, "rejected", [
            {"title": "Issue without type"},
        ])

        plan = load_implementation_plan(spec_with_plan)
        assert plan["qa_stats"]["issues_by_type"]["unknown"] == 1


# =============================================================================
# RECURRING ISSUE DETECTION TESTS
# =============================================================================


class TestIssueNormalization:
    """Tests for issue key normalization."""

    def test_normalize_basic(self):
        """Test basic normalization."""
        issue = {"title": "Test Error", "file": "app.py", "line": 42}
        key = _normalize_issue_key(issue)

        assert "test error" in key
        assert "app.py" in key
        assert "42" in key

    def test_normalize_removes_prefixes(self):
        """Test that common prefixes are removed."""
        issue1 = {"title": "Error: Something wrong"}
        issue2 = {"title": "Something wrong"}

        key1 = _normalize_issue_key(issue1)
        key2 = _normalize_issue_key(issue2)

        # Should be similar after prefix removal
        assert "something wrong" in key1
        assert "something wrong" in key2

    def test_normalize_removes_issue_prefix(self):
        """Test that issue: prefix is removed."""
        issue = {"title": "Issue: Connection failed"}
        key = _normalize_issue_key(issue)

        assert key.startswith("connection failed")

    def test_normalize_removes_bug_prefix(self):
        """Test that bug: prefix is removed."""
        issue = {"title": "Bug: Memory leak"}
        key = _normalize_issue_key(issue)

        assert key.startswith("memory leak")

    def test_normalize_removes_fix_prefix(self):
        """Test that fix: prefix is removed."""
        issue = {"title": "Fix: Missing validation"}
        key = _normalize_issue_key(issue)

        assert key.startswith("missing validation")

    def test_normalize_missing_fields(self):
        """Test normalization with missing fields."""
        issue = {"title": "Test"}
        key = _normalize_issue_key(issue)

        assert "test" in key
        assert "||" in key  # Empty file and line

    def test_normalize_with_none_values(self):
        """Test handling of None values in issues."""
        issue = {"title": None, "file": None, "line": None}
        key = _normalize_issue_key(issue)

        # Should not crash
        assert isinstance(key, str)

    def test_normalize_empty_issue(self):
        """Test handling of empty issue."""
        issue = {}
        key = _normalize_issue_key(issue)

        assert key == "||"  # All empty fields

    def test_normalize_case_insensitive(self):
        """Test that normalization is case insensitive."""
        issue1 = {"title": "TEST ERROR", "file": "APP.PY"}
        issue2 = {"title": "test error", "file": "app.py"}

        key1 = _normalize_issue_key(issue1)
        key2 = _normalize_issue_key(issue2)

        assert key1 == key2


class TestIssueSimilarity:
    """Tests for issue similarity calculation."""

    def test_identical_issues(self):
        """Test similarity of identical issues."""
        issue = {"title": "Test error", "file": "app.py", "line": 10}

        similarity = _issue_similarity(issue, issue)
        assert similarity == 1.0

    def test_different_issues(self):
        """Test similarity of different issues."""
        issue1 = {"title": "Database connection failed", "file": "db.py"}
        issue2 = {"title": "Frontend rendering error", "file": "ui.js"}

        similarity = _issue_similarity(issue1, issue2)
        assert similarity < 0.5

    def test_similar_issues(self):
        """Test similarity of similar issues."""
        issue1 = {"title": "Type error in function foo", "file": "utils.py", "line": 10}
        issue2 = {"title": "Type error in function foo", "file": "utils.py", "line": 12}

        similarity = _issue_similarity(issue1, issue2)
        assert similarity > ISSUE_SIMILARITY_THRESHOLD

    def test_similarity_empty_issues(self):
        """Test similarity of empty issues."""
        issue1 = {}
        issue2 = {}

        similarity = _issue_similarity(issue1, issue2)
        assert similarity == 1.0  # Both empty = identical

    def test_similarity_returns_float(self):
        """Test that similarity returns a float between 0 and 1."""
        issue1 = {"title": "Error A"}
        issue2 = {"title": "Error B"}

        similarity = _issue_similarity(issue1, issue2)
        assert isinstance(similarity, float)
        assert 0.0 <= similarity <= 1.0


class TestHasRecurringIssues:
    """Tests for recurring issue detection."""

    def test_no_history(self):
        """Test with no history."""
        current = [{"title": "Test issue"}]
        history = []

        has_recurring, recurring = has_recurring_issues(current, history)

        assert has_recurring is False
        assert recurring == []

    def test_no_current_issues(self):
        """Test with no current issues."""
        current = []
        history = [{"issues": [{"title": "Old issue"}]}]

        has_recurring, recurring = has_recurring_issues(current, history)

        assert has_recurring is False
        assert recurring == []

    def test_no_recurring(self):
        """Test when no issues recur."""
        current = [{"title": "New issue"}]
        history = [
            {"issues": [{"title": "Old issue 1"}]},
            {"issues": [{"title": "Old issue 2"}]},
        ]

        has_recurring, recurring = has_recurring_issues(current, history)

        assert has_recurring is False

    def test_recurring_detected(self):
        """Test detection of recurring issues."""
        current = [{"title": "Same error", "file": "app.py"}]
        history = [
            {"issues": [{"title": "Same error", "file": "app.py"}]},
            {"issues": [{"title": "Same error", "file": "app.py"}]},
        ]

        # Current + 2 history = 3 occurrences >= threshold
        has_recurring, recurring = has_recurring_issues(current, history)

        assert has_recurring is True
        assert len(recurring) == 1
        assert recurring[0]["occurrence_count"] >= RECURRING_ISSUE_THRESHOLD

    def test_threshold_respected(self):
        """Test that threshold is respected."""
        current = [{"title": "Issue"}]
        # Only 1 historical occurrence + current = 2, below threshold of 3
        history = [{"issues": [{"title": "Issue"}]}]

        has_recurring, recurring = has_recurring_issues(current, history, threshold=3)

        assert has_recurring is False

    def test_custom_threshold(self):
        """Test with custom threshold."""
        current = [{"title": "Issue"}]
        history = [{"issues": [{"title": "Issue"}]}]

        # With threshold=2, 1 history + 1 current = 2, should trigger
        has_recurring, recurring = has_recurring_issues(current, history, threshold=2)

        assert has_recurring is True

    def test_multiple_recurring_issues(self):
        """Test detection of multiple recurring issues."""
        current = [
            {"title": "Error A", "file": "a.py"},
            {"title": "Error B", "file": "b.py"},
        ]
        history = [
            {"issues": [{"title": "Error A", "file": "a.py"}, {"title": "Error B", "file": "b.py"}]},
            {"issues": [{"title": "Error A", "file": "a.py"}, {"title": "Error B", "file": "b.py"}]},
        ]

        has_recurring, recurring = has_recurring_issues(current, history)

        assert has_recurring is True
        assert len(recurring) == 2

    def test_recurring_includes_occurrence_count(self):
        """Test that recurring issues include occurrence count."""
        current = [{"title": "Error", "file": "app.py"}]
        history = [
            {"issues": [{"title": "Error", "file": "app.py"}]},
            {"issues": [{"title": "Error", "file": "app.py"}]},
            {"issues": [{"title": "Error", "file": "app.py"}]},
        ]

        has_recurring, recurring = has_recurring_issues(current, history)

        assert has_recurring is True
        assert recurring[0]["occurrence_count"] == 4  # current + 3 history

    def test_history_with_missing_issues_key(self):
        """Test history records missing issues key."""
        current = [{"title": "Issue"}]
        history = [
            {"status": "rejected"},  # Missing 'issues' key
            {"status": "approved", "issues": []},
        ]

        # Should not crash
        has_recurring, recurring = has_recurring_issues(current, history)
        assert has_recurring is False


class TestRecurringIssueSummary:
    """Tests for recurring issue summary."""

    def test_empty_history(self):
        """Test summary with empty history."""
        summary = get_recurring_issue_summary([])

        assert summary["total_issues"] == 0
        assert summary["unique_issues"] == 0
        assert summary["most_common"] == []

    def test_summary_counts(self):
        """Test that summary counts are correct."""
        history = [
            {"status": "rejected", "issues": [{"title": "Error A"}, {"title": "Error B"}]},
            {"status": "rejected", "issues": [{"title": "Error A"}]},
            {"status": "approved", "issues": []},
        ]

        summary = get_recurring_issue_summary(history)

        assert summary["total_issues"] == 3
        assert summary["iterations_approved"] == 1
        assert summary["iterations_rejected"] == 2

    def test_most_common_sorted(self):
        """Test that most common issues are sorted."""
        history = [
            {"issues": [{"title": "Common"}, {"title": "Rare"}]},
            {"issues": [{"title": "Common"}]},
            {"issues": [{"title": "Common"}]},
        ]

        summary = get_recurring_issue_summary(history)

        # "Common" should be first with 3 occurrences
        assert len(summary["most_common"]) > 0
        assert summary["most_common"][0]["title"] == "Common"
        assert summary["most_common"][0]["occurrences"] == 3

    def test_most_common_limited_to_five(self):
        """Test that most_common is limited to 5 issues."""
        history = [
            {"issues": [
                {"title": "Issue 1"},
                {"title": "Issue 2"},
                {"title": "Issue 3"},
                {"title": "Issue 4"},
                {"title": "Issue 5"},
                {"title": "Issue 6"},
                {"title": "Issue 7"},
            ]},
        ]

        summary = get_recurring_issue_summary(history)

        assert len(summary["most_common"]) <= 5

    def test_fix_success_rate(self):
        """Test fix success rate calculation."""
        history = [
            {"status": "rejected", "issues": [{"title": "Issue"}]},
            {"status": "rejected", "issues": [{"title": "Issue"}]},
            {"status": "approved", "issues": []},
            {"status": "approved", "issues": []},
        ]

        summary = get_recurring_issue_summary(history)

        assert summary["fix_success_rate"] == 0.5

    def test_fix_success_rate_all_approved(self):
        """Test fix success rate when all approved with some issues."""
        # Note: When all issues lists are empty, the function returns early
        # with only basic stats. We need at least one issue to get fix_success_rate.
        history = [
            {"status": "approved", "issues": [{"title": "Fixed issue"}]},
            {"status": "approved", "issues": []},
        ]

        summary = get_recurring_issue_summary(history)

        assert summary["fix_success_rate"] == 1.0

    def test_fix_success_rate_all_rejected(self):
        """Test fix success rate when all rejected."""
        history = [
            {"status": "rejected", "issues": [{"title": "Issue"}]},
            {"status": "rejected", "issues": [{"title": "Issue"}]},
        ]

        summary = get_recurring_issue_summary(history)

        assert summary["fix_success_rate"] == 0.0

    def test_unique_issues_groups_similar(self):
        """Test that similar issues are grouped."""
        history = [
            {"issues": [{"title": "Type error in foo", "file": "app.py"}]},
            {"issues": [{"title": "Type error in foo", "file": "app.py"}]},
        ]

        summary = get_recurring_issue_summary(history)

        # Should group similar issues
        assert summary["unique_issues"] == 1
        assert summary["total_issues"] == 2

    def test_most_common_includes_file(self):
        """Test that most_common includes file path."""
        history = [
            {"issues": [{"title": "Error", "file": "app.py"}]},
        ]

        summary = get_recurring_issue_summary(history)

        assert summary["most_common"][0]["file"] == "app.py"

    def test_history_with_missing_issues_key(self):
        """Test history records missing issues key."""
        history = [
            {"status": "rejected"},  # Missing 'issues' key
            {"status": "approved", "issues": []},
        ]

        summary = get_recurring_issue_summary(history)
        # Should not crash
        assert summary["total_issues"] == 0


# =============================================================================
# NO-TEST PROJECT HANDLING TESTS
# =============================================================================


class TestCheckTestDiscovery:
    """Tests for test discovery check."""

    def test_no_discovery_file(self, spec_dir):
        """Test when discovery file doesn't exist."""
        result = check_test_discovery(spec_dir)
        assert result is None

    def test_valid_discovery_file(self, spec_dir):
        """Test reading valid discovery file."""
        discovery = {
            "frameworks": [{"name": "pytest", "type": "unit"}],
            "test_directories": ["tests/"]
        }
        discovery_file = spec_dir / "test_discovery.json"
        with open(discovery_file, "w") as f:
            json.dump(discovery, f)

        result = check_test_discovery(spec_dir)

        assert result is not None
        assert len(result["frameworks"]) == 1

    def test_invalid_json(self, spec_dir):
        """Test handling of invalid JSON."""
        discovery_file = spec_dir / "test_discovery.json"
        discovery_file.write_text("invalid json{")

        result = check_test_discovery(spec_dir)
        assert result is None

    def test_empty_json(self, spec_dir):
        """Test handling of empty JSON object."""
        discovery_file = spec_dir / "test_discovery.json"
        discovery_file.write_text("{}")

        result = check_test_discovery(spec_dir)
        assert result == {}


class TestIsNoTestProject:
    """Tests for no-test project detection."""

    def test_empty_project_is_no_test(self, spec_dir, project_dir):
        """Test that empty project has no tests."""
        result = is_no_test_project(spec_dir, project_dir)
        assert result is True

    def test_project_with_pytest_ini(self, spec_dir, project_dir):
        """Test detection of pytest.ini."""
        (project_dir / "pytest.ini").write_text("[pytest]")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_pyproject_toml(self, spec_dir, project_dir):
        """Test detection of pyproject.toml."""
        (project_dir / "pyproject.toml").write_text("[tool.pytest]")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_setup_cfg(self, spec_dir, project_dir):
        """Test detection of setup.cfg."""
        (project_dir / "setup.cfg").write_text("[options]")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_jest_config(self, spec_dir, project_dir):
        """Test detection of Jest config."""
        (project_dir / "jest.config.js").write_text("module.exports = {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_jest_config_ts(self, spec_dir, project_dir):
        """Test detection of Jest TypeScript config."""
        (project_dir / "jest.config.ts").write_text("export default {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_vitest_config(self, spec_dir, project_dir):
        """Test detection of Vitest config."""
        (project_dir / "vitest.config.js").write_text("export default {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_vitest_config_ts(self, spec_dir, project_dir):
        """Test detection of Vitest TypeScript config."""
        (project_dir / "vitest.config.ts").write_text("export default {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_karma_config(self, spec_dir, project_dir):
        """Test detection of Karma config."""
        (project_dir / "karma.conf.js").write_text("module.exports = function() {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_cypress_config(self, spec_dir, project_dir):
        """Test detection of Cypress config."""
        (project_dir / "cypress.config.js").write_text("module.exports = {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_playwright_config(self, spec_dir, project_dir):
        """Test detection of Playwright config."""
        (project_dir / "playwright.config.ts").write_text("export default {}")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_rspec(self, spec_dir, project_dir):
        """Test detection of RSpec config."""
        (project_dir / ".rspec").write_text("--format documentation")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_rspec_helper(self, spec_dir, project_dir):
        """Test detection of RSpec helper."""
        spec_dir_ruby = project_dir / "spec"
        spec_dir_ruby.mkdir()
        (spec_dir_ruby / "spec_helper.rb").write_text("RSpec.configure")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_test_directory(self, spec_dir, project_dir):
        """Test detection of test directory."""
        tests_dir = project_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "test_app.py").write_text("def test_example(): pass")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_test_directory_no_test_files(self, spec_dir, project_dir):
        """Test detection of empty test directory."""
        tests_dir = project_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "conftest.py").write_text("# fixtures only")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is True

    def test_project_with_spec_files(self, spec_dir, project_dir):
        """Test detection of spec files."""
        tests_dir = project_dir / "__tests__"
        tests_dir.mkdir()
        (tests_dir / "app.spec.js").write_text("describe('app', () => {})")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_test_files_js(self, spec_dir, project_dir):
        """Test detection of .test.js files."""
        tests_dir = project_dir / "__tests__"
        tests_dir.mkdir()
        (tests_dir / "app.test.js").write_text("test('works', () => {})")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_test_files_ts(self, spec_dir, project_dir):
        """Test detection of .test.ts files."""
        tests_dir = project_dir / "test"
        tests_dir.mkdir()
        (tests_dir / "app.test.ts").write_text("test('works', () => {})")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_spec_files_ts(self, spec_dir, project_dir):
        """Test detection of .spec.ts files."""
        tests_dir = project_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "app.spec.ts").write_text("describe('app', () => {})")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_project_with_python_test_suffix(self, spec_dir, project_dir):
        """Test detection of _test.py files."""
        tests_dir = project_dir / "tests"
        tests_dir.mkdir()
        (tests_dir / "app_test.py").write_text("def test_example(): pass")

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_uses_discovery_json_if_available(self, spec_dir, project_dir):
        """Test that discovery.json takes precedence."""
        # Project has no test files
        # But discovery.json says there are frameworks
        discovery = {"frameworks": [{"name": "pytest"}]}
        discovery_file = spec_dir / "test_discovery.json"
        with open(discovery_file, "w") as f:
            json.dump(discovery, f)

        result = is_no_test_project(spec_dir, project_dir)
        assert result is False

    def test_empty_discovery_means_no_tests(self, spec_dir, project_dir):
        """Test that empty discovery means no tests."""
        discovery = {"frameworks": []}
        discovery_file = spec_dir / "test_discovery.json"
        with open(discovery_file, "w") as f:
            json.dump(discovery, f)

        result = is_no_test_project(spec_dir, project_dir)
        assert result is True


class TestCreateManualTestPlan:
    """Tests for manual test plan creation."""

    def test_creates_file(self, spec_dir):
        """Test that file is created."""
        result = create_manual_test_plan(spec_dir, "test-feature")

        assert result.exists()
        assert result.name == "MANUAL_TEST_PLAN.md"

    def test_contains_spec_name(self, spec_dir):
        """Test that plan contains spec name."""
        result = create_manual_test_plan(spec_dir, "my-feature")

        content = result.read_text()
        assert "my-feature" in content

    def test_contains_checklist(self, spec_dir):
        """Test that plan contains checklist items."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "[ ]" in content  # Checkbox items

    def test_contains_sections(self, spec_dir):
        """Test that plan contains required sections."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "## Overview" in content
        assert "## Functional Tests" in content
        assert "## Non-Functional Tests" in content
        assert "## Sign-off" in content

    def test_contains_pre_test_setup(self, spec_dir):
        """Test that plan contains pre-test setup section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "## Pre-Test Setup" in content

    def test_contains_browser_testing(self, spec_dir):
        """Test that plan contains browser testing section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "## Browser/Environment Testing" in content

    def test_extracts_acceptance_criteria(self, spec_dir):
        """Test extraction of acceptance criteria from spec."""
        # Create spec with acceptance criteria
        spec_content = """# Feature Spec

## Description
A test feature.

## Acceptance Criteria
- Feature does X
- Feature handles Y
- Feature reports Z

## Implementation
Details here.
"""
        (spec_dir / "spec.md").write_text(spec_content)

        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "Feature does X" in content
        assert "Feature handles Y" in content
        assert "Feature reports Z" in content

    def test_default_criteria_when_no_spec(self, spec_dir):
        """Test default criteria when spec doesn't exist."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "Core functionality works as expected" in content

    def test_default_criteria_when_no_acceptance_section(self, spec_dir):
        """Test default criteria when spec has no acceptance criteria."""
        spec_content = """# Feature Spec

## Description
A test feature without acceptance criteria.

## Implementation
Details here.
"""
        (spec_dir / "spec.md").write_text(spec_content)

        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "Core functionality works as expected" in content

    def test_contains_timestamp(self, spec_dir):
        """Test that plan contains generated timestamp."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "**Generated**:" in content

    def test_contains_reason(self, spec_dir):
        """Test that plan contains reason for manual testing."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "**Reason**: No automated test framework detected" in content

    def test_happy_path_section(self, spec_dir):
        """Test that plan contains happy path section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "### Happy Path" in content
        assert "Primary use case works correctly" in content

    def test_edge_cases_section(self, spec_dir):
        """Test that plan contains edge cases section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "### Edge Cases" in content
        assert "Empty input handling" in content

    def test_error_handling_section(self, spec_dir):
        """Test that plan contains error handling section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "### Error Handling" in content

    def test_performance_section(self, spec_dir):
        """Test that plan contains performance section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "### Performance" in content

    def test_security_section(self, spec_dir):
        """Test that plan contains security section."""
        result = create_manual_test_plan(spec_dir, "test")

        content = result.read_text()
        assert "### Security" in content


# =============================================================================
# CONFIGURATION TESTS
# =============================================================================


class TestConfiguration:
    """Tests for configuration values."""

    def test_recurring_threshold_default(self):
        """Test default recurring issue threshold."""
        assert RECURRING_ISSUE_THRESHOLD == 3

    def test_similarity_threshold_default(self):
        """Test default similarity threshold."""
        assert ISSUE_SIMILARITY_THRESHOLD == 0.8
        assert 0 < ISSUE_SIMILARITY_THRESHOLD <= 1

    def test_similarity_threshold_is_float(self):
        """Test that similarity threshold is a float."""
        assert isinstance(ISSUE_SIMILARITY_THRESHOLD, float)

    def test_recurring_threshold_is_int(self):
        """Test that recurring threshold is an integer."""
        assert isinstance(RECURRING_ISSUE_THRESHOLD, int)
