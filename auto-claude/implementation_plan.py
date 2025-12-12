#!/usr/bin/env python3
"""
Implementation Plan Manager
============================

Core data structures and utilities for chunk-based implementation plans.
Replaces the test-centric feature_list.json with implementation_plan.json.

The key insight: Tests verify outcomes, but CHUNKS define implementation steps.
For complex multi-service features, implementation order matters.

Workflow Types:
- feature: Standard multi-service feature (phases = services)
- refactor: Migration/refactor work (phases = stages: add, migrate, remove)
- investigation: Bug hunting (phases = investigate, hypothesize, fix)
- migration: Data migration (phases = prepare, test, execute, cleanup)
- simple: Single-service enhancement (minimal overhead)
"""

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Optional


class WorkflowType(str, Enum):
    """Types of workflows with different phase structures."""
    FEATURE = "feature"           # Multi-service feature (phases = services)
    REFACTOR = "refactor"         # Stage-based (add new, migrate, remove old)
    INVESTIGATION = "investigation"  # Bug hunting (investigate, hypothesize, fix)
    MIGRATION = "migration"       # Data migration (prepare, test, execute, cleanup)
    SIMPLE = "simple"             # Single-service, minimal overhead
    DEVELOPMENT = "development"   # General development work
    ENHANCEMENT = "enhancement"   # Improving existing features


class PhaseType(str, Enum):
    """Types of phases within a workflow."""
    SETUP = "setup"               # Project scaffolding, environment setup
    IMPLEMENTATION = "implementation"  # Writing code
    INVESTIGATION = "investigation"    # Research, debugging, analysis
    INTEGRATION = "integration"   # Wiring services together
    CLEANUP = "cleanup"           # Removing old code, polish


class ChunkStatus(str, Enum):
    """Status of a chunk."""
    PENDING = "pending"           # Not started
    IN_PROGRESS = "in_progress"   # Currently being worked on
    COMPLETED = "completed"       # Completed successfully (matches JSON format)
    BLOCKED = "blocked"           # Can't start (dependency not met or undefined)
    FAILED = "failed"             # Attempted but failed


class VerificationType(str, Enum):
    """How to verify a chunk is complete."""
    COMMAND = "command"           # Run a shell command
    API = "api"                   # Make an API request
    BROWSER = "browser"           # Browser automation check
    COMPONENT = "component"       # Component renders correctly
    MANUAL = "manual"             # Requires human verification
    NONE = "none"                 # No verification needed (investigation)


@dataclass
class Verification:
    """How to verify a chunk is complete."""
    type: VerificationType
    run: Optional[str] = None           # Command to run
    url: Optional[str] = None           # URL for API/browser tests
    method: Optional[str] = None        # HTTP method for API tests
    expect_status: Optional[int] = None # Expected HTTP status
    expect_contains: Optional[str] = None  # Expected content
    scenario: Optional[str] = None      # Description for browser/manual tests

    def to_dict(self) -> dict:
        result = {"type": self.type.value}
        for key in ["run", "url", "method", "expect_status", "expect_contains", "scenario"]:
            val = getattr(self, key)
            if val is not None:
                result[key] = val
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "Verification":
        return cls(
            type=VerificationType(data.get("type", "none")),
            run=data.get("run"),
            url=data.get("url"),
            method=data.get("method"),
            expect_status=data.get("expect_status"),
            expect_contains=data.get("expect_contains"),
            scenario=data.get("scenario"),
        )


