"""
Apply Tool Manager
==================

Manages intelligent selection between Morph Fast Apply and default apply tools.

NOTE: Uses `from __future__ import annotations` for Python 3.9 compatibility
with type hints like `list[str]` and `dict[str, Any]`.

This module implements the selection logic for choosing between:
- Morph Fast Apply: External AI-based code transformation service
- Default Apply: Built-in Edit, Write, and Bash tools

The manager follows a graceful degradation pattern - if Morph is unavailable
or disabled, it seamlessly falls back to default tools without blocking
user operations.

Selection Logic Flow:
    1. Check if Morph is enabled (MORPH_ENABLED environment variable)
    2. Validate Morph API key exists and is valid
    3. Test Morph service availability (health check)
    4. Route to Morph if all checks pass, otherwise fallback to default

Environment Variables:
    - MORPH_ENABLED: Set to 'true' to enable Morph (default: false)
    - MORPH_API_KEY: API key for Morph authentication
    - MORPH_BASE_URL: Optional override for Morph API URL
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import Any

from .morph_client import (
    ApplyResult,
    MorphAPIError,
    MorphClient,
    MorphConfig,
    MorphConnectionError,
    MorphTimeoutError,
    is_morph_enabled,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

# Default apply tools (built-in Claude Code tools)
DEFAULT_APPLY_TOOLS = ["Edit", "Write", "Bash"]

# Morph tool identifier
MORPH_TOOL = "MorphApply"


class ApplyMethod(str, Enum):
    """Enum for apply method types."""

    MORPH = "morph"
    DEFAULT = "default"


class FallbackReason(str, Enum):
    """Reasons for falling back to default apply tools."""

    MORPH_DISABLED = "morph_disabled"
    NO_API_KEY = "no_api_key"
    INVALID_API_KEY = "invalid_api_key"
    SERVICE_UNAVAILABLE = "service_unavailable"
    CONNECTION_ERROR = "connection_error"
    TIMEOUT = "timeout"
    API_ERROR = "api_error"
    EXPLICIT_OVERRIDE = "explicit_override"


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class ApplyToolSelection:
    """
    Result of apply tool selection.

    Attributes:
        method: The selected apply method (morph or default)
        tools: List of tool names to use for apply operations
        fallback_reason: If method is 'default', reason for fallback (None if morph)
        morph_available: Whether Morph service is available
        message: Human-readable explanation of the selection
    """

    method: ApplyMethod
    tools: list[str]
    fallback_reason: FallbackReason | None = None
    morph_available: bool = False
    message: str = ""


@dataclass
class ApplyManagerConfig:
    """
    Configuration for ApplyToolManager.

    Attributes:
        morph_enabled: Whether Morph integration is enabled
        morph_api_key: API key for Morph authentication
        validate_on_init: Whether to validate API key on initialization
        cache_availability: Whether to cache Morph availability checks
        availability_cache_ttl: Seconds to cache availability result
        fallback_on_error: Whether to fallback on Morph errors (default: True)
    """

    morph_enabled: bool = False
    morph_api_key: str = ""
    validate_on_init: bool = True
    cache_availability: bool = True
    availability_cache_ttl: int = 60
    fallback_on_error: bool = True

    @classmethod
    def from_env(cls) -> ApplyManagerConfig:
        """Create configuration from environment variables."""
        return cls(
            morph_enabled=is_morph_enabled(),
            morph_api_key=os.environ.get("MORPH_API_KEY", ""),
            validate_on_init=os.environ.get("MORPH_VALIDATE_ON_INIT", "true").lower()
            == "true",
        )

    @classmethod
    def from_settings(
        cls,
        morph_enabled: bool = False,
        morph_api_key: str = "",
        **kwargs: Any,
    ) -> ApplyManagerConfig:
        """
        Create configuration from app settings.

        This allows UI settings to override environment configuration.

        Args:
            morph_enabled: Whether Morph is enabled in settings
            morph_api_key: API key from settings
            **kwargs: Additional configuration options

        Returns:
            ApplyManagerConfig instance
        """
        return cls(
            morph_enabled=morph_enabled,
            morph_api_key=morph_api_key,
            validate_on_init=kwargs.get("validate_on_init", True),
            cache_availability=kwargs.get("cache_availability", True),
            availability_cache_ttl=kwargs.get("availability_cache_ttl", 60),
            fallback_on_error=kwargs.get("fallback_on_error", True),
        )

    def has_api_key(self) -> bool:
        """Check if an API key is configured."""
        return bool(self.morph_api_key and self.morph_api_key.strip())


# =============================================================================
# Apply Tool Manager
# =============================================================================


class ApplyToolManager:
    """
    Manager for intelligent apply tool selection.

    This class implements the selection logic for choosing between Morph
    Fast Apply and default apply tools. It maintains state about Morph
    availability and handles graceful fallback.

    Example:
        # Create manager from environment
        manager = ApplyToolManager.from_env()

        # Select appropriate tools
        selection = manager.select_apply_tools()
        if selection.method == ApplyMethod.MORPH:
            # Use Morph for apply operations
            result = manager.apply_with_morph(
                file_path="src/utils.py",
                content="def add(a, b): return a + b",
                instruction="Add type hints"
            )
        else:
            # Use default tools (Edit, Write)
            # ... use Claude's built-in tools

        # Always close when done
        manager.close()

    Note:
        The manager caches Morph availability to avoid repeated health checks.
        Call close() when done to release resources.
    """

    def __init__(self, config: ApplyManagerConfig | None = None):
        """
        Initialize the ApplyToolManager.

        Args:
            config: Manager configuration. If None, loads from environment.
        """
        self.config = config or ApplyManagerConfig.from_env()
        self._morph_client: MorphClient | None = None
        self._api_key_validated: bool | None = None
        self._last_selection: ApplyToolSelection | None = None

        # Initialize Morph client if enabled
        if self.config.morph_enabled and self.config.has_api_key():
            self._morph_client = MorphClient(
                MorphConfig(
                    api_key=self.config.morph_api_key,
                )
            )
            # Optionally validate API key on init
            if self.config.validate_on_init:
                self._validate_api_key()

    @classmethod
    def from_env(cls) -> ApplyToolManager:
        """
        Create an ApplyToolManager from environment variables.

        Returns:
            ApplyToolManager instance configured from environment
        """
        return cls(ApplyManagerConfig.from_env())

    @classmethod
    def from_settings(
        cls,
        morph_enabled: bool = False,
        morph_api_key: str = "",
        **kwargs: Any,
    ) -> ApplyToolManager:
        """
        Create an ApplyToolManager from app settings.

        This factory method is intended for use when settings come from
        the frontend UI rather than environment variables.

        Args:
            morph_enabled: Whether Morph is enabled in settings
            morph_api_key: API key from settings
            **kwargs: Additional configuration options

        Returns:
            ApplyToolManager instance
        """
        config = ApplyManagerConfig.from_settings(
            morph_enabled=morph_enabled,
            morph_api_key=morph_api_key,
            **kwargs,
        )
        return cls(config)

    def _validate_api_key(self) -> bool:
        """
        Validate the configured API key.

        Returns:
            True if API key is valid, False otherwise
        """
        if self._api_key_validated is not None:
            return self._api_key_validated

        if not self._morph_client:
            self._api_key_validated = False
            return False

        try:
            result = self._morph_client.validate_api_key()
            self._api_key_validated = result.valid
            if not result.valid:
                logger.warning("Morph API key validation failed")
            return result.valid
        except (MorphAPIError, MorphConnectionError, MorphTimeoutError) as e:
            logger.warning(f"Failed to validate Morph API key: {e}")
            self._api_key_validated = False
            return False

    def _check_morph_availability(self) -> tuple[bool, FallbackReason | None]:
        """
        Check if Morph service is available for use.

        Returns:
            Tuple of (is_available, fallback_reason if not available)
        """
        # Check if Morph is enabled
        if not self.config.morph_enabled:
            return False, FallbackReason.MORPH_DISABLED

        # Check if API key is configured
        if not self.config.has_api_key():
            return False, FallbackReason.NO_API_KEY

        # Check if Morph client is initialized
        if not self._morph_client:
            return False, FallbackReason.NO_API_KEY

        # Check if API key is valid
        if not self._validate_api_key():
            return False, FallbackReason.INVALID_API_KEY

        # Check service health
        try:
            if not self._morph_client.check_health(
                use_cache=self.config.cache_availability
            ):
                return False, FallbackReason.SERVICE_UNAVAILABLE
        except MorphConnectionError:
            return False, FallbackReason.CONNECTION_ERROR
        except MorphTimeoutError:
            return False, FallbackReason.TIMEOUT
        except MorphAPIError:
            return False, FallbackReason.API_ERROR

        return True, None

    def select_apply_tools(
        self,
        force_default: bool = False,
    ) -> ApplyToolSelection:
        """
        Select the appropriate apply tools based on configuration and availability.

        This is the main entry point for the selection logic. It checks
        Morph availability and returns the appropriate tool selection.

        Args:
            force_default: Force selection of default tools (override Morph)

        Returns:
            ApplyToolSelection with the selected method and tools
        """
        # Handle explicit override
        if force_default:
            selection = ApplyToolSelection(
                method=ApplyMethod.DEFAULT,
                tools=list(DEFAULT_APPLY_TOOLS),
                fallback_reason=FallbackReason.EXPLICIT_OVERRIDE,
                morph_available=False,
                message="Using default apply tools (explicit override)",
            )
            self._last_selection = selection
            return selection

        # Check Morph availability
        is_available, fallback_reason = self._check_morph_availability()

        if is_available:
            selection = ApplyToolSelection(
                method=ApplyMethod.MORPH,
                tools=[MORPH_TOOL],
                fallback_reason=None,
                morph_available=True,
                message="Using Morph Fast Apply",
            )
        else:
            # Map fallback reason to user-friendly message
            reason_messages = {
                FallbackReason.MORPH_DISABLED: "Morph is disabled",
                FallbackReason.NO_API_KEY: "No Morph API key configured",
                FallbackReason.INVALID_API_KEY: "Morph API key is invalid",
                FallbackReason.SERVICE_UNAVAILABLE: "Morph service is unavailable",
                FallbackReason.CONNECTION_ERROR: "Cannot connect to Morph service",
                FallbackReason.TIMEOUT: "Morph service request timed out",
                FallbackReason.API_ERROR: "Morph API error",
            }
            message = reason_messages.get(
                fallback_reason,
                "Unknown reason",  # type: ignore
            )
            selection = ApplyToolSelection(
                method=ApplyMethod.DEFAULT,
                tools=list(DEFAULT_APPLY_TOOLS),
                fallback_reason=fallback_reason,
                morph_available=False,
                message=f"Using default apply tools ({message})",
            )

        self._last_selection = selection
        logger.debug(f"Apply tool selection: {selection.message}")
        return selection

    def get_apply_tools(self, force_default: bool = False) -> list[str]:
        """
        Get the list of apply tools to use.

        Convenience method that returns just the tool names.

        Args:
            force_default: Force selection of default tools

        Returns:
            List of tool names
        """
        selection = self.select_apply_tools(force_default=force_default)
        return selection.tools

    def is_morph_available(self) -> bool:
        """
        Check if Morph is currently available.

        Returns:
            True if Morph is available and can be used
        """
        is_available, _ = self._check_morph_availability()
        return is_available

    def apply_with_morph(
        self,
        file_path: str,
        content: str,
        instruction: str,
        language: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> ApplyResult:
        """
        Apply changes using Morph Fast Apply.

        This method should only be called if Morph is available.
        Use select_apply_tools() first to check availability.

        Args:
            file_path: Path to the file being edited
            content: Current content of the file
            instruction: The edit instruction to apply
            language: Optional programming language hint
            context: Optional additional context

        Returns:
            ApplyResult with the transformed content

        Raises:
            RuntimeError: If Morph is not available
            MorphAPIError: If the API request fails
            MorphConnectionError: If unable to connect
            MorphTimeoutError: If the request times out
        """
        if not self._morph_client:
            raise RuntimeError(
                "Morph client not initialized. "
                "Ensure Morph is enabled and API key is configured."
            )

        return self._morph_client.apply(
            file_path=file_path,
            original_content=content,
            instruction=instruction,
            language=language,
            context=context,
        )

    def apply_with_fallback(
        self,
        file_path: str,
        content: str,
        instruction: str,
        language: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> tuple[ApplyResult | None, ApplyMethod]:
        """
        Apply changes using Morph, with automatic fallback on error.

        This method attempts to use Morph and returns (None, DEFAULT)
        if Morph fails, indicating the caller should use default tools.

        Args:
            file_path: Path to the file being edited
            content: Current content of the file
            instruction: The edit instruction to apply
            language: Optional programming language hint
            context: Optional additional context

        Returns:
            Tuple of (ApplyResult or None, ApplyMethod used)
        """
        selection = self.select_apply_tools()

        if selection.method == ApplyMethod.DEFAULT:
            return None, ApplyMethod.DEFAULT

        try:
            result = self.apply_with_morph(
                file_path=file_path,
                content=content,
                instruction=instruction,
                language=language,
                context=context,
            )
            return result, ApplyMethod.MORPH
        except (MorphAPIError, MorphConnectionError, MorphTimeoutError) as e:
            if self.config.fallback_on_error:
                logger.warning(f"Morph apply failed, falling back to default: {e}")
                return None, ApplyMethod.DEFAULT
            raise

    def get_last_selection(self) -> ApplyToolSelection | None:
        """
        Get the last tool selection result.

        Returns:
            The last ApplyToolSelection or None if no selection has been made
        """
        return self._last_selection

    def invalidate_cache(self) -> None:
        """
        Invalidate cached availability checks.

        Call this when settings change to force a fresh availability check.
        """
        self._api_key_validated = None
        if self._morph_client:
            self._morph_client._health_cache = None
        self._last_selection = None
        logger.debug("Apply manager cache invalidated")

    def update_config(
        self,
        morph_enabled: bool | None = None,
        morph_api_key: str | None = None,
    ) -> None:
        """
        Update configuration at runtime.

        This allows settings changes from the UI without recreating the manager.

        Args:
            morph_enabled: New enabled state (or None to keep current)
            morph_api_key: New API key (or None to keep current)
        """
        if morph_enabled is not None:
            self.config.morph_enabled = morph_enabled

        if morph_api_key is not None:
            self.config.morph_api_key = morph_api_key

        # Invalidate cache since config changed
        self.invalidate_cache()

        # Reinitialize Morph client if needed
        if self.config.morph_enabled and self.config.has_api_key():
            if self._morph_client:
                self._morph_client.close()
            self._morph_client = MorphClient(
                MorphConfig(api_key=self.config.morph_api_key)
            )
        elif self._morph_client:
            self._morph_client.close()
            self._morph_client = None

    def close(self) -> None:
        """Close the manager and release resources."""
        if self._morph_client:
            self._morph_client.close()
            self._morph_client = None
        self._api_key_validated = None
        self._last_selection = None

    def __enter__(self) -> ApplyToolManager:
        """Context manager entry."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.close()


