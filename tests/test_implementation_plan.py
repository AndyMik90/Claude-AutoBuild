#!/usr/bin/env python3
"""
Tests for Implementation Plan Management
========================================

Tests the implementation_plan.py module functionality including:
- Data structures (Chunk, Phase, ImplementationPlan)
- Status transitions
- Progress tracking
- Dependency resolution
- Plan serialization
"""

import json
import pytest
from datetime import datetime
from pathlib import Path

from implementation_plan import (
    ImplementationPlan,
    Phase,
    Chunk,
    Verification,
    WorkflowType,
    PhaseType,
    ChunkStatus,
    VerificationType,
    create_feature_plan,
    create_investigation_plan,
    create_refactor_plan,
)


class TestChunk:
    """Tests for Chunk data structure."""

    def test_create_simple_chunk(self):
        """Creates a simple chunk with defaults."""
        chunk = Chunk(
            id="chunk-1",
            description="Implement user model",
        )

        assert chunk.id == "chunk-1"
        assert chunk.description == "Implement user model"
        assert chunk.status == ChunkStatus.PENDING
        assert chunk.service is None
        assert chunk.files_to_modify == []
        assert chunk.files_to_create == []

    def test_create_full_chunk(self):
        """Creates a chunk with all fields."""
        chunk = Chunk(
            id="chunk-2",
            description="Add API endpoint",
            status=ChunkStatus.IN_PROGRESS,
            service="backend",
            files_to_modify=["app/routes.py"],
            files_to_create=["app/models/user.py"],
            patterns_from=["app/models/profile.py"],
        )

        assert chunk.service == "backend"
        assert "app/routes.py" in chunk.files_to_modify
        assert "app/models/user.py" in chunk.files_to_create

    def test_chunk_start(self):
        """Chunk can be started."""
        chunk = Chunk(id="test", description="Test")

        chunk.start(session_id=1)

        assert chunk.status == ChunkStatus.IN_PROGRESS
        assert chunk.started_at is not None
        assert chunk.session_id == 1

    def test_chunk_complete(self):
        """Chunk can be completed."""
        chunk = Chunk(id="test", description="Test")
        chunk.start(session_id=1)

        chunk.complete(output="Done successfully")

        assert chunk.status == ChunkStatus.COMPLETED
        assert chunk.completed_at is not None
        assert chunk.actual_output == "Done successfully"

    def test_chunk_fail(self):
        """Chunk can be marked as failed."""
        chunk = Chunk(id="test", description="Test")
        chunk.start(session_id=1)

        chunk.fail(reason="Test error")

        assert chunk.status == ChunkStatus.FAILED
        assert "FAILED: Test error" in chunk.actual_output

    def test_chunk_to_dict(self):
        """Chunk serializes to dict correctly."""
        chunk = Chunk(
            id="chunk-1",
            description="Test chunk",
            service="backend",
            files_to_modify=["file.py"],
        )

        data = chunk.to_dict()

        assert data["id"] == "chunk-1"
        assert data["description"] == "Test chunk"
        assert data["status"] == "pending"
        assert data["service"] == "backend"
        assert "file.py" in data["files_to_modify"]

    def test_chunk_from_dict(self):
        """Chunk deserializes from dict correctly."""
        data = {
            "id": "chunk-1",
            "description": "Test chunk",
            "status": "completed",
            "service": "frontend",
        }

        chunk = Chunk.from_dict(data)

        assert chunk.id == "chunk-1"
        assert chunk.status == ChunkStatus.COMPLETED
        assert chunk.service == "frontend"


class TestVerification:
    """Tests for Verification data structure."""

    def test_command_verification(self):
        """Creates command-type verification."""
        verification = Verification(
            type=VerificationType.COMMAND,
            run="pytest tests/",
        )

        assert verification.type == VerificationType.COMMAND
        assert verification.run == "pytest tests/"

    def test_api_verification(self):
        """Creates API-type verification."""
        verification = Verification(
            type=VerificationType.API,
            url="/api/users",
            method="POST",
            expect_status=201,
        )

        assert verification.type == VerificationType.API
        assert verification.method == "POST"
        assert verification.expect_status == 201

    def test_verification_to_dict(self):
        """Verification serializes to dict."""
        verification = Verification(
            type=VerificationType.BROWSER,
            scenario="User can upload avatar",
        )

        data = verification.to_dict()

        assert data["type"] == "browser"
        assert data["scenario"] == "User can upload avatar"

    def test_verification_from_dict(self):
        """Verification deserializes from dict."""
        data = {
            "type": "command",
            "run": "npm test",
        }

        verification = Verification.from_dict(data)

        assert verification.type == VerificationType.COMMAND
        assert verification.run == "npm test"


