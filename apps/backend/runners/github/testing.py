"""
Test Infrastructure
===================

Mock clients and fixtures for testing GitHub automation without live credentials.

Provides:
- MockGitHubClient: Simulates gh CLI responses
- MockClaudeClient: Simulates AI agent responses
- Fixtures for common test scenarios
- CI-compatible test utilities
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

# ============================================================================
# PROTOCOLS (Interfaces)
# ============================================================================


@runtime_checkable
class GitHubClientProtocol(Protocol):
    """Protocol for GitHub API clients."""

    async def pr_list(
        self,
        state: str = "open",
        limit: int = 100,
        json_fields: list[str] | None = None,
    ) -> list[dict[str, Any]]: ...

    async def pr_get(
        self,
        pr_number: int,
        json_fields: list[str] | None = None,
    ) -> dict[str, Any]: ...

    async def pr_diff(self, pr_number: int) -> str: ...

    async def pr_review(
        self,
        pr_number: int,
        body: str,
        event: str = "comment",
    ) -> int: ...

    async def issue_list(
        self,
        state: str = "open",
        limit: int = 100,
        json_fields: list[str] | None = None,
    ) -> list[dict[str, Any]]: ...

    async def issue_get(
        self,
        issue_number: int,
        json_fields: list[str] | None = None,
    ) -> dict[str, Any]: ...

    async def issue_comment(self, issue_number: int, body: str) -> None: ...

    async def issue_add_labels(self, issue_number: int, labels: list[str]) -> None: ...

    async def issue_remove_labels(
        self, issue_number: int, labels: list[str]
    ) -> None: ...

    async def api_get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...


@runtime_checkable
class ClaudeClientProtocol(Protocol):
    """Protocol for Claude AI clients."""

    async def query(self, prompt: str) -> None: ...

    async def receive_response(self): ...

    async def __aenter__(self) -> ClaudeClientProtocol: ...

    async def __aexit__(self, *args) -> None: ...


# ============================================================================
# MOCK IMPLEMENTATIONS
# ============================================================================


@dataclass
class MockGitHubClient:
    """
    Mock GitHub client for testing.

    Usage:
        client = MockGitHubClient()

        # Add test data
        client.add_pr(1, title="Fix bug", author="user1")
        client.add_issue(10, title="Bug report", labels=["bug"])

        # Use in tests
        prs = await client.pr_list()
        assert len(prs) == 1
    """

    prs: dict[int, dict[str, Any]] = field(default_factory=dict)
    issues: dict[int, dict[str, Any]] = field(default_factory=dict)
    diffs: dict[int, str] = field(default_factory=dict)
    api_responses: dict[str, Any] = field(default_factory=dict)
    posted_reviews: list[dict[str, Any]] = field(default_factory=list)
    posted_comments: list[dict[str, Any]] = field(default_factory=list)
    added_labels: list[dict[str, Any]] = field(default_factory=list)
    removed_labels: list[dict[str, Any]] = field(default_factory=list)
    call_log: list[dict[str, Any]] = field(default_factory=list)

    def _log_call(self, method: str, **kwargs) -> None:
        self.call_log.append(
            {
                "method": method,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **kwargs,
            }
        )

    def add_pr(
        self,
        number: int,
        title: str = "Test PR",
        body: str = "Test description",
        author: str = "testuser",
        state: str = "open",
        base_branch: str = "main",
        head_branch: str = "feature",
        additions: int = 10,
        deletions: int = 5,
        files: list[dict] | None = None,
        diff: str | None = None,
    ) -> None:
        """Add a PR to the mock."""
        self.prs[number] = {
            "number": number,
            "title": title,
            "body": body,
            "state": state,
            "author": {"login": author},
            "headRefName": head_branch,
            "baseRefName": base_branch,
            "additions": additions,
            "deletions": deletions,
            "changedFiles": len(files) if files else 1,
            "files": files
            or [{"path": "test.py", "additions": additions, "deletions": deletions}],
        }
        if diff:
            self.diffs[number] = diff
        else:
            self.diffs[number] = "diff --git a/test.py b/test.py\n+# Added line"

    def add_issue(
        self,
        number: int,
        title: str = "Test Issue",
        body: str = "Test description",
        author: str = "testuser",
        state: str = "open",
        labels: list[str] | None = None,
        created_at: str | None = None,
    ) -> None:
        """Add an issue to the mock."""
        self.issues[number] = {
            "number": number,
            "title": title,
            "body": body,
            "state": state,
            "author": {"login": author},
            "labels": [{"name": label} for label in (labels or [])],
            "createdAt": created_at or datetime.now(timezone.utc).isoformat(),
        }

    def set_api_response(self, endpoint: str, response: Any) -> None:
        """Set response for an API endpoint."""
        self.api_responses[endpoint] = response

    async def pr_list(
        self,
        state: str = "open",
        limit: int = 100,
        json_fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        self._log_call("pr_list", state=state, limit=limit)
        prs = [p for p in self.prs.values() if p["state"] == state or state == "all"]
        return prs[:limit]

    async def pr_get(
        self,
        pr_number: int,
        json_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        self._log_call("pr_get", pr_number=pr_number)
        if pr_number not in self.prs:
            raise Exception(f"PR #{pr_number} not found")
        return self.prs[pr_number]

    async def pr_diff(self, pr_number: int) -> str:
        self._log_call("pr_diff", pr_number=pr_number)
        return self.diffs.get(pr_number, "")

    async def pr_review(
        self,
        pr_number: int,
        body: str,
        event: str = "comment",
    ) -> int:
        self._log_call("pr_review", pr_number=pr_number, event=event)
        review_id = len(self.posted_reviews) + 1
        self.posted_reviews.append(
            {
                "id": review_id,
                "pr_number": pr_number,
                "body": body,
                "event": event,
            }
        )
        return review_id

    async def issue_list(
        self,
        state: str = "open",
        limit: int = 100,
        json_fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        self._log_call("issue_list", state=state, limit=limit)
        issues = [
            i for i in self.issues.values() if i["state"] == state or state == "all"
        ]
        return issues[:limit]

    async def issue_get(
        self,
        issue_number: int,
        json_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        self._log_call("issue_get", issue_number=issue_number)
        if issue_number not in self.issues:
            raise Exception(f"Issue #{issue_number} not found")
        return self.issues[issue_number]

    async def issue_comment(self, issue_number: int, body: str) -> None:
        self._log_call("issue_comment", issue_number=issue_number)
        self.posted_comments.append(
            {
                "issue_number": issue_number,
                "body": body,
            }
        )

    async def issue_add_labels(self, issue_number: int, labels: list[str]) -> None:
        self._log_call("issue_add_labels", issue_number=issue_number, labels=labels)
        self.added_labels.append(
            {
                "issue_number": issue_number,
                "labels": labels,
            }
        )
        # Update issue labels
        if issue_number in self.issues:
            current = [
                label["name"] for label in self.issues[issue_number].get("labels", [])
            ]
            current.extend(labels)
            self.issues[issue_number]["labels"] = [
                {"name": label} for label in set(current)
            ]

    async def issue_remove_labels(self, issue_number: int, labels: list[str]) -> None:
        self._log_call("issue_remove_labels", issue_number=issue_number, labels=labels)
        self.removed_labels.append(
            {
                "issue_number": issue_number,
                "labels": labels,
            }
        )

    async def api_get(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._log_call("api_get", endpoint=endpoint, params=params)
        if endpoint in self.api_responses:
            return self.api_responses[endpoint]
        # Default responses
        if "/repos/" in endpoint and "/events" in endpoint:
            return []
        return {}


@dataclass
class MockMessage:
    """Mock message from Claude."""

    content: list[Any]


@dataclass
class MockTextBlock:
    """Mock text block."""

    text: str


@dataclass
class MockClaudeClient:
    """
    Mock Claude client for testing.

    Usage:
        client = MockClaudeClient()
        client.set_response('''
        ```json
        [{"severity": "high", "title": "Bug found"}]
        ```
        ''')

        async with client:
            await client.query("Review this code")
            async for msg in client.receive_response():
                print(msg)
    """

    responses: list[str] = field(default_factory=list)
    current_response_index: int = 0
    queries: list[str] = field(default_factory=list)

    def set_response(self, response: str) -> None:
        """Set the next response."""
        self.responses.append(response)

    def set_responses(self, responses: list[str]) -> None:
        """Set multiple responses."""
        self.responses.extend(responses)

    async def query(self, prompt: str) -> None:
        """Record query."""
        self.queries.append(prompt)

    async def receive_response(self):
        """Yield mock response."""
        if self.current_response_index < len(self.responses):
            response = self.responses[self.current_response_index]
            self.current_response_index += 1
        else:
            response = "No response configured"

        yield MockMessage(content=[MockTextBlock(text=response)])

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


# ============================================================================
# FIXTURES
# ============================================================================


class TestFixtures:
    """Pre-configured test fixtures."""

    @staticmethod
    def simple_pr() -> dict[str, Any]:
        """Simple PR fixture."""
        return {
            "number": 1,
            "title": "Fix typo in README",
            "body": "Fixes a small typo",
            "author": "contributor",
            "state": "open",
            "base_branch": "main",
            "head_branch": "fix/typo",
            "additions": 1,
            "deletions": 1,
        }

    @staticmethod
    def security_pr() -> dict[str, Any]:
        """PR with security issues."""
        return {
            "number": 2,
            "title": "Add user authentication",
            "body": "Implements user auth with password storage",
            "author": "developer",
            "state": "open",
            "base_branch": "main",
            "head_branch": "feature/auth",
            "additions": 150,
            "deletions": 10,
            "diff": """
