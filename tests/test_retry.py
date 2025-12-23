"""
Tests for core/retry.py
========================

Tests for retry utilities with exponential backoff.
"""

import asyncio
import time
from unittest.mock import MagicMock, patch

import pytest

from core.exceptions import NetworkError, ValidationError
from core.retry import (
    API_RETRY_CONFIG,
    NETWORK_RETRY_CONFIG,
    PATIENT_RETRY_CONFIG,
    QUICK_RETRY_CONFIG,
    BackoffStrategy,
    RetryConfig,
    RetryResult,
    async_retry_with_result,
    retry,
    retry_with_result,
    should_retry,
)


class TestRetryConfig:
    """Tests for RetryConfig dataclass."""

    def test_default_config(self):
        """Test default configuration values."""
        config = RetryConfig()
        assert config.max_attempts == 3
        assert config.initial_delay == 1.0
        assert config.max_delay == 60.0
        assert config.backoff_strategy == BackoffStrategy.EXPONENTIAL

    def test_constant_backoff_delay(self):
        """Test constant backoff strategy."""
        config = RetryConfig(
            initial_delay=1.0,
            backoff_strategy=BackoffStrategy.CONSTANT,
            jitter=False,
        )
        assert config.calculate_delay(0) == 1.0
        assert config.calculate_delay(1) == 1.0
        assert config.calculate_delay(5) == 1.0

    def test_linear_backoff_delay(self):
        """Test linear backoff strategy."""
        config = RetryConfig(
            initial_delay=1.0,
            backoff_strategy=BackoffStrategy.LINEAR,
            jitter=False,
        )
        assert config.calculate_delay(0) == 1.0
        assert config.calculate_delay(1) == 2.0
        assert config.calculate_delay(2) == 3.0

    def test_exponential_backoff_delay(self):
        """Test exponential backoff strategy."""
        config = RetryConfig(
            initial_delay=1.0,
            backoff_multiplier=2.0,
            backoff_strategy=BackoffStrategy.EXPONENTIAL,
            jitter=False,
        )
        assert config.calculate_delay(0) == 1.0
        assert config.calculate_delay(1) == 2.0
        assert config.calculate_delay(2) == 4.0
        assert config.calculate_delay(3) == 8.0

    def test_max_delay_cap(self):
        """Test that delay is capped at max_delay."""
        config = RetryConfig(
            initial_delay=10.0,
            max_delay=15.0,
            backoff_strategy=BackoffStrategy.EXPONENTIAL,
            jitter=False,
        )
        # After a few iterations, should hit max_delay
        assert config.calculate_delay(5) == 15.0

    def test_jitter_adds_randomness(self):
        """Test that jitter adds randomness to delay."""
        config = RetryConfig(
            initial_delay=1.0,
            backoff_strategy=BackoffStrategy.CONSTANT,
            jitter=True,
            jitter_factor=0.25,
        )
        # With jitter, delays should vary
        delays = [config.calculate_delay(0) for _ in range(10)]
        # Not all delays should be exactly the same
        assert len(set(delays)) > 1


class TestShouldRetry:
    """Tests for should_retry function."""

    def test_max_attempts_exceeded(self):
        """Test that retry stops after max attempts."""
        config = RetryConfig(max_attempts=3)
        error = NetworkError("Network error")
        assert should_retry(error, config, 3) is False

    def test_retryable_error(self):
        """Test that retryable errors are retried."""
        config = RetryConfig(max_attempts=3)
        error = NetworkError("Network error")
        assert should_retry(error, config, 1) is True

    def test_non_retryable_error(self):
        """Test that non-retryable errors are not retried."""
        config = RetryConfig(max_attempts=3)
        error = ValidationError("Validation error")
        assert should_retry(error, config, 1) is False

    def test_stop_on_specific_exception(self):
        """Test that stop_on exceptions prevent retry."""
        config = RetryConfig(max_attempts=5, stop_on=(ValueError,))
        error = ValueError("Stop immediately")
        assert should_retry(error, config, 1) is False


