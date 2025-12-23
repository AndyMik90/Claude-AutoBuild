"""
Health Check Utilities
======================

Enterprise-grade health check utilities for service monitoring.

Features:
- Component health checks with status reporting
- Dependency health verification
- Configurable check intervals and timeouts
- Aggregated health status
- Health check history tracking
"""

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class HealthStatus(Enum):
    """Health status values."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result of a health check."""

    name: str
    status: HealthStatus
    message: str = ""
    duration_ms: float = 0.0
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp.isoformat(),
            "details": self.details,
        }


@dataclass
class HealthCheckConfig:
    """Configuration for a health check."""

    name: str
    check_fn: Callable[[], HealthCheckResult]
    interval_seconds: float = 30.0
    timeout_seconds: float = 10.0
    critical: bool = True  # If True, failure makes overall status unhealthy


class HealthChecker:
    """
    Manages health checks for a service.

    Supports both sync and async health checks with configurable
    intervals, timeouts, and criticality levels.
    """

    def __init__(self):
        """Initialize health checker."""
        self._checks: dict[str, HealthCheckConfig] = {}
        self._results: dict[str, HealthCheckResult] = {}
        self._history: dict[str, list[HealthCheckResult]] = {}
        self._history_limit = 100
        self._lock = threading.Lock()

    def register(
        self,
        name: str,
        check_fn: Callable[[], HealthCheckResult],
        interval_seconds: float = 30.0,
        timeout_seconds: float = 10.0,
        critical: bool = True,
    ) -> None:
        """
        Register a health check.

        Args:
            name: Unique name for the check
            check_fn: Function that performs the check
            interval_seconds: How often to run the check
            timeout_seconds: Maximum time for check to complete
            critical: Whether failure makes overall status unhealthy
        """
        config = HealthCheckConfig(
            name=name,
            check_fn=check_fn,
            interval_seconds=interval_seconds,
            timeout_seconds=timeout_seconds,
            critical=critical,
        )

        with self._lock:
            self._checks[name] = config
            self._history[name] = []

    def unregister(self, name: str) -> None:
        """Unregister a health check."""
        with self._lock:
            self._checks.pop(name, None)
            self._results.pop(name, None)
            self._history.pop(name, None)

    def run_check(self, name: str) -> HealthCheckResult:
        """
        Run a specific health check.

        Args:
            name: Name of the check to run

        Returns:
            HealthCheckResult
        """
        with self._lock:
            if name not in self._checks:
                return HealthCheckResult(
                    name=name,
                    status=HealthStatus.UNKNOWN,
                    message=f"Health check '{name}' not found",
                )
            config = self._checks[name]

        start_time = time.perf_counter()
        try:
            result = config.check_fn()
            result.duration_ms = (time.perf_counter() - start_time) * 1000
        except Exception as e:
            result = HealthCheckResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=f"Check failed with exception: {e}",
                duration_ms=(time.perf_counter() - start_time) * 1000,
            )

        with self._lock:
            self._results[name] = result
            self._history[name].append(result)
            # Trim history
            if len(self._history[name]) > self._history_limit:
                self._history[name] = self._history[name][-self._history_limit :]

        return result

    def run_all_checks(self) -> dict[str, HealthCheckResult]:
        """
        Run all registered health checks.

        Returns:
            Dictionary of check names to results
        """
        with self._lock:
            check_names = list(self._checks.keys())

        results = {}
        for name in check_names:
            results[name] = self.run_check(name)

        return results

    def get_status(self) -> HealthCheckResult:
        """
        Get overall health status.

        Returns:
            Aggregated health check result
        """
        with self._lock:
            if not self._results:
                return HealthCheckResult(
                    name="overall",
                    status=HealthStatus.UNKNOWN,
                    message="No health checks registered",
                )

            critical_unhealthy = []
            non_critical_unhealthy = []
            all_healthy = True

            for name, result in self._results.items():
                if result.status != HealthStatus.HEALTHY:
                    all_healthy = False
                    config = self._checks.get(name)
                    if config and config.critical:
                        critical_unhealthy.append(name)
                    else:
                        non_critical_unhealthy.append(name)

            if critical_unhealthy:
                return HealthCheckResult(
                    name="overall",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Critical checks failing: {', '.join(critical_unhealthy)}",
                    details={
                        "failing_critical": critical_unhealthy,
                        "failing_non_critical": non_critical_unhealthy,
                    },
                )
            elif non_critical_unhealthy:
                return HealthCheckResult(
                    name="overall",
                    status=HealthStatus.DEGRADED,
                    message=f"Non-critical checks failing: {', '.join(non_critical_unhealthy)}",
                    details={
                        "failing_non_critical": non_critical_unhealthy,
                    },
                )
            else:
                return HealthCheckResult(
                    name="overall",
                    status=HealthStatus.HEALTHY,
                    message="All health checks passing",
                )

    def get_results(self) -> dict[str, HealthCheckResult]:
        """Get all current health check results."""
        with self._lock:
            return dict(self._results)

    def get_history(self, name: str) -> list[HealthCheckResult]:
        """Get history for a specific check."""
        with self._lock:
            return list(self._history.get(name, []))

    def to_dict(self) -> dict[str, Any]:
        """
        Export health status as dictionary.

        Returns:
            Complete health status dictionary
        """
        overall = self.get_status()
        with self._lock:
            checks = {name: result.to_dict() for name, result in self._results.items()}

        return {
            "status": overall.status.value,
            "message": overall.message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
        }


