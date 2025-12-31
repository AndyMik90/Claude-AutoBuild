"""
Integration Tests for Apply Tool Manager with Morph Enabled
============================================================

This module contains integration tests for verifying the apply tool selection
flow when Morph Fast Apply is enabled. It tests the end-to-end integration
from settings to tool selection to apply operation.

Tests verify:
1. ApplyToolManager correctly selects Morph when enabled with valid API key
2. Morph API receives requests when selected
3. Apply operations complete successfully with Morph
4. Fallback behavior when Morph fails mid-operation

These tests use mocking to simulate the Morph API since we may not have
access to actual credentials in CI/CD environments.
"""

from __future__ import annotations

import json
import os
from typing import Any
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
    ApplyResult,
    MorphAPIError,
    MorphClient,
    MorphConfig,
    MorphConnectionError,
    MorphTimeoutError,
    ValidationResult,
)

# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def mock_morph_healthy_response():
    """Mock response for a healthy Morph API."""
    return {"status": "healthy"}


@pytest.fixture
def mock_morph_validation_response():
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
def mock_morph_apply_response():
    """Mock response for successful apply operation."""
    return {
        "success": True,
        "result": {
            "new_content": "def add(a: int, b: int) -> int:\n    return a + b",
            "changes_applied": [{"type": "add_type_hints", "location": "function:add"}],
            "confidence": 0.95,
        },
        "metadata": {"processing_time_ms": 150},
    }


@pytest.fixture
def test_api_key():
    """Test API key for mocked tests."""
    return "test_morph_api_key_12345"


@pytest.fixture
def morph_enabled_env(test_api_key):
    """Set up environment with Morph enabled."""
    original_env = os.environ.copy()
    os.environ["MORPH_ENABLED"] = "true"
    os.environ["MORPH_API_KEY"] = test_api_key
    yield
    os.environ.clear()
    os.environ.update(original_env)


@pytest.fixture
def morph_disabled_env():
    """Set up environment with Morph disabled."""
    original_env = os.environ.copy()
    os.environ.pop("MORPH_ENABLED", None)
    os.environ.pop("MORPH_API_KEY", None)
    yield
    os.environ.clear()
    os.environ.update(original_env)


# =============================================================================
# Test Classes
# =============================================================================


