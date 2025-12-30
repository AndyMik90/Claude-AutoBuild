"""
Backward-Compatibility Re-Exports / Rückwärtskompatible Re-Exports
=================================================================

Die Implementierung wurde nach `apps/backend/file_lock.py` verschoben, um
Code-Duplikation zu vermeiden. Dieser Modulpfad bleibt bestehen, damit bestehende
Imports im GitHub Runner nicht brechen.

The implementation was moved to `apps/backend/file_lock.py` to avoid code
duplication. This module path remains in place so existing imports in the GitHub
Runner do not break.
"""

from __future__ import annotations

from ...file_lock import (  # noqa: F401
    FileLock,
    FileLockError,
    FileLockTimeout,
    atomic_write,
    locked_json_read,
    locked_json_update,
    locked_json_write,
    locked_read,
    locked_write,
)

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
