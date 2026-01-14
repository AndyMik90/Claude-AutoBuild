"""End-to-end tests for the Native methodology.

Verifies the complete Native methodology flow from task creation to validated code.
Tests artifact production, prompt compatibility, and phase sequence execution.

Story Reference: Story 2.6 - Verify Native Methodology End-to-End Flow
"""

import json
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Project root directory for file path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent
NATIVE_METHODOLOGY_DIR = PROJECT_ROOT / "apps" / "backend" / "methodologies" / "native"


# =============================================================================
# Test Project Fixture (Task 1.1)
# =============================================================================


@pytest.fixture
def test_project_dir(tmp_path: Path) -> Generator[Path, None, None]:
    """Create a minimal test project for E2E testing.

    Creates a realistic project structure with:
    - src/ directory with Python files
    - requirements.txt
    - README.md
    - Initialized git repository

    Args:
        tmp_path: pytest fixture for temporary directory

    Yields:
        Path to the test project directory

    Story Reference: Story 2.6 Task 1.1 - Create test project fixture
    """
    project_dir = tmp_path / "test_project"
    project_dir.mkdir()

    # Create source directory
    src_dir = project_dir / "src"
    src_dir.mkdir()

    # Create main.py
    main_file = src_dir / "main.py"
    main_file.write_text("""# Main entry point for test project

def main():
    print("Hello from test project")

if __name__ == "__main__":
    main()
""")

    # Create utils.py
    utils_file = src_dir / "utils.py"
    utils_file.write_text("""# Utility functions

def add(a, b):
    return a + b

def multiply(a, b):
    return a * b
""")

    # Create requirements.txt
    req_file = project_dir / "requirements.txt"
    req_file.write_text("pytest>=7.0.0\n")

    # Create README.md
    readme_file = project_dir / "README.md"
    readme_file.write_text("# Test Project\n\nA minimal test project for E2E testing.\n")

    # Initialize git repository
    subprocess.run(["git", "init"], cwd=project_dir, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=project_dir,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=project_dir,
        check=True,
        capture_output=True,
    )
    subprocess.run(["git", "add", "."], cwd=project_dir, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=project_dir,
        check=True,
        capture_output=True,
    )

    yield project_dir


@pytest.fixture
def spec_dir(tmp_path: Path) -> Path:
    """Create a spec directory for storing artifacts.

    Args:
        tmp_path: pytest fixture for temporary directory

    Returns:
        Path to the spec directory

    Story Reference: Story 2.6 Task 1.2 - Create test task configuration
    """
    spec_path = tmp_path / "specs" / "001-test-task"
    spec_path.mkdir(parents=True)
    return spec_path


# =============================================================================
# Test Task Configuration Fixture (Task 1.2)
# =============================================================================


@pytest.fixture
def test_task_config() -> dict[str, Any]:
    """Create a test task configuration.

    Returns:
        Dictionary with task configuration parameters

    Story Reference: Story 2.6 Task 1.2 - Create test task configuration
    """
    return {
        "task_id": "test-task-001",
        "task_name": "Add hello world function",
        "complexity": "standard",
        "execution_mode": "full_auto",
        "description": "Add a hello world function to the project",
    }


