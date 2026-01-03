"""
Unit Tests for Morph API Client
================================

This module contains comprehensive unit tests for the MorphClient class
and related functionality in morph_client.py.

Test Cases Covered:
1. Configuration and initialization (MorphConfig)
2. API key validation
3. Health checks with caching
4. Apply operations (fast code transformations)
5. Error handling (API errors, connection errors, timeouts)
6. Retry logic with exponential backoff
7. Context manager support
8. Helper functions (is_morph_enabled, get_morph_api_key, create_morph_client)
9. Data classes (ApplyResult, ValidationResult)
"""

from __future__ import annotations

import asyncio
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from services.morph_client import (  # type: ignore[reportImplicitRelativeImport]
    MAX_CONTENT_SIZE_BYTES,
    ApplyResult,
    MorphAPIError,
    MorphClient,
    MorphConfig,
    MorphConnectionError,
    MorphErrorCode,
    MorphTimeoutError,
    UsageMetrics,
    ValidationResult,
    create_morph_client,
    get_morph_api_key,
    is_morph_enabled,
)

# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def test_api_key():
    """Provide a test API key."""
    return "test_morph_api_key_12345"  # gitleaks:allow (fake test key)


@pytest.fixture
def test_config(test_api_key):
    """Provide a test MorphConfig."""
    return MorphConfig(
        api_key=test_api_key,
        base_url="https://api.morphllm.com/v1",
        model="auto",
        timeout=30.0,
        max_retries=2,
        backoff_factor=1.5,
        health_cache_ttl=300,
    )


@pytest.fixture
def mock_health_response(mock_apply_response):
    """Mock response for healthy service.

    Note: Morph API does not have a dedicated /health endpoint. Health checks
    are performed by attempting a minimal apply operation via validate_api_key().
    This fixture returns the same response as a successful apply operation.
    """
    return mock_apply_response


@pytest.fixture
def mock_validation_response():
    """Mock response for successful API key validation."""
    return {
        "valid": True,
        "account": {
            "id": "acc_test123",
            "plan": "pro",
            "rate_limit": {"requests_per_minute": 100},
        },
        "permissions": ["apply", "validate"],
    }


@pytest.fixture
def mock_apply_response():
    """Mock response for successful apply operation (OpenAI-compatible format)."""
    return {
        "choices": [
            {
                "message": {
                    "content": "def add(a: int, b: int) -> int:\n    return a + b",
                    "role": "assistant",
                },
                "index": 0,
                "finish_reason": "stop",
            }
        ],
        "model": "morph-v3-fast",
        "usage": {"prompt_tokens": 50, "completion_tokens": 20, "total_tokens": 70},
    }


@pytest.fixture
def clean_env(monkeypatch):
    """Ensure clean environment for tests using monkeypatch for automatic cleanup."""
    # Remove any Morph-related env vars
    monkeypatch.delenv("MORPH_ENABLED", raising=False)
    monkeypatch.delenv("MORPH_API_KEY", raising=False)
    monkeypatch.delenv("MORPH_BASE_URL", raising=False)
    monkeypatch.delenv("MORPH_MODEL", raising=False)
    monkeypatch.delenv("MORPH_TIMEOUT", raising=False)
    yield


# =============================================================================
# Test Case 1: Configuration (MorphConfig)
# =============================================================================


class TestMorphConfig:
    """Tests for MorphConfig configuration class."""

    def test_default_values(self):
        """Verify default configuration values."""
        config = MorphConfig()
        assert config.api_key == ""
        assert config.base_url == "https://api.morphllm.com/v1"
        assert config.model == "auto"
        assert config.timeout == 60.0
        assert config.max_retries == 3
        assert config.backoff_factor == 1.5
        assert config.health_cache_ttl == 300

    def test_custom_values(self, test_api_key):
        """Verify custom configuration values."""
        config = MorphConfig(
            api_key=test_api_key,
            base_url="https://custom.api.com",
            timeout=30.0,
            max_retries=5,
        )
        assert config.api_key == test_api_key
        assert config.base_url == "https://custom.api.com"
        assert config.timeout == 30.0
        assert config.max_retries == 5

    def test_from_env_with_all_vars(self, clean_env, test_api_key):
        """Load configuration from environment variables."""
        os.environ["MORPH_API_KEY"] = test_api_key
        os.environ["MORPH_BASE_URL"] = "https://custom.api.com"
        os.environ["MORPH_MODEL"] = "morph-v3-fast"
        os.environ["MORPH_TIMEOUT"] = "45.0"

        config = MorphConfig.from_env()
        assert config.api_key == test_api_key
        assert config.base_url == "https://custom.api.com"
        assert config.model == "morph-v3-fast"
        assert config.timeout == 45.0

    def test_from_env_with_defaults(self, clean_env):
        """Load configuration with default values when env vars missing."""
        config = MorphConfig.from_env()
        assert config.api_key == ""
        assert config.base_url == "https://api.morphllm.com/v1"
        assert config.model == "auto"
        assert config.timeout == 60.0

    def test_has_api_key_true(self, test_api_key):
        """Verify has_api_key returns True when key is present."""
        config = MorphConfig(api_key=test_api_key)
        assert config.has_api_key() is True

    def test_has_api_key_false_empty_string(self):
        """Verify has_api_key returns False for empty string."""
        config = MorphConfig(api_key="")
        assert config.has_api_key() is False

    def test_has_api_key_false_whitespace(self):
        """Verify has_api_key returns False for whitespace-only string."""
        config = MorphConfig(api_key="   ")
        assert config.has_api_key() is False