class TestApplyToolSelectionWithMorphEnabled:
    """
    Test suite for verifying apply tool selection when Morph is enabled.

    These tests verify the E2E flow:
    1. Enable Morph in settings UI with valid API key
    2. Trigger apply operation via agent
    3. Verify backend ApplyToolManager selects Morph
    4. Verify Morph API receives request
    5. Verify apply operation completes successfully
    """

    def test_selects_morph_when_enabled_and_valid(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
    ):
        """Test that Morph is selected when enabled with valid API key."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            # Mock health check and validation responses
            mock_request.side_effect = [
                mock_morph_validation_response,  # validate_api_key
                mock_morph_healthy_response,  # check_health
            ]

            # Create manager with Morph enabled
            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                validate_on_init=True,
            )

            # Select apply tools
            selection = manager.select_apply_tools()

            # Verify Morph is selected
            assert selection.method == ApplyMethod.MORPH
            assert selection.tools == [MORPH_TOOL]
            assert selection.morph_available is True
            assert selection.fallback_reason is None
            assert "Morph Fast Apply" in selection.message

            manager.close()

    def test_selects_morph_tools_via_get_apply_tools(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
    ):
        """Test get_apply_tools returns Morph tool when enabled."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            tools = manager.get_apply_tools()

            assert tools == [MORPH_TOOL]
            manager.close()

    def test_is_morph_available_returns_true_when_healthy(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
    ):
        """Test is_morph_available returns True when service is healthy."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert manager.is_morph_available() is True
            manager.close()

    def test_apply_with_morph_sends_correct_request(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Test that apply operation sends correct request to Morph API."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,  # validate_api_key
                mock_morph_apply_response,  # apply
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                validate_on_init=True,
            )

            # Perform apply operation
            result = manager.apply_with_morph(
                file_path="src/utils.py",
                content="def add(a, b): return a + b",
                instruction="Add type hints",
                language="python",
            )

            # Verify the request was made with correct parameters
            apply_call = mock_request.call_args_list[-1]
            assert apply_call[0][0] == "POST"
            assert apply_call[0][1] == "/apply"

            json_data = apply_call[1]["json_data"]
            assert json_data["file_path"] == "src/utils.py"
            assert json_data["original_content"] == "def add(a, b): return a + b"
            assert json_data["instruction"] == "Add type hints"
            assert json_data["language"] == "python"

            # Verify the result
            assert result.success is True
            assert "int" in result.new_content
            assert result.confidence > 0.9
            assert result.processing_time_ms > 0

            manager.close()

    def test_apply_with_morph_completes_successfully(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Test full apply operation completes successfully with Morph."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,  # validate on init
                mock_morph_healthy_response,  # health check during select
                mock_morph_apply_response,  # apply call
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # First verify Morph is selected
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.MORPH

            # Then perform the apply
            result = manager.apply_with_morph(
                file_path="test.py",
                content="x = 1",
                instruction="Make it typed",
            )

            assert result.success is True
            assert result.new_content  # Has content
            assert len(result.changes_applied) > 0

            manager.close()

    def test_apply_with_fallback_uses_morph_when_available(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Test apply_with_fallback uses Morph when available."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
                mock_morph_apply_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            result, method = manager.apply_with_fallback(
                file_path="test.py",
                content="x = 1",
                instruction="Add type hint",
            )

            assert method == ApplyMethod.MORPH
            assert result is not None
            assert result.success is True

            manager.close()


class TestMorphApiRequestFlow:
    """Test that Morph API receives correct requests."""

    def test_morph_api_called_on_apply(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Verify Morph API receives request when apply is called."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_apply_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            manager.apply_with_morph(
                file_path="app.py",
                content="print('hello')",
                instruction="Add logging",
            )

            # Verify apply endpoint was called
            apply_calls = [
                call for call in mock_request.call_args_list if call[0][1] == "/apply"
            ]
            assert len(apply_calls) == 1

            manager.close()

    def test_validation_request_sent_on_init(
        self,
        test_api_key,
        mock_morph_validation_response,
    ):
        """Verify API key validation request is sent on init."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = mock_morph_validation_response

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                validate_on_init=True,
            )

            # Verify validate endpoint was called
            validate_calls = [
                call
                for call in mock_request.call_args_list
                if "/validate" in call[0][1]
            ]
            assert len(validate_calls) >= 1

            manager.close()

    def test_health_check_cached(
        self,
        test_api_key,
        mock_morph_healthy_response,
        mock_morph_validation_response,
    ):
        """Verify health check results are cached."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # First selection
            manager.select_apply_tools()
            first_call_count = mock_request.call_count

            # Reset mock for second selection
            mock_request.side_effect = [
                mock_morph_healthy_response,
            ]

            # Second selection should use cache
            manager.select_apply_tools()

            # Should not have made additional health check (cached)
            # The validation is also cached after first call
            assert mock_request.call_count == first_call_count

            manager.close()


class TestMorphApplyOperationComplete:
    """Test complete apply operations with Morph."""

    def test_apply_returns_transformed_content(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Verify apply returns transformed content from Morph."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_apply_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            result = manager.apply_with_morph(
                file_path="math.py",
                content="def add(a, b): return a + b",
                instruction="Add type hints",
            )

            # Verify transformed content
            assert "int" in result.new_content
            assert result.success is True
            assert len(result.changes_applied) == 1
            assert result.confidence == 0.95

            manager.close()

    def test_apply_includes_context_when_provided(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Verify apply sends context to Morph API when provided."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_apply_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            context = {"related_files": ["types.py"], "project": "myapp"}

            manager.apply_with_morph(
                file_path="main.py",
                content="x = 1",
                instruction="Add type",
                context=context,
            )

            # Verify context was sent
            apply_call = mock_request.call_args_list[-1]
            json_data = apply_call[1]["json_data"]
            assert json_data.get("context") == context

            manager.close()

    def test_apply_processing_time_returned(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_apply_response,
    ):
        """Verify apply returns processing time from Morph."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_apply_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            result = manager.apply_with_morph(
                file_path="test.py",
                content="code",
                instruction="fix",
            )

            assert result.processing_time_ms == 150

            manager.close()