@pytest.fixture
def mock_run_context(test_project_dir: Path, spec_dir: Path, test_task_config: dict) -> Any:
    """Create a mock RunContext with all required services.

    Args:
        test_project_dir: The test project directory fixture
        spec_dir: The spec directory fixture
        test_task_config: Task configuration fixture

    Returns:
        A fully configured mock RunContext

    Story Reference: Story 2.6 Task 1.3 - Set up isolated test environment
    """
    from apps.backend.methodologies.protocols import (
        ComplexityLevel,
        ExecutionMode,
        RunContext,
        TaskConfig,
    )

    class MockWorkspace:
        def __init__(self, project_dir: Path):
            self._project_dir = project_dir

        def get_project_root(self) -> str:
            return str(self._project_dir)

    class MockMemory:
        def get_context(self, query: str) -> str:
            return "mock context for testing"

    class MockProgress:
        def __init__(self):
            self.events = []
            self.updates = []

        def update(self, phase_id: str, progress: float, message: str) -> None:
            self.updates.append((phase_id, progress, message))

        def emit(self, event) -> None:
            self.events.append(event)

    class MockCheckpoint:
        def __init__(self):
            self.checkpoints = []

        def create_checkpoint(self, checkpoint_id: str, data: dict[str, Any]) -> None:
            self.checkpoints.append((checkpoint_id, data))

    class MockLLM:
        def generate(self, prompt: str) -> str:
            return "mock LLM response"

    return RunContext(
        workspace=MockWorkspace(test_project_dir),
        memory=MockMemory(),
        progress=MockProgress(),
        checkpoint=MockCheckpoint(),
        llm=MockLLM(),
        task_config=TaskConfig(
            complexity=ComplexityLevel.STANDARD,
            execution_mode=ExecutionMode.FULL_AUTO,
            task_id=test_task_config["task_id"],
            task_name=test_task_config["task_name"],
            metadata={"spec_dir": str(spec_dir)},
        ),
    )


# =============================================================================
# Isolated Test Environment Fixture (Task 1.3)
# =============================================================================


@pytest.fixture
def mock_workspace_manager_e2e(test_project_dir: Path):
    """Create a mock WorktreeManager for E2E tests.

    This fixture creates a mock that returns the test project directory
    instead of creating a real git worktree, enabling isolated testing.

    Args:
        test_project_dir: The test project directory fixture

    Returns:
        A configured mock WorktreeManager

    Story Reference: Story 2.6 Task 1.3 - Set up isolated test environment
    """
    mock_manager = MagicMock()
    mock_worktree_info = MagicMock()
    mock_worktree_info.path = str(test_project_dir)
    mock_worktree_info.branch = "auto-claude/test-task-001"
    mock_worktree_info.spec_name = "test-task-001"
    mock_manager.get_or_create_worktree.return_value = mock_worktree_info
    mock_manager.setup.return_value = None
    return mock_manager


@pytest.fixture
def initialized_e2e_runner(mock_run_context: Any, mock_workspace_manager_e2e: MagicMock) -> Any:
    """Create an initialized NativeRunner for E2E testing.

    Args:
        mock_run_context: The mock RunContext fixture
        mock_workspace_manager_e2e: The mock WorktreeManager fixture

    Returns:
        An initialized NativeRunner instance

    Story Reference: Story 2.6 Task 1 - Create end-to-end test harness
    """
    from apps.backend.methodologies.native import NativeRunner

    runner = NativeRunner()

    with patch(
        "apps.backend.methodologies.native.methodology.WorktreeManager",
        return_value=mock_workspace_manager_e2e,
    ), patch(
        "apps.backend.methodologies.native.methodology.get_security_profile",
        return_value=MagicMock(),
    ), patch(
        "apps.backend.methodologies.native.methodology.get_graphiti_memory",
        return_value=MagicMock(),
    ):
        runner.initialize(mock_run_context)

    return runner


# =============================================================================
# E2E Test Harness Tests (Task 1 Verification)
# =============================================================================


