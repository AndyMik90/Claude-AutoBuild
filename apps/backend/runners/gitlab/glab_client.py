"""
GitLab API Client
=================

Client for GitLab API operations.
Uses direct API calls with PRIVATE-TOKEN authentication.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class GitLabConfig:
    """GitLab configuration loaded from project."""

    token: str
    project: str
    instance_url: str


def encode_project_path(project: str) -> str:
    """URL-encode a project path for API calls."""
    return urllib.parse.quote(project, safe="")


class GitLabClient:
    """Client for GitLab API operations."""

    def __init__(
        self,
        project_dir: Path,
        config: GitLabConfig,
        default_timeout: float = 30.0,
    ):
        self.project_dir = Path(project_dir)
        self.config = config
        self.default_timeout = default_timeout

    def _api_url(self, endpoint: str) -> str:
        """Build full API URL."""
        base = self.config.instance_url.rstrip("/")
        if not endpoint.startswith("/"):
            endpoint = f"/{endpoint}"
        return f"{base}/api/v4{endpoint}"

    def _fetch(
        self,
        endpoint: str,
        method: str = "GET",
        data: dict | None = None,
        timeout: float | None = None,
    ) -> Any:
        """Make an API request to GitLab."""
        url = self._api_url(endpoint)
        headers = {
            "PRIVATE-TOKEN": self.config.token,
            "Content-Type": "application/json",
        }

        request_data = None
        if data:
            request_data = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=request_data,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(
                req, timeout=timeout or self.default_timeout
            ) as response:
                if response.status == 204:
                    return None
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8") if e.fp else ""
            raise Exception(f"GitLab API error {e.code}: {error_body}") from e

    def get_mr(self, mr_iid: int) -> dict:
        """Get MR details."""
        encoded_project = encode_project_path(self.config.project)
        return self._fetch(f"/projects/{encoded_project}/merge_requests/{mr_iid}")

    def get_mr_changes(self, mr_iid: int) -> dict:
        """Get MR changes (diff)."""
        encoded_project = encode_project_path(self.config.project)
        return self._fetch(
            f"/projects/{encoded_project}/merge_requests/{mr_iid}/changes"
        )

    def get_mr_diff(self, mr_iid: int) -> str:
        """Get the full diff for an MR."""
        changes = self.get_mr_changes(mr_iid)
        diffs = []
        for change in changes.get("changes", []):
            diff = change.get("diff", "")
            if diff:
                diffs.append(diff)
        return "\n".join(diffs)

    def get_mr_commits(self, mr_iid: int) -> list[dict]:
        """Get commits for an MR."""
        encoded_project = encode_project_path(self.config.project)
        return self._fetch(
            f"/projects/{encoded_project}/merge_requests/{mr_iid}/commits"
        )

    def get_current_user(self) -> dict:
        """Get current authenticated user."""
        return self._fetch("/user")

    def post_mr_note(self, mr_iid: int, body: str) -> dict:
        """Post a note (comment) to an MR."""
        encoded_project = encode_project_path(self.config.project)
        return self._fetch(
            f"/projects/{encoded_project}/merge_requests/{mr_iid}/notes",
            method="POST",
            data={"body": body},
        )

    def approve_mr(self, mr_iid: int) -> dict:
        """Approve an MR."""
        encoded_project = encode_project_path(self.config.project)
        return self._fetch(
            f"/projects/{encoded_project}/merge_requests/{mr_iid}/approve",
            method="POST",
        )

    def merge_mr(self, mr_iid: int, squash: bool = False) -> dict:
        """Merge an MR."""
        encoded_project = encode_project_path(self.config.project)
        data = {}
        if squash:
            data["squash"] = True
        return self._fetch(
            f"/projects/{encoded_project}/merge_requests/{mr_iid}/merge",
            method="PUT",
            data=data if data else None,
        )

    def assign_mr(self, mr_iid: int, user_ids: list[int]) -> dict:
        """Assign users to an MR."""
        encoded_project = encode_project_path(self.config.project)
        return self._fetch(
            f"/projects/{encoded_project}/merge_requests/{mr_iid}",
            method="PUT",
            data={"assignee_ids": user_ids},
        )


def load_gitlab_config(project_dir: Path) -> GitLabConfig | None:
    """Load GitLab config from project's .auto-claude/gitlab/config.json."""
    config_path = project_dir / ".auto-claude" / "gitlab" / "config.json"

    if not config_path.exists():
        return None

    try:
        with open(config_path) as f:
            data = json.load(f)

        token = data.get("token")
        project = data.get("project")
        instance_url = data.get("instance_url", "https://gitlab.com")

        if not token or not project:
            return None

        return GitLabConfig(
            token=token,
            project=project,
            instance_url=instance_url,
        )
    except Exception:
        return None
