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
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import IO, Any


@contextmanager
def atomic_write(
    filepath: str | Path, mode: str = "w", encoding: str = "utf-8"
) -> Iterator[IO[str]]:
    """
    Atomic file write using temp file and rename.

    Writes to .tmp file first, then atomically replaces target file
    using os.replace() which is atomic on POSIX systems and same-volume Windows.

    Args:
        filepath: Target file path
        mode: File open mode (default: "w")
        encoding: File encoding (default: "utf-8")

    Example:
        with atomic_write("/path/to/file.json") as f:
            json.dump(data, f)

    Yields:
        File handle to temp file
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    # Create temp file in same directory for atomic rename
    fd, tmp_path = tempfile.mkstemp(
        dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
    )

    try:
        # Open temp file with requested mode
        with os.fdopen(fd, mode, encoding=encoding) as f:
            yield f

        # Atomic replace - succeeds or fails completely
        os.replace(tmp_path, filepath)

    except Exception:
        # Clean up temp file on error
        try:
            os.unlink(tmp_path)
        except Exception:
            # Best-effort cleanup, ignore errors to not mask original exception
            pass
        raise


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
