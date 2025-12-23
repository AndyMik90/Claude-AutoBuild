"""
Tests for core/exceptions.py
=============================

Tests for the custom exception hierarchy and error utilities.
"""

import pytest

from core.exceptions import (
    AuthenticationError,
    AutoClaudeError,
    ClaudeAPIError,
    CommandBlockedError,
    ConfigurationError,
    ErrorCategory,
    ErrorContext,
    ErrorSeverity,
    ExecutionError,
    ExternalServiceError,
    InvalidCredentialsError,
    NetworkError,
    RateLimitError,
    ResourceNotFoundError,
    SecurityError,
    SubtaskError,
    ValidationError,
    get_error_code,
    is_retryable,
    wrap_error,
)


class TestErrorContext:
    """Tests for ErrorContext dataclass."""

    def test_empty_context(self):
        """Test empty context produces empty dict."""
        ctx = ErrorContext()
        assert ctx.to_dict() == {}

    def test_full_context(self):
        """Test context with all fields."""
        ctx = ErrorContext(
            operation="test_op",
            component="test_component",
            spec_id="001",
            subtask_id="subtask-1",
            session_num=5,
            extra={"custom": "value"},
        )
        result = ctx.to_dict()

        assert result["operation"] == "test_op"
        assert result["component"] == "test_component"
        assert result["spec_id"] == "001"
        assert result["subtask_id"] == "subtask-1"
        assert result["session_num"] == 5
        assert result["custom"] == "value"


class TestAutoClaudeError:
    """Tests for base AutoClaudeError."""

    def test_basic_error(self):
        """Test basic error creation."""
        error = AutoClaudeError("Test error message")
        assert str(error) == "Test error message"
        assert error.message == "Test error message"
        assert error.cause is None

    def test_error_with_context(self):
        """Test error with context."""
        ctx = ErrorContext(operation="test_op")
        error = AutoClaudeError("Error occurred", context=ctx)
        assert "test_op" in str(error)

    def test_error_with_cause(self):
        """Test error with underlying cause."""
        original = ValueError("Original error")
        error = AutoClaudeError("Wrapped error", cause=original)
        assert "ValueError" in str(error)
        assert error.cause is original

    def test_to_dict(self):
        """Test conversion to dictionary."""
        error = AutoClaudeError("Test error")
        result = error.to_dict()

        assert result["error_code"] == "AUTO_CLAUDE_ERROR"
        assert result["category"] == "internal"
        assert result["severity"] == "medium"
        assert result["retryable"] is False
        assert result["message"] == "Test error"


class TestErrorCategories:
    """Tests for different error categories."""

    def test_configuration_error(self):
        """Test ConfigurationError."""
        error = ConfigurationError("Invalid config")
        assert error.category == ErrorCategory.CONFIGURATION
        assert error.severity == ErrorSeverity.HIGH
        assert error.retryable is False

    def test_authentication_error(self):
        """Test AuthenticationError."""
        error = AuthenticationError("Auth failed")
        assert error.category == ErrorCategory.AUTHENTICATION
        assert error.retryable is False

    def test_invalid_credentials_error(self):
        """Test InvalidCredentialsError."""
        error = InvalidCredentialsError("Bad password")
        assert error.error_code == "INVALID_CREDENTIALS"
        assert error.retryable is False

    def test_validation_error(self):
        """Test ValidationError."""
        error = ValidationError("Invalid input")
        assert error.category == ErrorCategory.VALIDATION
        assert error.severity == ErrorSeverity.LOW

    def test_network_error(self):
        """Test NetworkError is retryable."""
        error = NetworkError("Connection failed")
        assert error.category == ErrorCategory.NETWORK
        assert error.retryable is True

    def test_rate_limit_error(self):
        """Test RateLimitError with retry_after."""
        error = RateLimitError("Too many requests", retry_after=30.0)
        assert error.retry_after == 30.0
        assert error.retryable is True

    def test_external_service_error(self):
        """Test ExternalServiceError."""
        error = ClaudeAPIError("API error")
        assert error.category == ErrorCategory.EXTERNAL_SERVICE
        assert error.error_code == "CLAUDE_API_ERROR"

    def test_security_error(self):
        """Test SecurityError."""
        error = SecurityError("Access denied")
        assert error.category == ErrorCategory.AUTHORIZATION
        assert error.severity == ErrorSeverity.HIGH
        assert error.retryable is False


class TestSpecializedErrors:
    """Tests for specialized error types."""

    def test_subtask_error(self):
        """Test SubtaskError includes subtask_id in context."""
        error = SubtaskError("Subtask failed", subtask_id="task-123")
        assert error.context.subtask_id == "task-123"

    def test_command_blocked_error(self):
        """Test CommandBlockedError."""
        error = CommandBlockedError(
            command="rm -rf /",
            reason="Dangerous command blocked",
        )
        assert error.command == "rm -rf /"
        assert error.reason == "Dangerous command blocked"

    def test_resource_not_found(self):
        """Test ResourceNotFoundError."""
        error = ResourceNotFoundError("File not found")
        assert error.severity == ErrorSeverity.LOW


class TestErrorUtilities:
    """Tests for error utility functions."""

    def test_is_retryable_auto_claude_error(self):
        """Test is_retryable with AutoClaudeError."""
        assert is_retryable(NetworkError("Network issue")) is True
        assert is_retryable(ValidationError("Bad input")) is False

    def test_is_retryable_standard_error(self):
        """Test is_retryable with standard exceptions."""
        assert is_retryable(OSError("Disk error")) is True
        assert is_retryable(ValueError("Bad value")) is False

    def test_get_error_code_auto_claude(self):
        """Test get_error_code with AutoClaudeError."""
        error = ConfigurationError("Config error")
        assert get_error_code(error) == "CONFIG_ERROR"

    def test_get_error_code_standard(self):
        """Test get_error_code with standard exception."""
        error = ValueError("Bad value")
        assert get_error_code(error) == "VALUEERROR"

    def test_wrap_error(self):
        """Test wrapping an exception."""
        original = IOError("Disk full")
        wrapped = wrap_error(original, ExecutionError, "Failed to save file")

        assert isinstance(wrapped, ExecutionError)
        assert wrapped.cause is original
        assert "Failed to save file" in str(wrapped)

    def test_wrap_error_default_message(self):
        """Test wrapping with default message."""
        original = IOError("Original message")
        wrapped = wrap_error(original, ExecutionError)

        assert "Original message" in wrapped.message