class TestPhase:
    """Tests for Phase data structure."""

    def test_create_phase(self):
        """Creates a phase with chunks."""
        chunk1 = Chunk(id="c1", description="Chunk 1")
        chunk2 = Chunk(id="c2", description="Chunk 2")

        phase = Phase(
            phase=1,
            name="Setup",
            type=PhaseType.SETUP,
            subtasks=[chunk1, chunk2],
        )

        assert phase.phase == 1
        assert phase.name == "Setup"
        assert len(phase.subtasks) == 2

    def test_phase_is_complete(self):
        """Phase completion checks all chunks."""
        chunk1 = Chunk(id="c1", description="Chunk 1", status=ChunkStatus.COMPLETED)
        chunk2 = Chunk(id="c2", description="Chunk 2", status=ChunkStatus.COMPLETED)
        phase = Phase(phase=1, name="Test", subtasks=[chunk1, chunk2])

        assert phase.is_complete() is True

    def test_phase_not_complete_with_pending(self):
        """Phase not complete with pending chunks."""
        chunk1 = Chunk(id="c1", description="Chunk 1", status=ChunkStatus.COMPLETED)
        chunk2 = Chunk(id="c2", description="Chunk 2", status=ChunkStatus.PENDING)
        phase = Phase(phase=1, name="Test", subtasks=[chunk1, chunk2])

        assert phase.is_complete() is False

    def test_phase_get_pending_chunks(self):
        """Gets pending chunks from phase."""
        chunk1 = Chunk(id="c1", description="Chunk 1", status=ChunkStatus.COMPLETED)
        chunk2 = Chunk(id="c2", description="Chunk 2", status=ChunkStatus.PENDING)
        chunk3 = Chunk(id="c3", description="Chunk 3", status=ChunkStatus.PENDING)
        phase = Phase(phase=1, name="Test", subtasks=[chunk1, chunk2, chunk3])

        pending = phase.get_pending_chunks()

        assert len(pending) == 2
        assert all(c.status == ChunkStatus.PENDING for c in pending)

    def test_phase_get_progress(self):
        """Gets progress counts from phase."""
        chunk1 = Chunk(id="c1", description="Chunk 1", status=ChunkStatus.COMPLETED)
        chunk2 = Chunk(id="c2", description="Chunk 2", status=ChunkStatus.COMPLETED)
        chunk3 = Chunk(id="c3", description="Chunk 3", status=ChunkStatus.PENDING)
        phase = Phase(phase=1, name="Test", subtasks=[chunk1, chunk2, chunk3])

        completed, total = phase.get_progress()

        assert completed == 2
        assert total == 3

    def test_phase_to_dict(self):
        """Phase serializes to dict."""
        chunk = Chunk(id="c1", description="Test")
        phase = Phase(
            phase=1,
            name="Setup",
            type=PhaseType.SETUP,
            subtasks=[chunk],
            depends_on=[],
        )

        data = phase.to_dict()

        assert data["phase"] == 1
        assert data["name"] == "Setup"
        assert data["type"] == "setup"
        assert len(data["chunks"]) == 1

    def test_phase_from_dict(self):
        """Phase deserializes from dict."""
        data = {
            "phase": 2,
            "name": "Implementation",
            "type": "implementation",
            "chunks": [{"id": "c1", "description": "Test"}],
            "depends_on": [1],
        }

        phase = Phase.from_dict(data)

        assert phase.phase == 2
        assert phase.type == PhaseType.IMPLEMENTATION
        assert len(phase.subtasks) == 1
        assert 1 in phase.depends_on


