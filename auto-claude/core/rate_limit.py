"""
Rate Limiting Utilities
=======================

Enterprise-grade rate limiting for API calls and resource access.

Features:
- Token bucket algorithm for smooth rate limiting
- Sliding window rate limiter for burst control
- Async-compatible rate limiting
- Configurable limits per resource/endpoint
- Automatic retry with rate limit awareness
"""

import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""

    requests_per_second: float = 10.0
    burst_size: int = 20
    retry_after_seconds: float = 1.0


class TokenBucket:
    """
    Token bucket rate limiter.

    Provides smooth rate limiting with burst capacity.
    Thread-safe implementation.
    """

    def __init__(
        self,
        rate: float = 10.0,
        capacity: int = 20,
    ):
        """
        Initialize token bucket.

        Args:
            rate: Tokens per second to add
            capacity: Maximum tokens (burst capacity)
        """
        self._rate = rate
        self._capacity = capacity
        self._tokens = float(capacity)
        self._last_update = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        """Refill tokens based on elapsed time."""
        now = time.monotonic()
        elapsed = now - self._last_update
        self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
        self._last_update = now

    def acquire(self, tokens: int = 1, blocking: bool = True) -> bool:
        """
        Acquire tokens from the bucket.

        Args:
            tokens: Number of tokens to acquire
            blocking: Whether to block until tokens are available

        Returns:
            True if tokens were acquired, False otherwise
        """
        with self._lock:
            self._refill()

            if self._tokens >= tokens:
                self._tokens -= tokens
                return True

            if not blocking:
                return False

            # Calculate wait time while holding the lock
            wait_time = (tokens - self._tokens) / self._rate

        # Wait for tokens to become available
        time.sleep(wait_time)

        with self._lock:
            self._refill()
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False

    async def acquire_async(self, tokens: int = 1) -> bool:
        """
        Async version of acquire.

        Args:
            tokens: Number of tokens to acquire

        Returns:
            True when tokens are acquired
        """
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return True

                wait_time = (tokens - self._tokens) / self._rate

            await asyncio.sleep(wait_time)

    @property
    def available_tokens(self) -> float:
        """Get current number of available tokens."""
        with self._lock:
            self._refill()
            return self._tokens


