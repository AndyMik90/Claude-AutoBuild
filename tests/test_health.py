"""
Tests for core/health.py
=========================

Tests for health check utilities.
"""

import time
from pathlib import Path

import pytest

from core.health import (
    HealthCheckResult,
    HealthChecker,
    HealthStatus,
    check_disk_space,
    check_file_exists,
    check_git_repo,
    check_memory,
    get_health_checker,
    get_health_status,
    register_health_check,
)


class TestHealthStatus:
    """Tests for HealthStatus enum."""

    def test_status_values(self):
        """Test status values."""
        assert HealthStatus.HEALTHY.value == "healthy"
        assert HealthStatus.DEGRADED.value == "degraded"
        assert HealthStatus.UNHEALTHY.value == "unhealthy"
        assert HealthStatus.UNKNOWN.value == "unknown"


class TestHealthCheckResult:
    """Tests for HealthCheckResult."""

    def test_basic_result(self):
        """Test basic result creation."""
        result = HealthCheckResult(
            name="test",
            status=HealthStatus.HEALTHY,
            message="All good",
        )
        assert result.name == "test"
        assert result.status == HealthStatus.HEALTHY
        assert result.message == "All good"

    def test_to_dict(self):
        """Test conversion to dictionary."""
        result = HealthCheckResult(
            name="test",
            status=HealthStatus.HEALTHY,
            message="OK",
            duration_ms=10.5,
            details={"key": "value"},
        )
        d = result.to_dict()
        assert d["name"] == "test"
        assert d["status"] == "healthy"
        assert d["message"] == "OK"
        assert d["duration_ms"] == 10.5
        assert d["details"]["key"] == "value"
        assert "timestamp" in d


class TestHealthChecker:
    """Tests for HealthChecker."""

    def test_register_check(self):
        """Test registering a health check."""
        checker = HealthChecker()

        def simple_check():
            return HealthCheckResult(
                name="simple",
                status=HealthStatus.HEALTHY,
            )

        checker.register("simple", simple_check)
        result = checker.run_check("simple")
        assert result.status == HealthStatus.HEALTHY

    def test_unregister_check(self):
        """Test unregistering a health check."""
        checker = HealthChecker()

        def simple_check():
            return HealthCheckResult(name="simple", status=HealthStatus.HEALTHY)

        checker.register("simple", simple_check)
        checker.unregister("simple")
        result = checker.run_check("simple")
        assert result.status == HealthStatus.UNKNOWN

    def test_run_all_checks(self):
        """Test running all health checks."""
        checker = HealthChecker()

        def check1():
            return HealthCheckResult(name="check1", status=HealthStatus.HEALTHY)

        def check2():
            return HealthCheckResult(name="check2", status=HealthStatus.HEALTHY)

        checker.register("check1", check1)
        checker.register("check2", check2)

        results = checker.run_all_checks()
        assert len(results) == 2
        assert results["check1"].status == HealthStatus.HEALTHY
        assert results["check2"].status == HealthStatus.HEALTHY

    def test_overall_status_healthy(self):
        """Test overall status when all checks pass."""
        checker = HealthChecker()

        def healthy_check():
            return HealthCheckResult(name="healthy", status=HealthStatus.HEALTHY)

        checker.register("healthy", healthy_check)
        checker.run_check("healthy")

        status = checker.get_status()
        assert status.status == HealthStatus.HEALTHY

    def test_overall_status_unhealthy_critical(self):
        """Test overall status with critical failure."""
        checker = HealthChecker()

        def failing_check():
            return HealthCheckResult(
                name="failing",
                status=HealthStatus.UNHEALTHY,
                message="Critical failure",
            )

        checker.register("failing", failing_check, critical=True)
        checker.run_check("failing")

        status = checker.get_status()
        assert status.status == HealthStatus.UNHEALTHY

    def test_overall_status_degraded(self):
        """Test overall status with non-critical failure."""
        checker = HealthChecker()

        def healthy_check():
            return HealthCheckResult(name="healthy", status=HealthStatus.HEALTHY)

        def non_critical_failing():
            return HealthCheckResult(
                name="non_critical",
                status=HealthStatus.UNHEALTHY,
            )

        checker.register("healthy", healthy_check, critical=True)
        checker.register("non_critical", non_critical_failing, critical=False)
        checker.run_all_checks()

        status = checker.get_status()
        assert status.status == HealthStatus.DEGRADED

    def test_exception_handling(self):
        """Test that exceptions are caught."""
        checker = HealthChecker()

        def failing_check():
            raise RuntimeError("Something went wrong")

        checker.register("failing", failing_check)
        result = checker.run_check("failing")

        assert result.status == HealthStatus.UNHEALTHY
        # Check that the error message contains the exception text
        assert "Something went wrong" in result.message

    def test_duration_tracking(self):
        """Test that duration is tracked."""
        checker = HealthChecker()

        def slow_check():
            time.sleep(0.01)
            return HealthCheckResult(name="slow", status=HealthStatus.HEALTHY)

        checker.register("slow", slow_check)
        result = checker.run_check("slow")

        assert result.duration_ms >= 10.0

    def test_history_tracking(self):
        """Test that history is tracked."""
        checker = HealthChecker()

        def check():
            return HealthCheckResult(name="test", status=HealthStatus.HEALTHY)

        checker.register("test", check)

        for _ in range(5):
            checker.run_check("test")

        history = checker.get_history("test")
        assert len(history) == 5

    def test_to_dict(self):
        """Test export to dictionary."""
        checker = HealthChecker()

        def check():
            return HealthCheckResult(name="test", status=HealthStatus.HEALTHY)

        checker.register("test", check)
        checker.run_check("test")

        d = checker.to_dict()
        assert d["status"] == "healthy"
        assert "checks" in d
        assert "test" in d["checks"]


