"""
Deployment handler for Auto-Claude.

Handles pushing to origin or creating PRs after task completion.
Includes security hardening, retry logic, and race condition prevention.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from config.deployment import DeploymentConfig, DeploymentMode
from runners.github.file_lock import FileLock, FileLockTimeout

logger = logging.getLogger(__name__)


@dataclass
class DeploymentResult:
    """Result of a deployment operation."""
    success: bool
    message: str
    commit_sha: str | None = None
    pr_url: str | None = None


class DeploymentHandler:
    """
    Handles deployment after task completion.

    Security features:
    - Token never appears in command line (uses GIT_ASKPASS)
    - File lock prevents concurrent push race conditions
    - Remote URL validation before push
    """

    LOCK_FILE = ".auto-claude/.deployment.lock"
    LOCK_TIMEOUT = 300.0

    def __init__(self, config: DeploymentConfig, project_root: Path):
        self.config = config
        self.project_root = project_root

    async def deploy(self, task_id: str, task_title: str, branch: str) -> DeploymentResult:
        """
        Main deployment entry point.

        Args:
            task_id: Unique task identifier
            task_title: Human-readable task title
            branch: Branch that was merged

        Returns:
            DeploymentResult with success status and details
        """
        if self.config.mode == DeploymentMode.LOCAL_ONLY:
            logger.info(f"Task {task_id}: Local only mode, skipping push")
            return DeploymentResult(
                success=True,
                message="Local only mode - merge complete, no push"
            )

        if self.config.wait_for_all_worktrees:
            if not await self._all_worktrees_complete():
                logger.info(f"Task {task_id}: Waiting for other worktrees")
                return DeploymentResult(
                    success=True,
                    message="Waiting for other worktrees to complete"
                )

        try:
            async with self._acquire_lock():
                if self.config.mode == DeploymentMode.AUTO_PUSH:
                    return await self._push_to_origin(task_id)
                elif self.config.mode == DeploymentMode.AUTO_PR:
                    return await self._create_pull_request(task_id, task_title, branch)
        except FileLockTimeout:
            return DeploymentResult(
                success=False,
                message="Could not acquire deployment lock (another push in progress)"
            )

        return DeploymentResult(success=False, message="Unknown deployment mode")

    async def _acquire_lock(self) -> FileLock:
        """Acquire file-based lock to prevent concurrent deployments."""
        lock_path = self.project_root / self.LOCK_FILE
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        return FileLock(str(lock_path), timeout=self.LOCK_TIMEOUT)

    async def _push_to_origin(self, task_id: str) -> DeploymentResult:
        """Push to origin with retry logic and security."""
        remote_url = await self._get_remote_url()
        if not self._validate_remote(remote_url):
            return DeploymentResult(
                success=False,
                message=f"Remote validation failed: {remote_url}"
            )

        for attempt in range(1, self.config.push_retries + 1):
            logger.info(f"Task {task_id}: Push attempt {attempt}/{self.config.push_retries}")

            try:
                branch = self.config.target_branch
                result = await self._git_push_with_auth(
                    [branch, f"{branch}:{branch}"],
                    timeout=self.config.push_timeout
                )

                if result.returncode == 0:
                    commit_sha = await self._get_head_sha()
                    logger.info(f"Task {task_id}: Push successful ({commit_sha[:8]})")

                    if self.config.notify_on_push:
                        await self._send_notification(
                            f"Pushed to origin/{self.config.target_branch}",
                            success=True
                        )

                    return DeploymentResult(
                        success=True,
                        message=f"Pushed to origin/{self.config.target_branch}",
                        commit_sha=commit_sha
                    )

                logger.warning(f"Task {task_id}: Push failed: {result.stderr}")

            except asyncio.TimeoutError:
                logger.warning(f"Task {task_id}: Push timed out")
            except Exception as e:
                logger.error(f"Task {task_id}: Push exception: {e}")

            if attempt < self.config.push_retries:
                delay = self.config.push_retry_delay * (2 ** (attempt - 1))
                logger.info(f"Task {task_id}: Retrying in {delay}s")
                await asyncio.sleep(delay)

        if self.config.notify_on_failure:
            await self._send_notification("Push failed after all retries", success=False)

        return DeploymentResult(
            success=False,
            message=f"Push failed after {self.config.push_retries} attempts"
        )

    async def _git_push_with_auth(
        self,
        push_args: list[str],
        timeout: int | None = None
    ) -> subprocess.CompletedProcess:
        """
        Execute git push with secure token handling via GIT_ASKPASS.

        Args:
            push_args: Arguments to pass to git push after 'origin'
            timeout: Optional timeout in seconds

        Returns:
            CompletedProcess with push result
        """
        token = await self._get_github_token()
        env = os.environ.copy()
        askpass_path = None

        if token:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".sh", delete=False
            ) as f:
                # Escape single quotes in token for safe shell interpolation
                escaped_token = token.replace("'", "'\\''")
                f.write(f"#!/bin/bash\necho '{escaped_token}'")
                askpass_path = f.name

            os.chmod(askpass_path, 0o700)
            env["GIT_ASKPASS"] = askpass_path

        try:
            cmd = ["git", "push", "origin"] + push_args
            loop = asyncio.get_running_loop()
            coro = loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    cmd,
                    cwd=self.project_root,
                    env=env,
                    capture_output=True,
                    text=True,
                )
            )
            if timeout:
                return await asyncio.wait_for(coro, timeout=timeout)
            return await coro
        finally:
            if askpass_path and os.path.exists(askpass_path):
                os.unlink(askpass_path)

    async def _create_pull_request(
        self, task_id: str, task_title: str, branch: str
    ) -> DeploymentResult:
        """Create a pull request instead of direct push."""
        push_result = await self._git_push_with_auth(
            ["-u", branch],
            timeout=self.config.push_timeout
        )
        if push_result.returncode != 0:
            return DeploymentResult(
                success=False,
                message=f"Failed to push branch: {push_result.stderr}"
            )

        pr_body = f"""## Auto-Claude Task Completion

