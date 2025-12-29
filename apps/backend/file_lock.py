"""
Cross-process File Lock
======================

Minimal, dependency-free file locking utility used to serialize access to
LadybugDB/Kuzu databases across multiple Python processes (e.g. Graphiti writes
and query_memory.py reads).

Uses:
- Unix: fcntl.flock()
- Windows: msvcrt.locking()
"""

from __future__ import annotations

import asyncio
import os
import time
import warnings
from pathlib import Path

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


class FileLockError(Exception):
    """Raised when file locking operations fail."""


class FileLockTimeout(FileLockError):
    """Raised when lock acquisition times out."""


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
            return
        msvcrt.locking(fd, msvcrt.LK_UNLCK, _WINDOWS_LOCK_SIZE)
        return

    if fcntl is None:
        return
    fcntl.flock(fd, fcntl.LOCK_UN)


class FileLock:
    """
    Cross-process file lock.

    Args:
        filepath: Path to the resource to lock (we create a sibling .lock file)
        timeout: Maximum seconds to wait for lock
        exclusive: Exclusive lock (default True)
    """

    def __init__(self, filepath: str | Path, timeout: float = 10.0, exclusive: bool = True):
        self.filepath = Path(filepath)
        self.timeout = timeout
        self.exclusive = exclusive
        self._lock_file: Path | None = None
        self._fd: int | None = None

    def _get_lock_file(self) -> Path:
        return self.filepath.parent / f"{self.filepath.name}.lock"

    def _acquire_lock(self) -> None:
        self._lock_file = self._get_lock_file()
        self._lock_file.parent.mkdir(parents=True, exist_ok=True)
        self._fd = os.open(str(self._lock_file), os.O_CREAT | os.O_RDWR)

        start = time.time()
        while True:
            try:
                _try_lock(self._fd, self.exclusive)
                return
            except (BlockingIOError, OSError):
                if time.time() - start >= self.timeout:
                    try:
                        os.close(self._fd)
                    except Exception:
                        pass
                    self._fd = None
                    raise FileLockTimeout(
                        f"Failed to acquire lock on {self.filepath} within {self.timeout}s"
                    )
                time.sleep(0.01)

    def _release_lock(self) -> None:
        if self._fd is not None:
            try:
                _unlock(self._fd)
                os.close(self._fd)
            except Exception:
                pass
            finally:
                self._fd = None

        # Best-effort cleanup of lock file
        if self._lock_file and self._lock_file.exists():
            try:
                self._lock_file.unlink()
            except Exception:
                pass

    def __enter__(self):
        self._acquire_lock()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._release_lock()
        return False

    async def __aenter__(self):
        await asyncio.get_running_loop().run_in_executor(None, self._acquire_lock)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await asyncio.get_running_loop().run_in_executor(None, self._release_lock)
        return False


