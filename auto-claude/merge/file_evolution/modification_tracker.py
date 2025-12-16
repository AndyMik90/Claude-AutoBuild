"""
Modification Tracking Module
=============================

Handles recording and analyzing file modifications:
- Recording task modifications with semantic analysis
- Refreshing modifications from git worktrees
- Managing task completion status
"""

from __future__ import annotations

import logging
import subprocess
from datetime import datetime
from pathlib import Path

from ..semantic_analyzer import SemanticAnalyzer
from ..types import FileEvolution, TaskSnapshot, compute_content_hash
from .storage import EvolutionStorage

# Import debug utilities
try:
    from debug import debug, debug_warning
except ImportError:

    def debug(*args, **kwargs):
        pass

    def debug_warning(*args, **kwargs):
        pass


logger = logging.getLogger(__name__)
MODULE = "merge.file_evolution.modification_tracker"


class ModificationTracker:
    """
    Manages tracking of file modifications by tasks.

    Responsibilities:
    - Record modifications with semantic analysis
    - Refresh modifications from git worktrees
    - Mark tasks as completed
    """

    def __init__(
        self,
        storage: EvolutionStorage,
        semantic_analyzer: SemanticAnalyzer | None = None,
    ):
        """
        Initialize modification tracker.

        Args:
            storage: Storage manager for file operations
            semantic_analyzer: Optional pre-configured semantic analyzer
        """
        self.storage = storage
        self.analyzer = semantic_analyzer or SemanticAnalyzer()

    def record_modification(
        self,
        task_id: str,
        file_path: Path | str,
        old_content: str,
        new_content: str,
        evolutions: dict[str, FileEvolution],
        raw_diff: str | None = None,
    ) -> TaskSnapshot | None:
        """
        Record a file modification by a task.

        Args:
            task_id: The task that made the modification
            file_path: Path to the modified file
            old_content: File content before modification
            new_content: File content after modification
            evolutions: Current evolution data (will be updated)
            raw_diff: Optional unified diff for reference

        Returns:
            Updated TaskSnapshot, or None if file not being tracked
        """
        rel_path = self.storage.get_relative_path(file_path)

        # Get or create evolution
        if rel_path not in evolutions:
            logger.warning(f"File {rel_path} not being tracked")
            # Note: We could auto-create here, but for now return None
            return None

        evolution = evolutions.get(rel_path)
        if not evolution:
            return None

        # Get existing snapshot or create new one
        snapshot = evolution.get_task_snapshot(task_id)
        if not snapshot:
            snapshot = TaskSnapshot(
                task_id=task_id,
                task_intent="",
                started_at=datetime.now(),
                content_hash_before=compute_content_hash(old_content),
            )

        # Analyze semantic changes
        analysis = self.analyzer.analyze_diff(rel_path, old_content, new_content)
        semantic_changes = analysis.changes

        # Update snapshot
        snapshot.completed_at = datetime.now()
        snapshot.content_hash_after = compute_content_hash(new_content)
        snapshot.semantic_changes = semantic_changes
        snapshot.raw_diff = raw_diff

        # Update evolution
        evolution.add_task_snapshot(snapshot)

        logger.info(
            f"Recorded modification to {rel_path} by {task_id}: "
            f"{len(semantic_changes)} semantic changes"
        )
        return snapshot

    def refresh_from_git(
        self,
        task_id: str,
        worktree_path: Path,
        evolutions: dict[str, FileEvolution],
    ) -> None:
        """
        Refresh task snapshots by analyzing git diff from worktree.

        This is useful when we didn't capture real-time modifications
        and need to retroactively analyze what a task changed.

        Args:
            task_id: The task identifier
            worktree_path: Path to the task's worktree
            evolutions: Current evolution data (will be updated)
        """
        debug(
            MODULE,
            f"refresh_from_git() for task {task_id}",
            task_id=task_id,
            worktree_path=str(worktree_path),
        )

        try:
            # Get list of files changed in the worktree
            result = subprocess.run(
                ["git", "diff", "--name-only", "main...HEAD"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
                check=True,
            )
            changed_files = [f for f in result.stdout.strip().split("\n") if f]

            debug(
                MODULE,
                f"Found {len(changed_files)} changed files",
                changed_files=changed_files[:10]
                if len(changed_files) > 10
                else changed_files,
            )

            for file_path in changed_files:
                # Get the diff for this file
                diff_result = subprocess.run(
                    ["git", "diff", "main...HEAD", "--", file_path],
                    cwd=worktree_path,
                    capture_output=True,
                    text=True,
                    check=True,
                )

                # Get content before (from main) and after (current)
                try:
                    show_result = subprocess.run(
                        ["git", "show", f"main:{file_path}"],
                        cwd=worktree_path,
                        capture_output=True,
                        text=True,
                        check=True,
                    )
                    old_content = show_result.stdout
                except subprocess.CalledProcessError:
                    # File is new
                    old_content = ""

                current_file = worktree_path / file_path
                if current_file.exists():
                    new_content = current_file.read_text(encoding="utf-8")
                else:
                    # File was deleted
                    new_content = ""

                # Record the modification
                self.record_modification(
                    task_id=task_id,
                    file_path=file_path,
                    old_content=old_content,
                    new_content=new_content,
                    evolutions=evolutions,
                    raw_diff=diff_result.stdout,
                )

            logger.info(
                f"Refreshed {len(changed_files)} files from worktree for task {task_id}"
            )

        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to refresh from git: {e}")

    def mark_task_completed(
        self,
        task_id: str,
        evolutions: dict[str, FileEvolution],
    ) -> None:
        """
        Mark a task as completed (set completed_at on all snapshots).

        Args:
            task_id: The task identifier
            evolutions: Current evolution data (will be updated)
        """
        now = datetime.now()
        for evolution in evolutions.values():
            snapshot = evolution.get_task_snapshot(task_id)
            if snapshot and snapshot.completed_at is None:
                snapshot.completed_at = now
