"""
Metrics Collection Utilities
============================

Enterprise-grade metrics collection for performance monitoring and observability.

Features:
- Counter, Gauge, Histogram, and Timer metrics
- Thread-safe operations
- Labels/tags support for dimensional metrics
- Export to various formats (JSON, Prometheus-compatible)
- Automatic statistics calculation
"""

import statistics
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class MetricType(Enum):
    """Types of metrics."""

    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    TIMER = "timer"


@dataclass
class MetricValue:
    """A single metric value with metadata."""

    value: float
    timestamp: float
    labels: dict[str, str] = field(default_factory=dict)


class Counter:
    """
    A counter metric that only increases.

    Use for counting events like requests, errors, etc.
    """

    def __init__(self, name: str, description: str = ""):
        """
        Initialize counter.

        Args:
            name: Metric name
            description: Human-readable description
        """
        self.name = name
        self.description = description
        self._values: dict[tuple, float] = defaultdict(float)
        self._lock = threading.Lock()

    def inc(self, value: float = 1.0, **labels: str) -> None:
        """
        Increment the counter.

        Args:
            value: Amount to increment (must be positive)
            **labels: Dimensional labels
        """
        if value < 0:
            raise ValueError("Counter can only be incremented")

        label_key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[label_key] += value

    def get(self, **labels: str) -> float:
        """Get current counter value."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            return self._values.get(label_key, 0.0)

    def reset(self) -> None:
        """Reset all counter values."""
        with self._lock:
            self._values.clear()

    def get_all(self) -> list[tuple[dict[str, str], float]]:
        """Get all counter values with labels as list of (labels_dict, value) tuples."""
        with self._lock:
            return [(dict(k), v) for k, v in self._values.items()]


class Gauge:
    """
    A gauge metric that can go up and down.

    Use for values like current connections, queue size, etc.
    """

    def __init__(self, name: str, description: str = ""):
        """Initialize gauge."""
        self.name = name
        self.description = description
        self._values: dict[tuple, float] = {}
        self._lock = threading.Lock()

    def set(self, value: float, **labels: str) -> None:
        """Set gauge value."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[label_key] = value

    def inc(self, value: float = 1.0, **labels: str) -> None:
        """Increment gauge value."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[label_key] = self._values.get(label_key, 0.0) + value

    def dec(self, value: float = 1.0, **labels: str) -> None:
        """Decrement gauge value."""
        self.inc(-value, **labels)

    def get(self, **labels: str) -> float:
        """Get current gauge value."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            return self._values.get(label_key, 0.0)

    def get_all(self) -> list[tuple[dict[str, str], float]]:
        """Get all gauge values with labels as list of (labels_dict, value) tuples."""
        with self._lock:
            return [(dict(k), v) for k, v in self._values.items()]

    def reset(self) -> None:
        """Reset all gauge values."""
        with self._lock:
            self._values.clear()


