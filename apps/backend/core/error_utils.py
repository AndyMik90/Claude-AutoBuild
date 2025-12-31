"""
Error Handling Utilities
========================

Common error handling patterns and utilities to reduce duplication
across the codebase. Provides consistent exception handling, logging,
and error suppression patterns.
"""

import logging
from contextlib import contextmanager
from functools import wraps
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


def safe_try(
    func: Callable[[], T],
    default: T | None = None,
    log_errors: bool = True,
    log_level: int = logging.WARNING,
    reraise: tuple[type[Exception], ...] = (),
) -> T | None:
    """
    Execute a function safely, returning a default value on exception.

    This is a common pattern for operations that may fail but shouldn't
    crash the application (e.g., loading optional config files).

    Args:
        func: Function to execute
        default: Value to return on exception (defaults to None)
        log_errors: Whether to log exceptions
        log_level: Logging level for exceptions
        reraise: Tuple of exception types to reraise instead of catching

    Returns:
        The function result or default value

    Examples:
        >>> # Load optional config file
        >>> config = safe_try(lambda: load_config("config.json"), default={})
        >>> # Parse optional env var
        >>> port = safe_try(lambda: int(os.getenv("PORT", "8080")), default=8080)
    """
    try:
        return func()
    except reraise:
        raise
    except Exception as e:
        if log_errors:
            logger.log(log_level, f"Error in {func.__name__}: {e}")
        return default


@contextmanager
def suppress_errors(
    log_errors: bool = True,
    log_level: int = logging.WARNING,
    reraise: tuple[type[Exception], ...] = (),
):
    """
    Context manager that suppresses exceptions from the wrapped code.

    Useful for operations where failure is acceptable and shouldn't
    interrupt the program flow.

    Args:
        log_errors: Whether to log exceptions
        log_level: Logging level for exceptions
        reraise: Tuple of exception types to reraise instead of catching

    Examples:
        >>> with suppress_errors():
        ...     optional_cleanup()
    """
    try:
        yield
    except reraise:
        raise
    except Exception as e:
        if log_errors:
            logger.log(log_level, f"Suppressed error: {e}")


def log_and_suppress(
    func: Callable[..., T],
    log_message: str | None = None,
    log_level: int = logging.WARNING,
) -> Callable[..., T | None]:
    """
    Decorator that logs and suppresses exceptions from the decorated function.

    Args:
        func: Function to decorate
        log_message: Custom log message (default: includes function name)
        log_level: Logging level for exceptions

    Returns:
        Decorated function that returns None on exception

    Examples:
        >>> @log_and_suppress
        ... def save_optional_state(path: str):
        ...     with open(path, "w") as f:
        ...         f.write(get_state())
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> T | None:
        try:
            return func(*args, **kwargs)
        except Exception as e:
            message = log_message or f"Error in {func.__name__}: {e}"
            logger.log(log_level, message)
            return None

    return wrapper


def safe_file_read(
    path: str,
    default: str = "",
    encoding: str = "utf-8",
    log_errors: bool = False,
) -> str:
    """
    Safely read a file, returning a default value on failure.

    This is a common pattern for reading optional configuration files
    like CLAUDE.md, .env files, etc.

    Args:
        path: Path to the file to read
        default: Default value if file cannot be read
        encoding: File encoding (default: utf-8)
        log_errors: Whether to log read errors

    Returns:
        File contents or default value

    Examples:
        >>> # Read optional CLAUDE.md
        >>> claude_md = safe_file_read("CLAUDE.md", default="")
    """
    try:
        with open(path, encoding=encoding) as f:
            return f.read()
    except Exception as e:
        if log_errors:
            logger.warning(f"Failed to read file {path}: {e}")
        return default


def safe_file_write(
    path: str,
    content: str,
    encoding: str = "utf-8",
    log_errors: bool = True,
) -> bool:
    """
    Safely write a file, returning success status.

    Args:
        path: Path to the file to write
        content: Content to write
        encoding: File encoding (default: utf-8)
        log_errors: Whether to log write errors

    Returns:
        True if write succeeded, False otherwise
    """
    try:
        with open(path, "w", encoding=encoding) as f:
            f.write(content)
        return True
    except Exception as e:
        if log_errors:
            logger.warning(f"Failed to write file {path}: {e}")
        return False
