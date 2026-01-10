"""
Forgejo API Client with Timeout and Retry Logic
================================================

HTTP client for Forgejo/Gitea API with:
- Configurable timeouts (default 30s)
- Exponential backoff retry (3 attempts: 1s, 2s, 4s)
- Structured logging for monitoring
- Async HTTP execution for non-blocking operations

Forgejo is API-compatible with Gitea, so this client works with both.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

try:
    from .rate_limiter import RateLimiter, RateLimitExceeded
except (ImportError, ValueError, SystemError):
    from rate_limiter import RateLimiter, RateLimitExceeded

# Configure logger
logger = logging.getLogger(__name__)


class ForgejoTimeoutError(Exception):
    """Raised when Forgejo API request times out after all retry attempts."""

    pass


class ForgejoAPIError(Exception):
    """Raised when Forgejo API request fails."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class ForgejoAuthError(Exception):
    """Raised when Forgejo API authentication fails."""

    pass


class PRTooLargeError(Exception):
    """Raised when PR diff exceeds size limits."""

    pass


@dataclass
class ForgejoRequestResult:
    """Result of a Forgejo API request execution."""

    data: Any
    status_code: int
    headers: dict[str, str]
    url: str
    attempts: int
    total_time: float


@dataclass
class ForgejoConfig:
    """Configuration for Forgejo instance."""

    instance_url: str
    token: str
    owner: str = ""
    repo: str = ""

    @classmethod
    def from_env(cls, project_dir: Path | None = None) -> ForgejoConfig:
        """
        Load configuration from environment variables.

        Checks for:
        - FORGEJO_INSTANCE_URL: Base URL (e.g., https://codeberg.org)
        - FORGEJO_TOKEN: API access token
        - FORGEJO_REPO: Repository in owner/repo format (optional)

        Also checks project .env if project_dir is provided.
        """
        import os

        instance_url = os.environ.get("FORGEJO_INSTANCE_URL", "")
        token = os.environ.get("FORGEJO_TOKEN", "")
        repo = os.environ.get("FORGEJO_REPO", "")

        # Try to load from project .env if not found in environment
        if project_dir and (not instance_url or not token):
            env_file = project_dir / ".env"
            if env_file.exists():
                try:
                    with open(env_file) as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "=" in line:
                                key, value = line.split("=", 1)
                                key = key.strip()
                                value = value.strip().strip('"').strip("'")
                                if key == "FORGEJO_INSTANCE_URL" and not instance_url:
                                    instance_url = value
                                elif key == "FORGEJO_TOKEN" and not token:
                                    token = value
                                elif key == "FORGEJO_REPO" and not repo:
                                    repo = value
                except Exception as e:
                    logger.warning(f"Failed to read project .env: {e}")

        owner = ""
        repo_name = ""
        if "/" in repo:
            owner, repo_name = repo.split("/", 1)

        return cls(
            instance_url=instance_url.rstrip("/"),
            token=token,
            owner=owner,
            repo=repo_name,
        )

    def is_valid(self) -> bool:
        """Check if configuration is valid for API usage."""
        return bool(self.instance_url and self.token)

    @property
    def full_repo(self) -> str:
        """Get the full owner/repo string."""
        if self.owner and self.repo:
            return f"{self.owner}/{self.repo}"
        return ""