@dataclass
class Chunk:
    """A single unit of implementation work."""
    id: str
    description: str
    status: ChunkStatus = ChunkStatus.PENDING

    # Scoping
    service: Optional[str] = None       # Which service (backend, frontend, worker)
    all_services: bool = False          # True for integration chunks

    # Files
    files_to_modify: list[str] = field(default_factory=list)
    files_to_create: list[str] = field(default_factory=list)
    patterns_from: list[str] = field(default_factory=list)

    # Verification
    verification: Optional[Verification] = None

    # For investigation chunks
    expected_output: Optional[str] = None  # Knowledge/decision output
    actual_output: Optional[str] = None    # What was discovered

    # Tracking
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    session_id: Optional[int] = None       # Which session completed this

    # Self-Critique
    critique_result: Optional[dict] = None  # Results from self-critique before completion

    def to_dict(self) -> dict:
        result = {
            "id": self.id,
            "description": self.description,
            "status": self.status.value,
        }
        if self.service:
            result["service"] = self.service
        if self.all_services:
            result["all_services"] = True
        if self.files_to_modify:
            result["files_to_modify"] = self.files_to_modify
        if self.files_to_create:
            result["files_to_create"] = self.files_to_create
        if self.patterns_from:
            result["patterns_from"] = self.patterns_from
        if self.verification:
            result["verification"] = self.verification.to_dict()
        if self.expected_output:
            result["expected_output"] = self.expected_output
        if self.actual_output:
            result["actual_output"] = self.actual_output
        if self.started_at:
            result["started_at"] = self.started_at
        if self.completed_at:
            result["completed_at"] = self.completed_at
        if self.session_id is not None:
            result["session_id"] = self.session_id
        if self.critique_result:
            result["critique_result"] = self.critique_result
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "Chunk":
        verification = None
        if "verification" in data:
            verification = Verification.from_dict(data["verification"])

        return cls(
            id=data["id"],
            description=data["description"],
            status=ChunkStatus(data.get("status", "pending")),
            service=data.get("service"),
            all_services=data.get("all_services", False),
            files_to_modify=data.get("files_to_modify", []),
            files_to_create=data.get("files_to_create", []),
            patterns_from=data.get("patterns_from", []),
            verification=verification,
            expected_output=data.get("expected_output"),
            actual_output=data.get("actual_output"),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            session_id=data.get("session_id"),
            critique_result=data.get("critique_result"),
        )

    def start(self, session_id: int):
        """Mark chunk as in progress."""
        self.status = ChunkStatus.IN_PROGRESS
        self.started_at = datetime.now().isoformat()
        self.session_id = session_id
        # Clear stale data from previous runs to ensure clean state
        self.completed_at = None
        self.actual_output = None

    def complete(self, output: Optional[str] = None):
        """Mark chunk as done."""
        self.status = ChunkStatus.COMPLETED
        self.completed_at = datetime.now().isoformat()
        if output:
            self.actual_output = output

    def fail(self, reason: Optional[str] = None):
        """Mark chunk as failed."""
        self.status = ChunkStatus.FAILED
        self.completed_at = None  # Clear to maintain consistency (failed != completed)
        if reason:
            self.actual_output = f"FAILED: {reason}"


@dataclass
class Phase:
    """A group of chunks with dependencies."""
    phase: int
    name: str
    type: PhaseType = PhaseType.IMPLEMENTATION
    chunks: list[Chunk] = field(default_factory=list)
    depends_on: list[int] = field(default_factory=list)
    parallel_safe: bool = False  # Can chunks in this phase run in parallel?

    def to_dict(self) -> dict:
        result = {
            "phase": self.phase,
            "name": self.name,
            "type": self.type.value,
            "chunks": [c.to_dict() for c in self.chunks],
        }
        if self.depends_on:
            result["depends_on"] = self.depends_on
        if self.parallel_safe:
            result["parallel_safe"] = True
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "Phase":
        return cls(
            phase=data["phase"],
            name=data["name"],
            type=PhaseType(data.get("type", "implementation")),
            chunks=[Chunk.from_dict(c) for c in data.get("chunks", [])],
            depends_on=data.get("depends_on", []),
            parallel_safe=data.get("parallel_safe", False),
        )

    def is_complete(self) -> bool:
        """Check if all chunks in this phase are done."""
        return all(c.status == ChunkStatus.COMPLETED for c in self.chunks)

    def get_pending_chunks(self) -> list[Chunk]:
        """Get chunks that can be worked on."""
        return [c for c in self.chunks if c.status == ChunkStatus.PENDING]

    def get_progress(self) -> tuple[int, int]:
        """Get (completed, total) chunk counts."""
        done = sum(1 for c in self.chunks if c.status == ChunkStatus.COMPLETED)
        return done, len(self.chunks)


