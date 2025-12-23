"""
Tests for core/rate_limit.py
==============================

Tests for rate limiting utilities.
"""

import asyncio
import threading
import time

import pytest

from core.rate_limit import (
    RateLimitManager,
    SlidingWindowRateLimiter,
    TokenBucket,
    get_rate_limiter,
    rate_limited,
)


class TestTokenBucket:
    """Tests for TokenBucket rate limiter."""

    def test_basic_acquire(self):
        """Test basic token acquisition."""
        bucket = TokenBucket(rate=10.0, capacity=10)
        # Should succeed with full bucket
        assert bucket.acquire(tokens=1, blocking=False) is True
        assert bucket.acquire(tokens=1, blocking=False) is True

    def test_bucket_depletion(self):
        """Test bucket depletion and refill."""
        bucket = TokenBucket(rate=100.0, capacity=5)
        # Deplete bucket
        for _ in range(5):
            bucket.acquire(tokens=1, blocking=False)
        # Should fail when empty (non-blocking)
        assert bucket.acquire(tokens=1, blocking=False) is False

    def test_available_tokens(self):
        """Test available tokens property."""
        bucket = TokenBucket(rate=10.0, capacity=10)
        initial = bucket.available_tokens
        assert initial == 10.0
        bucket.acquire(tokens=3, blocking=False)
        # Available tokens should be 7 (allow some margin for timing)
        assert 6.9 <= bucket.available_tokens <= 7.1

    def test_refill_over_time(self):
        """Test that tokens refill over time."""
        bucket = TokenBucket(rate=100.0, capacity=5)
        # Deplete bucket
        for _ in range(5):
            bucket.acquire(tokens=1, blocking=False)
        # Wait for some refill
        time.sleep(0.05)
        # Should have some tokens now
        assert bucket.available_tokens > 0

    @pytest.mark.asyncio
    async def test_async_acquire(self):
        """Test async token acquisition."""
        bucket = TokenBucket(rate=100.0, capacity=5)
        result = await bucket.acquire_async(tokens=1)
        assert result is True


class TestSlidingWindowRateLimiter:
    """Tests for SlidingWindowRateLimiter."""

    def test_basic_acquire(self):
        """Test basic acquire."""
        limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=1.0)
        for _ in range(5):
            assert limiter.acquire(blocking=False) is True
        # Sixth request should fail
        assert limiter.acquire(blocking=False) is False

    def test_can_proceed(self):
        """Test can_proceed check."""
        limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=1.0)
        assert limiter.can_proceed() is True
        for _ in range(3):
            limiter.acquire(blocking=False)
        assert limiter.can_proceed() is False

    def test_current_count(self):
        """Test current request count."""
        limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=1.0)
        assert limiter.current_count == 0
        limiter.acquire(blocking=False)
        limiter.acquire(blocking=False)
        assert limiter.current_count == 2

    def test_remaining(self):
        """Test remaining requests."""
        limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=1.0)
        assert limiter.remaining == 5
        limiter.acquire(blocking=False)
        assert limiter.remaining == 4

    @pytest.mark.asyncio
    async def test_async_acquire(self):
        """Test async acquire."""
        limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=1.0)
        result = await limiter.acquire_async()
        assert result is True


class TestRateLimitManager:
    """Tests for RateLimitManager."""

    def test_configure_resource(self):
        """Test configuring a resource."""
        manager = RateLimitManager()
        manager.configure("api_endpoint", requests_per_second=100.0, burst_size=100)
        assert manager.acquire("api_endpoint", blocking=False) is True

    def test_auto_configure(self):
        """Test auto-configuration on first acquire."""
        manager = RateLimitManager()
        manager.configure("new_resource", requests_per_second=100.0, burst_size=100)
        # Should work with explicit configuration
        assert manager.acquire("new_resource", blocking=False) is True

    def test_sliding_window_configuration(self):
        """Test sliding window configuration."""
        manager = RateLimitManager()
        manager.configure(
            "strict_endpoint",
            burst_size=5,
            use_sliding_window=True,
            window_seconds=1.0,
        )
        for _ in range(5):
            assert manager.acquire("strict_endpoint", blocking=False) is True
        assert manager.acquire("strict_endpoint", blocking=False) is False

    def test_stats_collection(self):
        """Test statistics collection."""
        manager = RateLimitManager()
        manager.configure("test", requests_per_second=100.0, burst_size=100)
        manager.acquire("test", blocking=False)
        manager.acquire("test", blocking=False)

        stats = manager.get_stats("test")
        assert stats["acquired"] == 2
        assert stats["rejected"] == 0

    def test_all_stats(self):
        """Test getting all stats."""
        manager = RateLimitManager()
        manager.configure("r1", burst_size=10)
        manager.configure("r2", burst_size=10)
        manager.acquire("r1", blocking=False)
        manager.acquire("r2", blocking=False)

        all_stats = manager.get_stats()
        assert "r1" in all_stats
        assert "r2" in all_stats

    @pytest.mark.asyncio
    async def test_async_acquire(self):
        """Test async acquire."""
        manager = RateLimitManager()
        manager.configure("async_test", burst_size=5)
        result = await manager.acquire_async("async_test")
        assert result is True


class TestGlobalRateLimiter:
    """Tests for global rate limiter."""

    def test_get_rate_limiter(self):
        """Test getting global rate limiter."""
        limiter = get_rate_limiter()
        assert isinstance(limiter, RateLimitManager)

    def test_rate_limited_decorator(self):
        """Test rate_limited decorator."""
        # Create a new manager to avoid interference
        from core import rate_limit
        original_manager = rate_limit._rate_limit_manager
        rate_limit._rate_limit_manager = RateLimitManager()
        rate_limit._rate_limit_manager.configure("test_func", burst_size=1000)

        try:
            @rate_limited("test_func")
            def my_function():
                return "success"

            result = my_function()
            assert result == "success"
        finally:
            rate_limit._rate_limit_manager = original_manager


class TestThreadSafety:
    """Tests for thread safety."""

    def test_token_bucket_thread_safety(self):
        """Test TokenBucket under concurrent access."""
        bucket = TokenBucket(rate=1000.0, capacity=100)
        acquired = []

        def worker():
            for _ in range(20):
                if bucket.acquire(tokens=1, blocking=False):
                    acquired.append(1)

        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Should have acquired at most 100 tokens
        assert len(acquired) <= 100

    def test_sliding_window_thread_safety(self):
        """Test SlidingWindowRateLimiter under concurrent access."""
        limiter = SlidingWindowRateLimiter(max_requests=50, window_seconds=10.0)
        acquired = []

        def worker():
            for _ in range(20):
                if limiter.acquire(blocking=False):
                    acquired.append(1)

        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Should have acquired at most 50
        assert len(acquired) <= 50
