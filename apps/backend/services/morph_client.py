"""
Morph API Client Service
========================

Client for interacting with the Morph Fast Apply API.

This service provides authentication, validation, and apply operations
for the Morph external API service. It is designed to be used by the
ApplyToolManager for selecting between Morph and default apply tools.

Key Features:
- API key validation
- Health checking with caching
- Fast apply code transformations
- Comprehensive error handling
- Automatic retry with exponential backoff

Environment Variables:
- MORPH_API_KEY: API key for authentication
- MORPH_BASE_URL: Base URL for API (default: https://api.morphllm.com/v1)
- MORPH_TIMEOUT: Request timeout in seconds (default: 60)
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class MorphErrorCode(str, Enum):
    """Known Morph API error codes."""

    INVALID_API_KEY = "INVALID_API_KEY"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    INVALID_REQUEST = "INVALID_REQUEST"
    CONTENT_TOO_LARGE = "CONTENT_TOO_LARGE"
    UNSUPPORTED_LANGUAGE = "UNSUPPORTED_LANGUAGE"
    PROCESSING_ERROR = "PROCESSING_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


class MorphAPIError(Exception):
    """
    Exception raised for Morph API errors.

    Attributes:
        code: Error code from the API (see MorphErrorCode)
        message: Human-readable error message
        status_code: HTTP status code from the response
        request_id: Request ID for debugging (if available)
    """

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        request_id: str | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.request_id = request_id
        super().__init__(f"{code}: {message}")

    def is_retryable(self) -> bool:
        """Check if this error is retryable."""
        return self.status_code in (429, 500, 502, 503)


class MorphConnectionError(Exception):
    """Exception raised when unable to connect to Morph API."""

    pass


class MorphTimeoutError(Exception):
    """Exception raised when Morph API request times out."""

    pass


@dataclass
class MorphConfig:
    """
    Configuration for Morph API client.

    Can be initialized from environment variables using from_env().

    Attributes:
        api_key: API key for authentication (required for most operations)
        base_url: Base URL for the Morph API
        model: Model to use for apply operations (auto, morph-v3-fast, morph-v3-large)
        timeout: Request timeout in seconds
        max_retries: Maximum number of retries for failed requests
        backoff_factor: Multiplier for exponential backoff between retries
        health_cache_ttl: Seconds to cache health check results. Set to 300 (5 min)
                         by default to minimize API credit usage since health checks
                         use real apply operations (Morph has no dedicated health endpoint).
    """

    api_key: str = ""
    base_url: str = "https://api.morphllm.com/v1"
    model: str = "auto"
    timeout: float = 60.0
    max_retries: int = 3
    backoff_factor: float = 1.5
    health_cache_ttl: int = 300  # 5 minutes - reduces API credit usage

    @classmethod
    def from_env(cls) -> MorphConfig:
        """Create configuration from environment variables."""
        return cls(
            api_key=os.environ.get("MORPH_API_KEY", ""),
            base_url=os.environ.get("MORPH_BASE_URL", "https://api.morphllm.com/v1"),
            model=os.environ.get("MORPH_MODEL", "auto"),
            timeout=float(os.environ.get("MORPH_TIMEOUT", "60")),
        )

    def has_api_key(self) -> bool:
        """Check if an API key is configured."""
        return bool(self.api_key and self.api_key.strip())


@dataclass
class ApplyResult:
    """
    Result from a Morph apply operation.

    Attributes:
        success: Whether the operation succeeded
        new_content: The transformed file content
        changes_applied: List of changes that were made
        confidence: Confidence score (0-1) for the changes
        processing_time_ms: Time taken to process the request
    """

    success: bool
    new_content: str
    changes_applied: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    processing_time_ms: int = 0

    @classmethod
    def from_response(cls, data: dict[str, Any]) -> ApplyResult:
        """
        Create ApplyResult from SDK-style API response data.

        NOTE: This method is for SDK-style responses with explicit result/metadata
        fields. The current apply() method uses the OpenAI-compatible /chat/completions
        endpoint which returns a different format and constructs ApplyResult directly.

        This method is kept for potential future SDK integration or alternative
        endpoint support.

        Expected format:
            {
                "success": true,
                "result": {"new_content": "...", "changes_applied": [], "confidence": 0.9},
                "metadata": {"processing_time_ms": 100}
            }
        """
        result = data.get("result", {})
        metadata = data.get("metadata", {})
        return cls(
            success=data.get("success", False),
            new_content=result.get("new_content", ""),
            changes_applied=result.get("changes_applied", []),
            confidence=result.get("confidence", 0.0),
            processing_time_ms=metadata.get("processing_time_ms", 0),
        )


@dataclass
class ValidationResult:
    """
    Result from API key validation.

    Attributes:
        valid: Whether the API key is valid
        account_id: Account ID (if valid)
        plan: Account plan tier (if valid)
        rate_limit_rpm: Requests per minute limit
        permissions: List of granted permissions
    """

    valid: bool
    account_id: str = ""
    plan: str = ""
    rate_limit_rpm: int = 0
    permissions: list[str] = field(default_factory=list)

    @classmethod
    def from_response(cls, data: dict[str, Any]) -> ValidationResult:
        """Create ValidationResult from API response data."""
        account = data.get("account", {})
        rate_limit = account.get("rate_limit", {})
        return cls(
            valid=data.get("valid", False),
            account_id=account.get("id", ""),
            plan=account.get("plan", ""),
            rate_limit_rpm=rate_limit.get("requests_per_minute", 0),
            permissions=data.get("permissions", []),
        )


class MorphClient:
    """
    Client for interacting with Morph Fast Apply API.

    This client handles authentication, request retries, and error handling
    for all Morph API operations.

    Example:
        config = MorphConfig.from_env()
        client = MorphClient(config)

        if client.validate_api_key().valid:
            result = client.apply(
                file_path="src/utils.py",
                original_content="def add(a, b): return a + b",
                instruction="Add type hints",
                language="python"
            )
            if result.success:
                print(result.new_content)

        client.close()

    Note:
        Always call close() when done, or use as a context manager.
    """

    def __init__(self, config: MorphConfig | None = None):
        """
        Initialize the Morph client.

        Args:
            config: Client configuration. If None, loads from environment.
        """
        self.config = config or MorphConfig.from_env()
        self._client: httpx.Client | None = None
        self._health_cache: tuple[bool, float] | None = None

    def _get_client(self) -> httpx.Client:
        """Get or create the HTTP client."""
        if self._client is None:
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            if self.config.has_api_key():
                headers["Authorization"] = f"Bearer {self.config.api_key}"

            self._client = httpx.Client(
                base_url=self.config.base_url,
                headers=headers,
                timeout=self.config.timeout,
            )
        return self._client

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: dict[str, Any] | None = None,
        requires_auth: bool = True,
    ) -> dict[str, Any]:
        """
        Make an API request with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            json_data: JSON body for POST requests
            requires_auth: Whether the request requires authentication

        Returns:
            Parsed JSON response data

        Raises:
            MorphAPIError: If the API returns an error
            MorphConnectionError: If unable to connect
            MorphTimeoutError: If the request times out
        """
        if requires_auth and not self.config.has_api_key():
            raise MorphAPIError(
                code=MorphErrorCode.INVALID_API_KEY,
                message="No API key configured",
                status_code=401,
            )

        client = self._get_client()
        last_error: Exception | None = None

        for attempt in range(self.config.max_retries):
            try:
                if method.upper() == "GET":
                    response = client.get(endpoint)
                elif method.upper() == "POST":
                    response = client.post(endpoint, json=json_data)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

                # Handle success
                if response.status_code == 200:
                    return response.json()

                # Parse error response
                try:
                    error_data = response.json()
                    error_info = error_data.get("error", {})
                    error = MorphAPIError(
                        code=error_info.get("code", MorphErrorCode.UNKNOWN_ERROR),
                        message=error_info.get("message", "Unknown error"),
                        status_code=response.status_code,
                        request_id=error_info.get("request_id"),
                    )
                except Exception:
                    error = MorphAPIError(
                        code=MorphErrorCode.UNKNOWN_ERROR,
                        message=f"HTTP {response.status_code}",
                        status_code=response.status_code,
                    )

                # Retry on retryable errors
                if error.is_retryable() and attempt < self.config.max_retries - 1:
                    wait_time = self.config.backoff_factor ** (attempt + 1)
                    logger.debug(
                        f"Morph API error (attempt {attempt + 1}): {error}. "
                        f"Retrying in {wait_time:.1f}s"
                    )
                    time.sleep(wait_time)
                    last_error = error
                    continue

                raise error

            except httpx.ConnectError as e:
                logger.warning(f"Failed to connect to Morph API: {e}")
                if attempt < self.config.max_retries - 1:
                    wait_time = self.config.backoff_factor ** (attempt + 1)
                    time.sleep(wait_time)
                    last_error = e
                    continue
                raise MorphConnectionError(
                    f"Failed to connect to Morph API: {e}"
                ) from e

            except httpx.TimeoutException as e:
                logger.warning(f"Morph API request timed out: {e}")
                if attempt < self.config.max_retries - 1:
                    wait_time = self.config.backoff_factor ** (attempt + 1)
                    time.sleep(wait_time)
                    last_error = e
                    continue
                raise MorphTimeoutError(f"Morph API request timed out: {e}") from e

        # Should not reach here, but handle just in case
        if last_error:
            raise last_error
        raise MorphAPIError(
            code=MorphErrorCode.UNKNOWN_ERROR,
            message="Request failed after all retries",
            status_code=500,
        )

    def check_health(self, use_cache: bool = True) -> bool:
        """
        Check if the Morph service is healthy by attempting a minimal API call.

        WARNING: Uncached calls consume API credits!
        Morph API does not have a dedicated /health endpoint. This method calls
        validate_api_key() which makes a minimal apply operation. Results are cached
        for health_cache_ttl seconds (default 300s/5min) to minimize credit usage.

        Args:
            use_cache: Whether to use cached result (default: True). Set to False
                      only when you need to force a fresh check (consumes credits).

        Returns:
            True if service appears healthy (API key valid and service responding), False otherwise
        """
        # Check cache
        if use_cache and self._health_cache is not None:
            cached_result, cached_time = self._health_cache
            if time.time() - cached_time < self.config.health_cache_ttl:
                return cached_result

        # Since there's no /health endpoint, we check if the API key is valid
        # as a proxy for service health
        try:
            is_healthy = self.validate_api_key().valid
            self._health_cache = (is_healthy, time.time())
            return is_healthy
        except (MorphAPIError, MorphConnectionError, MorphTimeoutError) as e:
            logger.warning(f"Morph health check failed: {e}")
            self._health_cache = (False, time.time())
            return False

    def validate_api_key(self) -> ValidationResult:
        """
        Validate the configured API key.

        WARNING: This method consumes API credits!
        Morph API does not have a dedicated /auth/validate endpoint, so validation
        is performed by making a minimal apply operation. Each call uses API credits.
        Use check_health() with caching enabled to minimize credit usage.

        Returns:
            ValidationResult with basic validity status

        Raises:
            MorphAPIError: If the request fails for reasons other than auth
        """
        if not self.config.has_api_key():
            return ValidationResult(valid=False)

        try:
            # Attempt a minimal apply operation to verify the API key works
            # Use a small code snippet to minimize API usage
            _ = self.apply(
                file_path="test.py",
                original_content="# test",
                instruction="Keep as is",
                code_edit="# test",
            )
            # If we get here, the API key is valid
            return ValidationResult(
                valid=True,
                account_id="",  # Morph doesn't provide account info in responses
                plan="",
                rate_limit_rpm=0,
                permissions=["apply"],
            )
        except MorphAPIError as e:
            if e.status_code == 401:
                logger.warning("Morph API key validation failed: invalid key")
                return ValidationResult(valid=False)
            # For other errors, re-raise so caller can handle
            raise

    def apply(
        self,
        file_path: str,
        original_content: str,
        instruction: str,
        code_edit: str | None = None,
        language: str | None = None,
    ) -> ApplyResult:
        """
        Apply code changes using Morph Fast Apply.

        Uses the Morph v1/chat/completions endpoint (OpenAI compatible) with XML-formatted
        messages containing instruction, original code, and the code edit with lazy markers.

        Args:
            file_path: Path to the file being edited (for logging/debugging)
            original_content: Current content of the file
            instruction: Brief description of what you're changing
            code_edit: The code edit with "// ... existing code ..." markers for unchanged sections.
                      If not provided, uses original_content as the update (full file rewrite)
            language: Optional programming language hint (included in XML for better parsing)

        Returns:
            ApplyResult with the transformed content

        Raises:
            MorphAPIError: If the API request fails
            MorphConnectionError: If unable to connect
            MorphTimeoutError: If the request times out
        """
        # If code_edit not provided, use original_content (full file rewrite mode)
        if code_edit is None:
            code_edit = original_content

        # Log that we're using Morph for this operation
        lang_info = f" ({language})" if language else ""
        logger.info(f"🚀 Using Morph Fast Apply for {file_path}{lang_info}")

        # Format message in XML format as per Morph API spec
        # Include language hint if provided for better code parsing
        language_tag = f"<language>{language}</language>\n" if language else ""
        message_content = (
            f"{language_tag}"
            f"<instruction>{instruction}</instruction>\n"
            f"<code>{original_content}</code>\n"
            f"<update>{code_edit}</update>"
        )

        # Use OpenAI-compatible chat completions format
        payload: dict[str, Any] = {
            "model": self.config.model,  # auto, morph-v3-fast, or morph-v3-large
            "messages": [{"role": "user", "content": message_content}],
        }

        data = self._make_request("POST", "/chat/completions", json_data=payload)

        # Extract merged code from OpenAI-compatible response format
        # Expected format: {"choices": [{"message": {"content": "..."}}]}
        try:
            if not isinstance(data, dict):
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message=f"Expected dict response, got {type(data).__name__}",
                    status_code=500,
                )

            choices = data.get("choices")
            if not choices or not isinstance(choices, list):
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message="Response missing 'choices' array",
                    status_code=500,
                )

            if len(choices) == 0:
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message="Response 'choices' array is empty",
                    status_code=500,
                )

            first_choice = choices[0]
            if not isinstance(first_choice, dict):
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message=f"Expected choice to be dict, got {type(first_choice).__name__}",
                    status_code=500,
                )

            message = first_choice.get("message")
            if not isinstance(message, dict):
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message="Response missing 'message' object in choice",
                    status_code=500,
                )

            merged_content = message.get("content")
            if merged_content is None:
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message="Response missing 'content' in message",
                    status_code=500,
                )

            if not isinstance(merged_content, str):
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message=f"Expected content to be string, got {type(merged_content).__name__}",
                    status_code=500,
                )

            return ApplyResult(
                success=True,
                new_content=merged_content,
                changes_applied=[],  # Morph doesn't provide change details
                confidence=1.0,
                processing_time_ms=0,
            )
        except MorphAPIError:
            raise
        except Exception as e:
            raise MorphAPIError(
                code=MorphErrorCode.PROCESSING_ERROR,
                message=f"Unexpected error parsing Morph API response: {e}",
                status_code=500,
            )

    def is_available(self, use_cache: bool = True) -> bool:
        """
        Check if Morph service is available for use.

        This checks both service health and API key validity.
        Note: check_health() internally calls validate_api_key(), so we
        only need to call check_health() to verify both.

        Args:
            use_cache: Whether to use cached health check result

        Returns:
            True if service is available and API key is valid
        """
        if not self.config.has_api_key():
            return False

        # check_health() already validates the API key internally,
        # so we don't need to call validate_api_key() again
        return self.check_health(use_cache=use_cache)

    def close(self) -> None:
        """Close the HTTP client and release resources."""
        if self._client is not None:
            self._client.close()
            self._client = None
        self._health_cache = None

    def __enter__(self) -> MorphClient:
        """Context manager entry."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.close()


def is_morph_enabled() -> bool:
    """
    Check if Morph integration is enabled via environment.

    Returns:
        True if MORPH_ENABLED is set to 'true' AND MORPH_API_KEY is configured
    """
    enabled = os.environ.get("MORPH_ENABLED", "").lower() == "true"
    has_key = bool(os.environ.get("MORPH_API_KEY", "").strip())
    return enabled and has_key


def get_morph_api_key() -> str:
    """
    Get the Morph API key from environment.

    Returns:
        The API key if set, empty string otherwise
    """
    return os.environ.get("MORPH_API_KEY", "")


def create_morph_client() -> MorphClient | None:
    """
    Create a Morph client if enabled and configured.

    Returns:
        MorphClient instance if Morph is enabled and has an API key,
        None otherwise
    """
    if not is_morph_enabled():
        return None

    config = MorphConfig.from_env()
    if not config.has_api_key():
        logger.warning("Morph is enabled but no API key configured")
        return None

    return MorphClient(config)