@dataclass
class ImplementationPlan:
    """Complete implementation plan for a feature/task."""
    feature: str
    workflow_type: WorkflowType = WorkflowType.FEATURE
    services_involved: list[str] = field(default_factory=list)
    phases: list[Phase] = field(default_factory=list)
    final_acceptance: list[str] = field(default_factory=list)

    # Metadata
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    spec_file: Optional[str] = None

    # Task status (synced with UI)
    # status: backlog, in_progress, ai_review, human_review, done
    # planStatus: pending, in_progress, review, completed
    status: Optional[str] = None
    planStatus: Optional[str] = None
    recoveryNote: Optional[str] = None
    qa_signoff: Optional[dict] = None

    def to_dict(self) -> dict:
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
        # Parse workflow_type with fallback for unknown types
        workflow_type_str = data.get("workflow_type", "feature")
        try:
            workflow_type = WorkflowType(workflow_type_str)
        except ValueError:
            # Unknown workflow type - default to FEATURE
            print(f"Warning: Unknown workflow_type '{workflow_type_str}', defaulting to 'feature'")
            workflow_type = WorkflowType.FEATURE

        return cls(
            feature=data["feature"],
            workflow_type=workflow_type,
            services_involved=data.get("services_involved", []),
            phases=[Phase.from_dict(p) for p in data.get("phases", [])],
            final_acceptance=data.get("final_acceptance", []),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            spec_file=data.get("spec_file"),
            status=data.get("status"),
            planStatus=data.get("planStatus"),
            recoveryNote=data.get("recoveryNote"),
            qa_signoff=data.get("qa_signoff"),
        )

    def save(self, path: Path):
        """Save plan to JSON file."""
        self.updated_at = datetime.now().isoformat()
        if not self.created_at:
            self.created_at = self.updated_at

        # Auto-update status based on chunk completion
        self.update_status_from_chunks()

        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    def update_status_from_chunks(self):
        """Update overall status and planStatus based on chunk completion state.
        
        This syncs the task status with the UI's expected values:
        - status: backlog, in_progress, ai_review, human_review, done
        - planStatus: pending, in_progress, review, completed
        """
        all_chunks = [c for p in self.phases for c in p.chunks]
        
        if not all_chunks:
            # No chunks yet - stay in backlog/pending
            if not self.status:
                self.status = "backlog"
            if not self.planStatus:
                self.planStatus = "pending"
            return
        
        completed_count = sum(1 for c in all_chunks if c.status == ChunkStatus.COMPLETED)
        failed_count = sum(1 for c in all_chunks if c.status == ChunkStatus.FAILED)
        in_progress_count = sum(1 for c in all_chunks if c.status == ChunkStatus.IN_PROGRESS)
        total_count = len(all_chunks)
        
        # Determine status based on chunk states
        if completed_count == total_count:
            # All chunks completed - check if QA approved
            if self.qa_signoff and self.qa_signoff.get("status") == "approved":
                self.status = "human_review"
                self.planStatus = "review"
            else:
                # All chunks done, waiting for QA
                self.status = "ai_review"
                self.planStatus = "review"
        elif failed_count > 0:
            # Some chunks failed - still in progress (needs retry or fix)
            self.status = "in_progress"
            self.planStatus = "in_progress"
        elif in_progress_count > 0 or completed_count > 0:
            # Some chunks in progress or completed
            self.status = "in_progress"
            self.planStatus = "in_progress"
        else:
            # All chunks pending - backlog
            self.status = "backlog"
            self.planStatus = "pending"

    @classmethod
    def load(cls, path: Path) -> "ImplementationPlan":
        """Load plan from JSON file."""
        with open(path) as f:
            return cls.from_dict(json.load(f))

    def get_available_phases(self) -> list[Phase]:
        """Get phases whose dependencies are satisfied."""
        completed_phases = {p.phase for p in self.phases if p.is_complete()}
        available = []

        for phase in self.phases:
            if phase.is_complete():
                continue
            deps_met = all(d in completed_phases for d in phase.depends_on)
            if deps_met:
                available.append(phase)

        return available

    def get_next_chunk(self) -> Optional[tuple[Phase, Chunk]]:
        """Get the next chunk to work on, respecting dependencies."""
        for phase in self.get_available_phases():
            pending = phase.get_pending_chunks()
            if pending:
                return phase, pending[0]
        return None

    def get_progress(self) -> dict:
        """Get overall progress statistics."""
        total_chunks = sum(len(p.chunks) for p in self.phases)
        done_chunks = sum(
            1 for p in self.phases
            for c in p.chunks
            if c.status == ChunkStatus.COMPLETED
        )
        failed_chunks = sum(
            1 for p in self.phases
            for c in p.chunks
            if c.status == ChunkStatus.FAILED
        )

        completed_phases = sum(1 for p in self.phases if p.is_complete())

        return {
            "total_phases": len(self.phases),
            "completed_phases": completed_phases,
            "total_chunks": total_chunks,
            "completed_chunks": done_chunks,
            "failed_chunks": failed_chunks,
            "percent_complete": round(100 * done_chunks / total_chunks, 1) if total_chunks > 0 else 0,
            "is_complete": done_chunks == total_chunks and failed_chunks == 0,
        }

    def get_status_summary(self) -> str:
        """Get a human-readable status summary."""
        progress = self.get_progress()
        lines = [
            f"Feature: {self.feature}",
            f"Workflow: {self.workflow_type.value}",
            f"Progress: {progress['completed_chunks']}/{progress['total_chunks']} chunks ({progress['percent_complete']}%)",
            f"Phases: {progress['completed_phases']}/{progress['total_phases']} complete",
        ]

        if progress['failed_chunks'] > 0:
            lines.append(f"Failed: {progress['failed_chunks']} chunks need attention")

        if progress['is_complete']:
            lines.append("Status: COMPLETE - Ready for final acceptance testing")
        else:
            next_work = self.get_next_chunk()
            if next_work:
                phase, chunk = next_work
                lines.append(f"Next: Phase {phase.phase} ({phase.name}) - {chunk.description}")
            else:
                lines.append("Status: BLOCKED - No available chunks")

        return "\n".join(lines)

    def add_followup_phase(
        self,
        name: str,
        chunks: list[Chunk],
        phase_type: PhaseType = PhaseType.IMPLEMENTATION,
        parallel_safe: bool = False,
    ) -> Phase:
        """
        Add a new follow-up phase to an existing (typically completed) plan.

        This allows users to extend completed builds with additional work.
        The new phase depends on all existing phases to ensure proper sequencing.

        Args:
            name: Name of the follow-up phase (e.g., "Follow-Up: Add validation")
            chunks: List of Chunk objects to include in the phase
            phase_type: Type of the phase (default: implementation)
            parallel_safe: Whether chunks in this phase can run in parallel

        Returns:
            The newly created Phase object

        Example:
            >>> plan = ImplementationPlan.load(plan_path)
            >>> new_chunks = [Chunk(id="followup-1", description="Add error handling")]
            >>> plan.add_followup_phase("Follow-Up: Error Handling", new_chunks)
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
            chunks=chunks,
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
        so the build pipeline can continue processing new chunks.

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
            ...     plan.add_followup_phase("New Work", chunks)
            ...     plan.save(plan_path)
        """
        # States that indicate the plan is "complete" or in review
        completed_statuses = {"done", "ai_review", "human_review"}
        completed_plan_statuses = {"completed", "review"}

        # Check if plan is actually in a completed/reviewable state
        is_completed = (
            self.status in completed_statuses or
            self.planStatus in completed_plan_statuses
        )

        # Also check if all chunks are actually completed
        all_chunks = [c for p in self.phases for c in p.chunks]
        all_chunks_done = all_chunks and all(
            c.status == ChunkStatus.COMPLETED for c in all_chunks
        )

        if not (is_completed or all_chunks_done):
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


