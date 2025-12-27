"""
Tests for Rate Limiter
======================

Comprehensive test suite for rate limiting system covering:
- Token bucket algorithm
- GitHub API rate limiting
- AI cost tracking
- Decorator functionality
- Exponential backoff
- Edge cases
"""

import asyncio
import time

import pytest
from rate_limiter import (
    CostLimitExceeded,
    CostTracker,
    RateLimiter,
    RateLimitExceeded,
    TokenBucket,
    check_rate_limit,
    rate_limited,
)


class TestTokenBucket:
    """Test token bucket algorithm."""

    def test_initial_state(self):
        """Bucket starts full."""
        bucket = TokenBucket(capacity=100, refill_rate=10.0)
        assert bucket.available() == 100

    def test_try_acquire_success(self):
        """Can acquire tokens when available."""
        bucket = TokenBucket(capacity=100, refill_rate=10.0)
        assert bucket.try_acquire(10) is True
        assert bucket.available() == 90

    def test_try_acquire_failure(self):
        """Cannot acquire when insufficient tokens."""
        bucket = TokenBucket(capacity=100, refill_rate=10.0)
        bucket.try_acquire(100)
        assert bucket.try_acquire(1) is False
        assert bucket.available() == 0

    @pytest.mark.asyncio
    async def test_acquire_waits(self):
        """Acquire waits for refill when needed."""
        bucket = TokenBucket(capacity=10, refill_rate=10.0)  # 10 tokens/sec
        bucket.try_acquire(10)  # Empty the bucket

        start = time.monotonic()
        result = await bucket.acquire(1)  # Should wait ~0.1s for 1 token
        elapsed = time.monotonic() - start

        assert result is True
        assert elapsed >= 0.05  # At least some delay
        assert elapsed < 0.5  # But not too long

    @pytest.mark.asyncio
    async def test_acquire_timeout(self):
        """Acquire respects timeout."""
        bucket = TokenBucket(capacity=10, refill_rate=1.0)  # 1 token/sec
        bucket.try_acquire(10)  # Empty the bucket

        start = time.monotonic()
        result = await bucket.acquire(100, timeout=0.1)  # Need 100s, timeout 0.1s
        elapsed = time.monotonic() - start

        assert result is False
        assert elapsed < 0.5  # Should timeout quickly

    def test_refill_over_time(self):
        """Tokens refill at correct rate."""
        bucket = TokenBucket(capacity=100, refill_rate=100.0)  # 100 tokens/sec
        bucket.try_acquire(50)  # Take 50
        assert bucket.available() == 50

        time.sleep(0.5)  # Wait 0.5s = 50 tokens
        available = bucket.available()
        assert 95 <= available <= 100  # Should be near full

    def test_time_until_available(self):
        """Calculate wait time correctly."""
        bucket = TokenBucket(capacity=100, refill_rate=10.0)
        bucket.try_acquire(100)  # Empty

        wait = bucket.time_until_available(10)
        assert 0.9 <= wait <= 1.1  # Should be ~1s for 10 tokens at 10/s


class TestCostTracker:
    """Test AI cost tracking."""

    def test_calculate_cost_sonnet(self):
        """Calculate cost for Sonnet model."""
        cost = CostTracker.calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            model="claude-sonnet-4-20250514",
        )
        # $3 input + $15 output = $18 for 1M each
        assert cost == 18.0

    def test_calculate_cost_opus(self):
        """Calculate cost for Opus model."""
        cost = CostTracker.calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            model="claude-opus-4-20250514",
        )
        # $15 input + $75 output = $90 for 1M each
        assert cost == 90.0

    def test_calculate_cost_haiku(self):
        """Calculate cost for Haiku model."""
        cost = CostTracker.calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            model="claude-haiku-3-5-20241022",
        )
        # $0.80 input + $4 output = $4.80 for 1M each
        assert cost == 4.80

    def test_calculate_cost_unknown_model(self):
        """Unknown model uses default pricing."""
        cost = CostTracker.calculate_cost(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            model="unknown-model",
        )
        # Default: $3 input + $15 output = $18
        assert cost == 18.0

    def test_add_operation_under_limit(self):
        """Can add operation under budget."""
        tracker = CostTracker(cost_limit=10.0)
        cost = tracker.add_operation(
            input_tokens=100_000,  # $0.30
            output_tokens=50_000,  # $0.75
            model="claude-sonnet-4-20250514",
            operation_name="test",
        )
        assert 1.0 <= cost <= 1.1
        assert tracker.total_cost == cost
        assert len(tracker.operations) == 1

    def test_add_operation_exceeds_limit(self):
        """Cannot add operation that exceeds budget."""
        tracker = CostTracker(cost_limit=1.0)
        with pytest.raises(CostLimitExceeded):
            tracker.add_operation(
                input_tokens=1_000_000,  # $3 - exceeds $1 limit
                output_tokens=0,
                model="claude-sonnet-4-20250514",
            )

    def test_remaining_budget(self):
        """Remaining budget calculated correctly."""
        tracker = CostTracker(cost_limit=10.0)
        tracker.add_operation(
            input_tokens=100_000,
            output_tokens=50_000,
            model="claude-sonnet-4-20250514",
        )
        remaining = tracker.remaining_budget()
        assert 8.9 <= remaining <= 9.1

    def test_usage_report(self):
        """Usage report generated."""
        tracker = CostTracker(cost_limit=10.0)
        tracker.add_operation(
            input_tokens=100_000,
            output_tokens=50_000,
            model="claude-sonnet-4-20250514",
            operation_name="operation1",
        )
        report = tracker.usage_report()
        assert "Total Cost:" in report
        assert "Budget:" in report
        assert "operation1" in report


