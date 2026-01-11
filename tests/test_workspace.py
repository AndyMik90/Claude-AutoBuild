#!/usr/bin/env python3
"""
Tests for Workspace Selection and Management
=============================================

Tests the workspace.py module functionality including:
- Workspace mode selection (isolated vs direct)
- Uncommitted changes detection
- Workspace setup
- Build finalization workflows
"""

import subprocess
import pytest
from pathlib import Path

from workspace import (
    WorkspaceMode,
    WorkspaceChoice,
    has_uncommitted_changes,
    get_current_branch,
    get_existing_build_worktree,
    setup_workspace,
)
from worktree import WorktreeManager

# Test constant - in the new per-spec architecture, each spec has its own worktree
# named after the spec itself. This constant is used for test assertions.
TEST_SPEC_NAME = "test-spec"


class TestWorkspaceMode:
    """Tests for WorkspaceMode enum."""

    def test_isolated_mode(self):
        """ISOLATED mode value is correct."""
        assert WorkspaceMode.ISOLATED.value == "isolated"

    def test_direct_mode(self):
        """DIRECT mode value is correct."""
        assert WorkspaceMode.DIRECT.value == "direct"


class TestWorkspaceChoice:
    """Tests for WorkspaceChoice enum."""

    def test_merge_choice(self):
        """MERGE choice value is correct."""
        assert WorkspaceChoice.MERGE.value == "merge"

    def test_review_choice(self):
        """REVIEW choice value is correct."""
        assert WorkspaceChoice.REVIEW.value == "review"

    def test_test_choice(self):
        """TEST choice value is correct."""
        assert WorkspaceChoice.TEST.value == "test"

    def test_later_choice(self):
        """LATER choice value is correct."""
        assert WorkspaceChoice.LATER.value == "later"


class TestHasUncommittedChanges:
    """Tests for uncommitted changes detection."""

    def test_clean_repo_no_changes(self, temp_git_repo: Path):
        """Clean repo returns False."""
        result = has_uncommitted_changes(temp_git_repo)
        assert result is False

    def test_untracked_file_has_changes(self, temp_git_repo: Path):
        """Untracked file counts as changes."""
        (temp_git_repo / "new_file.txt").write_text("content")

        result = has_uncommitted_changes(temp_git_repo)
        assert result is True

    def test_modified_file_has_changes(self, temp_git_repo: Path):
        """Modified tracked file counts as changes."""
        (temp_git_repo / "README.md").write_text("modified content")

        result = has_uncommitted_changes(temp_git_repo)
        assert result is True

    def test_staged_file_has_changes(self, temp_git_repo: Path):
        """Staged file counts as changes."""
        (temp_git_repo / "README.md").write_text("modified")
        subprocess.run(["git", "add", "README.md"], cwd=temp_git_repo, capture_output=True)

        result = has_uncommitted_changes(temp_git_repo)
        assert result is True


class TestGetCurrentBranch:
    """Tests for current branch detection."""

    def test_gets_main_branch(self, temp_git_repo: Path):
        """Gets the main/master branch."""
        branch = get_current_branch(temp_git_repo)

        # Could be main or master depending on git config
        assert branch in ["main", "master"]

    def test_gets_feature_branch(self, temp_git_repo: Path):
        """Gets feature branch name."""
        subprocess.run(
            ["git", "checkout", "-b", "feature/test-branch"],
            cwd=temp_git_repo, capture_output=True
        )

        branch = get_current_branch(temp_git_repo)
        assert branch == "feature/test-branch"


class TestGetExistingBuildWorktree:
    """Tests for existing build worktree detection."""

    def test_no_existing_worktree(self, temp_git_repo: Path):
        """Returns None when no worktree exists."""
        result = get_existing_build_worktree(temp_git_repo, "test-spec")
        assert result is None

    def test_existing_worktree(self, temp_git_repo: Path):
        """Returns path when worktree exists."""
        # Create the worktree directory structure (per-spec architecture)
        worktree_path = temp_git_repo / ".worktrees" / TEST_SPEC_NAME
        worktree_path.mkdir(parents=True)

        result = get_existing_build_worktree(temp_git_repo, TEST_SPEC_NAME)
        assert result == worktree_path


