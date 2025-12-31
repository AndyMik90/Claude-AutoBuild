"""
Unit Tests for ApplyToolManager Selection Logic
================================================

This module contains focused unit tests for the ApplyToolManager class,
specifically testing the tool selection logic that determines whether
to use Morph Fast Apply or default apply tools (Edit, Write, Bash).

Test Cases Covered:
1. Morph enabled + valid key -> selects Morph
2. Morph disabled -> selects default
3. Invalid/missing API key -> selects default
4. Service down/unavailable -> selects default
5. Force default override -> selects default
6. Configuration and factory methods
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest
from services.apply_manager import (
    DEFAULT_APPLY_TOOLS,
    MORPH_TOOL,
    ApplyManagerConfig,
    ApplyMethod,
    ApplyToolManager,
    ApplyToolSelection,
    FallbackReason,
    create_apply_manager,
    get_apply_tools,
    select_apply_method,
)
from services.morph_client import (
    MorphAPIError,
    MorphClient,
    MorphConnectionError,
    MorphTimeoutError,
    ValidationResult,
)

# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def test_api_key():
    """Provide a test API key."""
    return "test_morph_api_key_12345"


@pytest.fixture
def mock_validation_response():
    """Mock response for successful API key validation."""
    return {
        "valid": True,
        "account": {
            "id": "acc_test",
            "plan": "pro",
            "rate_limit": {"requests_per_minute": 100},
        },
        "permissions": ["apply", "validate"],
    }


@pytest.fixture
def mock_health_response():
    """Mock response for healthy service."""
    return {"status": "healthy"}


@pytest.fixture
def clean_env():
    """Ensure clean environment for tests."""
    original_env = os.environ.copy()
    # Remove any Morph-related env vars
    os.environ.pop("MORPH_ENABLED", None)
    os.environ.pop("MORPH_API_KEY", None)
    os.environ.pop("MORPH_BASE_URL", None)
    yield
    os.environ.clear()
    os.environ.update(original_env)


# =============================================================================
# Test Case 1: Morph Enabled + Valid Key -> Selects Morph
# =============================================================================


class TestMorphEnabledWithValidKey:
    """Tests for Morph selection when enabled with valid API key."""

    def test_selects_morph_method_when_enabled_and_valid(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify Morph method is selected when enabled with valid key."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.MORPH
            manager.close()

    def test_returns_morph_tool_in_tools_list(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify tools list contains MorphApply tool."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert selection.tools == [MORPH_TOOL]
            assert MORPH_TOOL in selection.tools
            manager.close()

    def test_morph_available_is_true(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify morph_available flag is True when Morph selected."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert selection.morph_available is True
            manager.close()

    def test_fallback_reason_is_none(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify fallback_reason is None when Morph is selected."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert selection.fallback_reason is None
            manager.close()

    def test_message_indicates_morph(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify selection message indicates Morph Fast Apply."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert "Morph" in selection.message
            manager.close()

    def test_is_morph_available_returns_true(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify is_morph_available() returns True when available."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert manager.is_morph_available() is True
            manager.close()


# =============================================================================
# Test Case 2: Morph Disabled -> Selects Default
# =============================================================================


class TestMorphDisabledSelectsDefault:
    """Tests for default tool selection when Morph is disabled."""

    def test_selects_default_method_when_disabled(self):
        """Verify DEFAULT method is selected when Morph disabled."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        selection = manager.select_apply_tools()

        assert selection.method == ApplyMethod.DEFAULT
        manager.close()

    def test_returns_default_tools_list(self):
        """Verify default tools list (Edit, Write, Bash) is returned."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        selection = manager.select_apply_tools()

        assert selection.tools == list(DEFAULT_APPLY_TOOLS)
        assert "Edit" in selection.tools
        assert "Write" in selection.tools
        assert "Bash" in selection.tools
        manager.close()

    def test_morph_available_is_false(self):
        """Verify morph_available flag is False when disabled."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        selection = manager.select_apply_tools()

        assert selection.morph_available is False
        manager.close()

    def test_fallback_reason_is_morph_disabled(self):
        """Verify fallback_reason is MORPH_DISABLED."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        selection = manager.select_apply_tools()

        assert selection.fallback_reason == FallbackReason.MORPH_DISABLED
        manager.close()

    def test_disabled_even_with_api_key_present(self, test_api_key):
        """Verify disabled overrides valid API key."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key=test_api_key,  # Key present but disabled
        )

        selection = manager.select_apply_tools()

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.fallback_reason == FallbackReason.MORPH_DISABLED
        manager.close()

    def test_no_morph_api_calls_when_disabled(self, test_api_key):
        """Verify no Morph API calls are made when disabled."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            manager = ApplyToolManager.from_settings(
                morph_enabled=False,
                morph_api_key=test_api_key,
            )

            manager.select_apply_tools()
            manager.is_morph_available()

            mock_request.assert_not_called()
            manager.close()

    def test_is_morph_available_returns_false_when_disabled(self, test_api_key):
        """Verify is_morph_available() returns False when disabled."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key=test_api_key,
        )

        assert manager.is_morph_available() is False
        manager.close()


