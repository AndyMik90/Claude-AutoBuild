#!/usr/bin/env python3
"""
Implementation Plan Models
==========================

Defines the complete implementation plan for a feature/task with progress
tracking, status management, and follow-up capabilities.
"""

import asyncio
import functools
import json
from dataclasses import dataclass, field, fields
from datetime import datetime
from pathlib import Path

from core.file_utils import write_json_atomic

from .enums import PhaseType, SubtaskStatus, WorkflowType
from .phase import Phase
from .subtask import Subtask


@dataclass
class ImplementationPlan:
    """Complete implementation plan for a feature/task."""

    feature: str
    workflow_type: WorkflowType = WorkflowType.FEATURE
    services_involved: list[str] = field(default_factory=list)
    phases: list[Phase] = field(default_factory=list)
    final_acceptance: list[str] = field(default_factory=list)

    # Metadata
    created_at: str | None = None
    updated_at: str | None = None
    spec_file: str | None = None

    # Task status (synced with UI)
    # status: backlog, in_progress, ai_review, human_review, done
    # planStatus: pending, in_progress, review, completed
    status: str | None = None
    planStatus: str | None = None
    recoveryNote: str | None = None
    qa_signoff: dict | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        result = {
            "feature": self.feature,
            "workflow_type": self.workflow_type.value,
            "services_involved": self.services_involved,
            "phases": [p.to_dict() for p in self.phases],
            "final_acceptance": self.final_acceptance,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "spec_file": self.spec_file,
        }
        # Include status fields if set (synced with UI)
        if self.status:
            result["status"] = self.status
        if self.planStatus:
            result["planStatus"] = self.planStatus
        if self.recoveryNote:
            result["recoveryNote"] = self.recoveryNote
        if self.qa_signoff:
            result["qa_signoff"] = self.qa_signoff
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "ImplementationPlan":
        """Create ImplementationPlan from dictionary."""
        # Parse workflow_type with fallback for unknown types
        workflow_type_str = data.get("workflow_type", "feature")
        try:
            workflow_type = WorkflowType(workflow_type_str)
        except ValueError:
            # Unknown workflow type - default to FEATURE
            print(
                f"Warning: Unknown workflow_type '{workflow_type_str}', defaulting to 'feature'"
            )
            workflow_type = WorkflowType.FEATURE

        # Support both 'feature' and 'title' fields for task name
        feature_name = data.get("feature") or data.get("title") or "Unnamed Feature"

        return cls(
            feature=feature_name,
            workflow_type=workflow_type,
            services_involved=data.get("services_involved", []),
            phases=[
                Phase.from_dict(p, idx + 1)
                for idx, p in enumerate(data.get("phases", []))
            ],
            final_acceptance=data.get("final_acceptance", []),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            spec_file=data.get("spec_file"),
            status=data.get("status"),
            planStatus=data.get("planStatus"),
            recoveryNote=data.get("recoveryNote"),
            qa_signoff=data.get("qa_signoff"),
        )

    def _update_timestamps_and_status(self) -> None:
        """Update timestamps and status before saving.

        Sets updated_at to now, initializes created_at if needed, and updates
        status based on subtask completion.
        """
        self.updated_at = datetime.now().isoformat()
        if not self.created_at:
            self.created_at = self.updated_at
        self.update_status_from_subtasks()

    def save(self, path: Path) -> None:
        """Save plan to JSON file using atomic write to prevent corruption."""
        self._update_timestamps_and_status()
        # Use atomic write to prevent corruption on crash/interrupt
        write_json_atomic(path, self.to_dict(), indent=2, ensure_ascii=False)

    async def async_save(self, path: Path) -> None:
        """
        Async version of save() - runs file I/O in thread pool to avoid blocking event loop.

        Use this from async contexts (like agent sessions) to prevent blocking.
        Restores in-memory state if the write fails.
        """
        # Capture full state for potential rollback (handles future field additions)
        old_state = self.to_dict()

        # Update state and capture dict
        self._update_timestamps_and_status()
        data = self.to_dict()

        # Run sync write in thread pool to avoid blocking event loop
        loop = asyncio.get_running_loop()
        partial_write = functools.partial(
            write_json_atomic,
            path,
            data,
            indent=2,
            ensure_ascii=False,
        )

        try:
            await loop.run_in_executor(None, partial_write)
        except Exception:
            # Restore full state from captured dict on write failure
            # This reverts all fields modified by _update_timestamps_and_status()
            restored = self.from_dict(old_state)
            # Copy restored fields back to self (dataclass __init__ returns new instance)
            for field in fields(self):
                setattr(self, field.name, getattr(restored, field.name))
            raise

    def update_status_from_subtasks(self):
        """Update overall status and planStatus based on subtask completion state.

        This syncs the task status with the UI's expected values:
        - status: backlog, in_progress, ai_review, human_review, done
        - planStatus: pending, in_progress, review, completed

        Note: Preserves human_review/review status when it represents plan approval stage
        (all subtasks pending but user needs to approve the plan before coding starts).
        """
        all_subtasks = [s for p in self.phases for s in p.subtasks]

        if not all_subtasks:
            # No subtasks yet - stay in backlog/pending
            if not self.status:
                self.status = "backlog"
            if not self.planStatus:
                self.planStatus = "pending"
            return

        completed_count = sum(
            1 for s in all_subtasks if s.status == SubtaskStatus.COMPLETED
        )
        failed_count = sum(1 for s in all_subtasks if s.status == SubtaskStatus.FAILED)
        in_progress_count = sum(
            1 for s in all_subtasks if s.status == SubtaskStatus.IN_PROGRESS
        )
        total_count = len(all_subtasks)

        # Determine status based on subtask states
        if completed_count == total_count:
            # All subtasks completed - check if QA approved
            if self.qa_signoff and self.qa_signoff.get("status") == "approved":
                self.status = "human_review"
                self.planStatus = "review"
            else:
                # All subtasks done, waiting for QA
                self.status = "ai_review"
                self.planStatus = "review"
        elif failed_count > 0:
            # Some subtasks failed - still in progress (needs retry or fix)
            self.status = "in_progress"
            self.planStatus = "in_progress"
        elif in_progress_count > 0 or completed_count > 0:
            # Some subtasks in progress or completed
            self.status = "in_progress"
            self.planStatus = "in_progress"
        else:
            # All subtasks pending
            # Don't override if status was explicitly set to in_progress (user clicked Start/Resume)
            # This prevents the task from getting stuck in human_review when resuming
            if self.status == "in_progress":
                # User explicitly started the task - keep in_progress status
                pass
            # Preserve human_review/review status ONLY if it's for FINAL QA approval stage
            # (all work done, QA approved, waiting for user to merge)
            # Do NOT preserve human_review for initial spec approval - that should reset to backlog
            elif (
                self.status == "human_review"
                and self.planStatus == "review"
                and self.qa_signoff
                and self.qa_signoff.get("status") == "approved"
            ):
                # This is the final QA-approved review stage - keep human_review status
                pass
            else:
                # Either pending new work, or spec approval stage (no QA yet) - reset to backlog
                self.status = "backlog"
                self.planStatus = "pending"

    @classmethod
    def load(cls, path: Path) -> "ImplementationPlan":
        """Load plan from JSON file."""
        with open(path, encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    def get_available_phases(self) -> list[Phase]:
        """Get phases whose dependencies are satisfied."""
        # Build a set of completed phase identifiers in multiple formats:
        # - Integer: 1, 2, 3...
        # - String with phase number: "phase-1-...", "phase-2-..."
        # This handles both formats that may appear in depends_on
        completed_phases: set[int | str] = set()
        for p in self.phases:
            if p.is_complete():
                completed_phases.add(p.phase)  # Add integer
                # Also add any string format that starts with "phase-{num}-"
                completed_phases.add(f"phase-{p.phase}")  # Prefix for matching
                print(f"[DEBUG-PLAN] Phase {p.phase} ({p.name}) is COMPLETE", flush=True)
            else:
                pending = [s for s in p.subtasks if s.status.value == "pending"]
                print(f"[DEBUG-PLAN] Phase {p.phase} ({p.name}) NOT complete, pending subtasks: {len(pending)}")

        print(f"[DEBUG-PLAN] Completed phases set: {completed_phases}")

        available = []

        for phase in self.phases:
            if phase.is_complete():
                continue

            print(f"[DEBUG-PLAN] Checking phase {phase.phase} ({phase.name}), depends_on: {phase.depends_on}")

            # Check if all dependencies are met
            deps_met = True
            for dep in phase.depends_on:
                if isinstance(dep, int):
                    # Integer dependency - direct lookup
                    if dep not in completed_phases:
                        print(f"[DEBUG-PLAN]   Dep {dep} (int) NOT met")
                        deps_met = False
                        break
                    else:
                        print(f"[DEBUG-PLAN]   Dep {dep} (int) MET")
                elif isinstance(dep, str):
                    # String dependency like "phase-1-plugin-setup"
                    # Check if any completed phase matches the prefix
                    dep_phase_num = None
                    if dep.startswith("phase-"):
                        parts = dep.split("-")
                        if len(parts) >= 2 and parts[1].isdigit():
                            dep_phase_num = int(parts[1])

                    print(f"[DEBUG-PLAN]   Dep '{dep}' (str) -> phase_num: {dep_phase_num}")

                    if dep_phase_num is not None:
                        if dep_phase_num not in completed_phases:
                            print(f"[DEBUG-PLAN]   Dep phase {dep_phase_num} NOT in completed_phases")
                            deps_met = False
                            break
                        else:
                            print(f"[DEBUG-PLAN]   Dep phase {dep_phase_num} MET")
                    else:
                        # Unknown format - treat as unmet
                        print(f"[DEBUG-PLAN]   Unknown dep format, treating as unmet")
                        deps_met = False
                        break

            if deps_met:
                print(f"[DEBUG-PLAN] Phase {phase.phase} ({phase.name}) is AVAILABLE")
                available.append(phase)
            else:
                print(f"[DEBUG-PLAN] Phase {phase.phase} ({phase.name}) deps NOT met")

        print(f"[DEBUG-PLAN] Available phases: {[p.name for p in available]}")
        return available

    def get_next_subtask(self) -> tuple[Phase, Subtask] | None:
        """Get the next subtask to work on, respecting dependencies."""
        print("[DEBUG-PLAN] get_next_subtask called")
        available = self.get_available_phases()
        print(f"[DEBUG-PLAN] Available phases count: {len(available)}")
        for phase in available:
            pending = phase.get_pending_subtasks()
            print(f"[DEBUG-PLAN] Phase {phase.phase} ({phase.name}) has {len(pending)} pending subtasks")
            if pending:
                print(f"[DEBUG-PLAN] Returning subtask: {pending[0].id}")
                return phase, pending[0]
        print("[DEBUG-PLAN] No pending subtasks found, returning None")
        return None

    def get_progress(self) -> dict:
        """Get overall progress statistics."""
        total_subtasks = sum(len(p.subtasks) for p in self.phases)
        done_subtasks = sum(
            1
            for p in self.phases
            for s in p.subtasks
            if s.status == SubtaskStatus.COMPLETED
        )
        failed_subtasks = sum(
            1
            for p in self.phases
            for s in p.subtasks
            if s.status == SubtaskStatus.FAILED
        )

        completed_phases = sum(1 for p in self.phases if p.is_complete())

        return {
            "total_phases": len(self.phases),
            "completed_phases": completed_phases,
            "total_subtasks": total_subtasks,
            "completed_subtasks": done_subtasks,
            "failed_subtasks": failed_subtasks,
            "percent_complete": round(100 * done_subtasks / total_subtasks, 1)
            if total_subtasks > 0
            else 0,
            "is_complete": done_subtasks == total_subtasks and failed_subtasks == 0,
        }

    def get_status_summary(self) -> str:
        """Get a human-readable status summary."""
        progress = self.get_progress()
        lines = [
            f"Feature: {self.feature}",
            f"Workflow: {self.workflow_type.value}",
            f"Progress: {progress['completed_subtasks']}/{progress['total_subtasks']} subtasks ({progress['percent_complete']}%)",
            f"Phases: {progress['completed_phases']}/{progress['total_phases']} complete",
        ]

        if progress["failed_subtasks"] > 0:
            lines.append(
                f"Failed: {progress['failed_subtasks']} subtasks need attention"
            )

        if progress["is_complete"]:
            lines.append("Status: COMPLETE - Ready for final acceptance testing")
        else:
            next_work = self.get_next_subtask()
            if next_work:
                phase, subtask = next_work
                lines.append(
                    f"Next: Phase {phase.phase} ({phase.name}) - {subtask.description}"
                )
            else:
                lines.append("Status: BLOCKED - No available subtasks")

        return "\n".join(lines)

    def add_followup_phase(
        self,
        name: str,
        subtasks: list[Subtask],
        phase_type: PhaseType = PhaseType.IMPLEMENTATION,
        parallel_safe: bool = False,
    ) -> Phase:
        """
        Add a new follow-up phase to an existing (typically completed) plan.

        This allows users to extend completed builds with additional work.
        The new phase depends on all existing phases to ensure proper sequencing.

        Args:
            name: Name of the follow-up phase (e.g., "Follow-Up: Add validation")
            subtasks: List of Subtask objects to include in the phase
            phase_type: Type of the phase (default: implementation)
            parallel_safe: Whether subtasks in this phase can run in parallel

        Returns:
            The newly created Phase object

        Example:
            >>> plan = ImplementationPlan.load(plan_path)
            >>> new_subtasks = [Subtask(id="followup-1", description="Add error handling")]
            >>> plan.add_followup_phase("Follow-Up: Error Handling", new_subtasks)
            >>> plan.save(plan_path)
        """
        # Calculate the next phase number
        if self.phases:
            next_phase_num = max(p.phase for p in self.phases) + 1
            # New phase depends on all existing phases
            depends_on = [p.phase for p in self.phases]
        else:
            next_phase_num = 1
            depends_on = []

        # Create the new phase
        new_phase = Phase(
            phase=next_phase_num,
            name=name,
            type=phase_type,
            subtasks=subtasks,
            depends_on=depends_on,
            parallel_safe=parallel_safe,
        )

        # Append to phases list
        self.phases.append(new_phase)

        # Update status to in_progress since we now have pending work
        self.status = "in_progress"
        self.planStatus = "in_progress"

        # Clear QA signoff since the plan has changed
        self.qa_signoff = None

        return new_phase

    def reset_for_followup(self) -> bool:
        """
        Reset plan status from completed/done back to in_progress for follow-up work.

        This method is called when a user wants to add follow-up tasks to a
        completed build. It transitions the plan status back to in_progress
        so the build pipeline can continue processing new subtasks.

        The method:
        - Sets status to "in_progress" (from "done", "ai_review", "human_review")
        - Sets planStatus to "in_progress" (from "completed", "review")
        - Clears QA signoff since new work invalidates previous approval
        - Clears recovery notes from previous run

        Returns:
            bool: True if reset was successful, False if plan wasn't in a
                  completed/reviewable state

        Example:
            >>> plan = ImplementationPlan.load(plan_path)
            >>> if plan.reset_for_followup():
            ...     plan.add_followup_phase("New Work", subtasks)
            ...     plan.save(plan_path)
        """
        # States that indicate the plan is "complete" or in review
        completed_statuses = {"done", "ai_review", "human_review"}
        completed_plan_statuses = {"completed", "review"}

        # Check if plan is actually in a completed/reviewable state
        is_completed = (
            self.status in completed_statuses
            or self.planStatus in completed_plan_statuses
        )

        # Also check if all subtasks are actually completed
        all_subtasks = [s for p in self.phases for s in p.subtasks]
        all_subtasks_done = all_subtasks and all(
            s.status == SubtaskStatus.COMPLETED for s in all_subtasks
        )

        if not (is_completed or all_subtasks_done):
            # Plan is not in a state that needs resetting
            return False

        # Transition back to in_progress
        self.status = "in_progress"
        self.planStatus = "in_progress"

        # Clear QA signoff since we're adding new work
        self.qa_signoff = None

        # Clear any recovery notes from previous run
        self.recoveryNote = None

        return True