class TestSetupWorkspace:
    """Tests for workspace setup."""

    def test_setup_direct_mode(self, temp_git_repo: Path):
        """Direct mode returns project dir and no manager."""
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.DIRECT,
        )

        assert working_dir == temp_git_repo
        assert manager is None

    def test_setup_isolated_mode(self, temp_git_repo: Path):
        """Isolated mode creates worktree and returns manager."""
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            TEST_SPEC_NAME,
            WorkspaceMode.ISOLATED,
        )

        assert working_dir != temp_git_repo
        assert manager is not None
        assert working_dir.exists()
        # Per-spec architecture: worktree is named after the spec
        assert working_dir.name == TEST_SPEC_NAME

    def test_setup_isolated_creates_worktrees_dir(self, temp_git_repo: Path):
        """Isolated mode creates worktrees directory."""
        setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        assert (temp_git_repo / ".auto-claude" / "worktrees" / "tasks").exists()


class TestWorkspaceUtilities:
    """Tests for workspace utility functions."""

    def test_per_spec_worktree_naming(self, temp_git_repo: Path):
        """Per-spec architecture uses spec name for worktree directory."""
        spec_name = "my-spec-001"
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            spec_name,
            WorkspaceMode.ISOLATED,
        )

        # Worktree should be named after the spec
        assert working_dir.name == spec_name
        # New path: .auto-claude/worktrees/tasks/{spec_name}
        assert working_dir.parent.name == "tasks"


class TestWorkspaceIntegration:
    """Integration tests for workspace management."""

    def test_isolated_workflow(self, temp_git_repo: Path):
        """Full isolated workflow: setup -> work -> finalize."""
        # Setup isolated workspace
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # Make changes in workspace
        (working_dir / "feature.py").write_text("# New feature\n")

        # Verify changes are in workspace
        assert (working_dir / "feature.py").exists()

        # Verify changes are NOT in main project
        assert not (temp_git_repo / "feature.py").exists()

    def test_direct_workflow(self, temp_git_repo: Path):
        """Full direct workflow: setup -> work."""
        # Setup direct workspace
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.DIRECT,
        )

        # Working dir is the project dir
        assert working_dir == temp_git_repo

        # Make changes directly
        (working_dir / "feature.py").write_text("# New feature\n")

        # Changes are in main project
        assert (temp_git_repo / "feature.py").exists()

    def test_isolated_merge(self, temp_git_repo: Path):
        """Can merge isolated workspace back to main."""
        # Setup
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # Make changes and commit using git directly
        (working_dir / "feature.py").write_text("# New feature\n")
        subprocess.run(["git", "add", "."], cwd=working_dir, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Add feature"],
            cwd=working_dir, capture_output=True
        )

        # Merge back using merge_worktree
        result = manager.merge_worktree("test-spec", delete_after=False)

        assert result is True

        # Check changes are in main
        subprocess.run(
            ["git", "checkout", manager.base_branch],
            cwd=temp_git_repo, capture_output=True
        )
        assert (temp_git_repo / "feature.py").exists()


class TestWorkspaceCleanup:
    """Tests for workspace cleanup."""

    def test_cleanup_after_merge(self, temp_git_repo: Path):
        """Workspace is cleaned up after merge with delete_after=True."""
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # Commit changes using git directly
        (working_dir / "test.py").write_text("test")
        subprocess.run(["git", "add", "."], cwd=working_dir, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Test"],
            cwd=working_dir, capture_output=True
        )

        # Merge with cleanup
        manager.merge_worktree("test-spec", delete_after=True)

        # Workspace should be removed
        assert not working_dir.exists()

    def test_workspace_preserved_after_merge_no_delete(self, temp_git_repo: Path):
        """Workspace preserved after merge with delete_after=False."""
        working_dir, manager, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # Commit changes using git directly
        (working_dir / "test.py").write_text("test")
        subprocess.run(["git", "add", "."], cwd=working_dir, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Test"],
            cwd=working_dir, capture_output=True
        )

        # Merge without cleanup
        manager.merge_worktree("test-spec", delete_after=False)

        # Workspace should still exist
        assert working_dir.exists()