# =============================================================================
# Test Case 3: Invalid/Missing API Key -> Selects Default
# =============================================================================


class TestInvalidApiKeySelectsDefault:
    """Tests for default selection with invalid or missing API key."""

    def test_selects_default_with_empty_api_key(self):
        """Verify default selected when API key is empty."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=True,
            morph_api_key="",
        )

        selection = manager.select_apply_tools()

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.fallback_reason == FallbackReason.NO_API_KEY
        manager.close()

    def test_selects_default_with_whitespace_only_key(self):
        """Verify default selected when API key is whitespace only."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=True,
            morph_api_key="   ",
        )

        selection = manager.select_apply_tools()

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.fallback_reason == FallbackReason.NO_API_KEY
        manager.close()

    def test_selects_default_with_none_equivalent_key(self):
        """Verify default selected with None-like API key."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=True,
            morph_api_key="",  # Empty string
        )

        selection = manager.select_apply_tools()

        assert selection.method == ApplyMethod.DEFAULT
        manager.close()

    def test_selects_default_when_validation_fails(self, test_api_key):
        """Verify default selected when API key validation fails."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            # Simulate invalid API key response
            mock_request.side_effect = MorphAPIError(
                code="INVALID_API_KEY",
                message="The provided API key is invalid",
                status_code=401,
            )

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key="invalid_key_12345",
                validate_on_init=True,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.DEFAULT
            assert selection.fallback_reason == FallbackReason.INVALID_API_KEY
            manager.close()

    def test_selects_default_when_validation_returns_invalid(self, test_api_key):
        """Verify default selected when validation returns valid=False."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            # Return invalid response
            mock_request.return_value = {"valid": False}

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key="some_key",
                validate_on_init=True,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.DEFAULT
            assert selection.fallback_reason == FallbackReason.INVALID_API_KEY
            manager.close()

    def test_returns_default_tools_on_invalid_key(self, test_api_key):
        """Verify default tools returned even with invalid key."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphAPIError(
                code="INVALID_API_KEY",
                message="Invalid",
                status_code=401,
            )

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key="bad_key",
            )

            selection = manager.select_apply_tools()

            assert selection.tools == list(DEFAULT_APPLY_TOOLS)
            assert "Edit" in selection.tools
            manager.close()


# =============================================================================
# Test Case 4: Service Down/Unavailable -> Selects Default
# =============================================================================


