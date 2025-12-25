"""
GitHub Permission and Authorization System
==========================================

Verifies who can trigger automation actions and validates token permissions.

Key features:
- Label-adder verification (who added the trigger label)
- Role-based access control (OWNER, MEMBER, COLLABORATOR)
- Token scope validation (fail fast if insufficient)
- Organization/team membership checks
- Permission denial logging with actor info
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)


# GitHub permission roles
GitHubRole = Literal["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "NONE"]


@dataclass
class PermissionCheckResult:
    """Result of a permission check."""

    allowed: bool
    username: str
    role: GitHubRole
    reason: str | None = None


class PermissionError(Exception):
    """Raised when permission checks fail."""

    pass


class GitHubPermissionChecker:
    """
    Verifies permissions for GitHub automation actions.

    Required token scopes:
    - repo: Full control of private repositories
    - read:org: Read org and team membership (for org repos)

    Usage:
        checker = GitHubPermissionChecker(
            gh_client=gh_client,
            repo="owner/repo",
            allowed_roles=["OWNER", "MEMBER"]
        )

        # Check who added a label
        username, role = await checker.check_label_adder(123, "auto-fix")

        # Verify if user can trigger auto-fix
        result = await checker.is_allowed_for_autofix(username)
    """

    # Required OAuth scopes for full functionality
    REQUIRED_SCOPES = ["repo", "read:org"]

    # Minimum required scopes (repo only, for non-org repos)
    MINIMUM_SCOPES = ["repo"]

    def __init__(
        self,
        gh_client,  # GitHubAPIClient from runner.py
        repo: str,
        allowed_roles: list[str] | None = None,
        allow_external_contributors: bool = False,
    ):
        """
        Initialize permission checker.

        Args:
            gh_client: GitHub API client instance
            repo: Repository in "owner/repo" format
            allowed_roles: List of allowed roles (default: OWNER, MEMBER, COLLABORATOR)
            allow_external_contributors: Allow users with no write access (default: False)
        """
        self.gh_client = gh_client
        self.repo = repo
        self.owner, self.repo_name = repo.split("/")

        # Default to trusted roles if not specified
        self.allowed_roles = allowed_roles or ["OWNER", "MEMBER", "COLLABORATOR"]
        self.allow_external_contributors = allow_external_contributors

        # Cache for user roles (avoid repeated API calls)
        self._role_cache: dict[str, GitHubRole] = {}

        logger.info(
            f"Initialized permission checker for {repo} with allowed roles: {self.allowed_roles}"
        )

    async def verify_token_scopes(self) -> None:
        """
        Verify token has required scopes. Raises PermissionError if insufficient.

        This should be called at startup to fail fast if permissions are inadequate.
        Uses the gh CLI to verify authentication status.
        """
        logger.info("Verifying GitHub token and permissions...")

        try:
            # Verify we can access the repo (checks auth + repo access)
            repo_info = await self.gh_client.api_get(f"/repos/{self.repo}")

            if not repo_info:
                raise PermissionError(
                    f"Cannot access repository {self.repo}. "
                    f"Check your token has 'repo' scope."
                )

            # Check if we have write access (needed for auto-fix)
            permissions = repo_info.get("permissions", {})
            has_push = permissions.get("push", False)
            has_admin = permissions.get("admin", False)

            if not (has_push or has_admin):
                logger.warning(
                    f"Token does not have write access to {self.repo}. "
                    f"Auto-fix and PR creation will not work."
                )

            # For org repos, try to verify org access
            owner_type = repo_info.get("owner", {}).get("type", "")
            if owner_type == "Organization":
                try:
                    await self.gh_client.api_get(f"/orgs/{self.owner}")
                    logger.info(f"✓ Have access to organization {self.owner}")
                except Exception:
                    logger.warning(
                        f"Cannot access org {self.owner} API. "
                        f"Team membership checks will be limited. "
                        f"Consider adding 'read:org' scope."
                    )

            logger.info(f"✓ Token verified for {self.repo} (push={has_push})")

        except PermissionError:
            raise
        except Exception as e:
            logger.error(f"Failed to verify token: {e}")
            raise PermissionError(f"Could not verify token permissions: {e}")

    async def check_label_adder(
        self, issue_number: int, label: str
    ) -> tuple[str, GitHubRole]:
        """
        Check who added a specific label to an issue.

        Args:
            issue_number: Issue number
            label: Label name to check

        Returns:
            Tuple of (username, role) who added the label

        Raises:
            PermissionError: If label was not found or couldn't determine who added it
        """
        logger.info(f"Checking who added label '{label}' to issue #{issue_number}")

        try:
            # Get issue timeline events
            events = await self.gh_client.api_get(
                f"/repos/{self.repo}/issues/{issue_number}/events"
            )

            # Find most recent label addition event
            for event in reversed(events):
                if (
                    event.get("event") == "labeled"
                    and event.get("label", {}).get("name") == label
                ):
                    actor = event.get("actor", {})
                    username = actor.get("login")

                    if not username:
                        raise PermissionError(
                            f"Could not determine who added label '{label}'"
                        )

                    # Get role for this user
                    role = await self.get_user_role(username)

                    logger.info(
                        f"Label '{label}' was added by {username} (role: {role})"
                    )
                    return username, role

            raise PermissionError(
                f"Label '{label}' not found in issue #{issue_number} events"
            )

        except Exception as e:
            logger.error(f"Failed to check label adder: {e}")
            raise PermissionError(f"Could not verify label adder: {e}")

    async def get_user_role(self, username: str) -> GitHubRole:
        """
        Get a user's role in the repository.

        Args:
            username: GitHub username

        Returns:
            User's role (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE)

        Note:
            - OWNER: Repository owner or org owner
            - MEMBER: Organization member (for org repos)
            - COLLABORATOR: Has write access
            - CONTRIBUTOR: Has contributed but no write access
            - NONE: No relationship to repo
        """
        # Check cache first
        if username in self._role_cache:
            return self._role_cache[username]

        logger.debug(f"Checking role for user: {username}")

        try:
            # Check if user is owner
            if username.lower() == self.owner.lower():
                role = "OWNER"
                self._role_cache[username] = role
                return role

            # Check collaborator status (write access)
            try:
                permission = await self.gh_client.api_get(
                    f"/repos/{self.repo}/collaborators/{username}/permission"
                )
                permission_level = permission.get("permission", "none")

                if permission_level in ["admin", "maintain", "write"]:
                    role = "COLLABORATOR"
                    self._role_cache[username] = role
                    return role

            except Exception:
                logger.debug(f"User {username} is not a collaborator")

            # For organization repos, check org membership
            try:
                # Check if repo is owned by an org
                repo_info = await self.gh_client.api_get(f"/repos/{self.repo}")
                if repo_info.get("owner", {}).get("type") == "Organization":
                    # Check org membership
                    try:
                        await self.gh_client.api_get(
                            f"/orgs/{self.owner}/members/{username}"
                        )
                        role = "MEMBER"
                        self._role_cache[username] = role
                        return role
                    except Exception:
                        logger.debug(f"User {username} is not an org member")

            except Exception:
                logger.debug("Could not check org membership")

            # Check if user has any contributions
            try:
                # This is a heuristic - check if user appears in contributors
                contributors = await self.gh_client.api_get(
                    f"/repos/{self.repo}/contributors"
                )
                if any(c.get("login") == username for c in contributors):
                    role = "CONTRIBUTOR"
                    self._role_cache[username] = role
                    return role
            except Exception:
                logger.debug("Could not check contributor status")

            # No relationship found
            role = "NONE"
            self._role_cache[username] = role
            return role

        except Exception as e:
            logger.error(f"Error checking user role for {username}: {e}")
            # Fail safe - treat as no permission
            return "NONE"

    async def is_allowed_for_autofix(self, username: str) -> PermissionCheckResult:
        """
        Check if a user is allowed to trigger auto-fix.

        Args:
            username: GitHub username to check

        Returns:
            PermissionCheckResult with allowed status and details
        """
        logger.info(f"Checking auto-fix permission for user: {username}")

        role = await self.get_user_role(username)

        # Check if role is allowed
        if role in self.allowed_roles:
            logger.info(f"✓ User {username} ({role}) is allowed to trigger auto-fix")
            return PermissionCheckResult(
                allowed=True, username=username, role=role, reason=None
            )

        # Check if external contributors are allowed and user has contributed
        if self.allow_external_contributors and role == "CONTRIBUTOR":
            logger.info(
                f"✓ User {username} (CONTRIBUTOR) is allowed via external contributor policy"
            )
            return PermissionCheckResult(
                allowed=True, username=username, role=role, reason=None
            )

        # Permission denied
        reason = (
            f"User {username} has role '{role}', which is not in allowed roles: "
            f"{self.allowed_roles}"
        )

        logger.warning(
            f"✗ Auto-fix permission denied for {username}: {reason}",
            extra={
                "username": username,
                "role": role,
                "allowed_roles": self.allowed_roles,
            },
        )

        return PermissionCheckResult(
            allowed=False, username=username, role=role, reason=reason
        )

    async def check_org_membership(self, username: str) -> bool:
        """
        Check if user is a member of the repository's organization.

        Args:
            username: GitHub username

        Returns:
            True if user is an org member (or repo is not owned by org)
        """
        try:
            # Check if repo is owned by an org
            repo_info = await self.gh_client.api_get(f"/repos/{self.repo}")
            if repo_info.get("owner", {}).get("type") != "Organization":
                logger.debug(f"Repository {self.repo} is not owned by an organization")
                return True  # Not an org repo, so membership check N/A

            # Check org membership
            try:
                await self.gh_client.api_get(f"/orgs/{self.owner}/members/{username}")
                logger.info(f"✓ User {username} is a member of org {self.owner}")
                return True
            except Exception:
                logger.info(f"✗ User {username} is not a member of org {self.owner}")
                return False

        except Exception as e:
            logger.error(f"Error checking org membership for {username}: {e}")
            return False

    async def check_team_membership(self, username: str, team_slug: str) -> bool:
        """
        Check if user is a member of a specific team.

        Args:
            username: GitHub username
            team_slug: Team slug (e.g., "developers")

        Returns:
            True if user is a team member
        """
        try:
            await self.gh_client.api_get(
                f"/orgs/{self.owner}/teams/{team_slug}/memberships/{username}"
            )
            logger.info(
                f"✓ User {username} is a member of team {self.owner}/{team_slug}"
            )
            return True
        except Exception:
            logger.info(
                f"✗ User {username} is not a member of team {self.owner}/{team_slug}"
            )
            return False

    def log_permission_denial(
        self,
        action: str,
        username: str,
        role: GitHubRole,
        issue_number: int | None = None,
        pr_number: int | None = None,
    ) -> None:
        """
        Log a permission denial with full context.

        Args:
            action: Action that was denied (e.g., "auto-fix", "pr-review")
            username: GitHub username
            role: User's role
            issue_number: Optional issue number
            pr_number: Optional PR number
        """
        context = {
            "action": action,
            "username": username,
            "role": role,
            "repo": self.repo,
            "allowed_roles": self.allowed_roles,
            "allow_external_contributors": self.allow_external_contributors,
        }

        if issue_number:
            context["issue_number"] = issue_number
        if pr_number:
            context["pr_number"] = pr_number

        logger.warning(
            f"PERMISSION DENIED: {username} ({role}) attempted {action} in {self.repo}",
            extra=context,
        )

    async def verify_automation_trigger(
        self, issue_number: int, trigger_label: str
    ) -> PermissionCheckResult:
        """
        Complete verification for an automation trigger (e.g., auto-fix label).

        This is the main entry point for permission checks.

        Args:
            issue_number: Issue number
            trigger_label: Label that triggered automation

        Returns:
            PermissionCheckResult with full details

        Raises:
            PermissionError: If verification fails
        """
        logger.info(
            f"Verifying automation trigger for issue #{issue_number}, label: {trigger_label}"
        )

        # Step 1: Find who added the label
        username, role = await self.check_label_adder(issue_number, trigger_label)

        # Step 2: Check if they're allowed
        result = await self.is_allowed_for_autofix(username)

        # Step 3: Log if denied
        if not result.allowed:
            self.log_permission_denial(
                action="auto-fix",
                username=username,
                role=role,
                issue_number=issue_number,
            )

        return result