class TestWorkspaceReuse:
    """Tests for reusing existing workspaces."""

    def test_reuse_existing_workspace(self, temp_git_repo: Path):
        """Can reuse existing workspace on second setup."""
        # First setup
        working_dir1, manager1, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # Add a marker file
        (working_dir1 / "marker.txt").write_text("marker")

        # Second setup (should reuse)
        working_dir2, manager2, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # Should be the same directory
        assert working_dir1 == working_dir2

        # Marker should still exist
        assert (working_dir2 / "marker.txt").exists()


class TestWorkspaceErrors:
    """Tests for workspace error handling."""

    def test_setup_non_git_directory(self, temp_dir: Path):
        """Handles non-git directories gracefully."""
        with pytest.raises(Exception):
            # This should fail because temp_dir is not a git repo
            setup_workspace(
                temp_dir,
                "test-spec",
                WorkspaceMode.ISOLATED,
            )


class TestPerSpecWorktreeName:
    """Tests for per-spec worktree naming (new architecture)."""

    def test_worktree_named_after_spec(self, temp_git_repo: Path):
        """Worktree is named after the spec."""
        spec_name = "spec-1"
        working_dir, _, _ = setup_workspace(
            temp_git_repo,
            spec_name,
            WorkspaceMode.ISOLATED,
        )

        # Per-spec architecture: worktree directory matches spec name
        assert working_dir.name == spec_name

    def test_different_specs_get_different_worktrees(self, temp_git_repo: Path):
        """Different specs create separate worktrees."""
        working_dir1, _, _ = setup_workspace(
            temp_git_repo,
            "spec-1",
            WorkspaceMode.ISOLATED,
        )

        working_dir2, _, _ = setup_workspace(
            temp_git_repo,
            "spec-2",
            WorkspaceMode.ISOLATED,
        )

        # Each spec has its own worktree
        assert working_dir1.name == "spec-1"
        assert working_dir2.name == "spec-2"
        assert working_dir1 != working_dir2

    def test_worktree_path_in_worktrees_dir(self, temp_git_repo: Path):
        """Worktree is created in worktrees directory."""
        working_dir, _, _ = setup_workspace(
            temp_git_repo,
            "test-spec",
            WorkspaceMode.ISOLATED,
        )

        # New path: .auto-claude/worktrees/tasks/{spec_name}
        assert "worktrees" in str(working_dir)
        assert working_dir.parent.name == "tasks"


