"""
Deployment handler for Auto-Claude.

Handles pushing to origin or creating PRs after task completion.
Includes security hardening, retry logic, and race condition prevention.
"""

import asyncio
import fcntl
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import logging

from config.deployment import DeploymentConfig, DeploymentMode


logger = logging.getLogger(__name__)


@dataclass
class DeploymentResult:
    """Result of a deployment operation."""
    success: bool
    message: str
    commit_sha: Optional[str] = None
    pr_url: Optional[str] = None


class DeploymentHandler:
    """
    Handles deployment after task completion.

    Security features:
    - Token never appears in command line (uses GIT_ASKPASS)
    - File lock prevents concurrent push race conditions
    - Remote URL validation before push
    """

    LOCK_FILE = ".auto-claude/.deployment.lock"
    LOCK_TIMEOUT = 300

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
        except TimeoutError:
            return DeploymentResult(
                success=False,
                message="Could not acquire deployment lock (another push in progress)"
            )

        return DeploymentResult(success=False, message="Unknown deployment mode")

    async def _acquire_lock(self):
        """Acquire file-based lock to prevent concurrent deployments."""
        lock_path = self.project_root / self.LOCK_FILE
        lock_path.parent.mkdir(parents=True, exist_ok=True)

        class AsyncFileLock:
            def __init__(self, path: Path, timeout: int):
                self.path = path
                self.timeout = timeout
                self.fd = None

            async def __aenter__(self):
                self.fd = open(self.path, "w")
                start = asyncio.get_event_loop().time()
                while True:
                    try:
                        fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        return self
                    except BlockingIOError:
                        elapsed = asyncio.get_event_loop().time() - start
                        if elapsed > self.timeout:
                            self.fd.close()
                            raise TimeoutError("Could not acquire deployment lock")
                        await asyncio.sleep(1)

            async def __aexit__(self, *args):
                if self.fd:
                    try:
                        fcntl.flock(self.fd, fcntl.LOCK_UN)
                    except Exception:
                        pass
                    self.fd.close()

        return AsyncFileLock(lock_path, self.LOCK_TIMEOUT)

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
                result = await self._execute_push()

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

    async def _execute_push(self) -> subprocess.CompletedProcess:
        """Execute git push with secure token handling via GIT_ASKPASS."""
        token = await self._get_github_token()
        env = os.environ.copy()
        askpass_path = None

        if token:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".sh", delete=False
            ) as f:
                f.write(f'#!/bin/bash\necho "{token}"')
                askpass_path = f.name

            os.chmod(askpass_path, 0o700)
            env["GIT_ASKPASS"] = askpass_path

        try:
            branch = self.config.target_branch
            return await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: subprocess.run(
                        ["git", "push", "origin", f"{branch}:{branch}"],
                        cwd=self.project_root,
                        env=env,
                        capture_output=True,
                        text=True,
                    )
                ),
                timeout=self.config.push_timeout
            )
        finally:
            if askpass_path and os.path.exists(askpass_path):
                os.unlink(askpass_path)

    async def _create_pull_request(
        self, task_id: str, task_title: str, branch: str
    ) -> DeploymentResult:
        """Create a pull request instead of direct push."""
        push_result = await self._execute_branch_push(branch)
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

        result = await asyncio.get_event_loop().run_in_executor(
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

    async def _execute_branch_push(self, branch: str) -> subprocess.CompletedProcess:
        """Push a feature branch (for PR creation)."""
        token = await self._get_github_token()
        env = os.environ.copy()
        askpass_path = None

        if token:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".sh", delete=False
            ) as f:
                f.write(f'#!/bin/bash\necho "{token}"')
                askpass_path = f.name
            os.chmod(askpass_path, 0o700)
            env["GIT_ASKPASS"] = askpass_path

        try:
            return await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.run(
                    ["git", "push", "-u", "origin", branch],
                    cwd=self.project_root,
                    env=env,
                    capture_output=True,
                    text=True,
                )
            )
        finally:
            if askpass_path and os.path.exists(askpass_path):
                os.unlink(askpass_path)

    async def _get_github_token(self) -> Optional[str]:
        """Get GitHub token from gh CLI or environment."""
        result = await asyncio.get_event_loop().run_in_executor(
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
        result = await asyncio.get_event_loop().run_in_executor(
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
        """Validate remote URL is a known git host."""
        known_hosts = ["github.com", "gitlab.com", "bitbucket.org"]
        return any(host in url for host in known_hosts)

    async def _get_head_sha(self) -> str:
        """Get current HEAD commit SHA."""
        result = await asyncio.get_event_loop().run_in_executor(
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
                    import json
                    with open(status_file) as f:
                        status = json.load(f)
                    if status.get("state") != "complete":
                        return False
                except Exception:
                    pass
        return True

    async def _send_notification(self, message: str, success: bool) -> None:
        """Send desktop notification."""
        try:
            icon = "checkmark.circle" if success else "xmark.circle"
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: subprocess.run(
                    [
                        "osascript", "-e",
                        f'display notification "{message}" with title "Auto-Claude"'
                    ],
                    capture_output=True,
                )
            )
        except Exception:
            pass
