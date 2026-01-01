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

import os
import time
from unittest.mock import MagicMock, patch

import httpx
import pytest
from services.morph_client import (
    ApplyResult,
    MorphAPIError,
    MorphClient,
    MorphConfig,
    MorphConnectionError,
    MorphErrorCode,
    MorphTimeoutError,
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
    return "test_morph_api_key_12345"


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
def clean_env():
    """Ensure clean environment for tests."""
    original_env = os.environ.copy()
    # Remove any Morph-related env vars
    os.environ.pop("MORPH_ENABLED", None)
    os.environ.pop("MORPH_API_KEY", None)
    os.environ.pop("MORPH_BASE_URL", None)
    os.environ.pop("MORPH_MODEL", None)
    os.environ.pop("MORPH_TIMEOUT", None)
    yield
    os.environ.clear()
    os.environ.update(original_env)


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

    def test_validate_api_key_success(self, test_config, mock_apply_response):
        """Verify successful API key validation.

        Note: Morph doesn't have a dedicated /auth/validate endpoint, so
        validation is performed by attempting a minimal apply operation.
        """
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = client.validate_api_key()

            assert result.valid is True
            # Morph doesn't provide account info in apply responses
            assert result.account_id == ""
            assert result.plan == ""
            assert result.rate_limit_rpm == 0
            assert "apply" in result.permissions

            # Validation uses apply() which calls /chat/completions
            mock_request.assert_called_once_with(
                "POST",
                "/chat/completions",
                json_data=mock_request.call_args[1]["json_data"],
            )
            client.close()

    def test_validate_api_key_invalid_401(self, test_config):
        """Verify validation returns invalid for 401 errors."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.INVALID_API_KEY,
                message="Invalid API key",
                status_code=401,
            )

            client = MorphClient(test_config)
            result = client.validate_api_key()

            assert result.valid is False
            client.close()

    def test_validate_api_key_no_key_configured(self):
        """Verify validation returns invalid when no API key configured."""
        config = MorphConfig(api_key="")
        client = MorphClient(config)
        result = client.validate_api_key()

        assert result.valid is False
        client.close()

    def test_validate_api_key_raises_on_server_error(self, test_config):
        """Verify validation raises on non-401 errors."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.SERVICE_UNAVAILABLE,
                message="Service unavailable",
                status_code=503,
            )

            client = MorphClient(test_config)
            with pytest.raises(MorphAPIError) as exc_info:
                client.validate_api_key()

            assert exc_info.value.status_code == 503
            client.close()


# =============================================================================
# Test Case 3: Health Checks with Caching
# =============================================================================


class TestHealthChecks:
    """Tests for health check functionality with caching.

    Note: Morph API does not have a dedicated /health endpoint. Health checks
    are performed by attempting a minimal apply operation via validate_api_key().
    These tests verify that check_health correctly interprets validation results.
    """

    def test_check_health_healthy(self, test_config, mock_health_response):
        """Verify health check returns True when API key validation succeeds."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            # Health check uses validate_api_key() which calls apply()
            mock_request.return_value = mock_health_response

            client = MorphClient(test_config)
            is_healthy = client.check_health(use_cache=False)

            assert is_healthy is True
            # Verify it called /chat/completions (via validate_api_key -> apply)
            mock_request.assert_called_once()
            call_args = mock_request.call_args
            assert call_args[0][0] == "POST"
            assert call_args[0][1] == "/chat/completions"
            client.close()

    def test_check_health_unhealthy_on_401(self, test_config):
        """Verify health check returns False when API key is invalid (401)."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            # Simulate invalid API key response
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.INVALID_API_KEY,
                message="Invalid API key",
                status_code=401,
            )

            client = MorphClient(test_config)
            is_healthy = client.check_health(use_cache=False)

            assert is_healthy is False
            client.close()

    def test_check_health_connection_error(self, test_config):
        """Verify health check returns False on connection error."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphConnectionError("Connection failed")

            client = MorphClient(test_config)
            is_healthy = client.check_health(use_cache=False)

            assert is_healthy is False
            client.close()

    def test_check_health_timeout_error(self, test_config):
        """Verify health check returns False on timeout."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphTimeoutError("Request timed out")

            client = MorphClient(test_config)
            is_healthy = client.check_health(use_cache=False)

            assert is_healthy is False
            client.close()

    def test_check_health_caching(self, test_config, mock_health_response):
        """Verify health check caches result for TTL duration."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_health_response

            client = MorphClient(test_config)

            # First call should hit the API
            result1 = client.check_health(use_cache=True)
            assert result1 is True
            assert mock_request.call_count == 1

            # Second call should use cache
            result2 = client.check_health(use_cache=True)
            assert result2 is True
            assert mock_request.call_count == 1  # Still 1, cached result used

            client.close()

    def test_check_health_cache_expiry(self, test_config, mock_health_response):
        """Verify health check cache expires after TTL."""
        # Set short TTL for testing
        config = MorphConfig(
            api_key=test_config.api_key,
            health_cache_ttl=1,  # 1 second TTL
        )

        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_health_response

            client = MorphClient(config)

            # First call
            result1 = client.check_health(use_cache=True)
            assert result1 is True
            assert mock_request.call_count == 1

            # Wait for cache to expire
            time.sleep(1.1)

            # Second call should hit the API again
            result2 = client.check_health(use_cache=True)
            assert result2 is True
            assert mock_request.call_count == 2  # Cache expired, new request

            client.close()

    def test_check_health_bypass_cache(self, test_config, mock_health_response):
        """Verify use_cache=False bypasses cache."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_health_response

            client = MorphClient(test_config)

            # First call with caching
            result1 = client.check_health(use_cache=True)
            assert result1 is True
            assert mock_request.call_count == 1

            # Second call bypassing cache
            result2 = client.check_health(use_cache=False)
            assert result2 is True
            assert mock_request.call_count == 2  # Cache bypassed

            client.close()