def create_feature_plan(
    feature: str,
    services: list[str],
    phases_config: list[dict],
) -> ImplementationPlan:
    """
    Create a standard feature implementation plan.

    Args:
        feature: Name of the feature
        services: List of services involved
        phases_config: List of phase configurations

    Returns:
        ImplementationPlan ready for use
    """
    phases = []
    for i, config in enumerate(phases_config, 1):
        chunks = [Chunk.from_dict(c) for c in config.get("chunks", [])]
        phase = Phase(
            phase=i,
            name=config["name"],
            type=PhaseType(config.get("type", "implementation")),
            chunks=chunks,
            depends_on=config.get("depends_on", []),
            parallel_safe=config.get("parallel_safe", False),
        )
        phases.append(phase)

    return ImplementationPlan(
        feature=feature,
        workflow_type=WorkflowType.FEATURE,
        services_involved=services,
        phases=phases,
        created_at=datetime.now().isoformat(),
    )


def create_investigation_plan(
    bug_description: str,
    services: list[str],
) -> ImplementationPlan:
    """
    Create an investigation plan for debugging.

    This creates a structured approach:
    1. Reproduce & Instrument
    2. Investigate
    3. Fix (blocked until investigation complete)
    """
    phases = [
        Phase(
            phase=1,
            name="Reproduce & Instrument",
            type=PhaseType.INVESTIGATION,
            chunks=[
                Chunk(
                    id="add-logging",
                    description="Add detailed logging around suspected areas",
                    expected_output="Logs capture relevant state and events",
                ),
                Chunk(
                    id="create-repro",
                    description="Create reliable reproduction steps",
                    expected_output="Can reproduce bug on demand",
                ),
            ],
        ),
        Phase(
            phase=2,
            name="Identify Root Cause",
            type=PhaseType.INVESTIGATION,
            depends_on=[1],
            chunks=[
                Chunk(
                    id="analyze",
                    description="Analyze logs and behavior",
                    expected_output="Root cause hypothesis with evidence",
                ),
            ],
        ),
        Phase(
            phase=3,
            name="Implement Fix",
            type=PhaseType.IMPLEMENTATION,
            depends_on=[2],
            chunks=[
                Chunk(
                    id="fix",
                    description="[TO BE DETERMINED FROM INVESTIGATION]",
                    status=ChunkStatus.BLOCKED,
                ),
                Chunk(
                    id="regression-test",
                    description="Add regression test to prevent recurrence",
                    status=ChunkStatus.BLOCKED,
                ),
            ],
        ),
    ]

    return ImplementationPlan(
        feature=f"Fix: {bug_description}",
        workflow_type=WorkflowType.INVESTIGATION,
        services_involved=services,
        phases=phases,
        created_at=datetime.now().isoformat(),
    )