# =============================================================================
# Module-level Helper Functions
# =============================================================================


def get_apply_tools(
    morph_enabled: bool = False,
    morph_api_key: str = "",
) -> list[str]:
    """
    Get the list of apply tools based on settings.

    Convenience function for quick tool list lookup without
    creating a full manager instance.

    Args:
        morph_enabled: Whether Morph is enabled
        morph_api_key: Morph API key

    Returns:
        List of tool names to use for apply operations
    """
    # Quick check - if Morph is not enabled or no API key, use defaults
    if not morph_enabled or not morph_api_key:
        return list(DEFAULT_APPLY_TOOLS)

    # Create a temporary manager for full availability check
    with ApplyToolManager.from_settings(
        morph_enabled=morph_enabled,
        morph_api_key=morph_api_key,
        validate_on_init=True,
    ) as manager:
        return manager.get_apply_tools()


def select_apply_method(
    morph_enabled: bool = False,
    morph_api_key: str = "",
) -> ApplyToolSelection:
    """
    Select the apply method based on settings.

    Convenience function that returns the full selection result.

    Args:
        morph_enabled: Whether Morph is enabled
        morph_api_key: Morph API key

    Returns:
        ApplyToolSelection with method, tools, and fallback reason
    """
    with ApplyToolManager.from_settings(
        morph_enabled=morph_enabled,
        morph_api_key=morph_api_key,
        validate_on_init=True,
    ) as manager:
        return manager.select_apply_tools()


def create_apply_manager(
    morph_enabled: bool | None = None,
    morph_api_key: str | None = None,
) -> ApplyToolManager:
    """
    Create an ApplyToolManager with optional settings override.

    If settings are not provided, loads from environment.

    Args:
        morph_enabled: Whether Morph is enabled (or None for env)
        morph_api_key: Morph API key (or None for env)

    Returns:
        ApplyToolManager instance
    """
    if morph_enabled is None and morph_api_key is None:
        return ApplyToolManager.from_env()

    # Use environment defaults for unspecified values
    return ApplyToolManager.from_settings(
        morph_enabled=morph_enabled
        if morph_enabled is not None
        else is_morph_enabled(),
        morph_api_key=morph_api_key
        if morph_api_key is not None
        else os.environ.get("MORPH_API_KEY", ""),
    )
