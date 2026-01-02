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

import asyncio
import difflib
import logging
import os
import random
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
        jitter_factor: Random jitter factor (0-1) to add to backoff. Default 0.25 means
                      up to 25% additional random delay to avoid thundering herd.
        health_cache_ttl: Seconds to cache health check results. Set to 300 (5 min)
                         by default to minimize API credit usage since health checks
                         use real apply operations (Morph has no dedicated health endpoint).
        stream: Whether to use streaming responses (default: False)
        max_tokens: Maximum tokens to generate (optional, uses API default if not set)
    """

    api_key: str = ""
    base_url: str = "https://api.morphllm.com/v1"
    model: str = "auto"
    timeout: float = 60.0
    max_retries: int = 3
    backoff_factor: float = 1.5
    jitter_factor: float = 0.25  # Add up to 25% random jitter
    health_cache_ttl: int = 300  # 5 minutes - reduces API credit usage
    stream: bool = False
    max_tokens: int | None = None

    @classmethod
    def from_env(cls) -> MorphConfig:
        """Create configuration from environment variables."""
        max_tokens_str = os.environ.get("MORPH_MAX_TOKENS")
        max_tokens = int(max_tokens_str) if max_tokens_str else None

        # Parse retry configuration with sensible defaults
        max_retries_str = os.environ.get("MORPH_MAX_RETRIES")
        max_retries = int(max_retries_str) if max_retries_str else 3

        backoff_factor_str = os.environ.get("MORPH_BACKOFF_FACTOR")
        backoff_factor = float(backoff_factor_str) if backoff_factor_str else 1.5

        jitter_factor_str = os.environ.get("MORPH_JITTER_FACTOR")
        jitter_factor = float(jitter_factor_str) if jitter_factor_str else 0.25

        return cls(
            api_key=os.environ.get("MORPH_API_KEY", ""),
            base_url=os.environ.get("MORPH_BASE_URL", "https://api.morphllm.com/v1"),
            model=os.environ.get("MORPH_MODEL", "auto"),
            timeout=float(os.environ.get("MORPH_TIMEOUT", "60")),
            max_retries=max_retries,
            backoff_factor=backoff_factor,
            jitter_factor=jitter_factor,
            stream=os.environ.get("MORPH_STREAM", "").lower() == "true",
            max_tokens=max_tokens,
        )

    def calculate_backoff(self, attempt: int) -> float:
        """
        Calculate backoff time with exponential backoff and jitter.

        Uses full jitter strategy: base_delay * (1 + random(0, jitter_factor))
        This helps avoid thundering herd problems when multiple clients retry.

        Args:
            attempt: The retry attempt number (0-based)

        Returns:
            Wait time in seconds with jitter applied
        """
        base_delay = self.backoff_factor ** (attempt + 1)
        jitter = random.uniform(0, self.jitter_factor) * base_delay
        return base_delay + jitter

    def has_api_key(self) -> bool:
        """Check if an API key is configured."""
        return bool(self.api_key and self.api_key.strip())


@dataclass
class UsageMetrics:
    """
    Token usage metrics from a Morph API call.

    Attributes:
        prompt_tokens: Number of tokens in the prompt
        completion_tokens: Number of tokens in the completion
        total_tokens: Total tokens used
    """

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    @classmethod
    def from_response(cls, data: dict[str, Any]) -> UsageMetrics:
        """Create UsageMetrics from API response data."""
        usage = data.get("usage", {})
        return cls(
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
        )


# Maximum file size for Morph API (100KB reasonable limit to fail-fast)
MAX_CONTENT_SIZE_BYTES = 100 * 1024


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
        usage: Token usage metrics from the API call
        lines_added: Number of lines added (accurate count from unified diff)
        lines_removed: Number of lines removed (accurate count from unified diff)
        unified_diff: Unified diff output showing the changes made
    """

    success: bool
    new_content: str
    changes_applied: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    processing_time_ms: int = 0
    usage: UsageMetrics = field(default_factory=UsageMetrics)
    lines_added: int = 0
    lines_removed: int = 0
    unified_diff: str = ""


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
        """Create ValidationResult from API response data.

        Note: This method is provided for future compatibility if Morph adds
        a dedicated validation endpoint. Currently, API key validation is done
        via a minimal apply() call since Morph doesn't have a /validate endpoint.
        The validate_api_key() method constructs ValidationResult manually.
        """
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
    Async client for interacting with Morph Fast Apply API.

    This client handles authentication, request retries, and error handling
    for all Morph API operations. Uses async/await for non-blocking I/O.

    Example:
        config = MorphConfig.from_env()
        async with MorphClient(config) as client:
            validation = await client.validate_api_key()
            if validation.valid:
                result = await client.apply(
                    file_path="src/utils.py",
                    original_content="def add(a, b): return a + b",
                    instruction="Add type hints",
                    language="python"
                )
                if result.success:
                    print(result.new_content)

    Note:
        Always use as an async context manager or call close() when done.
    """

    def __init__(self, config: MorphConfig | None = None):
        """
        Initialize the Morph client.

        Args:
            config: Client configuration. If None, loads from environment.
        """
        self.config = config or MorphConfig.from_env()
        self._client: httpx.AsyncClient | None = None
        self._health_cache: tuple[bool, float] | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client."""
        if self._client is None:
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            if self.config.has_api_key():
                headers["Authorization"] = f"Bearer {self.config.api_key}"

            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                headers=headers,
                timeout=self.config.timeout,
            )
        return self._client

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: dict[str, Any] | None = None,
        requires_auth: bool = True,
    ) -> dict[str, Any]:
        """
        Make an async API request with retry logic.

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

        client = await self._get_client()
        last_error: Exception | None = None

        for attempt in range(self.config.max_retries):
            try:
                if method.upper() == "GET":
                    response = await client.get(endpoint)
                elif method.upper() == "POST":
                    response = await client.post(endpoint, json=json_data)
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
                    wait_time = self.config.calculate_backoff(attempt)
                    logger.debug(
                        f"Morph API error (attempt {attempt + 1}): {error}. "
                        f"Retrying in {wait_time:.1f}s"
                    )
                    await asyncio.sleep(wait_time)
                    last_error = error
                    continue

                raise error

            except httpx.ConnectError as e:
                logger.warning(f"Failed to connect to Morph API: {e}")
                if attempt < self.config.max_retries - 1:
                    wait_time = self.config.calculate_backoff(attempt)
                    await asyncio.sleep(wait_time)
                    last_error = e
                    continue
                raise MorphConnectionError(
                    f"Failed to connect to Morph API: {e}"
                ) from e

            except httpx.TimeoutException as e:
                logger.warning(f"Morph API request timed out: {e}")
                if attempt < self.config.max_retries - 1:
                    wait_time = self.config.calculate_backoff(attempt)
                    await asyncio.sleep(wait_time)
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

    async def check_health(self, use_cache: bool = True) -> bool:
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
            validation = await self.validate_api_key()
            is_healthy = validation.valid
            self._health_cache = (is_healthy, time.time())
            return is_healthy
        except (MorphAPIError, MorphConnectionError, MorphTimeoutError) as e:
            logger.warning(f"Morph health check failed: {e}")
            self._health_cache = (False, time.time())
            return False

    @staticmethod
    def _calculate_line_changes(
        original: str, new: str, file_path: str = "file"
    ) -> tuple[int, int, str]:
        """
        Calculate the number of lines added and removed between two strings.

        Uses unified diff for accurate line counting, properly handling:
        - Duplicate lines
        - Line reordering
        - Insertions and deletions

        Args:
            original: Original content
            new: New content after changes
            file_path: File path for diff header (default: "file")

        Returns:
            Tuple of (lines_added, lines_removed, unified_diff)
        """
        original_lines = original.splitlines(keepends=True)
        new_lines = new.splitlines(keepends=True)

        # Generate unified diff
        diff_lines = list(
            difflib.unified_diff(
                original_lines,
                new_lines,
                fromfile=f"a/{file_path}",
                tofile=f"b/{file_path}",
                lineterm="",
            )
        )

        # Count additions and deletions from diff output
        lines_added = 0
        lines_removed = 0
        for line in diff_lines:
            if line.startswith("+") and not line.startswith("+++"):
                lines_added += 1
            elif line.startswith("-") and not line.startswith("---"):
                lines_removed += 1

        unified_diff = "".join(diff_lines)
        return lines_added, lines_removed, unified_diff

    async def _check_auth_with_head(self) -> bool | None:
        """
        Attempt a lightweight HEAD request to check authentication.

        This avoids consuming API credits when possible. Returns:
        - True if auth appears valid (2xx response)
        - False if auth is definitely invalid (401/403)
        - None if HEAD is not supported or inconclusive (need to fall back to apply)
        """
        try:
            client = await self._get_client()
            # Try HEAD request to the chat completions endpoint
            response = await client.request("HEAD", "/chat/completions")

            if response.status_code in (200, 204):
                return True
            elif response.status_code in (401, 403):
                return False
            else:
                # Inconclusive - endpoint might not support HEAD
                return None
        except Exception:
            # HEAD not supported or other issue - fall back to apply
            return None

    async def validate_api_key(self) -> ValidationResult:
        """
        Validate the configured API key.

        This method first attempts a lightweight HEAD request to check auth
        without consuming API credits. If HEAD is not supported or inconclusive,
        it falls back to a minimal apply operation (which does consume credits).

        Use check_health() with caching enabled to minimize credit usage.

        Returns:
            ValidationResult with basic validity status

        Raises:
            MorphAPIError: If the request fails for reasons other than auth
        """
        if not self.config.has_api_key():
            return ValidationResult(valid=False)

        # First, try lightweight HEAD request to avoid consuming credits
        head_result = await self._check_auth_with_head()
        if head_result is True:
            return ValidationResult(
                valid=True,
                account_id="",
                plan="",
                rate_limit_rpm=0,
                permissions=["apply"],
            )
        elif head_result is False:
            logger.warning("Morph API key validation failed: invalid key (HEAD check)")
            return ValidationResult(valid=False)

        # HEAD was inconclusive - fall back to minimal apply operation
        # This consumes API credits but is the only reliable way to validate
        try:
            await self.apply(
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

    async def apply(
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
            MorphAPIError: If the API request fails (including content too large)
            MorphConnectionError: If unable to connect
            MorphTimeoutError: If the request times out
        """
        # Pre-validate content size to fail-fast before API call
        content_size = len(original_content.encode("utf-8"))
        if content_size > MAX_CONTENT_SIZE_BYTES:
            raise MorphAPIError(
                code=MorphErrorCode.CONTENT_TOO_LARGE,
                message=(
                    f"Content size ({content_size:,} bytes) exceeds limit "
                    f"({MAX_CONTENT_SIZE_BYTES:,} bytes). "
                    f"Consider splitting the file or using default apply tools."
                ),
                status_code=413,
            )

        # If code_edit not provided, use original_content (full file rewrite mode)
        # This is inefficient as it defeats the purpose of lazy markers
        if code_edit is None:
            logger.warning(
                f"Morph apply called without code_edit for {file_path}. "
                + "Using full file rewrite mode which consumes more tokens. "
                + "Consider providing code_edit with '... existing code ...' markers."
            )
            code_edit = original_content

        # Log that we're using Morph for this operation
        lang_info = f" ({language})" if language else ""
        logger.info(f"🚀 Using Morph Fast Apply for {file_path}{lang_info}")

        # Format message in XML format as per Morph API spec
        # Include language tag when provided for better parsing by Morph
        lang_tag = f"<language>{language}</language>\n" if language else ""
        message_content = (
            lang_tag
            + f"<instruction>{instruction}</instruction>\n"
            + f"<code>{original_content}</code>\n"
            + f"<update>{code_edit}</update>"
        )

        # Use OpenAI-compatible chat completions format
        payload: dict[str, Any] = {
            "model": self.config.model,  # auto, morph-v3-fast, or morph-v3-large
            "messages": [{"role": "user", "content": message_content}],
            "temperature": 0,  # Deterministic output as recommended by Morph docs
        }

        # Add optional parameters if configured
        if self.config.stream:
            payload["stream"] = True
        if self.config.max_tokens is not None:
            payload["max_tokens"] = self.config.max_tokens

        data = await self._make_request("POST", "/chat/completions", json_data=payload)

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

            # Validate that merged content is non-empty
            if not merged_content.strip():
                raise MorphAPIError(
                    code=MorphErrorCode.PROCESSING_ERROR,
                    message="Morph returned empty content. The apply operation may have failed.",
                    status_code=500,
                )

            # Extract usage metrics from response
            usage = UsageMetrics.from_response(data)

            # Calculate line changes and generate unified diff for summary
            lines_added, lines_removed, unified_diff = self._calculate_line_changes(
                original_content, merged_content, file_path
            )

            logger.debug(
                f"Morph apply completed: +{lines_added}/-{lines_removed} lines, "
                + f"{usage.total_tokens} tokens used"
            )

            return ApplyResult(
                success=True,
                new_content=merged_content,
                changes_applied=[],  # Morph doesn't provide change details
                confidence=1.0,
                processing_time_ms=0,
                usage=usage,
                lines_added=lines_added,
                lines_removed=lines_removed,
                unified_diff=unified_diff,
            )
        except MorphAPIError:
            raise
        except Exception as e:
            raise MorphAPIError(
                code=MorphErrorCode.PROCESSING_ERROR,
                message=f"Unexpected error parsing Morph API response: {e}",
                status_code=500,
            )

    async def is_available(self, use_cache: bool = True) -> bool:
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
        return await self.check_health(use_cache=use_cache)

    # =========================================================================
    # Synchronous Wrappers
    # =========================================================================
    # These methods provide synchronous access to async methods for use in
    # contexts where async/await is not available (e.g., ApplyToolManager).

    def _run_sync(self, coro: Any) -> Any:
        """
        Helper to run async code from sync context safely.

        Handles the case where we might already be inside an event loop
        (e.g., in Jupyter notebooks or nested async contexts) by using
        a thread pool executor.

        Args:
            coro: The coroutine to run

        Returns:
            The result of the coroutine
        """
        try:
            # Check if we're already in an event loop
            asyncio.get_running_loop()
            # If we are, we need to use a thread pool to avoid nesting
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        except RuntimeError:
            # No running loop, safe to use asyncio.run()
            return asyncio.run(coro)

    def validate_api_key_sync(self) -> ValidationResult:
        """
        Synchronous wrapper for validate_api_key().

        Note: This creates a new event loop for each call. For high-frequency
        calls, prefer using the async version with an existing event loop.

        Returns:
            ValidationResult with validity status
        """
        return self._run_sync(self.validate_api_key())

    def check_health_sync(self, use_cache: bool = True) -> bool:
        """
        Synchronous wrapper for check_health().

        Args:
            use_cache: Whether to use cached result

        Returns:
            True if service appears healthy
        """
        return self._run_sync(self.check_health(use_cache=use_cache))

    def apply_sync(
        self,
        file_path: str,
        original_content: str,
        instruction: str,
        code_edit: str | None = None,
        language: str | None = None,
    ) -> ApplyResult:
        """
        Synchronous wrapper for apply().

        Args:
            file_path: Path to the file being edited
            original_content: Current content of the file
            instruction: Brief description of what you're changing
            code_edit: The code edit with lazy markers
            language: Optional programming language hint

        Returns:
            ApplyResult with the transformed content
        """
        return self._run_sync(
            self.apply(
                file_path=file_path,
                original_content=original_content,
                instruction=instruction,
                code_edit=code_edit,
                language=language,
            )
        )

    def is_available_sync(self, use_cache: bool = True) -> bool:
        """
        Synchronous wrapper for is_available().

        Args:
            use_cache: Whether to use cached health check result

        Returns:
            True if service is available and API key is valid
        """
        return self._run_sync(self.is_available(use_cache=use_cache))

    def close_sync(self) -> None:
        """Synchronous wrapper for close()."""
        self._run_sync(self.close())

    def invalidate_health_cache(self) -> None:
        """
        Invalidate the cached health check result.

        Call this when settings change to force a fresh health check
        on the next availability check.
        """
        self._health_cache = None

    async def close(self) -> None:
        """Close the async HTTP client and release resources."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
        self._health_cache = None

    async def __aenter__(self) -> MorphClient:
        """Async context manager entry."""
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        """Async context manager exit."""
        await self.close()


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
