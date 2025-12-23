"""
Custom Exceptions
=================

Enterprise-grade exception hierarchy for Auto-Claude.

Provides structured error handling with:
- Clear error categorization
- Retryable vs non-retryable errors
- Error codes for monitoring
- Context preservation for debugging
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ErrorCategory(Enum):
    """Categories of errors for monitoring and alerting."""

    CONFIGURATION = "configuration"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    VALIDATION = "validation"
    NETWORK = "network"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    RESOURCE = "resource"
    EXTERNAL_SERVICE = "external_service"
    INTERNAL = "internal"
    USER_INPUT = "user_input"


class ErrorSeverity(Enum):
    """Severity levels for error handling."""

    LOW = "low"  # Recoverable, can continue
    MEDIUM = "medium"  # May need retry or fallback
    HIGH = "high"  # Significant impact, needs attention
    CRITICAL = "critical"  # System failure, immediate action needed


@dataclass
class ErrorContext:
    """Structured context for error debugging."""

    operation: str = ""
    component: str = ""
    spec_id: str = ""
    subtask_id: str = ""
    session_num: int = 0
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging."""
        result = {}
        if self.operation:
            result["operation"] = self.operation
        if self.component:
            result["component"] = self.component
        if self.spec_id:
            result["spec_id"] = self.spec_id
        if self.subtask_id:
            result["subtask_id"] = self.subtask_id
        if self.session_num:
            result["session_num"] = self.session_num
        result.update(self.extra)
        return result