class ForgejoClient:
    """
    Async client for Forgejo/Gitea API with timeout and retry protection.

    Usage:
        client = ForgejoClient(
            instance_url="https://codeberg.org",
            token="your-api-token",
            owner="owner",
            repo="repo"
        )

        # Simple API call
        result = await client.get("/repos/owner/repo")

        # Convenience methods
        pr_data = await client.pr_get(123)
        diff = await client.pr_diff(123)
        issues = await client.issue_list()
    """

    def __init__(
        self,
        instance_url: str,
        token: str,
        owner: str = "",
        repo: str = "",
        project_dir: Path | None = None,
        default_timeout: float = 30.0,
        max_retries: int = 3,
        enable_rate_limiting: bool = True,
    ):
        """
        Initialize Forgejo API client.

        Args:
            instance_url: Base URL of the Forgejo instance (e.g., https://codeberg.org)
            token: API access token
            owner: Repository owner
            repo: Repository name
            project_dir: Project directory (optional)
            default_timeout: Default timeout in seconds for requests
            max_retries: Maximum number of retry attempts
            enable_rate_limiting: Whether to enforce rate limiting
        """
        self.instance_url = instance_url.rstrip("/")
        self.token = token
        self.owner = owner
        self.repo = repo
        self.project_dir = Path(project_dir) if project_dir else None
        self.default_timeout = default_timeout
        self.max_retries = max_retries
        self.enable_rate_limiting = enable_rate_limiting

        # Validate configuration
        if not self.instance_url:
            raise ValueError("instance_url is required")
        if not self.token:
            raise ValueError("token is required")

        # Initialize rate limiter singleton
        if enable_rate_limiting:
            self._rate_limiter = RateLimiter.get_instance()

        # Import aiohttp here to avoid import errors if not installed
        try:
            import aiohttp

            self._aiohttp = aiohttp
        except ImportError:
            raise ImportError(
                "aiohttp is required for ForgejoClient. "
                "Install with: pip install aiohttp"
            )

    @classmethod
    def from_config(
        cls,
        config: ForgejoConfig,
        project_dir: Path | None = None,
        **kwargs: Any,
    ) -> ForgejoClient:
        """Create client from ForgejoConfig."""
        return cls(
            instance_url=config.instance_url,
            token=config.token,
            owner=config.owner,
            repo=config.repo,
            project_dir=project_dir,
            **kwargs,
        )

    def _get_api_url(self, endpoint: str) -> str:
        """Build full API URL from endpoint."""
        if endpoint.startswith("/"):
            endpoint = endpoint[1:]
        return f"{self.instance_url}/api/v1/{endpoint}"

    def _get_headers(self) -> dict[str, str]:
        """Get headers for API requests."""
        return {
            "Authorization": f"token {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
        raise_on_error: bool = True,
    ) -> ForgejoRequestResult:
        """
        Execute an API request with timeout and retry logic.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE, PATCH)
            endpoint: API endpoint
            data: Request body (for POST/PUT/PATCH)
            params: Query parameters
            timeout: Timeout in seconds
            raise_on_error: Raise ForgejoAPIError on non-2xx response

        Returns:
            ForgejoRequestResult with response data and metadata

        Raises:
            ForgejoTimeoutError: If request times out after all retries
            ForgejoAPIError: If request fails and raise_on_error is True
            ForgejoAuthError: If authentication fails (401/403)
        """
        timeout = timeout or self.default_timeout
        url = self._get_api_url(endpoint)
        headers = self._get_headers()
        start_time = asyncio.get_event_loop().time()

        # Pre-flight rate limit check
        if self.enable_rate_limiting:
            available, msg = self._rate_limiter.check_github_available()
            if not available:
                logger.info(f"Rate limited, waiting for token: {msg}")
                if not await self._rate_limiter.acquire_github(timeout=30.0):
                    raise RateLimitExceeded(f"Forgejo API rate limit exceeded: {msg}")
            else:
                await self._rate_limiter.acquire_github(timeout=1.0)

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug(
                    f"Forgejo API {method} {endpoint} (attempt {attempt}/{self.max_retries})"
                )

                async with self._aiohttp.ClientSession() as session:
                    request_kwargs = {
                        "url": url,
                        "headers": headers,
                        "timeout": self._aiohttp.ClientTimeout(total=timeout),
                    }

                    if params:
                        request_kwargs["params"] = params

                    if data is not None:
                        request_kwargs["json"] = data

                    async with getattr(session, method.lower())(
                        **request_kwargs
                    ) as response:
                        total_time = asyncio.get_event_loop().time() - start_time

                        # Read response body
                        try:
                            response_data = await response.json()
                        except Exception:
                            response_data = await response.text()

                        result = ForgejoRequestResult(
                            data=response_data,
                            status_code=response.status,
                            headers=dict(response.headers),
                            url=url,
                            attempts=attempt,
                            total_time=total_time,
                        )

                        # Handle errors
                        if response.status >= 400:
                            error_msg = (
                                response_data.get("message", str(response_data))
                                if isinstance(response_data, dict)
                                else str(response_data)
                            )

                            # Authentication errors
                            if response.status in (401, 403):
                                raise ForgejoAuthError(
                                    f"Authentication failed: {error_msg}"
                                )

                            # Rate limiting
                            if response.status == 429:
                                if self.enable_rate_limiting:
                                    self._rate_limiter.record_github_error()
                                raise RateLimitExceeded(
                                    f"Forgejo API rate limit: {error_msg}"
                                )

                            logger.warning(
                                f"Forgejo API {method} {endpoint} failed with "
                                f"status {response.status}: {error_msg}"
                            )

                            if raise_on_error:
                                raise ForgejoAPIError(
                                    f"Forgejo API error: {error_msg}",
                                    status_code=response.status,
                                )

                        else:
                            logger.debug(
                                f"Forgejo API {method} {endpoint} completed "
                                f"(attempt {attempt}, {total_time:.2f}s)"
                            )

                        return result

            except asyncio.TimeoutError:
                backoff_delay = 2 ** (attempt - 1)
                logger.warning(
                    f"Forgejo API {method} {endpoint} timed out after {timeout}s "
                    f"(attempt {attempt}/{self.max_retries})"
                )

                if attempt < self.max_retries:
                    logger.info(f"Retrying in {backoff_delay}s...")
                    await asyncio.sleep(backoff_delay)
                    continue
                else:
                    total_time = asyncio.get_event_loop().time() - start_time
                    raise ForgejoTimeoutError(
                        f"Forgejo API {method} {endpoint} timed out after "
                        f"{self.max_retries} attempts ({total_time:.1f}s total)"
                    )

            except (
                ForgejoTimeoutError,
                ForgejoAPIError,
                ForgejoAuthError,
                RateLimitExceeded,
            ):
                raise

            except Exception as e:
                logger.error(f"Unexpected error in Forgejo API request: {e}")
                if attempt == self.max_retries:
                    raise ForgejoAPIError(
                        f"Forgejo API {method} {endpoint} failed: {e}"
                    )
                else:
                    backoff_delay = 2 ** (attempt - 1)
                    logger.info(f"Retrying in {backoff_delay}s after error...")
                    await asyncio.sleep(backoff_delay)
                    continue

        raise ForgejoAPIError(
            f"Forgejo API {method} {endpoint} failed after {self.max_retries} attempts"
        )

    # =========================================================================
    # Low-level API methods
    # =========================================================================

    async def get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        """Make a GET request to Forgejo API."""
        result = await self._request("GET", endpoint, params=params, timeout=timeout)
        return result.data

    async def post(
        self,
        endpoint: str,
        data: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        """Make a POST request to Forgejo API."""
        result = await self._request("POST", endpoint, data=data, timeout=timeout)
        return result.data

    async def put(
        self,
        endpoint: str,
        data: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        """Make a PUT request to Forgejo API."""
        result = await self._request("PUT", endpoint, data=data, timeout=timeout)
        return result.data

    async def patch(
        self,
        endpoint: str,
        data: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        """Make a PATCH request to Forgejo API."""
        result = await self._request("PATCH", endpoint, data=data, timeout=timeout)
        return result.data

    async def delete(
        self,
        endpoint: str,
        timeout: float | None = None,
    ) -> Any:
        """Make a DELETE request to Forgejo API."""
        result = await self._request("DELETE", endpoint, timeout=timeout)
        return result.data

    # =========================================================================
    # Helper methods
    # =========================================================================

    def _repo_endpoint(self, path: str = "") -> str:
        """Build endpoint for the configured repository."""
        if not self.owner or not self.repo:
            raise ValueError("owner and repo must be configured")
        base = f"repos/{quote(self.owner)}/{quote(self.repo)}"
        if path:
            return f"{base}/{path}"
        return base

    # =========================================================================
    # Pull Request Operations
    # =========================================================================

    async def pr_list(
        self,
        state: str = "open",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        List pull requests.

        Args:
            state: PR state (open, closed, all)
            limit: Maximum number of PRs to return

        Returns:
            List of PR data dictionaries
        """
        params = {"state": state, "limit": limit}
        return await self.get(self._repo_endpoint("pulls"), params=params)

    async def pr_get(self, pr_number: int) -> dict[str, Any]:
        """
        Get PR data by number.

        Args:
            pr_number: PR number (index)

        Returns:
            PR data dictionary
        """
        return await self.get(self._repo_endpoint(f"pulls/{pr_number}"))

    async def pr_diff(self, pr_number: int) -> str:
        """
        Get PR diff.

        Args:
            pr_number: PR number

        Returns:
            Unified diff string
        """
        # Forgejo returns diff as text when Accept header is set appropriately
        endpoint = self._repo_endpoint(f"pulls/{pr_number}.diff")
        url = self._get_api_url(endpoint)

        async with self._aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"token {self.token}",
                "Accept": "text/plain",
            }
            async with session.get(
                url,
                headers=headers,
                timeout=self._aiohttp.ClientTimeout(total=60.0),
            ) as response:
                if response.status >= 400:
                    raise ForgejoAPIError(
                        f"Failed to get PR diff: {await response.text()}",
                        status_code=response.status,
                    )
                return await response.text()

    async def pr_create(
        self,
        title: str,
        head: str,
        base: str,
        body: str = "",
    ) -> dict[str, Any]:
        """
        Create a new pull request.

        Args:
            title: PR title
            head: Head branch
            base: Base branch
            body: PR description

        Returns:
            Created PR data
        """
        data = {
            "title": title,
            "head": head,
            "base": base,
            "body": body,
        }
        return await self.post(self._repo_endpoint("pulls"), data=data)

    async def pr_merge(
        self,
        pr_number: int,
        merge_method: str = "merge",
        commit_title: str | None = None,
        commit_message: str | None = None,
    ) -> None:
        """
        Merge a pull request.

        Args:
            pr_number: PR number to merge
            merge_method: Merge method - "merge", "squash", or "rebase"
            commit_title: Custom merge commit title (optional)
            commit_message: Custom merge commit message (optional)
        """
        # Map to Forgejo merge styles
        merge_style_map = {
            "merge": "merge",
            "squash": "squash",
            "rebase": "rebase-merge",
        }
        data = {
            "Do": merge_style_map.get(merge_method, "merge"),
        }
        if commit_title:
            data["MergeTitleField"] = commit_title
        if commit_message:
            data["MergeMessageField"] = commit_message

        await self.post(self._repo_endpoint(f"pulls/{pr_number}/merge"), data=data)

    async def pr_review(
        self,
        pr_number: int,
        body: str,
        event: str = "COMMENT",
    ) -> int:
        """
        Submit a review on a PR.

        Args:
            pr_number: PR number
            body: Review comment body
            event: Review event (APPROVE, REQUEST_CHANGES, COMMENT)

        Returns:
            Review ID
        """
        data = {
            "body": body,
            "event": event.upper(),
        }
        result = await self.post(
            self._repo_endpoint(f"pulls/{pr_number}/reviews"),
            data=data,
        )
        return result.get("id", 0)

    async def pr_comment(self, pr_number: int, body: str) -> None:
        """Post a comment on a pull request."""
        data = {"body": body}
        await self.post(self._repo_endpoint(f"issues/{pr_number}/comments"), data=data)

    async def pr_get_files(self, pr_number: int) -> list[dict[str, Any]]:
        """Get files changed in a PR."""
        return await self.get(self._repo_endpoint(f"pulls/{pr_number}/files"))

    async def pr_get_commits(self, pr_number: int) -> list[dict[str, Any]]:
        """Get commits in a PR."""
        return await self.get(self._repo_endpoint(f"pulls/{pr_number}/commits"))

    # =========================================================================
    # Issue Operations
    # =========================================================================

    async def issue_list(
        self,
        state: str = "open",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        List issues.

        Args:
            state: Issue state (open, closed, all)
            limit: Maximum number of issues to return

        Returns:
            List of issue data dictionaries
        """
        params = {"state": state, "limit": limit, "type": "issues"}
        return await self.get(self._repo_endpoint("issues"), params=params)

    async def issue_get(self, issue_number: int) -> dict[str, Any]:
        """
        Get issue data by number.

        Args:
            issue_number: Issue number (index)

        Returns:
            Issue data dictionary
        """
        return await self.get(self._repo_endpoint(f"issues/{issue_number}"))

    async def issue_create(
        self,
        title: str,
        body: str = "",
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Create a new issue.

        Args:
            title: Issue title
            body: Issue body
            labels: Label names to apply
            assignees: Usernames to assign

        Returns:
            Created issue data
        """
        data = {
            "title": title,
            "body": body,
        }
        if labels:
            data["labels"] = labels
        if assignees:
            data["assignees"] = assignees

        return await self.post(self._repo_endpoint("issues"), data=data)

    async def issue_comment(self, issue_number: int, body: str) -> dict[str, Any]:
        """
        Post a comment to an issue.

        Args:
            issue_number: Issue number
            body: Comment body

        Returns:
            Created comment data
        """
        data = {"body": body}
        return await self.post(
            self._repo_endpoint(f"issues/{issue_number}/comments"),
            data=data,
        )

    async def issue_close(self, issue_number: int) -> None:
        """Close an issue."""
        data = {"state": "closed"}
        await self.patch(self._repo_endpoint(f"issues/{issue_number}"), data=data)

    async def issue_reopen(self, issue_number: int) -> None:
        """Reopen an issue."""
        data = {"state": "open"}
        await self.patch(self._repo_endpoint(f"issues/{issue_number}"), data=data)

    async def issue_get_comments(self, issue_number: int) -> list[dict[str, Any]]:
        """Get comments on an issue."""
        return await self.get(self._repo_endpoint(f"issues/{issue_number}/comments"))

    # =========================================================================
    # Label Operations
    # =========================================================================

    async def label_list(self) -> list[dict[str, Any]]:
        """List all labels in the repository."""
        return await self.get(self._repo_endpoint("labels"))

    async def label_create(
        self,
        name: str,
        color: str,
        description: str = "",
    ) -> dict[str, Any]:
        """Create a label in the repository."""
        data = {
            "name": name,
            "color": color.lstrip("#"),  # Forgejo expects color without #
            "description": description,
        }
        return await self.post(self._repo_endpoint("labels"), data=data)

    async def issue_add_labels(
        self,
        issue_number: int,
        labels: list[int],
    ) -> None:
        """
        Add labels to an issue.

        Args:
            issue_number: Issue number
            labels: List of label IDs
        """
        if not labels:
            return
        data = {"labels": labels}
        await self.post(
            self._repo_endpoint(f"issues/{issue_number}/labels"),
            data=data,
        )

    async def issue_remove_label(
        self,
        issue_number: int,
        label_id: int,
    ) -> None:
        """Remove a label from an issue."""
        await self.delete(
            self._repo_endpoint(f"issues/{issue_number}/labels/{label_id}")
        )

    # =========================================================================
    # Repository Operations
    # =========================================================================

    async def get_repository_info(self) -> dict[str, Any]:
        """Get repository information."""
        return await self.get(self._repo_endpoint())

    async def get_default_branch(self) -> str:
        """Get the default branch name."""
        repo_info = await self.get_repository_info()
        return repo_info.get("default_branch", "main")

    async def get_branches(self) -> list[dict[str, Any]]:
        """List repository branches."""
        return await self.get(self._repo_endpoint("branches"))

    async def get_collaborators(self) -> list[dict[str, Any]]:
        """List repository collaborators."""
        return await self.get(self._repo_endpoint("collaborators"))

    # =========================================================================
    # User Operations
    # =========================================================================

    async def get_current_user(self) -> dict[str, Any]:
        """Get the currently authenticated user."""
        return await self.get("user")

    async def search_users(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Search for users."""
        params = {"q": query, "limit": limit}
        result = await self.get("users/search", params=params)
        return result.get("data", [])