class TestServiceUnavailableSelectsDefault:
    """Tests for default selection when Morph service is unavailable."""

    def test_selects_default_when_health_check_fails(
        self,
        test_api_key,
        mock_validation_response,
    ):
        """Verify default selected when health check returns unhealthy."""
        with patch.object(MorphClient, "_make_request") as mock_request:

            def side_effect(*args, **kwargs):
                if "/validate" in args[1]:
                    return mock_validation_response
                elif args[1] == "/health":
                    return {"status": "unhealthy"}
                return {}

            mock_request.side_effect = side_effect

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.DEFAULT
            assert selection.fallback_reason == FallbackReason.SERVICE_UNAVAILABLE
            manager.close()

    def test_selects_default_on_connection_error(self, test_api_key):
        """Verify default selected on connection error."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphConnectionError("Connection refused")

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                validate_on_init=True,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.DEFAULT
            manager.close()

    def test_selects_default_on_timeout(self, test_api_key):
        """Verify default selected on timeout."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = MorphTimeoutError("Request timed out")

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                validate_on_init=True,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.DEFAULT
            manager.close()

    def test_selects_default_on_api_error(
        self,
        test_api_key,
        mock_validation_response,
    ):
        """Verify default selected on API error during health check."""
        with patch.object(MorphClient, "_make_request") as mock_request:

            def side_effect(*args, **kwargs):
                if "/validate" in args[1]:
                    return mock_validation_response
                elif args[1] == "/health":
                    raise MorphAPIError(
                        code="SERVICE_UNAVAILABLE",
                        message="Service temporarily unavailable",
                        status_code=503,
                    )
                return {}

            mock_request.side_effect = side_effect

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools()

            assert selection.method == ApplyMethod.DEFAULT
            assert selection.fallback_reason == FallbackReason.SERVICE_UNAVAILABLE
            manager.close()

    def test_is_morph_available_returns_false_when_service_down(
        self,
        test_api_key,
        mock_validation_response,
    ):
        """Verify is_morph_available() returns False when service is down."""
        with patch.object(MorphClient, "_make_request") as mock_request:

            def side_effect(*args, **kwargs):
                if "/validate" in args[1]:
                    return mock_validation_response
                elif args[1] == "/health":
                    return {"status": "unhealthy"}
                return {}

            mock_request.side_effect = side_effect

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert manager.is_morph_available() is False
            manager.close()


# =============================================================================
# Test Case 5: Force Default Override
# =============================================================================