diff --git a/auth.py b/auth.py
+def store_password(password):
+    # TODO: Add hashing
+    return password  # Storing plaintext!
""",
        }

    @staticmethod
    def bug_issue() -> dict[str, Any]:
        """Bug report issue."""
        return {
            "number": 10,
            "title": "App crashes on login",
            "body": "When I try to login, the app crashes with error E1234",
            "author": "user123",
            "state": "open",
            "labels": ["bug"],
        }

    @staticmethod
    def feature_issue() -> dict[str, Any]:
        """Feature request issue."""
        return {
            "number": 11,
            "title": "Add dark mode support",
            "body": "Would be nice to have a dark mode option",
            "author": "user456",
            "state": "open",
            "labels": ["enhancement"],
        }

    @staticmethod
    def spam_issue() -> dict[str, Any]:
        """Spam issue."""
        return {
            "number": 12,
            "title": "Check out my website!!!",
            "body": "Visit https://spam.example.com for FREE stuff!",
            "author": "spammer",
            "state": "open",
            "labels": [],
        }

    @staticmethod
    def duplicate_issues() -> list[dict[str, Any]]:
        """Pair of duplicate issues."""
        return [
            {
                "number": 20,
                "title": "Login fails with OAuth",
                "body": "OAuth login returns 401 error",
                "author": "user1",
                "state": "open",
                "labels": ["bug"],
            },
            {
                "number": 21,
                "title": "Authentication broken for OAuth users",
                "body": "Getting 401 when trying to authenticate via OAuth",
                "author": "user2",
                "state": "open",
                "labels": ["bug"],
            },
        ]

    @staticmethod
    def ai_review_response() -> str:
        """Sample AI review response."""
        return """
