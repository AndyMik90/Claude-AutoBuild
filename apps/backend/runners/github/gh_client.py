"""
GitHub CLI Client with Timeout and Retry Logic
==============================================

Wrapper for gh CLI commands that prevents hung processes through:
- Configurable timeouts (default 30s)
- Exponential backoff retry (3 attempts: 1s, 2s, 4s)
- Structured logging for monitoring
- Async subprocess execution for non-blocking operations

This eliminates the risk of indefinite hangs in GitHub automation workflows.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from .rate_limiter import RateLimiter, RateLimitExceeded
except (ImportError, ValueError, SystemError):
    from rate_limiter import RateLimiter, RateLimitExceeded

# Configure logger
logger = logging.getLogger(__name__)


class GHTimeoutError(Exception):
    """Raised when gh CLI command times out after all retry attempts."""

    pass


class GHCommandError(Exception):
    """Raised when gh CLI command fails with non-zero exit code."""

    pass


class PRTooLargeError(Exception):
    """Raised when PR diff exceeds GitHub's 20,000 line limit."""

    pass


@dataclass
class GHCommandResult:
    """Result of a gh CLI command execution."""

    stdout: str
    stderr: str
    returncode: int
    command: list[str]
    attempts: int
    total_time: float


class GHClient:
    """
    Async client for GitHub CLI with timeout and retry protection.

    Usage:
        client = GHClient(project_dir=Path("/path/to/project"))

        # Simple command
        result = await client.run(["pr", "list"])

        # With custom timeout
        result = await client.run(["pr", "diff", "123"], timeout=60.0)

        # Convenience methods
        pr_data = await client.pr_get(123)
        diff = await client.pr_diff(123)
        await client.pr_review(123, body="LGTM", event="approve")
    """

    def __init__(
        self,
        project_dir: Path,
        default_timeout: float = 30.0,
        max_retries: int = 3,
        enable_rate_limiting: bool = True,
        repo: str | None = None,
    ):
        """
        Initialize GitHub CLI client.

        Args:
            project_dir: Project directory for gh commands
            default_timeout: Default timeout in seconds for commands
            max_retries: Maximum number of retry attempts
            enable_rate_limiting: Whether to enforce rate limiting (default: True)
            repo: Repository in 'owner/repo' format. If provided, uses -R flag
                  instead of inferring from git remotes.
        """
        self.project_dir = Path(project_dir)
        self.default_timeout = default_timeout
        self.max_retries = max_retries
        self.enable_rate_limiting = enable_rate_limiting
        self.repo = repo

        # Initialize rate limiter singleton
        if enable_rate_limiting:
            self._rate_limiter = RateLimiter.get_instance()

    async def run(
        self,
        args: list[str],
        timeout: float | None = None,
        raise_on_error: bool = True,
    ) -> GHCommandResult:
        """
        Execute a gh CLI command with timeout and retry logic.

        Args:
            args: Command arguments (e.g., ["pr", "list"])
            timeout: Timeout in seconds (uses default if None)
            raise_on_error: Raise GHCommandError on non-zero exit

        Returns:
            GHCommandResult with command output and metadata

        Raises:
            GHTimeoutError: If command times out after all retries
            GHCommandError: If command fails and raise_on_error is True
        """
        timeout = timeout or self.default_timeout
        cmd = ["gh"] + args
        start_time = asyncio.get_event_loop().time()

        # Pre-flight rate limit check
        if self.enable_rate_limiting:
            available, msg = self._rate_limiter.check_github_available()
            if not available:
                # Try to acquire (will wait if needed)
                logger.info(f"Rate limited, waiting for token: {msg}")
                if not await self._rate_limiter.acquire_github(timeout=30.0):
                    raise RateLimitExceeded(f"GitHub API rate limit exceeded: {msg}")
            else:
                # Consume a token for this request
                await self._rate_limiter.acquire_github(timeout=1.0)

        for attempt in range(1, self.max_retries + 1):
            try:
                logger.debug(
                    f"Executing gh command (attempt {attempt}/{self.max_retries}): {' '.join(cmd)}"
                )

                # Create subprocess
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=self.project_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

                # Wait for completion with timeout
                try:
                    stdout, stderr = await asyncio.wait_for(
                        proc.communicate(), timeout=timeout
                    )
                except asyncio.TimeoutError:
                    # Kill the hung process
                    try:
                        proc.kill()
                        await proc.wait()
                    except Exception as e:
                        logger.warning(f"Failed to kill hung process: {e}")

                    # Calculate backoff delay
                    backoff_delay = 2 ** (attempt - 1)

                    logger.warning(
                        f"gh {args[0]} timed out after {timeout}s "
                        f"(attempt {attempt}/{self.max_retries})"
                    )

                    # Retry if attempts remain
                    if attempt < self.max_retries:
                        logger.info(f"Retrying in {backoff_delay}s...")
                        await asyncio.sleep(backoff_delay)
                        continue
                    else:
                        # All retries exhausted
                        total_time = asyncio.get_event_loop().time() - start_time
                        logger.error(
                            f"gh {args[0]} timed out after {self.max_retries} attempts "
                            f"({total_time:.1f}s total)"
                        )
                        raise GHTimeoutError(
                            f"gh {args[0]} timed out after {self.max_retries} attempts "
                            f"({timeout}s each, {total_time:.1f}s total)"
                        )

                # Successful execution (no timeout)
                total_time = asyncio.get_event_loop().time() - start_time
                stdout_str = stdout.decode("utf-8")
                stderr_str = stderr.decode("utf-8")

                result = GHCommandResult(
                    stdout=stdout_str,
                    stderr=stderr_str,
                    returncode=proc.returncode or 0,
                    command=cmd,
                    attempts=attempt,
                    total_time=total_time,
                )

                if result.returncode != 0:
                    logger.warning(
                        f"gh {args[0]} failed with exit code {result.returncode}: {stderr_str}"
                    )

                    # Check for rate limit errors (403/429)
                    error_lower = stderr_str.lower()
                    if (
                        "403" in stderr_str
                        or "429" in stderr_str
                        or "rate limit" in error_lower
                    ):
                        if self.enable_rate_limiting:
                            self._rate_limiter.record_github_error()
                        raise RateLimitExceeded(
                            f"GitHub API rate limit (HTTP 403/429): {stderr_str}"
                        )

                    if raise_on_error:
                        raise GHCommandError(
                            f"gh {args[0]} failed: {stderr_str or 'Unknown error'}"
                        )
                else:
                    logger.debug(
                        f"gh {args[0]} completed successfully "
                        f"(attempt {attempt}, {total_time:.2f}s)"
                    )

                return result

            except (GHTimeoutError, GHCommandError, RateLimitExceeded):
                # Re-raise our custom exceptions
                raise
            except Exception as e:
                # Unexpected error
                logger.error(f"Unexpected error in gh command: {e}")
                if attempt == self.max_retries:
                    raise GHCommandError(f"gh {args[0]} failed: {str(e)}")
                else:
                    # Retry on unexpected errors too
                    backoff_delay = 2 ** (attempt - 1)
                    logger.info(f"Retrying in {backoff_delay}s after error...")
                    await asyncio.sleep(backoff_delay)
                    continue

        # Should never reach here, but for type safety
        raise GHCommandError(f"gh {args[0]} failed after {self.max_retries} attempts")

    # =========================================================================
    # Helper methods
    # =========================================================================

    def _add_repo_flag(self, args: list[str]) -> list[str]:
        """
        Add -R flag to command args if repo is configured.

        This ensures gh CLI uses the correct repository instead of
        inferring from git remotes, which can fail with multiple remotes
        or when working in worktrees.

        Args:
            args: Command arguments list

        Returns:
            Modified args list with -R flag if repo is set
        """
        if self.repo:
            return args + ["-R", self.repo]
        return args

    # =========================================================================
    # Convenience methods for common gh commands
    # =========================================================================

    async def pr_list(
        self,
        state: str = "open",
        limit: int = 100,
        json_fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """
        List pull requests.

        Args:
            state: PR state (open, closed, merged, all)
            limit: Maximum number of PRs to return
            json_fields: Fields to include in JSON output

        Returns:
            List of PR data dictionaries
        """
        if json_fields is None:
            json_fields = [
                "number",
                "title",
                "state",
                "author",
                "headRefName",
                "baseRefName",
            ]

        args = [
            "pr",
            "list",
            "--state",
            state,
            "--limit",
            str(limit),
            "--json",
            ",".join(json_fields),
        ]
        args = self._add_repo_flag(args)

        result = await self.run(args)
        return json.loads(result.stdout)

    async def pr_get(
        self, pr_number: int, json_fields: list[str] | None = None
    ) -> dict[str, Any]:
        """
        Get PR data by number.

        Args:
            pr_number: PR number
            json_fields: Fields to include in JSON output

        Returns:
            PR data dictionary
        """
        if json_fields is None:
            json_fields = [
                "number",
                "title",
                "body",
                "state",
                "headRefName",
                "baseRefName",
                "author",
                "files",
                "additions",
                "deletions",
                "changedFiles",
            ]

        args = [
            "pr",
            "view",
            str(pr_number),
            "--json",
            ",".join(json_fields),
        ]
        args = self._add_repo_flag(args)

        result = await self.run(args)
        return json.loads(result.stdout)

    async def pr_diff(self, pr_number: int) -> str:
        """
        Get PR diff.

        Args:
            pr_number: PR number

        Returns:
            Unified diff string

        Raises:
            PRTooLargeError: If PR exceeds GitHub's 20,000 line diff limit
        """
        args = ["pr", "diff", str(pr_number)]
        args = self._add_repo_flag(args)
        try:
            result = await self.run(args)
            return result.stdout
        except GHCommandError as e:
            # Check if error is due to PR being too large
            error_msg = str(e)
            if (
                "diff exceeded the maximum number of lines" in error_msg
                or "HTTP 406" in error_msg
            ):
                raise PRTooLargeError(
                    f"PR #{pr_number} exceeds GitHub's 20,000 line diff limit. "
                    "Consider splitting into smaller PRs or review files individually."
                ) from e
            # Re-raise other command errors
            raise

    async def pr_review(
        self,
        pr_number: int,
        body: str,
        event: str = "comment",
    ) -> int:
        """
        Post a review to a PR.

        Args:
            pr_number: PR number
            body: Review comment body
            event: Review event (approve, request-changes, comment)

        Returns:
            Review ID (currently 0, as gh CLI doesn't return ID)
        """
        args = ["pr", "review", str(pr_number)]

        if event.lower() == "approve":
            args.append("--approve")
        elif event.lower() in ["request-changes", "request_changes"]:
            args.append("--request-changes")
        else:
            args.append("--comment")

        args.extend(["--body", body])
        args = self._add_repo_flag(args)

        await self.run(args)
        return 0  # gh CLI doesn't return review ID

    async def issue_list(
        self,
        state: str = "open",
        limit: int = 100,
        json_fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """
        List issues.

        Args:
            state: Issue state (open, closed, all)
            limit: Maximum number of issues to return
            json_fields: Fields to include in JSON output

        Returns:
            List of issue data dictionaries
        """
        if json_fields is None:
            json_fields = [
                "number",
                "title",
                "body",
                "labels",
                "author",
                "createdAt",
                "updatedAt",
                "comments",
            ]

        args = [
            "issue",
            "list",
            "--state",
            state,
            "--limit",
            str(limit),
            "--json",
            ",".join(json_fields),
        ]

        result = await self.run(args)
        return json.loads(result.stdout)

    async def issue_get(
        self, issue_number: int, json_fields: list[str] | None = None
    ) -> dict[str, Any]:
        """
        Get issue data by number.

        Args:
            issue_number: Issue number
            json_fields: Fields to include in JSON output

        Returns:
            Issue data dictionary
        """
        if json_fields is None:
            json_fields = [
                "number",
                "title",
                "body",
                "state",
                "labels",
                "author",
                "comments",
                "createdAt",
                "updatedAt",
            ]

        args = [
            "issue",
            "view",
            str(issue_number),
            "--json",
            ",".join(json_fields),
        ]

        result = await self.run(args)
        return json.loads(result.stdout)

    async def issue_comment(self, issue_number: int, body: str) -> None:
        """
        Post a comment to an issue.

        Args:
            issue_number: Issue number
            body: Comment body
        """
        args = ["issue", "comment", str(issue_number), "--body", body]
        await self.run(args)

    async def issue_add_labels(self, issue_number: int, labels: list[str]) -> None:
        """
        Add labels to an issue.

        Args:
            issue_number: Issue number
            labels: List of label names to add
        """
        if not labels:
            return

        args = [
            "issue",
            "edit",
            str(issue_number),
            "--add-label",
            ",".join(labels),
        ]
        await self.run(args)

    async def issue_remove_labels(self, issue_number: int, labels: list[str]) -> None:
        """
        Remove labels from an issue.

        Args:
            issue_number: Issue number
            labels: List of label names to remove
        """
        if not labels:
            return

        args = [
            "issue",
            "edit",
            str(issue_number),
            "--remove-label",
            ",".join(labels),
        ]
        # Don't raise on error - labels might not exist
        await self.run(args, raise_on_error=False)

    async def api_get(self, endpoint: str, params: dict[str, str] | None = None) -> Any:
        """
        Make a GET request to GitHub API.

        Args:
            endpoint: API endpoint (e.g., "/repos/owner/repo/contents/path")
            params: Query parameters

        Returns:
            JSON response
        """
        args = ["api", endpoint]

        if params:
            for key, value in params.items():
                args.extend(["-f", f"{key}={value}"])

        result = await self.run(args)
        return json.loads(result.stdout)

    async def pr_merge(
        self,
        pr_number: int,
        merge_method: str = "squash",
        commit_title: str | None = None,
        commit_message: str | None = None,
    ) -> None:
        """
        Merge a pull request.

        Args:
            pr_number: PR number to merge
            merge_method: Merge method - "merge", "squash", or "rebase" (default: "squash")
            commit_title: Custom commit title (optional)
            commit_message: Custom commit message (optional)
        """
        args = ["pr", "merge", str(pr_number), f"--{merge_method}"]

        if commit_title:
            args.extend(["--subject", commit_title])
        if commit_message:
            args.extend(["--body", commit_message])
        args = self._add_repo_flag(args)

        await self.run(args)

    async def pr_comment(self, pr_number: int, body: str) -> None:
        """
        Post a comment on a pull request.

        Args:
            pr_number: PR number
            body: Comment body
        """
        args = ["pr", "comment", str(pr_number), "--body", body]
        args = self._add_repo_flag(args)
        await self.run(args)

    async def pr_get_assignees(self, pr_number: int) -> list[str]:
        """
        Get assignees for a pull request.

        Args:
            pr_number: PR number

        Returns:
            List of assignee logins
        """
        data = await self.pr_get(pr_number, json_fields=["assignees"])
        assignees = data.get("assignees", [])
        return [a["login"] for a in assignees]

    async def pr_assign(self, pr_number: int, assignees: list[str]) -> None:
        """
        Assign users to a pull request.

        Args:
            pr_number: PR number
            assignees: List of GitHub usernames to assign
        """
        if not assignees:
            return

        # Use gh api to add assignees
        endpoint = f"/repos/{{owner}}/{{repo}}/issues/{pr_number}/assignees"
        args = [
            "api",
            endpoint,
            "-X",
            "POST",
            "-f",
            f"assignees={','.join(assignees)}",
        ]
        await self.run(args)

    async def compare_commits(self, base_sha: str, head_sha: str) -> dict[str, Any]:
        """
        Compare two commits to get changes between them.

        Uses: GET /repos/{owner}/{repo}/compare/{base}...{head}

        Args:
            base_sha: Base commit SHA (e.g., last reviewed commit)
            head_sha: Head commit SHA (e.g., current PR HEAD)

        Returns:
            Dict with:
            - commits: List of commits between base and head
            - files: List of changed files with patches
            - ahead_by: Number of commits head is ahead of base
            - behind_by: Number of commits head is behind base
            - total_commits: Total number of commits in comparison
        """
        endpoint = f"repos/{{owner}}/{{repo}}/compare/{base_sha}...{head_sha}"
        args = ["api", endpoint]

        result = await self.run(args, timeout=60.0)  # Longer timeout for large diffs
        return json.loads(result.stdout)

    async def get_comments_since(
        self, pr_number: int, since_timestamp: str
    ) -> dict[str, list[dict]]:
        """
        Get all comments (review + issue) since a timestamp.

        Args:
            pr_number: PR number
            since_timestamp: ISO timestamp to filter from (e.g., "2025-12-25T10:30:00Z")

        Returns:
            Dict with:
            - review_comments: Inline review comments on files
            - issue_comments: General PR discussion comments
        """
        # Fetch inline review comments
        # Use query string syntax - the -f flag sends POST body fields, not query params
        review_endpoint = f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments?since={since_timestamp}"
        review_args = ["api", "--method", "GET", review_endpoint]
        review_result = await self.run(review_args, raise_on_error=False)

        review_comments = []
        if review_result.returncode == 0:
            try:
                review_comments = json.loads(review_result.stdout)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse review comments for PR #{pr_number}")

        # Fetch general issue comments
        # Use query string syntax - the -f flag sends POST body fields, not query params
        issue_endpoint = f"repos/{{owner}}/{{repo}}/issues/{pr_number}/comments?since={since_timestamp}"
        issue_args = ["api", "--method", "GET", issue_endpoint]
        issue_result = await self.run(issue_args, raise_on_error=False)

        issue_comments = []
        if issue_result.returncode == 0:
            try:
                issue_comments = json.loads(issue_result.stdout)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse issue comments for PR #{pr_number}")

        return {
            "review_comments": review_comments,
            "issue_comments": issue_comments,
        }

    async def get_reviews_since(
        self, pr_number: int, since_timestamp: str
    ) -> list[dict]:
        """
        Get all PR reviews (formal review submissions) since a timestamp.

        This fetches formal reviews submitted via the GitHub review mechanism,
        which is different from review comments (inline comments on files).

        Reviews from AI tools like Cursor, CodeRabbit, Greptile etc. are
        submitted as formal reviews with body text containing their findings.

        Args:
            pr_number: PR number
            since_timestamp: ISO timestamp to filter from (e.g., "2025-12-25T10:30:00Z")

        Returns:
            List of review objects with fields:
            - id: Review ID
            - user: User who submitted the review
            - body: Review body text (contains AI findings)
            - state: APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
            - submitted_at: When the review was submitted
            - commit_id: Commit SHA the review was made on
        """
        # Fetch all reviews for the PR
        # Note: The reviews endpoint doesn't support 'since' parameter,
        # so we fetch all and filter client-side
        reviews_endpoint = f"repos/{{owner}}/{{repo}}/pulls/{pr_number}/reviews"
        reviews_args = ["api", "--method", "GET", reviews_endpoint]
        reviews_result = await self.run(reviews_args, raise_on_error=False)

        reviews = []
        if reviews_result.returncode == 0:
            try:
                all_reviews = json.loads(reviews_result.stdout)
                # Filter reviews submitted after the timestamp
                from datetime import datetime, timezone

                # Parse since_timestamp, handling both naive and aware formats
                since_dt = datetime.fromisoformat(
                    since_timestamp.replace("Z", "+00:00")
                )
                # Ensure since_dt is timezone-aware (assume UTC if naive)
                if since_dt.tzinfo is None:
                    since_dt = since_dt.replace(tzinfo=timezone.utc)

                for review in all_reviews:
                    submitted_at = review.get("submitted_at", "")
                    if submitted_at:
                        try:
                            review_dt = datetime.fromisoformat(
                                submitted_at.replace("Z", "+00:00")
                            )
                            # Ensure review_dt is also timezone-aware
                            if review_dt.tzinfo is None:
                                review_dt = review_dt.replace(tzinfo=timezone.utc)
                            if review_dt > since_dt:
                                reviews.append(review)
                        except ValueError:
                            # If we can't parse the date, include the review
                            reviews.append(review)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse reviews for PR #{pr_number}")

        return reviews

    async def get_pr_head_sha(self, pr_number: int) -> str | None:
        """
        Get the current HEAD SHA of a PR.

        Args:
            pr_number: PR number

        Returns:
            HEAD commit SHA or None if not found
        """
        data = await self.pr_get(pr_number, json_fields=["commits"])
        commits = data.get("commits", [])
        if commits:
            # Last commit is the HEAD
            return commits[-1].get("oid")
        return None
