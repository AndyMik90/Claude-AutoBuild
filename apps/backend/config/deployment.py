"""
Deployment configuration for Auto-Claude.

Controls what happens after a task completes and merges to main:
- local_only: Just merge, no push (default, backward compatible)
- auto_push: Push to origin immediately after merge
- auto_pr: Create a pull request instead of direct push
"""

import json
import logging
import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

logger = logging.getLogger(__name__)


def _safe_int(value: str | None, default: int) -> int:
    """Safely parse int from string, returning default on failure."""
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        logger.warning(f"Invalid integer value '{value}', using default {default}")
        return default


class DeploymentMode(Enum):
    """Deployment behavior after task completion."""
    LOCAL_ONLY = "local_only"
    AUTO_PUSH = "auto_push"
    AUTO_PR = "auto_pr"


@dataclass
class DeploymentConfig:
    """Configuration for deployment behavior."""

    mode: DeploymentMode = DeploymentMode.LOCAL_ONLY
    target_branch: str = "main"
    wait_for_all_worktrees: bool = False
    push_retries: int = 3
    push_retry_delay: int = 5
    push_timeout: int = 300
    notify_on_push: bool = True
    notify_on_failure: bool = True

    @classmethod
    def from_env(cls) -> "DeploymentConfig":
        """Load configuration from environment variables."""
        mode_str = os.getenv("DEPLOYMENT_MODE", "local_only")
        try:
            mode = DeploymentMode(mode_str)
        except ValueError:
            logger.warning(f"Invalid DEPLOYMENT_MODE '{mode_str}', using local_only")
            mode = DeploymentMode.LOCAL_ONLY

        return cls(
            mode=mode,
            target_branch=os.getenv("DEPLOYMENT_TARGET_BRANCH", "main"),
            wait_for_all_worktrees=os.getenv("DEPLOYMENT_WAIT_ALL", "false").lower() == "true",
            push_retries=_safe_int(os.getenv("DEPLOYMENT_PUSH_RETRIES"), 3),
            push_retry_delay=_safe_int(os.getenv("DEPLOYMENT_PUSH_RETRY_DELAY"), 5),
            push_timeout=_safe_int(os.getenv("DEPLOYMENT_PUSH_TIMEOUT"), 300),
            notify_on_push=os.getenv("DEPLOYMENT_NOTIFY_ON_PUSH", "true").lower() == "true",
            notify_on_failure=os.getenv("DEPLOYMENT_NOTIFY_ON_FAILURE", "true").lower() == "true",
        )

    @classmethod
    def from_project(cls, project_root: Path) -> "DeploymentConfig":
        """
        Load configuration with project-level override.

        Priority: .auto-claude/config.json > .env > defaults
        """
        config = cls.from_env()

        project_config_path = project_root / ".auto-claude" / "config.json"
        if project_config_path.exists():
            try:
                with open(project_config_path) as f:
                    project_config = json.load(f)

                deployment = project_config.get("deployment", {})
                if "mode" in deployment:
                    config.mode = DeploymentMode(deployment["mode"])
                if "target_branch" in deployment:
                    config.target_branch = deployment["target_branch"]
                if "wait_for_all_worktrees" in deployment:
                    config.wait_for_all_worktrees = bool(deployment["wait_for_all_worktrees"])
                if "push_retries" in deployment:
                    config.push_retries = int(deployment["push_retries"])
                if "push_retry_delay" in deployment:
                    config.push_retry_delay = int(deployment["push_retry_delay"])
                if "push_timeout" in deployment:
                    config.push_timeout = int(deployment["push_timeout"])
                if "notify_on_push" in deployment:
                    config.notify_on_push = bool(deployment["notify_on_push"])
                if "notify_on_failure" in deployment:
                    config.notify_on_failure = bool(deployment["notify_on_failure"])
            except (json.JSONDecodeError, ValueError, TypeError) as e:
                logger.warning(f"Failed to parse project config at {project_config_path}: {e}")

        return config

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "mode": self.mode.value,
            "target_branch": self.target_branch,
            "wait_for_all_worktrees": self.wait_for_all_worktrees,
            "push_retries": self.push_retries,
            "push_retry_delay": self.push_retry_delay,
            "push_timeout": self.push_timeout,
            "notify_on_push": self.notify_on_push,
            "notify_on_failure": self.notify_on_failure,
        }