class TestMorphFallbackDuringApply:
    """Test fallback behavior when Morph fails during apply."""

    def test_apply_with_fallback_falls_back_on_api_error(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Verify fallback to default when Morph API errors during apply."""
        with patch.object(MorphClient, "_make_request") as mock_request:

            def side_effect(*args, **kwargs):
                if args[1] == "/apply":
                    raise MorphAPIError(
                        code="PROCESSING_ERROR",
                        message="Internal error",
                        status_code=500,
                    )
                elif "/validate" in args[1]:
                    return mock_morph_validation_response
                else:
                    return mock_morph_healthy_response

            mock_request.side_effect = side_effect

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                fallback_on_error=True,
            )

            result, method = manager.apply_with_fallback(
                file_path="test.py",
                content="code",
                instruction="fix",
            )

            # Should fall back to default
            assert method == ApplyMethod.DEFAULT
            assert result is None

            manager.close()

    def test_apply_with_fallback_falls_back_on_timeout(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Verify fallback to default when Morph times out during apply."""
        with patch.object(MorphClient, "_make_request") as mock_request:

            def side_effect(*args, **kwargs):
                if args[1] == "/apply":
                    raise MorphTimeoutError("Request timed out")
                elif "/validate" in args[1]:
                    return mock_morph_validation_response
                else:
                    return mock_morph_healthy_response

            mock_request.side_effect = side_effect

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                fallback_on_error=True,
            )

            result, method = manager.apply_with_fallback(
                file_path="test.py",
                content="code",
                instruction="fix",
            )

            assert method == ApplyMethod.DEFAULT
            assert result is None

            manager.close()

    def test_apply_with_fallback_falls_back_on_connection_error(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Verify fallback to default when connection to Morph fails."""
        with patch.object(MorphClient, "_make_request") as mock_request:

            def side_effect(*args, **kwargs):
                if args[1] == "/apply":
                    raise MorphConnectionError("Connection refused")
                elif "/validate" in args[1]:
                    return mock_morph_validation_response
                else:
                    return mock_morph_healthy_response

            mock_request.side_effect = side_effect

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                fallback_on_error=True,
            )

            result, method = manager.apply_with_fallback(
                file_path="test.py",
                content="code",
                instruction="fix",
            )

            assert method == ApplyMethod.DEFAULT
            assert result is None

            manager.close()


class TestModuleLevelHelperFunctions:
    """Test the module-level convenience functions."""

    def test_get_apply_tools_returns_morph_when_enabled(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Test get_apply_tools returns Morph tool when enabled."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            tools = get_apply_tools(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert tools == [MORPH_TOOL]

    def test_select_apply_method_returns_morph_selection(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Test select_apply_method returns correct selection."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            selection = select_apply_method(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert selection.method == ApplyMethod.MORPH
            assert selection.morph_available is True

    def test_create_apply_manager_from_settings(self, test_api_key):
        """Test create_apply_manager with settings override."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.return_value = {"valid": True, "account": {}}

            manager = create_apply_manager(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            assert manager.config.morph_enabled is True
            assert manager.config.morph_api_key == test_api_key

            manager.close()


class TestFallbackToDefaultWhenMorphDisabled:
    """
    Test suite for verifying fallback to default apply tools when Morph is disabled.

    These tests verify the E2E flow when Morph is explicitly disabled:
    1. Disable Morph in settings UI
    2. Trigger apply operation via agent
    3. Verify backend ApplyToolManager selects default Edit/Write tools
    4. Verify apply operation completes successfully using default tools

    This is the critical test for subtask-4-3 - ensuring existing functionality
    is not broken when Morph is disabled.
    """

    def test_selects_default_tools_when_morph_disabled_via_settings(self):
        """Test that default tools are selected when morphEnabled=False in settings."""
        # Create manager with Morph explicitly disabled (simulates UI toggle off)
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        # Select apply tools
        selection = manager.select_apply_tools()

        # Verify default tools are selected
        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)
        assert set(selection.tools) == {"Edit", "Write", "Bash"}
        assert selection.morph_available is False
        assert selection.fallback_reason == FallbackReason.MORPH_DISABLED
        assert "disabled" in selection.message.lower()

        manager.close()

    def test_selects_default_tools_when_morph_disabled_with_api_key(self):
        """Test default tools are selected even if API key is present but Morph disabled."""
        # User has API key configured but has toggled Morph off
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="test_api_key_12345",  # Key present but disabled
        )

        selection = manager.select_apply_tools()

        # Should still use default tools since Morph is disabled
        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)
        assert selection.fallback_reason == FallbackReason.MORPH_DISABLED

        manager.close()

    def test_selects_default_tools_when_no_api_key(self, morph_disabled_env):
        """Test default tools are selected when no API key is configured."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=True,  # Enabled but no API key
            morph_api_key="",
        )

        selection = manager.select_apply_tools()

        # Should fall back due to missing API key
        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)
        assert selection.fallback_reason == FallbackReason.NO_API_KEY

        manager.close()

    def test_get_apply_tools_returns_defaults_when_disabled(self):
        """Test get_apply_tools convenience method returns default tools when disabled."""
        tools = get_apply_tools(
            morph_enabled=False,
            morph_api_key="",
        )

        assert tools == list(DEFAULT_APPLY_TOOLS)
        assert "Edit" in tools
        assert "Write" in tools
        assert "Bash" in tools

    def test_get_apply_tools_returns_defaults_when_no_api_key(self):
        """Test get_apply_tools returns default tools when no API key even if enabled."""
        tools = get_apply_tools(
            morph_enabled=True,
            morph_api_key="",  # No API key
        )

        # Should return default tools without attempting Morph API call
        assert tools == list(DEFAULT_APPLY_TOOLS)

    def test_select_apply_method_returns_default_selection_when_disabled(self):
        """Test select_apply_method returns default selection when Morph disabled."""
        selection = select_apply_method(
            morph_enabled=False,
            morph_api_key="",
        )

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)
        assert selection.morph_available is False
        assert selection.fallback_reason == FallbackReason.MORPH_DISABLED

    def test_is_morph_available_returns_false_when_disabled(self):
        """Test is_morph_available returns False when Morph is disabled."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="test_key",
        )

        assert manager.is_morph_available() is False

        manager.close()

    def test_apply_with_fallback_returns_default_when_disabled(self):
        """Test apply_with_fallback indicates default method when disabled."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        result, method = manager.apply_with_fallback(
            file_path="test.py",
            content="x = 1",
            instruction="Add type hint",
        )

        # Should indicate to use default tools
        assert method == ApplyMethod.DEFAULT
        assert result is None  # No Morph result, caller should use default tools

        manager.close()

    def test_no_morph_api_calls_when_disabled(self):
        """Verify no Morph API calls are made when Morph is disabled."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            manager = ApplyToolManager.from_settings(
                morph_enabled=False,
                morph_api_key="test_key",
            )

            # Select tools and check availability
            manager.select_apply_tools()
            manager.is_morph_available()

            # No API calls should have been made
            mock_request.assert_not_called()

            manager.close()

    def test_force_default_overrides_morph_selection(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Test that force_default=True overrides Morph even if available."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
            ]

            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # Force default tools
            selection = manager.select_apply_tools(force_default=True)

            assert selection.method == ApplyMethod.DEFAULT
            assert selection.tools == list(DEFAULT_APPLY_TOOLS)
            assert selection.fallback_reason == FallbackReason.EXPLICIT_OVERRIDE

            manager.close()

    def test_runtime_disable_switches_to_default(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
    ):
        """Test that disabling Morph at runtime switches to default tools."""
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            # Start with Morph enabled
            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # Verify Morph is initially selected
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.MORPH

            # Disable Morph at runtime (simulates UI toggle off)
            manager.update_config(morph_enabled=False)

            # Verify now selects default tools
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.DEFAULT
            assert selection.tools == list(DEFAULT_APPLY_TOOLS)
            assert selection.fallback_reason == FallbackReason.MORPH_DISABLED

            manager.close()

    def test_create_apply_manager_from_env_when_disabled(self, morph_disabled_env):
        """Test create_apply_manager from environment when Morph is disabled."""
        # Environment has Morph disabled (morph_disabled_env fixture)
        manager = create_apply_manager()

        selection = manager.select_apply_tools()

        assert selection.method == ApplyMethod.DEFAULT
        assert selection.tools == list(DEFAULT_APPLY_TOOLS)

        manager.close()

    def test_config_from_env_when_disabled(self, morph_disabled_env):
        """Test ApplyManagerConfig.from_env when environment has Morph disabled."""
        config = ApplyManagerConfig.from_env()

        assert config.morph_enabled is False
        assert config.morph_api_key == ""

    def test_default_tools_list_is_correct(self):
        """Verify DEFAULT_APPLY_TOOLS contains the expected tools."""
        assert DEFAULT_APPLY_TOOLS == ["Edit", "Write", "Bash"]

    def test_last_selection_tracking_with_disabled_morph(self):
        """Test that last_selection is correctly tracked when Morph disabled."""
        manager = ApplyToolManager.from_settings(
            morph_enabled=False,
            morph_api_key="",
        )

        # Initially no selection
        assert manager.get_last_selection() is None

        # Make selection
        selection = manager.select_apply_tools()

        # Verify last selection is tracked
        last = manager.get_last_selection()
        assert last is not None
        assert last.method == ApplyMethod.DEFAULT
        assert last == selection

        manager.close()