# =============================================================================
# Test Case 2: API Key Validation
# =============================================================================


class TestAPIKeyValidation:
    """Tests for API key validation functionality."""

    @pytest.mark.asyncio
    async def test_validate_api_key_success_via_head(self, test_config):
        """Verify successful API key validation via HEAD request optimization."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request succeeds - no need to call apply()
            mock_head.return_value = True

            client = MorphClient(test_config)
            result = await client.validate_api_key()

            assert result.valid is True
            assert "apply" in result.permissions
            mock_head.assert_called_once()
            await client.close()

    @pytest.mark.asyncio
    async def test_validate_api_key_success_via_apply(
        self, test_config, mock_apply_response
    ):
        """Verify successful API key validation via apply fallback.

        Note: Morph doesn't have a dedicated /auth/validate endpoint, so
        validation is performed by attempting a minimal apply operation
        when HEAD request is inconclusive.
        """
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            with patch.object(
                MorphClient, "_make_request", new_callable=AsyncMock
            ) as mock_request:
                # HEAD request inconclusive, fall back to apply
                mock_head.return_value = None
                mock_request.return_value = mock_apply_response

                client = MorphClient(test_config)
                result = await client.validate_api_key()

                assert result.valid is True
                # Morph doesn't provide account info in apply responses
                assert result.account_id == ""
                assert result.plan == ""
                assert result.rate_limit_rpm == 0
                assert "apply" in result.permissions

                # Validation uses apply() which calls /chat/completions
                mock_request.assert_called_once()
                await client.close()

    @pytest.mark.asyncio
    async def test_validate_api_key_invalid_via_head(self, test_config):
        """Verify validation returns invalid when HEAD request detects invalid key."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request returns False - invalid key
            mock_head.return_value = False

            client = MorphClient(test_config)
            result = await client.validate_api_key()

            assert result.valid is False
            await client.close()

    @pytest.mark.asyncio
    async def test_validate_api_key_invalid_401(self, test_config):
        """Verify validation returns invalid for 401 errors from apply fallback."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            with patch.object(
                MorphClient, "_make_request", new_callable=AsyncMock
            ) as mock_request:
                # HEAD inconclusive, apply fails with 401
                mock_head.return_value = None
                mock_request.side_effect = MorphAPIError(
                    code=MorphErrorCode.INVALID_API_KEY,
                    message="Invalid API key",
                    status_code=401,
                )

                client = MorphClient(test_config)
                result = await client.validate_api_key()

                assert result.valid is False
                await client.close()

    @pytest.mark.asyncio
    async def test_validate_api_key_no_key_configured(self):
        """Verify validation returns invalid when no API key configured."""
        config = MorphConfig(api_key="")
        client = MorphClient(config)
        result = await client.validate_api_key()

        assert result.valid is False
        await client.close()

    @pytest.mark.asyncio
    async def test_validate_api_key_raises_on_server_error(self, test_config):
        """Verify validation raises on non-401 errors."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            with patch.object(
                MorphClient, "_make_request", new_callable=AsyncMock
            ) as mock_request:
                # HEAD inconclusive, apply fails with 503
                mock_head.return_value = None
                mock_request.side_effect = MorphAPIError(
                    code=MorphErrorCode.SERVICE_UNAVAILABLE,
                    message="Service unavailable",
                    status_code=503,
                )

                client = MorphClient(test_config)
                with pytest.raises(MorphAPIError) as exc_info:
                    await client.validate_api_key()

                assert exc_info.value.status_code == 503
                await client.close()


