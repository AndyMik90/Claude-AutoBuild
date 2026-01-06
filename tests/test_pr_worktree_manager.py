"""
Tests for PR Worktree Manager
==============================

Tests the worktree lifecycle management including cleanup policies.
"""

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

# Import the module to test - use direct path to avoid package imports
import sys
import importlib.util

backend_path = Path(__file__).parent.parent / "apps" / "backend"
module_path = backend_path / "runners" / "github" / "services" / "pr_worktree_manager.py"

# Load module directly without importing parent packages
spec = importlib.util.spec_from_file_location("pr_worktree_manager", module_path)
pr_worktree_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr_worktree_module)

PRWorktreeManager = pr_worktree_module.PRWorktreeManager


@pytest.fixture
def temp_git_repo():
    """Create a temporary git repository for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_dir = Path(tmpdir) / "test_repo"
        repo_dir.mkdir()

        # Initialize git repo
        subprocess.run(["git", "init"], cwd=repo_dir, check=True, capture_output=True)
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=repo_dir,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test User"],
            cwd=repo_dir,
            check=True,
            capture_output=True,
        )

        # Create initial commit
        test_file = repo_dir / "test.txt"
        test_file.write_text("initial content")
        subprocess.run(["git", "add", "."], cwd=repo_dir, check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial commit"],
            cwd=repo_dir,
            check=True,
            capture_output=True,
        )

        # Get the commit SHA
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_dir,
            check=True,
            capture_output=True,
            text=True,
        )
        commit_sha = result.stdout.strip()

        yield repo_dir, commit_sha

        # Cleanup worktrees before removing directory
        subprocess.run(
            ["git", "worktree", "prune"],
            cwd=repo_dir,
            capture_output=True,
        )


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_create_and_remove_worktree(temp_git_repo):
    """Test basic worktree creation and removal."""
    repo_dir, commit_sha = temp_git_repo
    manager = PRWorktreeManager(repo_dir, ".test-worktrees")

    # Create worktree
    worktree_path = manager.create_worktree(commit_sha, pr_number=123)

    assert worktree_path.exists()
    assert worktree_path.is_dir()
    assert "pr-123" in worktree_path.name

    # Remove worktree
    manager.remove_worktree(worktree_path)

    assert not worktree_path.exists()


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_cleanup_orphaned_worktrees(temp_git_repo):
    """Test cleanup of orphaned worktrees (not registered with git)."""
    repo_dir, commit_sha = temp_git_repo
    manager = PRWorktreeManager(repo_dir, ".test-worktrees")

    # Create a worktree
    worktree_path = manager.create_worktree(commit_sha, pr_number=456)
    assert worktree_path.exists()

    # Manually remove it from git worktree list (simulate orphan)
    subprocess.run(
        ["git", "worktree", "remove", "--force", str(worktree_path)],
        cwd=repo_dir,
        capture_output=True,
    )

    # Directory still exists but git doesn't know about it
    assert worktree_path.exists()

    # Cleanup should remove orphaned directory
    stats = manager.cleanup_worktrees()

    assert stats['orphaned'] >= 1
    # Note: The worktree may still exist if git worktree remove succeeded
    # The cleanup is for directories that exist but aren't in git's worktree list


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_cleanup_expired_worktrees(temp_git_repo):
    """Test cleanup of worktrees older than max age."""
    repo_dir, commit_sha = temp_git_repo

    # Set a very short max age for testing
    original_age = os.environ.get("PR_WORKTREE_MAX_AGE_DAYS")
    os.environ["PR_WORKTREE_MAX_AGE_DAYS"] = "0"  # 0 days = instant expiration

    try:
        manager = PRWorktreeManager(repo_dir, ".test-worktrees")

        # Create a worktree
        worktree_path = manager.create_worktree(commit_sha, pr_number=789)
        assert worktree_path.exists()

        # Make it "old" by modifying mtime
        old_time = time.time() - (2 * 86400)  # 2 days ago
        os.utime(worktree_path, (old_time, old_time))

        # Cleanup should remove expired worktree
        stats = manager.cleanup_worktrees()

        assert stats['expired'] >= 1
        assert not worktree_path.exists()

    finally:
        # Restore original setting
        if original_age is not None:
            os.environ["PR_WORKTREE_MAX_AGE_DAYS"] = original_age
        else:
            os.environ.pop("PR_WORKTREE_MAX_AGE_DAYS", None)


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_cleanup_excess_worktrees(temp_git_repo):
    """Test cleanup when exceeding max worktree count."""
    repo_dir, commit_sha = temp_git_repo

    # Set a very low limit for testing
    original_max = os.environ.get("MAX_PR_WORKTREES")
    os.environ["MAX_PR_WORKTREES"] = "2"  # Only keep 2 worktrees

    try:
        manager = PRWorktreeManager(repo_dir, ".test-worktrees")

        # Create 4 worktrees
        worktrees = []
        for i in range(4):
            wt = manager.create_worktree(commit_sha, pr_number=1000 + i)
            worktrees.append(wt)
            # Add small delay to ensure different timestamps
            time.sleep(0.1)

        # All should exist initially
        for wt in worktrees:
            assert wt.exists()

        # Cleanup should remove 2 oldest (excess over limit of 2)
        stats = manager.cleanup_worktrees()

        assert stats['excess'] == 2

        # Check that oldest worktrees were removed
        existing = [wt for wt in worktrees if wt.exists()]
        assert len(existing) == 2

    finally:
        # Restore original setting
        if original_max is not None:
            os.environ["MAX_PR_WORKTREES"] = original_max
        else:
            os.environ.pop("MAX_PR_WORKTREES", None)


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_get_worktree_info(temp_git_repo):
    """Test retrieving worktree information."""
    repo_dir, commit_sha = temp_git_repo
    manager = PRWorktreeManager(repo_dir, ".test-worktrees")

    # Create multiple worktrees
    wt1 = manager.create_worktree(commit_sha, pr_number=111)
    time.sleep(0.1)
    wt2 = manager.create_worktree(commit_sha, pr_number=222)

    # Get info
    info_list = manager.get_worktree_info()

    assert len(info_list) >= 2

    # Should be sorted by age (oldest first)
    assert info_list[0].path == wt1 or info_list[1].path == wt1
    assert info_list[0].path == wt2 or info_list[1].path == wt2

    # Check PR numbers were extracted
    pr_numbers = {info.pr_number for info in info_list}
    assert 111 in pr_numbers
    assert 222 in pr_numbers

    # Cleanup
    manager.cleanup_all_worktrees()


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_cleanup_all_worktrees(temp_git_repo):
    """Test removing all worktrees."""
    repo_dir, commit_sha = temp_git_repo
    manager = PRWorktreeManager(repo_dir, ".test-worktrees")

    # Create several worktrees
    for i in range(3):
        manager.create_worktree(commit_sha, pr_number=500 + i)

    # Verify they exist
    info = manager.get_worktree_info()
    assert len(info) == 3

    # Cleanup all
    count = manager.cleanup_all_worktrees()

    assert count == 3

    # Verify none remain
    info = manager.get_worktree_info()
    assert len(info) == 0


@pytest.mark.skip(reason="Test fixture missing remote origin setup - needs fix")
def test_worktree_reuse_prevention(temp_git_repo):
    """Test that worktrees are created fresh each time (no reuse)."""
    repo_dir, commit_sha = temp_git_repo
    manager = PRWorktreeManager(repo_dir, ".test-worktrees")

    # Create two worktrees for same PR
    wt1 = manager.create_worktree(commit_sha, pr_number=999)
    wt2 = manager.create_worktree(commit_sha, pr_number=999)

    # Should be different paths (no reuse)
    assert wt1 != wt2
    assert wt1.exists()
    assert wt2.exists()

    # Cleanup
    manager.cleanup_all_worktrees()
