"""
Tests for core/metrics.py
==========================

Tests for metrics collection utilities.
"""

import threading
import time

import pytest

from core.metrics import (
    Counter,
    Gauge,
    Histogram,
    MetricsRegistry,
    Timer,
    collect_metrics,
    counter,
    gauge,
    get_metrics,
    histogram,
    timer,
)


class TestCounter:
    """Tests for Counter metric."""

    def test_increment(self):
        """Test basic increment."""
        c = Counter("test_counter")
        c.inc()
        assert c.get() == 1.0
        c.inc(5.0)
        assert c.get() == 6.0

    def test_negative_increment_raises(self):
        """Test that negative increments raise."""
        c = Counter("test_counter")
        with pytest.raises(ValueError):
            c.inc(-1.0)

    def test_labels(self):
        """Test counter with labels."""
        c = Counter("requests")
        c.inc(method="GET", path="/api")
        c.inc(method="POST", path="/api")
        c.inc(method="GET", path="/api")

        assert c.get(method="GET", path="/api") == 2.0
        assert c.get(method="POST", path="/api") == 1.0

    def test_reset(self):
        """Test counter reset."""
        c = Counter("test")
        c.inc(10)
        c.reset()
        assert c.get() == 0.0

    def test_get_all(self):
        """Test getting all counter values."""
        c = Counter("test")
        c.inc(1, label="a")
        c.inc(2, label="b")
        all_values = c.get_all()
        assert len(all_values) == 2
        # Returns list of (labels_dict, value) tuples
        assert isinstance(all_values, list)


class TestGauge:
    """Tests for Gauge metric."""

    def test_set(self):
        """Test set operation."""
        g = Gauge("test_gauge")
        g.set(42.0)
        assert g.get() == 42.0

    def test_inc_dec(self):
        """Test increment and decrement."""
        g = Gauge("test_gauge")
        g.set(10.0)
        g.inc(5.0)
        assert g.get() == 15.0
        g.dec(3.0)
        assert g.get() == 12.0

    def test_labels(self):
        """Test gauge with labels."""
        g = Gauge("connections")
        g.set(5, server="a")
        g.set(10, server="b")
        assert g.get(server="a") == 5
        assert g.get(server="b") == 10

    def test_get_all(self):
        """Test getting all gauge values."""
        g = Gauge("test")
        g.set(1, label="x")
        g.set(2, label="y")
        all_values = g.get_all()
        assert len(all_values) == 2
        # Returns list of (labels_dict, value) tuples
        assert isinstance(all_values, list)


class TestHistogram:
    """Tests for Histogram metric."""

    def test_observe(self):
        """Test observe operation."""
        h = Histogram("response_time")
        h.observe(0.1)
        h.observe(0.2)
        h.observe(0.3)

        stats = h.get_stats()
        assert stats["count"] == 3
        assert stats["sum"] == pytest.approx(0.6)
        assert stats["mean"] == pytest.approx(0.2)

    def test_percentiles(self):
        """Test percentile calculation."""
        h = Histogram("latency")
        # Add 100 values from 1 to 100
        for i in range(1, 101):
            h.observe(float(i))

        stats = h.get_stats()
        assert stats["min"] == 1.0
        assert stats["max"] == 100.0
        # p50 should be around 50 (allow some margin due to index calculation)
        assert 49.0 <= stats["p50"] <= 51.0
        assert stats["p90"] >= 89.0

    def test_labels(self):
        """Test histogram with labels."""
        h = Histogram("request_duration")
        h.observe(0.1, endpoint="/api")
        h.observe(0.2, endpoint="/api")

        stats = h.get_stats(endpoint="/api")
        assert stats["count"] == 2

    def test_buckets(self):
        """Test bucket counts."""
        h = Histogram("test", buckets=[0.1, 0.5, 1.0])
        h.observe(0.05)
        h.observe(0.3)
        h.observe(0.8)
        h.observe(2.0)

        buckets = h.get_buckets()
        assert buckets[0.1] == 1
        assert buckets[0.5] == 1
        assert buckets[1.0] == 1
        assert buckets[float("inf")] == 1