# =============================================================================
# Test Case 3: Health Checks with Caching
# =============================================================================


class TestHealthChecks:
    """Tests for health check functionality with caching.

    Note: Morph API does not have a dedicated /health endpoint. Health checks
    are performed by attempting a minimal apply operation via validate_api_key().
    These tests verify that check_health correctly interprets validation results.
    """

    @pytest.mark.asyncio
    async def test_check_health_healthy(self, test_config):
        """Verify health check returns True when API key validation succeeds."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request succeeds
            mock_head.return_value = True

            client = MorphClient(test_config)
            is_healthy = await client.check_health(use_cache=False)

            assert is_healthy is True
            mock_head.assert_called_once()
            await client.close()

    @pytest.mark.asyncio
    async def test_check_health_unhealthy_on_invalid_key(self, test_config):
        """Verify health check returns False when API key is invalid."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request returns False - invalid key
            mock_head.return_value = False

            client = MorphClient(test_config)
            is_healthy = await client.check_health(use_cache=False)

            assert is_healthy is False
            await client.close()

    @pytest.mark.asyncio
    async def test_check_health_connection_error(self, test_config):
        """Verify health check returns False on connection error."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            with patch.object(
                MorphClient, "_make_request", new_callable=AsyncMock
            ) as mock_request:
                # HEAD inconclusive, apply fails with connection error
                mock_head.return_value = None
                mock_request.side_effect = MorphConnectionError("Connection failed")

                client = MorphClient(test_config)
                is_healthy = await client.check_health(use_cache=False)

                assert is_healthy is False
                await client.close()

    @pytest.mark.asyncio
    async def test_check_health_timeout_error(self, test_config):
        """Verify health check returns False on timeout."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            with patch.object(
                MorphClient, "_make_request", new_callable=AsyncMock
            ) as mock_request:
                # HEAD inconclusive, apply times out
                mock_head.return_value = None
                mock_request.side_effect = MorphTimeoutError("Request timed out")

                client = MorphClient(test_config)
                is_healthy = await client.check_health(use_cache=False)

                assert is_healthy is False
                await client.close()

    @pytest.mark.asyncio
    async def test_check_health_caching(self, test_config):
        """Verify health check caches result for TTL duration."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request succeeds
            mock_head.return_value = True

            client = MorphClient(test_config)

            # First call should check auth
            result1 = await client.check_health(use_cache=True)
            assert result1 is True
            assert mock_head.call_count == 1

            # Second call should use cache
            result2 = await client.check_health(use_cache=True)
            assert result2 is True
            assert mock_head.call_count == 1  # Still 1, cached result used

            await client.close()

    @pytest.mark.asyncio
    async def test_check_health_cache_expiry(self, test_config):
        """Verify health check cache expires after TTL."""
        # Set short TTL for testing
        config = MorphConfig(
            api_key=test_config.api_key,
            health_cache_ttl=1,  # 1 second TTL
        )

        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request succeeds
            mock_head.return_value = True

            client = MorphClient(config)

            # First call
            result1 = await client.check_health(use_cache=True)
            assert result1 is True
            assert mock_head.call_count == 1

            # Wait for cache to expire
            await asyncio.sleep(1.1)

            # Second call should check auth again
            result2 = await client.check_health(use_cache=True)
            assert result2 is True
            assert mock_head.call_count == 2  # Cache expired, new check

            await client.close()

    @pytest.mark.asyncio
    async def test_check_health_bypass_cache(self, test_config):
        """Verify use_cache=False bypasses cache."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request succeeds
            mock_head.return_value = True

            client = MorphClient(test_config)

            # First call with caching
            result1 = await client.check_health(use_cache=True)
            assert result1 is True
            assert mock_head.call_count == 1

            # Second call bypassing cache
            result2 = await client.check_health(use_cache=False)
            assert result2 is True
            assert mock_head.call_count == 2  # Cache bypassed

            await client.close()


# =============================================================================
# Test Case 4: Apply Operations
# =============================================================================


