"""
Safe I/O Utilities
==================

Provides secure file operations with:
- Atomic writes on POSIX (crash-safe via os.replace)
- Best-effort writes on Windows (see note below)
- Explicit UTF-8 encoding (cross-platform)
- Proper error handling

Platform Notes:
    On POSIX systems, writes are truly atomic using os.replace().
    On Windows, os.replace() is attempted first. If it fails (e.g., file locked),
    falls back to unlink-then-rename which is NOT atomic and can lose the
    destination file if a crash occurs between unlink and rename.

Usage:
    from core.safe_io import safe_write_json, safe_read_json, safe_write_text

    # Atomic JSON write (POSIX) / best-effort write (Windows)
    safe_write_json(path, data)

    # Safe JSON read with encoding
    data = safe_read_json(path)

    # Atomic text write (POSIX) / best-effort write (Windows)
    safe_write_text(path, content)
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any


def safe_write_text(
    path: Path | str,
    content: str,
    encoding: str = "utf-8",
) -> None:
    """
    Write text to file atomically (POSIX) or best-effort (Windows).

    Uses write-to-temp-then-rename pattern to prevent corruption
    if the process is interrupted mid-write.

    Note:
        On POSIX, the rename is atomic via os.replace().
        On Windows, if os.replace() fails (e.g., file locked), falls back to
        unlink-then-rename which is NOT atomic. A crash between unlink and
        rename can result in loss of the destination file.

    Args:
        path: Target file path
        content: Text content to write
        encoding: Character encoding (default: utf-8)

    Raises:
        OSError: If write fails
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Create temp file in same directory for atomic rename
    fd, tmp_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )

    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())  # Ensure data hits disk

        # Atomic rename (on POSIX; best-effort on Windows)
        _atomic_replace(tmp_path, path)

    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def safe_write_json(
    path: Path | str,
    data: Any,
    indent: int = 2,
    encoding: str = "utf-8",
) -> None:
    """
    Write JSON to file atomically (POSIX) or best-effort (Windows).

    Uses write-to-temp-then-rename pattern to prevent corruption.

    Note:
        On POSIX, the rename is atomic via os.replace().
        On Windows, if os.replace() fails (e.g., file locked), falls back to
        unlink-then-rename which is NOT atomic. A crash between unlink and
        rename can result in loss of the destination file.

    Args:
        path: Target file path
        data: Data to serialize as JSON
        indent: JSON indentation (default: 2)
        encoding: Character encoding (default: utf-8)

    Raises:
        OSError: If write fails
        TypeError: If data is not JSON serializable
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Create temp file in same directory for atomic rename
    fd, tmp_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )

    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())  # Ensure data hits disk

        # Atomic rename
        _atomic_replace(tmp_path, path)

    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def safe_read_text(
    path: Path | str,
    encoding: str = "utf-8",
    default: str | None = None,
) -> str:
    """
    Read text from file with explicit encoding.

    Args:
        path: File path to read
        encoding: Character encoding (default: utf-8)
        default: Default value if file doesn't exist (None = raise error)

    Returns:
        File contents as string

    Raises:
        FileNotFoundError: If file doesn't exist and no default provided
        OSError: If read fails
    """
    path = Path(path)

    if not path.exists():
        if default is not None:
            return default
        raise FileNotFoundError(f"File not found: {path}")

    with open(path, "r", encoding=encoding) as f:
        return f.read()


def safe_read_json(
    path: Path | str,
    encoding: str = "utf-8",
    default: Any = None,
) -> Any:
    """
    Read JSON from file with explicit encoding.

    Args:
        path: File path to read
        encoding: Character encoding (default: utf-8)
        default: Default value if file doesn't exist or is invalid
                 (None = raise error on missing, empty dict on invalid JSON)

    Returns:
        Parsed JSON data

    Raises:
        FileNotFoundError: If file doesn't exist and no default provided
        json.JSONDecodeError: If JSON is invalid and no default provided
    """
    path = Path(path)

    if not path.exists():
        if default is not None:
            return default
        raise FileNotFoundError(f"File not found: {path}")

    try:
        with open(path, "r", encoding=encoding) as f:
            return json.load(f)
    except json.JSONDecodeError:
        if default is not None:
            return default
        raise


def safe_open(
    path: Path | str,
    mode: str = "r",
    encoding: str | None = None,
):
    """
    Open file with explicit encoding for text modes.

    Automatically adds encoding="utf-8" for text modes if not specified.
    This prevents platform-dependent encoding issues.

    Args:
        path: File path
        mode: Open mode ('r', 'w', 'a', 'rb', 'wb', etc.)
        encoding: Character encoding (default: utf-8 for text modes)

    Returns:
        File handle
    """
    path = Path(path)

    # Determine if this is a text or binary mode
    is_binary = "b" in mode

    if is_binary:
        # Binary mode - no encoding
        return open(path, mode)
    else:
        # Text mode - use UTF-8 by default
        enc = encoding or "utf-8"
        return open(path, mode, encoding=enc)


def _atomic_replace(src: str | Path, dst: str | Path) -> None:
    """
    Atomically replace dst with src.

    On POSIX, os.replace() is atomic.
    On Windows, we try os.replace() first, then fall back to
    remove-then-rename if the file is locked.

    Args:
        src: Source file path
        dst: Destination file path
    """
    src = str(src)
    dst = str(dst)

    if sys.platform == "win32":
        # Windows: os.replace can fail if dst exists and is locked
        try:
            os.replace(src, dst)
        except OSError:
            # Fall back to remove-then-rename
            # This is NOT atomic but is our best effort on Windows
            try:
                os.unlink(dst)
            except OSError:
                pass
            os.rename(src, dst)
    else:
        # POSIX: os.replace is atomic
        os.replace(src, dst)