class TestConflictInfoDisplay:
    """Tests for conflict info display function (ACS-179)."""

    def test_print_conflict_info_with_string_list(self, capsys):
        """print_conflict_info handles string list of file paths (ACS-179)."""
        from core.workspace.display import print_conflict_info

        result = {
            "conflicts": ["file1.txt", "file2.py", "file3.js"]
        }

        print_conflict_info(result)

        captured = capsys.readouterr()
        assert "3 file" in captured.out
        assert "file1.txt" in captured.out
        assert "file2.py" in captured.out
        assert "file3.js" in captured.out
        assert "git add" in captured.out

    def test_print_conflict_info_with_dict_list(self, capsys):
        """print_conflict_info handles dict list with file/reason/severity (ACS-179)."""
        from core.workspace.display import print_conflict_info

        result = {
            "conflicts": [
                {"file": "file1.txt", "reason": "Syntax error", "severity": "high"},
                {"file": "file2.py", "reason": "Merge conflict", "severity": "medium"},
                {"file": "file3.js", "reason": "Unknown error", "severity": "low"},
            ]
        }

        print_conflict_info(result)

        captured = capsys.readouterr()
        assert "3 file" in captured.out
        assert "file1.txt" in captured.out
        assert "file2.py" in captured.out
        assert "file3.js" in captured.out
        assert "Syntax error" in captured.out
        assert "Merge conflict" in captured.out
        # Verify severity emoji indicators
        assert "🔴" in captured.out  # High severity
        assert "🟡" in captured.out  # Medium severity

    def test_print_conflict_info_mixed_formats(self, capsys):
        """print_conflict_info handles mixed string and dict conflicts (ACS-179)."""
        from core.workspace.display import print_conflict_info

        result = {
            "conflicts": [
                "simple-file.txt",
                {"file": "complex-file.py", "reason": "AI merge failed", "severity": "high"},
            ]
        }

        print_conflict_info(result)

        captured = capsys.readouterr()
        assert "2 file" in captured.out
        assert "simple-file.txt" in captured.out
        assert "complex-file.py" in captured.out
        assert "AI merge failed" in captured.out


class TestMergeErrorHandling:
    """Tests for merge error handling (ACS-163)."""

    def test_merge_failure_returns_false_immediately(self, temp_git_repo: Path):
        """Failed merge returns False without falling through (ACS-163)."""
        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        # Create a worktree with changes
        worker_info = manager.create_worktree("worker-spec")
        (worker_info.path / "worker-file.txt").write_text("worker content")
        subprocess.run(["git", "add", "."], cwd=worker_info.path, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Worker commit"],
            cwd=worker_info.path, capture_output=True
        )

        # Create a conflicting change on main
        subprocess.run(["git", "checkout", manager.base_branch], cwd=temp_git_repo, capture_output=True)
        (temp_git_repo / "worker-file.txt").write_text("main content")
        subprocess.run(["git", "add", "."], cwd=temp_git_repo, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Main commit"],
            cwd=temp_git_repo, capture_output=True
        )

        # Merge should fail (conflict) and return False
        # This tests the fix for ACS-163 where failed merge would fall through
        result = manager.merge_worktree("worker-spec", delete_after=False)

        # Should return False on merge conflict
        assert result is False

        # Verify side effects: base branch content is unchanged
        subprocess.run(["git", "checkout", manager.base_branch], cwd=temp_git_repo, capture_output=True)
        base_content = (temp_git_repo / "worker-file.txt").read_text()
        assert base_content == "main content", "Base branch should be unchanged after failed merge"

        # Verify worktree still exists (delete_after=False)
        assert worker_info.path.exists(), "Worktree should still exist after failed merge"

        # Verify worktree content is unchanged
        worktree_content = (worker_info.path / "worker-file.txt").read_text()
        assert worktree_content == "worker content", "Worktree content should be unchanged"

    def test_merge_success_returns_true(self, temp_git_repo: Path):
        """Successful merge returns True (ACS-163 verification)."""
        manager = WorktreeManager(temp_git_repo)
        manager.setup()

        # Create a worktree with non-conflicting changes
        worker_info = manager.create_worktree("worker-spec")
        (worker_info.path / "worker-file.txt").write_text("worker content")
        subprocess.run(["git", "add", "."], cwd=worker_info.path, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Worker commit"],
            cwd=worker_info.path, capture_output=True
        )

        # Merge should succeed
        result = manager.merge_worktree("worker-spec", delete_after=False)

        assert result is True

        # Verify the file was merged into base branch
        subprocess.run(["git", "checkout", manager.base_branch], cwd=temp_git_repo, capture_output=True)
        assert (temp_git_repo / "worker-file.txt").exists(), "Merged file should exist in base branch"
        merged_content = (temp_git_repo / "worker-file.txt").read_text()
        assert merged_content == "worker content", "Merged file should have worktree content"