def create_refactor_plan(
    refactor_description: str,
    services: list[str],
    stages: list[dict],
) -> ImplementationPlan:
    """
    Create a refactor plan with stage-based phases.

    Typical stages:
    1. Add new system alongside old
    2. Migrate consumers
    3. Remove old system
    4. Cleanup
    """
    phases = []
    for i, stage in enumerate(stages, 1):
        chunks = [Chunk.from_dict(c) for c in stage.get("chunks", [])]
        phase = Phase(
            phase=i,
            name=stage["name"],
            type=PhaseType(stage.get("type", "implementation")),
            chunks=chunks,
            depends_on=stage.get("depends_on", [i - 1] if i > 1 else []),
        )
        phases.append(phase)

    return ImplementationPlan(
        feature=refactor_description,
        workflow_type=WorkflowType.REFACTOR,
        services_involved=services,
        phases=phases,
        created_at=datetime.now().isoformat(),
    )


# CLI for testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python implementation_plan.py <plan.json>")
        print("       python implementation_plan.py --demo")
        sys.exit(1)

    if sys.argv[1] == "--demo":
        # Create a demo plan
        plan = create_feature_plan(
            feature="Avatar Upload with Processing",
            services=["backend", "worker", "frontend"],
            phases_config=[
                {
                    "name": "Backend Foundation",
                    "parallel_safe": True,
                    "chunks": [
                        {
                            "id": "avatar-model",
                            "service": "backend",
                            "description": "Add avatar fields to User model",
                            "files_to_modify": ["app/models/user.py"],
                            "files_to_create": ["migrations/add_avatar.py"],
                            "verification": {"type": "command", "run": "flask db upgrade"},
                        },
                        {
                            "id": "avatar-endpoint",
                            "service": "backend",
                            "description": "POST /api/users/avatar endpoint",
                            "files_to_modify": ["app/routes/users.py"],
                            "patterns_from": ["app/routes/profile.py"],
                            "verification": {"type": "api", "method": "POST", "url": "/api/users/avatar"},
                        },
                    ],
                },
                {
                    "name": "Worker Pipeline",
                    "depends_on": [1],
                    "chunks": [
                        {
                            "id": "image-task",
                            "service": "worker",
                            "description": "Celery task for image processing",
                            "files_to_create": ["app/tasks/images.py"],
                            "patterns_from": ["app/tasks/reports.py"],
                        },
                    ],
                },
                {
                    "name": "Frontend",
                    "depends_on": [1],
                    "chunks": [
                        {
                            "id": "avatar-component",
                            "service": "frontend",
                            "description": "AvatarUpload React component",
                            "files_to_create": ["src/components/AvatarUpload.tsx"],
                            "patterns_from": ["src/components/FileUpload.tsx"],
                        },
                    ],
                },
                {
                    "name": "Integration",
                    "depends_on": [2, 3],
                    "type": "integration",
                    "chunks": [
                        {
                            "id": "e2e-wiring",
                            "all_services": True,
                            "description": "Connect frontend → backend → worker",
                            "verification": {"type": "browser", "scenario": "Upload → Process → Display"},
                        },
                    ],
                },
            ],
        )
        plan.final_acceptance = [
            "User can upload avatar from profile page",
            "Avatar is automatically resized",
            "Large/invalid files show error",
        ]

        print(json.dumps(plan.to_dict(), indent=2))
        print("\n---\n")
        print(plan.get_status_summary())
    else:
        # Load and display existing plan
        plan = ImplementationPlan.load(Path(sys.argv[1]))
        print(plan.get_status_summary())