# =============================================================================
# Test Case 4: Apply Operations
# =============================================================================


class TestApplyOperations:
    """Tests for apply (fast code transformation) operations."""

    def test_apply_success(self, test_config, mock_apply_response):
        """Verify successful apply operation."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = client.apply(
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
            # Verify XML format in message content
            message_content = payload["messages"][0]["content"]
            assert "<language>python</language>" in message_content  # Language hint included
            assert "<instruction>Add type hints</instruction>" in message_content
            assert "<code>def add(a, b): return a + b</code>" in message_content
            assert "<update>" in message_content

            client.close()

    def test_apply_with_code_edit(self, test_config, mock_apply_response):
        """Verify apply with explicit code_edit parameter."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = client.apply(
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

            client.close()

    def test_apply_without_code_edit(self, test_config, mock_apply_response):
        """Verify apply uses original_content as update when code_edit not provided."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            result = client.apply(
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

            client.close()

    def test_apply_raises_on_api_error(self, test_config):
        """Verify apply raises MorphAPIError on API error."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.CONTENT_TOO_LARGE,
                message="Content exceeds size limit",
                status_code=413,
            )

            client = MorphClient(test_config)
            with pytest.raises(MorphAPIError) as exc_info:
                client.apply(
                    file_path="large.py",
                    original_content="x" * 1000000,
                    instruction="Format code",
                )

            assert exc_info.value.code == MorphErrorCode.CONTENT_TOO_LARGE
            assert exc_info.value.status_code == 413
            client.close()


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

    def test_make_request_raises_on_missing_api_key(self):
        """Verify _make_request raises when API key is required but missing."""
        config = MorphConfig(api_key="")
        client = MorphClient(config)

        with pytest.raises(MorphAPIError) as exc_info:
            client._make_request("GET", "/auth/validate", requires_auth=True)

        assert exc_info.value.code == MorphErrorCode.INVALID_API_KEY
        assert "No API key configured" in exc_info.value.message
        client.close()

    def test_make_request_connection_error(self, test_config):
        """Verify _make_request raises MorphConnectionError on connection failure."""
        with patch.object(httpx.Client, "get") as mock_get:
            mock_get.side_effect = httpx.ConnectError("Connection refused")

            client = MorphClient(test_config)
            with pytest.raises(MorphConnectionError) as exc_info:
                client._make_request("GET", "/health", requires_auth=False)

            assert "Failed to connect" in str(exc_info.value)
            client.close()

    def test_make_request_timeout_error(self, test_config):
        """Verify _make_request raises MorphTimeoutError on timeout."""
        with patch.object(httpx.Client, "get") as mock_get:
            mock_get.side_effect = httpx.TimeoutException("Request timed out")

            client = MorphClient(test_config)
            with pytest.raises(MorphTimeoutError) as exc_info:
                client._make_request("GET", "/health", requires_auth=False)

            assert "timed out" in str(exc_info.value)
            client.close()


# =============================================================================
# Test Case 6: Retry Logic with Exponential Backoff
# =============================================================================