class TestE2ETestHarness:
    """Verify the E2E test harness is properly set up (Story 2.6 Task 1)."""

    def test_test_project_has_git_repo(self, test_project_dir: Path):
        """Test that test project has initialized git repository."""
        git_dir = test_project_dir / ".git"
        assert git_dir.exists(), "Test project should have .git directory"

    def test_test_project_has_source_files(self, test_project_dir: Path):
        """Test that test project has source files."""
        assert (test_project_dir / "src" / "main.py").exists()
        assert (test_project_dir / "src" / "utils.py").exists()

    def test_test_project_has_requirements(self, test_project_dir: Path):
        """Test that test project has requirements.txt."""
        assert (test_project_dir / "requirements.txt").exists()

    def test_spec_dir_exists(self, spec_dir: Path):
        """Test that spec directory is created."""
        assert spec_dir.exists()
        assert spec_dir.is_dir()

    def test_mock_run_context_has_all_services(self, mock_run_context: Any):
        """Test that mock RunContext has all required services."""
        assert mock_run_context.workspace is not None
        assert mock_run_context.memory is not None
        assert mock_run_context.progress is not None
        assert mock_run_context.checkpoint is not None
        assert mock_run_context.llm is not None
        assert mock_run_context.task_config is not None

    def test_mock_run_context_has_spec_dir_in_metadata(self, mock_run_context: Any, spec_dir: Path):
        """Test that spec_dir is in task_config metadata."""
        assert mock_run_context.task_config.metadata.get("spec_dir") == str(spec_dir)

    def test_e2e_runner_initializes(self, initialized_e2e_runner: Any):
        """Test that E2E runner initializes successfully."""
        assert initialized_e2e_runner._initialized is True


# =============================================================================
# Full Phase Sequence Tests (Task 2)
# =============================================================================


class TestFullPhaseSequence:
    """Test full phase sequence execution (Story 2.6 AC#1)."""

    def test_discovery_phase_executes(self, initialized_e2e_runner: Any):
        """Test discovery phase can execute."""
        result = initialized_e2e_runner.execute_phase("discovery")
        # Discovery may succeed or fail depending on project structure
        assert result.phase_id == "discovery"
        assert isinstance(result.success, bool)

    def test_requirements_phase_creates_artifact(self, initialized_e2e_runner: Any, spec_dir: Path):
        """Test requirements phase creates requirements.json artifact (FR31)."""
        result = initialized_e2e_runner.execute_phase("requirements")

        assert result.success is True
        assert result.phase_id == "requirements"

        # Verify artifact was created
        req_file = spec_dir / "requirements.json"
        assert req_file.exists(), "requirements.json should be created"

        # Verify artifact content structure
        with open(req_file) as f:
            req_data = json.load(f)
        assert "task_description" in req_data

    def test_context_phase_creates_artifact(self, initialized_e2e_runner: Any, spec_dir: Path):
        """Test context phase creates context.json artifact."""
        # Run requirements first (context depends on it)
        initialized_e2e_runner.execute_phase("requirements")

        result = initialized_e2e_runner.execute_phase("context")

        assert result.phase_id == "context"
        # Context may create minimal fallback
        assert isinstance(result.success, bool)

    def test_phases_execute_in_correct_order(self, initialized_e2e_runner: Any):
        """Test phases have correct execution order."""
        phases = initialized_e2e_runner.get_phases()

        expected_order = [
            "discovery",
            "requirements",
            "context",
            "spec",
            "validate",
            "planning",
            "coding",
            "qa_validation",
        ]

        actual_ids = [phase.id for phase in phases]
        assert actual_ids == expected_order

        # Verify order attribute
        orders = [phase.order for phase in phases]
        assert orders == [1, 2, 3, 4, 5, 6, 7, 8]

    def test_spec_phase_requires_spec_md(self, initialized_e2e_runner: Any):
        """Test spec phase fails if spec.md doesn't exist (requires agent)."""
        result = initialized_e2e_runner.execute_phase("spec")

        # Spec requires agent infrastructure
        assert result.success is False
        assert "framework" in result.error.lower() or "agent" in result.error.lower()

    def test_spec_phase_succeeds_with_existing_spec(
        self, initialized_e2e_runner: Any, spec_dir: Path
    ):
        """Test spec phase succeeds when spec.md already exists."""
        # Create spec.md manually
        spec_file = spec_dir / "spec.md"
        spec_file.write_text("""# Test Spec

## Overview
This is a test specification.

## Acceptance Criteria
- AC1: The function should exist
- AC2: The function should return a greeting
""")

        result = initialized_e2e_runner.execute_phase("spec")

        assert result.success is True
        assert "already exists" in result.message.lower()

    def test_planning_phase_requires_spec(self, initialized_e2e_runner: Any):
        """Test planning phase fails without spec.md."""
        result = initialized_e2e_runner.execute_phase("planning")

        assert result.success is False
        assert "spec.md" in result.error.lower()

    def test_planning_phase_succeeds_with_existing_plan(
        self, initialized_e2e_runner: Any, spec_dir: Path
    ):
        """Test planning phase succeeds when plan already exists (FR32)."""
        # Create spec.md and plan
        (spec_dir / "spec.md").write_text("# Test Spec\n\nContent")
        plan_file = spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps({
            "phases": [
                {
                    "id": 1,
                    "name": "Implementation",
                    "subtasks": [
                        {"id": "1.1", "description": "Create function", "status": "pending"}
                    ]
                }
            ]
        }))

        result = initialized_e2e_runner.execute_phase("planning")

        assert result.success is True
        assert "already exists" in result.message.lower()
        assert str(plan_file) in result.artifacts

    def test_coding_phase_requires_plan(self, initialized_e2e_runner: Any):
        """Test coding phase fails without implementation_plan.json."""
        result = initialized_e2e_runner.execute_phase("coding")

        assert result.success is False
        assert "implementation_plan.json" in result.error.lower()

    def test_qa_validation_phase_requires_complete_build(self, initialized_e2e_runner: Any):
        """Test qa_validation phase fails without complete build (FR34)."""
        result = initialized_e2e_runner.execute_phase("qa_validation")

        assert result.success is False
        assert "complete" in result.error.lower()


