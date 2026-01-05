#!/usr/bin/env python3
"""
Git Worktree Manager - Per-Spec Architecture
=============================================

Each spec gets its own worktree:
- Worktree path: .auto-claude/worktrees/tasks/{spec-name}/
- Branch name: auto-claude/{spec-name}

This allows:
1. Multiple specs to be worked on simultaneously
2. Each spec's changes are isolated
3. Branches persist until explicitly merged
4. Clear 1:1:1 mapping: spec → worktree → branch
"""

import asyncio
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class WorktreeError(Exception):
    """Error during worktree operations."""

    pass


@dataclass
class WorktreeInfo:
    """Information about a spec's worktree."""

    path: Path
    branch: str
    spec_name: str
    base_branch: str
    is_active: bool = True
    commit_count: int = 0
    files_changed: int = 0
    additions: int = 0
    deletions: int = 0


class WorktreeManager:
    """
    Manages per-spec Git worktrees.

    Each spec gets its own worktree in .auto-claude/worktrees/tasks/{spec-name}/ with
    a corresponding branch auto-claude/{spec-name}.
    """

    # Timeout constants for subprocess operations
    GIT_PUSH_TIMEOUT = 120  # 2 minutes for git push (network operations)
    GH_CLI_TIMEOUT = 60  # 1 minute for gh CLI commands
    GH_QUERY_TIMEOUT = 30  # 30 seconds for gh CLI queries

    def __init__(self, project_dir: Path, base_branch: str | None = None):
        self.project_dir = project_dir
        self.base_branch = base_branch or self._detect_base_branch()
        self.worktrees_dir = project_dir / ".auto-claude" / "worktrees" / "tasks"
        self._merge_lock = asyncio.Lock()

    def _detect_base_branch(self) -> str:
        """
        Detect the base branch for worktree creation.

        Priority order:
        1. DEFAULT_BRANCH environment variable
        2. Auto-detect main/master (if they exist)
        3. Fall back to current branch (with warning)

        Returns:
            The detected base branch name
        """
        # 1. Check for DEFAULT_BRANCH env var
        env_branch = os.getenv("DEFAULT_BRANCH")
        if env_branch:
            # Verify the branch exists
            result = subprocess.run(
                ["git", "rev-parse", "--verify", env_branch],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode == 0:
                return env_branch
            else:
                print(
                    f"Warning: DEFAULT_BRANCH '{env_branch}' not found, auto-detecting..."
                )

        # 2. Auto-detect main/master
        for branch in ["main", "master"]:
            result = subprocess.run(
                ["git", "rev-parse", "--verify", branch],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode == 0:
                return branch

        # 3. Fall back to current branch with warning
        current = self._get_current_branch()
        print("Warning: Could not find 'main' or 'master' branch.")
        print(f"Warning: Using current branch '{current}' as base for worktree.")
        print("Tip: Set DEFAULT_BRANCH=your-branch in .env to avoid this.")
        return current

    def _get_current_branch(self) -> str:
        """Get the current git branch."""
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            raise WorktreeError(f"Failed to get current branch: {result.stderr}")
        return result.stdout.strip()

    def _run_git(
        self, args: list[str], cwd: Path | None = None, timeout: int = 60
    ) -> subprocess.CompletedProcess:
        """Run a git command and return the result.

        Args:
            args: Git command arguments (without 'git' prefix)
            cwd: Working directory for the command
            timeout: Command timeout in seconds (default: 60)

        Returns:
            CompletedProcess with command results. On timeout, returns a
            CompletedProcess with returncode=-1 and timeout error in stderr.
        """
        try:
            return subprocess.run(
                ["git"] + args,
                cwd=cwd or self.project_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            # Return a failed result on timeout instead of raising
            return subprocess.CompletedProcess(
                args=["git"] + args,
                returncode=-1,
                stdout="",
                stderr=f"Command timed out after {timeout} seconds",
            )

    def _unstage_gitignored_files(self) -> None:
        """
        Unstage any staged files that are gitignored in the current branch,
        plus any files in the .auto-claude directory which should never be merged.

        This is needed after a --no-commit merge because files that exist in the
        source branch (like spec files in .auto-claude/specs/) get staged even if
        they're gitignored in the target branch.
        """
        # Get list of staged files
        result = self._run_git(["diff", "--cached", "--name-only"])
        if result.returncode != 0 or not result.stdout.strip():
            return

        staged_files = result.stdout.strip().split("\n")

        # Files to unstage: gitignored files + .auto-claude directory files
        files_to_unstage = set()

        # 1. Check which staged files are gitignored
        # git check-ignore returns the files that ARE ignored
        result = subprocess.run(
            ["git", "check-ignore", "--stdin"],
            cwd=self.project_dir,
            input="\n".join(staged_files),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        if result.stdout.strip():
            for file in result.stdout.strip().split("\n"):
                if file.strip():
                    files_to_unstage.add(file.strip())

        # 2. Always unstage .auto-claude directory files - these are project-specific
        # and should never be merged from the worktree branch
        auto_claude_patterns = [".auto-claude/", "auto-claude/specs/"]
        for file in staged_files:
            file = file.strip()
            if not file:
                continue
            for pattern in auto_claude_patterns:
                if file.startswith(pattern) or f"/{pattern}" in file:
                    files_to_unstage.add(file)
                    break

        if files_to_unstage:
            print(
                f"Unstaging {len(files_to_unstage)} auto-claude/gitignored file(s)..."
            )
            # Unstage each file
            for file in files_to_unstage:
                self._run_git(["reset", "HEAD", "--", file])

    def setup(self) -> None:
        """Create worktrees directory if needed."""
        self.worktrees_dir.mkdir(parents=True, exist_ok=True)

    # ==================== Per-Spec Worktree Methods ====================

    def get_worktree_path(self, spec_name: str) -> Path:
        """Get the worktree path for a spec."""
        return self.worktrees_dir / spec_name

    def get_branch_name(self, spec_name: str) -> str:
        """Get the branch name for a spec."""
        return f"auto-claude/{spec_name}"

    def worktree_exists(self, spec_name: str) -> bool:
        """Check if a worktree exists for a spec."""
        return self.get_worktree_path(spec_name).exists()

    def get_worktree_info(self, spec_name: str) -> WorktreeInfo | None:
        """Get info about a spec's worktree."""
        worktree_path = self.get_worktree_path(spec_name)
        if not worktree_path.exists():
            return None

        # Verify the branch exists in the worktree
        result = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=worktree_path)
        if result.returncode != 0:
            return None

        actual_branch = result.stdout.strip()

        # Get statistics
        stats = self._get_worktree_stats(spec_name)

        return WorktreeInfo(
            path=worktree_path,
            branch=actual_branch,
            spec_name=spec_name,
            base_branch=self.base_branch,
            is_active=True,
            **stats,
        )

    def _check_branch_namespace_conflict(self) -> str | None:
        """
        Check if a branch named 'auto-claude' exists, which would block creating
        branches in the 'auto-claude/*' namespace.

        Git stores branch refs as files under .git/refs/heads/, so a branch named
        'auto-claude' creates a file that prevents creating the 'auto-claude/'
        directory needed for 'auto-claude/{spec-name}' branches.

        Returns:
            The conflicting branch name if found, None otherwise.
        """
        result = self._run_git(["rev-parse", "--verify", "auto-claude"])
        if result.returncode == 0:
            return "auto-claude"
        return None

    def _get_worktree_stats(self, spec_name: str) -> dict:
        """Get diff statistics for a worktree."""
        worktree_path = self.get_worktree_path(spec_name)

        stats = {
            "commit_count": 0,
            "files_changed": 0,
            "additions": 0,
            "deletions": 0,
        }

        if not worktree_path.exists():
            return stats

        # Commit count
        result = self._run_git(
            ["rev-list", "--count", f"{self.base_branch}..HEAD"], cwd=worktree_path
        )
        if result.returncode == 0:
            stats["commit_count"] = int(result.stdout.strip() or "0")

        # Diff stats
        result = self._run_git(
            ["diff", "--shortstat", f"{self.base_branch}...HEAD"], cwd=worktree_path
        )
        if result.returncode == 0 and result.stdout.strip():
            # Parse: "3 files changed, 50 insertions(+), 10 deletions(-)"
            match = re.search(r"(\d+) files? changed", result.stdout)
            if match:
                stats["files_changed"] = int(match.group(1))
            match = re.search(r"(\d+) insertions?", result.stdout)
            if match:
                stats["additions"] = int(match.group(1))
            match = re.search(r"(\d+) deletions?", result.stdout)
            if match:
                stats["deletions"] = int(match.group(1))

        return stats

    def create_worktree(self, spec_name: str) -> WorktreeInfo:
        """
        Create a worktree for a spec.

        Args:
            spec_name: The spec folder name (e.g., "002-implement-memory")

        Returns:
            WorktreeInfo for the created worktree

        Raises:
            WorktreeError: If a branch namespace conflict exists or worktree creation fails
        """
        worktree_path = self.get_worktree_path(spec_name)
        branch_name = self.get_branch_name(spec_name)

        # Check for branch namespace conflict (e.g., 'auto-claude' blocking 'auto-claude/*')
        conflicting_branch = self._check_branch_namespace_conflict()
        if conflicting_branch:
            raise WorktreeError(
                f"Branch '{conflicting_branch}' exists and blocks creating '{branch_name}'.\n"
                f"\n"
                f"Git branch names work like file paths - a branch named 'auto-claude' prevents\n"
                f"creating branches under 'auto-claude/' (like 'auto-claude/{spec_name}').\n"
                f"\n"
                f"Fix: Rename the conflicting branch:\n"
                f"  git branch -m {conflicting_branch} {conflicting_branch}-backup"
            )

        # Remove existing if present (from crashed previous run)
        if worktree_path.exists():
            self._run_git(["worktree", "remove", "--force", str(worktree_path)])

        # Delete branch if it exists (from previous attempt)
        self._run_git(["branch", "-D", branch_name])

        # Fetch latest from remote to ensure we have the most up-to-date code
        # GitHub/remote is the source of truth, not the local branch
        fetch_result = self._run_git(["fetch", "origin", self.base_branch])
        if fetch_result.returncode != 0:
            print(
                f"Warning: Could not fetch {self.base_branch} from origin: {fetch_result.stderr}"
            )
            print("Falling back to local branch...")

        # Determine the start point for the worktree
        # Prefer origin/{base_branch} (remote) over local branch to ensure we have latest code
        remote_ref = f"origin/{self.base_branch}"
        start_point = self.base_branch  # Default to local branch

        # Check if remote ref exists and use it as the source of truth
        check_remote = self._run_git(["rev-parse", "--verify", remote_ref])
        if check_remote.returncode == 0:
            start_point = remote_ref
            print(f"Creating worktree from remote: {remote_ref}")
        else:
            print(
                f"Remote ref {remote_ref} not found, using local branch: {self.base_branch}"
            )

        # Create worktree with new branch from the start point (remote preferred)
        result = self._run_git(
            ["worktree", "add", "-b", branch_name, str(worktree_path), start_point]
        )

        if result.returncode != 0:
            raise WorktreeError(
                f"Failed to create worktree for {spec_name}: {result.stderr}"
            )

        print(f"Created worktree: {worktree_path.name} on branch {branch_name}")

        return WorktreeInfo(
            path=worktree_path,
            branch=branch_name,
            spec_name=spec_name,
            base_branch=self.base_branch,
            is_active=True,
        )

    def get_or_create_worktree(self, spec_name: str) -> WorktreeInfo:
        """
        Get existing worktree or create a new one for a spec.

        Args:
            spec_name: The spec folder name

        Returns:
            WorktreeInfo for the worktree
        """
        existing = self.get_worktree_info(spec_name)
        if existing:
            print(f"Using existing worktree: {existing.path}")
            return existing

        return self.create_worktree(spec_name)

    def remove_worktree(self, spec_name: str, delete_branch: bool = False) -> None:
        """
        Remove a spec's worktree.

        Args:
            spec_name: The spec folder name
            delete_branch: Whether to also delete the branch
        """
        worktree_path = self.get_worktree_path(spec_name)
        branch_name = self.get_branch_name(spec_name)

        if worktree_path.exists():
            result = self._run_git(
                ["worktree", "remove", "--force", str(worktree_path)]
            )
            if result.returncode == 0:
                print(f"Removed worktree: {worktree_path.name}")
            else:
                print(f"Warning: Could not remove worktree: {result.stderr}")
                shutil.rmtree(worktree_path, ignore_errors=True)

        if delete_branch:
            self._run_git(["branch", "-D", branch_name])
            print(f"Deleted branch: {branch_name}")

        self._run_git(["worktree", "prune"])

    def merge_worktree(
        self, spec_name: str, delete_after: bool = False, no_commit: bool = False
    ) -> bool:
        """
        Merge a spec's worktree branch back to base branch.

        Args:
            spec_name: The spec folder name
            delete_after: Whether to remove worktree and branch after merge
            no_commit: If True, merge changes but don't commit (stage only for review)

        Returns:
            True if merge succeeded
        """
        info = self.get_worktree_info(spec_name)
        if not info:
            print(f"No worktree found for spec: {spec_name}")
            return False

        if no_commit:
            print(
                f"Merging {info.branch} into {self.base_branch} (staged, not committed)..."
            )
        else:
            print(f"Merging {info.branch} into {self.base_branch}...")

        # Switch to base branch in main project
        result = self._run_git(["checkout", self.base_branch])
        if result.returncode != 0:
            print(f"Error: Could not checkout base branch: {result.stderr}")
            return False

        # Merge the spec branch
        merge_args = ["merge", "--no-ff", info.branch]
        if no_commit:
            # --no-commit stages the merge but doesn't create the commit
            merge_args.append("--no-commit")
        else:
            merge_args.extend(["-m", f"auto-claude: Merge {info.branch}"])

        result = self._run_git(merge_args)

        if result.returncode != 0:
            print("Merge conflict! Aborting merge...")
            self._run_git(["merge", "--abort"])
            return False

        if no_commit:
            # Unstage any files that are gitignored in the main branch
            # These get staged during merge because they exist in the worktree branch
            self._unstage_gitignored_files()
            print(
                f"Changes from {info.branch} are now staged in your working directory."
            )
            print("Review the changes, then commit when ready:")
            print("  git commit -m 'your commit message'")
        else:
            print(f"Successfully merged {info.branch}")

        if delete_after:
            self.remove_worktree(spec_name, delete_branch=True)

        return True

    def commit_in_worktree(self, spec_name: str, message: str) -> bool:
        """Commit all changes in a spec's worktree."""
        worktree_path = self.get_worktree_path(spec_name)
        if not worktree_path.exists():
            return False

        self._run_git(["add", "."], cwd=worktree_path)
        result = self._run_git(["commit", "-m", message], cwd=worktree_path)

        if result.returncode == 0:
            return True
        elif "nothing to commit" in result.stdout + result.stderr:
            return True
        else:
            print(f"Commit failed: {result.stderr}")
            return False

    # ==================== Listing & Discovery ====================

    def list_all_worktrees(self) -> list[WorktreeInfo]:
        """List all spec worktrees."""
        worktrees = []

        if self.worktrees_dir.exists():
            for item in self.worktrees_dir.iterdir():
                if item.is_dir():
                    info = self.get_worktree_info(item.name)
                    if info:
                        worktrees.append(info)

        return worktrees

    def list_all_spec_branches(self) -> list[str]:
        """List all auto-claude branches (even if worktree removed)."""
        result = self._run_git(["branch", "--list", "auto-claude/*"])
        if result.returncode != 0:
            return []

        branches = []
        for line in result.stdout.strip().split("\n"):
            branch = line.strip().lstrip("* ")
            if branch:
                branches.append(branch)

        return branches

    def get_changed_files(self, spec_name: str) -> list[tuple[str, str]]:
        """Get list of changed files in a spec's worktree."""
        worktree_path = self.get_worktree_path(spec_name)
        if not worktree_path.exists():
            return []

        result = self._run_git(
            ["diff", "--name-status", f"{self.base_branch}...HEAD"], cwd=worktree_path
        )

        files = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t", 1)
            if len(parts) == 2:
                files.append((parts[0], parts[1]))

        return files

    def get_change_summary(self, spec_name: str) -> dict:
        """Get a summary of changes in a worktree."""
        files = self.get_changed_files(spec_name)

        new_files = sum(1 for status, _ in files if status == "A")
        modified_files = sum(1 for status, _ in files if status == "M")
        deleted_files = sum(1 for status, _ in files if status == "D")

        return {
            "new_files": new_files,
            "modified_files": modified_files,
            "deleted_files": deleted_files,
        }

    def cleanup_all(self) -> None:
        """Remove all worktrees and their branches."""
        for worktree in self.list_all_worktrees():
            self.remove_worktree(worktree.spec_name, delete_branch=True)

    def cleanup_stale_worktrees(self) -> None:
        """Remove worktrees that aren't registered with git."""
        if not self.worktrees_dir.exists():
            return

        # Get list of registered worktrees
        result = self._run_git(["worktree", "list", "--porcelain"])
        registered_paths = set()
        for line in result.stdout.split("\n"):
            if line.startswith("worktree "):
                registered_paths.add(Path(line.split(" ", 1)[1]))

        # Remove unregistered directories
        for item in self.worktrees_dir.iterdir():
            if item.is_dir() and item not in registered_paths:
                print(f"Removing stale worktree directory: {item.name}")
                shutil.rmtree(item, ignore_errors=True)

        self._run_git(["worktree", "prune"])

    def get_test_commands(self, spec_name: str) -> list[str]:
        """Detect likely test/run commands for the project."""
        worktree_path = self.get_worktree_path(spec_name)
        commands = []

        if (worktree_path / "package.json").exists():
            commands.append("npm install && npm run dev")
            commands.append("npm test")

        if (worktree_path / "requirements.txt").exists():
            commands.append("pip install -r requirements.txt")

        if (worktree_path / "Cargo.toml").exists():
            commands.append("cargo run")
            commands.append("cargo test")

        if (worktree_path / "go.mod").exists():
            commands.append("go run .")
            commands.append("go test ./...")

        if not commands:
            commands.append("# Check the project's README for run instructions")

        return commands

    def has_uncommitted_changes(self, spec_name: str | None = None) -> bool:
        """Check if there are uncommitted changes."""
        cwd = None
        if spec_name:
            worktree_path = self.get_worktree_path(spec_name)
            if worktree_path.exists():
                cwd = worktree_path
        result = self._run_git(["status", "--porcelain"], cwd=cwd)
        return bool(result.stdout.strip())

    # ==================== PR Creation Methods ====================

    def push_branch(
        self, spec_name: str, force: bool = False
    ) -> dict:
        """
        Push a spec's branch to the remote origin.

        Args:
            spec_name: The spec folder name
            force: Whether to force push (use with caution)

        Returns:
            dict with keys:
                - success: bool
                - branch: str (branch name)
                - error: str (if failed)
        """
        info = self.get_worktree_info(spec_name)
        if not info:
            return {
                "success": False,
                "error": f"No worktree found for spec: {spec_name}",
            }

        # Push the branch to origin
        push_args = ["push", "-u", "origin", info.branch]
        if force:
            push_args.insert(1, "--force")

        try:
            result = subprocess.run(
                ["git"] + push_args,
                cwd=info.path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.GIT_PUSH_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "branch": info.branch,
                "error": f"Push timed out after {self.GIT_PUSH_TIMEOUT} seconds. Check network connection.",
            }

        if result.returncode != 0:
            return {
                "success": False,
                "branch": info.branch,
                "error": f"Failed to push branch: {result.stderr}",
            }

        return {
            "success": True,
            "branch": info.branch,
            "remote": "origin",
        }

    def create_pull_request(
        self,
        spec_name: str,
        target_branch: str | None = None,
        title: str | None = None,
        draft: bool = False,
    ) -> dict:
        """
        Create a GitHub pull request for a spec's branch using gh CLI.

        Args:
            spec_name: The spec folder name
            target_branch: Target branch for PR (defaults to base_branch)
            title: PR title (defaults to spec name)
            draft: Whether to create as draft PR

        Returns:
            dict with keys:
                - success: bool
                - pr_url: str (if created)
                - already_exists: bool (if PR already exists)
                - error: str (if failed)
        """
        info = self.get_worktree_info(spec_name)
        if not info:
            return {
                "success": False,
                "error": f"No worktree found for spec: {spec_name}",
            }

        target = target_branch or self.base_branch
        pr_title = title or f"auto-claude: {spec_name}"

        # Get PR body from spec.md if available
        pr_body = self._extract_spec_summary(spec_name)

        # Build gh pr create command
        gh_args = [
            "gh", "pr", "create",
            "--base", target,
            "--head", info.branch,
            "--title", pr_title,
            "--body", pr_body,
        ]
        if draft:
            gh_args.append("--draft")

        try:
            result = subprocess.run(
                gh_args,
                cwd=info.path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.GH_CLI_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"PR creation timed out after {self.GH_CLI_TIMEOUT} seconds.",
            }
        except FileNotFoundError:
            return {
                "success": False,
                "error": "gh CLI not found. Install from https://cli.github.com/",
            }

        # Check for "already exists" case
        if result.returncode != 0 and "already exists" in result.stderr.lower():
            existing_url = self._get_existing_pr_url(spec_name, target)
            return {
                "success": True,
                "pr_url": existing_url,
                "already_exists": True,
            }

        if result.returncode != 0:
            return {
                "success": False,
                "error": f"Failed to create PR: {result.stderr}",
            }

        # Extract PR URL from output
        pr_url = result.stdout.strip()
        if not pr_url.startswith("http"):
            # Try to find URL in output
            match = re.search(r"https://github\.com/[^\s]+/pull/\d+", result.stdout)
            if match:
                pr_url = match.group(0)

        return {
            "success": True,
            "pr_url": pr_url,
            "already_exists": False,
        }

    def _extract_spec_summary(self, spec_name: str) -> str:
        """Extract a summary from spec.md for PR body."""
        worktree_path = self.get_worktree_path(spec_name)
        spec_path = worktree_path / ".auto-claude" / "specs" / spec_name / "spec.md"

        if not spec_path.exists():
            # Try project spec path
            spec_path = self.project_dir / ".auto-claude" / "specs" / spec_name / "spec.md"

        if not spec_path.exists():
            return "Auto-generated PR from Auto-Claude build."

        try:
            content = spec_path.read_text(encoding="utf-8")
            # Extract first few paragraphs (skip title, get overview)
            lines = content.split("\n")
            summary_lines = []
            in_content = False

            for line in lines:
                # Skip title headers
                if line.startswith("# "):
                    continue
                # Start capturing after first content line
                if line.strip() and not line.startswith("#"):
                    in_content = True
                if in_content:
                    if line.startswith("## ") and summary_lines:
                        break  # Stop at next section
                    summary_lines.append(line)
                    if len(summary_lines) >= 10:  # Limit to ~10 lines
                        break

            summary = "\n".join(summary_lines).strip()
            if summary:
                return summary
        except Exception:
            # Silently fall back to default - file read errors shouldn't block PR creation
            pass

        return "Auto-generated PR from Auto-Claude build."

    def _get_existing_pr_url(self, spec_name: str, target_branch: str) -> str | None:
        """Get the URL of an existing PR for this branch."""
        info = self.get_worktree_info(spec_name)
        if not info:
            return None

        try:
            result = subprocess.run(
                ["gh", "pr", "view", info.branch, "--json", "url", "--jq", ".url"],
                cwd=info.path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.GH_QUERY_TIMEOUT,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            # Silently ignore errors when fetching existing PR URL - this is a best-effort
            # lookup that may fail due to network issues, missing gh CLI, or auth problems.
            # Returning None allows the caller to handle missing URLs gracefully.
            pass

        return None

    def push_and_create_pr(
        self,
        spec_name: str,
        target_branch: str | None = None,
        title: str | None = None,
        draft: bool = False,
        force_push: bool = False,
    ) -> dict:
        """
        Push branch and create a pull request in one operation.

        Args:
            spec_name: The spec folder name
            target_branch: Target branch for PR (defaults to base_branch)
            title: PR title (defaults to spec name)
            draft: Whether to create as draft PR
            force_push: Whether to force push the branch

        Returns:
            dict with keys:
                - success: bool
                - pr_url: str (if created)
                - pushed: bool (if push succeeded)
                - already_exists: bool (if PR already exists)
                - error: str (if failed)
        """
        # Step 1: Push the branch
        push_result = self.push_branch(spec_name, force=force_push)
        if not push_result.get("success"):
            return {
                "success": False,
                "pushed": False,
                "error": push_result.get("error", "Push failed"),
            }

        # Step 2: Create the PR
        pr_result = self.create_pull_request(
            spec_name=spec_name,
            target_branch=target_branch,
            title=title,
            draft=draft,
        )

        # Combine results
        return {
            "success": pr_result.get("success", False),
            "pushed": True,
            "remote": push_result.get("remote"),
            "branch": push_result.get("branch"),
            "pr_url": pr_result.get("pr_url"),
            "already_exists": pr_result.get("already_exists", False),
            "error": pr_result.get("error"),
        }
