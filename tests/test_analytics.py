"""
Tests for Build Analytics System
================================

Tests for metrics collection, storage, and dashboard display.
"""

import json
import os
import pytest
from pathlib import Path
from unittest.mock import patch
import tempfile
import shutil

# Add auto-claude to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

from analytics.collector import (
    BuildMetrics,
    PhaseMetrics,
    save_metrics,
    load_metrics,
    load_all_metrics,
    get_metrics_dir,
)
from analytics.dashboard import (
    format_duration,
    format_tokens,
    format_cost,
    format_metrics_summary,
    get_analytics_report,
)


class TestPhaseMetrics:
    """Tests for PhaseMetrics dataclass."""

    def test_create_phase_metrics(self):
        """Can create phase metrics."""
        phase = PhaseMetrics(
            name="planning",
            duration_seconds=120.5,
            tokens_used=5000,
            success=True,
        )
        assert phase.name == "planning"
        assert phase.duration_seconds == 120.5
        assert phase.tokens_used == 5000
        assert phase.success is True

    def test_phase_with_error(self):
        """Can create phase with error."""
        phase = PhaseMetrics(
            name="coding",
            success=False,
            error="Build failed",
        )
        assert phase.success is False
        assert phase.error == "Build failed"

    def test_to_dict(self):
        """Can convert to dict."""
        phase = PhaseMetrics(
            name="qa",
            duration_seconds=60.0,
            tokens_used=1000,
            files_modified=5,
        )
        data = phase.to_dict()
        assert data["name"] == "qa"
        assert data["duration_seconds"] == 60.0
        assert data["files_modified"] == 5

    def test_from_dict(self):
        """Can create from dict."""
        data = {
            "name": "planning",
            "duration_seconds": 30.0,
            "tokens_used": 2000,
            "success": True,
        }
        phase = PhaseMetrics.from_dict(data)
        assert phase.name == "planning"
        assert phase.duration_seconds == 30.0


class TestBuildMetrics:
    """Tests for BuildMetrics dataclass."""

    def test_create_build_metrics(self):
        """Can create build metrics."""
        metrics = BuildMetrics(spec_name="001-feature")
        assert metrics.spec_name == "001-feature"
        assert metrics.provider == "claude"
        assert metrics.success is False

    def test_start_end_build(self):
        """Can track build start and end."""
        metrics = BuildMetrics(spec_name="test")
        metrics.start_build()
        assert metrics.start_time != ""

        metrics.end_build(success=True)
        assert metrics.end_time != ""
        assert metrics.success is True
        assert metrics.total_duration_seconds > 0

    def test_phase_tracking(self):
        """Can track phases."""
        metrics = BuildMetrics(spec_name="test")
        metrics.start_build()

        metrics.start_phase("planning")
        metrics.end_phase(success=True, tokens_used=1000)

        metrics.start_phase("coding")
        metrics.end_phase(success=True, tokens_used=5000, files_modified=3)

        metrics.end_build(success=True)

        assert len(metrics.phases) == 2
        assert metrics.phases[0].name == "planning"
        assert metrics.phases[1].name == "coding"
        assert metrics.total_tokens == 6000
        assert metrics.total_files_modified == 3

    def test_record_phase(self):
        """Can record phase with explicit values."""
        metrics = BuildMetrics(spec_name="test")
        metrics.record_phase(
            name="qa",
            duration=120.0,
            tokens=2000,
            success=True,
            files_modified=2,
        )

        assert len(metrics.phases) == 1
        assert metrics.phases[0].name == "qa"
        assert metrics.phases[0].duration_seconds == 120.0

    def test_qa_iterations(self):
        """Can track QA iterations."""
        metrics = BuildMetrics(spec_name="test")
        assert metrics.qa_iterations == 0

        metrics.record_qa_iteration()
        metrics.record_qa_iteration()

        assert metrics.qa_iterations == 2

    def test_provider_info(self):
        """Can set provider info."""
        metrics = BuildMetrics(spec_name="test")
        metrics.set_provider_info(
            provider="openai",
            model="gpt-4o",
            pricing_per_million={"input": 2.5, "output": 10.0},
        )

        assert metrics.provider == "openai"
        assert metrics.model == "gpt-4o"

    def test_to_dict(self):
        """Can serialize to dict."""
        metrics = BuildMetrics(spec_name="test")
        metrics.start_build()
        metrics.record_phase("planning", duration=30.0, tokens=1000)
        metrics.end_build(success=True)

        data = metrics.to_dict()
        assert data["spec_name"] == "test"
        assert data["success"] is True
        assert len(data["phases"]) == 1

    def test_from_dict(self):
        """Can deserialize from dict."""
        data = {
            "spec_name": "001-feature",
            "provider": "claude",
            "model": "claude-sonnet",
            "complexity": "standard",
            "success": True,
            "total_duration_seconds": 300.0,
            "phases": [
                {"name": "planning", "duration_seconds": 60.0, "tokens_used": 1000}
            ],
        }
        metrics = BuildMetrics.from_dict(data)
        assert metrics.spec_name == "001-feature"
        assert metrics.success is True
        assert len(metrics.phases) == 1


