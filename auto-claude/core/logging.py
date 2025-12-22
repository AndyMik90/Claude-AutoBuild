"""
Structured Logging
==================

Enterprise-grade structured logging with context propagation for observability.

Features:
- JSON-formatted log output for log aggregation systems
- Context propagation across function calls
- Performance timing utilities
- Log correlation IDs for request tracing
- Configurable log levels per module
"""

import contextvars
import functools
import json
import logging
import sys
import time
import traceback
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TypeVar

# Context variable for request/session correlation
_correlation_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "correlation_id", default=None
)
_context_data: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "context_data", default=None
)

T = TypeVar("T")


@dataclass
class LogContext:
    """Structured context for log entries."""

    correlation_id: str | None = None
    spec_name: str | None = None
    subtask_id: str | None = None
    session_num: int | None = None
    phase: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class StructuredFormatter(logging.Formatter):
    """
    JSON formatter for structured logging.

    Outputs logs in a format suitable for log aggregation systems like
    ELK, Splunk, or CloudWatch Logs.
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add correlation ID if set
        correlation_id = _correlation_id.get()
        if correlation_id:
            log_entry["correlation_id"] = correlation_id

        # Add context data
        context_data = _context_data.get()
        if context_data:
            log_entry["context"] = context_data

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": "".join(traceback.format_exception(*record.exc_info)),
            }

        # Add extra fields from record
        for key in ("duration_ms", "status", "error_code", "component"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        # Add file and line info for debugging
        log_entry["location"] = f"{record.filename}:{record.lineno}"

        return json.dumps(log_entry, default=str)


class ConsoleFormatter(logging.Formatter):
    """
    Human-readable console formatter with colors.

    Used for local development. Falls back to structured format in CI/production.
    """

    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
        "RESET": "\033[0m",
    }

    def format(self, record: logging.LogRecord) -> str:
        """Format log record for console output."""
        color = self.COLORS.get(record.levelname, self.COLORS["RESET"])
        reset = self.COLORS["RESET"]

        # Build context suffix
        context_parts = []
        correlation_id = _correlation_id.get()
        if correlation_id:
            context_parts.append(f"[{correlation_id[:8]}]")

        context_data = _context_data.get() or {}
        if context_data.get("subtask_id"):
            context_parts.append(f"[{context_data['subtask_id']}]")

        context_str = " ".join(context_parts)
        if context_str:
            context_str = f" {context_str}"

        # Format message
        message = record.getMessage()

        # Add duration if present
        if hasattr(record, "duration_ms"):
            message += f" ({record.duration_ms:.1f}ms)"

        return f"{color}{record.levelname:8}{reset}{context_str} {record.name}: {message}"


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger configured for structured logging.

    Args:
        name: Logger name (typically __name__)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    return logger


def configure_logging(
    level: int = logging.INFO,
    structured: bool = False,
    log_file: str | None = None,
) -> None:
    """
    Configure the root logger for the application.

    Args:
        level: Minimum log level
        structured: Use JSON format (for production)
        log_file: Optional file path for log output
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create formatter
    if structured:
        formatter = StructuredFormatter()
    else:
        formatter = ConsoleFormatter()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(StructuredFormatter())  # Always structured in files
        root_logger.addHandler(file_handler)


def set_correlation_id(correlation_id: str | None = None) -> str:
    """
    Set the correlation ID for the current context.

    Args:
        correlation_id: ID to use, or None to generate a new one

    Returns:
        The correlation ID that was set
    """
    if correlation_id is None:
        correlation_id = str(uuid.uuid4())
    _correlation_id.set(correlation_id)
    return correlation_id


def get_correlation_id() -> str | None:
    """Get the current correlation ID."""
    return _correlation_id.get()


def set_log_context(**kwargs: Any) -> None:
    """
    Set context data for subsequent log entries.

    Args:
        **kwargs: Context key-value pairs
    """
    current = (_context_data.get() or {}).copy()
    current.update(kwargs)
    _context_data.set(current)


def clear_log_context() -> None:
    """Clear all context data."""
    _context_data.set(None)
    _correlation_id.set(None)


def log_context(**kwargs: Any):
    """
    Context manager for temporarily adding log context.

    Usage:
        with log_context(subtask_id="task-1", phase="coding"):
            logger.info("Processing task")
    """

    class LogContextManager:
        def __init__(self, context: dict[str, Any]):
            self.context = context
            self.previous: dict[str, Any] = {}

        def __enter__(self):
            self.previous = (_context_data.get() or {}).copy()
            current = self.previous.copy()
            current.update(self.context)
            _context_data.set(current)
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            _context_data.set(self.previous)
            return False

    return LogContextManager(kwargs)


class Timer:
    """
    Context manager for timing code blocks.

    Usage:
        with Timer("database_query") as timer:
            result = db.query(...)
        logger.info("Query completed", extra={"duration_ms": timer.duration_ms})
    """

    def __init__(self, name: str = "operation"):
        self.name = name
        self.start_time: float = 0
        self.end_time: float = 0
        self.duration_ms: float = 0

    def __enter__(self) -> "Timer":
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        self.end_time = time.perf_counter()
        self.duration_ms = (self.end_time - self.start_time) * 1000
        return False


def timed(logger: logging.Logger | None = None, level: int = logging.DEBUG):
    """
    Decorator to log function execution time.

    Args:
        logger: Logger to use (defaults to function's module logger)
        level: Log level for timing messages
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        nonlocal logger
        if logger is None:
            logger = logging.getLogger(func.__module__)

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            with Timer(func.__name__) as timer:
                result = func(*args, **kwargs)
            logger.log(
                level,
                f"{func.__name__} completed",
                extra={"duration_ms": timer.duration_ms},
            )
            return result

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            with Timer(func.__name__) as timer:
                result = await func(*args, **kwargs)
            logger.log(
                level,
                f"{func.__name__} completed",
                extra={"duration_ms": timer.duration_ms},
            )
            return result

        if is_coroutine_function(func):
            return async_wrapper
        return wrapper

    return decorator


def is_coroutine_function(func: Callable) -> bool:
    """Check if a function is a coroutine function."""
    import asyncio

    return asyncio.iscoroutinefunction(func)


def log_exception(
    logger: logging.Logger,
    message: str,
    exc: Exception,
    level: int = logging.ERROR,
    **extra: Any,
) -> None:
    """
    Log an exception with full context.

    Args:
        logger: Logger instance
        message: Error message
        exc: Exception to log
        level: Log level
        **extra: Additional context
    """
    logger.log(
        level,
        message,
        exc_info=(type(exc), exc, exc.__traceback__),
        extra={
            "error_code": type(exc).__name__,
            **extra,
        },
    )