class TestApplyOperations:
    """Tests for apply (fast code transformation) operations."""

    @pytest.mark.asyncio
    async def test_apply_success(self, test_config, mock_apply_response):
        """Verify successful apply operation."""
        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = await client.apply(
                file_path="utils.py",
                original_content="def add(a, b): return a + b",
                instruction="Add type hints",
                language="python",
            )

            assert result.success is True
            assert "def add(a: int, b: int) -> int:" in result.new_content
            # Morph doesn't provide change details in response
            assert result.changes_applied == []
            assert result.confidence == 1.0
            assert result.processing_time_ms == 0

            # Verify request payload uses OpenAI-compatible format
            call_args = mock_request.call_args
            assert call_args[0] == ("POST", "/chat/completions")
            payload = call_args[1]["json_data"]
            assert payload["model"] == "auto"
            assert "messages" in payload
            assert payload["temperature"] == 0  # Deterministic output
            # Verify XML format in message content (language tag removed per fix)
            message_content = payload["messages"][0]["content"]
            assert "<instruction>Add type hints</instruction>" in message_content
            assert "<code>def add(a, b): return a + b</code>" in message_content
            assert "<update>" in message_content

            await client.close()

    @pytest.mark.asyncio
    async def test_apply_with_code_edit(self, test_config, mock_apply_response):
        """Verify apply with explicit code_edit parameter."""
        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = await client.apply(
                file_path="api.py",
                original_content="def handler(): pass",
                instruction="Add async/await",
                code_edit="async def handler(): pass",
            )

            assert result.success is True

            # Verify code_edit was used in the update section
            call_args = mock_request.call_args
            payload = call_args[1]["json_data"]
            message_content = payload["messages"][0]["content"]
            assert "<update>async def handler(): pass</update>" in message_content

            await client.close()

    @pytest.mark.asyncio
    async def test_apply_without_code_edit(self, test_config, mock_apply_response):
        """Verify apply uses original_content as update when code_edit not provided."""
        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = await client.apply(
                file_path="script.py",
                original_content="print('hello')",
                instruction="Add docstring",
            )

            assert result.success is True

            # Verify original_content was used as update (full file rewrite mode)
            call_args = mock_request.call_args
            payload = call_args[1]["json_data"]
            message_content = payload["messages"][0]["content"]
            assert "<code>print('hello')</code>" in message_content
            assert "<update>print('hello')</update>" in message_content

            await client.close()

    @pytest.mark.asyncio
    async def test_apply_raises_on_api_error(self, test_config):
        """Verify apply raises MorphAPIError on API error."""
        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.CONTENT_TOO_LARGE,
                message="Content exceeds size limit",
                status_code=413,
            )

            client = MorphClient(test_config)
            with pytest.raises(MorphAPIError) as exc_info:
                await client.apply(
                    file_path="large.py",
                    original_content="x" * 1000000,
                    instruction="Format code",
                )

            assert exc_info.value.code == MorphErrorCode.CONTENT_TOO_LARGE
            assert exc_info.value.status_code == 413
            await client.close()


# =============================================================================
# Test Case 5: Error Handling
# =============================================================================