class Histogram:
    """
    A histogram metric for distribution analysis.

    Tracks count, sum, and value distribution.
    """

    def __init__(
        self,
        name: str,
        description: str = "",
        buckets: list[float] | None = None,
    ):
        """
        Initialize histogram.

        Args:
            name: Metric name
            description: Human-readable description
            buckets: Bucket boundaries for distribution
        """
        self.name = name
        self.description = description
        self._buckets = buckets or [
            0.005,
            0.01,
            0.025,
            0.05,
            0.1,
            0.25,
            0.5,
            1.0,
            2.5,
            5.0,
            10.0,
        ]
        self._values: dict[tuple, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def observe(self, value: float, **labels: str) -> None:
        """Record an observation."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            self._values[label_key].append(value)

    def get_stats(self, **labels: str) -> dict[str, float]:
        """Get statistics for the histogram."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            values = self._values.get(label_key, [])
            if not values:
                return {
                    "count": 0,
                    "sum": 0.0,
                    "mean": 0.0,
                    "min": 0.0,
                    "max": 0.0,
                    "p50": 0.0,
                    "p90": 0.0,
                    "p99": 0.0,
                }

            sorted_values = sorted(values)
            return {
                "count": len(values),
                "sum": sum(values),
                "mean": statistics.mean(values),
                "min": min(values),
                "max": max(values),
                "p50": self._percentile(sorted_values, 50),
                "p90": self._percentile(sorted_values, 90),
                "p99": self._percentile(sorted_values, 99),
            }

    def _percentile(self, sorted_values: list[float], p: float) -> float:
        """Calculate percentile from sorted values."""
        if not sorted_values:
            return 0.0
        idx = int(len(sorted_values) * p / 100)
        idx = min(idx, len(sorted_values) - 1)
        return sorted_values[idx]

    def get_buckets(self, **labels: str) -> dict[float, int]:
        """Get bucket counts for the histogram."""
        label_key = tuple(sorted(labels.items()))
        with self._lock:
            values = self._values.get(label_key, [])

        bucket_counts: dict[float, int] = dict.fromkeys(self._buckets, 0)
        bucket_counts[float("inf")] = 0

        for value in values:
            for bucket in self._buckets:
                if value <= bucket:
                    bucket_counts[bucket] += 1
                    break
            else:
                bucket_counts[float("inf")] += 1

        return bucket_counts

    def reset(self) -> None:
        """Reset all histogram values."""
        with self._lock:
            self._values.clear()


class Timer:
    """
    A timer metric for measuring durations.

    Wraps a histogram with timing-specific utilities.
    """

    def __init__(self, name: str, description: str = ""):
        """Initialize timer."""
        self.name = name
        self.description = description
        self._histogram = Histogram(
            name=name,
            description=description,
            buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        )

    def observe(self, duration_seconds: float, **labels: str) -> None:
        """Record a duration."""
        self._histogram.observe(duration_seconds, **labels)

    def time(self, **labels: str):
        """
        Context manager for timing a block.

        Usage:
            with timer.time(operation="db_query"):
                db.query(...)
        """
        return _TimerContext(self, labels)

    def get_stats(self, **labels: str) -> dict[str, float]:
        """Get timing statistics."""
        return self._histogram.get_stats(**labels)

    def reset(self) -> None:
        """Reset all timer values."""
        self._histogram.reset()


class _TimerContext:
    """Context manager for Timer.time()."""

    def __init__(self, timer: Timer, labels: dict[str, str]):
        self.timer = timer
        self.labels = labels
        self.start_time = 0.0

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.perf_counter() - self.start_time
        self.timer.observe(duration, **self.labels)
        return False


class MetricsRegistry:
    """
    Central registry for all metrics.

    Provides metric creation, collection, and export.
    """

    def __init__(self):
        """Initialize metrics registry."""
        self._counters: dict[str, Counter] = {}
        self._gauges: dict[str, Gauge] = {}
        self._histograms: dict[str, Histogram] = {}
        self._timers: dict[str, Timer] = {}
        self._lock = threading.Lock()

    def counter(self, name: str, description: str = "") -> Counter:
        """Get or create a counter."""
        with self._lock:
            if name not in self._counters:
                self._counters[name] = Counter(name, description)
            return self._counters[name]

    def gauge(self, name: str, description: str = "") -> Gauge:
        """Get or create a gauge."""
        with self._lock:
            if name not in self._gauges:
                self._gauges[name] = Gauge(name, description)
            return self._gauges[name]

    def histogram(
        self,
        name: str,
        description: str = "",
        buckets: list[float] | None = None,
    ) -> Histogram:
        """Get or create a histogram."""
        with self._lock:
            if name not in self._histograms:
                self._histograms[name] = Histogram(name, description, buckets)
            return self._histograms[name]

    def timer(self, name: str, description: str = "") -> Timer:
        """Get or create a timer."""
        with self._lock:
            if name not in self._timers:
                self._timers[name] = Timer(name, description)
            return self._timers[name]

    def collect(self) -> dict[str, Any]:
        """
        Collect all metrics.

        Returns:
            Dictionary of all metrics and their values
        """
        result: dict[str, Any] = {
            "counters": {},
            "gauges": {},
            "histograms": {},
            "timers": {},
        }

        with self._lock:
            for name, counter in self._counters.items():
                result["counters"][name] = {
                    "description": counter.description,
                    "values": counter.get_all(),
                }

            for name, gauge in self._gauges.items():
                result["gauges"][name] = {
                    "description": gauge.description,
                    "values": gauge.get_all(),
                }

            for name, histogram in self._histograms.items():
                result["histograms"][name] = {
                    "description": histogram.description,
                    "stats": histogram.get_stats(),
                }

            for name, timer in self._timers.items():
                result["timers"][name] = {
                    "description": timer.description,
                    "stats": timer.get_stats(),
                }

        return result

    def reset(self) -> None:
        """Reset all metrics - clears values in all metric instances."""
        with self._lock:
            for counter in self._counters.values():
                counter.reset()
            for gauge in self._gauges.values():
                gauge.reset()
            for histogram in self._histograms.values():
                histogram.reset()
            for timer in self._timers.values():
                timer.reset()


# Global metrics registry
_metrics_registry = MetricsRegistry()


def get_metrics() -> MetricsRegistry:
    """Get the global metrics registry."""
    return _metrics_registry


# Convenience functions
def counter(name: str, description: str = "") -> Counter:
    """Get or create a counter from the global registry."""
    return _metrics_registry.counter(name, description)


def gauge(name: str, description: str = "") -> Gauge:
    """Get or create a gauge from the global registry."""
    return _metrics_registry.gauge(name, description)


def histogram(
    name: str,
    description: str = "",
    buckets: list[float] | None = None,
) -> Histogram:
    """Get or create a histogram from the global registry."""
    return _metrics_registry.histogram(name, description, buckets)


def timer(name: str, description: str = "") -> Timer:
    """Get or create a timer from the global registry."""
    return _metrics_registry.timer(name, description)


def collect_metrics() -> dict[str, Any]:
    """Collect all metrics from the global registry."""
    return _metrics_registry.collect()