class TestForceDefaultOverride:
    """Tests for force_default parameter."""

    def test_force_default_overrides_morph_selection(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify force_default=True overrides Morph even if available."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools(force_default=True)

            assert selection.method == ApplyMethod.DEFAULT
            manager.close()

    def test_force_default_returns_default_tools(
        self,
        test_api_key,
        mock_validation_response,
    ):
        """Verify force_default returns default tools list."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_validation_response

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools(force_default=True)

            assert selection.tools == list(DEFAULT_APPLY_TOOLS)
            manager.close()

    def test_force_default_sets_explicit_override_reason(
        self,
        test_api_key,
        mock_validation_response,
    ):
        """Verify force_default sets EXPLICIT_OVERRIDE fallback reason."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_validation_response

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            selection = manager.select_apply_tools(force_default=True)

            assert selection.fallback_reason == FallbackReason.EXPLICIT_OVERRIDE
            manager.close()


# =============================================================================
# ApplyManagerConfig Tests
# =============================================================================


class TestApplyManagerConfig:
    """Tests for ApplyManagerConfig class."""

    def test_default_config_values(self):
        """Verify default configuration values."""
        config = ApplyManagerConfig()

        assert config.morph_enabled is False
        assert config.morph_api_key == ""
        assert config.validate_on_init is True
        assert config.cache_availability is True
        assert config.fallback_on_error is True

    def test_from_env_with_disabled_morph(self, clean_env):
        """Verify from_env with Morph disabled in environment."""
        config = ApplyManagerConfig.from_env()

        assert config.morph_enabled is False
        assert config.morph_api_key == ""

    def test_from_env_with_enabled_morph(self, clean_env, test_api_key):
        """Verify from_env with Morph enabled in environment."""
        os.environ["MORPH_ENABLED"] = "true"
        os.environ["MORPH_API_KEY"] = test_api_key

        config = ApplyManagerConfig.from_env()

        assert config.morph_enabled is True
        assert config.morph_api_key == test_api_key

    def test_from_settings(self, test_api_key):
        """Verify from_settings factory method."""
        config = ApplyManagerConfig.from_settings(
            morph_enabled=True,
            morph_api_key=test_api_key,
        )

        assert config.morph_enabled is True
        assert config.morph_api_key == test_api_key

    def test_has_api_key_with_valid_key(self, test_api_key):
        """Verify has_api_key returns True with valid key."""
        config = ApplyManagerConfig(
            morph_enabled=True,
            morph_api_key=test_api_key,
        )

        assert config.has_api_key() is True

    def test_has_api_key_with_empty_key(self):
        """Verify has_api_key returns False with empty key."""
        config = ApplyManagerConfig(
            morph_enabled=True,
            morph_api_key="",
        )

        assert config.has_api_key() is False

    def test_has_api_key_with_whitespace_key(self):
        """Verify has_api_key returns False with whitespace key."""
        config = ApplyManagerConfig(
            morph_enabled=True,
            morph_api_key="   ",
        )

        assert config.has_api_key() is False


# =============================================================================
# ApplyToolManager Factory Methods
# =============================================================================


class TestApplyToolManagerFactoryMethods:
    """Tests for ApplyToolManager factory methods."""

    def test_from_env_creates_manager(self, clean_env):
        """Verify from_env creates manager from environment."""
        manager = ApplyToolManager.from_env()

        assert manager is not None
        assert manager.config is not None
        manager.close()

    def test_from_settings_creates_manager(self, test_api_key):
        """Verify from_settings creates manager from settings."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = {"valid": True, "account": {}}

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert manager is not None
            assert manager.config.morph_enabled is True
            assert manager.config.morph_api_key == test_api_key
            manager.close()


# =============================================================================
# Runtime Configuration Updates
# =============================================================================


class TestRuntimeConfigUpdates:
    """Tests for runtime configuration updates."""

    def test_update_config_enables_morph(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify update_config can enable Morph at runtime."""
        # Start with Morph disabled
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        # Verify initially default
        selection = manager.select_apply_tools()
        assert selection.method == ApplyMethod.DEFAULT

        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            # Enable Morph at runtime
            manager.update_config(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # Verify now selects Morph
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.MORPH

        manager.close()

    def test_update_config_disables_morph(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify update_config can disable Morph at runtime."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            # Start with Morph enabled
            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # Verify initially Morph
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.MORPH

            # Disable Morph at runtime
            manager.update_config(morph_enabled=False)

            # Verify now selects default
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.DEFAULT

        manager.close()

    def test_invalidate_cache_clears_state(
        self,
        test_api_key,
        mock_validation_response,
    ):
        """Verify invalidate_cache clears cached state."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_validation_response

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # Make a selection to cache state
            manager.select_apply_tools()
            assert manager.get_last_selection() is not None

            # Invalidate cache
            manager.invalidate_cache()

            # Verify state is cleared
            assert manager.get_last_selection() is None

        manager.close()


# =============================================================================
# Context Manager
# =============================================================================


class TestContextManager:
    """Tests for context manager support."""

    def test_context_manager_entry_exit(self):
        """Verify context manager works correctly."""
        with ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        ) as manager:
            assert manager is not None
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.DEFAULT

        # After exit, manager should be closed (no assertion needed, just no error)

    def test_context_manager_with_morph_enabled(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify context manager works with Morph enabled."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            with ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            ) as manager:
                selection = manager.select_apply_tools()
                assert selection.method == ApplyMethod.MORPH


# =============================================================================
# Module-level Helper Functions
# =============================================================================


class TestModuleLevelFunctions:
    """Tests for module-level helper functions."""

    def test_get_apply_tools_returns_default_when_disabled(self):
        """Verify get_apply_tools returns default when Morph disabled."""
        tools = get_apply_tools(
            morph_enabled=False,
            morph_api_key="",
        )

        assert tools == list(DEFAULT_APPLY_TOOLS)

    def test_get_apply_tools_returns_default_when_no_key(self):
        """Verify get_apply_tools returns default when no API key."""
        tools = get_apply_tools(
            morph_enabled=True,
            morph_api_key="",
        )

        assert tools == list(DEFAULT_APPLY_TOOLS)

    def test_get_apply_tools_returns_morph_when_available(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify get_apply_tools returns Morph tool when available."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            tools = get_apply_tools(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert tools == [MORPH_TOOL]

    def test_select_apply_method_returns_default_selection(self):
        """Verify select_apply_method returns default selection."""
        selection = select_apply_method(
            morph_enabled=False,
            morph_api_key="",
        )

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)

    def test_select_apply_method_returns_morph_selection(
        self,
        test_api_key,
        mock_validation_response,
        mock_health_response,
    ):
        """Verify select_apply_method returns Morph selection."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_validation_response,
                mock_health_response,
            ]

            selection = select_apply_method(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert selection.method == ApplyMethod.MORPH

    def test_create_apply_manager_from_args(self, test_api_key):
        """Verify create_apply_manager creates manager from args."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = {"valid": True, "account": {}}

            manager = create_apply_manager(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert manager is not None
            assert manager.config.morph_enabled is True
            manager.close()

    def test_create_apply_manager_from_env(self, clean_env):
        """Verify create_apply_manager creates manager from env when no args."""
        manager = create_apply_manager()

        assert manager is not None
        manager.close()


# =============================================================================
# ApplyToolSelection Dataclass
# =============================================================================


class TestApplyToolSelection:
    """Tests for ApplyToolSelection dataclass."""

    def test_selection_with_morph(self):
        """Verify ApplyToolSelection with Morph."""
        selection = ApplyToolSelection(
            method=ApplyMethod.MORPH,
            tools=[MORPH_TOOL],
            morph_available=True,
            message="Using Morph Fast Apply",
        )

        assert selection.method == ApplyMethod.MORPH
        assert selection.tools == [MORPH_TOOL]
        assert selection.fallback_reason is None
        assert selection.morph_available is True

    def test_selection_with_default(self):
        """Verify ApplyToolSelection with default tools."""
        selection = ApplyToolSelection(
            method=ApplyMethod.DEFAULT,
            tools=list(DEFAULT_APPLY_TOOLS),
            fallback_reason=FallbackReason.MORPH_DISABLED,
            morph_available=False,
            message="Using default apply tools (Morph is disabled)",
        )

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)
        assert selection.fallback_reason == FallbackReason.MORPH_DISABLED
        assert selection.morph_available is False


# =============================================================================
# Constants
# =============================================================================


class TestConstants:
    """Tests for module constants."""

    def test_default_apply_tools_constant(self):
        """Verify DEFAULT_APPLY_TOOLS contains expected tools."""
        assert DEFAULT_APPLY_TOOLS == ["Edit", "Write", "Bash"]

    def test_morph_tool_constant(self):
        """Verify MORPH_TOOL constant."""
        assert MORPH_TOOL == "MorphApply"


# =============================================================================
# Last Selection Tracking
# =============================================================================


class TestLastSelectionTracking:
    """Tests for selection history tracking."""

    def test_get_last_selection_initially_none(self):
        """Verify get_last_selection returns None initially."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        assert manager.get_last_selection() is None
        manager.close()

    def test_get_last_selection_after_selection(self):
        """Verify get_last_selection returns last selection."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        selection = manager.select_apply_tools()
        last = manager.get_last_selection()

        assert last is not None
        assert last == selection
        assert last.method == ApplyMethod.DEFAULT
        manager.close()

    def test_last_selection_updated_on_each_call(self):
        """Verify last_selection is updated on each select call."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        # First selection
        selection1 = manager.select_apply_tools()
        last1 = manager.get_last_selection()

        # Second selection
        selection2 = manager.select_apply_tools()
        last2 = manager.get_last_selection()

        # Last selection should be the second one
        assert last2 == selection2
        manager.close()


# =============================================================================
# Run tests
# =============================================================================


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
