"""
Retry Utilities
===============

Enterprise-grade retry logic with exponential backoff for resilient operations.

Features:
- Configurable retry strategies
- Exponential backoff with jitter
- Specific exception handling
- Async support
- Circuit breaker pattern (optional)
"""

import asyncio
import functools
import logging
import random
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, TypeVar

from .exceptions import AutoClaudeError, is_retryable

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BackoffStrategy(Enum):
    """Backoff strategies for retry logic."""

    CONSTANT = "constant"  # Same delay each time
    LINEAR = "linear"  # Delay increases linearly
    EXPONENTIAL = "exponential"  # Delay doubles each time
    FIBONACCI = "fibonacci"  # Delay follows Fibonacci sequence


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_attempts: int = 3
    initial_delay: float = 1.0  # seconds
    max_delay: float = 60.0  # seconds
    backoff_strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL
    backoff_multiplier: float = 2.0
    jitter: bool = True  # Add randomness to prevent thundering herd
    jitter_factor: float = 0.25  # Max jitter as fraction of delay
    retry_on: Sequence[type[Exception]] = field(default_factory=lambda: (Exception,))
    stop_on: Sequence[type[Exception]] = field(default_factory=tuple)

    def calculate_delay(self, attempt: int) -> float:
        """
        Calculate delay for a given attempt number.

        Args:
            attempt: Attempt number (0-indexed)

        Returns:
            Delay in seconds
        """
        if self.backoff_strategy == BackoffStrategy.CONSTANT:
            delay = self.initial_delay

        elif self.backoff_strategy == BackoffStrategy.LINEAR:
            delay = self.initial_delay * (attempt + 1)

        elif self.backoff_strategy == BackoffStrategy.EXPONENTIAL:
            delay = self.initial_delay * (self.backoff_multiplier**attempt)

        elif self.backoff_strategy == BackoffStrategy.FIBONACCI:
            delay = self.initial_delay * _fibonacci(attempt + 2)

        else:
            delay = self.initial_delay

        # Apply max delay cap
        delay = min(delay, self.max_delay)

        # Apply jitter
        if self.jitter:
            jitter_range = delay * self.jitter_factor
            delay += random.uniform(-jitter_range, jitter_range)
            delay = max(0.1, delay)  # Ensure minimum delay

        return delay


def _fibonacci(n: int) -> int:
    """Calculate nth Fibonacci number."""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b


@dataclass
class RetryResult:
    """Result of a retry operation."""

    success: bool
    result: Any = None
    attempts: int = 0
    total_delay: float = 0.0
    last_exception: Exception | None = None

    @property
    def failed(self) -> bool:
        return not self.success


def should_retry(
    exception: Exception,
    config: RetryConfig,
    attempt: int,
) -> bool:
    """
    Determine if an operation should be retried.

    Args:
        exception: The exception that occurred
        config: Retry configuration
        attempt: Current attempt number

    Returns:
        True if should retry, False otherwise
    """
    # Check if we've exceeded max attempts
    if attempt >= config.max_attempts:
        return False

    # Check if this exception type should stop retries
    for stop_type in config.stop_on:
        if isinstance(exception, stop_type):
            return False

    # Check if exception is retryable (using our exception hierarchy)
    if isinstance(exception, AutoClaudeError) and not exception.retryable:
        return False

    # Check if exception matches retry_on types
    for retry_type in config.retry_on:
        if isinstance(exception, retry_type):
            return True

    # Default: check if error is generally retryable
    return is_retryable(exception)