class TestMetricsPersistence:
    """Tests for metrics storage."""

    @pytest.fixture
    def temp_metrics_dir(self, tmp_path):
        """Create temporary metrics directory."""
        metrics_dir = tmp_path / "metrics"
        metrics_dir.mkdir()
        with patch.dict(os.environ, {"AUTO_CLAUDE_METRICS_DIR": str(metrics_dir)}):
            yield metrics_dir

    def test_save_metrics(self, temp_metrics_dir):
        """Can save metrics to file."""
        metrics = BuildMetrics(spec_name="test-build")
        metrics.start_build()
        metrics.end_build(success=True)

        filepath = save_metrics(metrics)
        assert filepath.exists()
        assert filepath.suffix == ".json"

    def test_load_metrics(self, temp_metrics_dir):
        """Can load metrics from file."""
        # Save first
        metrics = BuildMetrics(spec_name="test-load")
        metrics.start_build()
        metrics.record_phase("coding", duration=100.0, tokens=5000)
        metrics.end_build(success=True)
        filepath = save_metrics(metrics)

        # Load back
        loaded = load_metrics(filepath)
        assert loaded.spec_name == "test-load"
        assert loaded.success is True
        assert len(loaded.phases) == 1

    def test_load_all_metrics(self, temp_metrics_dir):
        """Can load all metrics."""
        # Save multiple metrics
        for i in range(5):
            metrics = BuildMetrics(spec_name=f"test-{i}")
            metrics.start_build()
            metrics.end_build(success=i % 2 == 0)
            save_metrics(metrics)

        # Load all
        all_metrics = load_all_metrics()
        assert len(all_metrics) == 5

    def test_load_all_with_limit(self, temp_metrics_dir):
        """Can limit loaded metrics."""
        # Save multiple metrics
        for i in range(10):
            metrics = BuildMetrics(spec_name=f"test-{i}")
            metrics.start_build()
            metrics.end_build(success=True)
            save_metrics(metrics)

        # Load with limit
        limited = load_all_metrics(limit=5)
        assert len(limited) == 5


class TestFormatters:
    """Tests for formatting functions."""

    def test_format_duration_seconds(self):
        """Formats seconds correctly."""
        assert format_duration(30.0) == "30.0s"
        assert format_duration(45.5) == "45.5s"

    def test_format_duration_minutes(self):
        """Formats minutes correctly."""
        assert format_duration(120.0) == "2.0m"
        assert format_duration(300.0) == "5.0m"

    def test_format_duration_hours(self):
        """Formats hours correctly."""
        assert format_duration(3600.0) == "1.0h"
        assert format_duration(7200.0) == "2.0h"

    def test_format_tokens_small(self):
        """Formats small token counts."""
        assert format_tokens(500) == "500"
        assert format_tokens(999) == "999"

    def test_format_tokens_thousands(self):
        """Formats thousands correctly."""
        assert format_tokens(1000) == "1.0K"
        assert format_tokens(5500) == "5.5K"

    def test_format_tokens_millions(self):
        """Formats millions correctly."""
        assert format_tokens(1_000_000) == "1.00M"
        assert format_tokens(2_500_000) == "2.50M"

    def test_format_cost(self):
        """Formats cost correctly."""
        assert format_cost(0.0001) == "$0.0001"
        assert format_cost(0.05) == "$0.05"
        assert format_cost(1.50) == "$1.50"