class TestTimer:
    """Tests for Timer metric."""

    def test_observe(self):
        """Test manual observation."""
        t = Timer("operation_time")
        t.observe(0.5)
        t.observe(1.0)

        stats = t.get_stats()
        assert stats["count"] == 2

    def test_context_manager(self):
        """Test timer context manager."""
        t = Timer("timed_operation")

        with t.time(operation="test"):
            time.sleep(0.01)

        stats = t.get_stats(operation="test")
        assert stats["count"] == 1
        assert stats["mean"] >= 0.01


class TestMetricsRegistry:
    """Tests for MetricsRegistry."""

    def test_counter_creation(self):
        """Test counter creation and retrieval."""
        registry = MetricsRegistry()
        c1 = registry.counter("test", "Test counter")
        c2 = registry.counter("test")
        assert c1 is c2

    def test_gauge_creation(self):
        """Test gauge creation."""
        registry = MetricsRegistry()
        g = registry.gauge("test_gauge", "Test gauge")
        g.set(42)
        assert g.get() == 42

    def test_histogram_creation(self):
        """Test histogram creation."""
        registry = MetricsRegistry()
        h = registry.histogram("test_hist", buckets=[0.1, 0.5, 1.0])
        h.observe(0.3)
        assert h.get_stats()["count"] == 1

    def test_timer_creation(self):
        """Test timer creation."""
        registry = MetricsRegistry()
        t = registry.timer("test_timer")
        t.observe(0.1)
        assert t.get_stats()["count"] == 1

    def test_collect(self):
        """Test collecting all metrics."""
        registry = MetricsRegistry()
        registry.counter("requests").inc()
        registry.gauge("active_connections").set(5)
        registry.histogram("response_time").observe(0.1)
        registry.timer("operation").observe(0.2)

        collected = registry.collect()
        assert "counters" in collected
        assert "gauges" in collected
        assert "histograms" in collected
        assert "timers" in collected
        assert "requests" in collected["counters"]

    def test_reset(self):
        """Test resetting all metrics."""
        registry = MetricsRegistry()
        registry.counter("test").inc(10)
        registry.reset()
        # Counter should be reset
        assert registry.counter("test").get() == 0


class TestGlobalMetrics:
    """Tests for global metrics functions."""

    def test_get_metrics(self):
        """Test getting global registry."""
        registry = get_metrics()
        assert isinstance(registry, MetricsRegistry)

    def test_convenience_counter(self):
        """Test counter convenience function."""
        c = counter("global_test_counter")
        c.inc()
        assert c.get() >= 1

    def test_convenience_gauge(self):
        """Test gauge convenience function."""
        g = gauge("global_test_gauge")
        g.set(100)
        assert g.get() == 100

    def test_convenience_histogram(self):
        """Test histogram convenience function."""
        h = histogram("global_test_histogram")
        h.observe(0.5)
        assert h.get_stats()["count"] >= 1

    def test_convenience_timer(self):
        """Test timer convenience function."""
        t = timer("global_test_timer")
        t.observe(0.1)
        assert t.get_stats()["count"] >= 1

    def test_collect_metrics(self):
        """Test collect_metrics function."""
        collected = collect_metrics()
        assert isinstance(collected, dict)
        assert "counters" in collected


class TestThreadSafety:
    """Tests for thread safety."""

    def test_counter_thread_safety(self):
        """Test counter under concurrent increments."""
        c = Counter("concurrent_counter")

        def worker():
            for _ in range(100):
                c.inc()

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert c.get() == 1000.0

    def test_gauge_thread_safety(self):
        """Test gauge under concurrent updates."""
        g = Gauge("concurrent_gauge")
        g.set(0)

        def worker():
            for _ in range(100):
                g.inc()

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert g.get() == 1000.0