class TestRetryLogic:
    """Tests for retry logic with exponential backoff."""

    def test_retries_on_503_then_succeeds(self, test_config, mock_health_response):
        """Verify request retries on 503 and eventually succeeds."""
        call_count = 0

        def side_effect(*args, **kwargs):
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

        with patch.object(httpx.Client, "get", side_effect=side_effect):
            with patch("time.sleep"):  # Mock sleep to speed up test
                client = MorphClient(test_config)
                result = client._make_request("GET", "/health", requires_auth=False)

                assert result == mock_health_response
                assert call_count == 2
                client.close()

    def test_retries_on_429_then_succeeds(self, test_config, mock_health_response):
        """Verify request retries on 429 rate limit and eventually succeeds."""
        call_count = 0

        def side_effect(*args, **kwargs):
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

        with patch.object(httpx.Client, "get", side_effect=side_effect):
            with patch("time.sleep"):  # Mock sleep
                client = MorphClient(test_config)
                result = client._make_request("GET", "/health", requires_auth=False)

                assert result == mock_health_response
                assert call_count == 2
                client.close()

    def test_no_retry_on_401(self, test_config):
        """Verify 401 errors are not retried."""
        call_count = 0

        def side_effect(*args, **kwargs):
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

        with patch.object(httpx.Client, "get", side_effect=side_effect):
            client = MorphClient(test_config)
            with pytest.raises(MorphAPIError) as exc_info:
                client._make_request("GET", "/auth/validate", requires_auth=True)

            assert exc_info.value.status_code == 401
            assert call_count == 1  # No retries
            client.close()

    def test_exhausts_retries_and_raises(self, test_config):
        """Verify error is raised after exhausting all retries."""
        call_count = 0

        def side_effect(*args, **kwargs):
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

        with patch.object(httpx.Client, "get", side_effect=side_effect):
            with patch("time.sleep"):  # Mock sleep
                client = MorphClient(test_config)
                with pytest.raises(MorphAPIError) as exc_info:
                    client._make_request("GET", "/health", requires_auth=False)

                assert exc_info.value.status_code == 503
                assert call_count == test_config.max_retries
                client.close()


# =============================================================================
# Test Case 7: Context Manager Support
# =============================================================================


class TestContextManager:
    """Tests for context manager support."""

    def test_context_manager_closes_client(self, test_config):
        """Verify context manager properly closes client."""
        with MorphClient(test_config) as client:
            assert client._client is None  # Not created yet
            _ = client._get_client()  # Create client
            assert client._client is not None

        # After context exit, client should be closed
        assert client._client is None

    def test_context_manager_clears_cache(self, test_config, mock_health_response):
        """Verify context manager clears health cache."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_health_response

            with MorphClient(test_config) as client:
                client.check_health()
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

    def test_create_morph_client_when_enabled_with_key(self, clean_env, test_api_key):
        """Verify create_morph_client returns client when enabled with API key."""
        os.environ["MORPH_ENABLED"] = "true"
        os.environ["MORPH_API_KEY"] = test_api_key

        client = create_morph_client()
        assert client is not None
        assert isinstance(client, MorphClient)
        assert client.config.api_key == test_api_key
        client.close()

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
    """Tests for ApplyResult and ValidationResult data classes."""

    def test_apply_result_from_response(self):
        """Verify ApplyResult.from_response parses API response correctly."""
        response_data = {
            "success": True,
            "result": {
                "new_content": "transformed code",
                "changes_applied": [{"type": "format"}],
                "confidence": 0.9,
            },
            "metadata": {"processing_time_ms": 100},
        }

        result = ApplyResult.from_response(response_data)
        assert result.success is True
        assert result.new_content == "transformed code"
        assert len(result.changes_applied) == 1
        assert result.confidence == 0.9
        assert result.processing_time_ms == 100

    def test_apply_result_from_response_with_defaults(self):
        """Verify ApplyResult handles missing fields with defaults."""
        response_data = {}

        result = ApplyResult.from_response(response_data)
        assert result.success is False
        assert result.new_content == ""
        assert result.changes_applied == []
        assert result.confidence == 0.0
        assert result.processing_time_ms == 0

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
    validate_api_key() uses apply() which expects OpenAI-compatible responses.
    """

    def test_is_available_true(self, test_config, mock_apply_response):
        """Verify is_available returns True when service is healthy and key is valid."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            # is_available calls check_health() -> validate_api_key() -> apply()
            # Only one call since is_available now delegates to check_health()
            mock_request.return_value = mock_apply_response

            client = MorphClient(test_config)
            is_available = client.is_available(use_cache=False)

            assert is_available is True
            client.close()

    def test_is_available_false_no_api_key(self):
        """Verify is_available returns False when no API key configured."""
        config = MorphConfig(api_key="")
        client = MorphClient(config)
        is_available = client.is_available()

        assert is_available is False
        client.close()

    def test_is_available_false_on_401(self, test_config):
        """Verify is_available returns False when API key is invalid (401)."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.INVALID_API_KEY,
                message="Invalid API key",
                status_code=401,
            )

            client = MorphClient(test_config)
            is_available = client.is_available(use_cache=False)

            assert is_available is False
            client.close()

    def test_is_available_false_invalid_key(self, test_config):
        """Verify is_available returns False when API key is invalid."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphAPIError(
                code=MorphErrorCode.INVALID_API_KEY,
                message="Invalid key",
                status_code=401,
            )

            client = MorphClient(test_config)
            is_available = client.is_available(use_cache=False)

            assert is_available is False
            client.close()

    def test_is_available_false_on_connection_error(self, test_config):
        """Verify is_available returns False on connection error during validation."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphConnectionError("Connection failed")

            client = MorphClient(test_config)
            is_available = client.is_available(use_cache=False)

            assert is_available is False
            client.close()
