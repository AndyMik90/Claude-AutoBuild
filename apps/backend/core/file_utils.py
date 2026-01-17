#!/usr/bin/env python3
"""
Atomic File Write Utilities
============================

Synchronous utilities for atomic file writes to prevent corruption.

Uses temp file + os.replace() pattern which is atomic on POSIX systems
and atomic on Windows when source and destination are on the same volume.

Usage:
    from core.file_utils import write_json_atomic

    write_json_atomic("/path/to/file.json", {"key": "value"})
"""

import json
import logging
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import IO, Any, Literal

from core.platform import is_windows

# Windows invalid filename characters and their safe replacements
_WINDOWS_INVALID_CHARS_MAP = str.maketrans(
    {
        "<": "_",
        ">": "_",
        ":": "-",  # Common in timestamps, replace with dash
        '"': "'",
        "|": "_",
        "?": "_",
        "*": "_",
        "/": "_",  # Path separator - prevent directory traversal
        "\\": "_",  # Windows path separator - prevent directory traversal
    }
)

# Windows reserved filenames (case-insensitive)
_WINDOWS_RESERVED_NAMES = frozenset(
    [
        "CON",
        "PRN",
        "AUX",
        "NUL",
        "COM1",
        "COM2",
        "COM3",
        "COM4",
        "COM5",
        "COM6",
        "COM7",
        "COM8",
        "COM9",
        "LPT1",
        "LPT2",
        "LPT3",
        "LPT4",
        "LPT5",
        "LPT6",
        "LPT7",
        "LPT8",
        "LPT9",
    ]
)