class TestRateLimiter:
    """Test RateLimiter singleton."""

    def setup_method(self):
        """Reset singleton before each test."""
        RateLimiter.reset_instance()

    def test_singleton_pattern(self):
        """Only one instance exists."""
        limiter1 = RateLimiter.get_instance()
        limiter2 = RateLimiter.get_instance()
        assert limiter1 is limiter2

    @pytest.mark.asyncio
    async def test_acquire_github(self):
        """Can acquire GitHub tokens."""
        limiter = RateLimiter.get_instance(github_limit=10)
        assert await limiter.acquire_github() is True
        assert limiter.github_requests == 1

    @pytest.mark.asyncio
    async def test_acquire_github_rate_limited(self):
        """GitHub rate limiting works."""
        limiter = RateLimiter.get_instance(
            github_limit=2,
            github_refill_rate=0.0,  # No refill
        )
        assert await limiter.acquire_github() is True
        assert await limiter.acquire_github() is True
        # Third should timeout immediately
        assert await limiter.acquire_github(timeout=0.1) is False
        assert limiter.github_rate_limited == 1

    def test_check_github_available(self):
        """Check GitHub availability without consuming."""
        limiter = RateLimiter.get_instance(github_limit=100)
        available, msg = limiter.check_github_available()
        assert available is True
        assert "100" in msg

    def test_track_ai_cost(self):
        """Track AI costs."""
        limiter = RateLimiter.get_instance(cost_limit=10.0)
        cost = limiter.track_ai_cost(
            input_tokens=100_000,
            output_tokens=50_000,
            model="claude-sonnet-4-20250514",
            operation_name="test",
        )
        assert cost > 0
        assert limiter.cost_tracker.total_cost == cost

    def test_track_ai_cost_exceeds_limit(self):
        """Cost limit enforcement."""
        limiter = RateLimiter.get_instance(cost_limit=1.0)
        with pytest.raises(CostLimitExceeded):
            limiter.track_ai_cost(
                input_tokens=1_000_000,
                output_tokens=1_000_000,
                model="claude-sonnet-4-20250514",
            )

    def test_check_cost_available(self):
        """Check cost availability."""
        limiter = RateLimiter.get_instance(cost_limit=10.0)
        available, msg = limiter.check_cost_available()
        assert available is True
        assert "$10" in msg

    def test_record_github_error(self):
        """Record GitHub errors."""
        limiter = RateLimiter.get_instance()
        limiter.record_github_error()
        assert limiter.github_errors == 1

    def test_statistics(self):
        """Statistics collection."""
        limiter = RateLimiter.get_instance()
        stats = limiter.statistics()
        assert "github" in stats
        assert "cost" in stats
        assert "runtime_seconds" in stats

    def test_report(self):
        """Report generation."""
        limiter = RateLimiter.get_instance()
        report = limiter.report()
        assert "Rate Limiter Report" in report
        assert "GitHub API:" in report
        assert "AI Cost:" in report


class TestRateLimitedDecorator:
    """Test @rate_limited decorator."""

    def setup_method(self):
        """Reset singleton before each test."""
        RateLimiter.reset_instance()

    @pytest.mark.asyncio
    async def test_decorator_success(self):
        """Decorator allows successful calls."""

        @rate_limited(operation_type="github")
        async def test_func():
            return "success"

        result = await test_func()
        assert result == "success"

    @pytest.mark.asyncio
    async def test_decorator_rate_limited(self):
        """Decorator handles rate limiting."""
        limiter = RateLimiter.get_instance(
            github_limit=1,
            github_refill_rate=0.0,  # No refill
        )

        @rate_limited(operation_type="github", max_retries=0)
        async def test_func():
            # Consume token manually first
            if limiter.github_requests == 0:
                await limiter.acquire_github()
            return "success"

        # First call succeeds
        result = await test_func()
        assert result == "success"

        # Second call should fail (no tokens, no retry)
        with pytest.raises(RateLimitExceeded):
            await test_func()

    @pytest.mark.asyncio
    async def test_decorator_retries(self):
        """Decorator retries on rate limit."""
        limiter = RateLimiter.get_instance(
            github_limit=1,
            github_refill_rate=10.0,  # Fast refill for test
        )
        call_count = 0

        @rate_limited(operation_type="github", max_retries=2, base_delay=0.1)
        async def test_func():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # Consume all tokens
                await limiter.acquire_github()
                raise Exception("403 rate limit exceeded")
            return "success"

        result = await test_func()
        assert result == "success"
        assert call_count == 2  # Initial + 1 retry

    @pytest.mark.asyncio
    async def test_decorator_cost_limit_no_retry(self):
        """Cost limit is not retried."""
        limiter = RateLimiter.get_instance(cost_limit=0.1)

        @rate_limited(operation_type="github")
        async def test_func():
            # Exceed cost limit
            limiter.track_ai_cost(
                input_tokens=1_000_000,
                output_tokens=1_000_000,
                model="claude-sonnet-4-20250514",
            )
            return "success"

        with pytest.raises(CostLimitExceeded):
            await test_func()


