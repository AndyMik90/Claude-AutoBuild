"""
PR Review Orchestrator State
============================

Durable state for the autonomous PR review orchestrator.
Supports crash recovery through atomic file-based persistence with file locking.

Example:
    # Create and save state
    state = PRReviewOrchestratorState(
        pr_number=123,
        repo="owner/repo",
        pr_url="https://github.com/owner/repo/pull/123",
        branch_name="feature-branch",
    )
    await state.save(github_dir)

    # Load existing state
    state = PRReviewOrchestratorState.load(github_dir, 123)
    if state is not None:
        print(f"Resuming from iteration {state.current_iteration}")
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path

try:
    from ..file_lock import locked_json_update, locked_json_write
except (ImportError, ValueError, SystemError):
    # Handle direct execution for testing
    import sys

    parent_dir = Path(__file__).parent.parent
    if str(parent_dir) not in sys.path:
        sys.path.insert(0, str(parent_dir))
    from file_lock import locked_json_update, locked_json_write


class PRReviewStatus(str, Enum):
    """Status of the PR review orchestrator."""

    # Initial states
    PENDING = "pending"  # Waiting to start
    AWAITING_CHECKS = "awaiting_checks"  # Waiting for CI/external bots

    # Active states
    REVIEWING = "reviewing"  # AI review in progress
    FIXING = "fixing"  # Applying fixes

    # Terminal states
    READY_TO_MERGE = "ready_to_merge"  # All checks pass, human approval needed
    NEEDS_HUMAN_REVIEW = "needs_human_review"  # Findings exist but can't be auto-fixed
    COMPLETED = "completed"  # Human merged the PR
    CANCELLED = "cancelled"  # User cancelled
    FAILED = "failed"  # Unrecoverable error
    MAX_ITERATIONS_REACHED = "max_iterations_reached"  # Hit iteration limit

    @classmethod
    def terminal_states(cls) -> set[PRReviewStatus]:
        """States that represent end of workflow."""
        return {
            cls.READY_TO_MERGE,
            cls.NEEDS_HUMAN_REVIEW,
            cls.COMPLETED,
            cls.CANCELLED,
            cls.FAILED,
            cls.MAX_ITERATIONS_REACHED,
        }

    @classmethod
    def active_states(cls) -> set[PRReviewStatus]:
        """States that indicate work in progress."""
        return {cls.PENDING, cls.AWAITING_CHECKS, cls.REVIEWING, cls.FIXING}

    def is_terminal(self) -> bool:
        """Check if this is a terminal state."""
        return self in self.terminal_states()

    def is_active(self) -> bool:
        """Check if this is an active state."""
        return self in self.active_states()


class CheckStatus(str, Enum):
    """Status of a CI check or external bot."""

    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    TIMED_OUT = "timed_out"
    UNKNOWN = "unknown"


@dataclass
class CICheckResult:
    """Result of a single CI check."""

    name: str
    status: CheckStatus
    conclusion: str | None = None
    url: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    details: str | None = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status.value,
            "conclusion": self.conclusion,
            "url": self.url,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "details": self.details,
        }

    @classmethod
    def from_dict(cls, data: dict) -> CICheckResult:
        return cls(
            name=data["name"],
            status=CheckStatus(data.get("status", "unknown")),
            conclusion=data.get("conclusion"),
            url=data.get("url"),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            details=data.get("details"),
        )


@dataclass
class ExternalBotStatus:
    """Status of an external bot (CodeRabbit, Cursor, etc.)."""

    bot_name: str
    bot_id: str | None = None  # Account ID for verification
    status: CheckStatus = CheckStatus.PENDING
    comment_id: int | None = None
    comment_url: str | None = None
    findings_count: int = 0
    last_seen_at: str | None = None
    trusted: bool = False  # Whether bot identity was verified

    def to_dict(self) -> dict:
        return {
            "bot_name": self.bot_name,
            "bot_id": self.bot_id,
            "status": self.status.value,
            "comment_id": self.comment_id,
            "comment_url": self.comment_url,
            "findings_count": self.findings_count,
            "last_seen_at": self.last_seen_at,
            "trusted": self.trusted,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ExternalBotStatus:
        return cls(
            bot_name=data["bot_name"],
            bot_id=data.get("bot_id"),
            status=CheckStatus(data.get("status", "pending")),
            comment_id=data.get("comment_id"),
            comment_url=data.get("comment_url"),
            findings_count=data.get("findings_count", 0),
            last_seen_at=data.get("last_seen_at"),
            trusted=data.get("trusted", False),
        )


@dataclass
class AppliedFix:
    """Record of a fix applied by the PR fixer agent."""

    fix_id: str
    finding_id: str  # Reference to the finding this fixes
    file_path: str
    description: str
    applied_at: str = field(default_factory=lambda: datetime.now().isoformat())
    commit_sha: str | None = None
    success: bool = True
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "fix_id": self.fix_id,
            "finding_id": self.finding_id,
            "file_path": self.file_path,
            "description": self.description,
            "applied_at": self.applied_at,
            "commit_sha": self.commit_sha,
            "success": self.success,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: dict) -> AppliedFix:
        return cls(
            fix_id=data["fix_id"],
            finding_id=data["finding_id"],
            file_path=data["file_path"],
            description=data["description"],
            applied_at=data.get("applied_at", datetime.now().isoformat()),
            commit_sha=data.get("commit_sha"),
            success=data.get("success", True),
            error=data.get("error"),
        )


@dataclass
class IterationRecord:
    """Record of a single iteration in the review loop."""

    iteration_number: int
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: str | None = None
    status: str = "in_progress"  # in_progress, completed, failed
    findings_count: int = 0
    fixes_applied: int = 0
    ci_status: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict:
        return {
            "iteration_number": self.iteration_number,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "status": self.status,
            "findings_count": self.findings_count,
            "fixes_applied": self.fixes_applied,
            "ci_status": self.ci_status,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict) -> IterationRecord:
        return cls(
            iteration_number=data["iteration_number"],
            started_at=data.get("started_at", datetime.now().isoformat()),
            completed_at=data.get("completed_at"),
            status=data.get("status", "in_progress"),
            findings_count=data.get("findings_count", 0),
            fixes_applied=data.get("fixes_applied", 0),
            ci_status=data.get("ci_status"),
            notes=data.get("notes"),
        )


@dataclass
class PRReviewOrchestratorState:
    """
    Durable state for PR review orchestrator with crash recovery support.

    This state is persisted to disk after each significant operation,
    allowing the orchestrator to resume from the last checkpoint after
    crashes or restarts.
    """

    # PR identification
    pr_number: int
    repo: str  # owner/repo format
    pr_url: str
    branch_name: str

    # Orchestration state
    status: PRReviewStatus = PRReviewStatus.PENDING
    current_iteration: int = 0
    max_iterations: int = 5

    # Correlation ID for structured logging
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    # Timestamps
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: str | None = None

    # CI checks tracking
    ci_checks: list[CICheckResult] = field(default_factory=list)
    ci_checks_last_polled: str | None = None
    ci_all_passed: bool = False

    # External bot tracking
    expected_bots: list[str] = field(default_factory=list)  # Bot names to wait for
    external_bot_statuses: list[ExternalBotStatus] = field(default_factory=list)
    bots_last_polled: str | None = None

    # Review findings (IDs from PRReviewResult)
    pending_finding_ids: list[str] = field(default_factory=list)
    resolved_finding_ids: list[str] = field(default_factory=list)
    unresolvable_finding_ids: list[str] = field(default_factory=list)

    # Applied fixes history
    applied_fixes: list[AppliedFix] = field(default_factory=list)

    # Iteration history
    iteration_history: list[IterationRecord] = field(default_factory=list)

    # Head SHA tracking for force push detection
    last_known_head_sha: str | None = None

    # Error tracking
    last_error: str | None = None
    error_count: int = 0
    consecutive_failures: int = 0

    # Cancellation flag
    cancellation_requested: bool = False
    cancelled_by: str | None = None  # Username who requested cancellation
    cancelled_at: str | None = None

    # Authorization
    triggered_by: str | None = None  # Username who triggered the review
    authorized: bool = False

    def to_dict(self) -> dict:
        """Serialize state to dictionary for JSON storage."""
        return {
            # PR identification
            "pr_number": self.pr_number,
            "repo": self.repo,
            "pr_url": self.pr_url,
            "branch_name": self.branch_name,
            # Orchestration state
            "status": self.status.value,
            "current_iteration": self.current_iteration,
            "max_iterations": self.max_iterations,
            "correlation_id": self.correlation_id,
            # Timestamps
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            # CI checks
            "ci_checks": [c.to_dict() for c in self.ci_checks],
            "ci_checks_last_polled": self.ci_checks_last_polled,
            "ci_all_passed": self.ci_all_passed,
            # External bots
            "expected_bots": self.expected_bots,
            "external_bot_statuses": [b.to_dict() for b in self.external_bot_statuses],
            "bots_last_polled": self.bots_last_polled,
            # Findings
            "pending_finding_ids": self.pending_finding_ids,
            "resolved_finding_ids": self.resolved_finding_ids,
            "unresolvable_finding_ids": self.unresolvable_finding_ids,
            # Fixes
            "applied_fixes": [f.to_dict() for f in self.applied_fixes],
            # Iteration history
            "iteration_history": [i.to_dict() for i in self.iteration_history],
            # Head SHA
            "last_known_head_sha": self.last_known_head_sha,
            # Errors
            "last_error": self.last_error,
            "error_count": self.error_count,
            "consecutive_failures": self.consecutive_failures,
            # Cancellation
            "cancellation_requested": self.cancellation_requested,
            "cancelled_by": self.cancelled_by,
            "cancelled_at": self.cancelled_at,
            # Authorization
            "triggered_by": self.triggered_by,
            "authorized": self.authorized,
        }

    @classmethod
    def from_dict(cls, data: dict) -> PRReviewOrchestratorState:
        """Deserialize state from dictionary."""
        return cls(
            # PR identification
            pr_number=data["pr_number"],
            repo=data["repo"],
            pr_url=data["pr_url"],
            branch_name=data["branch_name"],
            # Orchestration state
            status=PRReviewStatus(data.get("status", "pending")),
            current_iteration=data.get("current_iteration", 0),
            max_iterations=data.get("max_iterations", 5),
            correlation_id=data.get("correlation_id", str(uuid.uuid4())),
            # Timestamps
            started_at=data.get("started_at", datetime.now().isoformat()),
            updated_at=data.get("updated_at", datetime.now().isoformat()),
            completed_at=data.get("completed_at"),
            # CI checks
            ci_checks=[CICheckResult.from_dict(c) for c in data.get("ci_checks", [])],
            ci_checks_last_polled=data.get("ci_checks_last_polled"),
            ci_all_passed=data.get("ci_all_passed", False),
            # External bots
            expected_bots=data.get("expected_bots", []),
            external_bot_statuses=[
                ExternalBotStatus.from_dict(b)
                for b in data.get("external_bot_statuses", [])
            ],
            bots_last_polled=data.get("bots_last_polled"),
            # Findings
            pending_finding_ids=data.get("pending_finding_ids", []),
            resolved_finding_ids=data.get("resolved_finding_ids", []),
            unresolvable_finding_ids=data.get("unresolvable_finding_ids", []),
            # Fixes
            applied_fixes=[
                AppliedFix.from_dict(f) for f in data.get("applied_fixes", [])
            ],
            # Iteration history
            iteration_history=[
                IterationRecord.from_dict(i) for i in data.get("iteration_history", [])
            ],
            # Head SHA
            last_known_head_sha=data.get("last_known_head_sha"),
            # Errors
            last_error=data.get("last_error"),
            error_count=data.get("error_count", 0),
            consecutive_failures=data.get("consecutive_failures", 0),
            # Cancellation
            cancellation_requested=data.get("cancellation_requested", False),
            cancelled_by=data.get("cancelled_by"),
            cancelled_at=data.get("cancelled_at"),
            # Authorization
            triggered_by=data.get("triggered_by"),
            authorized=data.get("authorized", False),
        )

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp."""
        self.updated_at = datetime.now().isoformat()

    def mark_completed(self, status: PRReviewStatus) -> None:
        """Mark the orchestration as completed with given status."""
        self.status = status
        self.completed_at = datetime.now().isoformat()
        self.update_timestamp()

    def record_error(self, error: str) -> None:
        """Record an error and increment counters."""
        self.last_error = error
        self.error_count += 1
        self.consecutive_failures += 1
        self.update_timestamp()

    def clear_consecutive_failures(self) -> None:
        """Clear consecutive failure counter on success."""
        self.consecutive_failures = 0
        self.update_timestamp()

    def request_cancellation(self, username: str | None = None) -> None:
        """Request cancellation of the review loop."""
        self.cancellation_requested = True
        self.cancelled_by = username
        self.cancelled_at = datetime.now().isoformat()
        self.update_timestamp()

    def start_iteration(self) -> IterationRecord:
        """Start a new iteration and return the record."""
        self.current_iteration += 1
        record = IterationRecord(iteration_number=self.current_iteration)
        self.iteration_history.append(record)
        self.update_timestamp()
        return record

    def complete_iteration(
        self,
        findings_count: int = 0,
        fixes_applied: int = 0,
        ci_status: str | None = None,
        status: str = "completed",
        notes: str | None = None,
    ) -> None:
        """Complete the current iteration."""
        if self.iteration_history:
            current = self.iteration_history[-1]
            current.completed_at = datetime.now().isoformat()
            current.status = status
            current.findings_count = findings_count
            current.fixes_applied = fixes_applied
            current.ci_status = ci_status
            current.notes = notes
        self.update_timestamp()

    def add_applied_fix(self, fix: AppliedFix) -> None:
        """Add a fix to the history and update finding tracking."""
        self.applied_fixes.append(fix)
        if fix.success and fix.finding_id in self.pending_finding_ids:
            self.pending_finding_ids.remove(fix.finding_id)
            self.resolved_finding_ids.append(fix.finding_id)
        self.update_timestamp()

    def has_pending_findings(self) -> bool:
        """Check if there are pending findings to fix."""
        return len(self.pending_finding_ids) > 0

    def should_continue(self) -> bool:
        """Check if the review loop should continue."""
        if self.cancellation_requested:
            return False
        if self.status.is_terminal():
            return False
        if self.current_iteration >= self.max_iterations:
            return False
        return True

    async def save(self, github_dir: Path) -> None:
        """
        Save state to disk with file locking for crash recovery.

        State is saved to .auto-claude/github/pr_review_state/pr_{number}.json
        """
        state_dir = github_dir / "pr_review_state"
        state_dir.mkdir(parents=True, exist_ok=True)

        state_file = state_dir / f"pr_{self.pr_number}.json"

        # Update timestamp before saving
        self.update_timestamp()

        # Atomic locked write
        await locked_json_write(state_file, self.to_dict(), timeout=5.0)

        # Update index
        await self._update_index(state_dir)

    def save_sync(self, github_dir: Path) -> None:
        """
        Synchronously save state to disk for crash recovery.

        This is a simpler sync version that writes directly without async locking.
        Use the async `save` method when possible for better concurrency support.
        """
        state_dir = github_dir / "pr_review_state"
        state_dir.mkdir(parents=True, exist_ok=True)

        state_file = state_dir / f"pr_{self.pr_number}.json"

        # Update timestamp before saving
        self.update_timestamp()

        # Simple atomic write using temp file
        import os
        import tempfile

        temp_fd, temp_path = tempfile.mkstemp(dir=state_dir, suffix=".json")
        try:
            with os.fdopen(temp_fd, "w") as f:
                json.dump(self.to_dict(), f, indent=2)
            os.replace(temp_path, state_file)
        except Exception:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise

        # Update index synchronously
        self._update_index_sync(state_dir)

    def _update_index_sync(self, state_dir: Path) -> None:
        """Synchronously update the PR review state index."""
        index_file = state_dir / "index.json"

        # Load existing index
        if index_file.exists():
            with open(index_file) as f:
                current_data = json.load(f)
        else:
            current_data = {"reviews": [], "last_updated": None}

        reviews = current_data.get("reviews", [])

        # Find and update or add entry
        entry = {
            "pr_number": self.pr_number,
            "repo": self.repo,
            "status": self.status.value,
            "current_iteration": self.current_iteration,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "correlation_id": self.correlation_id,
        }

        # Update existing or append new
        existing_idx = next(
            (i for i, r in enumerate(reviews) if r["pr_number"] == self.pr_number),
            None,
        )

        if existing_idx is not None:
            reviews[existing_idx] = entry
        else:
            reviews.append(entry)

        current_data["reviews"] = reviews
        current_data["last_updated"] = datetime.now().isoformat()

        # Atomic write
        import os
        import tempfile

        temp_fd, temp_path = tempfile.mkstemp(dir=state_dir, suffix=".json")
        try:
            with os.fdopen(temp_fd, "w") as f:
                json.dump(current_data, f, indent=2)
            os.replace(temp_path, index_file)
        except Exception:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise

    async def _update_index(self, state_dir: Path) -> None:
        """Update the PR review state index with file locking."""
        index_file = state_dir / "index.json"

        def update_index(current_data: dict | None) -> dict:
            """Update function for atomic index update."""
            if current_data is None:
                current_data = {"reviews": [], "last_updated": None}

            reviews = current_data.get("reviews", [])

            # Find and update or add entry
            entry = {
                "pr_number": self.pr_number,
                "repo": self.repo,
                "status": self.status.value,
                "current_iteration": self.current_iteration,
                "started_at": self.started_at,
                "updated_at": self.updated_at,
                "correlation_id": self.correlation_id,
            }

            # Update existing or append new
            existing_idx = next(
                (i for i, r in enumerate(reviews) if r["pr_number"] == self.pr_number),
                None,
            )

            if existing_idx is not None:
                reviews[existing_idx] = entry
            else:
                reviews.append(entry)

            current_data["reviews"] = reviews
            current_data["last_updated"] = datetime.now().isoformat()

            return current_data

        # Atomic locked update
        await locked_json_update(index_file, update_index, timeout=5.0)

    @classmethod
    def load(cls, github_dir: Path, pr_number: int) -> PRReviewOrchestratorState | None:
        """
        Load state from disk.

        Returns None if no saved state exists.
        """
        state_file = github_dir / "pr_review_state" / f"pr_{pr_number}.json"

        if not state_file.exists():
            return None

        with open(state_file) as f:
            data = json.load(f)

        return cls.from_dict(data)

    @classmethod
    def load_all_active(cls, github_dir: Path) -> list[PRReviewOrchestratorState]:
        """Load all active (non-terminal) review states."""
        state_dir = github_dir / "pr_review_state"
        index_file = state_dir / "index.json"

        if not index_file.exists():
            return []

        with open(index_file) as f:
            index = json.load(f)

        active_states = []
        for entry in index.get("reviews", []):
            status = PRReviewStatus(entry.get("status", "pending"))
            if status.is_active():
                state = cls.load(github_dir, entry["pr_number"])
                if state is not None:
                    active_states.append(state)

        return active_states

    @classmethod
    async def delete(cls, github_dir: Path, pr_number: int) -> bool:
        """
        Delete a state file and remove from index.

        Returns True if deleted, False if not found.
        """
        state_dir = github_dir / "pr_review_state"
        state_file = state_dir / f"pr_{pr_number}.json"

        if not state_file.exists():
            return False

        # Delete state file
        state_file.unlink()

        # Update index
        index_file = state_dir / "index.json"
        if index_file.exists():

            def remove_from_index(current_data: dict | None) -> dict:
                if current_data is None:
                    return {"reviews": [], "last_updated": datetime.now().isoformat()}

                reviews = [
                    r
                    for r in current_data.get("reviews", [])
                    if r["pr_number"] != pr_number
                ]
                current_data["reviews"] = reviews
                current_data["last_updated"] = datetime.now().isoformat()
                return current_data

            await locked_json_update(index_file, remove_from_index, timeout=5.0)

        return True
