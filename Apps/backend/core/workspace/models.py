#!/usr/bin/env python3
"""
Workspace Models
================

Data classes and enums for workspace management.
"""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class WorkspaceMode(Enum):
    """How auto-claude should work."""

    ISOLATED = "isolated"  # Work in a separate worktree (safe)
    DIRECT = "direct"  # Work directly in user's project


class WorkspaceChoice(Enum):
    """User's choice after build completes."""

    MERGE = "merge"  # Add changes to project
    REVIEW = "review"  # Show what changed
    TEST = "test"  # Test the feature in the staging worktree
    LATER = "later"  # Decide later


@dataclass
class ParallelMergeTask:
    """A file merge task to be executed in parallel."""

    file_path: str
    main_content: str
    worktree_content: str
    base_content: str | None
    spec_name: str


@dataclass
class ParallelMergeResult:
    """Result of a parallel merge task."""

    file_path: str
    merged_content: str | None
    success: bool
    error: str | None = None
    was_auto_merged: bool = False  # True if git auto-merged without AI


class MergeLockError(Exception):
    """Raised when a merge lock cannot be acquired."""

    pass


class MergeLock:
    """
    Context manager for merge locking to prevent concurrent merges.

    Uses a lock file in .auto-claude/ to ensure only one merge operation
    runs at a time for a given project.
    """

    def __init__(self, project_dir: Path, spec_name: str):
        self.project_dir = project_dir
        self.spec_name = spec_name
        self.lock_dir = project_dir / ".auto-claude" / ".locks"
        self.lock_file = self.lock_dir / f"merge-{spec_name}.lock"
        self.acquired = False

    def __enter__(self):
        """Acquire the merge lock."""
        import os
        import time

        self.lock_dir.mkdir(parents=True, exist_ok=True)

        # Try to acquire lock with timeout
        max_wait = 30  # seconds
        start_time = time.time()

        while True:
            try:
                # Try to create lock file exclusively
                fd = os.open(
                    str(self.lock_file),
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                    0o644,
                )
                os.close(fd)

                # Write our PID to the lock file
                self.lock_file.write_text(str(os.getpid()))
                self.acquired = True
                return self

            except FileExistsError:
                # Lock file exists - check if process is still running
                if self.lock_file.exists():
                    try:
                        pid = int(self.lock_file.read_text().strip())
                        # Import locally to avoid circular dependency
                        import os as _os

                        try:
                            _os.kill(pid, 0)
                            is_running = True
                        except (OSError, ProcessLookupError):
                            is_running = False

                        if not is_running:
                            # Stale lock - remove it
                            self.lock_file.unlink()
                            continue
                    except (ValueError, ProcessLookupError):
                        # Invalid PID or can't check - remove stale lock
                        self.lock_file.unlink()
                        continue

                # Active lock - wait or timeout
                if time.time() - start_time >= max_wait:
                    raise MergeLockError(
                        f"Could not acquire merge lock for {self.spec_name} after {max_wait}s"
                    )

                time.sleep(0.5)

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Release the merge lock."""
        if self.acquired and self.lock_file.exists():
            try:
                self.lock_file.unlink()
            except Exception:
                pass  # Best effort cleanup
