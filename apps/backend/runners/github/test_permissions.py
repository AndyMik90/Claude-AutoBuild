"""
Unit Tests for GitHub Permission System
=======================================

Tests for GitHubPermissionChecker and permission verification.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from permissions import GitHubPermissionChecker, PermissionCheckResult, PermissionError


class MockGitHubClient:
    """Mock GitHub API client for testing."""

    def __init__(self):
        self.get = AsyncMock()
        self._get_headers = AsyncMock()


@pytest.fixture
def mock_gh_client():
    """Create a mock GitHub client."""
    return MockGitHubClient()


@pytest.fixture
def permission_checker(mock_gh_client):
    """Create a permission checker instance."""
    return GitHubPermissionChecker(
        gh_client=mock_gh_client,
        repo="owner/test-repo",
        allowed_roles=["OWNER", "MEMBER", "COLLABORATOR"],
        allow_external_contributors=False,
    )


@pytest.mark.asyncio
async def test_verify_token_scopes_success(permission_checker, mock_gh_client):
    """Test successful token scope verification."""
    mock_gh_client._get_headers.return_value = {
        "X-OAuth-Scopes": "repo, read:org, admin:repo_hook"
    }

    # Should not raise
    await permission_checker.verify_token_scopes()


@pytest.mark.asyncio
async def test_verify_token_scopes_minimum(permission_checker, mock_gh_client):
    """Test token with minimum scopes (repo only) triggers warning."""
    mock_gh_client._get_headers.return_value = {"X-OAuth-Scopes": "repo"}

    # Should warn but not raise (for non-org repos)
    await permission_checker.verify_token_scopes()


@pytest.mark.asyncio
async def test_verify_token_scopes_insufficient(permission_checker, mock_gh_client):
    """Test insufficient token scopes raises error."""
    mock_gh_client._get_headers.return_value = {"X-OAuth-Scopes": "read:user"}

    with pytest.raises(PermissionError, match="missing required scopes"):
        await permission_checker.verify_token_scopes()


@pytest.mark.asyncio
async def test_check_label_adder_success(permission_checker, mock_gh_client):
    """Test successfully finding who added a label."""
    mock_gh_client.get.side_effect = [
        # Issue events
        [
            {
                "event": "labeled",
                "label": {"name": "auto-fix"},
                "actor": {"login": "alice"},
            },
            {
                "event": "commented",
                "actor": {"login": "bob"},
            },
        ],
        # Collaborator permission check for alice
        {"permission": "write"},
    ]

    username, role = await permission_checker.check_label_adder(123, "auto-fix")

    assert username == "alice"
    assert role == "COLLABORATOR"
    mock_gh_client.get.assert_any_call("/repos/owner/test-repo/issues/123/events")


@pytest.mark.asyncio
async def test_check_label_adder_not_found(permission_checker, mock_gh_client):
    """Test error when label not found in events."""
    mock_gh_client.get.return_value = [
        {
            "event": "labeled",
            "label": {"name": "bug"},
            "actor": {"login": "alice"},
        },
    ]

    with pytest.raises(PermissionError, match="Label 'auto-fix' not found"):
        await permission_checker.check_label_adder(123, "auto-fix")


@pytest.mark.asyncio
async def test_get_user_role_owner(permission_checker, mock_gh_client):
    """Test getting role for repository owner."""
    role = await permission_checker.get_user_role("owner")

    assert role == "OWNER"
    # Should use cache, no API calls needed
    assert mock_gh_client.get.call_count == 0


@pytest.mark.asyncio
async def test_get_user_role_collaborator(permission_checker, mock_gh_client):
    """Test getting role for collaborator with write access."""
    mock_gh_client.get.return_value = {"permission": "write"}

    role = await permission_checker.get_user_role("alice")

    assert role == "COLLABORATOR"
    mock_gh_client.get.assert_called_with(
        "/repos/owner/test-repo/collaborators/alice/permission"
    )


@pytest.mark.asyncio
async def test_get_user_role_org_member(permission_checker, mock_gh_client):
    """Test getting role for organization member."""
    mock_gh_client.get.side_effect = [
        # Not a collaborator
        Exception("Not a collaborator"),
        # Repo info (org-owned)
        {"owner": {"type": "Organization"}},
        # Org membership check
        {"state": "active"},
    ]

    role = await permission_checker.get_user_role("bob")

    assert role == "MEMBER"


@pytest.mark.asyncio
async def test_get_user_role_contributor(permission_checker, mock_gh_client):
    """Test getting role for external contributor."""
    mock_gh_client.get.side_effect = [
        # Not a collaborator
        Exception("Not a collaborator"),
        # Repo info (user-owned, not org)
        {"owner": {"type": "User"}},
        # Contributors list
        [
            {"login": "alice"},
            {"login": "charlie"},  # The user we're checking
        ],
    ]

    role = await permission_checker.get_user_role("charlie")

    assert role == "CONTRIBUTOR"


@pytest.mark.asyncio
async def test_get_user_role_none(permission_checker, mock_gh_client):
    """Test getting role for user with no relationship to repo."""
    mock_gh_client.get.side_effect = [
        # Not a collaborator
        Exception("Not a collaborator"),
        # Repo info
        {"owner": {"type": "User"}},
        # Contributors list (user not in it)
        [{"login": "alice"}],
    ]

    role = await permission_checker.get_user_role("stranger")

    assert role == "NONE"


@pytest.mark.asyncio
async def test_get_user_role_caching(permission_checker, mock_gh_client):
    """Test that user roles are cached."""
    mock_gh_client.get.return_value = {"permission": "write"}

    # First call
    role1 = await permission_checker.get_user_role("alice")
    assert role1 == "COLLABORATOR"

    # Second call should use cache
    role2 = await permission_checker.get_user_role("alice")
    assert role2 == "COLLABORATOR"

    # Only one API call should have been made
    assert mock_gh_client.get.call_count == 1


@pytest.mark.asyncio
async def test_is_allowed_for_autofix_owner(permission_checker, mock_gh_client):
    """Test auto-fix permission for owner."""
    result = await permission_checker.is_allowed_for_autofix("owner")

    assert result.allowed is True
    assert result.username == "owner"
    assert result.role == "OWNER"
    assert result.reason is None


@pytest.mark.asyncio
async def test_is_allowed_for_autofix_collaborator(permission_checker, mock_gh_client):
    """Test auto-fix permission for collaborator."""
    mock_gh_client.get.return_value = {"permission": "write"}

    result = await permission_checker.is_allowed_for_autofix("alice")

    assert result.allowed is True
    assert result.username == "alice"
    assert result.role == "COLLABORATOR"


@pytest.mark.asyncio
async def test_is_allowed_for_autofix_denied(permission_checker, mock_gh_client):
    """Test auto-fix permission denied for unauthorized user."""
    mock_gh_client.get.side_effect = [
        Exception("Not a collaborator"),
        {"owner": {"type": "User"}},
        [],  # Not in contributors
    ]

    result = await permission_checker.is_allowed_for_autofix("stranger")

    assert result.allowed is False
    assert result.username == "stranger"
    assert result.role == "NONE"
    assert "not in allowed roles" in result.reason


@pytest.mark.asyncio
async def test_is_allowed_for_autofix_contributor_allowed(mock_gh_client):
    """Test auto-fix permission for contributor when external contributors allowed."""
    checker = GitHubPermissionChecker(
        gh_client=mock_gh_client,
        repo="owner/test-repo",
        allow_external_contributors=True,
    )

    mock_gh_client.get.side_effect = [
        Exception("Not a collaborator"),
        {"owner": {"type": "User"}},
        [{"login": "charlie"}],  # Is a contributor
    ]

    result = await checker.is_allowed_for_autofix("charlie")

    assert result.allowed is True
    assert result.role == "CONTRIBUTOR"


@pytest.mark.asyncio
async def test_check_org_membership_true(permission_checker, mock_gh_client):
    """Test successful org membership check."""
    mock_gh_client.get.side_effect = [
        # Repo info
        {"owner": {"type": "Organization"}},
        # Org membership
        {"state": "active"},
    ]

    is_member = await permission_checker.check_org_membership("alice")

    assert is_member is True


@pytest.mark.asyncio
async def test_check_org_membership_false(permission_checker, mock_gh_client):
    """Test failed org membership check."""
    mock_gh_client.get.side_effect = [
        # Repo info
        {"owner": {"type": "Organization"}},
        # Org membership check fails
        Exception("Not a member"),
    ]

    is_member = await permission_checker.check_org_membership("stranger")

    assert is_member is False


@pytest.mark.asyncio
async def test_check_org_membership_non_org_repo(permission_checker, mock_gh_client):
    """Test org membership check for non-org repo returns True."""
    mock_gh_client.get.return_value = {"owner": {"type": "User"}}

    is_member = await permission_checker.check_org_membership("anyone")

    assert is_member is True


@pytest.mark.asyncio
async def test_check_team_membership_true(permission_checker, mock_gh_client):
    """Test successful team membership check."""
    mock_gh_client.get.return_value = {"state": "active"}

    is_member = await permission_checker.check_team_membership("alice", "developers")

    assert is_member is True
    mock_gh_client.get.assert_called_with(
        "/orgs/owner/teams/developers/memberships/alice"
    )


@pytest.mark.asyncio
async def test_check_team_membership_false(permission_checker, mock_gh_client):
    """Test failed team membership check."""
    mock_gh_client.get.side_effect = Exception("Not a team member")

    is_member = await permission_checker.check_team_membership("bob", "developers")

    assert is_member is False


@pytest.mark.asyncio
async def test_verify_automation_trigger_allowed(permission_checker, mock_gh_client):
    """Test complete automation trigger verification (allowed)."""
    mock_gh_client.get.side_effect = [
        # Issue events
        [
            {
                "event": "labeled",
                "label": {"name": "auto-fix"},
                "actor": {"login": "alice"},
            }
        ],
        # Collaborator permission
        {"permission": "write"},
    ]

    result = await permission_checker.verify_automation_trigger(123, "auto-fix")

    assert result.allowed is True
    assert result.username == "alice"
    assert result.role == "COLLABORATOR"


@pytest.mark.asyncio
async def test_verify_automation_trigger_denied(permission_checker, mock_gh_client):
    """Test complete automation trigger verification (denied)."""
    mock_gh_client.get.side_effect = [
        # Issue events
        [
            {
                "event": "labeled",
                "label": {"name": "auto-fix"},
                "actor": {"login": "stranger"},
            }
        ],
        # Not a collaborator
        Exception("Not a collaborator"),
        # Repo info
        {"owner": {"type": "User"}},
        # Not in contributors
        [],
    ]

    result = await permission_checker.verify_automation_trigger(123, "auto-fix")

    assert result.allowed is False
    assert result.username == "stranger"
    assert result.role == "NONE"


def test_log_permission_denial(permission_checker, caplog):
    """Test permission denial logging."""
    import logging

    caplog.set_level(logging.WARNING)

    permission_checker.log_permission_denial(
        action="auto-fix",
        username="stranger",
        role="NONE",
        issue_number=123,
    )

    assert "PERMISSION DENIED" in caplog.text
    assert "stranger" in caplog.text
    assert "auto-fix" in caplog.text
