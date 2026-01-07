"""
Azure DevOps Provider Implementation
=====================================

Implements the GitProvider protocol for Azure DevOps.
Uses the Azure DevOps Python API for all operations.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

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
class AzureDevOpsProvider:
    """
    Azure DevOps implementation of the GitProvider protocol.

    Uses the Azure DevOps REST API via the azure-devops Python package.

    Usage:
        provider = AzureDevOpsProvider(
            organization="myorg",
            project="myproject",
            repo_name="myrepo"
        )
        pr = await provider.fetch_pr(123)
        await provider.post_review(123, review)
    """

    _organization: str | None = None
    _project: str | None = None
    _repo_name: str | None = None
    _pat: str | None = None
    _instance_url: str | None = None

    # Cached clients
    _connection: Any = None
    _git_client: Any = None
    _wit_client: Any = None

    def __post_init__(self):
        # Load from environment if not provided
        self._organization = self._organization or os.getenv("ADO_ORGANIZATION")
        self._project = self._project or os.getenv("ADO_PROJECT")
        self._repo_name = self._repo_name or os.getenv("ADO_REPO_NAME") or self._project
        self._pat = self._pat or os.getenv("ADO_PAT")
        self._instance_url = self._instance_url or os.getenv(
            "ADO_INSTANCE_URL", "https://dev.azure.com"
        )

        if not all([self._organization, self._project, self._pat]):
            raise ValueError(
                "Azure DevOps provider requires ADO_ORGANIZATION, ADO_PROJECT, and ADO_PAT. "
                "Set these environment variables or pass them to the constructor."
            )

    def _ensure_connection(self):
        """Lazily initialize the Azure DevOps connection."""
        if self._connection is None:
            try:
                from azure.devops.connection import Connection
                from msrest.authentication import BasicAuthentication
            except ImportError:
                raise ImportError(
                    "Azure DevOps SDK not installed. "
                    "Install with: pip install azure-devops"
                )

            credentials = BasicAuthentication("", self._pat)
            org_url = f"{self._instance_url}/{self._organization}"
            self._connection = Connection(base_url=org_url, creds=credentials)

    @property
    def git_client(self):
        """Get the Git API client."""
        self._ensure_connection()
        if self._git_client is None:
            self._git_client = self._connection.clients.get_git_client()
        return self._git_client

    @property
    def wit_client(self):
        """Get the Work Item Tracking API client."""
        self._ensure_connection()
        if self._wit_client is None:
            self._wit_client = self._connection.clients.get_work_item_tracking_client()
        return self._wit_client

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.AZURE_DEVOPS

    @property
    def repo(self) -> str:
        """Get repository in org/project/repo format."""
        return f"{self._organization}/{self._project}/{self._repo_name}"

    # -------------------------------------------------------------------------
    # Pull Request Operations
    # -------------------------------------------------------------------------

    async def fetch_pr(self, number: int) -> PRData:
        """Fetch a pull request by ID."""
        pr = self.git_client.get_pull_request(
            repository_id=self._repo_name,
            pull_request_id=number,
            project=self._project,
        )

        # Get the diff
        diff = await self.fetch_pr_diff(number)

        return self._parse_pr_data(pr, diff)

    async def fetch_prs(self, filters: PRFilters | None = None) -> list[PRData]:
        """Fetch pull requests with optional filters."""
        filters = filters or PRFilters()

        # Map state to ADO status
        status_map = {"open": "active", "closed": "completed", "all": "all"}
        status = status_map.get(filters.state, "active")

        from azure.devops.v7_1.git.models import GitPullRequestSearchCriteria

        search_criteria = GitPullRequestSearchCriteria(status=status)

        if filters.base_branch:
            search_criteria.target_ref_name = f"refs/heads/{filters.base_branch}"

        if filters.head_branch:
            search_criteria.source_ref_name = f"refs/heads/{filters.head_branch}"

        prs = self.git_client.get_pull_requests(
            repository_id=self._repo_name,
            search_criteria=search_criteria,
            project=self._project,
            top=filters.limit,
        )

        result = []
        for pr in prs:
            # Apply additional filters
            if filters.author:
                author_name = getattr(pr.created_by, "unique_name", "")
                if filters.author.lower() not in author_name.lower():
                    continue

            if filters.labels:
                pr_labels = [label.name for label in (pr.labels or [])]
                if not all(label in pr_labels for label in filters.labels):
                    continue

            result.append(self._parse_pr_data(pr, ""))

        return result

    async def fetch_pr_diff(self, number: int) -> str:
        """Fetch the diff for a pull request."""
        try:
            # Get the PR to find the commits
            pr = self.git_client.get_pull_request(
                repository_id=self._repo_name,
                pull_request_id=number,
                project=self._project,
            )

            # Get commits in the PR
            commits = self.git_client.get_pull_request_commits(
                repository_id=self._repo_name,
                pull_request_id=number,
                project=self._project,
            )

            if not commits:
                return ""

            # Get diff between source and target
            target_version = pr.target_ref_name.replace("refs/heads/", "")
            source_version = pr.source_ref_name.replace("refs/heads/", "")

            # Use the changes endpoint
            changes = self.git_client.get_pull_request_iteration_changes(
                repository_id=self._repo_name,
                pull_request_id=number,
                iteration_id=1,  # First iteration
                project=self._project,
            )

            # Build a simple diff summary
            diff_lines = []
            for change in changes.change_entries or []:
                change_type = getattr(change, "change_type", "edit")
                path = getattr(change.item, "path", "") if change.item else ""
                diff_lines.append(f"--- {change_type}: {path}")

            return "\n".join(diff_lines)

        except Exception as e:
            return f"Error fetching diff: {e}"

    async def post_review(self, pr_number: int, review: ReviewData) -> int:
        """Post a review comment to a pull request."""
        from azure.devops.v7_1.git.models import Comment, CommentThread

        # Create a comment thread
        comment = Comment(content=review.body)
        thread = CommentThread(
            comments=[comment],
            status="active" if review.event == "request_changes" else "closed",
        )

        result = self.git_client.create_thread(
            comment_thread=thread,
            repository_id=self._repo_name,
            pull_request_id=pr_number,
            project=self._project,
        )

        # If approving/rejecting, also set the vote
        if review.event in ("approve", "request_changes"):
            vote = 10 if review.event == "approve" else -10

            # Get current user's reviewer ID
            # Note: This requires getting the current user's identity
            try:
                self.git_client.create_pull_request_reviewer(
                    reviewer={
                        "vote": vote,
                    },
                    repository_id=self._repo_name,
                    pull_request_id=pr_number,
                    reviewer_id="me",  # Current user
                    project=self._project,
                )
            except Exception:
                pass  # Vote may fail if user is not a reviewer

        return result.id if result else 0

    async def merge_pr(
        self,
        pr_number: int,
        merge_method: str = "squash",
        commit_title: str | None = None,
    ) -> bool:
        """Merge a pull request."""
        try:
            pr = self.git_client.get_pull_request(
                repository_id=self._repo_name,
                pull_request_id=pr_number,
                project=self._project,
            )

            # Set completion options
            from azure.devops.v7_1.git.models import GitPullRequest

            merge_strategy_map = {
                "squash": "squash",
                "rebase": "rebase",
                "merge": "noFastForward",
            }

            update_pr = GitPullRequest(
                status="completed",
                last_merge_source_commit=pr.last_merge_source_commit,
                completion_options={
                    "deleteSourceBranch": True,
                    "mergeStrategy": merge_strategy_map.get(merge_method, "squash"),
                    "mergeCommitMessage": commit_title,
                },
            )

            self.git_client.update_pull_request(
                git_pull_request_to_update=update_pr,
                repository_id=self._repo_name,
                pull_request_id=pr_number,
                project=self._project,
            )

            return True
        except Exception:
            return False

    async def close_pr(
        self,
        pr_number: int,
        comment: str | None = None,
    ) -> bool:
        """Close a pull request without merging (abandon)."""
        try:
            if comment:
                await self.add_comment(pr_number, comment)

            from azure.devops.v7_1.git.models import GitPullRequest

            update_pr = GitPullRequest(status="abandoned")

            self.git_client.update_pull_request(
                git_pull_request_to_update=update_pr,
                repository_id=self._repo_name,
                pull_request_id=pr_number,
                project=self._project,
            )

            return True
        except Exception:
            return False

    # -------------------------------------------------------------------------
    # Issue (Work Item) Operations
    # -------------------------------------------------------------------------

    async def fetch_issue(self, number: int) -> IssueData:
        """Fetch a work item by ID."""
        wi = self.wit_client.get_work_item(
            id=number,
            project=self._project,
            expand="All",
        )
        return self._parse_work_item(wi)

    async def fetch_issues(
        self, filters: IssueFilters | None = None
    ) -> list[IssueData]:
        """Fetch work items with optional filters."""
        filters = filters or IssueFilters()

        from azure.devops.v7_1.work_item_tracking.models import Wiql

        # Build WIQL query
        conditions = [f"[System.TeamProject] = '{self._project}'"]

        if filters.state == "open":
            conditions.append(
                "([System.State] = 'New' OR [System.State] = 'Active')"
            )
        elif filters.state == "closed":
            conditions.append(
                "([System.State] = 'Closed' OR [System.State] = 'Resolved')"
            )

        if filters.author:
            conditions.append(f"[System.CreatedBy] = '{filters.author}'")

        if filters.assignee:
            conditions.append(f"[System.AssignedTo] = '{filters.assignee}'")

        if filters.labels:
            for label in filters.labels:
                conditions.append(f"[System.Tags] CONTAINS '{label}'")

        query = f"""
            SELECT [System.Id]
            FROM WorkItems
            WHERE {' AND '.join(conditions)}
            ORDER BY [System.ChangedDate] DESC
        """

        wiql = Wiql(query=query)
        result = self.wit_client.query_by_wiql(
            wiql=wiql,
            project=self._project,
            top=filters.limit,
        )

        if not result.work_items:
            return []

        # Fetch full work item details
        ids = [wi.id for wi in result.work_items]
        work_items = self.wit_client.get_work_items(
            ids=ids,
            project=self._project,
            expand="All",
        )

        return [self._parse_work_item(wi) for wi in work_items]

    async def create_issue(
        self,
        title: str,
        body: str,
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
    ) -> IssueData:
        """Create a new work item (Task by default)."""
        from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

        operations = [
            JsonPatchOperation(
                op="add",
                path="/fields/System.Title",
                value=title,
            ),
            JsonPatchOperation(
                op="add",
                path="/fields/System.Description",
                value=body,
            ),
        ]

        if labels:
            operations.append(
                JsonPatchOperation(
                    op="add",
                    path="/fields/System.Tags",
                    value="; ".join(labels),
                )
            )

        if assignees and len(assignees) > 0:
            operations.append(
                JsonPatchOperation(
                    op="add",
                    path="/fields/System.AssignedTo",
                    value=assignees[0],  # ADO only supports one assignee
                )
            )

        wi = self.wit_client.create_work_item(
            document=operations,
            project=self._project,
            type="Task",
        )

        return self._parse_work_item(wi)

    async def close_issue(
        self,
        number: int,
        comment: str | None = None,
    ) -> bool:
        """Close a work item."""
        try:
            if comment:
                await self.add_comment(number, comment)

            from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

            operations = [
                JsonPatchOperation(
                    op="replace",
                    path="/fields/System.State",
                    value="Closed",
                )
            ]

            self.wit_client.update_work_item(
                document=operations,
                id=number,
                project=self._project,
            )

            return True
        except Exception:
            return False

    async def add_comment(
        self,
        issue_or_pr_number: int,
        body: str,
    ) -> int:
        """Add a comment to a work item or PR."""
        # For work items, add a comment via the Discussion field
        try:
            from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

            # Add to history (comment)
            operations = [
                JsonPatchOperation(
                    op="add",
                    path="/fields/System.History",
                    value=body,
                )
            ]

            self.wit_client.update_work_item(
                document=operations,
                id=issue_or_pr_number,
                project=self._project,
            )

            return 0  # ADO doesn't return comment ID for work items
        except Exception:
            # Try as PR comment
            try:
                from azure.devops.v7_1.git.models import Comment, CommentThread

                comment = Comment(content=body)
                thread = CommentThread(comments=[comment], status="active")

                result = self.git_client.create_thread(
                    comment_thread=thread,
                    repository_id=self._repo_name,
                    pull_request_id=issue_or_pr_number,
                    project=self._project,
                )
                return result.id if result else 0
            except Exception:
                return 0

    # -------------------------------------------------------------------------
    # Label Operations (via Tags in ADO)
    # -------------------------------------------------------------------------

    async def apply_labels(
        self,
        issue_or_pr_number: int,
        labels: list[str],
    ) -> None:
        """Apply tags to a work item."""
        try:
            # Get current tags
            wi = self.wit_client.get_work_item(
                id=issue_or_pr_number,
                project=self._project,
            )

            current_tags = wi.fields.get("System.Tags", "") or ""
            current_tag_list = [t.strip() for t in current_tags.split(";") if t.strip()]

            # Add new tags
            for label in labels:
                if label not in current_tag_list:
                    current_tag_list.append(label)

            from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

            operations = [
                JsonPatchOperation(
                    op="replace",
                    path="/fields/System.Tags",
                    value="; ".join(current_tag_list),
                )
            ]

            self.wit_client.update_work_item(
                document=operations,
                id=issue_or_pr_number,
                project=self._project,
            )
        except Exception:
            pass

    async def remove_labels(
        self,
        issue_or_pr_number: int,
        labels: list[str],
    ) -> None:
        """Remove tags from a work item."""
        try:
            wi = self.wit_client.get_work_item(
                id=issue_or_pr_number,
                project=self._project,
            )

            current_tags = wi.fields.get("System.Tags", "") or ""
            current_tag_list = [t.strip() for t in current_tags.split(";") if t.strip()]

            # Remove specified tags
            for label in labels:
                if label in current_tag_list:
                    current_tag_list.remove(label)

            from azure.devops.v7_1.work_item_tracking.models import JsonPatchOperation

            operations = [
                JsonPatchOperation(
                    op="replace",
                    path="/fields/System.Tags",
                    value="; ".join(current_tag_list),
                )
            ]

            self.wit_client.update_work_item(
                document=operations,
                id=issue_or_pr_number,
                project=self._project,
            )
        except Exception:
            pass

    async def create_label(self, label: LabelData) -> None:
        """
        Create a label (tag) in Azure DevOps.

        Note: ADO doesn't have a separate label/tag creation API.
        Tags are created automatically when first applied to a work item.
        """
        pass  # No-op in ADO

    async def list_labels(self) -> list[LabelData]:
        """
        List all tags used in the project.

        Note: ADO doesn't have a direct API for listing all tags.
        This queries work items to find used tags.
        """
        from azure.devops.v7_1.work_item_tracking.models import Wiql

        wiql = Wiql(
            query=f"""
                SELECT [System.Id], [System.Tags]
                FROM WorkItems
                WHERE [System.TeamProject] = '{self._project}'
                  AND [System.Tags] <> ''
            """
        )

        result = self.wit_client.query_by_wiql(
            wiql=wiql,
            project=self._project,
            top=200,
        )

        if not result.work_items:
            return []

        ids = [wi.id for wi in result.work_items]
        work_items = self.wit_client.get_work_items(
            ids=ids,
            fields=["System.Tags"],
            project=self._project,
        )

        # Collect unique tags
        tags = set()
        for wi in work_items:
            tag_string = wi.fields.get("System.Tags", "") or ""
            for tag in tag_string.split(";"):
                tag = tag.strip()
                if tag:
                    tags.add(tag)

        return [LabelData(name=tag, color="", description="") for tag in sorted(tags)]

    # -------------------------------------------------------------------------
    # Repository Operations
    # -------------------------------------------------------------------------

    async def get_repository_info(self) -> dict[str, Any]:
        """Get repository information."""
        repo = self.git_client.get_repository(
            repository_id=self._repo_name,
            project=self._project,
        )

        return {
            "id": repo.id,
            "name": repo.name,
            "default_branch": repo.default_branch.replace("refs/heads/", "")
            if repo.default_branch
            else "main",
            "web_url": repo.web_url,
            "size": repo.size,
            "project": {
                "id": repo.project.id if repo.project else None,
                "name": repo.project.name if repo.project else self._project,
            },
        }

    async def get_default_branch(self) -> str:
        """Get the default branch name."""
        repo_info = await self.get_repository_info()
        return repo_info.get("default_branch", "main")

    async def check_permissions(self, username: str) -> str:
        """
        Check a user's permission level on the repository.

        Note: ADO permissions are more complex and project-based.
        This returns a simplified permission level.
        """
        # ADO doesn't have a simple permission check like GitHub
        # Return "write" as default for authenticated users
        return "write"

    # -------------------------------------------------------------------------
    # API Operations (Low-level)
    # -------------------------------------------------------------------------

    async def api_get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Make a GET request to the Azure DevOps API."""
        import urllib.request
        import urllib.parse
        import json
        import base64

        url = f"{self._instance_url}/{self._organization}/{self._project}/_apis{endpoint}"

        if params:
            url += "?" + urllib.parse.urlencode(params)

        # Add API version if not present
        if "api-version" not in url:
            separator = "&" if "?" in url else "?"
            url += f"{separator}api-version=7.1"

        auth = base64.b64encode(f":{self._pat}".encode()).decode()

        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Basic {auth}")
        req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())

    async def api_post(
        self,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> Any:
        """Make a POST request to the Azure DevOps API."""
        import urllib.request
        import json
        import base64

        url = f"{self._instance_url}/{self._organization}/{self._project}/_apis{endpoint}"

        if "api-version" not in url:
            separator = "&" if "?" in url else "?"
            url += f"{separator}api-version=7.1"

        auth = base64.b64encode(f":{self._pat}".encode()).decode()

        req = urllib.request.Request(url, method="POST")
        req.add_header("Authorization", f"Basic {auth}")
        req.add_header("Content-Type", "application/json")

        body = json.dumps(data).encode() if data else None

        with urllib.request.urlopen(req, data=body) as response:
            return json.loads(response.read().decode())

    # -------------------------------------------------------------------------
    # Helper Methods
    # -------------------------------------------------------------------------

    def _parse_pr_data(self, pr: Any, diff: str) -> PRData:
        """Parse Azure DevOps PR data into PRData."""
        author = getattr(pr.created_by, "display_name", "unknown")

        labels = []
        for label in pr.labels or []:
            labels.append(label.name)

        # Get file changes
        files = []
        # Note: ADO returns changes differently, would need additional API call

        return PRData(
            number=pr.pull_request_id,
            title=pr.title or "",
            body=pr.description or "",
            author=author,
            state="open" if pr.status == "active" else "closed",
            source_branch=pr.source_ref_name.replace("refs/heads/", "")
            if pr.source_ref_name
            else "",
            target_branch=pr.target_ref_name.replace("refs/heads/", "")
            if pr.target_ref_name
            else "",
            additions=0,  # ADO doesn't provide this directly
            deletions=0,
            changed_files=0,
            files=files,
            diff=diff,
            url=f"{self._instance_url}/{self._organization}/{self._project}/_git/{self._repo_name}/pullrequest/{pr.pull_request_id}",
            created_at=self._parse_datetime(pr.creation_date),
            updated_at=self._parse_datetime(pr.creation_date),  # Use creation as fallback
            labels=labels,
            reviewers=[
                r.display_name for r in (pr.reviewers or []) if hasattr(r, "display_name")
            ],
            is_draft=pr.is_draft if hasattr(pr, "is_draft") else False,
            mergeable=pr.merge_status != "conflicts" if hasattr(pr, "merge_status") else True,
            provider=ProviderType.AZURE_DEVOPS,
            raw_data={"pull_request_id": pr.pull_request_id},
        )

    def _parse_work_item(self, wi: Any) -> IssueData:
        """Parse Azure DevOps work item into IssueData."""
        fields = wi.fields or {}

        author = fields.get("System.CreatedBy", {})
        if isinstance(author, dict):
            author = author.get("displayName", "unknown")
        else:
            author = str(author) if author else "unknown"

        state = fields.get("System.State", "New")
        state_normalized = "closed" if state in ["Closed", "Resolved", "Done"] else "open"

        tags = fields.get("System.Tags", "") or ""
        labels = [t.strip() for t in tags.split(";") if t.strip()]

        assigned = fields.get("System.AssignedTo", {})
        assignees = []
        if assigned:
            if isinstance(assigned, dict):
                assignees = [assigned.get("displayName", "")]
            else:
                assignees = [str(assigned)]

        return IssueData(
            number=wi.id,
            title=fields.get("System.Title", ""),
            body=fields.get("System.Description", "") or "",
            author=author,
            state=state_normalized,
            labels=labels,
            created_at=self._parse_datetime(fields.get("System.CreatedDate")),
            updated_at=self._parse_datetime(fields.get("System.ChangedDate")),
            url=f"{self._instance_url}/{self._organization}/{self._project}/_workitems/edit/{wi.id}",
            assignees=assignees,
            milestone=fields.get("System.IterationPath"),
            provider=ProviderType.AZURE_DEVOPS,
            raw_data={"id": wi.id, "fields": fields},
        )

    def _parse_datetime(self, dt: Any) -> datetime:
        """Parse datetime from various formats."""
        if dt is None:
            return datetime.now(timezone.utc)

        if isinstance(dt, datetime):
            return dt

        if isinstance(dt, str):
            try:
                return datetime.fromisoformat(dt.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pass

        return datetime.now(timezone.utc)
