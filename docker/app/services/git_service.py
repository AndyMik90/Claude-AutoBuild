"""Git operations service for Auto-Claude Docker Web UI."""

import asyncio
import re
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from config import Settings


@dataclass
class GitStatus:
    """Git repository status."""
    branch: str
    is_clean: bool
    ahead: int = 0
    behind: int = 0
    modified_files: int = 0
    untracked_files: int = 0


@dataclass
class CloneResult:
    """Result of a git clone operation."""
    success: bool
    path: Optional[Path] = None
    error: Optional[str] = None
    repo_name: Optional[str] = None


class GitService:
    """Service for git operations."""

    def __init__(self, settings: Settings):
        self.settings = settings

    async def _run_git(
        self,
        args: list[str],
        cwd: Optional[Path] = None,
    ) -> tuple[int, str, str]:
        """Run a git command and return (returncode, stdout, stderr)."""
        env = {}
        if self.settings.github_token:
            # Configure git to use token for HTTPS
            env["GIT_ASKPASS"] = "echo"
            env["GIT_USERNAME"] = "x-access-token"
            env["GIT_PASSWORD"] = self.settings.github_token

        process = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env if env else None,
        )
        stdout, stderr = await process.communicate()
        return process.returncode, stdout.decode(), stderr.decode()

    def extract_repo_name(self, repo_url: str) -> str:
        """Extract repository name from URL."""
        # Handle various URL formats
        # https://github.com/user/repo.git
        # git@github.com:user/repo.git
        # https://github.com/user/repo

        # Remove .git suffix if present
        url = repo_url.rstrip("/")
        if url.endswith(".git"):
            url = url[:-4]

        # Extract the last path component
        if "/" in url:
            return url.split("/")[-1]
        if ":" in url:
            return url.split(":")[-1].split("/")[-1]

        return url

    async def clone_repository(
        self,
        repo_url: str,
        target_dir: Optional[Path] = None,
        name: Optional[str] = None,
    ) -> CloneResult:
        """Clone a git repository."""
        repo_name = name or self.extract_repo_name(repo_url)

        if target_dir is None:
            target_dir = self.settings.projects_dir / repo_name

        if target_dir.exists():
            return CloneResult(
                success=False,
                error=f"Directory already exists: {target_dir}",
                repo_name=repo_name,
            )

        # Clone the repository
        returncode, stdout, stderr = await self._run_git(
            ["clone", repo_url, str(target_dir)]
        )

        if returncode != 0:
            return CloneResult(
                success=False,
                error=stderr or "Clone failed",
                repo_name=repo_name,
            )

        return CloneResult(
            success=True,
            path=target_dir,
            repo_name=repo_name,
        )

    async def get_status(self, repo_path: Path) -> Optional[GitStatus]:
        """Get the status of a git repository."""
        if not (repo_path / ".git").exists():
            return None

        # Get current branch
        returncode, branch, _ = await self._run_git(
            ["rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_path,
        )
        if returncode != 0:
            return None

        branch = branch.strip()

        # Get status
        returncode, status_output, _ = await self._run_git(
            ["status", "--porcelain"],
            cwd=repo_path,
        )

        if returncode != 0:
            return GitStatus(branch=branch, is_clean=True)

        lines = status_output.strip().split("\n") if status_output.strip() else []
        modified = sum(1 for line in lines if line and line[0] in "MADRCU")
        untracked = sum(1 for line in lines if line.startswith("??"))

        return GitStatus(
            branch=branch,
            is_clean=len(lines) == 0,
            modified_files=modified,
            untracked_files=untracked,
        )

    async def pull(self, repo_path: Path) -> tuple[bool, str]:
        """Pull latest changes from remote."""
        returncode, stdout, stderr = await self._run_git(
            ["pull", "--ff-only"],
            cwd=repo_path,
        )

        if returncode != 0:
            return False, stderr or "Pull failed"

        return True, stdout

    async def get_remote_url(self, repo_path: Path) -> Optional[str]:
        """Get the remote URL of a repository."""
        returncode, stdout, _ = await self._run_git(
            ["remote", "get-url", "origin"],
            cwd=repo_path,
        )

        if returncode != 0:
            return None

        return stdout.strip()