class TestErrorHandling:
    """Tests for error handling across all operations."""

    def test_morph_api_error_attributes(self):
        """Verify MorphAPIError has correct attributes."""
        error = MorphAPIError(
            code=MorphErrorCode.RATE_LIMIT_EXCEEDED,
            message="Rate limit exceeded",
            status_code=429,
            request_id="req_12345",
        )

        assert error.code == MorphErrorCode.RATE_LIMIT_EXCEEDED
        assert error.message == "Rate limit exceeded"
        assert error.status_code == 429
        assert error.request_id == "req_12345"
        assert "RATE_LIMIT_EXCEEDED" in str(error)

    def test_morph_api_error_is_retryable_429(self):
        """Verify 429 errors are retryable."""
        error = MorphAPIError(
            code=MorphErrorCode.RATE_LIMIT_EXCEEDED,
            message="Rate limit",
            status_code=429,
        )
        assert error.is_retryable() is True

    def test_morph_api_error_is_retryable_500(self):
        """Verify 500 errors are retryable."""
        error = MorphAPIError(
            code=MorphErrorCode.PROCESSING_ERROR,
            message="Internal server error",
            status_code=500,
        )
        assert error.is_retryable() is True

    def test_morph_api_error_is_retryable_503(self):
        """Verify 503 errors are retryable."""
        error = MorphAPIError(
            code=MorphErrorCode.SERVICE_UNAVAILABLE,
            message="Service unavailable",
            status_code=503,
        )
        assert error.is_retryable() is True

    def test_morph_api_error_not_retryable_400(self):
        """Verify 400 errors are not retryable."""
        error = MorphAPIError(
            code=MorphErrorCode.INVALID_REQUEST,
            message="Bad request",
            status_code=400,
        )
        assert error.is_retryable() is False

    def test_morph_api_error_not_retryable_401(self):
        """Verify 401 errors are not retryable."""
        error = MorphAPIError(
            code=MorphErrorCode.INVALID_API_KEY,
            message="Invalid key",
            status_code=401,
        )
        assert error.is_retryable() is False

    @pytest.mark.asyncio
    async def test_make_request_raises_on_missing_api_key(self):
        """Verify _make_request raises when API key is required but missing."""
        config = MorphConfig(api_key="")
        client = MorphClient(config)

        with pytest.raises(MorphAPIError) as exc_info:
            await client._make_request("GET", "/auth/validate", requires_auth=True)

        assert exc_info.value.code == MorphErrorCode.INVALID_API_KEY
        assert "No API key configured" in exc_info.value.message
        await client.close()

    @pytest.mark.asyncio
    async def test_make_request_connection_error(self, test_config):
        """Verify _make_request raises MorphConnectionError on connection failure."""
        with patch.object(httpx.AsyncClient, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = httpx.ConnectError("Connection refused")

            client = MorphClient(test_config)
            with pytest.raises(MorphConnectionError) as exc_info:
                await client._make_request("GET", "/health", requires_auth=False)

            assert "Failed to connect" in str(exc_info.value)
            await client.close()

    @pytest.mark.asyncio
    async def test_make_request_timeout_error(self, test_config):
        """Verify _make_request raises MorphTimeoutError on timeout."""
        with patch.object(
            httpx.AsyncClient, "get", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = httpx.TimeoutException("Request timed out")

            client = MorphClient(test_config)
            with pytest.raises(MorphTimeoutError) as exc_info:
                await client._make_request("GET", "/health", requires_auth=False)

            assert "timed out" in str(exc_info.value)
            await client.close()


# =============================================================================
# Test Case 6: Retry Logic with Exponential Backoff
# =============================================================================


class TestRetryLogic:
    """Tests for retry logic with exponential backoff."""

    @pytest.mark.asyncio
    async def test_retries_on_503_then_succeeds(self, test_config, mock_health_response):
        """Verify request retries on 503 and eventually succeeds."""
        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                # First call fails with 503
                response = MagicMock()
                response.status_code = 503
                response.json.return_value = {
                    "error": {
                        "code": MorphErrorCode.SERVICE_UNAVAILABLE,
                        "message": "Service temporarily unavailable",
                    }
                }
                return response
            else:
                # Second call succeeds
                response = MagicMock()
                response.status_code = 200
                response.json.return_value = mock_health_response
                return response

        with patch.object(httpx.AsyncClient, "get", side_effect=side_effect):
            with patch("asyncio.sleep", new_callable=AsyncMock):  # Mock sleep
                client = MorphClient(test_config)
                result = await client._make_request(
                    "GET", "/health", requires_auth=False
                )

                assert result == mock_health_response
                assert call_count == 2
                await client.close()

    @pytest.mark.asyncio
    async def test_retries_on_429_then_succeeds(self, test_config, mock_health_response):
        """Verify request retries on 429 rate limit and eventually succeeds."""
        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                # First call fails with 429
                response = MagicMock()
                response.status_code = 429
                response.json.return_value = {
                    "error": {
                        "code": MorphErrorCode.RATE_LIMIT_EXCEEDED,
                        "message": "Rate limit exceeded",
                    }
                }
                return response
            else:
                # Second call succeeds
                response = MagicMock()
                response.status_code = 200
                response.json.return_value = mock_health_response
                return response

        with patch.object(httpx.AsyncClient, "get", side_effect=side_effect):
            with patch("asyncio.sleep", new_callable=AsyncMock):  # Mock sleep
                client = MorphClient(test_config)
                result = await client._make_request(
                    "GET", "/health", requires_auth=False
                )

                assert result == mock_health_response
                assert call_count == 2
                await client.close()

    @pytest.mark.asyncio
    async def test_no_retry_on_401(self, test_config):
        """Verify 401 errors are not retried."""
        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            response = MagicMock()
            response.status_code = 401
            response.json.return_value = {
                "error": {
                    "code": MorphErrorCode.INVALID_API_KEY,
                    "message": "Invalid API key",
                }
            }
            return response

        with patch.object(httpx.AsyncClient, "get", side_effect=side_effect):
            client = MorphClient(test_config)
            with pytest.raises(MorphAPIError) as exc_info:
                await client._make_request("GET", "/auth/validate", requires_auth=True)

            assert exc_info.value.status_code == 401
            assert call_count == 1  # No retries
            await client.close()

    @pytest.mark.asyncio
    async def test_exhausts_retries_and_raises(self, test_config):
        """Verify error is raised after exhausting all retries."""
        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            response = MagicMock()
            response.status_code = 503
            response.json.return_value = {
                "error": {
                    "code": MorphErrorCode.SERVICE_UNAVAILABLE,
                    "message": "Service unavailable",
                }
            }
            return response

        with patch.object(httpx.AsyncClient, "get", side_effect=side_effect):
            with patch("asyncio.sleep", new_callable=AsyncMock):  # Mock sleep
                client = MorphClient(test_config)
                with pytest.raises(MorphAPIError) as exc_info:
                    await client._make_request("GET", "/health", requires_auth=False)

                assert exc_info.value.status_code == 503
                assert call_count == test_config.max_retries
                await client.close()


# =============================================================================
# Test Case 7: Context Manager Support
# =============================================================================


class TestContextManager:
    """Tests for context manager support."""

    @pytest.mark.asyncio
    async def test_context_manager_closes_client(self, test_config):
        """Verify context manager properly closes client."""
        async with MorphClient(test_config) as client:
            assert client._client is None  # Not created yet
            _ = await client._get_client()  # Create client
            assert client._client is not None

        # After context exit, client should be closed
        assert client._client is None

    @pytest.mark.asyncio
    async def test_context_manager_clears_cache(self, test_config, mock_health_response):
        """Verify context manager clears health cache."""
        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.return_value = mock_health_response

            async with MorphClient(test_config) as client:
                await client.check_health()
                assert client._health_cache is not None

            # After context exit, cache should be cleared
            assert client._health_cache is None


# =============================================================================
# Test Case 8: Helper Functions
# =============================================================================


class TestHelperFunctions:
    """Tests for module-level helper functions."""

    def test_is_morph_enabled_true(self, clean_env, test_api_key):
        """Verify is_morph_enabled returns True when MORPH_ENABLED=true and API key set."""
        os.environ["MORPH_ENABLED"] = "true"
        os.environ["MORPH_API_KEY"] = test_api_key
        assert is_morph_enabled() is True

    def test_is_morph_enabled_true_case_insensitive(self, clean_env, test_api_key):
        """Verify is_morph_enabled is case-insensitive."""
        os.environ["MORPH_API_KEY"] = test_api_key

        os.environ["MORPH_ENABLED"] = "TRUE"
        assert is_morph_enabled() is True

        os.environ["MORPH_ENABLED"] = "True"
        assert is_morph_enabled() is True

    def test_is_morph_enabled_false(self, clean_env, test_api_key):
        """Verify is_morph_enabled returns False when MORPH_ENABLED=false."""
        os.environ["MORPH_ENABLED"] = "false"
        os.environ["MORPH_API_KEY"] = test_api_key
        assert is_morph_enabled() is False

    def test_is_morph_enabled_false_missing(self, clean_env):
        """Verify is_morph_enabled returns False when env var missing."""
        assert is_morph_enabled() is False

    def test_is_morph_enabled_false_no_api_key(self, clean_env):
        """Verify is_morph_enabled returns False when MORPH_ENABLED=true but no API key."""
        os.environ["MORPH_ENABLED"] = "true"
        # No MORPH_API_KEY set
        assert is_morph_enabled() is False

    def test_is_morph_enabled_false_empty_api_key(self, clean_env):
        """Verify is_morph_enabled returns False when API key is empty/whitespace."""
        os.environ["MORPH_ENABLED"] = "true"
        os.environ["MORPH_API_KEY"] = "   "
        assert is_morph_enabled() is False

    def test_get_morph_api_key_returns_key(self, clean_env, test_api_key):
        """Verify get_morph_api_key returns the API key from env."""
        os.environ["MORPH_API_KEY"] = test_api_key
        assert get_morph_api_key() == test_api_key

    def test_get_morph_api_key_returns_empty_string(self, clean_env):
        """Verify get_morph_api_key returns empty string when not set."""
        assert get_morph_api_key() == ""

    @pytest.mark.asyncio
    async def test_create_morph_client_when_enabled_with_key(
        self, clean_env, test_api_key
    ):
        """Verify create_morph_client returns client when enabled with API key."""
        os.environ["MORPH_ENABLED"] = "true"
        os.environ["MORPH_API_KEY"] = test_api_key

        client = create_morph_client()
        assert client is not None
        assert isinstance(client, MorphClient)
        assert client.config.api_key == test_api_key
        await client.close()

    def test_create_morph_client_returns_none_when_disabled(
        self, clean_env, test_api_key
    ):
        """Verify create_morph_client returns None when disabled."""
        os.environ["MORPH_ENABLED"] = "false"
        os.environ["MORPH_API_KEY"] = test_api_key

        client = create_morph_client()
        assert client is None

    def test_create_morph_client_returns_none_when_no_api_key(self, clean_env):
        """Verify create_morph_client returns None when enabled but no API key."""
        os.environ["MORPH_ENABLED"] = "true"
        # No MORPH_API_KEY set

        client = create_morph_client()
        assert client is None


# =============================================================================
# Test Case 9: Data Classes
# =============================================================================


class TestDataClasses:
    """Tests for ValidationResult and UsageMetrics data classes."""

    def test_usage_metrics_from_response(self):
        """Verify UsageMetrics.from_response parses API response correctly."""
        response_data = {
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
            }
        }

        metrics = UsageMetrics.from_response(response_data)
        assert metrics.prompt_tokens == 100
        assert metrics.completion_tokens == 50
        assert metrics.total_tokens == 150

    def test_usage_metrics_from_response_missing_usage(self):
        """Verify UsageMetrics handles missing usage field with defaults."""
        response_data = {}

        metrics = UsageMetrics.from_response(response_data)
        assert metrics.prompt_tokens == 0
        assert metrics.completion_tokens == 0
        assert metrics.total_tokens == 0

    def test_usage_metrics_from_response_partial_data(self):
        """Verify UsageMetrics handles partial usage data."""
        response_data = {
            "usage": {
                "prompt_tokens": 100,
                # completion_tokens and total_tokens missing
            }
        }

        metrics = UsageMetrics.from_response(response_data)
        assert metrics.prompt_tokens == 100
        assert metrics.completion_tokens == 0
        assert metrics.total_tokens == 0

    def test_validation_result_from_response(self):
        """Verify ValidationResult.from_response parses API response correctly."""
        response_data = {
            "valid": True,
            "account": {
                "id": "acc_123",
                "plan": "enterprise",
                "rate_limit": {"requests_per_minute": 200},
            },
            "permissions": ["apply", "validate", "batch"],
        }

        result = ValidationResult.from_response(response_data)
        assert result.valid is True
        assert result.account_id == "acc_123"
        assert result.plan == "enterprise"
        assert result.rate_limit_rpm == 200
        assert result.permissions == ["apply", "validate", "batch"]

    def test_validation_result_from_response_with_defaults(self):
        """Verify ValidationResult handles missing fields with defaults."""
        response_data = {}

        result = ValidationResult.from_response(response_data)
        assert result.valid is False
        assert result.account_id == ""
        assert result.plan == ""
        assert result.rate_limit_rpm == 0
        assert result.permissions == []


# =============================================================================
# Test Case 10: is_available Method
# =============================================================================


class TestIsAvailable:
    """Tests for MorphClient.is_available() method.

    Note: is_available() calls check_health() which calls validate_api_key().
    validate_api_key() first tries HEAD request, then falls back to apply().
    """

    @pytest.mark.asyncio
    async def test_is_available_true(self, test_config):
        """Verify is_available returns True when service is healthy and key is valid."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request succeeds
            mock_head.return_value = True

            client = MorphClient(test_config)
            is_available = await client.is_available(use_cache=False)

            assert is_available is True
            await client.close()

    @pytest.mark.asyncio
    async def test_is_available_false_no_api_key(self):
        """Verify is_available returns False when no API key configured."""
        config = MorphConfig(api_key="")
        client = MorphClient(config)
        is_available = await client.is_available()

        assert is_available is False
        await client.close()

    @pytest.mark.asyncio
    async def test_is_available_false_on_invalid_key(self, test_config):
        """Verify is_available returns False when API key is invalid."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            # HEAD request detects invalid key
            mock_head.return_value = False

            client = MorphClient(test_config)
            is_available = await client.is_available(use_cache=False)

            assert is_available is False
            await client.close()

    @pytest.mark.asyncio
    async def test_is_available_false_on_connection_error(self, test_config):
        """Verify is_available returns False on connection error during validation."""
        with patch.object(
            MorphClient, "_check_auth_with_head", new_callable=AsyncMock
        ) as mock_head:
            with patch.object(
                MorphClient, "_make_request", new_callable=AsyncMock
            ) as mock_request:
                # HEAD inconclusive, apply fails
                mock_head.return_value = None
                mock_request.side_effect = MorphConnectionError("Connection failed")

                client = MorphClient(test_config)
                is_available = await client.is_available(use_cache=False)

                assert is_available is False
                await client.close()


# =============================================================================
# Test Case 11: Content Size Validation
# =============================================================================


class TestContentSizeValidation:
    """Tests for content size pre-validation."""

    @pytest.mark.asyncio
    async def test_apply_raises_on_content_too_large(self, test_config):
        """Verify apply raises MorphAPIError for content exceeding size limit."""
        # Create content larger than MAX_CONTENT_SIZE_BYTES (100KB)
        large_content = "x" * (MAX_CONTENT_SIZE_BYTES + 1)

        client = MorphClient(test_config)
        with pytest.raises(MorphAPIError) as exc_info:
            await client.apply(
                file_path="large_file.py",
                original_content=large_content,
                instruction="Format code",
            )

        assert exc_info.value.code == MorphErrorCode.CONTENT_TOO_LARGE
        assert exc_info.value.status_code == 413
        assert "exceeds limit" in exc_info.value.message
        await client.close()

    @pytest.mark.asyncio
    async def test_apply_accepts_content_at_limit(self, test_config, mock_apply_response):
        """Verify apply accepts content exactly at size limit."""
        # Create content exactly at MAX_CONTENT_SIZE_BYTES
        content_at_limit = "x" * MAX_CONTENT_SIZE_BYTES

        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            # Should not raise - content is exactly at limit
            result = await client.apply(
                file_path="at_limit.py",
                original_content=content_at_limit,
                instruction="Format code",
            )

            assert result.success is True
            await client.close()

    @pytest.mark.asyncio
    async def test_apply_accepts_small_content(self, test_config, mock_apply_response):
        """Verify apply accepts small content without issues."""
        small_content = "def hello(): pass"

        with patch.object(
            MorphClient, "_make_request", new_callable=AsyncMock
        ) as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = await client.apply(
                file_path="small.py",
                original_content=small_content,
                instruction="Add docstring",
            )

            assert result.success is True
            await client.close()


# =============================================================================
# Test Case 12: Line Change Calculation
# =============================================================================


class TestLineChangeCalculation:
    """Tests for _calculate_line_changes static method."""

    def test_calculate_no_changes(self):
        """Verify no changes returns 0 for both."""
        original = "line1\nline2\nline3"
        new = "line1\nline2\nline3"

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        assert added == 0
        assert removed == 0
        assert diff == ""  # No changes means empty diff

    def test_calculate_lines_added(self):
        """Verify adding new lines is detected."""
        # Use trailing newlines for consistent diff behavior
        original = "line1\nline2\n"
        new = "line1\nline2\nline3\nline4\n"

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        assert added == 2
        assert removed == 0
        assert "+line3" in diff
        assert "+line4" in diff

    def test_calculate_lines_removed(self):
        """Verify removing lines is detected."""
        # Use trailing newlines for consistent diff behavior
        original = "line1\nline2\nline3\nline4\n"
        new = "line1\nline2\n"

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        assert added == 0
        assert removed == 2
        assert "-line3" in diff
        assert "-line4" in diff

    def test_calculate_lines_modified(self):
        """Verify modifying lines shows as add + remove."""
        original = "def foo(): pass"
        new = "def foo(): return 42"

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        # Modified line counts as 1 removed, 1 added
        assert added == 1
        assert removed == 1
        assert "-def foo(): pass" in diff
        assert "+def foo(): return 42" in diff

    def test_calculate_mixed_changes(self):
        """Verify mixed add/remove/modify is calculated correctly."""
        original = "line1\nline2\nline3"
        new = "line1\nline2_modified\nline4\nline5"

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        # line2 and line3 removed, line2_modified, line4, line5 added
        assert added == 3
        assert removed == 2

    def test_calculate_empty_original(self):
        """Verify adding to empty file works."""
        original = ""
        new = "line1\nline2"

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        assert added == 2
        assert removed == 0

    def test_calculate_empty_new(self):
        """Verify removing all content works."""
        original = "line1\nline2"
        new = ""

        added, removed, diff = MorphClient._calculate_line_changes(original, new)
        assert added == 0
        assert removed == 2