class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter.

    More accurate than fixed window but slightly more memory intensive.
    Useful for strict rate limit enforcement.
    """

    def __init__(
        self,
        max_requests: int = 100,
        window_seconds: float = 60.0,
    ):
        """
        Initialize sliding window limiter.

        Args:
            max_requests: Maximum requests allowed in window
            window_seconds: Size of the sliding window in seconds
        """
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._requests: list[float] = []
        self._lock = threading.Lock()

    def _cleanup(self, now: float) -> None:
        """Remove expired requests from the window."""
        cutoff = now - self._window_seconds
        self._requests = [t for t in self._requests if t > cutoff]

    def can_proceed(self) -> bool:
        """
        Check if a request can proceed without blocking.

        Returns:
            True if under rate limit, False otherwise
        """
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            return len(self._requests) < self._max_requests

    def acquire(self, blocking: bool = True) -> bool:
        """
        Acquire permission to proceed.

        Args:
            blocking: Whether to wait if rate limited

        Returns:
            True if acquired, False if non-blocking and rate limited
        """
        now = time.monotonic()

        with self._lock:
            self._cleanup(now)

            if len(self._requests) < self._max_requests:
                self._requests.append(now)
                return True

            if not blocking:
                return False

            # Calculate wait time
            oldest = self._requests[0]
            wait_time = oldest + self._window_seconds - now

        if wait_time > 0:
            time.sleep(wait_time)

        return self.acquire(blocking=False)

    async def acquire_async(self) -> bool:
        """Async version of acquire."""
        now = time.monotonic()

        with self._lock:
            self._cleanup(now)

            if len(self._requests) < self._max_requests:
                self._requests.append(now)
                return True

            oldest = self._requests[0]
            wait_time = oldest + self._window_seconds - now

        if wait_time > 0:
            await asyncio.sleep(wait_time)

        return await self.acquire_async()

    @property
    def current_count(self) -> int:
        """Get current request count in the window."""
        with self._lock:
            self._cleanup(time.monotonic())
            return len(self._requests)

    @property
    def remaining(self) -> int:
        """Get remaining requests allowed in current window."""
        return max(0, self._max_requests - self.current_count)


@dataclass
class RateLimitState:
    """State tracking for rate-limited resources."""

    resource_id: str
    limiter: TokenBucket | SlidingWindowRateLimiter
    stats: dict[str, Any] = field(default_factory=dict)


class RateLimitManager:
    """
    Manages rate limits across multiple resources/endpoints.

    Provides centralized rate limiting with per-resource configuration.
    """

    def __init__(self):
        """Initialize rate limit manager."""
        self._limiters: dict[str, RateLimitState] = {}
        self._lock = threading.Lock()
        self._default_config = RateLimitConfig()

    def configure(
        self,
        resource_id: str,
        requests_per_second: float = 10.0,
        burst_size: int = 20,
        use_sliding_window: bool = False,
        window_seconds: float = 60.0,
    ) -> None:
        """
        Configure rate limiting for a resource.

        Args:
            resource_id: Unique identifier for the resource
            requests_per_second: Rate limit (for token bucket)
            burst_size: Burst capacity (for token bucket) or max requests (for sliding window)
            use_sliding_window: Use sliding window instead of token bucket
            window_seconds: Window size for sliding window limiter
        """
        with self._lock:
            if use_sliding_window:
                limiter = SlidingWindowRateLimiter(
                    max_requests=burst_size,
                    window_seconds=window_seconds,
                )
            else:
                limiter = TokenBucket(
                    rate=requests_per_second,
                    capacity=burst_size,
                )

            self._limiters[resource_id] = RateLimitState(
                resource_id=resource_id,
                limiter=limiter,
                stats={"acquired": 0, "rejected": 0},
            )

    def acquire(
        self,
        resource_id: str,
        tokens: int = 1,
        blocking: bool = True,
    ) -> bool:
        """
        Acquire rate limit permission for a resource.

        Args:
            resource_id: Resource to acquire for
            tokens: Number of tokens (for token bucket)
            blocking: Whether to wait if rate limited

        Returns:
            True if acquired, False if rejected
        """
        with self._lock:
            if resource_id not in self._limiters:
                # Create default limiter
                self.configure(resource_id)
            state = self._limiters[resource_id]

        if isinstance(state.limiter, TokenBucket):
            result = state.limiter.acquire(tokens=tokens, blocking=blocking)
        else:
            result = state.limiter.acquire(blocking=blocking)

        # Update stats
        with self._lock:
            if result:
                state.stats["acquired"] += 1
            else:
                state.stats["rejected"] += 1

        return result

    async def acquire_async(
        self,
        resource_id: str,
        tokens: int = 1,
    ) -> bool:
        """Async version of acquire."""
        with self._lock:
            if resource_id not in self._limiters:
                self.configure(resource_id)
            state = self._limiters[resource_id]

        if isinstance(state.limiter, TokenBucket):
            result = await state.limiter.acquire_async(tokens=tokens)
        else:
            result = await state.limiter.acquire_async()

        with self._lock:
            state.stats["acquired"] += 1

        return result

    def get_stats(self, resource_id: str | None = None) -> dict[str, Any]:
        """
        Get rate limiting statistics.

        Args:
            resource_id: Specific resource, or None for all

        Returns:
            Statistics dictionary
        """
        with self._lock:
            if resource_id:
                if resource_id in self._limiters:
                    state = self._limiters[resource_id]
                    return {
                        "resource_id": resource_id,
                        **state.stats,
                    }
                return {}

            return {
                rid: {"resource_id": rid, **state.stats}
                for rid, state in self._limiters.items()
            }


# Global rate limit manager
_rate_limit_manager = RateLimitManager()


def get_rate_limiter() -> RateLimitManager:
    """Get the global rate limit manager."""
    return _rate_limit_manager


def rate_limited(
    resource_id: str,
    tokens: int = 1,
    blocking: bool = True,
):
    """
    Decorator for rate-limited functions.

    Args:
        resource_id: Resource identifier for rate limiting
        tokens: Tokens to consume per call
        blocking: Whether to block when rate limited
    """
    import functools

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not _rate_limit_manager.acquire(resource_id, tokens, blocking):
                from .exceptions import RateLimitError

                raise RateLimitError(
                    f"Rate limit exceeded for {resource_id}",
                    retry_after=1.0,
                )
            return func(*args, **kwargs)

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            await _rate_limit_manager.acquire_async(resource_id, tokens)
            return await func(*args, **kwargs)

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper

    return decorator
