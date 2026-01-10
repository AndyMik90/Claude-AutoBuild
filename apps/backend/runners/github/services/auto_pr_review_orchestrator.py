"""
Auto PR Review Orchestrator
===========================

Main orchestration loop for autonomous PR review and fix system.

Key features:
- Concurrent review semaphore (max 3 concurrent reviews)
- Lifecycle locking for crash recovery
- State persistence after each significant operation
- Max 5 iterations enforced
- Graceful cancellation support
- NEVER auto-merges (human approval required)

Usage:
    orchestrator = AutoPRReviewOrchestrator(
        github_dir=Path(".auto-claude/github"),
        project_dir=Path("./"),
        spec_dir=Path("./.auto-claude/specs/001"),
    )

    result = await orchestrator.run(
        pr_number=123,
        repo="owner/repo",
        pr_url="https://github.com/owner/repo/pull/123",
        branch_name="feature-branch",
        triggered_by="username",
    )
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

try:
    import structlog
    from structlog.contextvars import (
        bind_contextvars,
        bound_contextvars,
        clear_contextvars,
    )

    logger = structlog.get_logger(__name__)
    STRUCTLOG_AVAILABLE = True
except ImportError:
    logger = logging.getLogger(__name__)
    STRUCTLOG_AVAILABLE = False

    # Fallback no-op context functions
    def bind_contextvars(**kwargs):
        pass

    def clear_contextvars():
        pass

    class bound_contextvars:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass


try:
    from ..models_pkg.pr_review_state import (
        PRReviewOrchestratorState,
        PRReviewStatus,
    )
    from .pr_check_waiter import (
        WaitForChecksResult,
        WaitResult,
        get_pr_check_waiter,
    )
except ImportError:
    # When running directly (not as package)
    from models_pkg.pr_review_state import (
        PRReviewOrchestratorState,
        PRReviewStatus,
    )
    from services.pr_check_waiter import (
        WaitForChecksResult,
        WaitResult,
        get_pr_check_waiter,
    )

# Note: GitHubOrchestrator is imported lazily in _run_ai_review() to avoid circular imports

# =============================================================================
# Configuration
# =============================================================================

# Environment variables
ALLOWED_USERS_ENV_VAR = "GITHUB_AUTO_PR_REVIEW_ALLOWED_USERS"
EXPECTED_BOTS_ENV_VAR = "GITHUB_EXPECTED_BOTS"

# Default configuration
DEFAULT_MAX_ITERATIONS = 5
DEFAULT_MAX_CONCURRENT_REVIEWS = 3
DEFAULT_CI_TIMEOUT = 1800.0  # 30 minutes
DEFAULT_BOT_TIMEOUT = 900.0  # 15 minutes


class OrchestratorResult(str, Enum):
    """Result of the orchestrator run."""

    # Success states
    READY_TO_MERGE = "ready_to_merge"  # All checks pass, human approval needed
    NO_FINDINGS = "no_findings"  # No findings to fix

    # Human review required
    NEEDS_HUMAN_REVIEW = "needs_human_review"  # Findings exist but can't be auto-fixed

    # Failure states
    MAX_ITERATIONS = "max_iterations"  # Hit iteration limit
    CI_FAILED = "ci_failed"  # CI checks failed and couldn't be fixed
    CANCELLED = "cancelled"  # User cancelled
    UNAUTHORIZED = "unauthorized"  # User not authorized
    PR_CLOSED = "pr_closed"  # PR was closed during review
    PR_MERGED = "pr_merged"  # PR was merged externally
    ERROR = "error"  # Unrecoverable error


@dataclass
class OrchestratorRunResult:
    """Result of an orchestrator run."""

    result: OrchestratorResult
    pr_number: int
    repo: str
    iterations_completed: int = 0
    findings_fixed: int = 0
    findings_unfixed: int = 0
    ci_all_passed: bool = False
    needs_human_review: bool = True  # Always true - never auto-merge
    state: PRReviewOrchestratorState | None = None
    error_message: str | None = None
    duration_seconds: float = 0.0
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "result": self.result.value,
            "pr_number": self.pr_number,
            "repo": self.repo,
            "iterations_completed": self.iterations_completed,
            "findings_fixed": self.findings_fixed,
            "findings_unfixed": self.findings_unfixed,
            "ci_all_passed": self.ci_all_passed,
            "needs_human_review": self.needs_human_review,
            "error_message": self.error_message,
            "duration_seconds": self.duration_seconds,
            "timestamp": self.timestamp,
        }


class OrchestratorCancelledError(Exception):
    """Raised when orchestrator is cancelled."""

    pass


class OrchestratorUnauthorizedError(Exception):
    """Raised when user is not authorized."""

    def __init__(self, username: str):
        self.username = username
        super().__init__(f"User '{username}' is not authorized for Auto-PR-Review")


# =============================================================================
# Main Orchestrator Class
# =============================================================================


class AutoPRReviewOrchestrator:
    """
    Main orchestration loop for autonomous PR review and fix system.

    Features:
    - Concurrent review semaphore (max 3 concurrent reviews)
    - State persistence for crash recovery
    - Max 5 iterations enforced
    - CI check waiting with circuit breaker
    - External bot comment collection
    - PR fixer agent invocation
    - Cancellation support
    - NEVER auto-merges (human approval required)

    Usage:
        orchestrator = AutoPRReviewOrchestrator(
            github_dir=Path(".auto-claude/github"),
            project_dir=Path("./"),
            spec_dir=Path("./.auto-claude/specs/001"),
        )

        result = await orchestrator.run(
            pr_number=123,
            repo="owner/repo",
            pr_url="https://github.com/owner/repo/pull/123",
            branch_name="feature-branch",
            triggered_by="username",
        )

    Configuration:
        Set GITHUB_AUTO_PR_REVIEW_ALLOWED_USERS env var with allowed usernames.
        Set GITHUB_EXPECTED_BOTS env var with expected bot names to wait for.
    """

    def __init__(
        self,
        github_dir: Path,
        project_dir: Path,
        spec_dir: Path,
        max_iterations: int = DEFAULT_MAX_ITERATIONS,
        max_concurrent_reviews: int = DEFAULT_MAX_CONCURRENT_REVIEWS,
        ci_timeout: float = DEFAULT_CI_TIMEOUT,
        bot_timeout: float = DEFAULT_BOT_TIMEOUT,
        log_enabled: bool = True,
    ):
        """
        Initialize the Auto PR Review Orchestrator.

        Args:
            github_dir: Directory for GitHub state files (.auto-claude/github)
            project_dir: Project root directory
            spec_dir: Spec directory for this task
            max_iterations: Maximum fix iterations (default: 5)
            max_concurrent_reviews: Maximum concurrent reviews (default: 3)
            ci_timeout: Timeout for CI checks in seconds (default: 1800)
            bot_timeout: Timeout for external bots in seconds (default: 900)
            log_enabled: Whether to log operations
        """
        self.github_dir = Path(github_dir)
        self.project_dir = Path(project_dir)
        self.spec_dir = Path(spec_dir)
        self.max_iterations = max_iterations
        self.max_concurrent_reviews = max_concurrent_reviews
        self.ci_timeout = ci_timeout
        self.bot_timeout = bot_timeout
        self.log_enabled = log_enabled

        # Concurrent review semaphore
        self._semaphore = asyncio.Semaphore(max_concurrent_reviews)

        # Active reviews tracking
        self._active_reviews: dict[int, PRReviewOrchestratorState] = {}
        self._active_reviews_lock = asyncio.Lock()

        # Cancellation tracking
        self._cancel_events: dict[int, asyncio.Event] = {}

        # Load configuration from environment
        self._allowed_users = self._load_allowed_users()
        self._expected_bots = self._load_expected_bots()

        if self.log_enabled:
            self._log_info(
                "AutoPRReviewOrchestrator initialized",
                github_dir=str(github_dir),
                max_iterations=max_iterations,
                max_concurrent_reviews=max_concurrent_reviews,
                allowed_users_count=len(self._allowed_users),
            )

    # =========================================================================
    # Logging Helpers
    # =========================================================================

    def _bind_context(
        self,
        correlation_id: str,
        pr_number: int | None = None,
        repo: str | None = None,
    ) -> None:
        """
        Bind context variables for structured logging throughout the PR review flow.

        This binds correlation_id, pr_number, and repo to the logger context so they
        are automatically included in all subsequent log statements without explicitly
        passing them each time.

        Args:
            correlation_id: Unique identifier for this review session
            pr_number: Optional PR number being reviewed
            repo: Optional repository in owner/repo format
        """
        context = {"correlation_id": correlation_id}
        if pr_number is not None:
            context["pr_number"] = pr_number
        if repo is not None:
            context["repo"] = repo
        bind_contextvars(**context)

    def _clear_context(self) -> None:
        """Clear all bound context variables."""
        clear_contextvars()

    def _log_info(self, message: str, **kwargs: Any) -> None:
        """Log an info message with context."""
        if not self.log_enabled:
            return
        if STRUCTLOG_AVAILABLE:
            logger.info(message, **kwargs)
        else:
            logger.info(f"{message} {kwargs}")

    def _log_warning(self, message: str, **kwargs: Any) -> None:
        """Log a warning message with context."""
        if not self.log_enabled:
            return
        if STRUCTLOG_AVAILABLE:
            logger.warning(message, **kwargs)
        else:
            logger.warning(f"{message} {kwargs}")

    def _log_error(self, message: str, **kwargs: Any) -> None:
        """Log an error message with context."""
        if STRUCTLOG_AVAILABLE:
            logger.error(message, **kwargs)
        else:
            logger.error(f"{message} {kwargs}")

    # =========================================================================
    # Configuration Loading
    # =========================================================================

    def _load_allowed_users(self) -> set[str]:
        """Load allowed users from environment variable."""
        raw_value = os.environ.get(ALLOWED_USERS_ENV_VAR, "").strip()
        if not raw_value:
            return set()

        # Support wildcard for all users
        if raw_value == "*":
            return {"*"}

        users = {u.strip().lower() for u in raw_value.split(",") if u.strip()}
        return users

    def _load_expected_bots(self) -> list[str]:
        """Load expected bot names from environment variable."""
        raw_value = os.environ.get(EXPECTED_BOTS_ENV_VAR, "").strip()
        if not raw_value:
            return []

        return [b.strip() for b in raw_value.split(",") if b.strip()]

    # =========================================================================
    # Authorization
    # =========================================================================

    def is_user_authorized(self, username: str) -> bool:
        """
        Check if a user is authorized to trigger Auto-PR-Review.

        Args:
            username: GitHub username to check

        Returns:
            True if authorized
        """
        if not self._allowed_users:
            # No allowlist configured - deny all by default
            return False

        if "*" in self._allowed_users:
            # Wildcard allows all users
            return True

        return username.lower() in self._allowed_users

    def _require_authorization(self, username: str) -> None:
        """
        Require authorization for a user.

        Args:
            username: GitHub username to check

        Raises:
            OrchestratorUnauthorizedError: If not authorized
        """
        if not self.is_user_authorized(username):
            raise OrchestratorUnauthorizedError(username)

    # =========================================================================
    # Cancellation
    # =========================================================================

    def cancel(self, pr_number: int) -> bool:
        """
        Request cancellation for a PR review.

        Args:
            pr_number: PR number to cancel

        Returns:
            True if cancellation was requested
        """
        if pr_number in self._cancel_events:
            self._cancel_events[pr_number].set()
            self._log_info(
                "Cancellation requested",
                pr_number=pr_number,
            )
            return True
        return False

    def _check_cancelled(self, pr_number: int) -> None:
        """Check if cancellation was requested and raise if so."""
        if pr_number in self._cancel_events:
            if self._cancel_events[pr_number].is_set():
                raise OrchestratorCancelledError(
                    f"Review of PR #{pr_number} was cancelled"
                )

    # =========================================================================
    # State Management
    # =========================================================================

    def _get_state_path(self, pr_number: int) -> Path:
        """Get the path to state file for a PR."""
        return self.github_dir / "pr_review_state" / f"pr_{pr_number}.json"

    def _save_state(self, state: PRReviewOrchestratorState) -> None:
        """Save state to disk with file locking."""
        state.save_sync(self.github_dir)
        self._log_info(
            "State saved",
            pr_number=state.pr_number,
            status=state.status.value,
            iteration=state.current_iteration,
            correlation_id=state.correlation_id,
        )

    def _load_state(self, pr_number: int) -> PRReviewOrchestratorState | None:
        """Load state from disk."""
        return PRReviewOrchestratorState.load(self.github_dir, pr_number)

    # =========================================================================
    # PR Information
    # =========================================================================

    async def _get_pr_files(self, pr_number: int, repo: str) -> list[str]:
        """
        Get list of files changed in the PR.

        Args:
            pr_number: PR number
            repo: Repository in owner/repo format

        Returns:
            List of changed file paths
        """
        cmd = [
            "gh",
            "pr",
            "view",
            str(pr_number),
            "--repo",
            repo,
            "--json",
            "files",
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                self._log_warning(
                    f"Failed to get PR files: {result.stderr}",
                    pr_number=pr_number,
                    repo=repo,
                )
                return []

            data = json.loads(result.stdout)
            files = data.get("files", []) or []
            return [f.get("path", "") for f in files if f.get("path")]

        except subprocess.TimeoutExpired:
            self._log_warning("gh pr view timed out", pr_number=pr_number)
            return []
        except json.JSONDecodeError:
            self._log_warning("Invalid JSON from gh pr view", pr_number=pr_number)
            return []

    async def _get_pr_head_sha(self, pr_number: int, repo: str) -> str | None:
        """
        Get the current HEAD SHA of the PR.

        Args:
            pr_number: PR number
            repo: Repository in owner/repo format

        Returns:
            HEAD SHA or None if unavailable
        """
        cmd = [
            "gh",
            "pr",
            "view",
            str(pr_number),
            "--repo",
            repo,
            "--json",
            "headRefOid",
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                return None

            data = json.loads(result.stdout)
            return data.get("headRefOid")

        except (subprocess.TimeoutExpired, json.JSONDecodeError):
            return None

    # =========================================================================
    # Review Loop Helpers
    # =========================================================================

    async def _wait_for_checks(
        self,
        state: PRReviewOrchestratorState,
        on_progress: Callable[[str, Any], None] | None = None,
    ) -> WaitForChecksResult:
        """
        Wait for CI checks and external bot comments.

        Args:
            state: Current orchestrator state
            on_progress: Optional progress callback

        Returns:
            WaitForChecksResult with check status
        """
        state.status = PRReviewStatus.AWAITING_CHECKS
        self._save_state(state)

        if on_progress:
            on_progress("awaiting_checks", {"iteration": state.current_iteration})

        waiter = get_pr_check_waiter(
            correlation_id=state.correlation_id,
            ci_timeout=self.ci_timeout,
            bot_timeout=self.bot_timeout,
        )

        def check_progress(
            poll_count: int,
            ci_checks: list,
            bot_statuses: list,
        ) -> None:
            # Check for cancellation during polling
            try:
                self._check_cancelled(state.pr_number)
            except OrchestratorCancelledError:
                waiter.cancel()

            if on_progress:
                on_progress(
                    "polling",
                    {
                        "poll_count": poll_count,
                        "ci_checks_count": len(ci_checks),
                        "bot_statuses_count": len(bot_statuses),
                    },
                )

        result = await waiter.wait_for_all_checks(
            pr_number=state.pr_number,
            repo=state.repo,
            expected_bots=self._expected_bots,
            head_sha=state.last_known_head_sha,
            ci_timeout=self.ci_timeout,
            bot_timeout=self.bot_timeout,
            on_progress=check_progress,
        )

        # Update state with check results
        state.ci_checks = result.ci_checks
        state.ci_checks_last_polled = datetime.now(timezone.utc).isoformat()
        state.ci_all_passed = result.all_passed
        state.external_bot_statuses = result.bot_statuses
        state.bots_last_polled = datetime.now(timezone.utc).isoformat()

        if result.final_head_sha:
            state.last_known_head_sha = result.final_head_sha

        self._save_state(state)

        return result

    async def _run_ai_review(
        self,
        state: PRReviewOrchestratorState,
        on_progress: Callable[[str, Any], None] | None = None,
    ) -> list[dict]:
        """
        Run AI review on the PR using the GitHubOrchestrator.

        This is the core AI review step that analyzes code quality,
        security, and other issues.

        Args:
            state: Current orchestrator state
            on_progress: Optional progress callback

        Returns:
            List of finding dictionaries from AI review
        """
        state.status = PRReviewStatus.REVIEWING
        self._save_state(state)

        if on_progress:
            on_progress("ai_reviewing", {"iteration": state.current_iteration})

        self._log_info(
            "Running AI review",
            pr_number=state.pr_number,
            iteration=state.current_iteration,
        )

        findings = []

        try:
            # Lazy import to avoid circular dependency
            # (orchestrator.py imports services/__init__.py which imports this file)
            try:
                from ..models import GitHubRunnerConfig
                from ..orchestrator import GitHubOrchestrator
            except ImportError:
                from models import GitHubRunnerConfig
                from orchestrator import GitHubOrchestrator

            # Get GitHub token from environment
            token = os.environ.get("GITHUB_TOKEN", "")
            if not token:
                self._log_warning(
                    "No GITHUB_TOKEN found, AI review may fail",
                    pr_number=state.pr_number,
                )

            # Create GitHubRunnerConfig for AI review
            config = GitHubRunnerConfig(
                token=token,
                repo=state.repo,
                pr_review_enabled=True,
                auto_post_reviews=True,  # Post review comments to GitHub
                use_parallel_orchestrator=True,
            )

            # Create GitHubOrchestrator
            orchestrator = GitHubOrchestrator(
                project_dir=self.project_dir,
                config=config,
            )

            # Run the AI review
            review_result = await orchestrator.review_pr(
                pr_number=state.pr_number,
                force_review=True,  # Always run fresh review
            )

            self._log_info(
                "AI review completed",
                pr_number=state.pr_number,
                findings_count=len(review_result.findings)
                if review_result.findings
                else 0,
                verdict=review_result.verdict.value
                if review_result.verdict
                else "unknown",
            )

            # Convert findings to our format
            if review_result.findings:
                for finding in review_result.findings:
                    findings.append(
                        {
                            "finding_id": f"ai-{uuid.uuid4().hex[:8]}",
                            "source": "ai_review",
                            "severity": finding.severity
                            if hasattr(finding, "severity")
                            else "medium",
                            "file_path": finding.file
                            if hasattr(finding, "file")
                            else "",
                            "line_number": finding.line
                            if hasattr(finding, "line")
                            else None,
                            "description": finding.message
                            if hasattr(finding, "message")
                            else str(finding),
                            "suggestion": finding.suggestion
                            if hasattr(finding, "suggestion")
                            else None,
                            "trusted": True,  # AI review findings are trusted
                        }
                    )

        except Exception as e:
            self._log_error(
                f"AI review failed: {e}",
                pr_number=state.pr_number,
            )
            # Don't fail the whole process - continue with other findings
            state.record_error(f"AI review failed: {e}")

        self._save_state(state)
        return findings

    async def _collect_findings(
        self,
        state: PRReviewOrchestratorState,
        check_result: WaitForChecksResult,
    ) -> list[dict]:
        """
        Collect findings from CI failures and bot comments.

        Args:
            state: Current orchestrator state
            check_result: Result from wait_for_checks

        Returns:
            List of finding dictionaries
        """
        findings = []

        # Collect CI failures
        for failure in check_result.failures:
            findings.append(
                {
                    "finding_id": f"ci-{failure.name}-{uuid.uuid4().hex[:8]}",
                    "source": "ci",
                    "severity": "high",
                    "file_path": "",  # CI failures may not have specific file
                    "description": f"CI check '{failure.name}' failed: {failure.reason}",
                    "trusted": True,  # CI is always trusted
                }
            )

        # Collect findings from bot comments
        # Note: In a real implementation, this would parse bot comment content
        # to extract specific findings with file paths and line numbers
        for bot_status in check_result.bot_statuses:
            if bot_status.findings_count > 0:
                findings.append(
                    {
                        "finding_id": f"bot-{bot_status.bot_name}-{uuid.uuid4().hex[:8]}",
                        "source": bot_status.bot_name.lower(),
                        "severity": "medium",
                        "file_path": "",  # Would be parsed from comment
                        "description": f"Finding from {bot_status.bot_name}",
                        "trusted": bot_status.trusted,
                    }
                )

        return findings

    async def _apply_fixes(
        self,
        state: PRReviewOrchestratorState,
        findings: list[dict],
        allowed_files: list[str],
        on_progress: Callable[[str, Any], None] | None = None,
    ) -> tuple[int, int]:
        """
        Apply fixes for the collected findings.

        Args:
            state: Current orchestrator state
            findings: List of findings to fix
            allowed_files: List of files allowed to be modified
            on_progress: Optional progress callback

        Returns:
            Tuple of (fixes_applied, fixes_failed)
        """
        state.status = PRReviewStatus.FIXING
        self._save_state(state)

        if on_progress:
            on_progress(
                "fixing",
                {
                    "iteration": state.current_iteration,
                    "findings_count": len(findings),
                },
            )

        # Import PR Fixer Agent
        try:
            from agents.pr_fixer import (
                FindingSeverity,
                FindingSource,
                PRFinding,
                PRFixerAgent,
            )

            # Convert findings to PRFinding objects
            # Only include findings that have a file_path - without it, we can't fix them
            pr_findings = []
            skipped_findings = []

            source_map = {
                "ci": FindingSource.CI,
                "coderabbit": FindingSource.CODERABBIT,
                "coderabbitai[bot]": FindingSource.CODERABBIT,
                "cursor": FindingSource.CURSOR,
                "dependabot": FindingSource.DEPENDABOT,
                "dependabot[bot]": FindingSource.DEPENDABOT,
            }
            severity_map = {
                "critical": FindingSeverity.CRITICAL,
                "high": FindingSeverity.HIGH,
                "medium": FindingSeverity.MEDIUM,
                "low": FindingSeverity.LOW,
            }

            for f in findings:
                file_path = f.get("file_path", "").strip()

                # Skip findings without a file path - they cannot be auto-fixed
                if not file_path:
                    skipped_findings.append(f)
                    self._log_warning(
                        f"Skipping finding '{f.get('finding_id', 'unknown')}' - "
                        f"no file_path specified (source: {f.get('source', 'unknown')}). "
                        "This finding requires human review."
                    )
                    continue

                source_str = f.get("source", "other").lower()
                source = source_map.get(source_str, FindingSource.OTHER)
                severity = severity_map.get(
                    f.get("severity", "medium").lower(), FindingSeverity.MEDIUM
                )

                pr_findings.append(
                    PRFinding(
                        finding_id=f["finding_id"],
                        source=source,
                        severity=severity,
                        file_path=file_path,
                        line_number=f.get("line_number"),
                        description=f.get("description", ""),
                        suggestion=f.get("suggestion"),
                        trusted=f.get("trusted", False),
                    )
                )

            # If all findings were skipped, report that human review is needed
            if not pr_findings and skipped_findings:
                self._log_info(
                    f"All {len(skipped_findings)} findings lack file paths and require human review. "
                    "No auto-fixes possible."
                )
                return 0, 0  # No failures, but no fixes either - needs human review

            # Create and run fixer agent
            agent = PRFixerAgent(
                project_dir=self.project_dir,
                spec_dir=self.spec_dir,
                allowed_files=allowed_files,
                correlation_id=state.correlation_id,
            )

            # Check for cancellation before fixing
            self._check_cancelled(state.pr_number)

            # Fix findings
            fix_result = await agent.fix_findings(
                findings=pr_findings,
                pr_number=state.pr_number,
                repo=state.repo,
            )

            # Record applied fixes
            for attempt in fix_result.fix_attempts:
                if attempt.applied_fix:
                    state.add_applied_fix(attempt.applied_fix)
                    if attempt.applied_fix.finding_id not in state.resolved_finding_ids:
                        state.resolved_finding_ids.append(
                            attempt.applied_fix.finding_id
                        )

            self._save_state(state)

            return fix_result.fixes_applied, fix_result.fixes_failed

        except ImportError as e:
            self._log_error(f"Failed to import PRFixerAgent: {e}")
            return 0, len(findings)

    async def _push_fixes(
        self,
        state: PRReviewOrchestratorState,
        fixes_applied: int,
    ) -> bool:
        """
        Commit and push fixes to the PR branch.

        Args:
            state: Current orchestrator state
            fixes_applied: Number of fixes applied

        Returns:
            True if push was successful
        """
        if fixes_applied == 0:
            return True

        try:
            # Stage all changes
            result = subprocess.run(
                ["git", "add", "-A"],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode != 0:
                self._log_warning(f"git add failed: {result.stderr}")
                return False

            # Create commit
            commit_msg = f"""fix: auto-fix PR review findings (iteration {state.current_iteration})