class AutoClaudeError(Exception):
    """
    Base exception for all Auto-Claude errors.

    Provides structured error information for monitoring and debugging.
    """

    error_code: str = "AUTO_CLAUDE_ERROR"
    category: ErrorCategory = ErrorCategory.INTERNAL
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
    retryable: bool = False

    def __init__(
        self,
        message: str,
        context: ErrorContext | None = None,
        cause: Exception | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.context = context or ErrorContext()
        self.cause = cause

    def __str__(self) -> str:
        parts = [self.message]
        if self.context.operation:
            parts.append(f"[operation={self.context.operation}]")
        if self.cause:
            parts.append(f"[caused by: {type(self.cause).__name__}: {self.cause}]")
        return " ".join(parts)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging and monitoring."""
        return {
            "error_code": self.error_code,
            "category": self.category.value,
            "severity": self.severity.value,
            "retryable": self.retryable,
            "message": self.message,
            "context": self.context.to_dict(),
            "cause": str(self.cause) if self.cause else None,
        }


# Configuration Errors


class ConfigurationError(AutoClaudeError):
    """Error in configuration or settings."""

    error_code = "CONFIG_ERROR"
    category = ErrorCategory.CONFIGURATION
    severity = ErrorSeverity.HIGH
    retryable = False


class MissingConfigError(ConfigurationError):
    """Required configuration is missing."""

    error_code = "MISSING_CONFIG"


class InvalidConfigError(ConfigurationError):
    """Configuration value is invalid."""

    error_code = "INVALID_CONFIG"


# Authentication Errors


class AuthenticationError(AutoClaudeError):
    """Authentication failed."""

    error_code = "AUTH_ERROR"
    category = ErrorCategory.AUTHENTICATION
    severity = ErrorSeverity.HIGH
    retryable = False


class TokenExpiredError(AuthenticationError):
    """Authentication token has expired."""

    error_code = "TOKEN_EXPIRED"
    retryable = True  # Can refresh and retry


class InvalidCredentialsError(AuthenticationError):
    """Credentials are invalid."""

    error_code = "INVALID_CREDENTIALS"
    retryable = False


# Validation Errors


class ValidationError(AutoClaudeError):
    """Input validation failed."""

    error_code = "VALIDATION_ERROR"
    category = ErrorCategory.VALIDATION
    severity = ErrorSeverity.LOW
    retryable = False


class SpecValidationError(ValidationError):
    """Spec file validation failed."""

    error_code = "SPEC_VALIDATION_ERROR"


class PlanValidationError(ValidationError):
    """Implementation plan validation failed."""

    error_code = "PLAN_VALIDATION_ERROR"


class CommandValidationError(ValidationError):
    """Command validation failed (security check)."""

    error_code = "COMMAND_VALIDATION_ERROR"
    severity = ErrorSeverity.MEDIUM


# Resource Errors


class ResourceError(AutoClaudeError):
    """Resource-related error."""

    error_code = "RESOURCE_ERROR"
    category = ErrorCategory.RESOURCE
    severity = ErrorSeverity.MEDIUM


class ResourceNotFoundError(ResourceError):
    """Resource does not exist."""

    error_code = "RESOURCE_NOT_FOUND"
    severity = ErrorSeverity.LOW


class ResourceConflictError(ResourceError):
    """Resource conflict (e.g., already exists)."""

    error_code = "RESOURCE_CONFLICT"


class ResourceExhaustedError(ResourceError):
    """Resource limits exceeded."""

    error_code = "RESOURCE_EXHAUSTED"
    severity = ErrorSeverity.HIGH
    retryable = True  # May succeed after waiting


# Network Errors


class NetworkError(AutoClaudeError):
    """Network communication error."""

    error_code = "NETWORK_ERROR"
    category = ErrorCategory.NETWORK
    severity = ErrorSeverity.MEDIUM
    retryable = True


class ConnectionError(NetworkError):
    """Failed to establish connection."""

    error_code = "CONNECTION_ERROR"


class TimeoutError(NetworkError):
    """Operation timed out."""

    error_code = "TIMEOUT_ERROR"
    category = ErrorCategory.TIMEOUT


class RateLimitError(NetworkError):
    """Rate limit exceeded."""

    error_code = "RATE_LIMIT_ERROR"
    category = ErrorCategory.RATE_LIMIT
    retryable = True

    def __init__(
        self,
        message: str,
        retry_after: float | None = None,
        context: ErrorContext | None = None,
        cause: Exception | None = None,
    ):
        super().__init__(message, context, cause)
        self.retry_after = retry_after


# External Service Errors


class ExternalServiceError(AutoClaudeError):
    """Error from external service."""

    error_code = "EXTERNAL_SERVICE_ERROR"
    category = ErrorCategory.EXTERNAL_SERVICE
    severity = ErrorSeverity.MEDIUM
    retryable = True


class ClaudeAPIError(ExternalServiceError):
    """Error from Claude API."""

    error_code = "CLAUDE_API_ERROR"


class LinearAPIError(ExternalServiceError):
    """Error from Linear API."""

    error_code = "LINEAR_API_ERROR"


class GraphitiError(ExternalServiceError):
    """Error from Graphiti service."""

    error_code = "GRAPHITI_ERROR"


# Execution Errors


class ExecutionError(AutoClaudeError):
    """Error during task execution."""

    error_code = "EXECUTION_ERROR"
    category = ErrorCategory.INTERNAL
    severity = ErrorSeverity.HIGH


class SubtaskError(ExecutionError):
    """Error executing a subtask."""

    error_code = "SUBTASK_ERROR"

    def __init__(
        self,
        message: str,
        subtask_id: str,
        context: ErrorContext | None = None,
        cause: Exception | None = None,
    ):
        if context is None:
            context = ErrorContext()
        context.subtask_id = subtask_id
        super().__init__(message, context, cause)


class RecoveryError(ExecutionError):
    """Error during recovery attempt."""

    error_code = "RECOVERY_ERROR"


class WorktreeError(ExecutionError):
    """Error with git worktree operations."""

    error_code = "WORKTREE_ERROR"


# Security Errors


class SecurityError(AutoClaudeError):
    """Security-related error."""

    error_code = "SECURITY_ERROR"
    category = ErrorCategory.AUTHORIZATION
    severity = ErrorSeverity.HIGH
    retryable = False


class CommandBlockedError(SecurityError):
    """Command was blocked by security policy."""

    error_code = "COMMAND_BLOCKED"

    def __init__(
        self,
        command: str,
        reason: str,
        context: ErrorContext | None = None,
    ):
        super().__init__(f"Command blocked: {reason}", context)
        self.command = command
        self.reason = reason


class PathAccessError(SecurityError):
    """Access to path was denied."""

    error_code = "PATH_ACCESS_DENIED"


# Helper functions


def is_retryable(error: Exception) -> bool:
    """Check if an error is retryable."""
    if isinstance(error, AutoClaudeError):
        return error.retryable
    # Standard library errors that are typically retryable
    retryable_types = (
        OSError,
        ConnectionError,
        TimeoutError,
    )
    return isinstance(error, retryable_types)


def get_error_code(error: Exception) -> str:
    """Get the error code for an exception."""
    if isinstance(error, AutoClaudeError):
        return error.error_code
    return type(error).__name__.upper()


def wrap_error(
    error: Exception,
    wrapper_class: type[AutoClaudeError],
    message: str | None = None,
    context: ErrorContext | None = None,
) -> AutoClaudeError:
    """
    Wrap an exception in an AutoClaudeError.

    Args:
        error: Original exception
        wrapper_class: AutoClaudeError subclass to wrap with
        message: Optional message (defaults to str(error))
        context: Optional error context

    Returns:
        Wrapped exception
    """
    if message is None:
        message = str(error)
    return wrapper_class(message=message, context=context, cause=error)