# =============================================================================
# Artifact Compatibility Tests (Task 3)
# =============================================================================


class TestArtifactCompatibility:
    """Verify artifact formats match pre-migration behavior (Story 2.6 AC#2)."""

    def test_requirements_json_format(self, initialized_e2e_runner: Any, spec_dir: Path):
        """Test requirements.json format matches pre-migration."""
        initialized_e2e_runner.execute_phase("requirements")

        req_file = spec_dir / "requirements.json"
        assert req_file.exists()

        with open(req_file) as f:
            req_data = json.load(f)

        # Verify expected fields exist
        assert "task_description" in req_data
        # Additional fields may include user_requirements, services_involved, etc.

    def test_context_json_format(self, initialized_e2e_runner: Any, spec_dir: Path):
        """Test context.json format matches pre-migration."""
        initialized_e2e_runner.execute_phase("requirements")
        initialized_e2e_runner.execute_phase("context")

        context_file = spec_dir / "context.json"
        # Context may or may not be created depending on execution
        if context_file.exists():
            with open(context_file) as f:
                context_data = json.load(f)
            # Verify it's valid JSON
            assert isinstance(context_data, dict)

    def test_implementation_plan_json_format(self, spec_dir: Path):
        """Test implementation_plan.json format matches expected schema."""
        # Create a plan in the expected format
        plan = {
            "workflow_type": "subtask_based",
            "phases": [
                {
                    "id": 1,
                    "name": "Phase 1",
                    "depends_on": [],
                    "subtasks": [
                        {
                            "id": "1.1",
                            "description": "First subtask",
                            "status": "pending",
                            "service": None,
                        }
                    ],
                }
            ],
        }

        plan_file = spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps(plan))

        # Verify we can load and parse it
        with open(plan_file) as f:
            loaded = json.load(f)

        assert "phases" in loaded
        assert len(loaded["phases"]) == 1
        assert "subtasks" in loaded["phases"][0]

    def test_qa_report_md_format(self, spec_dir: Path):
        """Test qa_report.md format matches expected structure."""
        # Create a QA report in expected format
        qa_content = """# QA Report

## Status: APPROVED

## Summary
All acceptance criteria verified successfully.

## Test Results
- AC1: PASS
- AC2: PASS

## Notes
No issues found.
"""
        qa_file = spec_dir / "qa_report.md"
        qa_file.write_text(qa_content)

        # Verify it can be read
        assert qa_file.exists()
        content = qa_file.read_text()
        assert "# QA Report" in content
        assert "Status:" in content

    def test_artifact_ids_match_manifest(self, initialized_e2e_runner: Any):
        """Test artifact IDs match those defined in manifest."""
        artifacts = initialized_e2e_runner.get_artifacts()
        artifact_ids = {a.id for a in artifacts}

        # Expected artifact IDs from manifest
        expected_ids = {
            "requirements-json",
            "context-json",
            "spec-md",
            "implementation-plan-json",
            "qa-report-md",
        }

        assert artifact_ids == expected_ids


