"""
Frontend State Adapter
======================

Maps IssueLifecycle states to AutoFixQueueItem format for frontend consumption.

The adapter provides a unified view of backend state machine states into
frontend-friendly formats suitable for display in the UI.

Example:
    from runners.github.adapters.frontend_state import FrontendStateAdapter

    # Map lifecycle state to frontend status
    status = FrontendStateAdapter.to_frontend_status("pr_awaiting_checks")
    # Returns: "awaiting_checks"

    # Create full queue item with PR review state
    queue_item = FrontendStateAdapter.to_frontend_queue_item(
        issue_number=42,
        lifecycle_state="pr_fixing",
        pr_state=pr_review_state,
    )
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from runners.github.models_pkg.pr_review_state import PRReviewOrchestratorState


class FrontendStatus(str, Enum):
    """
    Frontend-friendly status strings for AutoFixQueueItem.

    These map to translation keys in the frontend i18n system:
    t('github:autoPRReview.status.<status>')
    """

    # Pipeline stages
    PENDING = "pending"
    TRIAGED = "triaged"
    APPROVED = "approved"
    SPEC_READY = "spec_ready"
    BUILDING = "building"
    QA_REVIEW = "qa_review"
    BUILD_COMPLETE = "build_complete"
    PR_CREATED = "pr_created"

    # PR Review stages
    AWAITING_CHECKS = "awaiting_checks"
    PR_REVIEWING = "pr_reviewing"
    PR_FIXING = "pr_fixing"
    PR_READY_TO_MERGE = "pr_ready_to_merge"

    # Terminal states
    COMPLETED = "completed"
    MERGED = "merged"
    CLOSED = "closed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    MAX_ITERATIONS = "max_iterations"

    # Unknown/error state
    UNKNOWN = "unknown"


@dataclass
class CICheckInfo:
    """CI check information for frontend display."""

    name: str
    status: str  # "pending" | "running" | "passed" | "failed" | "skipped"
    url: str | None = None


@dataclass
class ExternalBotInfo:
    """External bot status for frontend display."""

    name: str
    status: str  # "pending" | "complete" | "timed_out"
    findings_count: int = 0
    trusted: bool = False


@dataclass
class FrontendQueueItem:
    """
    Frontend-friendly representation of an Auto-Fix or Auto-PR-Review queue item.

    This format is consumed by the frontend's AutoFixQueueCard and
    AutoPRReviewProgressCard components.
    """

    # Issue identification
    issue_number: int
    issue_title: str | None = None
    issue_url: str | None = None

    # Status
    status: str = "pending"
    substep: str | None = None

    # PR information (when applicable)
    pr_number: int | None = None
    pr_url: str | None = None

    # PR Review progress (when in review loop)
    pr_review_iteration: int | None = None
    pr_review_max_iterations: int | None = None

    # Progress metrics
    progress_percent: int = 0
    elapsed_seconds: int | None = None
    estimated_seconds_remaining: int | None = None

    # CI checks
    ci_status: str | None = None  # "pending" | "passing" | "failing"
    ci_checks_passed: int | None = None
    ci_checks_total: int | None = None
    ci_checks: list[CICheckInfo] = field(default_factory=list)

    # External bots
    external_bots_complete: list[str] = field(default_factory=list)
    external_bots_pending: list[str] = field(default_factory=list)
    external_bots: list[ExternalBotInfo] = field(default_factory=list)

    # Error information
    error_type: str | None = None
    error_message: str | None = None

    # Timestamps
    started_at: str | None = None
    updated_at: str | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "issueNumber": self.issue_number,
            "issueTitle": self.issue_title,
            "issueUrl": self.issue_url,
            "status": self.status,
            "substep": self.substep,
            "prNumber": self.pr_number,
            "prUrl": self.pr_url,
            "prReviewIteration": self.pr_review_iteration,
            "prReviewMaxIterations": self.pr_review_max_iterations,
            "progressPercent": self.progress_percent,
            "elapsedSeconds": self.elapsed_seconds,
            "estimatedSecondsRemaining": self.estimated_seconds_remaining,
            "ciStatus": self.ci_status,
            "ciChecksPassed": self.ci_checks_passed,
            "ciChecksTotal": self.ci_checks_total,
            "ciChecks": [
                {"name": c.name, "status": c.status, "url": c.url}
                for c in self.ci_checks
            ],
            "externalBotsComplete": self.external_bots_complete,
            "externalBotsPending": self.external_bots_pending,
            "externalBots": [
                {
                    "name": b.name,
                    "status": b.status,
                    "findingsCount": b.findings_count,
                    "trusted": b.trusted,
                }
                for b in self.external_bots
            ],
            "errorType": self.error_type,
            "errorMessage": self.error_message,
            "startedAt": self.started_at,
            "updatedAt": self.updated_at,
        }


class FrontendStateAdapter:
    """
    Maps IssueLifecycle states to AutoFixQueueItem format.

    This adapter provides a consistent mapping between the backend's
    IssueLifecycleState enum and the frontend's AutoFixQueueItem status.

    The adapter is designed to be used as a utility class with static methods,
    making it easy to use without instantiation.
    """

    # Map IssueLifecycleState values to frontend-friendly status strings
    # Keys are the string values from IssueLifecycleState enum
    LIFECYCLE_STATUS_MAP: dict[str, str] = {
        # Initial states
        "new": FrontendStatus.PENDING.value,
        "triaged": FrontendStatus.TRIAGED.value,
        "approved_for_fix": FrontendStatus.APPROVED.value,
        "spec_ready": FrontendStatus.SPEC_READY.value,
        # Build states
        "building": FrontendStatus.BUILDING.value,
        "qa_review": FrontendStatus.QA_REVIEW.value,
        "build_complete": FrontendStatus.BUILD_COMPLETE.value,
        # PR states
        "pr_created": FrontendStatus.PR_CREATED.value,
        "pr_awaiting_checks": FrontendStatus.AWAITING_CHECKS.value,
        "pr_reviewing": FrontendStatus.PR_REVIEWING.value,
        "pr_changes_requested": FrontendStatus.PR_FIXING.value,
        "pr_fixing": FrontendStatus.PR_FIXING.value,
        "pr_ready_to_merge": FrontendStatus.PR_READY_TO_MERGE.value,
        # Terminal states
        "completed": FrontendStatus.COMPLETED.value,
        "merged": FrontendStatus.MERGED.value,
        "closed": FrontendStatus.CLOSED.value,
        "failed": FrontendStatus.FAILED.value,
        "cancelled": FrontendStatus.CANCELLED.value,
    }

    # Map PRReviewStatus values to frontend-friendly status strings
    PR_REVIEW_STATUS_MAP: dict[str, str] = {
        "pending": FrontendStatus.PENDING.value,
        "awaiting_checks": FrontendStatus.AWAITING_CHECKS.value,
        "reviewing": FrontendStatus.PR_REVIEWING.value,
        "fixing": FrontendStatus.PR_FIXING.value,
        "ready_to_merge": FrontendStatus.PR_READY_TO_MERGE.value,
        "completed": FrontendStatus.COMPLETED.value,
        "cancelled": FrontendStatus.CANCELLED.value,
        "failed": FrontendStatus.FAILED.value,
        "max_iterations_reached": FrontendStatus.MAX_ITERATIONS.value,
    }

    # Substep descriptions for each status
    SUBSTEP_MAP: dict[str, str] = {
        "pending": "Waiting to start",
        "awaiting_checks": "Waiting for CI and external bots",
        "pr_reviewing": "AI reviewing PR changes",
        "pr_fixing": "Applying fixes to resolve findings",
        "pr_ready_to_merge": "Ready for human approval",
    }

    @classmethod
    def to_frontend_status(
        cls,
        lifecycle_state: str | None,
        pr_review_status: str | None = None,
    ) -> str:
        """
        Convert backend state to frontend-friendly status string.

        Args:
            lifecycle_state: The IssueLifecycleState enum value (as string).
            pr_review_status: Optional PRReviewStatus value for more specific mapping.

        Returns:
            Frontend-friendly status string (e.g., "awaiting_checks", "pr_fixing").
        """
        # Prefer PR review status if available (more specific)
        if pr_review_status:
            return cls.PR_REVIEW_STATUS_MAP.get(
                pr_review_status, FrontendStatus.UNKNOWN.value
            )

        # Fall back to lifecycle state
        if lifecycle_state:
            return cls.LIFECYCLE_STATUS_MAP.get(
                lifecycle_state, FrontendStatus.UNKNOWN.value
            )

        return FrontendStatus.UNKNOWN.value

    @classmethod
    def to_frontend_substep(
        cls,
        status: str,
        pr_state: PRReviewOrchestratorState | None = None,
    ) -> str | None:
        """
        Get a human-readable substep description for the current status.

        Args:
            status: The frontend status string.
            pr_state: Optional PR review state for context.

        Returns:
            Human-readable substep description or None.
        """
        # Check for specific substep based on PR state
        if pr_state:
            if status == "awaiting_checks":
                ci_passed = sum(
                    1 for c in pr_state.ci_checks if c.status.value == "passed"
                )
                ci_total = len(pr_state.ci_checks)
                if ci_total > 0:
                    return f"CI checks: {ci_passed}/{ci_total} passed"
                return "Waiting for CI checks to start"

            if status == "pr_fixing":
                pending = len(pr_state.pending_finding_ids)
                return f"Fixing {pending} pending finding(s)"

        return cls.SUBSTEP_MAP.get(status)

    @classmethod
    def calculate_progress(
        cls,
        status: str,
        pr_state: PRReviewOrchestratorState | None = None,
    ) -> int:
        """
        Calculate progress percentage based on current status.

        Args:
            status: The frontend status string.
            pr_state: Optional PR review state for progress calculation.

        Returns:
            Progress percentage (0-100).
        """
        # Base progress by status
        STATUS_PROGRESS: dict[str, int] = {
            "pending": 0,
            "awaiting_checks": 20,
            "pr_reviewing": 40,
            "pr_fixing": 60,
            "pr_ready_to_merge": 90,
            "completed": 100,
            "merged": 100,
            "cancelled": 100,
            "failed": 100,
            "max_iterations": 100,
        }

        base_progress = STATUS_PROGRESS.get(status, 0)

        # Refine progress based on PR state
        if pr_state:
            if status == "awaiting_checks":
                # Progress through CI checks
                if pr_state.ci_checks:
                    passed = sum(
                        1 for c in pr_state.ci_checks if c.status.value == "passed"
                    )
                    total = len(pr_state.ci_checks)
                    if total > 0:
                        check_progress = (passed / total) * 20
                        return int(base_progress + check_progress)

            if status == "pr_fixing":
                # Progress through iterations
                if pr_state.max_iterations > 0:
                    iteration_progress = (
                        pr_state.current_iteration / pr_state.max_iterations
                    ) * 30
                    return int(base_progress + iteration_progress)

        return base_progress

    @classmethod
    def calculate_elapsed_seconds(
        cls, pr_state: PRReviewOrchestratorState | None
    ) -> int | None:
        """Calculate elapsed time in seconds from PR state."""
        if not pr_state or not pr_state.started_at:
            return None

        try:
            # Handle ISO format timestamp
            started_at = pr_state.started_at
            if started_at.endswith("Z"):
                started_at = started_at[:-1] + "+00:00"

            start_time = datetime.fromisoformat(started_at)
            elapsed = datetime.now(start_time.tzinfo) - start_time
            return int(elapsed.total_seconds())
        except (ValueError, TypeError):
            return None

    @classmethod
    def to_frontend_queue_item(
        cls,
        issue_number: int,
        lifecycle_state: str | None = None,
        pr_state: PRReviewOrchestratorState | None = None,
        issue_title: str | None = None,
        issue_url: str | None = None,
    ) -> FrontendQueueItem:
        """
        Create a full FrontendQueueItem from backend state.

        This method combines IssueLifecycle state with optional PRReviewOrchestratorState
        to create a comprehensive frontend-ready queue item.

        Args:
            issue_number: The GitHub issue number.
            lifecycle_state: The IssueLifecycleState enum value (as string).
            pr_state: Optional PRReviewOrchestratorState for PR review details.
            issue_title: Optional issue title for display.
            issue_url: Optional issue URL.

        Returns:
            FrontendQueueItem with all available information.
        """
        # Determine status
        pr_review_status = pr_state.status.value if pr_state else None
        status = cls.to_frontend_status(lifecycle_state, pr_review_status)

        # Calculate progress
        progress = cls.calculate_progress(status, pr_state)

        # Get substep
        substep = cls.to_frontend_substep(status, pr_state)

        # Calculate elapsed time
        elapsed = cls.calculate_elapsed_seconds(pr_state)

        # Build CI check information
        ci_checks: list[CICheckInfo] = []
        ci_checks_passed = None
        ci_checks_total = None
        ci_status = None

        if pr_state and pr_state.ci_checks:
            ci_checks = [
                CICheckInfo(
                    name=c.name,
                    status=c.status.value,
                    url=c.url,
                )
                for c in pr_state.ci_checks
            ]
            ci_checks_passed = sum(
                1 for c in pr_state.ci_checks if c.status.value == "passed"
            )
            ci_checks_total = len(pr_state.ci_checks)

            # Determine overall CI status
            if pr_state.ci_all_passed:
                ci_status = "passing"
            elif any(c.status.value == "failed" for c in pr_state.ci_checks):
                ci_status = "failing"
            else:
                ci_status = "pending"

        # Build external bot information
        external_bots: list[ExternalBotInfo] = []
        external_bots_complete: list[str] = []
        external_bots_pending: list[str] = []

        if pr_state and pr_state.external_bot_statuses:
            for bot in pr_state.external_bot_statuses:
                bot_info = ExternalBotInfo(
                    name=bot.bot_name,
                    status=bot.status.value,
                    findings_count=bot.findings_count,
                    trusted=bot.trusted,
                )
                external_bots.append(bot_info)

                if bot.status.value in ("passed", "complete"):
                    external_bots_complete.append(bot.bot_name)
                else:
                    external_bots_pending.append(bot.bot_name)

        # Handle error states
        error_type = None
        error_message = None

        if pr_state:
            if pr_state.status.value == "max_iterations_reached":
                error_type = "max_iterations"
                error_message = (
                    f"Maximum iterations ({pr_state.max_iterations}) reached. "
                    "Manual intervention required."
                )
            elif pr_state.status.value == "failed" and pr_state.last_error:
                error_type = "error"
                error_message = pr_state.last_error
            elif pr_state.status.value == "cancelled":
                error_type = "cancelled"
                error_message = "Review cancelled by user"
                if pr_state.cancelled_by:
                    error_message += f" ({pr_state.cancelled_by})"

        return FrontendQueueItem(
            # Issue info
            issue_number=issue_number,
            issue_title=issue_title,
            issue_url=issue_url,
            # Status
            status=status,
            substep=substep,
            # PR info
            pr_number=pr_state.pr_number if pr_state else None,
            pr_url=pr_state.pr_url if pr_state else None,
            # PR Review progress
            pr_review_iteration=pr_state.current_iteration if pr_state else None,
            pr_review_max_iterations=pr_state.max_iterations if pr_state else None,
            # Progress
            progress_percent=progress,
            elapsed_seconds=elapsed,
            # CI
            ci_status=ci_status,
            ci_checks_passed=ci_checks_passed,
            ci_checks_total=ci_checks_total,
            ci_checks=ci_checks,
            # External bots
            external_bots_complete=external_bots_complete,
            external_bots_pending=external_bots_pending,
            external_bots=external_bots,
            # Errors
            error_type=error_type,
            error_message=error_message,
            # Timestamps
            started_at=pr_state.started_at if pr_state else None,
            updated_at=pr_state.updated_at if pr_state else None,
        )


# Convenience functions for direct usage
def to_frontend_status(
    lifecycle_state: str | None,
    pr_review_status: str | None = None,
) -> str:
    """
    Convert backend state to frontend-friendly status string.

    Convenience function wrapping FrontendStateAdapter.to_frontend_status().
    """
    return FrontendStateAdapter.to_frontend_status(lifecycle_state, pr_review_status)


def to_frontend_queue_item(
    issue_number: int,
    lifecycle_state: str | None = None,
    pr_state: PRReviewOrchestratorState | None = None,
    issue_title: str | None = None,
    issue_url: str | None = None,
) -> FrontendQueueItem:
    """
    Create a full FrontendQueueItem from backend state.

    Convenience function wrapping FrontendStateAdapter.to_frontend_queue_item().
    """
    return FrontendStateAdapter.to_frontend_queue_item(
        issue_number=issue_number,
        lifecycle_state=lifecycle_state,
        pr_state=pr_state,
        issue_title=issue_title,
        issue_url=issue_url,
    )
