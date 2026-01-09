"""
Forgejo Provider Implementation
===============================

Implements the GitProvider protocol for Forgejo/Gitea instances.
Supports self-hosted instances with configurable URLs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Import from parent package or direct import
try:
    from ..forgejo_client import ForgejoClient, ForgejoConfig
except (ImportError, ValueError, SystemError):
    from forgejo_client import ForgejoClient, ForgejoConfig

from .protocol import (
    IssueData,
    IssueFilters,
    LabelData,
    PRData,
    PRFilters,
    ProviderType,
    ReviewData,
)


@dataclass
class ForgejoProvider:
    """
    Forgejo/Gitea implementation of the GitProvider protocol.

    Uses the Forgejo REST API for all operations.
    Compatible with both Forgejo and Gitea instances.

    Usage:
        provider = ForgejoProvider(
            instance_url="https://codeberg.org",
            token="your-api-token",
            repo="owner/repo"
        )
        pr = await provider.fetch_pr(123)
        await provider.post_review(123, review)
    """

    _repo: str
    _instance_url: str
    _token: str
    _client: ForgejoClient | None = None
    _project_dir: str | None = None
    enable_rate_limiting: bool = True

    def __post_init__(self):
        if self._client is None:
            # Parse owner/repo
            if "/" in self._repo:
                owner, repo = self._repo.split("/", 1)
            else:
                raise ValueError("repo must be in 'owner/repo' format")

            project_dir = Path(self._project_dir) if self._project_dir else None
            self._client = ForgejoClient(
                instance_url=self._instance_url,
                token=self._token,
                owner=owner,
                repo=repo,
                project_dir=project_dir,
                enable_rate_limiting=self.enable_rate_limiting,
            )

    @classmethod
    def from_config(
        cls,
        config: ForgejoConfig,
        project_dir: Path | None = None,
        enable_rate_limiting: bool = True,
    ) -> ForgejoProvider:
        """Create provider from ForgejoConfig."""
        return cls(
            _repo=config.full_repo,
            _instance_url=config.instance_url,
            _token=config.token,
            _project_dir=str(project_dir) if project_dir else None,
            enable_rate_limiting=enable_rate_limiting,
        )

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.FORGEJO

    @property
    def repo(self) -> str:
        return self._repo

    @property
    def instance_url(self) -> str:
        return self._instance_url

    @property
    def client(self) -> ForgejoClient:
        """Get the underlying ForgejoClient."""
        return self._client

    # -------------------------------------------------------------------------
    # Pull Request Operations
    # -------------------------------------------------------------------------

    async def fetch_pr(self, number: int) -> PRData:
        """Fetch a pull request by number."""
        pr_data = await self._client.pr_get(number)
        diff = await self._client.pr_diff(number)
        files = await self._client.pr_get_files(number)

        return self._parse_pr_data(pr_data, diff, files)

    async def fetch_prs(self, filters: PRFilters | None = None) -> list[PRData]:
        """Fetch pull requests with optional filters."""
        filters = filters or PRFilters()

        # Map state for Forgejo API
        state_map = {
            "open": "open",
            "closed": "closed",
            "merged": "closed",  # Forgejo uses closed state for merged
            "all": "all",
        }
        state = state_map.get(filters.state, "open")

        prs = await self._client.pr_list(state=state, limit=filters.limit)

        result = []
        for pr_data in prs:
            # Apply additional filters
            if filters.author:
                author = pr_data.get("user", {}).get("login", "")
                if author != filters.author:
                    continue

            if filters.base_branch:
                base = pr_data.get("base", {}).get("ref", "")
                if base != filters.base_branch:
                    continue

            if filters.head_branch:
                head = pr_data.get("head", {}).get("ref", "")
                if head != filters.head_branch:
                    continue

            if filters.labels:
                pr_labels = [label.get("name", "") for label in pr_data.get("labels", [])]
                if not all(label in pr_labels for label in filters.labels):
                    continue

            # For merged filter
            if filters.state == "merged" and not pr_data.get("merged"):
                continue

            # Parse to PRData (lightweight, no diff)
            result.append(self._parse_pr_data(pr_data, "", []))

        return result

    async def fetch_pr_diff(self, number: int) -> str:
        """Fetch the diff for a pull request."""
        return await self._client.pr_diff(number)

    async def post_review(self, pr_number: int, review: ReviewData) -> int:
        """Post a review to a pull request."""
        # Map event types
        event_map = {
            "approve": "APPROVE",
            "request_changes": "REQUEST_CHANGES",
            "request-changes": "REQUEST_CHANGES",
            "comment": "COMMENT",
        }
        event = event_map.get(review.event.lower(), "COMMENT")

        return await self._client.pr_review(
            pr_number=pr_number,
            body=review.body,
            event=event,
        )

    async def merge_pr(
        self,
        pr_number: int,
        merge_method: str = "merge",
        commit_title: str | None = None,
    ) -> bool:
        """Merge a pull request."""
        try:
            await self._client.pr_merge(
                pr_number=pr_number,
                merge_method=merge_method,
                commit_title=commit_title,
            )
            return True
        except Exception:
            return False

    async def close_pr(
        self,
        pr_number: int,
        comment: str | None = None,
    ) -> bool:
        """Close a pull request without merging."""
        try:
            if comment:
                await self.add_comment(pr_number, comment)

            # Update PR state to closed
            await self._client.patch(
                self._client._repo_endpoint(f"pulls/{pr_number}"),
                data={"state": "closed"},
            )
            return True
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # Issue Operations
    # -------------------------------------------------------------------------

    async def fetch_issue(self, number: int) -> IssueData:
        """Fetch an issue by number."""
        issue_data = await self._client.issue_get(number)
        return self._parse_issue_data(issue_data)

    async def fetch_issues(
        self, filters: IssueFilters | None = None
    ) -> list[IssueData]:
        """Fetch issues with optional filters."""
        filters = filters or IssueFilters()

        issues = await self._client.issue_list(
            state=filters.state,
            limit=filters.limit,
        )

        result = []
        for issue_data in issues:
            # Skip PRs (Forgejo returns both issues and PRs)
            if not filters.include_prs and issue_data.get("pull_request"):
                continue

            # Apply filters
            if filters.author:
                author = issue_data.get("user", {}).get("login", "")
                if author != filters.author:
                    continue

            if filters.labels:
                issue_labels = [
                    label.get("name", "") for label in issue_data.get("labels", [])
                ]
                if not all(label in issue_labels for label in filters.labels):
                    continue

            if filters.assignee:
                assignees = [
                    a.get("login", "") for a in issue_data.get("assignees", [])
                ]
                if filters.assignee not in assignees:
                    continue

            result.append(self._parse_issue_data(issue_data))

        return result

    async def create_issue(
        self,
        title: str,
        body: str,
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
    ) -> IssueData:
        """Create a new issue."""
        issue_data = await self._client.issue_create(
            title=title,
            body=body,
            labels=labels,
            assignees=assignees,
        )
        return self._parse_issue_data(issue_data)

    async def close_issue(
        self,
        number: int,
        comment: str | None = None,
    ) -> bool:
        """Close an issue."""
        try:
            if comment:
                await self.add_comment(number, comment)
            await self._client.issue_close(number)
            return True
        except Exception:
            return False

    async def add_comment(
        self,
        issue_or_pr_number: int,
        body: str,
    ) -> int:
        """Add a comment to an issue or PR."""
        result = await self._client.issue_comment(issue_or_pr_number, body)
        return result.get("id", 0)

    # -------------------------------------------------------------------------
    # Label Operations
    # -------------------------------------------------------------------------

    async def apply_labels(
        self,
        issue_or_pr_number: int,
        labels: list[str],
    ) -> None:
        """Apply labels to an issue or PR."""
        if not labels:
            return

        # Get all labels to find IDs
        all_labels = await self._client.label_list()
        label_ids = []
        for label in all_labels:
            if label.get("name") in labels:
                label_ids.append(label.get("id"))

        if label_ids:
            await self._client.issue_add_labels(issue_or_pr_number, label_ids)

    async def remove_labels(
        self,
        issue_or_pr_number: int,
        labels: list[str],
    ) -> None:
        """Remove labels from an issue or PR."""
        if not labels:
            return

        # Get all labels to find IDs
        all_labels = await self._client.label_list()
        for label in all_labels:
            if label.get("name") in labels:
                try:
                    await self._client.issue_remove_label(
                        issue_or_pr_number,
                        label.get("id"),
                    )
                except Exception:
                    pass  # Label might not be on the issue

    async def create_label(self, label: LabelData) -> None:
        """Create a label in the repository."""
        await self._client.label_create(
            name=label.name,
            color=label.color,
            description=label.description,
        )

    async def list_labels(self) -> list[LabelData]:
        """List all labels in the repository."""
        labels_data = await self._client.label_list()
        return [
            LabelData(
                name=label.get("name", ""),
                color=label.get("color", ""),
                description=label.get("description", ""),
            )
            for label in labels_data
        ]

    # -------------------------------------------------------------------------
    # Repository Operations
    # -------------------------------------------------------------------------

    async def get_repository_info(self) -> dict[str, Any]:
        """Get repository information."""
        return await self._client.get_repository_info()

    async def get_default_branch(self) -> str:
        """Get the default branch name."""
        return await self._client.get_default_branch()

    async def check_permissions(self, username: str) -> str:
        """Check a user's permission level on the repository."""
        try:
            collaborators = await self._client.get_collaborators()
            for collab in collaborators:
                if collab.get("login") == username:
                    # Map Forgejo permissions to standard levels
                    permissions = collab.get("permissions", {})
                    if permissions.get("admin"):
                        return "admin"
                    if permissions.get("push"):
                        return "write"
                    if permissions.get("pull"):
                        return "read"
            return "none"
        except Exception:
            return "none"

    # -------------------------------------------------------------------------
    # API Operations
    # -------------------------------------------------------------------------

    async def api_get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Make a GET request to the Forgejo API."""
        return await self._client.get(endpoint, params=params)

    async def api_post(
        self,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> Any:
        """Make a POST request to the Forgejo API."""
        return await self._client.post(endpoint, data=data)

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    def _parse_pr_data(
        self,
        data: dict[str, Any],
        diff: str,
        files: list[dict[str, Any]],
    ) -> PRData:
        """Parse Forgejo PR data into PRData."""
        user = data.get("user", {})
        author_login = user.get("login", "unknown") if isinstance(user, dict) else "unknown"

        labels = []
        for label in data.get("labels", []) or []:
            if isinstance(label, dict):
                labels.append(label.get("name", ""))

        # Get branch info from head/base refs
        head_ref = data.get("head", {})
        base_ref = data.get("base", {})
        source_branch = head_ref.get("ref", "") if isinstance(head_ref, dict) else ""
        target_branch = base_ref.get("ref", "") if isinstance(base_ref, dict) else ""

        # Get reviewers from review requests
        reviewers = []
        for req in data.get("requested_reviewers", []) or []:
            if isinstance(req, dict):
                reviewers.append(req.get("login", ""))

        # Map state
        state = "open"
        if data.get("merged"):
            state = "merged"
        elif data.get("state") == "closed":
            state = "closed"

        # Build URL
        url = data.get("html_url", "")
        if not url and self._instance_url:
            url = f"{self._instance_url}/{self._repo}/pulls/{data.get('number', 0)}"

        return PRData(
            number=data.get("number", 0),
            title=data.get("title", ""),
            body=data.get("body", "") or "",
            author=author_login,
            state=state,
            source_branch=source_branch,
            target_branch=target_branch,
            additions=data.get("additions", 0),
            deletions=data.get("deletions", 0),
            changed_files=data.get("changed_files", len(files)),
            files=files,
            diff=diff,
            url=url,
            created_at=self._parse_datetime(data.get("created_at")),
            updated_at=self._parse_datetime(data.get("updated_at")),
            labels=labels,
            reviewers=reviewers,
            is_draft=data.get("draft", False),
            mergeable=data.get("mergeable", True),
            provider=ProviderType.FORGEJO,
            raw_data=data,
        )

    def _parse_issue_data(self, data: dict[str, Any]) -> IssueData:
        """Parse Forgejo issue data into IssueData."""
        user = data.get("user", {})
        author_login = user.get("login", "unknown") if isinstance(user, dict) else "unknown"

        labels = []
        for label in data.get("labels", []) or []:
            if isinstance(label, dict):
                labels.append(label.get("name", ""))

        assignees = []
        for assignee in data.get("assignees", []) or []:
            if isinstance(assignee, dict):
                assignees.append(assignee.get("login", ""))

        milestone = data.get("milestone")
        if isinstance(milestone, dict):
            milestone = milestone.get("title")

        # Build URL
        url = data.get("html_url", "")
        if not url and self._instance_url:
            url = f"{self._instance_url}/{self._repo}/issues/{data.get('number', 0)}"

        return IssueData(
            number=data.get("number", 0),
            title=data.get("title", ""),
            body=data.get("body", "") or "",
            author=author_login,
            state=data.get("state", "open"),
            labels=labels,
            created_at=self._parse_datetime(data.get("created_at")),
            updated_at=self._parse_datetime(data.get("updated_at")),
            url=url,
            assignees=assignees,
            milestone=milestone,
            provider=ProviderType.FORGEJO,
            raw_data=data,
        )

    def _parse_datetime(self, dt_str: str | None) -> datetime:
        """Parse ISO datetime string."""
        if not dt_str:
            return datetime.now(timezone.utc)
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return datetime.now(timezone.utc)