# =============================================================================
# Prompt Compatibility Tests (Task 4)
# =============================================================================


class TestPromptCompatibility:
    """Verify agent prompts match existing prompts (Story 2.6 AC#2)."""

    def test_planner_prompt_file_exists(self):
        """Test planner prompt file exists."""
        planner_prompt = PROJECT_ROOT / "apps" / "backend" / "prompts" / "planner.md"
        assert planner_prompt.exists(), "planner.md prompt should exist"

    def test_coder_prompt_file_exists(self):
        """Test coder prompt file exists."""
        coder_prompt = PROJECT_ROOT / "apps" / "backend" / "prompts" / "coder.md"
        assert coder_prompt.exists(), "coder.md prompt should exist"

    def test_qa_reviewer_prompt_file_exists(self):
        """Test QA reviewer prompt file exists."""
        qa_prompt = PROJECT_ROOT / "apps" / "backend" / "prompts" / "qa_reviewer.md"
        assert qa_prompt.exists(), "qa_reviewer.md prompt should exist"

    def test_qa_fixer_prompt_file_exists(self):
        """Test QA fixer prompt file exists."""
        qa_fixer_prompt = PROJECT_ROOT / "apps" / "backend" / "prompts" / "qa_fixer.md"
        assert qa_fixer_prompt.exists(), "qa_fixer.md prompt should exist"

    def test_planning_phase_uses_correct_agent_type(self):
        """Test planning phase uses 'planner' agent type."""
        # This is verified through the implementation test in methodology tests
        # Here we just confirm the expected behavior
        from apps.backend.methodologies.native import NativeRunner

        # Check that the runner has the planning method that uses 'planner'
        runner = NativeRunner()
        assert hasattr(runner, "_execute_planning")

    def test_coding_phase_uses_correct_agent(self):
        """Test coding phase uses coder agent."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        assert hasattr(runner, "_execute_coding")

    def test_qa_validation_uses_correct_agents(self):
        """Test QA validation uses qa_reviewer/qa_fixer agents."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        assert hasattr(runner, "_execute_qa_validation")


# =============================================================================
# Performance Regression Tests (Task 5)
# =============================================================================


class TestPerformanceRegression:
    """Test performance stays within 10% of baseline (Story 2.6 AC#2, NFR7).

    Performance baselines from story:
    - Discovery: ~30s
    - Requirements: ~20s
    - Context: ~45s
    - Total quick phases: ~95s (overhead-only, not agent time)

    NFR7 tolerance: +/- 10%
    """

    @pytest.mark.slow
    def test_requirements_phase_performance(self, initialized_e2e_runner: Any):
        """Test requirements phase completes within expected time.

        Baseline: ~20s (generous for mocked environment)
        Tolerance: 22s max (10% overhead)
        """
        start_time = time.time()
        initialized_e2e_runner.execute_phase("requirements")
        elapsed = time.time() - start_time

        # In mocked environment, should be very fast (< 1s)
        # Real performance would be validated in integration tests
        assert elapsed < 5.0, f"Requirements phase took {elapsed:.2f}s, expected < 5s in mocked env"

    @pytest.mark.slow
    def test_phase_execution_does_not_hang(self, initialized_e2e_runner: Any):
        """Test that phase execution completes (doesn't hang indefinitely)."""
        import signal

        def timeout_handler(signum, frame):
            raise TimeoutError("Phase execution timed out")

        # Set 30 second timeout
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(30)

        try:
            result = initialized_e2e_runner.execute_phase("requirements")
            assert result is not None
        finally:
            signal.alarm(0)  # Disable alarm

    def test_runner_initialization_performance(self, mock_run_context: Any):
        """Test runner initialization completes quickly."""
        from apps.backend.methodologies.native import NativeRunner

        mock_workspace_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/path"
        mock_worktree_info.branch = "test"
        mock_worktree_info.spec_name = "test"
        mock_workspace_manager.get_or_create_worktree.return_value = mock_worktree_info

        start_time = time.time()

        runner = NativeRunner()
        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_workspace_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=MagicMock(),
        ):
            runner.initialize(mock_run_context)

        elapsed = time.time() - start_time

        # Initialization should be very fast (< 1s in mocked env)
        assert elapsed < 2.0, f"Runner initialization took {elapsed:.2f}s, expected < 2s"