Based on my review of this PR:

```json
[
  {
    "id": "finding-1",
    "severity": "high",
    "category": "security",
    "title": "Plaintext password storage",
    "description": "Passwords should be hashed before storage",
    "file": "auth.py",
    "line": 3,
    "suggested_fix": "Use bcrypt or argon2 for password hashing",
    "fixable": true
  }
]
```
"""

    @staticmethod
    def ai_triage_response() -> str:
        """Sample AI triage response."""
        return """
```json
{
  "category": "bug",
  "confidence": 0.95,
  "priority": "high",
  "labels_to_add": ["type:bug", "priority:high"],
  "labels_to_remove": [],
  "is_duplicate": false,
  "is_spam": false,
  "is_feature_creep": false
}
```
"""


def create_test_github_client() -> MockGitHubClient:
    """Create a pre-configured mock GitHub client."""
    client = MockGitHubClient()

    # Add standard fixtures
    fixtures = TestFixtures()

    pr = fixtures.simple_pr()
    client.add_pr(**pr)

    security_pr = fixtures.security_pr()
    client.add_pr(**security_pr)

    bug = fixtures.bug_issue()
    client.add_issue(**bug)

    feature = fixtures.feature_issue()
    client.add_issue(**feature)

    # Add API responses
    client.set_api_response(
        "/repos/test/repo",
        {
            "full_name": "test/repo",
            "owner": {"login": "test", "type": "User"},
            "permissions": {"push": True, "admin": False},
        },
    )

    return client


def create_test_claude_client() -> MockClaudeClient:
    """Create a pre-configured mock Claude client."""
    client = MockClaudeClient()
    fixtures = TestFixtures()

    client.set_response(fixtures.ai_review_response())

    return client


# ============================================================================
# CI UTILITIES
# ============================================================================


def skip_if_no_credentials() -> bool:
    """Check if we should skip tests requiring credentials."""
    import os

    return not os.environ.get("GITHUB_TOKEN")


def get_test_temp_dir() -> Path:
    """Get temporary directory for tests."""
    import tempfile

    return Path(tempfile.mkdtemp(prefix="github_test_"))