class TestImplementationPlan:
    """Tests for ImplementationPlan data structure."""

    def test_create_plan(self):
        """Creates an implementation plan."""
        plan = ImplementationPlan(
            feature="User Authentication",
            workflow_type=WorkflowType.FEATURE,
            services_involved=["backend", "frontend"],
        )

        assert plan.feature == "User Authentication"
        assert plan.workflow_type == WorkflowType.FEATURE
        assert "backend" in plan.services_involved

    def test_plan_get_available_phases(self, sample_implementation_plan: dict):
        """Gets phases with satisfied dependencies."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)

        # Mark phase 1 as complete
        for chunk in plan.phases[0].subtasks:
            chunk.status = ChunkStatus.COMPLETED

        available = plan.get_available_phases()

        # Phase 2 and 3 depend on phase 1, so they should be available
        phase_nums = [p.phase for p in available]
        assert 2 in phase_nums
        assert 3 in phase_nums

    def test_plan_get_next_subtask(self, sample_implementation_plan: dict):
        """Gets next subtask to work on."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)

        result = plan.get_next_subtask()

        assert result is not None
        phase, subtask = result
        # Should be first pending subtask in phase 1
        assert phase.phase == 1
        assert subtask.status == ChunkStatus.PENDING

    def test_plan_get_progress(self, sample_implementation_plan: dict):
        """Gets overall progress."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)

        # Complete some subtasks
        plan.phases[0].subtasks[0].status = ChunkStatus.COMPLETED

        progress = plan.get_progress()

        assert progress["total_phases"] == 3
        assert progress["total_subtasks"] == 4  # Based on fixture
        assert progress["completed_subtasks"] == 1
        assert progress["percent_complete"] == 25.0  # 1/4 = 25%
        assert progress["is_complete"] is False

    def test_plan_save_and_load(self, temp_dir: Path, sample_implementation_plan: dict):
        """Plan saves and loads correctly."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)
        plan_path = temp_dir / "plan.json"

        plan.save(plan_path)
        loaded = ImplementationPlan.load(plan_path)

        assert loaded.feature == plan.feature
        assert len(loaded.phases) == len(plan.phases)
        assert loaded.updated_at is not None

    def test_plan_to_dict(self, sample_implementation_plan: dict):
        """Plan serializes to dict."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)

        data = plan.to_dict()

        assert data["feature"] == "User Avatar Upload"
        assert data["workflow_type"] == "feature"
        assert len(data["phases"]) == 3

    def test_plan_from_dict(self, sample_implementation_plan: dict):
        """Plan deserializes from dict."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)

        assert plan.feature == "User Avatar Upload"
        assert plan.workflow_type == WorkflowType.FEATURE
        assert len(plan.services_involved) == 3

    def test_plan_status_summary(self, sample_implementation_plan: dict):
        """Plan generates status summary."""
        plan = ImplementationPlan.from_dict(sample_implementation_plan)

        summary = plan.get_status_summary()

        assert "User Avatar Upload" in summary
        assert "feature" in summary
        assert "0%" in summary or "chunks" in summary


class TestCreateFeaturePlan:
    """Tests for create_feature_plan helper."""

    def test_creates_basic_plan(self):
        """Creates a feature plan with phases."""
        phases_config = [
            {
                "name": "Backend",
                "chunks": [
                    {"id": "api", "description": "Add API endpoint"},
                ],
            },
            {
                "name": "Frontend",
                "depends_on": [1],
                "chunks": [
                    {"id": "ui", "description": "Add UI component"},
                ],
            },
        ]

        plan = create_feature_plan(
            feature="User Profile",
            services=["backend", "frontend"],
            phases_config=phases_config,
        )

        assert plan.feature == "User Profile"
        assert plan.workflow_type == WorkflowType.FEATURE
        assert len(plan.phases) == 2
        assert plan.phases[1].depends_on == [1]

    def test_sets_parallel_safe(self):
        """Respects parallel_safe flag."""
        phases_config = [
            {
                "name": "Parallel Phase",
                "parallel_safe": True,
                "chunks": [
                    {"id": "c1", "description": "Chunk 1"},
                    {"id": "c2", "description": "Chunk 2"},
                ],
            },
        ]

        plan = create_feature_plan(
            feature="Test",
            services=["backend"],
            phases_config=phases_config,
        )

        assert plan.phases[0].parallel_safe is True


class TestCreateInvestigationPlan:
    """Tests for create_investigation_plan helper."""

    def test_creates_investigation_plan(self):
        """Creates an investigation plan for debugging."""
        plan = create_investigation_plan(
            bug_description="Login fails for users with special characters",
            services=["backend", "frontend"],
        )

        assert "Fix:" in plan.feature
        assert plan.workflow_type == WorkflowType.INVESTIGATION
        assert len(plan.phases) == 3  # Reproduce, Investigate, Fix

    def test_has_blocked_fix_chunks(self):
        """Fix phase starts blocked."""
        plan = create_investigation_plan(
            bug_description="Test bug",
            services=["backend"],
        )

        # Fix phase should have blocked chunks
        fix_phase = plan.phases[2]  # Phase 3 - Fix
        assert any(c.status == ChunkStatus.BLOCKED for c in fix_phase.subtasks)


