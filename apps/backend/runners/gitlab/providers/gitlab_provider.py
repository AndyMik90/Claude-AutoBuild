"""
GitLab Provider Implementation
===============================

Implements the GitProvider protocol for GitLab using the GitLab API.
Wraps the existing GitLabClient functionality.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

# Import GitLab client from parent package
try:
    from ..glab_client import GitLabClient, GitLabConfig
except (ImportError, ValueError, SystemError):
    from glab_client import GitLabClient, GitLabConfig

# Import protocol from GitHub providers (shared protocol)
from ...github.providers.protocol import (
    IssueData,
    IssueFilters,
    LabelData,
    PRData,
    PRFilters,
    ProviderType,
    ReviewData,
)


@dataclass
class GitLabProvider:
    """
    GitLab implementation of the GitProvider protocol.

    Uses the GitLab API for all operations.

    Usage:
        config = GitLabConfig(
            token="glpat-xxx",
            project="group/project",
            instance_url="https://gitlab.com"
        )
        provider = GitLabProvider(config=config)
        pr = await provider.fetch_pr(123)  # MR in GitLab terms
        await provider.post_review(123, review)
    """

    _config: GitLabConfig
    _glab_client: GitLabClient | None = None
    _project_dir: str | None = None

    def __post_init__(self):
        if self._glab_client is None:
            from pathlib import Path

            project_dir = Path(self._project_dir) if self._project_dir else Path.cwd()
            self._glab_client = GitLabClient(
                project_dir=project_dir,
                config=self._config,
            )

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.GITLAB

    @property
    def repo(self) -> str:
        """Get the project in group/project format."""
        return self._config.project

    @property
    def glab_client(self) -> GitLabClient:
        """Get the underlying GitLabClient."""
        return self._glab_client

    # -------------------------------------------------------------------------
    # Pull Request Operations (Merge Requests in GitLab)
    # -------------------------------------------------------------------------

    async def fetch_pr(self, number: int) -> PRData:
        """
        Fetch a merge request by IID.

        Note: In GitLab, this is called a Merge Request (MR), but we map it
        to PRData for protocol compatibility.
        """
        mr = self.glab_client.get_mr(number)
        changes = self.glab_client.get_mr_changes(number)

        # Parse dates
        created_at = self._parse_gitlab_date(mr.get("created_at", ""))
        updated_at = self._parse_gitlab_date(mr.get("updated_at", ""))

        # Extract file changes
        files = []
        for change in changes.get("changes", []):
            files.append(
                {
                    "filename": change.get("new_path", change.get("old_path", "")),
                    "status": self._map_change_type(change),
                    "additions": 0,  # GitLab doesn't provide per-file stats in changes
                    "deletions": 0,
                    "changes": 0,
                    "patch": change.get("diff", ""),
                }
            )

        return PRData(
            number=mr["iid"],
            title=mr["title"],
            body=mr.get("description", ""),
            author=mr["author"]["username"],
            state=self._map_mr_state(mr["state"]),
            source_branch=mr["source_branch"],
            target_branch=mr["target_branch"],
            additions=changes.get("additions", 0) if "additions" in changes else 0,
            deletions=changes.get("deletions", 0) if "deletions" in changes else 0,
            changed_files=len(files),
            files=files,
            diff=self.glab_client.get_mr_diff(number),
            url=mr["web_url"],
            created_at=created_at,
            updated_at=updated_at,
            labels=mr.get("labels", []),
            reviewers=[r["username"] for r in mr.get("reviewers", [])],
            is_draft=mr.get("draft", False) or mr.get("work_in_progress", False),
            mergeable=mr.get("merge_status") in ["can_be_merged", "unchecked"],
            provider=ProviderType.GITLAB,
            raw_data=mr,
        )

    async def fetch_prs(self, filters: PRFilters | None = None) -> list[PRData]:
        """
        Fetch merge requests with optional filters.
        """
        # For now, return empty list - would need to implement list_mr in glab_client
        # This is a placeholder for the full implementation
        return []

    async def fetch_pr_diff(self, number: int) -> str:
        """Fetch the diff for a merge request."""
        return self.glab_client.get_mr_diff(number)

    async def post_review(
        self,
        pr_number: int,
        review: ReviewData,
    ) -> int:
        """
        Post a review to a merge request.

        In GitLab, reviews are posted as notes (comments) on the MR.
        """
        # Build review body from findings
        body_parts = [review.body] if review.body else []

        if review.findings:
            body_parts.append("\n## Review Findings\n")
            for finding in review.findings:
                severity_emoji = {
                    "critical": "🔴",
                    "high": "🟠",
                    "medium": "🟡",
                    "low": "🔵",
                    "info": "ℹ️",
                }.get(finding.severity, "•")

                body_parts.append(f"\n### {severity_emoji} {finding.title}")
                body_parts.append(f"**Severity:** {finding.severity.title()}")
                body_parts.append(f"**Category:** {finding.category}")
                if finding.file:
                    location = f"{finding.file}"
                    if finding.line:
                        location += f":L{finding.line}"
                    body_parts.append(f"**Location:** `{location}`")
                body_parts.append(f"\n{finding.description}")
                if finding.suggested_fix:
                    body_parts.append(
                        f"\n**Suggested Fix:**\n```\n{finding.suggested_fix}\n```"
                    )

        full_body = "\n".join(body_parts)

        # Post as a note
        result = self.glab_client.post_mr_note(pr_number, full_body)

        # If event is approve, also approve the MR
        if review.event == "approve":
            self.glab_client.approve_mr(pr_number)

        return result.get("id", 0)

    async def merge_pr(
        self,
        pr_number: int,
        merge_method: str = "merge",
        commit_title: str | None = None,
    ) -> bool:
        """
        Merge a merge request.

        Args:
            pr_number: MR IID
            merge_method: merge or squash (GitLab doesn't support rebase via API)
            commit_title: Not used in GitLab API
        """
        try:
            squash = merge_method == "squash"
            self.glab_client.merge_mr(pr_number, squash=squash)
            return True
        except Exception:
            return False

    async def close_pr(
        self,
        pr_number: int,
        comment: str | None = None,
    ) -> bool:
        """
        Close a merge request without merging.

        GitLab doesn't have a direct close endpoint - would need to add to glab_client.
        """
        if comment:
            self.glab_client.post_mr_note(pr_number, comment)
        # TODO: Implement MR closing in glab_client
        return False

    # -------------------------------------------------------------------------
    # Issue Operations
    # -------------------------------------------------------------------------

    async def fetch_issue(self, number: int) -> IssueData:
        """
        Fetch an issue by IID.

        TODO: Implement issue operations in glab_client.
        """
        raise NotImplementedError("Issue operations not yet implemented for GitLab")

    async def fetch_issues(
        self, filters: IssueFilters | None = None
    ) -> list[IssueData]:
        """Fetch issues with optional filters."""
        raise NotImplementedError("Issue operations not yet implemented for GitLab")

    async def create_issue(
        self,
        title: str,
        body: str,
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
    ) -> IssueData:
        """Create a new issue."""
        raise NotImplementedError("Issue operations not yet implemented for GitLab")

    async def close_issue(
        self,
        number: int,
        comment: str | None = None,
    ) -> bool:
        """Close an issue."""
        raise NotImplementedError("Issue operations not yet implemented for GitLab")

    async def add_comment(
        self,
        issue_or_pr_number: int,
        body: str,
    ) -> int:
        """
        Add a comment to a merge request.

        Note: Currently only supports MRs. Issue comment support requires
        implementing issue operations in glab_client first.
        """
        result = self.glab_client.post_mr_note(issue_or_pr_number, body)
        return result.get("id", 0)

    # -------------------------------------------------------------------------
    # Label Operations
    # -------------------------------------------------------------------------

    async def apply_labels(
        self,
        issue_or_pr_number: int,
        labels: list[str],
    ) -> None:
        """Apply labels to an issue or MR."""
        # TODO: Implement label operations in glab_client
        pass

    async def remove_labels(
        self,
        issue_or_pr_number: int,
        labels: list[str],
    ) -> None:
        """Remove labels from an issue or MR."""
        # TODO: Implement label operations in glab_client
        pass

    async def create_label(
        self,
        label: LabelData,
    ) -> None:
        """Create a label in the repository."""
        # TODO: Implement label operations in glab_client
        pass

    async def list_labels(self) -> list[LabelData]:
        """List all labels in the repository."""
        # TODO: Implement label operations in glab_client
        return []

    # -------------------------------------------------------------------------
    # Repository Operations
    # -------------------------------------------------------------------------

    async def get_repository_info(self) -> dict[str, Any]:
        """Get repository information."""
        # TODO: Implement in glab_client
        return {}

    async def get_default_branch(self) -> str:
        """Get the default branch name."""
        # TODO: Implement in glab_client
        return "main"

    async def check_permissions(self, username: str) -> str:
        """Check a user's permission level on the repository."""
        # TODO: Implement in glab_client
        return "read"

    # -------------------------------------------------------------------------
    # API Operations (Low-level)
    # -------------------------------------------------------------------------

    async def api_get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Make a GET request to the GitLab API."""
        if params:
            from urllib.parse import urlencode

            query_string = urlencode(params)
            endpoint = (
                f"{endpoint}?{query_string}"
                if "?" not in endpoint
                else f"{endpoint}&{query_string}"
            )
        return self.glab_client._fetch(endpoint, method="GET")

    async def api_post(
        self,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> Any:
        """Make a POST request to the GitLab API."""
        return self.glab_client._fetch(endpoint, method="POST", data=data)

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    def _parse_gitlab_date(self, date_str: str) -> datetime:
        """Parse GitLab ISO 8601 date string."""
        if not date_str:
            return datetime.now(timezone.utc)
        try:
            # GitLab uses ISO 8601 format
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return datetime.now(timezone.utc)

    def _map_mr_state(self, state: str) -> str:
        """Map GitLab MR state to protocol state."""
        # GitLab states: opened, closed, merged, locked
        mapping = {
            "opened": "open",
            "closed": "closed",
            "merged": "merged",
            "locked": "closed",
        }
        return mapping.get(state, state)

    def _map_change_type(self, change: dict) -> str:
        """Map GitLab change type to GitHub-style status."""
        # GitLab: new_file, renamed_file, deleted_file, modified
        if change.get("new_file"):
            return "added"
        elif change.get("deleted_file"):
            return "removed"
        elif change.get("renamed_file"):
            return "renamed"
        else:
            return "modified"