class TestMetricsSummary:
    """Tests for metrics summary formatting."""

    def test_format_metrics_summary(self):
        """Can format metrics summary."""
        metrics = BuildMetrics(spec_name="test-summary")
        metrics.provider = "claude"
        metrics.model = "claude-sonnet"
        metrics.start_build()
        metrics.record_phase("planning", duration=30.0, tokens=1000)
        metrics.record_phase("coding", duration=120.0, tokens=5000)
        metrics.end_build(success=True)

        summary = format_metrics_summary(metrics)
        assert "test-summary" in summary
        assert "SUCCESS" in summary
        assert "claude" in summary


class TestAnalyticsReport:
    """Tests for analytics report generation."""

    @pytest.fixture
    def temp_metrics_dir(self, tmp_path):
        """Create temporary metrics directory with sample data."""
        metrics_dir = tmp_path / "metrics"
        metrics_dir.mkdir()

        with patch.dict(os.environ, {"AUTO_CLAUDE_METRICS_DIR": str(metrics_dir)}):
            # Create sample metrics inside the patch context
            for i in range(10):
                metrics = BuildMetrics(spec_name=f"test-{i}")
                metrics.provider = "claude" if i < 7 else "openai"
                metrics.complexity = ["simple", "standard", "complex"][i % 3]
                metrics.start_build()
                metrics.record_phase("planning", duration=30.0, tokens=1000)
                metrics.end_build(success=i < 8)
                save_metrics(metrics)

            yield metrics_dir

    def test_empty_report(self, tmp_path):
        """Report handles no metrics."""
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        with patch.dict(os.environ, {"AUTO_CLAUDE_METRICS_DIR": str(empty_dir)}):
            report = get_analytics_report()
            assert report["total_builds"] == 0
            assert report["success_rate"] == 0

    def test_report_structure(self, temp_metrics_dir):
        """Report has expected structure."""
        report = get_analytics_report()

        assert "total_builds" in report
        assert "success_rate" in report
        assert "avg_duration" in report
        assert "by_complexity" in report
        assert "by_provider" in report
        assert "recent_builds" in report

    def test_report_counts(self, temp_metrics_dir):
        """Report has correct counts."""
        report = get_analytics_report()
        assert report["total_builds"] == 10
        assert report["success_rate"] == 0.8  # 8/10 successful

    def test_report_by_complexity(self, temp_metrics_dir):
        """Report breaks down by complexity."""
        report = get_analytics_report()
        assert "simple" in report["by_complexity"]
        assert "standard" in report["by_complexity"]
        assert "complex" in report["by_complexity"]

    def test_report_by_provider(self, temp_metrics_dir):
        """Report breaks down by provider."""
        report = get_analytics_report()
        assert "claude" in report["by_provider"]
        assert "openai" in report["by_provider"]
        assert report["by_provider"]["claude"]["count"] == 7
        assert report["by_provider"]["openai"]["count"] == 3


class TestPrivacy:
    """Tests for privacy-conscious metrics collection."""

    def test_no_code_content(self):
        """Metrics don't contain code content."""
        metrics = BuildMetrics(spec_name="test-privacy")
        metrics.start_build()
        metrics.record_phase("coding", duration=60.0, tokens=5000, files_modified=3)
        metrics.end_build(success=True)

        data = metrics.to_dict()
        serialized = json.dumps(data)

        # Check that no common code keywords are in the serialized data
        # The serialized data should only contain metadata, not code
        serialized_lower = serialized.lower()
        
        # Check for code-related keywords that shouldn't appear in metrics
        # Note: "import" and "class " are specific patterns unlikely in metric names
        assert "import " not in serialized_lower
        assert "class " not in serialized_lower
        assert "def " not in serialized_lower

    def test_only_metadata_stored(self):
        """Only metadata is stored, not file contents."""
        metrics = BuildMetrics(spec_name="test-metadata")
        metrics.record_phase(
            "coding",
            duration=60.0,
            tokens=5000,
            files_modified=3,
            files_created=2,
        )

        data = metrics.to_dict()

        # Check phases only have counts, not content
        phase = data["phases"][0]
        assert "files_modified" in phase
        assert "files_created" in phase
        assert "file_contents" not in phase
        assert "code" not in phase
