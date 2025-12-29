"""
PR Context Gatherer
===================

Pre-review context gathering phase that collects all necessary information
BEFORE the AI review agent starts. This ensures all context is available
inline without requiring the AI to make additional API calls.

Responsibilities:
- Fetch PR metadata (title, author, branches, description)
- Get all changed files with full content
- Detect monorepo structure and project layout
- Find related files (imports, tests, configs)
- Build complete diff with context
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

try:
    from .gh_client import GHClient, PRTooLargeError
except (ImportError, ValueError, SystemError):
    from gh_client import GHClient, PRTooLargeError

# Validation patterns for git refs and paths (defense-in-depth)
# These patterns allow common valid characters while rejecting potentially dangerous ones
SAFE_REF_PATTERN = re.compile(r"^[a-zA-Z0-9._/\-]+$")
SAFE_PATH_PATTERN = re.compile(r"^[a-zA-Z0-9._/\-@]+$")


def _validate_git_ref(ref: str) -> bool:
    """
    Validate git ref (branch name or commit SHA) for safe use in commands.

    Args:
        ref: Git ref to validate

    Returns:
        True if ref is safe, False otherwise
    """
    if not ref or len(ref) > 256:
        return False
    return bool(SAFE_REF_PATTERN.match(ref))


def _validate_file_path(path: str) -> bool:
    """
    Validate file path for safe use in git commands.

    Args:
        path: File path to validate

    Returns:
        True if path is safe, False otherwise
    """
    if not path or len(path) > 1024:
        return False
    # Reject path traversal attempts
    if ".." in path or path.startswith("/"):
        return False
    return bool(SAFE_PATH_PATTERN.match(path))


if TYPE_CHECKING:
    try:
        from .models import FollowupReviewContext, PRReviewResult
    except (ImportError, ValueError, SystemError):
        from models import FollowupReviewContext, PRReviewResult


@dataclass
class ChangedFile:
    """A file that was changed in the PR."""

    path: str
    status: str  # added, modified, deleted, renamed
    additions: int
    deletions: int
    content: str  # Current file content
    base_content: str  # Content before changes (for comparison)
    patch: str  # The diff patch for this file


@dataclass
class AIBotComment:
    """A comment from an AI review tool (CodeRabbit, Cursor, Greptile, etc.)."""

    comment_id: int
    author: str
    tool_name: str  # "CodeRabbit", "Cursor", "Greptile", etc.
    body: str
    file: str | None  # File path if it's a file-level comment
    line: int | None  # Line number if it's an inline comment
    created_at: str


# Known AI code review bots and their display names
# Organized by category for maintainability
AI_BOT_PATTERNS: dict[str, str] = {
    # === AI Code Review Tools ===
    "coderabbitai": "CodeRabbit",
    "coderabbit-ai": "CodeRabbit",
    "coderabbit[bot]": "CodeRabbit",
    "greptile": "Greptile",
    "greptile[bot]": "Greptile",
    "greptile-ai": "Greptile",
    "greptile-apps": "Greptile",
    "cursor": "Cursor",
    "cursor-ai": "Cursor",
    "cursor[bot]": "Cursor",
    "sourcery-ai": "Sourcery",
    "sourcery-ai[bot]": "Sourcery",
    "sourcery-ai-bot": "Sourcery",
    "codiumai": "Qodo",
    "codium-ai[bot]": "Qodo",
    "codiumai-agent": "Qodo",
    "qodo-merge-bot": "Qodo",
    # === AI Coding Assistants ===
    "copilot": "GitHub Copilot",
    "copilot[bot]": "GitHub Copilot",
    "copilot-swe-agent[bot]": "GitHub Copilot",
    "sweep-ai[bot]": "Sweep AI",
    "sweep-nightly[bot]": "Sweep AI",
    "sweep-canary[bot]": "Sweep AI",
    "bitoagent": "Bito AI",
    "codeium-ai-superpowers": "Codeium",
    "devin-ai-integration": "Devin AI",
    # === GitHub Native Bots ===
    "github-actions": "GitHub Actions",
    "github-actions[bot]": "GitHub Actions",
    "github-advanced-security": "GitHub Advanced Security",
    "github-advanced-security[bot]": "GitHub Advanced Security",
    "dependabot": "Dependabot",
    "dependabot[bot]": "Dependabot",
    "github-merge-queue[bot]": "GitHub Merge Queue",
    # === Code Quality & Static Analysis ===
    "sonarcloud": "SonarCloud",
    "sonarcloud[bot]": "SonarCloud",
    "deepsource-autofix": "DeepSource",
    "deepsource-autofix[bot]": "DeepSource",
    "deepsourcebot": "DeepSource",
    "codeclimate[bot]": "CodeClimate",
    "codefactor-io[bot]": "CodeFactor",
    "codacy[bot]": "Codacy",
    # === Security Scanning ===
    "snyk-bot": "Snyk",
    "snyk[bot]": "Snyk",
    "snyk-security-bot": "Snyk",
    "gitguardian[bot]": "GitGuardian",
    "semgrep-app[bot]": "Semgrep",
    "semgrep-bot": "Semgrep",
    # === Code Coverage ===
    "codecov[bot]": "Codecov",
    "codecov-commenter": "Codecov",
    "coveralls": "Coveralls",
    "coveralls[bot]": "Coveralls",
    # === Dependency Management ===
    "renovate[bot]": "Renovate",
    "renovate-bot": "Renovate",
    "self-hosted-renovate[bot]": "Renovate",
    # === PR Automation ===
    "mergify[bot]": "Mergify",
    "imgbotapp": "Imgbot",
    "imgbot[bot]": "Imgbot",
    "allstar[bot]": "Allstar",
    "percy[bot]": "Percy",
}


@dataclass
class PRContext:
    """Complete context for PR review."""

    pr_number: int
    title: str
    description: str
    author: str
    base_branch: str
    head_branch: str
    state: str  # PR state: open, closed, merged
    changed_files: list[ChangedFile]
    diff: str
    repo_structure: str  # Description of monorepo layout
    related_files: list[str]  # Imports, tests, etc.
    commits: list[dict] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)
    total_additions: int = 0
    total_deletions: int = 0
    # NEW: AI tool comments for triage
    ai_bot_comments: list[AIBotComment] = field(default_factory=list)
    # Flag indicating if full diff was skipped (PR > 20K lines)
    diff_truncated: bool = False


class PRContextGatherer:
    """Gathers all context needed for PR review BEFORE the AI starts."""

    def __init__(self, project_dir: Path, pr_number: int, repo: str | None = None):
        self.project_dir = Path(project_dir)
        self.pr_number = pr_number
        self.repo = repo
        self.gh_client = GHClient(
            project_dir=self.project_dir,
            default_timeout=30.0,
            max_retries=3,
            repo=repo,
        )

    async def gather(self) -> PRContext:
        """
        Gather all context for review.

        Returns:
            PRContext with all necessary information for review
        """
        print(f"[Context] Gathering context for PR #{self.pr_number}...", flush=True)

        # Fetch basic PR metadata
        pr_data = await self._fetch_pr_metadata()
        print(
            f"[Context] PR metadata: {pr_data['title']} by {pr_data['author']['login']}",
            flush=True,
        )

        # Ensure PR refs are available locally (fetches commits for fork PRs)
        head_sha = pr_data.get("headRefOid", "")
        base_sha = pr_data.get("baseRefOid", "")
        refs_available = False
        if head_sha and base_sha:
            refs_available = await self._ensure_pr_refs_available(head_sha, base_sha)
            if not refs_available:
                print(
                    "[Context] Warning: Could not fetch PR refs locally. "
                    "Will use GitHub API patches as fallback.",
                    flush=True,
                )

        # Fetch changed files with content
        changed_files = await self._fetch_changed_files(pr_data)
        print(f"[Context] Fetched {len(changed_files)} changed files", flush=True)

        # Fetch full diff
        diff = await self._fetch_pr_diff()
        print(f"[Context] Fetched diff: {len(diff)} chars", flush=True)

        # Detect repo structure
        repo_structure = self._detect_repo_structure()
        print("[Context] Detected repo structure", flush=True)

        # Find related files
        related_files = self._find_related_files(changed_files)
        print(f"[Context] Found {len(related_files)} related files", flush=True)

        # Fetch commits
        commits = await self._fetch_commits()
        print(f"[Context] Fetched {len(commits)} commits", flush=True)

        # Fetch AI bot comments for triage
        ai_bot_comments = await self._fetch_ai_bot_comments()
        print(f"[Context] Fetched {len(ai_bot_comments)} AI bot comments", flush=True)

        # Check if diff was truncated (empty diff but files were changed)
        diff_truncated = len(diff) == 0 and len(changed_files) > 0

        return PRContext(
            pr_number=self.pr_number,
            title=pr_data["title"],
            description=pr_data.get("body", ""),
            author=pr_data["author"]["login"],
            base_branch=pr_data["baseRefName"],
            head_branch=pr_data["headRefName"],
            state=pr_data.get("state", "open"),
            changed_files=changed_files,
            diff=diff,
            repo_structure=repo_structure,
            related_files=related_files,
            commits=commits,
            labels=[label["name"] for label in pr_data.get("labels", [])],
            total_additions=pr_data.get("additions", 0),
            total_deletions=pr_data.get("deletions", 0),
            ai_bot_comments=ai_bot_comments,
            diff_truncated=diff_truncated,
        )

    async def _fetch_pr_metadata(self) -> dict:
        """Fetch PR metadata from GitHub API via gh CLI."""
        return await self.gh_client.pr_get(
            self.pr_number,
            json_fields=[
                "number",
                "title",
                "body",
                "state",
                "headRefName",
                "baseRefName",
                "headRefOid",  # Commit SHA for head - works even when branch is unavailable locally
                "baseRefOid",  # Commit SHA for base - works even when branch is unavailable locally
                "author",
                "files",
                "additions",
                "deletions",
                "changedFiles",
                "labels",
            ],
        )

    async def _ensure_pr_refs_available(self, head_sha: str, base_sha: str) -> bool:
        """
        Ensure PR refs are available locally by fetching the commit SHAs.

        This solves the "fatal: bad revision" error when PR branches aren't
        available locally (e.g., PRs from forks or unfetched branches).

        Args:
            head_sha: The head commit SHA (from headRefOid)
            base_sha: The base commit SHA (from baseRefOid)

        Returns:
            True if refs are available, False otherwise
        """
        # Validate SHAs before using in git commands
        if not _validate_git_ref(head_sha):
            print(
                f"[Context] Invalid head SHA rejected: {head_sha[:50]}...", flush=True
            )
            return False
        if not _validate_git_ref(base_sha):
            print(
                f"[Context] Invalid base SHA rejected: {base_sha[:50]}...", flush=True
            )
            return False

        try:
            # Fetch the specific commits - this works even for fork PRs
            proc = await asyncio.create_subprocess_exec(
                "git",
                "fetch",
                "origin",
                head_sha,
                base_sha,
                cwd=self.project_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)

            if proc.returncode == 0:
                print(
                    f"[Context] Fetched PR refs: {head_sha[:8]}...{base_sha[:8]}",
                    flush=True,
                )
                return True
            else:
                # If direct SHA fetch fails, try fetching the PR ref
                print("[Context] Direct SHA fetch failed, trying PR ref...", flush=True)
                proc2 = await asyncio.create_subprocess_exec(
                    "git",
                    "fetch",
                    "origin",
                    f"pull/{self.pr_number}/head:refs/pr/{self.pr_number}",
                    cwd=self.project_dir,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await asyncio.wait_for(proc2.communicate(), timeout=30.0)
                if proc2.returncode == 0:
                    print(
                        f"[Context] Fetched PR ref: refs/pr/{self.pr_number}",
                        flush=True,
                    )
                    return True
                print(
                    f"[Context] Failed to fetch PR refs: {stderr.decode('utf-8')}",
                    flush=True,
                )
                return False
        except asyncio.TimeoutError:
            print("[Context] Timeout fetching PR refs", flush=True)
            return False
        except Exception as e:
            print(f"[Context] Error fetching PR refs: {e}", flush=True)
            return False

    async def _fetch_changed_files(self, pr_data: dict) -> list[ChangedFile]:
        """
        Fetch all changed files with their full content.

        For each file, we need:
        - Current content (HEAD of PR branch)
        - Base content (before changes)
        - Diff patch
        """
        changed_files = []
        files = pr_data.get("files", [])

        for file_info in files:
            path = file_info["path"]
            status = self._normalize_status(file_info.get("status", "modified"))
            additions = file_info.get("additions", 0)
            deletions = file_info.get("deletions", 0)

            print(f"[Context]   Processing {path} ({status})...", flush=True)

            # Use commit SHAs if available (works for fork PRs), fallback to branch names
            head_ref = pr_data.get("headRefOid") or pr_data["headRefName"]
            base_ref = pr_data.get("baseRefOid") or pr_data["baseRefName"]

            # Get current content (from PR head commit)
            content = await self._read_file_content(path, head_ref)

            # Get base content (from base commit)
            base_content = await self._read_file_content(path, base_ref)

            # Get the patch for this specific file
            patch = await self._get_file_patch(path, base_ref, head_ref)

            changed_files.append(
                ChangedFile(
                    path=path,
                    status=status,
                    additions=additions,
                    deletions=deletions,
                    content=content,
                    base_content=base_content,
                    patch=patch,
                )
            )

        return changed_files

    def _normalize_status(self, status: str) -> str:
        """Normalize file status to standard values."""
        status_lower = status.lower()
        if status_lower in ["added", "add"]:
            return "added"
        elif status_lower in ["modified", "mod", "changed"]:
            return "modified"
        elif status_lower in ["deleted", "del", "removed"]:
            return "deleted"
        elif status_lower in ["renamed", "rename"]:
            return "renamed"
        else:
            return status_lower

    async def _read_file_content(self, path: str, ref: str) -> str:
        """
        Read file content from a specific git ref.

        Args:
            path: File path relative to repo root
            ref: Git ref (branch name, commit hash, etc.)

        Returns:
            File content as string, or empty string if file doesn't exist
        """
        # Validate inputs to prevent command injection
        if not _validate_file_path(path):
            print(f"[Context] Invalid file path rejected: {path[:50]}...", flush=True)
            return ""
        if not _validate_git_ref(ref):
            print(f"[Context] Invalid git ref rejected: {ref[:50]}...", flush=True)
            return ""

        try:
            proc = await asyncio.create_subprocess_exec(
                "git",
                "show",
                f"{ref}:{path}",
                cwd=self.project_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)

            # File might not exist in base branch (new file)
            if proc.returncode != 0:
                return ""

            return stdout.decode("utf-8")
        except asyncio.TimeoutError:
            print(f"[Context] Timeout reading {path} from {ref}", flush=True)
            return ""
        except Exception as e:
            print(f"[Context] Error reading {path} from {ref}: {e}", flush=True)
            return ""

    async def _get_file_patch(self, path: str, base_ref: str, head_ref: str) -> str:
        """
        Get the diff patch for a specific file using git diff.

        Args:
            path: File path relative to repo root
            base_ref: Base branch ref
            head_ref: Head branch ref

        Returns:
            Unified diff patch for this file
        """
        # Validate inputs to prevent command injection
        if not _validate_file_path(path):
            print(f"[Context] Invalid file path rejected: {path[:50]}...", flush=True)
            return ""
        if not _validate_git_ref(base_ref):
            print(
                f"[Context] Invalid base ref rejected: {base_ref[:50]}...", flush=True
            )
            return ""
        if not _validate_git_ref(head_ref):
            print(
                f"[Context] Invalid head ref rejected: {head_ref[:50]}...", flush=True
            )
            return ""

        try:
            proc = await asyncio.create_subprocess_exec(
                "git",
                "diff",
                f"{base_ref}...{head_ref}",
                "--",
                path,
                cwd=self.project_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)

            if proc.returncode != 0:
                print(
                    f"[Context] Failed to get patch for {path}: {stderr.decode('utf-8')}",
                    flush=True,
                )
                return ""

            return stdout.decode("utf-8")
        except asyncio.TimeoutError:
            print(f"[Context] Timeout getting patch for {path}", flush=True)
            return ""
        except Exception as e:
            print(f"[Context] Error getting patch for {path}: {e}", flush=True)
            return ""

    async def _fetch_pr_diff(self) -> str:
        """
        Fetch complete PR diff from GitHub.

        Returns empty string if PR exceeds GitHub's 20K line limit.
        In this case, individual file patches from ChangedFile.patch should be used instead.
        """
        try:
            return await self.gh_client.pr_diff(self.pr_number)
        except PRTooLargeError as e:
            print(f"[Context] Warning: {str(e)}", flush=True)
            print(
                "[Context] Skipping full diff - will use individual file patches",
                flush=True,
            )
            return ""

    async def _fetch_commits(self) -> list[dict]:
        """Fetch commit history for this PR."""
        try:
            data = await self.gh_client.pr_get(self.pr_number, json_fields=["commits"])
            return data.get("commits", [])
        except Exception:
            return []

    async def _fetch_ai_bot_comments(self) -> list[AIBotComment]:
        """
        Fetch comments from AI code review tools on this PR.

        Fetches both:
        - Review comments (inline comments on files)
        - Issue comments (general PR comments)

        Returns comments from known AI tools like CodeRabbit, Cursor, Greptile, etc.
        """
        ai_comments: list[AIBotComment] = []

        try:
            # Fetch review comments (inline comments on files)
            review_comments = await self._fetch_pr_review_comments()
            for comment in review_comments:
                ai_comment = self._parse_ai_comment(comment, is_review_comment=True)
                if ai_comment:
                    ai_comments.append(ai_comment)

            # Fetch issue comments (general PR comments)
            issue_comments = await self._fetch_pr_issue_comments()
            for comment in issue_comments:
                ai_comment = self._parse_ai_comment(comment, is_review_comment=False)
                if ai_comment:
                    ai_comments.append(ai_comment)

        except Exception as e:
            print(f"[Context] Error fetching AI bot comments: {e}", flush=True)

        return ai_comments

    def _parse_ai_comment(
        self, comment: dict, is_review_comment: bool
    ) -> AIBotComment | None:
        """
        Parse a comment and return AIBotComment if it's from a known AI tool.

        Args:
            comment: Raw comment data from GitHub API
            is_review_comment: True for inline review comments, False for issue comments

        Returns:
            AIBotComment if author is a known AI bot, None otherwise
        """
        # Handle null author (deleted/suspended users return null from GitHub API)
        author_data = comment.get("author")
        author = (author_data.get("login", "") if author_data else "").lower()
        if not author:
            # Fallback for different API response formats
            user_data = comment.get("user")
            author = (user_data.get("login", "") if user_data else "").lower()

        # Check if author matches any known AI bot pattern
        tool_name = None
        for pattern, name in AI_BOT_PATTERNS.items():
            if pattern in author or author == pattern:
                tool_name = name
                break

        if not tool_name:
            return None

        # Extract file and line info for review comments
        file_path = None
        line = None
        if is_review_comment:
            file_path = comment.get("path")
            line = comment.get("line") or comment.get("original_line")

        return AIBotComment(
            comment_id=comment.get("id", 0),
            author=author,
            tool_name=tool_name,
            body=comment.get("body", ""),
            file=file_path,
            line=line,
            created_at=comment.get("createdAt", comment.get("created_at", "")),
        )

    async def _fetch_pr_review_comments(self) -> list[dict]:
        """Fetch inline review comments on the PR."""
        try:
            result = await self.gh_client.run(
                [
                    "api",
                    f"repos/{{owner}}/{{repo}}/pulls/{self.pr_number}/comments",
                    "--jq",
                    ".",
                ],
                raise_on_error=False,
            )
            if result.returncode == 0 and result.stdout.strip():
                return json.loads(result.stdout)
            return []
        except Exception as e:
            print(f"[Context] Error fetching review comments: {e}", flush=True)
            return []

    async def _fetch_pr_issue_comments(self) -> list[dict]:
        """Fetch general issue comments on the PR."""
        try:
            result = await self.gh_client.run(
                [
                    "api",
                    f"repos/{{owner}}/{{repo}}/issues/{self.pr_number}/comments",
                    "--jq",
                    ".",
                ],
                raise_on_error=False,
            )
            if result.returncode == 0 and result.stdout.strip():
                return json.loads(result.stdout)
            return []
        except Exception as e:
            print(f"[Context] Error fetching issue comments: {e}", flush=True)
            return []

    def _detect_repo_structure(self) -> str:
        """
        Detect and describe the repository structure.

        Looks for common monorepo patterns and returns a human-readable
        description that helps the AI understand the project layout.
        """
        structure_info = []

        # Check for monorepo indicators
        apps_dir = self.project_dir / "apps"
        packages_dir = self.project_dir / "packages"
        libs_dir = self.project_dir / "libs"

        if apps_dir.exists():
            apps = [
                d.name
                for d in apps_dir.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            ]
            if apps:
                structure_info.append(f"**Monorepo Apps**: {', '.join(apps)}")

        if packages_dir.exists():
            packages = [
                d.name
                for d in packages_dir.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            ]
            if packages:
                structure_info.append(f"**Packages**: {', '.join(packages)}")

        if libs_dir.exists():
            libs = [
                d.name
                for d in libs_dir.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            ]
            if libs:
                structure_info.append(f"**Libraries**: {', '.join(libs)}")

        # Check for package.json (Node.js)
        if (self.project_dir / "package.json").exists():
            try:
                with open(self.project_dir / "package.json") as f:
                    pkg_data = json.load(f)
                    if "workspaces" in pkg_data:
                        structure_info.append(
                            f"**Workspaces**: {', '.join(pkg_data['workspaces'])}"
                        )
            except (json.JSONDecodeError, KeyError):
                pass

        # Check for Python project structure
        if (self.project_dir / "pyproject.toml").exists():
            structure_info.append("**Python Project** (pyproject.toml)")

        if (self.project_dir / "requirements.txt").exists():
            structure_info.append("**Python** (requirements.txt)")

        # Check for common framework indicators
        if (self.project_dir / "angular.json").exists():
            structure_info.append("**Framework**: Angular")
        if (self.project_dir / "next.config.js").exists():
            structure_info.append("**Framework**: Next.js")
        if (self.project_dir / "nuxt.config.js").exists():
            structure_info.append("**Framework**: Nuxt.js")
        if (self.project_dir / "vite.config.ts").exists() or (
            self.project_dir / "vite.config.js"
        ).exists():
            structure_info.append("**Build**: Vite")

        # Check for Electron
        if (self.project_dir / "electron.vite.config.ts").exists():
            structure_info.append("**Electron** app")

        if not structure_info:
            return "**Structure**: Standard single-package repository"

        return "\n".join(structure_info)

    def _find_related_files(self, changed_files: list[ChangedFile]) -> list[str]:
        """
        Find files related to the changes.

        This includes:
        - Test files for changed source files
        - Imported modules and dependencies
        - Configuration files in the same directory
        - Related type definition files
        """
        related = set()

        for changed_file in changed_files:
            path = Path(changed_file.path)

            # Find test files
            related.update(self._find_test_files(path))

            # Find imported files (for supported languages)
            if path.suffix in [".ts", ".tsx", ".js", ".jsx", ".py"]:
                related.update(self._find_imports(changed_file.content, path))

            # Find config files in same directory
            related.update(self._find_config_files(path.parent))

            # Find type definition files
            if path.suffix in [".ts", ".tsx"]:
                related.update(self._find_type_definitions(path))

        # Remove files that are already in changed_files
        changed_paths = {cf.path for cf in changed_files}
        related = {r for r in related if r not in changed_paths}

        # Limit to 20 most relevant files
        return sorted(related)[:20]

    def _find_test_files(self, source_path: Path) -> set[str]:
        """Find test files related to a source file."""
        test_patterns = [
            # Jest/Vitest patterns
            source_path.parent / f"{source_path.stem}.test{source_path.suffix}",
            source_path.parent / f"{source_path.stem}.spec{source_path.suffix}",
            source_path.parent / "__tests__" / f"{source_path.name}",
            # Python patterns
            source_path.parent / f"test_{source_path.stem}.py",
            source_path.parent / f"{source_path.stem}_test.py",
            # Go patterns
            source_path.parent / f"{source_path.stem}_test.go",
        ]

        found = set()
        for test_path in test_patterns:
            full_path = self.project_dir / test_path
            if full_path.exists() and full_path.is_file():
                found.add(str(test_path))

        return found

    def _find_imports(self, content: str, source_path: Path) -> set[str]:
        """
        Find imported files from source code.

        Supports:
        - JavaScript/TypeScript: import statements
        - Python: import statements
        """
        imports = set()

        if source_path.suffix in [".ts", ".tsx", ".js", ".jsx"]:
            # Match: import ... from './file' or from '../file'
            # Only relative imports (starting with . or ..)
            pattern = r"from\s+['\"](\.[^'\"]+)['\"]"
            for match in re.finditer(pattern, content):
                import_path = match.group(1)
                resolved = self._resolve_import_path(import_path, source_path)
                if resolved:
                    imports.add(resolved)

        elif source_path.suffix == ".py":
            # Python relative imports are complex, skip for now
            # Could add support for "from . import" later
            pass

        return imports

    def _resolve_import_path(self, import_path: str, source_path: Path) -> str | None:
        """
        Resolve a relative import path to an absolute file path.

        Args:
            import_path: Relative import like './utils' or '../config'
            source_path: Path of the file doing the importing

        Returns:
            Absolute path relative to project root, or None if not found
        """
        # Start from the directory containing the source file
        base_dir = source_path.parent

        # Resolve relative path
        resolved = (base_dir / import_path).resolve()

        # Try common extensions if no extension provided
        if not resolved.suffix:
            for ext in [".ts", ".tsx", ".js", ".jsx"]:
                candidate = resolved.with_suffix(ext)
                if candidate.exists() and candidate.is_file():
                    try:
                        rel_path = candidate.relative_to(self.project_dir)
                        return str(rel_path)
                    except ValueError:
                        # File is outside project directory
                        return None

            # Also check for index files
            for ext in [".ts", ".tsx", ".js", ".jsx"]:
                index_file = resolved / f"index{ext}"
                if index_file.exists() and index_file.is_file():
                    try:
                        rel_path = index_file.relative_to(self.project_dir)
                        return str(rel_path)
                    except ValueError:
                        return None

        # File with extension
        if resolved.exists() and resolved.is_file():
            try:
                rel_path = resolved.relative_to(self.project_dir)
                return str(rel_path)
            except ValueError:
                return None

        return None

    def _find_config_files(self, directory: Path) -> set[str]:
        """Find configuration files in a directory."""
        config_names = [
            "tsconfig.json",
            "package.json",
            "pyproject.toml",
            "setup.py",
            ".eslintrc",
            ".prettierrc",
            "jest.config.js",
            "vitest.config.ts",
            "vite.config.ts",
        ]

        found = set()
        for name in config_names:
            config_path = directory / name
            full_path = self.project_dir / config_path
            if full_path.exists() and full_path.is_file():
                found.add(str(config_path))

        return found

    def _find_type_definitions(self, source_path: Path) -> set[str]:
        """Find TypeScript type definition files."""
        # Look for .d.ts files with same name
        type_def = source_path.parent / f"{source_path.stem}.d.ts"
        full_path = self.project_dir / type_def

        if full_path.exists() and full_path.is_file():
            return {str(type_def)}

        return set()


class FollowupContextGatherer:
    """
    Gathers context specifically for follow-up reviews.

    Unlike the full PRContextGatherer, this only fetches:
    - New commits since last review
    - Changed files since last review
    - New comments since last review
    """

    def __init__(
        self,
        project_dir: Path,
        pr_number: int,
        previous_review: PRReviewResult,  # Forward reference
        repo: str | None = None,
    ):
        self.project_dir = Path(project_dir)
        self.pr_number = pr_number
        self.previous_review = previous_review
        self.repo = repo
        self.gh_client = GHClient(
            project_dir=self.project_dir,
            default_timeout=30.0,
            max_retries=3,
            repo=repo,
        )

    async def gather(self) -> FollowupReviewContext:
        """
        Gather context for a follow-up review.

        Returns:
            FollowupReviewContext with changes since last review
        """
        # Import here to avoid circular imports
        try:
            from .models import FollowupReviewContext
        except (ImportError, ValueError, SystemError):
            from models import FollowupReviewContext

        previous_sha = self.previous_review.reviewed_commit_sha

        if not previous_sha:
            print(
                "[Followup] No reviewed_commit_sha in previous review, cannot gather incremental context",
                flush=True,
            )
            return FollowupReviewContext(
                pr_number=self.pr_number,
                previous_review=self.previous_review,
                previous_commit_sha="",
                current_commit_sha="",
            )

        print(
            f"[Followup] Gathering context since commit {previous_sha[:8]}...",
            flush=True,
        )

        # Get current HEAD SHA
        current_sha = await self.gh_client.get_pr_head_sha(self.pr_number)

        if not current_sha:
            print("[Followup] Could not fetch current HEAD SHA", flush=True)
            return FollowupReviewContext(
                pr_number=self.pr_number,
                previous_review=self.previous_review,
                previous_commit_sha=previous_sha,
                current_commit_sha="",
            )

        if previous_sha == current_sha:
            print("[Followup] No new commits since last review", flush=True)
            return FollowupReviewContext(
                pr_number=self.pr_number,
                previous_review=self.previous_review,
                previous_commit_sha=previous_sha,
                current_commit_sha=current_sha,
            )

        print(
            f"[Followup] Comparing {previous_sha[:8]}...{current_sha[:8]}", flush=True
        )

        # Get commit comparison
        try:
            comparison = await self.gh_client.compare_commits(previous_sha, current_sha)
        except Exception as e:
            print(f"[Followup] Error comparing commits: {e}", flush=True)
            return FollowupReviewContext(
                pr_number=self.pr_number,
                previous_review=self.previous_review,
                previous_commit_sha=previous_sha,
                current_commit_sha=current_sha,
            )

        # Extract data from comparison
        commits = comparison.get("commits", [])
        files = comparison.get("files", [])
        print(
            f"[Followup] Found {len(commits)} new commits, {len(files)} changed files",
            flush=True,
        )

        # Build diff from file patches
        diff_parts = []
        files_changed = []
        for file_info in files:
            filename = file_info.get("filename", "")
            files_changed.append(filename)
            patch = file_info.get("patch", "")
            if patch:
                diff_parts.append(f"--- a/{filename}\n+++ b/{filename}\n{patch}")

        diff_since_review = "\n\n".join(diff_parts)

        # Get comments since last review
        try:
            comments = await self.gh_client.get_comments_since(
                self.pr_number, self.previous_review.reviewed_at
            )
        except Exception as e:
            print(f"[Followup] Error fetching comments: {e}", flush=True)
            comments = {"review_comments": [], "issue_comments": []}

        # Get formal PR reviews since last review (from Cursor, CodeRabbit, etc.)
        try:
            pr_reviews = await self.gh_client.get_reviews_since(
                self.pr_number, self.previous_review.reviewed_at
            )
        except Exception as e:
            print(f"[Followup] Error fetching PR reviews: {e}", flush=True)
            pr_reviews = []

        # Separate AI bot comments from contributor comments
        ai_comments = []
        contributor_comments = []

        all_comments = comments.get("review_comments", []) + comments.get(
            "issue_comments", []
        )

        for comment in all_comments:
            author = ""
            if isinstance(comment.get("user"), dict):
                author = comment["user"].get("login", "").lower()
            elif isinstance(comment.get("author"), dict):
                author = comment["author"].get("login", "").lower()

            is_ai_bot = any(pattern in author for pattern in AI_BOT_PATTERNS.keys())

            if is_ai_bot:
                ai_comments.append(comment)
            else:
                contributor_comments.append(comment)

        # Separate AI bot reviews from contributor reviews
        ai_reviews = []
        contributor_reviews = []

        for review in pr_reviews:
            author = ""
            if isinstance(review.get("user"), dict):
                author = review["user"].get("login", "").lower()

            is_ai_bot = any(pattern in author for pattern in AI_BOT_PATTERNS.keys())

            if is_ai_bot:
                ai_reviews.append(review)
            else:
                contributor_reviews.append(review)

        # Combine AI comments and reviews for reporting
        total_ai_feedback = len(ai_comments) + len(ai_reviews)
        total_contributor_feedback = len(contributor_comments) + len(
            contributor_reviews
        )

        print(
            f"[Followup] Found {total_contributor_feedback} contributor feedback "
            f"({len(contributor_comments)} comments, {len(contributor_reviews)} reviews), "
            f"{total_ai_feedback} AI feedback "
            f"({len(ai_comments)} comments, {len(ai_reviews)} reviews)",
            flush=True,
        )

        return FollowupReviewContext(
            pr_number=self.pr_number,
            previous_review=self.previous_review,
            previous_commit_sha=previous_sha,
            current_commit_sha=current_sha,
            commits_since_review=commits,
            files_changed_since_review=files_changed,
            diff_since_review=diff_since_review,
            contributor_comments_since_review=contributor_comments
            + contributor_reviews,
            ai_bot_comments_since_review=ai_comments,
            pr_reviews_since_review=ai_reviews,
        )