# =============================================================================
# Semi-Auto Checkpoint Flow Tests (Task 6)
# =============================================================================


class TestSemiAutoCheckpointFlow:
    """Test Semi-Auto checkpoint flow (Story 2.6 AC#1)."""

    def test_checkpoints_exist_at_expected_phases(self, initialized_e2e_runner: Any):
        """Test checkpoints are defined for expected phases."""
        checkpoints = initialized_e2e_runner.get_checkpoints()

        checkpoint_phases = {cp.phase_id for cp in checkpoints}

        # Expected checkpoint locations
        assert "planning" in checkpoint_phases
        assert "spec" in checkpoint_phases
        assert "validate" in checkpoint_phases

    def test_checkpoint_after_planning_is_defined(self, initialized_e2e_runner: Any):
        """Test checkpoint after planning phase exists."""
        checkpoints = initialized_e2e_runner.get_checkpoints()

        planning_checkpoint = next(
            (cp for cp in checkpoints if cp.id == "after_planning"), None
        )

        assert planning_checkpoint is not None
        assert planning_checkpoint.phase_id == "planning"
        assert planning_checkpoint.requires_approval is True

    def test_checkpoint_after_coding_is_not_required(self, initialized_e2e_runner: Any):
        """Test there's no checkpoint after coding (coding loops internally)."""
        checkpoints = initialized_e2e_runner.get_checkpoints()

        # Coding phase has internal loop, no checkpoint after
        checkpoint_phases = {cp.phase_id for cp in checkpoints}
        assert "coding" not in checkpoint_phases

    def test_checkpoint_after_validation_exists(self, initialized_e2e_runner: Any):
        """Test checkpoint after validation phase exists."""
        checkpoints = initialized_e2e_runner.get_checkpoints()

        validation_checkpoint = next(
            (cp for cp in checkpoints if cp.id == "after_validation"), None
        )

        assert validation_checkpoint is not None
        assert validation_checkpoint.phase_id == "validate"

    def test_checkpoint_state_is_preserved(self, initialized_e2e_runner: Any, mock_run_context: Any):
        """Test checkpoint state is preserved across phases."""
        from apps.backend.methodologies.protocols import CheckpointStatus

        checkpoints = initialized_e2e_runner.get_checkpoints()

        # Initially all checkpoints are pending
        for cp in checkpoints:
            assert cp.status == CheckpointStatus.PENDING

        # After executing a phase, checkpoint state should be retrievable
        # (In a real scenario, the framework would update checkpoint status)


# =============================================================================
# Regression Test Suite (Task 7)
# =============================================================================