def normalize_path(filepath: str | Path) -> Path:
    """
    Normalize a file path for cross-platform compatibility.

    On Windows:
    - Resolves the path to absolute form
    - Handles long paths (>260 chars) by adding \\\\?\\ prefix if needed
    - Normalizes path separators

    On other platforms:
    - Simply resolves the path

    Args:
        filepath: Path to normalize

    Returns:
        Normalized Path object
    """
    path = Path(filepath)

    # Resolve to absolute path
    try:
        path = path.resolve()
    except OSError:
        # If resolve fails (e.g., path doesn't exist yet), use absolute instead
        path = path.absolute()

    if is_windows():
        path_str = str(path)

        # Handle long paths on Windows (>260 chars)
        # The \\?\ prefix allows paths up to ~32,767 chars
        if len(path_str) > 260 and not path_str.startswith("\\\\?\\"):
            if path_str.startswith("\\\\"):
                # UNC paths (\\server\share) need \\?\UNC\server\share format
                # Strip the leading \\ and prepend \\?\UNC\
                path = Path("\\\\?\\UNC\\" + path_str[2:])
            else:
                # Regular paths get \\?\ prefix
                path = Path("\\\\?\\" + path_str)

    return path


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to be valid on Windows.

    Replaces invalid characters and handles reserved names.

    Args:
        filename: The filename to sanitize (not a full path)

    Returns:
        Sanitized filename safe for Windows. Returns "_" for empty or
        whitespace-only input.
    """
    if not filename or not filename.strip():
        return "_"

    # Remove null bytes and control characters (ASCII 0-31 and DEL 127)
    sanitized = "".join(c for c in filename if ord(c) >= 32 and c != "\x7f")

    # Replace invalid characters
    sanitized = sanitized.translate(_WINDOWS_INVALID_CHARS_MAP)

    # Remove trailing dots and spaces (Windows doesn't allow them)
    sanitized = sanitized.rstrip(". ")

    # Handle edge case where filename becomes empty after sanitization
    # (e.g., input was "..." or "   ")
    if not sanitized:
        return "_"

    # Handle reserved names by prefixing with underscore
    # Use split (not rsplit) to get base name before any extension (e.g., LPT1.foo.bar -> LPT1)
    name_part = sanitized.split(".", 1)[0] if "." in sanitized else sanitized
    if name_part.upper() in _WINDOWS_RESERVED_NAMES:
        sanitized = "_" + sanitized

    return sanitized


def safe_path(filepath: str | Path) -> Path:
    """
    Create a safe, normalized path with sanitized filename.

    Combines path normalization with filename sanitization for
    full Windows compatibility.

    Args:
        filepath: Path to make safe

    Returns:
        Safe, normalized Path object
    """
    path = Path(filepath)

    if is_windows():
        # Sanitize just the filename part, not directory names
        # (directory names are usually controlled by the system/user)
        parent = path.parent
        filename = sanitize_filename(path.name)
        path = parent / filename

    return normalize_path(path)


def safe_open(
    filepath: str | Path,
    mode: str = "r",
    encoding: str | None = "utf-8",
    **kwargs: Any,
) -> IO:
    """
    Open a file with Windows-safe path handling.

    Drop-in replacement for built-in open() that handles Windows path
    normalization and long path support.

    Note: For write modes ('w', 'x', 'a'), this function automatically creates
    parent directories if they don't exist.

    Args:
        filepath: Path to the file
        mode: File open mode (default: "r")
        encoding: File encoding, None for binary modes (default: "utf-8")
        **kwargs: Additional arguments passed to open()

    Returns:
        File handle
    """
    original_path = Path(filepath)
    safe = safe_path(filepath)

    # Log warning if path was modified during sanitization
    if safe != normalize_path(original_path):
        logging.warning(
            f"Filename was sanitized: '{original_path.name}' -> '{safe.name}'"
        )

    # Ensure parent directory exists for write modes
    if any(c in mode for c in "wxa"):
        safe.parent.mkdir(parents=True, exist_ok=True)

    # Binary modes require encoding=None
    if "b" in mode:
        encoding = None

    return open(safe, mode, encoding=encoding, **kwargs)


@contextmanager
def atomic_write(
    filepath: str | Path,
    mode: Literal["w", "wb", "wt"] = "w",
    encoding: str | None = "utf-8",
) -> Iterator[IO]:
    """
    Atomic file write using temp file and rename.

    Writes to .tmp file first, then atomically replaces target file
    using os.replace() which is atomic on POSIX systems and same-volume Windows.

    Note: This function supports both text and binary modes. For binary modes
    (mode containing 'b'), encoding must be None.

    Args:
        filepath: Target file path
        mode: File open mode (default: "w", text mode only)
        encoding: File encoding for text modes, None for binary (default: "utf-8")

    Example:
        with atomic_write("/path/to/file.json") as f:
            json.dump(data, f)

    Yields:
        File handle to temp file
    """
    # Use safe_path for Windows compatibility
    filepath = safe_path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    # Binary modes require encoding=None
    actual_encoding = None if "b" in mode else encoding

    # Create temp file in same directory for atomic rename
    fd, tmp_path = tempfile.mkstemp(
        dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
    )

    # Open temp file with requested mode
    # If fdopen fails, close fd and clean up temp file
    try:
        f = os.fdopen(fd, mode, encoding=actual_encoding)
    except Exception:
        os.close(fd)
        os.unlink(tmp_path)
        raise

    try:
        with f:
            yield f
    except Exception:
        # Clean up temp file on error (replace didn't happen yet)
        try:
            os.unlink(tmp_path)
        except Exception as cleanup_err:
            # Best-effort cleanup, ignore errors to not mask original exception
            # Log cleanup failure for debugging (orphaned temp files may accumulate)
            logging.warning(
                f"Failed to cleanup temp file {tmp_path}: {cleanup_err}",
                exc_info=True,
            )
        raise
    else:
        # Atomic replace - only runs if no exception was raised
        # If os.replace itself fails, do NOT clean up (may be partially renamed)
        os.replace(tmp_path, filepath)


def write_json_atomic(
    filepath: str | Path,
    data: Any,
    indent: int = 2,
    ensure_ascii: bool = False,
    encoding: str = "utf-8",
) -> None:
    """
    Write JSON data to file atomically.

    This function prevents file corruption by:
    1. Writing to a temporary file first
    2. Only replacing the target file if the write succeeds
    3. Using os.replace() for atomicity

    Args:
        filepath: Target file path
        data: Data to serialize as JSON
        indent: JSON indentation (default: 2)
        ensure_ascii: Whether to escape non-ASCII characters (default: False)
        encoding: File encoding (default: "utf-8")

    Example:
        write_json_atomic("/path/to/file.json", {"key": "value"})
    """
    with atomic_write(filepath, "w", encoding=encoding) as f:
        json.dump(data, f, indent=indent, ensure_ascii=ensure_ascii)