class TestCreateRefactorPlan:
    """Tests for create_refactor_plan helper."""

    def test_creates_refactor_plan(self):
        """Creates a refactor plan with stages."""
        stages = [
            {
                "name": "Add New System",
                "chunks": [
                    {"id": "new-api", "description": "Add new API"},
                ],
            },
            {
                "name": "Migrate Consumers",
                "chunks": [
                    {"id": "migrate", "description": "Update consumers"},
                ],
            },
            {
                "name": "Remove Old System",
                "chunks": [
                    {"id": "remove", "description": "Remove old code"},
                ],
            },
        ]

        plan = create_refactor_plan(
            refactor_description="Replace auth system",
            services=["backend"],
            stages=stages,
        )

        assert plan.workflow_type == WorkflowType.REFACTOR
        assert len(plan.phases) == 3
        # Each phase should depend on the previous
        assert plan.phases[1].depends_on == [1]
        assert plan.phases[2].depends_on == [2]


class TestDependencyResolution:
    """Tests for phase dependency resolution."""

    def test_no_available_phases_when_deps_not_met(self):
        """No phases available when dependencies aren't met."""
        plan = ImplementationPlan(
            feature="Test",
            phases=[
                Phase(phase=1, name="Setup", subtasks=[
                    Chunk(id="c1", description="Setup", status=ChunkStatus.PENDING)
                ]),
                Phase(phase=2, name="Build", depends_on=[1], subtasks=[
                    Chunk(id="c2", description="Build")
                ]),
            ],
        )

        available = plan.get_available_phases()

        # Only phase 1 should be available (no dependencies)
        assert len(available) == 1
        assert available[0].phase == 1

    def test_multiple_phases_available_parallel(self):
        """Multiple phases can be available in parallel."""
        plan = ImplementationPlan(
            feature="Test",
            phases=[
                Phase(phase=1, name="Setup", subtasks=[
                    Chunk(id="c1", description="Setup", status=ChunkStatus.COMPLETED)
                ]),
                Phase(phase=2, name="Backend", depends_on=[1], subtasks=[
                    Chunk(id="c2", description="Backend")
                ]),
                Phase(phase=3, name="Frontend", depends_on=[1], subtasks=[
                    Chunk(id="c3", description="Frontend")
                ]),
            ],
        )

        available = plan.get_available_phases()

        # Phases 2 and 3 should both be available (both depend only on phase 1)
        assert len(available) == 2
        phase_nums = [p.phase for p in available]
        assert 2 in phase_nums
        assert 3 in phase_nums

    def test_phase_blocked_by_multiple_deps(self):
        """Phase blocked when any dependency not met."""
        plan = ImplementationPlan(
            feature="Test",
            phases=[
                Phase(phase=1, name="Phase1", subtasks=[
                    Chunk(id="c1", description="C1", status=ChunkStatus.COMPLETED)
                ]),
                Phase(phase=2, name="Phase2", subtasks=[
                    Chunk(id="c2", description="C2", status=ChunkStatus.PENDING)
                ]),
                Phase(phase=3, name="Phase3", depends_on=[1, 2], subtasks=[
                    Chunk(id="c3", description="C3")
                ]),
            ],
        )

        available = plan.get_available_phases()

        # Phase 3 requires both 1 and 2, but 2 isn't complete
        phase_nums = [p.phase for p in available]
        assert 3 not in phase_nums


class TestChunkCritique:
    """Tests for self-critique functionality on chunks."""

    def test_chunk_stores_critique_result(self):
        """Chunk can store critique results."""
        chunk = Chunk(id="test", description="Test")

        chunk.critique_result = {
            "passed": True,
            "issues": [],
            "suggestions": ["Consider adding error handling"],
        }

        assert chunk.critique_result["passed"] is True

    def test_critique_serializes(self):
        """Critique result serializes correctly."""
        chunk = Chunk(id="test", description="Test")
        chunk.critique_result = {"passed": False, "issues": ["Missing tests"]}

        data = chunk.to_dict()

        assert "critique_result" in data
        assert data["critique_result"]["passed"] is False

    def test_critique_deserializes(self):
        """Critique result deserializes correctly."""
        data = {
            "id": "test",
            "description": "Test",
            "critique_result": {"passed": True, "score": 8},
        }

        chunk = Chunk.from_dict(data)

        assert chunk.critique_result is not None
        assert chunk.critique_result["score"] == 8
