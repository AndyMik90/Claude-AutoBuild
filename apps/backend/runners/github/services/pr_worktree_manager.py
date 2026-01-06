"""
PR Worktree Manager
===================

Manages lifecycle of PR review worktrees with cleanup policies.

Features:
- Age-based cleanup (remove worktrees older than N days)
- Count-based cleanup (keep only N most recent worktrees)
- Orphaned worktree cleanup (worktrees not registered with git)
- Automatic cleanup on review completion
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import NamedTuple

logger = logging.getLogger(__name__)

# Check if debug mode is enabled
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("true", "1", "yes")

# Cleanup policies (configurable via environment variables)
MAX_PR_WORKTREES = int(
    os.environ.get("MAX_PR_WORKTREES", "10")
)  # Max worktrees to keep
PR_WORKTREE_MAX_AGE_DAYS = int(
    os.environ.get("PR_WORKTREE_MAX_AGE_DAYS", "7")
)  # Max age in days


class WorktreeInfo(NamedTuple):
    """Information about a PR worktree."""

    path: Path
    age_days: float
    pr_number: int | None = None


class PRWorktreeManager:
    """
    Manages PR review worktrees with automatic cleanup policies.

    Cleanup policies:
    1. Remove worktrees older than PR_WORKTREE_MAX_AGE_DAYS (default: 7 days)
    2. Keep only MAX_PR_WORKTREES most recent worktrees (default: 10)
    3. Remove orphaned worktrees (not registered with git)
    """

    def __init__(self, project_dir: Path, worktree_dir: str | Path):
        """
        Initialize the worktree manager.

        Args:
            project_dir: Root directory of the git project
            worktree_dir: Directory where PR worktrees are stored (relative to project_dir)
        """
        self.project_dir = Path(project_dir)
        self.worktree_base_dir = self.project_dir / worktree_dir

    def create_worktree(self, head_sha: str, pr_number: int) -> Path:
        """
        Create a PR worktree with automatic cleanup of old worktrees.

        Args:
            head_sha: Git commit SHA to checkout
            pr_number: PR number for naming

        Returns:
            Path to the created worktree

        Raises:
            RuntimeError: If worktree creation fails
        """
        # Run cleanup before creating new worktree
        self.cleanup_worktrees()

        # Generate worktree name
        sha_short = head_sha[:8]
        worktree_name = f"pr-{pr_number}-{sha_short}"

        # Create worktree directory
        self.worktree_base_dir.mkdir(parents=True, exist_ok=True)
        worktree_path = self.worktree_base_dir / worktree_name

        if DEBUG_MODE:
            print(f"[WorktreeManager] Creating worktree: {worktree_path}", flush=True)

        # Fetch the commit if not available locally (handles fork PRs)
        fetch_result = subprocess.run(
            ["git", "fetch", "origin", head_sha],
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if fetch_result.returncode != 0:
            logger.warning(
                f"Could not fetch {head_sha} from origin (fork PR?): {fetch_result.stderr}"
            )

        # Create detached worktree at the PR commit
        result = subprocess.run(
            ["git", "worktree", "add", "--detach", str(worktree_path), head_sha],
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Failed to create worktree: {result.stderr}")

        logger.info(f"[WorktreeManager] Created worktree at {worktree_path}")
        return worktree_path

    def remove_worktree(self, worktree_path: Path) -> None:
        """
        Remove a PR worktree with fallback chain.

        Args:
            worktree_path: Path to the worktree to remove
        """
        if not worktree_path or not worktree_path.exists():
            return

        if DEBUG_MODE:
            print(f"[WorktreeManager] Removing worktree: {worktree_path}", flush=True)

        # Try 1: git worktree remove
        result = subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode == 0:
            logger.info(f"[WorktreeManager] Removed worktree: {worktree_path.name}")
            return

        # Try 2: shutil.rmtree fallback
        try:
            shutil.rmtree(worktree_path, ignore_errors=True)
            subprocess.run(
                ["git", "worktree", "prune"],
                cwd=self.project_dir,
                capture_output=True,
                timeout=30,
            )
            logger.warning(
                f"[WorktreeManager] Used shutil fallback for: {worktree_path.name}"
            )
        except Exception as e:
            logger.error(
                f"[WorktreeManager] Failed to remove worktree {worktree_path}: {e}"
            )

    def get_worktree_info(self) -> list[WorktreeInfo]:
        """
        Get information about all PR worktrees.

        Returns:
            List of WorktreeInfo objects sorted by age (oldest first)
        """
        if not self.worktree_base_dir.exists():
            return []

        worktrees = []
        current_time = time.time()

        for item in self.worktree_base_dir.iterdir():
            if not item.is_dir():
                continue

            # Get modification time
            mtime = item.stat().st_mtime
            age_seconds = current_time - mtime
            age_days = age_seconds / 86400  # Convert seconds to days

            # Extract PR number from directory name (format: pr-XXX-sha)
            pr_number = None
            if item.name.startswith("pr-"):
                parts = item.name.split("-")
                if len(parts) >= 2:
                    try:
                        pr_number = int(parts[1])
                    except ValueError:
                        pass

            worktrees.append(
                WorktreeInfo(path=item, age_days=age_days, pr_number=pr_number)
            )

        # Sort by age (oldest first)
        worktrees.sort(key=lambda x: x.age_days, reverse=True)

        return worktrees

    def get_registered_worktrees(self) -> set[Path]:
        """
        Get set of worktrees registered with git.

        Returns:
            Set of Path objects for registered worktrees
        """
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )

        registered = set()
        for line in result.stdout.split("\n"):
            if line.startswith("worktree "):
                parts = line.split(" ", 1)
                if len(parts) > 1 and parts[1]:
                    registered.add(Path(parts[1]))

        return registered

    def cleanup_worktrees(self, force: bool = False) -> dict[str, int]:
        """
        Clean up PR worktrees based on age and count policies.

        Cleanup order:
        1. Remove orphaned worktrees (not registered with git)
        2. Remove worktrees older than PR_WORKTREE_MAX_AGE_DAYS
        3. If still over MAX_PR_WORKTREES, remove oldest worktrees

        Args:
            force: If True, skip age check and only enforce count limit

        Returns:
            Dict with cleanup statistics: {
                'orphaned': count,
                'expired': count,
                'excess': count,
                'total': count
            }
        """
        stats = {"orphaned": 0, "expired": 0, "excess": 0, "total": 0}

        if not self.worktree_base_dir.exists():
            return stats

        # Get registered worktrees
        registered = self.get_registered_worktrees()

        # Get all PR worktree info
        worktrees = self.get_worktree_info()

        # Phase 1: Remove orphaned worktrees
        for wt in worktrees:
            if wt.path not in registered:
                logger.info(
                    f"[WorktreeManager] Removing orphaned worktree: {wt.path.name} (age: {wt.age_days:.1f} days)"
                )
                shutil.rmtree(wt.path, ignore_errors=True)
                stats["orphaned"] += 1

        # Refresh worktree list after orphan cleanup
        subprocess.run(
            ["git", "worktree", "prune"],
            cwd=self.project_dir,
            capture_output=True,
            timeout=30,
        )

        # Get fresh worktree info for remaining worktrees
        worktrees = [wt for wt in self.get_worktree_info() if wt.path in registered]

        # Phase 2: Remove expired worktrees (older than max age)
        if not force:
            for wt in worktrees:
                if wt.age_days > PR_WORKTREE_MAX_AGE_DAYS:
                    logger.info(
                        f"[WorktreeManager] Removing expired worktree: {wt.path.name} (age: {wt.age_days:.1f} days, max: {PR_WORKTREE_MAX_AGE_DAYS} days)"
                    )
                    self.remove_worktree(wt.path)
                    stats["expired"] += 1

        # Refresh worktree list after expiration cleanup
        worktrees = [
            wt
            for wt in self.get_worktree_info()
            if wt.path in self.get_registered_worktrees()
        ]

        # Phase 3: Remove excess worktrees (keep only MAX_PR_WORKTREES most recent)
        if len(worktrees) > MAX_PR_WORKTREES:
            # worktrees are already sorted by age (oldest first)
            excess_count = len(worktrees) - MAX_PR_WORKTREES
            for wt in worktrees[:excess_count]:
                logger.info(
                    f"[WorktreeManager] Removing excess worktree: {wt.path.name} (count: {len(worktrees)}, max: {MAX_PR_WORKTREES})"
                )
                self.remove_worktree(wt.path)
                stats["excess"] += 1

        stats["total"] = stats["orphaned"] + stats["expired"] + stats["excess"]

        if stats["total"] > 0:
            logger.info(
                f"[WorktreeManager] Cleanup complete: {stats['total']} worktrees removed "
                f"(orphaned={stats['orphaned']}, expired={stats['expired']}, excess={stats['excess']})"
            )
        elif DEBUG_MODE:
            print(
                f"[WorktreeManager] No cleanup needed (current: {len(worktrees)}, max: {MAX_PR_WORKTREES})",
                flush=True,
            )

        return stats

    def cleanup_all_worktrees(self) -> int:
        """
        Remove ALL PR worktrees (for testing or emergency cleanup).

        Returns:
            Number of worktrees removed
        """
        if not self.worktree_base_dir.exists():
            return 0

        worktrees = self.get_worktree_info()
        count = 0

        for wt in worktrees:
            logger.info(f"[WorktreeManager] Removing worktree: {wt.path.name}")
            self.remove_worktree(wt.path)
            count += 1

        if count > 0:
            subprocess.run(
                ["git", "worktree", "prune"],
                cwd=self.project_dir,
                capture_output=True,
                timeout=30,
            )
            logger.info(f"[WorktreeManager] Removed all {count} PR worktrees")

        return count