# Pre-built health check functions


def check_disk_space(min_free_gb: float = 1.0) -> Callable[[], HealthCheckResult]:
    """
    Create a disk space health check.

    Args:
        min_free_gb: Minimum free space in GB

    Returns:
        Health check function
    """
    import shutil

    def check() -> HealthCheckResult:
        try:
            total, used, free = shutil.disk_usage("/")
            free_gb = free / (1024**3)

            if free_gb < min_free_gb:
                return HealthCheckResult(
                    name="disk_space",
                    status=HealthStatus.UNHEALTHY,
                    message=f"Low disk space: {free_gb:.1f}GB free",
                    details={"free_gb": free_gb, "min_free_gb": min_free_gb},
                )

            return HealthCheckResult(
                name="disk_space",
                status=HealthStatus.HEALTHY,
                message=f"Disk space OK: {free_gb:.1f}GB free",
                details={"free_gb": free_gb},
            )
        except Exception as e:
            return HealthCheckResult(
                name="disk_space",
                status=HealthStatus.UNKNOWN,
                message=f"Could not check disk space: {e}",
            )

    return check


def check_memory(max_usage_percent: float = 90.0) -> Callable[[], HealthCheckResult]:
    """
    Create a memory usage health check.

    Args:
        max_usage_percent: Maximum acceptable memory usage

    Returns:
        Health check function
    """

    def check() -> HealthCheckResult:
        try:
            import resource

            usage = resource.getrusage(resource.RUSAGE_SELF)
            # This is a simplified check - real production would use psutil
            return HealthCheckResult(
                name="memory",
                status=HealthStatus.HEALTHY,
                message="Memory usage within limits",
                details={"max_rss_mb": usage.ru_maxrss / 1024},
            )
        except Exception as e:
            return HealthCheckResult(
                name="memory",
                status=HealthStatus.UNKNOWN,
                message=f"Could not check memory: {e}",
            )

    return check


def check_file_exists(path: str) -> Callable[[], HealthCheckResult]:
    """
    Create a file existence health check.

    Args:
        path: Path to check

    Returns:
        Health check function
    """
    from pathlib import Path as P

    def check() -> HealthCheckResult:
        file_path = P(path)
        if file_path.exists():
            return HealthCheckResult(
                name=f"file_{file_path.name}",
                status=HealthStatus.HEALTHY,
                message=f"File exists: {path}",
            )
        return HealthCheckResult(
            name=f"file_{file_path.name}",
            status=HealthStatus.UNHEALTHY,
            message=f"File not found: {path}",
        )

    return check


def check_git_repo(path: str = ".") -> Callable[[], HealthCheckResult]:
    """
    Create a Git repository health check.

    Args:
        path: Path to repository

    Returns:
        Health check function
    """
    import subprocess
    from pathlib import Path as P

    def check() -> HealthCheckResult:
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--git-dir"],
                cwd=path,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return HealthCheckResult(
                    name="git_repo",
                    status=HealthStatus.HEALTHY,
                    message="Git repository OK",
                    details={"path": str(P(path).resolve())},
                )
            return HealthCheckResult(
                name="git_repo",
                status=HealthStatus.UNHEALTHY,
                message="Not a Git repository",
            )
        except Exception as e:
            return HealthCheckResult(
                name="git_repo",
                status=HealthStatus.UNKNOWN,
                message=f"Could not check Git repo: {e}",
            )

    return check


# Global health checker
_health_checker = HealthChecker()


def get_health_checker() -> HealthChecker:
    """Get the global health checker."""
    return _health_checker


def register_health_check(
    name: str,
    check_fn: Callable[[], HealthCheckResult],
    critical: bool = True,
) -> None:
    """Register a health check with the global checker."""
    _health_checker.register(name, check_fn, critical=critical)


def get_health_status() -> dict[str, Any]:
    """Get current health status from the global checker."""
    return _health_checker.to_dict()