class TestRetryDecorator:
    """Tests for retry decorator."""

    def test_success_on_first_try(self):
        """Test function succeeds on first try."""
        call_count = 0

        @retry(max_attempts=3)
        def successful_func():
            nonlocal call_count
            call_count += 1
            return "success"

        result = successful_func()
        assert result == "success"
        assert call_count == 1

    def test_success_after_retry(self):
        """Test function succeeds after retry."""
        call_count = 0

        @retry(RetryConfig(max_attempts=3, initial_delay=0.01, jitter=False))
        def flaky_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise OSError("Temporary error")
            return "success"

        result = flaky_func()
        assert result == "success"
        assert call_count == 2

    def test_all_retries_fail(self):
        """Test exception raised after all retries fail."""

        @retry(RetryConfig(max_attempts=2, initial_delay=0.01, jitter=False))
        def always_fails():
            raise OSError("Always fails")

        with pytest.raises(OSError, match="Always fails"):
            always_fails()

    def test_non_retryable_exception_not_retried(self):
        """Test that non-retryable exceptions are not retried."""
        call_count = 0

        @retry(RetryConfig(max_attempts=5, initial_delay=0.01))
        def fails_with_validation():
            nonlocal call_count
            call_count += 1
            raise ValidationError("Bad input")

        with pytest.raises(ValidationError):
            fails_with_validation()

        # Should only be called once since ValidationError is not retryable
        assert call_count == 1


class TestRetryWithResult:
    """Tests for retry_with_result function."""

    def test_success_result(self):
        """Test successful result."""

        def successful():
            return "result"

        result = retry_with_result(successful, config=RetryConfig(max_attempts=3))
        assert result.success is True
        assert result.result == "result"
        assert result.attempts == 1
        assert result.last_exception is None

    def test_failure_result(self):
        """Test failure result after retries."""

        def always_fails():
            raise OSError("Error")

        result = retry_with_result(
            always_fails,
            config=RetryConfig(max_attempts=2, initial_delay=0.01, jitter=False),
        )
        assert result.success is False
        assert result.failed is True
        assert result.attempts == 2
        assert isinstance(result.last_exception, OSError)

    def test_includes_total_delay(self):
        """Test that result includes total delay time."""

        def always_fails():
            raise OSError("Error")

        config = RetryConfig(
            max_attempts=3,
            initial_delay=0.05,
            backoff_strategy=BackoffStrategy.CONSTANT,
            jitter=False,
        )
        result = retry_with_result(always_fails, config=config)

        # Should have delayed about 0.1 seconds (2 retries * 0.05s)
        assert result.total_delay >= 0.08  # Allow some tolerance


class TestAsyncRetry:
    """Tests for async retry functionality."""

    @pytest.mark.asyncio
    async def test_async_retry_success(self):
        """Test async function with retry succeeds."""
        call_count = 0

        @retry(RetryConfig(max_attempts=3, initial_delay=0.01, jitter=False))
        async def async_flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise OSError("Temporary error")
            return "success"

        result = await async_flaky()
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_async_retry_with_result(self):
        """Test async_retry_with_result function."""

        async def async_fails():
            raise OSError("Error")

        result = await async_retry_with_result(
            async_fails,
            config=RetryConfig(max_attempts=2, initial_delay=0.01, jitter=False),
        )
        assert result.success is False
        assert result.attempts == 2


class TestPreconfiguredRetryConfigs:
    """Tests for pre-configured retry strategies."""

    def test_network_retry_config(self):
        """Test NETWORK_RETRY_CONFIG settings."""
        assert NETWORK_RETRY_CONFIG.max_attempts == 5
        assert NETWORK_RETRY_CONFIG.backoff_strategy == BackoffStrategy.EXPONENTIAL
        assert OSError in NETWORK_RETRY_CONFIG.retry_on

    def test_api_retry_config(self):
        """Test API_RETRY_CONFIG settings."""
        assert API_RETRY_CONFIG.max_attempts == 3

    def test_quick_retry_config(self):
        """Test QUICK_RETRY_CONFIG settings."""
        assert QUICK_RETRY_CONFIG.max_attempts == 2
        assert QUICK_RETRY_CONFIG.backoff_strategy == BackoffStrategy.CONSTANT

    def test_patient_retry_config(self):
        """Test PATIENT_RETRY_CONFIG settings."""
        assert PATIENT_RETRY_CONFIG.max_attempts == 10
        assert PATIENT_RETRY_CONFIG.max_delay == 120.0