**Task ID:** {task_id}
**Task:** {task_title}

This PR was automatically created by Auto-Claude after task completion.

---
*Auto-generated by Auto-Claude*
"""

        try:
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: subprocess.run(
                        [
                            "gh", "pr", "create",
                            "--title", f"[Auto-Claude] {task_title}",
                            "--body", pr_body,
                            "--base", self.config.target_branch,
                            "--head", branch,
                        ],
                        cwd=self.project_root,
                        capture_output=True,
                        text=True,
                    )
                ),
                timeout=self.config.push_timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"Task {task_id}: PR creation timed out")
            return DeploymentResult(
                success=False,
                message="PR creation timed out"
            )

        if result.returncode == 0:
            pr_url = result.stdout.strip()
            logger.info(f"Task {task_id}: Created PR {pr_url}")
            return DeploymentResult(
                success=True,
                message=f"Created PR: {pr_url}",
                pr_url=pr_url
            )
        else:
            return DeploymentResult(
                success=False,
                message=f"Failed to create PR: {result.stderr}"
            )

    async def _get_github_token(self) -> str | None:
        """Get GitHub token from gh CLI or environment."""
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True,
                text=True,
            )
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

        return os.getenv("GITHUB_TOKEN")

    async def _get_remote_url(self) -> str:
        """Get the remote origin URL."""
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
            )
        )
        return result.stdout.strip() if result.returncode == 0 else ""

    def _validate_remote(self, url: str) -> bool:
        """
        Validate remote URL is a known git host.

        Handles both HTTPS URLs and SSH URLs (git@host:user/repo.git).
        """
        known_hosts = {"github.com", "gitlab.com", "bitbucket.org"}

        try:
            # Handle SSH URLs like git@github.com:user/repo.git
            if "@" in url and ":" in url and not url.startswith(("http://", "https://")):
                host = url.split("@")[1].split(":")[0]
                return host in known_hosts

            # Handle HTTP/HTTPS URLs
            parsed = urlparse(url)
            return parsed.hostname in known_hosts
        except Exception as e:
            logger.warning(f"Failed to parse remote URL '{url}': {e}")
            return False

    async def _get_head_sha(self) -> str:
        """Get current HEAD commit SHA."""
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
            )
        )
        return result.stdout.strip() if result.returncode == 0 else ""

    async def _all_worktrees_complete(self) -> bool:
        """Check if all worktrees have completed."""
        worktrees_dir = self.project_root / ".worktrees"
        if not worktrees_dir.exists():
            return True

        for wt in worktrees_dir.iterdir():
            if not wt.is_dir():
                continue
            status_file = wt / ".auto-claude-status"
            if status_file.exists():
                try:
                    with open(status_file) as f:
                        status = json.load(f)
                    if status.get("state") != "complete":
                        return False
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(
                        f"Could not parse status file {status_file}: {e}. "
                        "Assuming not complete."
                    )
                    return False
                except Exception as e:
                    logger.error(
                        f"Unexpected error reading status file {status_file}: {e}. "
                        "Assuming not complete."
                    )
                    return False
        return True

    async def _send_notification(self, message: str, success: bool) -> None:
        """Send desktop notification (macOS only, gracefully skips on other platforms)."""
        if sys.platform != "darwin":
            logger.debug(f"Skipping notification on {sys.platform}: {message}")
            return

        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    [
                        "osascript", "-e",
                        f'display notification "{message}" with title "Auto-Claude"'
                    ],
                    capture_output=True,
                    check=False,
                )
            )
        except Exception as e:
            logger.warning(f"Failed to send notification: {e}")
