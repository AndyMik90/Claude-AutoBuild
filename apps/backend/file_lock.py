"""
File Locking Utilities (Single Source of Truth)
==============================================

Thread-safe und process-safe File-Locking Utilities, die sowohl vom GitHub Runner
als auch von Graphiti/Memory-Queries genutzt werden.

Wichtig:
- Dieses Modul ist die **einzige** Implementierung.
- `apps/backend/runners/github/file_lock.py` re-exportet von hier (Backward-Compat),
  damit keine doppelte Logik gepflegt werden muss.

Technik:
- Unix: `fcntl.flock()`
- Windows: `msvcrt.locking()`
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
import warnings
from collections.abc import Callable
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Any

_IS_WINDOWS = os.name == "nt"
_WINDOWS_LOCK_SIZE = 1024 * 1024

try:
    import fcntl  # type: ignore
except ImportError:  # pragma: no cover
    fcntl = None

try:
    import msvcrt  # type: ignore
except ImportError:  # pragma: no cover
    msvcrt = None


def _try_lock(fd: int, exclusive: bool) -> None:
    if _IS_WINDOWS:
        if msvcrt is None:
            raise FileLockError("msvcrt is required for file locking on Windows")
        if not exclusive:
            warnings.warn(
                "Shared file locks are not supported on Windows; using exclusive lock",
                RuntimeWarning,
                stacklevel=3,
            )
        msvcrt.locking(fd, msvcrt.LK_NBLCK, _WINDOWS_LOCK_SIZE)
        return

    if fcntl is None:
        raise FileLockError("fcntl is required for file locking on non-Windows platforms")

    lock_mode = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
    fcntl.flock(fd, lock_mode | fcntl.LOCK_NB)


def _unlock(fd: int) -> None:
    if _IS_WINDOWS:
        if msvcrt is None:
            warnings.warn(
                "msvcrt unavailable; cannot unlock file descriptor",
                RuntimeWarning,
                stacklevel=3,
            )
            return
        msvcrt.locking(fd, msvcrt.LK_UNLCK, _WINDOWS_LOCK_SIZE)
        return

    if fcntl is None:
        warnings.warn(
            "fcntl unavailable; cannot unlock file descriptor",
            RuntimeWarning,
            stacklevel=3,
        )
        return
    fcntl.flock(fd, fcntl.LOCK_UN)


class FileLockError(Exception):
    """Raised when file locking operations fail."""


class FileLockTimeout(FileLockError):
    """Raised when lock acquisition times out."""


class FileLock:
    """
    Cross-process file lock using platform-specific locking (fcntl.flock on Unix,
    msvcrt.locking on Windows).

    Supports both sync and async context managers for flexible usage.

    Args:
        filepath: Path to file to lock (lock file: sibling `*.lock`)
        timeout: Maximum seconds to wait for lock (default: 10.0)
        exclusive: Whether to use exclusive lock (default: True)
    """

    def __init__(
        self,
        filepath: str | Path,
        timeout: float = 10.0,
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

        try:
            # Open lock file
            self._fd = os.open(str(self._lock_file), os.O_CREAT | os.O_RDWR)

            # Try to acquire lock with timeout
            start_time = time.time()

            while True:
                try:
                    # Non-blocking lock attempt
                    _try_lock(self._fd, self.exclusive)
                    return  # Lock acquired
                except (BlockingIOError, OSError) as e:
                    # Lock held by another process
                    elapsed = time.time() - start_time
                    if elapsed >= self.timeout:
                        raise FileLockTimeout(
                            f"Failed to acquire lock on {self.filepath} within {self.timeout}s"
                        ) from e

                    # Wait a bit before retrying
                    time.sleep(0.01)
        except Exception:
            # Ensure file descriptor is always closed on any failure during acquisition
            if self._fd is not None:
                try:
                    os.close(self._fd)
                except Exception:
                    pass
                finally:
                    self._fd = None
            raise

    def _release_lock(self) -> None:
        """Release the file lock."""
        if self._fd is not None:
            try:
                _unlock(self._fd)
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
        await asyncio.get_running_loop().run_in_executor(None, self._acquire_lock)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await asyncio.get_running_loop().run_in_executor(None, self._release_lock)
        return False


@contextmanager
def atomic_write(filepath: str | Path, mode: str = "w"):
    """
    Atomic file write using temp file and rename.

    Writes to a temp file first, then atomically replaces target file
    using os.replace() which is atomic on POSIX systems.
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    # Create temp file in same directory for atomic rename
    fd, tmp_path = tempfile.mkstemp(
        dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
    )

    try:
        with os.fdopen(fd, mode) as f:
            yield f
        os.replace(tmp_path, filepath)
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise


@asynccontextmanager
async def locked_write(
    filepath: str | Path, timeout: float = 10.0, mode: str = "w"
) -> Any:
    """
    Async context manager combining file locking and atomic writes.

    Acquires exclusive lock, writes to temp file, atomically replaces target.
    """
    filepath = Path(filepath)

    lock = FileLock(filepath, timeout=timeout, exclusive=True)
    await lock.__aenter__()

    try:
        fd, tmp_path = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: tempfile.mkstemp(
                dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
            ),
        )

        try:
            f = os.fdopen(fd, mode)
            try:
                yield f
            finally:
                f.close()

            await asyncio.get_running_loop().run_in_executor(
                None, os.replace, tmp_path, filepath
            )
        except Exception:
            try:
                await asyncio.get_running_loop().run_in_executor(None, os.unlink, tmp_path)
            except Exception:
                pass
            raise
    finally:
        await lock.__aexit__(None, None, None)


@asynccontextmanager
async def locked_read(filepath: str | Path, timeout: float = 10.0) -> Any:
    """
    Async context manager for locked file reading.

    Acquires shared lock for reading (multiple concurrent readers allowed).
    """
    filepath = Path(filepath)
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    lock = FileLock(filepath, timeout=timeout, exclusive=False)
    await lock.__aenter__()

    try:
        with open(filepath) as f:
            yield f
    finally:
        await lock.__aexit__(None, None, None)


async def locked_json_write(
    filepath: str | Path, data: Any, timeout: float = 10.0, indent: int = 2
) -> None:
    """Write JSON with locking + atomicity."""
    async with locked_write(filepath, timeout=timeout) as f:
        json.dump(data, f, indent=indent)


async def locked_json_read(filepath: str | Path, timeout: float = 10.0) -> Any:
    """Read JSON with locking."""
    async with locked_read(filepath, timeout=timeout) as f:
        return json.load(f)


async def locked_json_update(
    filepath: str | Path,
    updater: Callable[[Any], Any],
    timeout: float = 10.0,
    indent: int = 2,
) -> Any:
    """
    Atomic read-modify-write update for JSON files.
    """
    filepath = Path(filepath)

    lock = FileLock(filepath, timeout=timeout, exclusive=True)
    await lock.__aenter__()

    try:
        def _read_json():
            if filepath.exists():
                with open(filepath) as f:
                    return json.load(f)
            return None

        data = await asyncio.get_running_loop().run_in_executor(None, _read_json)
        updated_data = updater(data)

        fd, tmp_path = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: tempfile.mkstemp(
                dir=filepath.parent, prefix=f".{filepath.name}.tmp.", suffix=""
            ),
        )

        try:
            with os.fdopen(fd, "w") as f:
                json.dump(updated_data, f, indent=indent)

            await asyncio.get_running_loop().run_in_executor(
                None, os.replace, tmp_path, filepath
            )
        except Exception:
            try:
                await asyncio.get_running_loop().run_in_executor(None, os.unlink, tmp_path)
            except Exception:
                pass
            raise

        return updated_data
    finally:
        await lock.__aexit__(None, None, None)


__all__ = [
    "FileLock",
    "FileLockError",
    "FileLockTimeout",
    "atomic_write",
    "locked_write",
    "locked_read",
    "locked_json_write",
    "locked_json_read",
    "locked_json_update",
]


