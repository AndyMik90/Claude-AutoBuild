"""
File Locking for Concurrent Operations
======================================

Thread-safe and process-safe file locking utilities for GitHub automation.
Uses fcntl.flock() on Unix systems for proper cross-process locking.

Example Usage:
    # Simple file locking
    async with FileLock("path/to/file.json", timeout=5.0):
        # Do work with locked file
        pass

    # Atomic write with locking
    async with locked_write("path/to/file.json", timeout=5.0) as f:
        json.dump(data, f)
"""

from __future__ import annotations

import asyncio
import fcntl
import json
import os
import tempfile
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Any


class FileLockError(Exception):
    """Raised when file locking operations fail."""

    pass


class FileLockTimeout(FileLockError):
    """Raised when lock acquisition times out."""

    pass


class FileLock:
    """
    Cross-process file lock using fcntl.flock().

    Supports both sync and async context managers for flexible usage.

    Args:
        filepath: Path to file to lock (will be created if needed)
        timeout: Maximum seconds to wait for lock (default: 5.0)
        exclusive: Whether to use exclusive lock (default: True)

    Example:
        # Synchronous usage
        with FileLock("/path/to/file.json"):
            # File is locked
            pass

        # Asynchronous usage
        async with FileLock("/path/to/file.json"):
            # File is locked
            pass
    """

    def __init__(
        self,
        filepath: str | Path,
        timeout: float = 5.0,
        exclusive: bool = True,
    ):
        self.filepath = Path(filepath)
        self.timeout = timeout
        self.exclusive = exclusive
        self._lock_file: Path | None = None
        self._fd: int | None = None

    def _get_lock_file(self) -> Path:
        """Get lock file path (separate .lock file)."""
        return self.filepath.parent / f"{self.filepath.name}.lock"

    def _acquire_lock(self) -> None:
        """Acquire the file lock (blocking with timeout)."""
        self._lock_file = self._get_lock_file()
        self._lock_file.parent.mkdir(parents=True, exist_ok=True)

        # Open lock file
        self._fd = os.open(str(self._lock_file), os.O_CREAT | os.O_RDWR)

        # Try to acquire lock with timeout
        lock_mode = fcntl.LOCK_EX if self.exclusive else fcntl.LOCK_SH
        start_time = time.time()

        while True:
            try:
                # Non-blocking lock attempt
                fcntl.flock(self._fd, lock_mode | fcntl.LOCK_NB)
                return  # Lock acquired
            except BlockingIOError:
                # Lock held by another process
                elapsed = time.time() - start_time
                if elapsed >= self.timeout:
                    os.close(self._fd)
                    self._fd = None
                    raise FileLockTimeout(
                        f"Failed to acquire lock on {self.filepath} within {self.timeout}s"
                    )

                # Wait a bit before retrying
                time.sleep(0.01)

    def _release_lock(self) -> None:
        """Release the file lock."""
        if self._fd is not None:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
                os.close(self._fd)
            except Exception:
                pass  # Best effort cleanup
            finally:
                self._fd = None

        # Clean up lock file
        if self._lock_file and self._lock_file.exists():
            try:
                self._lock_file.unlink()
            except Exception:
                pass  # Best effort cleanup

    def __enter__(self):
        """Synchronous context manager entry."""
        self._acquire_lock()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Synchronous context manager exit."""
        self._release_lock()
        return False

    async def __aenter__(self):
        """Async context manager entry."""
        # Run blocking lock acquisition in thread pool
        await asyncio.get_event_loop().run_in_executor(None, self._acquire_lock)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await asyncio.get_event_loop().run_in_executor(None, self._release_lock)
        return False


@contextmanager
def atomic_write(filepath: str | Path, mode: str = "w"):
    """
    Atomic file write using temp file and rename.

    Writes to .tmp file first, then atomically replaces target file
    using os.replace() which is atomic on POSIX systems.

    Args:
        filepath: Target file path
        mode: File open mode (default: "w")

    Example:
        with atomic_write("/path/to/file.json") as f:
            json.dump(data, f)
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    # Create temp file in same directory for atomic rename
    fd, tmp_path = tempfile.mkstemp(
        dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
    )

    try:
        # Open temp file with requested mode
        with os.fdopen(fd, mode) as f:
            yield f

        # Atomic replace - succeeds or fails completely
        os.replace(tmp_path, filepath)

    except Exception:
        # Clean up temp file on error
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise


@asynccontextmanager
async def locked_write(filepath: str | Path, timeout: float = 5.0, mode: str = "w"):
    """
    Async context manager combining file locking and atomic writes.

    Acquires exclusive lock, writes to temp file, atomically replaces target.
    This is the recommended way to safely write shared state files.

    Args:
        filepath: Target file path
        timeout: Lock timeout in seconds (default: 5.0)
        mode: File open mode (default: "w")

    Example:
        async with locked_write("/path/to/file.json", timeout=5.0) as f:
            json.dump(data, f, indent=2)

    Raises:
        FileLockTimeout: If lock cannot be acquired within timeout
    """
    filepath = Path(filepath)

    # Acquire lock
    lock = FileLock(filepath, timeout=timeout, exclusive=True)
    await lock.__aenter__()

    try:
        # Atomic write in thread pool (since it uses sync file I/O)
        fd, tmp_path = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: tempfile.mkstemp(
                dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
            ),
        )

        try:
            # Open temp file and yield to caller
            f = os.fdopen(fd, mode)
            yield f

            # Ensure file is closed before rename
            f.close()

            # Atomic replace
            await asyncio.get_event_loop().run_in_executor(
                None, os.replace, tmp_path, filepath
            )

        except Exception:
            # Clean up temp file on error
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, os.unlink, tmp_path
                )
            except Exception:
                pass
            raise

    finally:
        # Release lock
        await lock.__aexit__(None, None, None)


@asynccontextmanager
async def locked_read(filepath: str | Path, timeout: float = 5.0):
    """
    Async context manager for locked file reading.

    Acquires shared lock for reading, allowing multiple concurrent readers
    but blocking writers.

    Args:
        filepath: File path to read
        timeout: Lock timeout in seconds (default: 5.0)

    Example:
        async with locked_read("/path/to/file.json", timeout=5.0) as f:
            data = json.load(f)

    Raises:
        FileLockTimeout: If lock cannot be acquired within timeout
        FileNotFoundError: If file doesn't exist
    """
    filepath = Path(filepath)

    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    # Acquire shared lock (allows multiple readers)
    lock = FileLock(filepath, timeout=timeout, exclusive=False)
    await lock.__aenter__()

    try:
        # Open file for reading
        with open(filepath) as f:
            yield f
    finally:
        # Release lock
        await lock.__aexit__(None, None, None)


async def locked_json_write(
    filepath: str | Path, data: Any, timeout: float = 5.0, indent: int = 2
) -> None:
    """
    Helper function for writing JSON with locking and atomicity.

    Args:
        filepath: Target file path
        data: Data to serialize as JSON
        timeout: Lock timeout in seconds (default: 5.0)
        indent: JSON indentation (default: 2)

    Example:
        await locked_json_write("/path/to/file.json", {"key": "value"})

    Raises:
        FileLockTimeout: If lock cannot be acquired within timeout
    """
    async with locked_write(filepath, timeout=timeout) as f:
        json.dump(data, f, indent=indent)


async def locked_json_read(filepath: str | Path, timeout: float = 5.0) -> Any:
    """
    Helper function for reading JSON with locking.

    Args:
        filepath: File path to read
        timeout: Lock timeout in seconds (default: 5.0)

    Returns:
        Parsed JSON data

    Example:
        data = await locked_json_read("/path/to/file.json")

    Raises:
        FileLockTimeout: If lock cannot be acquired within timeout
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file contains invalid JSON
    """
    async with locked_read(filepath, timeout=timeout) as f:
        return json.load(f)


async def locked_json_update(
    filepath: str | Path, updater: callable, timeout: float = 5.0, indent: int = 2
) -> Any:
    """
    Helper for atomic read-modify-write of JSON files.

    Acquires exclusive lock, reads current data, applies updater function,
    writes updated data atomically.

    Args:
        filepath: File path to update
        updater: Function that takes current data and returns updated data
        timeout: Lock timeout in seconds (default: 5.0)
        indent: JSON indentation (default: 2)

    Returns:
        Updated data

    Example:
        def add_item(data):
            data["items"].append({"new": "item"})
            return data

        updated = await locked_json_update("/path/to/file.json", add_item)

    Raises:
        FileLockTimeout: If lock cannot be acquired within timeout
    """
    filepath = Path(filepath)

    # Acquire exclusive lock
    lock = FileLock(filepath, timeout=timeout, exclusive=True)
    await lock.__aenter__()

    try:
        # Read current data
        if filepath.exists():
            with open(filepath) as f:
                data = json.load(f)
        else:
            data = None

        # Apply update function
        updated_data = updater(data)

        # Write atomically
        fd, tmp_path = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: tempfile.mkstemp(
                dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
            ),
        )

        try:
            with os.fdopen(fd, "w") as f:
                json.dump(updated_data, f, indent=indent)

            await asyncio.get_event_loop().run_in_executor(
                None, os.replace, tmp_path, filepath
            )

        except Exception:
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, os.unlink, tmp_path
                )
            except Exception:
                pass
            raise

        return updated_data

    finally:
        await lock.__aexit__(None, None, None)