class TestCheckRateLimit:
    """Test check_rate_limit helper."""

    def setup_method(self):
        """Reset singleton before each test."""
        RateLimiter.reset_instance()

    @pytest.mark.asyncio
    async def test_check_github_success(self):
        """Check passes when available."""
        RateLimiter.get_instance(github_limit=100)
        await check_rate_limit(operation_type="github")  # Should not raise

    @pytest.mark.asyncio
    async def test_check_github_failure(self):
        """Check fails when rate limited."""
        limiter = RateLimiter.get_instance(
            github_limit=0,  # No tokens
            github_refill_rate=0.0,
        )
        with pytest.raises(RateLimitExceeded):
            await check_rate_limit(operation_type="github")

    @pytest.mark.asyncio
    async def test_check_cost_success(self):
        """Check passes when budget available."""
        RateLimiter.get_instance(cost_limit=10.0)
        await check_rate_limit(operation_type="cost")  # Should not raise

    @pytest.mark.asyncio
    async def test_check_cost_failure(self):
        """Check fails when budget exceeded."""
        limiter = RateLimiter.get_instance(cost_limit=0.01)
        limiter.cost_tracker.total_cost = 10.0  # Manually exceed
        with pytest.raises(CostLimitExceeded):
            await check_rate_limit(operation_type="cost")


class TestIntegration:
    """Integration tests simulating real usage."""

    def setup_method(self):
        """Reset singleton before each test."""
        RateLimiter.reset_instance()

    @pytest.mark.asyncio
    async def test_github_workflow(self):
        """Simulate GitHub automation workflow."""
        limiter = RateLimiter.get_instance(
            github_limit=10,
            github_refill_rate=10.0,
            cost_limit=5.0,
        )

        @rate_limited(operation_type="github")
        async def fetch_pr():
            return {"number": 123}

        @rate_limited(operation_type="github")
        async def fetch_diff():
            return {"files": []}

        # Simulate workflow
        pr = await fetch_pr()
        assert pr["number"] == 123

        diff = await fetch_diff()
        assert "files" in diff

        # Track AI review
        limiter.track_ai_cost(
            input_tokens=5000,
            output_tokens=2000,
            model="claude-sonnet-4-20250514",
            operation_name="PR review",
        )

        # Check stats
        stats = limiter.statistics()
        assert stats["github"]["total_requests"] >= 2
        assert stats["cost"]["total_cost"] > 0

    @pytest.mark.asyncio
    async def test_burst_handling(self):
        """Handle burst of requests."""
        limiter = RateLimiter.get_instance(
            github_limit=5,
            github_refill_rate=5.0,
        )

        @rate_limited(operation_type="github", max_retries=1, base_delay=0.1)
        async def api_call(n: int):
            return n

        # Make 10 calls (will hit limit at 5, then wait for refill)
        results = []
        for i in range(10):
            result = await api_call(i)
            results.append(result)

        assert len(results) == 10
        assert results == list(range(10))

    @pytest.mark.asyncio
    async def test_cost_tracking_multiple_models(self):
        """Track costs across different models."""
        limiter = RateLimiter.get_instance(cost_limit=100.0)

        # Sonnet for review
        limiter.track_ai_cost(
            input_tokens=10_000,
            output_tokens=5_000,
            model="claude-sonnet-4-20250514",
            operation_name="PR review",
        )

        # Haiku for triage
        limiter.track_ai_cost(
            input_tokens=5_000,
            output_tokens=2_000,
            model="claude-haiku-3-5-20241022",
            operation_name="Issue triage",
        )

        # Opus for complex analysis
        limiter.track_ai_cost(
            input_tokens=20_000,
            output_tokens=10_000,
            model="claude-opus-4-20250514",
            operation_name="Architecture review",
        )

        stats = limiter.statistics()
        assert stats["cost"]["operations"] == 3
        assert stats["cost"]["total_cost"] < 100.0

        report = limiter.cost_tracker.usage_report()
        assert "PR review" in report
        assert "Issue triage" in report
        assert "Architecture review" in report


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