Applied {fixes_applied} automated fixes for PR #{state.pr_number}.

\U0001f916 Generated by Auto-PR-Review

Co-Authored-By: Claude <noreply@anthropic.com>
"""
            result = subprocess.run(
                ["git", "commit", "-m", commit_msg],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode != 0:
                # May fail if no changes staged
                if "nothing to commit" in result.stdout.lower():
                    return True
                self._log_warning(f"git commit failed: {result.stderr}")
                return False

            # Push to remote
            result = subprocess.run(
                ["git", "push"],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                self._log_warning(f"git push failed: {result.stderr}")
                return False

            self._log_info(
                "Pushed fixes to remote",
                pr_number=state.pr_number,
                fixes_applied=fixes_applied,
                iteration=state.current_iteration,
            )

            # Update HEAD SHA after push
            new_sha = await self._get_pr_head_sha(state.pr_number, state.repo)
            if new_sha:
                state.last_known_head_sha = new_sha
                self._save_state(state)

            return True

        except subprocess.TimeoutExpired:
            self._log_error("Git operation timed out", pr_number=state.pr_number)
            return False

    # =========================================================================
    # Main Run Method
    # =========================================================================

    async def run(
        self,
        pr_number: int,
        repo: str,
        pr_url: str,
        branch_name: str,
        triggered_by: str,
        on_progress: Callable[[str, Any], None] | None = None,
        resume_state: PRReviewOrchestratorState | None = None,
    ) -> OrchestratorRunResult:
        """
        Run the main PR review loop.

        Args:
            pr_number: PR number to review
            repo: Repository in owner/repo format
            pr_url: Full URL to the PR
            branch_name: PR branch name
            triggered_by: Username who triggered the review
            on_progress: Optional callback for progress updates
            resume_state: Optional state to resume from (crash recovery)

        Returns:
            OrchestratorRunResult with final status
        """
        start_time = time.monotonic()
        correlation_id = str(uuid.uuid4())

        # Bind context for structured logging throughout the review flow
        self._bind_context(
            correlation_id=correlation_id,
            pr_number=pr_number,
            repo=repo,
        )

        self._log_info(
            "Starting Auto-PR-Review",
            triggered_by=triggered_by,
        )

        # Check authorization
        try:
            self._require_authorization(triggered_by)
        except OrchestratorUnauthorizedError as e:
            return OrchestratorRunResult(
                result=OrchestratorResult.UNAUTHORIZED,
                pr_number=pr_number,
                repo=repo,
                error_message=str(e),
                duration_seconds=time.monotonic() - start_time,
            )

        # Set up cancellation event
        self._cancel_events[pr_number] = asyncio.Event()

        try:
            # Acquire semaphore for concurrent review limiting
            async with self._semaphore:
                return await self._run_with_semaphore(
                    pr_number=pr_number,
                    repo=repo,
                    pr_url=pr_url,
                    branch_name=branch_name,
                    triggered_by=triggered_by,
                    correlation_id=correlation_id,
                    start_time=start_time,
                    on_progress=on_progress,
                    resume_state=resume_state,
                )
        finally:
            # Clean up cancellation event and clear logging context
            self._cancel_events.pop(pr_number, None)
            self._clear_context()

    async def _run_with_semaphore(
        self,
        pr_number: int,
        repo: str,
        pr_url: str,
        branch_name: str,
        triggered_by: str,
        correlation_id: str,
        start_time: float,
        on_progress: Callable[[str, Any], None] | None = None,
        resume_state: PRReviewOrchestratorState | None = None,
    ) -> OrchestratorRunResult:
        """
        Run the review loop with semaphore acquired.

        This is the main implementation of the review loop.
        """
        # Initialize or resume state
        if resume_state:
            state = resume_state
            state.correlation_id = correlation_id
            self._log_info(
                "Resuming from saved state",
                iteration=state.current_iteration,
                status=state.status.value,
            )
        else:
            # Check for existing state (crash recovery)
            existing_state = self._load_state(pr_number)
            if existing_state and existing_state.status.is_active():
                state = existing_state
                state.correlation_id = correlation_id
                self._log_info(
                    "Resuming from crash recovery state",
                    iteration=state.current_iteration,
                    status=state.status.value,
                )
            else:
                # Create new state
                state = PRReviewOrchestratorState(
                    pr_number=pr_number,
                    repo=repo,
                    pr_url=pr_url,
                    branch_name=branch_name,
                    correlation_id=correlation_id,
                    max_iterations=self.max_iterations,
                    triggered_by=triggered_by,
                    authorized=True,
                    expected_bots=self._expected_bots.copy(),
                )

        # Track active review
        async with self._active_reviews_lock:
            self._active_reviews[pr_number] = state

        try:
            # Get initial HEAD SHA if not already set
            if not state.last_known_head_sha:
                state.last_known_head_sha = await self._get_pr_head_sha(pr_number, repo)

            # Get list of changed files
            allowed_files = await self._get_pr_files(pr_number, repo)

            # Save initial state
            self._save_state(state)

            if on_progress:
                on_progress(
                    "started",
                    {
                        "pr_number": pr_number,
                        "max_iterations": self.max_iterations,
                    },
                )

            # Main review loop
            total_fixes_applied = 0
            total_fixes_failed = 0

            while state.should_continue():
                self._check_cancelled(pr_number)

                # Start new iteration
                iteration_record = state.start_iteration()
                self._save_state(state)

                self._log_info(
                    f"Starting iteration {state.current_iteration}",
                )

                if on_progress:
                    on_progress(
                        "iteration_started",
                        {
                            "iteration": state.current_iteration,
                            "max_iterations": state.max_iterations,
                        },
                    )

                # Wait for CI checks and external bots
                check_result = await self._wait_for_checks(state, on_progress)

                # Handle special wait results
                if check_result.result == WaitResult.PR_CLOSED:
                    state.mark_completed(PRReviewStatus.CANCELLED)
                    self._save_state(state)
                    return OrchestratorRunResult(
                        result=OrchestratorResult.PR_CLOSED,
                        pr_number=pr_number,
                        repo=repo,
                        iterations_completed=state.current_iteration,
                        state=state,
                        duration_seconds=time.monotonic() - start_time,
                    )

                if check_result.result == WaitResult.PR_MERGED:
                    state.mark_completed(PRReviewStatus.COMPLETED)
                    self._save_state(state)
                    return OrchestratorRunResult(
                        result=OrchestratorResult.PR_MERGED,
                        pr_number=pr_number,
                        repo=repo,
                        iterations_completed=state.current_iteration,
                        ci_all_passed=True,
                        state=state,
                        duration_seconds=time.monotonic() - start_time,
                    )

                if check_result.result == WaitResult.CANCELLED:
                    state.mark_completed(PRReviewStatus.CANCELLED)
                    self._save_state(state)
                    return OrchestratorRunResult(
                        result=OrchestratorResult.CANCELLED,
                        pr_number=pr_number,
                        repo=repo,
                        iterations_completed=state.current_iteration,
                        state=state,
                        duration_seconds=time.monotonic() - start_time,
                    )

                if check_result.result == WaitResult.FORCE_PUSH:
                    # Force push detected - update SHA and restart iteration
                    self._log_info(
                        "Force push detected, restarting iteration",
                        new_sha=check_result.final_head_sha,
                    )
                    state.last_known_head_sha = check_result.final_head_sha
                    state.current_iteration -= 1  # Don't count this iteration
                    continue

                # Mark CI status
                state.ci_all_passed = check_result.all_passed

                # Collect findings from CI failures and bot comments first
                findings = await self._collect_findings(state, check_result)

                # Always run AI review after CI/bots complete (CI is just a timing gate)
                # The AI review will analyze the code and report on issues including CI failures
                self._log_info(
                    "CI checks complete, running AI review",
                    pr_number=state.pr_number,
                    iteration=state.current_iteration,
                    ci_all_passed=check_result.all_passed,
                )

                if on_progress:
                    on_progress(
                        "ai_reviewing",
                        {
                            "iteration": state.current_iteration,
                            "message": "Running AI code review...",
                            "ci_passed": check_result.all_passed,
                        },
                    )

                # Run AI review regardless of CI status
                # AI will analyze the code and can report on CI failures too
                ai_findings = await self._run_ai_review(state, on_progress)
                findings.extend(ai_findings)

                self._log_info(
                    "AI review complete",
                    ai_findings_count=len(ai_findings),
                    total_findings_count=len(findings),
                    ci_all_passed=check_result.all_passed,
                )

                # Check how many findings are actually fixable (have file_path)
                fixable_findings = [
                    f for f in findings if f.get("file_path", "").strip()
                ]
                unfixable_findings = len(findings) - len(fixable_findings)

                # If we have findings but none are fixable, mark as needs human review
                if findings and not fixable_findings:
                    self._log_warning(
                        "All findings lack file paths - human review required",
                        total_findings=len(findings),
                        unfixable_findings=unfixable_findings,
                    )
                    state.complete_iteration(
                        findings_count=len(findings),
                        fixes_applied=0,
                        ci_status="failed" if not check_result.all_passed else "passed",
                        status="needs_human_review",
                        notes=f"{unfixable_findings} finding(s) require human review (no file paths)",
                    )
                    state.mark_completed(PRReviewStatus.NEEDS_HUMAN_REVIEW)
                    self._save_state(state)

                    return OrchestratorRunResult(
                        result=OrchestratorResult.NEEDS_HUMAN_REVIEW,
                        pr_number=pr_number,
                        repo=repo,
                        iterations_completed=state.current_iteration,
                        findings_fixed=total_fixes_applied,
                        findings_unfixed=unfixable_findings,
                        ci_all_passed=check_result.all_passed,
                        needs_human_review=True,
                        state=state,
                        error_message=f"{unfixable_findings} finding(s) require human review",
                        duration_seconds=time.monotonic() - start_time,
                    )

                # If no findings at all (CI passed AND AI review found nothing)
                if not findings:
                    if check_result.all_passed:
                        # All checks passed and no AI findings - ready for human review
                        state.status = PRReviewStatus.READY_TO_MERGE
                        state.complete_iteration(
                            findings_count=0,
                            fixes_applied=0,
                            ci_status="passed",
                            status="completed",
                            notes="All CI checks passed and AI review found no issues",
                        )
                        state.mark_completed(PRReviewStatus.READY_TO_MERGE)
                        self._save_state(state)

                        self._log_info(
                            "PR ready for human review",
                            iterations_completed=state.current_iteration,
                            total_fixes_applied=total_fixes_applied,
                        )

                        return OrchestratorRunResult(
                            result=OrchestratorResult.READY_TO_MERGE,
                            pr_number=pr_number,
                            repo=repo,
                            iterations_completed=state.current_iteration,
                            findings_fixed=total_fixes_applied,
                            findings_unfixed=total_fixes_failed,
                            ci_all_passed=True,
                            state=state,
                            duration_seconds=time.monotonic() - start_time,
                        )
                    else:
                        # CI failed but no actionable findings - can't proceed
                        state.complete_iteration(
                            findings_count=0,
                            fixes_applied=0,
                            ci_status="failed",
                            status="failed",
                            notes="CI failed but no actionable findings",
                        )
                        self._save_state(state)
                        continue

                # Apply fixes
                fixes_applied, fixes_failed = await self._apply_fixes(
                    state, findings, allowed_files, on_progress
                )

                total_fixes_applied += fixes_applied
                total_fixes_failed += fixes_failed

                # Complete iteration record
                state.complete_iteration(
                    findings_count=len(findings),
                    fixes_applied=fixes_applied,
                    ci_status="fixing",
                    status="completed" if fixes_applied > 0 else "failed",
                )
                self._save_state(state)

                if fixes_applied > 0:
                    # Push fixes and continue loop
                    push_success = await self._push_fixes(state, fixes_applied)
                    if not push_success:
                        state.record_error("Failed to push fixes")
                        self._save_state(state)
                else:
                    # No fixes could be applied
                    self._log_warning(
                        "No fixes applied in iteration",
                        iteration=state.current_iteration,
                        findings_count=len(findings),
                    )

                if on_progress:
                    on_progress(
                        "iteration_completed",
                        {
                            "iteration": state.current_iteration,
                            "fixes_applied": fixes_applied,
                            "fixes_failed": fixes_failed,
                        },
                    )

            # Loop ended - check why
            if state.cancellation_requested:
                state.mark_completed(PRReviewStatus.CANCELLED)
                self._save_state(state)
                return OrchestratorRunResult(
                    result=OrchestratorResult.CANCELLED,
                    pr_number=pr_number,
                    repo=repo,
                    iterations_completed=state.current_iteration,
                    findings_fixed=total_fixes_applied,
                    findings_unfixed=total_fixes_failed,
                    state=state,
                    duration_seconds=time.monotonic() - start_time,
                )

            if state.current_iteration >= state.max_iterations:
                state.mark_completed(PRReviewStatus.MAX_ITERATIONS_REACHED)
                self._save_state(state)

                self._log_warning(
                    "Max iterations reached",
                    iterations=state.current_iteration,
                    total_fixes_applied=total_fixes_applied,
                )

                return OrchestratorRunResult(
                    result=OrchestratorResult.MAX_ITERATIONS,
                    pr_number=pr_number,
                    repo=repo,
                    iterations_completed=state.current_iteration,
                    findings_fixed=total_fixes_applied,
                    findings_unfixed=total_fixes_failed,
                    ci_all_passed=state.ci_all_passed,
                    state=state,
                    error_message=f"Max iterations ({state.max_iterations}) reached",
                    duration_seconds=time.monotonic() - start_time,
                )

            # Unexpected end of loop
            return OrchestratorRunResult(
                result=OrchestratorResult.ERROR,
                pr_number=pr_number,
                repo=repo,
                iterations_completed=state.current_iteration,
                findings_fixed=total_fixes_applied,
                findings_unfixed=total_fixes_failed,
                state=state,
                error_message="Review loop ended unexpectedly",
                duration_seconds=time.monotonic() - start_time,
            )

        except OrchestratorCancelledError:
            state.mark_completed(PRReviewStatus.CANCELLED)
            self._save_state(state)
            return OrchestratorRunResult(
                result=OrchestratorResult.CANCELLED,
                pr_number=pr_number,
                repo=repo,
                iterations_completed=state.current_iteration,
                state=state,
                duration_seconds=time.monotonic() - start_time,
            )

        except Exception as e:
            self._log_error(
                f"Orchestrator error: {e}",
            )
            state.record_error(str(e))
            state.mark_completed(PRReviewStatus.FAILED)
            self._save_state(state)

            return OrchestratorRunResult(
                result=OrchestratorResult.ERROR,
                pr_number=pr_number,
                repo=repo,
                iterations_completed=state.current_iteration,
                state=state,
                error_message=str(e),
                duration_seconds=time.monotonic() - start_time,
            )

        finally:
            # Remove from active reviews
            async with self._active_reviews_lock:
                self._active_reviews.pop(pr_number, None)

    # =========================================================================
    # Public API
    # =========================================================================

    def get_active_reviews(self) -> dict[int, PRReviewOrchestratorState]:
        """
        Get currently active reviews.

        Returns:
            Dictionary of PR number to state
        """
        return dict(self._active_reviews)

    def get_queue_size(self) -> int:
        """
        Get the number of reviews waiting for semaphore.

        Returns:
            Number of queued reviews
        """
        # Semaphore doesn't expose queue size directly
        # Return active reviews count instead
        return len(self._active_reviews)

    def get_statistics(self) -> dict:
        """
        Get orchestrator statistics.

        Returns:
            Dictionary of statistics
        """
        return {
            "active_reviews": len(self._active_reviews),
            "max_concurrent_reviews": self.max_concurrent_reviews,
            "max_iterations": self.max_iterations,
            "allowed_users_count": len(self._allowed_users),
            "expected_bots": self._expected_bots,
        }


# =============================================================================
# Module-level convenience functions
# =============================================================================

_orchestrator: AutoPRReviewOrchestrator | None = None


def get_auto_pr_review_orchestrator(
    github_dir: Path | None = None,
    project_dir: Path | None = None,
    spec_dir: Path | None = None,
    **kwargs,
) -> AutoPRReviewOrchestrator:
    """
    Get the global AutoPRReviewOrchestrator instance.

    For singleton behavior, call without arguments after first initialization.

    Args:
        github_dir: Directory for GitHub state files
        project_dir: Project root directory
        spec_dir: Spec directory
        **kwargs: Additional arguments passed to AutoPRReviewOrchestrator

    Returns:
        AutoPRReviewOrchestrator singleton instance
    """
    global _orchestrator

    if _orchestrator is None:
        if github_dir is None or project_dir is None or spec_dir is None:
            raise ValueError(
                "github_dir, project_dir, and spec_dir required for first initialization"
            )
        _orchestrator = AutoPRReviewOrchestrator(
            github_dir=github_dir,
            project_dir=project_dir,
            spec_dir=spec_dir,
            **kwargs,
        )

    return _orchestrator


def reset_auto_pr_review_orchestrator() -> None:
    """Reset the global AutoPRReviewOrchestrator instance (for testing)."""
    global _orchestrator
    _orchestrator = None