class TestPrebuiltChecks:
    """Tests for pre-built health check functions."""

    def test_check_disk_space(self):
        """Test disk space check."""
        check = check_disk_space(min_free_gb=0.001)  # Very low threshold
        result = check()
        # Should pass on any normal system
        assert result.status == HealthStatus.HEALTHY

    def test_check_disk_space_low(self):
        """Test disk space check with high threshold."""
        check = check_disk_space(min_free_gb=1000000)  # 1 PB - impossible
        result = check()
        assert result.status == HealthStatus.UNHEALTHY

    def test_check_memory(self):
        """Test memory check."""
        check = check_memory(max_usage_percent=99.0)
        result = check()
        # Should pass on most systems
        assert result.status in (HealthStatus.HEALTHY, HealthStatus.UNKNOWN)

    def test_check_file_exists_found(self, tmp_path):
        """Test file exists check when file exists."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("test")

        check = check_file_exists(str(test_file))
        result = check()
        assert result.status == HealthStatus.HEALTHY

    def test_check_file_exists_not_found(self):
        """Test file exists check when file doesn't exist."""
        check = check_file_exists("/nonexistent/file/path.txt")
        result = check()
        assert result.status == HealthStatus.UNHEALTHY

    def test_check_git_repo_valid(self, tmp_path):
        """Test git repo check with valid repo."""
        import subprocess

        # Create a git repo
        subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True)

        check = check_git_repo(str(tmp_path))
        result = check()
        assert result.status == HealthStatus.HEALTHY

    def test_check_git_repo_invalid(self, tmp_path):
        """Test git repo check with non-repo directory."""
        check = check_git_repo(str(tmp_path))
        result = check()
        assert result.status == HealthStatus.UNHEALTHY


class TestGlobalHealthChecker:
    """Tests for global health checker."""

    def test_get_health_checker(self):
        """Test getting global health checker."""
        checker = get_health_checker()
        assert isinstance(checker, HealthChecker)

    def test_register_health_check(self):
        """Test global registration."""

        def test_check():
            return HealthCheckResult(name="global_test", status=HealthStatus.HEALTHY)

        register_health_check("global_test", test_check)
        checker = get_health_checker()
        result = checker.run_check("global_test")
        assert result.status == HealthStatus.HEALTHY

    def test_get_health_status(self):
        """Test getting global health status."""
        status = get_health_status()
        assert isinstance(status, dict)
        assert "status" in status