class TestEndToEndFlow:
    """
    End-to-end integration tests simulating the full flow from
    settings configuration to successful apply operation.
    """

    def test_full_flow_settings_to_apply(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
        mock_morph_apply_response,
    ):
        """
        Complete E2E test:
        1. Settings enable Morph with valid API key
        2. ApplyToolManager selects Morph
        3. Morph API receives request
        4. Apply operation completes successfully
        """
        with patch.object(MorphClient, "_make_request") as mock_request:
            # Set up mock responses
            call_log = []

            def track_calls(*args, **kwargs):
                call_log.append({"endpoint": args[1], "method": args[0]})
                if "/validate" in args[1]:
                    return mock_morph_validation_response
                elif args[1] == "/health":
                    return mock_morph_healthy_response
                elif args[1] == "/apply":
                    return mock_morph_apply_response
                return {}

            mock_request.side_effect = track_calls

            # Step 1: Create manager with Morph settings (simulates UI settings)
            manager = ApplyToolManager.from_settings(
                morph_enabled=True,
                morph_api_key=test_api_key,
                validate_on_init=True,
            )

            # Step 2: Verify Morph is selected
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.MORPH
            assert selection.tools == [MORPH_TOOL]

            # Step 3: Perform apply operation
            result = manager.apply_with_morph(
                file_path="src/calculator.py",
                content="def multiply(x, y):\n    return x * y",
                instruction="Add type hints to the function",
                language="python",
            )

            # Step 4: Verify operation completed successfully
            assert result.success is True
            assert result.new_content
            assert result.confidence > 0

            # Verify the flow through API calls
            endpoints_called = [c["endpoint"] for c in call_log]
            assert "/auth/validate" in endpoints_called
            assert "/apply" in endpoints_called

            manager.close()

    def test_full_flow_with_runtime_config_update(
        self,
        test_api_key,
        mock_morph_validation_response,
        mock_morph_healthy_response,
        mock_morph_apply_response,
    ):
        """
        Test updating configuration at runtime (simulates UI changes).
        """
        with patch.object(MorphClient, "_make_request") as mock_request:
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
                mock_morph_apply_response,
            ]

            # Start with Morph disabled
            manager = ApplyToolManager.from_settings(
                morph_enabled=False,
                morph_api_key="",
            )

            # Verify default tools selected initially
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.DEFAULT
            assert selection.tools == list(DEFAULT_APPLY_TOOLS)

            # Reset mock for new calls
            mock_request.reset_mock()
            mock_request.side_effect = [
                mock_morph_validation_response,
                mock_morph_healthy_response,
            ]

            # Enable Morph at runtime (simulates UI toggle)
            manager.update_config(
                morph_enabled=True,
                morph_api_key=test_api_key,
            )

            # Verify Morph is now selected
            selection = manager.select_apply_tools()
            assert selection.method == ApplyMethod.MORPH
            assert selection.tools == [MORPH_TOOL]

            manager.close()


# =============================================================================
# Run tests
# =============================================================================


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
