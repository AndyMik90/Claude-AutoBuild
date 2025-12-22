"""
Baseline Capture Module
========================

Handles capturing baseline file states for task tracking:
- Discovering trackable files in git repository
- Capturing baseline snapshots when worktrees are created
- Managing baseline file extensions
"""

from __future__ import annotations

import logging
import subprocess
from datetime import datetime
from pathlib import Path

from ..types import FileEvolution, TaskSnapshot, compute_content_hash
from .storage import EvolutionStorage

# Import debug utilities
try:
    from debug import debug, debug_success
except ImportError:

    def debug(*args, **kwargs):
        pass

    def debug_success(*args, **kwargs):
        pass


logger = logging.getLogger(__name__)
MODULE = "merge.file_evolution.baseline_capture"


# Default extensions to track for baselines
DEFAULT_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".md",
    ".txt",
    ".html",
    ".css",
    ".scss",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".swift",
}


class BaselineCapture:
    """
    Manages baseline capture for file evolution tracking.

    Responsibilities:
    - Discover trackable files in git repository
    - Capture baseline states for tasks
    - Create initial task snapshots
    """

    def __init__(
        self,
        storage: EvolutionStorage,
        extensions: set[str] | None = None,
    ):
        """
        Initialize baseline capture.

        Args:
            storage: Storage manager for file operations
            extensions: File extensions to track (defaults to DEFAULT_EXTENSIONS)
        """
        self.storage = storage
        self.extensions = extensions or DEFAULT_EXTENSIONS

    def discover_trackable_files(self) -> list[Path]:
        """
        Discover files that should be tracked for baselines.

        Uses git ls-files to get tracked files, filtering by extension.

        Returns:
            List of absolute paths to trackable files
        """
        try:
            result = subprocess.run(
                ["git", "ls-files"],
                cwd=self.storage.project_dir,
                capture_output=True,
                text=True,
                check=True,
            )
            all_files = result.stdout.strip().split("\n")
            trackable = []

            for file_path in all_files:
                if not file_path:
                    continue
                path = Path(file_path)
                if path.suffix in self.extensions:
                    trackable.append(self.storage.project_dir / path)

            return trackable

        except subprocess.CalledProcessError:
            logger.warning("Failed to list git files, returning empty list")
            return []

    def get_current_commit(self) -> str:
        """
        Get the current git commit hash.

        Returns:
            Git commit SHA, or "unknown" if not available
        """
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=self.storage.project_dir,
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return "unknown"

    def capture_baselines(
        self,
        task_id: str,
        files: list[Path | str] | None,
        intent: str,
        evolutions: dict[str, FileEvolution],
    ) -> dict[str, FileEvolution]:
        """
        Capture baseline state of files for a task.

        Args:
            task_id: Unique identifier for the task
            files: List of files to capture (None = discover automatically)
            intent: Description of what the task intends to do
            evolutions: Current evolution data (will be updated)

        Returns:
            Dictionary mapping file paths to their FileEvolution objects
        """
        commit = self.get_current_commit()
        captured_at = datetime.now()
        captured: dict[str, FileEvolution] = {}

        # Discover files if not specified
        if files is None:
            files = self.discover_trackable_files()

        debug(MODULE, f"Capturing baselines for {len(files)} files", task_id=task_id)

        for file_path in files:
            rel_path = self.storage.get_relative_path(file_path)
            content = self.storage.read_file_content(file_path)

            if content is None:
                continue

            # Store baseline content
            baseline_path = self.storage.store_baseline_content(
                rel_path, content, task_id
            )
            content_hash = compute_content_hash(content)

            # Create or update evolution
            if rel_path in evolutions:
                evolution = evolutions[rel_path]
                logger.debug(f"Updating existing evolution for {rel_path}")
            else:
                evolution = FileEvolution(
                    file_path=rel_path,
                    baseline_commit=commit,
                    baseline_captured_at=captured_at,
                    baseline_content_hash=content_hash,
                    baseline_snapshot_path=baseline_path,
                )
                evolutions[rel_path] = evolution
                logger.debug(f"Created new evolution for {rel_path}")

            # Create task snapshot
            snapshot = TaskSnapshot(
                task_id=task_id,
                task_intent=intent,
                started_at=captured_at,
                content_hash_before=content_hash,
            )
            evolution.add_task_snapshot(snapshot)
            captured[rel_path] = evolution

        debug_success(
            MODULE, f"Captured baselines for {len(captured)} files", task_id=task_id
        )
        return captured
