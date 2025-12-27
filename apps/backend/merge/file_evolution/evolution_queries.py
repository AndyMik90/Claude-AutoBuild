"""
Evolution Queries Module
=========================

Provides query and analysis methods for file evolution data:
- Retrieving evolution history for files
- Finding files modified by tasks
- Detecting conflicting modifications
- Generating summaries and statistics
- Exporting data for merge operations
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from ..types import FileEvolution, TaskSnapshot
from .storage import EvolutionStorage

logger = logging.getLogger(__name__)


class EvolutionQueries:
    """
    Provides query and analysis methods for evolution data.

    Responsibilities:
    - Query file evolution history
    - Find task modifications
    - Detect conflicts
    - Generate summaries
    - Export data for merging
    """

    def __init__(self, storage: EvolutionStorage):
        """
        Initialize evolution queries.

        Args:
            storage: Storage manager for file operations
        """
        self.storage = storage

    def get_file_evolution(
        self,
        file_path: Path | str,
        evolutions: dict[str, FileEvolution],
    ) -> FileEvolution | None:
        """
        Get the complete evolution history for a file.

        Args:
            file_path: Path to the file
            evolutions: Current evolution data

        Returns:
            FileEvolution object, or None if not tracked
        """
        rel_path = self.storage.get_relative_path(file_path)
        return evolutions.get(rel_path)

    def get_baseline_content(
        self,
        file_path: Path | str,
        evolutions: dict[str, FileEvolution],
    ) -> str | None:
        """
        Get the baseline content for a file.

        Args:
            file_path: Path to the file
            evolutions: Current evolution data

        Returns:
            Original baseline content, or None if not available
        """
        rel_path = self.storage.get_relative_path(file_path)
        evolution = evolutions.get(rel_path)

        if not evolution:
            return None

        return self.storage.read_baseline_content(evolution.baseline_snapshot_path)

    def get_task_modifications(
        self,
        task_id: str,
        evolutions: dict[str, FileEvolution],
    ) -> list[tuple[str, TaskSnapshot]]:
        """
        Get all file modifications made by a specific task.

        Args:
            task_id: The task identifier
            evolutions: Current evolution data

        Returns:
            List of (file_path, TaskSnapshot) tuples
        """
        modifications = []
        for file_path, evolution in evolutions.items():
            snapshot = evolution.get_task_snapshot(task_id)
            if snapshot and snapshot.semantic_changes:
                modifications.append((file_path, snapshot))
        return modifications

    def get_files_modified_by_tasks(
        self,
        task_ids: list[str],
        evolutions: dict[str, FileEvolution],
    ) -> dict[str, list[str]]:
        """
        Get files modified by specified tasks.

        Args:
            task_ids: List of task identifiers
            evolutions: Current evolution data

        Returns:
            Dictionary mapping file paths to list of task IDs that modified them
        """
        file_tasks: dict[str, list[str]] = {}

        for file_path, evolution in evolutions.items():
            for snapshot in evolution.task_snapshots:
                if snapshot.task_id in task_ids and snapshot.semantic_changes:
                    if file_path not in file_tasks:
                        file_tasks[file_path] = []
                    file_tasks[file_path].append(snapshot.task_id)

        return file_tasks

    def get_conflicting_files(
        self,
        task_ids: list[str],
        evolutions: dict[str, FileEvolution],
    ) -> list[str]:
        """
        Get files modified by multiple tasks (potential conflicts).

        Args:
            task_ids: List of task identifiers to check
            evolutions: Current evolution data

        Returns:
            List of file paths modified by 2+ tasks
        """
        file_tasks = self.get_files_modified_by_tasks(task_ids, evolutions)
        return [file_path for file_path, tasks in file_tasks.items() if len(tasks) > 1]

    def get_active_tasks(
        self,
        evolutions: dict[str, FileEvolution],
    ) -> set[str]:
        """
        Get set of task IDs with active (non-completed) modifications.

        Args:
            evolutions: Current evolution data

        Returns:
            Set of task IDs
        """
        active = set()
        for evolution in evolutions.values():
            for snapshot in evolution.task_snapshots:
                if snapshot.completed_at is None:
                    active.add(snapshot.task_id)
        return active

    def get_evolution_summary(
        self,
        evolutions: dict[str, FileEvolution],
    ) -> dict:
        """
        Get a summary of tracked file evolutions.

        Args:
            evolutions: Current evolution data

        Returns:
            Dictionary with summary statistics
        """
        total_files = len(evolutions)
        all_tasks = set()
        files_with_multiple_tasks = 0
        total_changes = 0

        for evolution in evolutions.values():
            task_ids = [ts.task_id for ts in evolution.task_snapshots]
            all_tasks.update(task_ids)
            if len(task_ids) > 1:
                files_with_multiple_tasks += 1
            for snapshot in evolution.task_snapshots:
                total_changes += len(snapshot.semantic_changes)

        return {
            "total_files_tracked": total_files,
            "total_tasks": len(all_tasks),
            "files_with_potential_conflicts": files_with_multiple_tasks,
            "total_semantic_changes": total_changes,
            "active_tasks": len(self.get_active_tasks(evolutions)),
        }

    def export_for_merge(
        self,
        file_path: Path | str,
        evolutions: dict[str, FileEvolution],
        task_ids: list[str] | None = None,
    ) -> dict | None:
        """
        Export evolution data for a file in a format suitable for merge.

        This provides the data needed by the merge system to understand
        what each task did and in what order.

        Args:
            file_path: Path to the file
            evolutions: Current evolution data
            task_ids: Optional list of tasks to include (default: all)

        Returns:
            Dictionary with merge-relevant evolution data
        """
        rel_path = self.storage.get_relative_path(file_path)
        evolution = evolutions.get(rel_path)

        if not evolution:
            return None

        baseline_content = self.get_baseline_content(file_path, evolutions)

        # Filter snapshots if task_ids specified
        snapshots = evolution.task_snapshots
        if task_ids:
            snapshots = [ts for ts in snapshots if ts.task_id in task_ids]

        return {
            "file_path": rel_path,
            "baseline_content": baseline_content,
            "baseline_commit": evolution.baseline_commit,
            "baseline_hash": evolution.baseline_content_hash,
            "tasks": [
                {
                    "task_id": ts.task_id,
                    "intent": ts.task_intent,
                    "started_at": ts.started_at.isoformat(),
                    "completed_at": ts.completed_at.isoformat()
                    if ts.completed_at
                    else None,
                    "changes": [c.to_dict() for c in ts.semantic_changes],
                    "hash_before": ts.content_hash_before,
                    "hash_after": ts.content_hash_after,
                }
                for ts in snapshots
            ],
        }

    def cleanup_task(
        self,
        task_id: str,
        evolutions: dict[str, FileEvolution],
        remove_baselines: bool = True,
    ) -> dict[str, FileEvolution]:
        """
        Clean up data for a completed/cancelled task.

        Args:
            task_id: The task identifier
            evolutions: Current evolution data (will be updated)
            remove_baselines: Whether to remove stored baseline files

        Returns:
            Updated evolutions dictionary
        """
        # Remove task snapshots from evolutions
        for evolution in evolutions.values():
            evolution.task_snapshots = [
                ts for ts in evolution.task_snapshots if ts.task_id != task_id
            ]

        # Remove baseline directory if requested
        if remove_baselines:
            baseline_dir = self.storage.baselines_dir / task_id
            if baseline_dir.exists():
                shutil.rmtree(baseline_dir)
                logger.debug(f"Removed baseline directory for task {task_id}")

        # Clean up empty evolutions
        evolutions = {
            file_path: evolution
            for file_path, evolution in evolutions.items()
            if evolution.task_snapshots
        }

        logger.info(f"Cleaned up data for task {task_id}")
        return evolutions