def retry(
    config: RetryConfig | None = None,
    max_attempts: int | None = None,
    initial_delay: float | None = None,
    retry_on: Sequence[type[Exception]] | None = None,
):
    """
    Decorator for adding retry logic to functions.

    Can be used with or without arguments:
        @retry
        def my_func(): ...

        @retry(max_attempts=5)
        def my_func(): ...

    Args:
        config: Full retry configuration
        max_attempts: Override max attempts
        initial_delay: Override initial delay
        retry_on: Override retry exceptions
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        # Build config from defaults and overrides
        effective_config = config or RetryConfig()
        if max_attempts is not None:
            effective_config.max_attempts = max_attempts
        if initial_delay is not None:
            effective_config.initial_delay = initial_delay
        if retry_on is not None:
            effective_config.retry_on = retry_on

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> T:
            return _retry_sync(func, args, kwargs, effective_config)

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            return await _retry_async(func, args, kwargs, effective_config)

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    # Handle @retry without parentheses
    if callable(config):
        func = config
        config = None
        return decorator(func)

    return decorator


def _retry_sync(
    func: Callable[..., T],
    args: tuple,
    kwargs: dict,
    config: RetryConfig,
) -> T:
    """Execute sync function with retry logic."""
    last_exception: Exception | None = None
    attempt = 0

    while attempt < config.max_attempts:
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            attempt += 1

            if not should_retry(e, config, attempt):
                logger.warning(
                    f"{func.__name__} failed (non-retryable): {e}",
                    extra={"attempt": attempt, "error_type": type(e).__name__},
                )
                raise

            delay = config.calculate_delay(attempt - 1)
            logger.info(
                f"{func.__name__} failed, retrying in {delay:.1f}s "
                f"(attempt {attempt}/{config.max_attempts}): {e}",
                extra={
                    "attempt": attempt,
                    "delay": delay,
                    "error_type": type(e).__name__,
                },
            )
            time.sleep(delay)

    # All retries exhausted
    logger.error(
        f"{func.__name__} failed after {attempt} attempts",
        extra={"attempts": attempt},
    )
    if last_exception:
        raise last_exception
    raise RuntimeError(f"{func.__name__} failed after {attempt} attempts")


async def _retry_async(
    func: Callable[..., T],
    args: tuple,
    kwargs: dict,
    config: RetryConfig,
) -> T:
    """Execute async function with retry logic."""
    last_exception: Exception | None = None
    attempt = 0

    while attempt < config.max_attempts:
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            attempt += 1

            if not should_retry(e, config, attempt):
                logger.warning(
                    f"{func.__name__} failed (non-retryable): {e}",
                    extra={"attempt": attempt, "error_type": type(e).__name__},
                )
                raise

            delay = config.calculate_delay(attempt - 1)
            logger.info(
                f"{func.__name__} failed, retrying in {delay:.1f}s "
                f"(attempt {attempt}/{config.max_attempts}): {e}",
                extra={
                    "attempt": attempt,
                    "delay": delay,
                    "error_type": type(e).__name__,
                },
            )
            await asyncio.sleep(delay)

    # All retries exhausted
    logger.error(
        f"{func.__name__} failed after {attempt} attempts",
        extra={"attempts": attempt},
    )
    if last_exception:
        raise last_exception
    raise RuntimeError(f"{func.__name__} failed after {attempt} attempts")


def retry_with_result(
    func: Callable[..., T],
    *args: Any,
    config: RetryConfig | None = None,
    **kwargs: Any,
) -> RetryResult:
    """
    Execute a function with retry and return detailed result.

    Unlike the decorator, this returns a RetryResult that includes
    attempt counts and timing information.

    Args:
        func: Function to execute
        *args: Function arguments
        config: Retry configuration
        **kwargs: Function keyword arguments

    Returns:
        RetryResult with success status, result or exception
    """
    effective_config = config or RetryConfig()
    attempt = 0
    total_delay = 0.0
    last_exception: Exception | None = None

    while attempt < effective_config.max_attempts:
        try:
            result = func(*args, **kwargs)
            return RetryResult(
                success=True,
                result=result,
                attempts=attempt + 1,
                total_delay=total_delay,
            )
        except Exception as e:
            last_exception = e
            attempt += 1

            if not should_retry(e, effective_config, attempt):
                break

            delay = effective_config.calculate_delay(attempt - 1)
            total_delay += delay
            time.sleep(delay)

    return RetryResult(
        success=False,
        attempts=attempt,
        total_delay=total_delay,
        last_exception=last_exception,
    )


async def async_retry_with_result(
    func: Callable[..., T],
    *args: Any,
    config: RetryConfig | None = None,
    **kwargs: Any,
) -> RetryResult:
    """
    Async version of retry_with_result.
    """
    effective_config = config or RetryConfig()
    attempt = 0
    total_delay = 0.0
    last_exception: Exception | None = None

    while attempt < effective_config.max_attempts:
        try:
            result = await func(*args, **kwargs)
            return RetryResult(
                success=True,
                result=result,
                attempts=attempt + 1,
                total_delay=total_delay,
            )
        except Exception as e:
            last_exception = e
            attempt += 1

            if not should_retry(e, effective_config, attempt):
                break

            delay = effective_config.calculate_delay(attempt - 1)
            total_delay += delay
            await asyncio.sleep(delay)

    return RetryResult(
        success=False,
        attempts=attempt,
        total_delay=total_delay,
        last_exception=last_exception,
    )


# Pre-configured retry strategies for common use cases

NETWORK_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    initial_delay=1.0,
    max_delay=30.0,
    backoff_strategy=BackoffStrategy.EXPONENTIAL,
    retry_on=(OSError, ConnectionError, TimeoutError),
)

API_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    initial_delay=2.0,
    max_delay=20.0,
    backoff_strategy=BackoffStrategy.EXPONENTIAL,
)

QUICK_RETRY_CONFIG = RetryConfig(
    max_attempts=2,
    initial_delay=0.5,
    max_delay=2.0,
    backoff_strategy=BackoffStrategy.CONSTANT,
)

PATIENT_RETRY_CONFIG = RetryConfig(
    max_attempts=10,
    initial_delay=5.0,
    max_delay=120.0,
    backoff_strategy=BackoffStrategy.EXPONENTIAL,
    backoff_multiplier=1.5,
)