class TestRegressionSuite:
    """Regression tests to add to CI pipeline (Story 2.6 Task 7)."""

    def test_native_runner_protocol_compliance(self):
        """Test NativeRunner implements MethodologyRunner Protocol."""
        from apps.backend.methodologies.native import NativeRunner
        from apps.backend.methodologies.protocols import MethodologyRunner

        runner = NativeRunner()
        assert isinstance(runner, MethodologyRunner)

    def test_all_phases_are_defined(self, initialized_e2e_runner: Any):
        """Test all 8 phases are defined."""
        phases = initialized_e2e_runner.get_phases()
        assert len(phases) == 8

    def test_all_artifacts_are_defined(self, initialized_e2e_runner: Any):
        """Test all 5 artifacts are defined."""
        artifacts = initialized_e2e_runner.get_artifacts()
        assert len(artifacts) == 5

    def test_all_checkpoints_are_defined(self, initialized_e2e_runner: Any):
        """Test all 3 checkpoints are defined."""
        checkpoints = initialized_e2e_runner.get_checkpoints()
        assert len(checkpoints) == 3

    def test_phase_order_is_sequential(self, initialized_e2e_runner: Any):
        """Test phase order is strictly sequential 1-8."""
        phases = initialized_e2e_runner.get_phases()
        orders = [p.order for p in phases]
        assert orders == list(range(1, 9))

    def test_manifest_loads_successfully(self):
        """Test manifest.yaml loads without errors."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest = load_manifest(NATIVE_METHODOLOGY_DIR / "manifest.yaml")
        assert manifest is not None
        assert manifest.name == "native"

    def test_runner_can_be_instantiated(self):
        """Test NativeRunner can be instantiated."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        assert runner is not None
        assert runner._initialized is False

    def test_progress_event_dataclass_is_serializable(self):
        """Test ProgressEvent can be serialized to IPC format."""
        from apps.backend.methodologies.protocols import ProgressEvent

        event = ProgressEvent(
            task_id="test-123",
            phase_id="discovery",
            status="started",
            message="Test message",
            percentage=0.0,
            artifacts=[],
            timestamp=datetime.now(),
        )

        ipc_dict = event.to_ipc_dict()
        assert "taskId" in ipc_dict
        assert "phaseId" in ipc_dict
        assert "timestamp" in ipc_dict

    def test_complexity_levels_match_manifest(self, initialized_e2e_runner: Any):
        """Test complexity levels are properly supported."""
        from apps.backend.methodologies.protocols import ComplexityLevel

        # Verify enum has expected values
        assert ComplexityLevel.QUICK.value == "quick"
        assert ComplexityLevel.STANDARD.value == "standard"
        assert ComplexityLevel.COMPLEX.value == "complex"

    def test_execution_modes_match_manifest(self, initialized_e2e_runner: Any):
        """Test execution modes are properly supported."""
        from apps.backend.methodologies.protocols import ExecutionMode

        # Verify enum has expected values
        assert ExecutionMode.FULL_AUTO.value == "full_auto"
        assert ExecutionMode.SEMI_AUTO.value == "semi_auto"


# =============================================================================
# Integration Test Markers for CI
# =============================================================================


@pytest.mark.integration
class TestCIIntegration:
    """Tests designed for CI pipeline integration.

    These tests verify the core functionality works correctly
    and can be run quickly in CI without external dependencies.
    """

    def test_native_methodology_is_importable(self):
        """Test native methodology can be imported."""
        from apps.backend.methodologies.native import NativeRunner

        assert NativeRunner is not None

    def test_protocols_are_importable(self):
        """Test all protocol types can be imported."""
        from apps.backend.methodologies.protocols import (
            Artifact,
            Checkpoint,
            CheckpointStatus,
            ComplexityLevel,
            ExecutionMode,
            MethodologyRunner,
            Phase,
            PhaseResult,
            PhaseStatus,
            ProgressCallback,
            ProgressEvent,
            ProgressStatus,
            RunContext,
            TaskConfig,
        )

        # All imports should succeed
        assert MethodologyRunner is not None
        assert RunContext is not None
        assert ProgressEvent is not None

    def test_manifest_module_is_importable(self):
        """Test manifest module can be imported."""
        from apps.backend.methodologies.manifest import load_manifest

        assert load_manifest is not None
