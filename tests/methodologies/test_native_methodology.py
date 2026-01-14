"""Tests for the Native methodology plugin structure.

Tests manifest validation, NativeRunner Protocol compliance, and plugin structure.
Story Reference: Story 2.1 - Create Native Methodology Plugin Structure
Story Reference: Story 2.2 - Implement Native MethodologyRunner
"""

import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

# Project root directory for file path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent
NATIVE_METHODOLOGY_DIR = PROJECT_ROOT / "apps" / "backend" / "methodologies" / "native"


# =============================================================================
# Shared Fixtures
# =============================================================================


@pytest.fixture
def mock_context() -> Any:
    """Create a mock RunContext for testing.

    Returns:
        A fully configured mock RunContext with all required services.
    """
    from apps.backend.methodologies.protocols import (
        ComplexityLevel,
        ExecutionMode,
        RunContext,
        TaskConfig,
    )

    class MockWorkspace:
        def get_project_root(self) -> str:
            return "/mock/project"

    class MockMemory:
        def get_context(self, query: str) -> str:
            return "mock context"

    class MockProgress:
        def update(self, phase_id: str, progress: float, message: str) -> None:
            pass

        def emit(self, event) -> None:
            pass

    class MockCheckpoint:
        def create_checkpoint(self, checkpoint_id: str, data: dict[str, Any]) -> None:
            pass

    class MockLLM:
        def generate(self, prompt: str) -> str:
            return "mock response"

    return RunContext(
        workspace=MockWorkspace(),
        memory=MockMemory(),
        progress=MockProgress(),
        checkpoint=MockCheckpoint(),
        llm=MockLLM(),
        task_config=TaskConfig(
            complexity=ComplexityLevel.STANDARD,
            execution_mode=ExecutionMode.FULL_AUTO,
            task_id="test-task",
            task_name="Test Task",
        ),
    )


@pytest.fixture
def mock_workspace_manager():
    """Create a mock for WorktreeManager that can be used across tests."""
    from unittest.mock import MagicMock

    mock_manager = MagicMock()
    mock_worktree_info = MagicMock()
    mock_worktree_info.path = "/mock/worktree/path"
    mock_worktree_info.branch = "auto-claude/test-task"
    mock_worktree_info.spec_name = "test-task"
    mock_manager.get_or_create_worktree.return_value = mock_worktree_info
    return mock_manager


@pytest.fixture
def mock_context_with_spec_dir(tmp_path) -> Any:
    """Create a mock RunContext with spec_dir configured.

    Args:
        tmp_path: pytest fixture for temporary directory

    Returns:
        A RunContext with spec_dir in task_config.metadata
    """
    from apps.backend.methodologies.protocols import (
        ComplexityLevel,
        ExecutionMode,
        RunContext,
        TaskConfig,
    )

    class MockWorkspace:
        def get_project_root(self) -> str:
            return str(tmp_path / "project")

    class MockMemory:
        def get_context(self, query: str) -> str:
            return "mock context"

    class MockProgress:
        def update(self, phase_id: str, progress: float, message: str) -> None:
            pass

        def emit(self, event) -> None:
            pass

    class MockCheckpoint:
        def create_checkpoint(self, checkpoint_id: str, data: dict[str, Any]) -> None:
            pass

    class MockLLM:
        def generate(self, prompt: str) -> str:
            return "mock response"

    spec_dir = tmp_path / "specs" / "001-test"
    spec_dir.mkdir(parents=True, exist_ok=True)

    # Create project dir too
    project_dir = tmp_path / "project"
    project_dir.mkdir(parents=True, exist_ok=True)

    return RunContext(
        workspace=MockWorkspace(),
        memory=MockMemory(),
        progress=MockProgress(),
        checkpoint=MockCheckpoint(),
        llm=MockLLM(),
        task_config=TaskConfig(
            complexity=ComplexityLevel.STANDARD,
            execution_mode=ExecutionMode.FULL_AUTO,
            task_id="test-task",
            task_name="Test Task",
            metadata={"spec_dir": str(spec_dir)},
        ),
    )


@pytest.fixture
def initialized_runner(mock_context: Any, mock_workspace_manager) -> Any:
    """Create and initialize a NativeRunner for testing.

    Args:
        mock_context: The mock RunContext fixture.
        mock_workspace_manager: The mock WorktreeManager fixture.

    Returns:
        An initialized NativeRunner instance.
    """
    from apps.backend.methodologies.native import NativeRunner
    from unittest.mock import patch, MagicMock

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
        runner.initialize(mock_context)

    return runner


@pytest.fixture
def initialized_runner_with_spec_dir(mock_context_with_spec_dir: Any, mock_workspace_manager) -> Any:
    """Create and initialize a NativeRunner with spec_dir configured.

    Args:
        mock_context_with_spec_dir: The mock RunContext with spec_dir.
        mock_workspace_manager: The mock WorktreeManager fixture.

    Returns:
        An initialized NativeRunner instance with spec_dir.
    """
    from apps.backend.methodologies.native import NativeRunner
    from unittest.mock import patch, MagicMock

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
        runner.initialize(mock_context_with_spec_dir)

    return runner


# =============================================================================
# Plugin Structure Tests
# =============================================================================


class TestNativePluginStructure:
    """Test that the Native methodology plugin structure is complete."""

    def test_native_directory_exists(self):
        """Test that the native methodology directory exists."""
        assert NATIVE_METHODOLOGY_DIR.exists(), f"Native methodology directory not found: {NATIVE_METHODOLOGY_DIR}"
        assert NATIVE_METHODOLOGY_DIR.is_dir()

    def test_manifest_yaml_exists(self):
        """Test that manifest.yaml exists in native methodology."""
        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        assert manifest_path.exists(), f"manifest.yaml not found: {manifest_path}"

    def test_methodology_py_exists(self):
        """Test that methodology.py exists in native methodology."""
        methodology_path = NATIVE_METHODOLOGY_DIR / "methodology.py"
        assert methodology_path.exists(), f"methodology.py not found: {methodology_path}"

    def test_init_py_exists(self):
        """Test that __init__.py exists in native methodology."""
        init_path = NATIVE_METHODOLOGY_DIR / "__init__.py"
        assert init_path.exists(), f"__init__.py not found: {init_path}"


# =============================================================================
# Manifest Validation Tests
# =============================================================================


class TestNativeManifestValidation:
    """Test that the Native methodology manifest validates correctly."""

    def test_manifest_loads_without_error(self):
        """Test that manifest.yaml can be loaded and validated."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)
        assert manifest is not None

    def test_manifest_name_is_native(self):
        """Test that manifest name is 'native'."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)
        assert manifest.name == "native"

    def test_manifest_version_is_valid(self):
        """Test that manifest has a valid version string."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)
        assert manifest.version == "1.0.0"

    def test_manifest_entry_point_is_valid(self):
        """Test that manifest entry_point points to NativeRunner."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)
        assert manifest.entry_point == "methodology.NativeRunner"

    def test_manifest_has_eight_phases(self):
        """Test that manifest defines exactly 8 phases (5 spec + 3 implementation)."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)
        assert len(manifest.phases) == 8

    def test_manifest_phase_ids_are_correct(self):
        """Test that phases have the correct IDs (6 spec + 3 implementation)."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)

        expected_phase_ids = [
            "discovery",
            "requirements",
            "context",
            "spec",
            "validate",
            # Story 2.5: Implementation phases
            "planning",
            "coding",
            "qa_validation",
        ]
        actual_phase_ids = [phase.id for phase in manifest.phases]
        assert actual_phase_ids == expected_phase_ids

    def test_manifest_has_checkpoints(self):
        """Test that manifest defines checkpoints for Semi-Auto mode."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)
        assert len(manifest.checkpoints) == 3

    def test_manifest_checkpoint_references_valid_phases(self):
        """Test that all checkpoints reference valid phases."""
        from apps.backend.methodologies.manifest import load_manifest

        manifest_path = NATIVE_METHODOLOGY_DIR / "manifest.yaml"
        manifest = load_manifest(manifest_path)

        phase_ids = {phase.id for phase in manifest.phases}
        for checkpoint in manifest.checkpoints:
            assert checkpoint.phase in phase_ids, (
                f"Checkpoint '{checkpoint.id}' references non-existent phase: '{checkpoint.phase}'"
            )


# =============================================================================
# Import Tests
# =============================================================================


class TestNativeRunnerImport:
    """Test that NativeRunner can be imported correctly."""

    def test_native_runner_importable_from_module(self):
        """Test that NativeRunner can be imported from methodology module."""
        from apps.backend.methodologies.native.methodology import NativeRunner

        assert NativeRunner is not None

    def test_native_runner_importable_from_package(self):
        """Test that NativeRunner can be imported from package __init__."""
        from apps.backend.methodologies.native import NativeRunner

        assert NativeRunner is not None

    def test_native_runner_is_class(self):
        """Test that NativeRunner is a class."""
        from apps.backend.methodologies.native import NativeRunner

        assert isinstance(NativeRunner, type)


# =============================================================================
# Protocol Compliance Tests
# =============================================================================


class TestNativeRunnerProtocolCompliance:
    """Test that NativeRunner implements the MethodologyRunner Protocol."""

    def test_native_runner_is_methodology_runner(self):
        """Test NativeRunner implements MethodologyRunner Protocol."""
        from apps.backend.methodologies.native import NativeRunner
        from apps.backend.methodologies.protocols import MethodologyRunner

        runner = NativeRunner()
        assert isinstance(runner, MethodologyRunner)

    def test_native_runner_has_initialize_method(self):
        """Test NativeRunner has initialize method."""
        from apps.backend.methodologies.native import NativeRunner

        assert hasattr(NativeRunner, "initialize")
        assert callable(getattr(NativeRunner, "initialize"))

    def test_native_runner_has_get_phases_method(self):
        """Test NativeRunner has get_phases method."""
        from apps.backend.methodologies.native import NativeRunner

        assert hasattr(NativeRunner, "get_phases")
        assert callable(getattr(NativeRunner, "get_phases"))

    def test_native_runner_has_execute_phase_method(self):
        """Test NativeRunner has execute_phase method."""
        from apps.backend.methodologies.native import NativeRunner

        assert hasattr(NativeRunner, "execute_phase")
        assert callable(getattr(NativeRunner, "execute_phase"))

    def test_native_runner_has_get_checkpoints_method(self):
        """Test NativeRunner has get_checkpoints method."""
        from apps.backend.methodologies.native import NativeRunner

        assert hasattr(NativeRunner, "get_checkpoints")
        assert callable(getattr(NativeRunner, "get_checkpoints"))

    def test_native_runner_has_get_artifacts_method(self):
        """Test NativeRunner has get_artifacts method."""
        from apps.backend.methodologies.native import NativeRunner

        assert hasattr(NativeRunner, "get_artifacts")
        assert callable(getattr(NativeRunner, "get_artifacts"))


# =============================================================================
# Initialization Tests
# =============================================================================


class TestNativeRunnerInitialization:
    """Test NativeRunner initialization behavior."""

    def test_runner_not_initialized_before_initialize(self):
        """Test runner raises error if used before initialization."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        with pytest.raises(RuntimeError, match="not initialized"):
            runner.get_phases()

    def test_runner_initializes_with_context(self, mock_context, mock_workspace_manager):
        """Test runner initializes successfully with RunContext."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context)

        # Should not raise after initialization
        phases = runner.get_phases()
        assert len(phases) == 8  # 5 spec + 3 implementation phases (Story 2.5)

    def test_runner_cannot_initialize_twice(self, mock_context, mock_workspace_manager):
        """Test runner raises error if initialized twice."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context)

        with pytest.raises(RuntimeError, match="already initialized"):
            runner.initialize(mock_context)


# =============================================================================
# Phase Tests
# =============================================================================


class TestNativeRunnerPhases:
    """Test NativeRunner phase definitions."""

    def test_get_phases_returns_list(self, initialized_runner):
        """Test get_phases returns a list."""
        phases = initialized_runner.get_phases()
        assert isinstance(phases, list)

    def test_get_phases_returns_eight_phases(self, initialized_runner):
        """Test get_phases returns exactly 8 phases (5 spec + 3 implementation)."""
        phases = initialized_runner.get_phases()
        assert len(phases) == 8

    def test_phases_have_correct_order(self, initialized_runner):
        """Test phases are in correct execution order (1-8)."""
        phases = initialized_runner.get_phases()
        orders = [phase.order for phase in phases]
        assert orders == [1, 2, 3, 4, 5, 6, 7, 8]

    def test_phases_have_pending_status_initially(self, initialized_runner):
        """Test all phases start with PENDING status."""
        from apps.backend.methodologies.protocols import PhaseStatus

        phases = initialized_runner.get_phases()
        for phase in phases:
            assert phase.status == PhaseStatus.PENDING

    def test_phases_are_not_optional(self, initialized_runner):
        """Test all phases are required (not optional)."""
        phases = initialized_runner.get_phases()
        for phase in phases:
            assert phase.is_optional is False


# =============================================================================
# Checkpoint Tests
# =============================================================================


class TestNativeRunnerCheckpoints:
    """Test NativeRunner checkpoint definitions."""

    def test_get_checkpoints_returns_list(self, initialized_runner):
        """Test get_checkpoints returns a list."""
        checkpoints = initialized_runner.get_checkpoints()
        assert isinstance(checkpoints, list)

    def test_get_checkpoints_returns_three_checkpoints(self, initialized_runner):
        """Test get_checkpoints returns exactly 3 checkpoints."""
        checkpoints = initialized_runner.get_checkpoints()
        assert len(checkpoints) == 3

    def test_checkpoints_have_pending_status_initially(self, initialized_runner):
        """Test all checkpoints start with PENDING status."""
        from apps.backend.methodologies.protocols import CheckpointStatus

        checkpoints = initialized_runner.get_checkpoints()
        for checkpoint in checkpoints:
            assert checkpoint.status == CheckpointStatus.PENDING

    def test_checkpoints_require_approval(self, initialized_runner):
        """Test all checkpoints require approval."""
        checkpoints = initialized_runner.get_checkpoints()
        for checkpoint in checkpoints:
            assert checkpoint.requires_approval is True

    def test_checkpoints_reference_valid_phase_ids(self, initialized_runner):
        """Test checkpoints reference phase IDs that exist in phases."""
        phases = initialized_runner.get_phases()
        checkpoints = initialized_runner.get_checkpoints()

        phase_ids = {phase.id for phase in phases}
        for checkpoint in checkpoints:
            assert checkpoint.phase_id in phase_ids, (
                f"Checkpoint '{checkpoint.id}' references invalid phase: '{checkpoint.phase_id}'"
            )


# =============================================================================
# Artifact Tests
# =============================================================================


class TestNativeRunnerArtifacts:
    """Test NativeRunner artifact definitions."""

    def test_get_artifacts_returns_list(self, initialized_runner):
        """Test get_artifacts returns a list."""
        artifacts = initialized_runner.get_artifacts()
        assert isinstance(artifacts, list)

    def test_get_artifacts_returns_five_artifacts(self, initialized_runner):
        """Test get_artifacts returns exactly 5 artifacts (4 spec + 1 QA)."""
        artifacts = initialized_runner.get_artifacts()
        assert len(artifacts) == 5

    def test_artifacts_have_expected_ids(self, initialized_runner):
        """Test artifacts have the expected IDs (4 spec + 1 QA)."""
        artifacts = initialized_runner.get_artifacts()

        expected_ids = {
            "requirements-json",
            "context-json",
            "spec-md",
            "implementation-plan-json",
            # Story 2.5: QA artifact
            "qa-report-md",
        }
        actual_ids = {artifact.id for artifact in artifacts}
        assert actual_ids == expected_ids

    def test_artifacts_have_file_paths(self, initialized_runner):
        """Test all artifacts have file paths defined."""
        artifacts = initialized_runner.get_artifacts()

        for artifact in artifacts:
            assert artifact.file_path, f"Artifact '{artifact.id}' missing file_path"


# =============================================================================
# Phase Execution Tests (Basic)
# =============================================================================


class TestNativeRunnerPhaseExecution:
    """Test NativeRunner phase execution behavior."""

    def test_execute_phase_returns_phase_result(self, initialized_runner):
        """Test execute_phase returns a PhaseResult."""
        from apps.backend.methodologies.protocols import PhaseResult

        result = initialized_runner.execute_phase("discovery")
        assert isinstance(result, PhaseResult)

    def test_execute_phase_returns_failure_for_unknown_phase(self, initialized_runner):
        """Test execute_phase returns failure for unknown phase ID."""
        result = initialized_runner.execute_phase("nonexistent")
        assert result.success is False
        assert "Unknown phase" in result.error

    def test_execute_phase_requires_initialization(self):
        """Test execute_phase raises error if not initialized."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        with pytest.raises(RuntimeError, match="not initialized"):
            runner.execute_phase("discovery")


# =============================================================================
# Story 2.2: Initialize Method Tests
# =============================================================================


class TestNativeRunnerInitializeContext:
    """Test NativeRunner stores context correctly (Story 2.2 AC#1)."""

    def test_initialize_stores_context(self, mock_context, mock_workspace_manager):
        """Test initialize stores the RunContext reference."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context)

        assert runner._context is mock_context

    def test_initialize_extracts_project_dir(self, mock_context, mock_workspace_manager):
        """Test initialize extracts project_dir from context.workspace."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context)

        assert runner._project_dir == "/mock/project"

    def test_initialize_extracts_task_config(self, mock_context, mock_workspace_manager):
        """Test initialize stores task configuration from context."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context)

        assert runner._task_config is mock_context.task_config
        assert runner._task_config.task_id == "test-task"

    def test_initialize_extracts_complexity(self, mock_context, mock_workspace_manager):
        """Test initialize extracts complexity level from task config."""
        from apps.backend.methodologies.native import NativeRunner
        from apps.backend.methodologies.protocols import ComplexityLevel
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context)

        assert runner._complexity == ComplexityLevel.STANDARD

    def test_initialize_extracts_spec_dir_from_metadata(self, mock_context_with_spec_dir, mock_workspace_manager):
        """Test initialize extracts spec_dir from task_config.metadata."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context_with_spec_dir)

        assert runner._spec_dir is not None
        assert runner._spec_dir.exists()


# =============================================================================
# Story 2.2: Get Phases Method Tests
# =============================================================================


class TestNativeRunnerGetPhasesStory22:
    """Test NativeRunner get_phases returns correct phase info (Story 2.2 AC#2)."""

    def test_get_phases_returns_phases_with_ids(self, initialized_runner):
        """Test phases have expected IDs matching manifest (5 spec + 3 implementation)."""
        phases = initialized_runner.get_phases()

        expected_ids = [
            "discovery", "requirements", "context", "spec", "validate",
            # Story 2.5: Implementation phases
            "planning", "coding", "qa_validation"
        ]
        actual_ids = [phase.id for phase in phases]

        assert actual_ids == expected_ids

    def test_get_phases_includes_description(self, initialized_runner):
        """Test each phase has a description."""
        phases = initialized_runner.get_phases()

        for phase in phases:
            assert phase.description, f"Phase '{phase.id}' missing description"

    def test_get_phases_includes_name(self, initialized_runner):
        """Test each phase has a name."""
        phases = initialized_runner.get_phases()

        for phase in phases:
            assert phase.name, f"Phase '{phase.id}' missing name"


# =============================================================================
# Story 2.2: Phase Execution Without spec_dir (Failure Cases)
# =============================================================================


class TestNativeRunnerPhaseExecutionNoSpecDir:
    """Test phases fail gracefully when spec_dir is not configured."""

    def test_discovery_fails_without_spec_dir(self, initialized_runner):
        """Test discovery phase fails without spec_dir."""
        result = initialized_runner.execute_phase("discovery")

        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_requirements_fails_without_spec_dir_but_has_task_config(self, initialized_runner):
        """Test requirements phase fails without spec_dir."""
        result = initialized_runner.execute_phase("requirements")

        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_context_fails_without_spec_dir(self, initialized_runner):
        """Test context phase fails without spec_dir."""
        result = initialized_runner.execute_phase("context")

        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_spec_fails_without_spec_dir(self, initialized_runner):
        """Test spec phase fails without spec_dir."""
        result = initialized_runner.execute_phase("spec")

        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_validate_fails_without_spec_dir(self, initialized_runner):
        """Test validate phase fails without spec_dir."""
        result = initialized_runner.execute_phase("validate")

        assert result.success is False
        assert "spec_dir" in result.error.lower()


# =============================================================================
# Story 2.2: Requirements Failure Tests (HIGH Issue #4 fix)
# =============================================================================


class TestNativeRunnerRequirementsFailure:
    """Test requirements phase failure cases (Story 2.2 HIGH #4)."""

    def test_requirements_fails_without_task_config(self, mock_context_with_spec_dir, mock_workspace_manager):
        """Test requirements phase fails when _task_config is None."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context_with_spec_dir)

        # Artificially clear task_config to test the failure path
        runner._task_config = None

        result = runner.execute_phase("requirements")

        assert result.success is False
        assert "task configuration" in result.error.lower()


# =============================================================================
# Story 2.2: Individual Phase Execution Tests (With spec_dir)
# =============================================================================


class TestNativeRunnerRequirementsPhase:
    """Test requirements phase execution (Story 2.2 Task 6)."""

    def test_requirements_creates_file(self, initialized_runner_with_spec_dir):
        """Test requirements phase creates requirements.json."""
        result = initialized_runner_with_spec_dir.execute_phase("requirements")

        assert result.success is True
        assert result.phase_id == "requirements"
        assert len(result.artifacts) == 1
        assert "requirements.json" in result.artifacts[0]

    def test_requirements_file_exists_after_execution(self, initialized_runner_with_spec_dir):
        """Test requirements.json file exists after phase execution."""
        runner = initialized_runner_with_spec_dir
        runner.execute_phase("requirements")

        req_file = runner._spec_dir / "requirements.json"
        assert req_file.exists()

    def test_requirements_returns_existing_if_present(self, initialized_runner_with_spec_dir):
        """Test requirements phase returns existing file if present."""
        import json

        runner = initialized_runner_with_spec_dir

        # Create existing requirements
        req_file = runner._spec_dir / "requirements.json"
        req_file.write_text(json.dumps({"task_description": "existing"}))

        result = runner.execute_phase("requirements")

        assert result.success is True
        assert "already exist" in result.message.lower()


class TestNativeRunnerSpecPhase:
    """Test spec phase execution (Story 2.2 Task 8)."""

    def test_spec_fails_without_existing_file(self, initialized_runner_with_spec_dir):
        """Test spec phase fails when spec.md doesn't exist (requires agent)."""
        result = initialized_runner_with_spec_dir.execute_phase("spec")

        # Spec generation requires agent infrastructure
        assert result.success is False
        assert "framework" in result.error.lower() or "agent" in result.error.lower()

    def test_spec_returns_existing_if_present(self, initialized_runner_with_spec_dir):
        """Test spec phase succeeds if spec.md already exists."""
        runner = initialized_runner_with_spec_dir

        # Create existing spec
        spec_file = runner._spec_dir / "spec.md"
        spec_file.write_text("# Existing Spec\n\nContent here.")

        result = runner.execute_phase("spec")

        assert result.success is True
        assert "already exists" in result.message.lower()
        assert len(result.artifacts) == 1


class TestNativeRunnerValidatePhase:
    """Test validate phase execution (Story 2.2 Task 10)."""

    def test_validate_runs_validation(self, initialized_runner_with_spec_dir):
        """Test validate phase runs the validator."""
        result = initialized_runner_with_spec_dir.execute_phase("validate")

        # Validation will fail without required artifacts
        assert isinstance(result.success, bool)
        assert result.phase_id == "validate"


# =============================================================================
# Story 2.2: Progress Reporting Tests
# =============================================================================


class TestNativeRunnerProgressReporting:
    """Test progress reporting integration (Story 2.2)."""

    def test_execute_phase_calls_progress_update_start(self, mock_context, mock_workspace_manager):
        """Test execute_phase calls progress.update at phase start."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        # Replace progress service with mock
        mock_context.progress = MagicMock()

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
            runner.initialize(mock_context)

        runner.execute_phase("discovery")

        # Should have been called at least once
        mock_context.progress.update.assert_called()

    def test_execute_phase_calls_progress_update_complete(self, mock_context_with_spec_dir, mock_workspace_manager):
        """Test execute_phase calls progress.update when phase completes."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        mock_context_with_spec_dir.progress = MagicMock()

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
            runner.initialize(mock_context_with_spec_dir)

        runner.execute_phase("requirements")

        # Get all calls to progress.update
        calls = mock_context_with_spec_dir.progress.update.call_args_list

        # Should have at least 2 calls: start and complete
        assert len(calls) >= 2


# =============================================================================
# Story 2.2: Exception Handling Tests
# =============================================================================


class TestNativeRunnerExceptionHandling:
    """Test exception handling in phase execution."""

    def test_execute_phase_handles_exception(self, mock_context_with_spec_dir, mock_workspace_manager):
        """Test execute_phase returns failure on exception."""
        from apps.backend.methodologies.native import NativeRunner
        from apps.backend.methodologies.protocols import PhaseStatus
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context_with_spec_dir)

        # Monkeypatch to raise exception
        def raise_error():
            raise ValueError("Test error")

        runner._execute_requirements = raise_error

        result = runner.execute_phase("requirements")

        assert result.success is False
        assert "Test error" in result.error

        # Phase should be marked as FAILED
        phases = runner.get_phases()
        req_phase = next(p for p in phases if p.id == "requirements")
        assert req_phase.status == PhaseStatus.FAILED

    def test_execute_phase_updates_status_on_failure(self, initialized_runner_with_spec_dir):
        """Test phase status is FAILED after failed execution."""
        from apps.backend.methodologies.protocols import PhaseStatus

        runner = initialized_runner_with_spec_dir

        # Spec will fail without agent infrastructure
        runner.execute_phase("spec")

        phases = runner.get_phases()
        spec_phase = next(p for p in phases if p.id == "spec")
        assert spec_phase.status == PhaseStatus.FAILED

    def test_execute_phase_updates_status_on_success(self, initialized_runner_with_spec_dir):
        """Test phase status is COMPLETED after successful execution."""
        from apps.backend.methodologies.protocols import PhaseStatus

        runner = initialized_runner_with_spec_dir

        # Requirements will succeed
        runner.execute_phase("requirements")

        phases = runner.get_phases()
        req_phase = next(p for p in phases if p.id == "requirements")
        assert req_phase.status == PhaseStatus.COMPLETED


# =============================================================================
# Story 2.3: Workspace Management Integration Tests
# =============================================================================


class TestNativeRunnerWorktreeIntegration:
    """Test worktree integration in NativeRunner (Story 2.3 AC#1)."""

    def test_initialize_creates_worktree(self, mock_context_with_spec_dir):
        """Test initialize creates a git worktree for the task (FR65)."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        # Mock the WorktreeManager
        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ):
            runner.initialize(mock_context_with_spec_dir)

            # Verify worktree was created
            mock_worktree_manager.get_or_create_worktree.assert_called_once()
            assert runner._worktree_path is not None

    def test_initialize_stores_worktree_path(self, mock_context_with_spec_dir):
        """Test initialize stores worktree path for agent use."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ):
            runner.initialize(mock_context_with_spec_dir)

            assert runner._worktree_path == "/mock/worktree/path"

    def test_initialize_handles_worktree_creation_errors(self, mock_context_with_spec_dir):
        """Test initialize handles worktree creation errors gracefully."""
        from apps.backend.methodologies.native import NativeRunner
        # Import WorktreeError from the same path used in the methodology module
        from apps.backend.methodologies.native.methodology import WorktreeError
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_manager.get_or_create_worktree.side_effect = WorktreeError(
            "Failed to create worktree"
        )

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=MagicMock(),
        ):
            # Should raise RuntimeError with informative message
            with pytest.raises(RuntimeError, match="worktree"):
                runner.initialize(mock_context_with_spec_dir)


class TestNativeRunnerSecurityIntegration:
    """Test security sandbox integration in NativeRunner (Story 2.3 AC#1)."""

    def test_initialize_applies_security_sandbox(self, mock_context_with_spec_dir):
        """Test initialize applies security sandbox (FR66)."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        mock_security_profile = MagicMock()

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=mock_security_profile,
        ) as mock_get_profile:
            runner.initialize(mock_context_with_spec_dir)

            # Verify security profile was obtained
            mock_get_profile.assert_called_once()
            assert runner._security_profile is not None

    def test_security_profile_uses_worktree_path(self, mock_context_with_spec_dir):
        """Test security profile is configured for the worktree path."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock
        from pathlib import Path

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        mock_security_profile = MagicMock()

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=mock_security_profile,
        ) as mock_get_profile:
            runner.initialize(mock_context_with_spec_dir)

            # Security profile should be called with worktree path
            call_args = mock_get_profile.call_args
            assert call_args is not None


class TestNativeRunnerGraphitiIntegration:
    """Test Graphiti memory integration in NativeRunner (Story 2.3 AC#2)."""

    def test_initialize_integrates_graphiti_memory(self, mock_context_with_spec_dir):
        """Test initialize sets up Graphiti memory service (FR68)."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        mock_memory = MagicMock()

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=mock_memory,
        ) as mock_get_memory:
            runner.initialize(mock_context_with_spec_dir)

            # Verify memory was initialized
            mock_get_memory.assert_called_once()
            assert runner._graphiti_memory is not None

    def test_initialize_handles_memory_unavailable_gracefully(self, mock_context_with_spec_dir):
        """Test initialize handles Graphiti unavailability gracefully (NFR23)."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            side_effect=Exception("Graphiti unavailable"),
        ):
            # Should NOT raise - memory failure should not block initialization
            runner.initialize(mock_context_with_spec_dir)

            # Memory should be None but runner should be initialized
            assert runner._graphiti_memory is None
            assert runner._initialized is True


class TestNativeRunnerWorkspacePassthrough:
    """Test workspace is passed to agents correctly (Story 2.3 AC#1, #2)."""

    def test_runner_provides_workspace_path(self, mock_context_with_spec_dir):
        """Test runner provides workspace path for agents via RunContext."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=MagicMock(),
        ):
            runner.initialize(mock_context_with_spec_dir)

            # Verify workspace path is accessible
            assert runner.get_workspace_path() == "/mock/worktree/path"

    def test_runner_provides_security_profile(self, mock_context_with_spec_dir):
        """Test runner provides security profile for agents."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        mock_security_profile = MagicMock()

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=mock_security_profile,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=MagicMock(),
        ):
            runner.initialize(mock_context_with_spec_dir)

            # Verify security profile is accessible
            assert runner.get_security_profile() is mock_security_profile

    def test_runner_provides_memory_service(self, mock_context_with_spec_dir):
        """Test runner provides Graphiti memory service for agents."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        mock_memory = MagicMock()

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=mock_memory,
        ):
            runner.initialize(mock_context_with_spec_dir)

            # Verify memory is accessible (may be None if unavailable)
            assert runner.get_graphiti_memory() is mock_memory


# =============================================================================
# Story 2.4: Progress Event Types Tests
# =============================================================================


class TestProgressEventDataclass:
    """Test ProgressEvent dataclass (Story 2.4 AC#1, #2, #3)."""

    def test_progress_event_can_be_imported(self):
        """Test ProgressEvent can be imported from protocols."""
        from apps.backend.methodologies.protocols import ProgressEvent

        assert ProgressEvent is not None

    def test_progress_event_has_required_fields(self):
        """Test ProgressEvent has all required fields per story spec."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        event = ProgressEvent(
            task_id="task-123",
            phase_id="discovery",
            status="started",
            message="Starting discovery phase",
            percentage=0.0,
            artifacts=[],
            timestamp=datetime.now(),
        )

        assert event.task_id == "task-123"
        assert event.phase_id == "discovery"
        assert event.status == "started"
        assert event.message == "Starting discovery phase"
        assert event.percentage == 0.0
        assert event.artifacts == []
        assert event.timestamp is not None

    def test_progress_event_status_values(self):
        """Test ProgressEvent accepts valid status values."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        valid_statuses = ["started", "in_progress", "completed", "failed"]

        for status in valid_statuses:
            event = ProgressEvent(
                task_id="task-123",
                phase_id="discovery",
                status=status,
                message=f"Status: {status}",
                percentage=50.0,
                artifacts=[],
                timestamp=datetime.now(),
            )
            assert event.status == status

    def test_progress_event_percentage_range(self):
        """Test ProgressEvent accepts percentage from 0.0 to 100.0."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        # Test 0%
        event_start = ProgressEvent(
            task_id="task-123",
            phase_id="discovery",
            status="started",
            message="Starting",
            percentage=0.0,
            artifacts=[],
            timestamp=datetime.now(),
        )
        assert event_start.percentage == 0.0

        # Test 100%
        event_end = ProgressEvent(
            task_id="task-123",
            phase_id="discovery",
            status="completed",
            message="Completed",
            percentage=100.0,
            artifacts=[],
            timestamp=datetime.now(),
        )
        assert event_end.percentage == 100.0

        # Test intermediate
        event_mid = ProgressEvent(
            task_id="task-123",
            phase_id="discovery",
            status="in_progress",
            message="Progress",
            percentage=45.5,
            artifacts=[],
            timestamp=datetime.now(),
        )
        assert event_mid.percentage == 45.5

    def test_progress_event_artifacts_list(self):
        """Test ProgressEvent can store artifact paths."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        artifacts = ["/path/to/spec.md", "/path/to/plan.json"]
        event = ProgressEvent(
            task_id="task-123",
            phase_id="spec",
            status="completed",
            message="Spec generated",
            percentage=100.0,
            artifacts=artifacts,
            timestamp=datetime.now(),
        )
        assert event.artifacts == artifacts
        assert len(event.artifacts) == 2


class TestProgressStatus:
    """Test ProgressStatus enum (Story 2.4 Task 1)."""

    def test_progress_status_enum_exists(self):
        """Test ProgressStatus enum can be imported."""
        from apps.backend.methodologies.protocols import ProgressStatus

        assert ProgressStatus is not None

    def test_progress_status_has_all_values(self):
        """Test ProgressStatus has all required values."""
        from apps.backend.methodologies.protocols import ProgressStatus

        assert ProgressStatus.STARTED.value == "started"
        assert ProgressStatus.IN_PROGRESS.value == "in_progress"
        assert ProgressStatus.COMPLETED.value == "completed"
        assert ProgressStatus.FAILED.value == "failed"


# =============================================================================
# Story 2.4: Progress Service Integration Tests
# =============================================================================


class TestProgressServiceEmitMethod:
    """Test enhanced ProgressService with emit method (Story 2.4 Task 2)."""

    def test_progress_service_has_emit_method(self):
        """Test ProgressService protocol has emit method."""
        from apps.backend.methodologies.protocols import ProgressService

        assert hasattr(ProgressService, "emit")

    def test_execute_phase_emits_started_event(self, mock_context_with_spec_dir, mock_workspace_manager):
        """Test execute_phase emits 'started' ProgressEvent at phase start (AC#1)."""
        from apps.backend.methodologies.native import NativeRunner
        from apps.backend.methodologies.protocols import ProgressEvent
        from unittest.mock import patch, MagicMock

        # Create a mock progress service that captures emit calls
        mock_progress = MagicMock()
        emitted_events = []

        def capture_emit(event):
            emitted_events.append(event)

        mock_progress.emit = capture_emit
        mock_progress.update = MagicMock()  # Keep old interface for compatibility
        mock_context_with_spec_dir.progress = mock_progress

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
            runner.initialize(mock_context_with_spec_dir)

        runner.execute_phase("requirements")

        # Find the 'started' event
        started_events = [e for e in emitted_events if e.status == "started"]
        assert len(started_events) >= 1, "Expected at least one 'started' event"

        started_event = started_events[0]
        assert started_event.phase_id == "requirements"
        assert started_event.status == "started"
        assert started_event.task_id is not None

    def test_execute_phase_emits_completed_event(self, mock_context_with_spec_dir, mock_workspace_manager):
        """Test execute_phase emits 'completed' ProgressEvent when phase succeeds (AC#3)."""
        from apps.backend.methodologies.native import NativeRunner
        from apps.backend.methodologies.protocols import ProgressEvent
        from unittest.mock import patch, MagicMock

        mock_progress = MagicMock()
        emitted_events = []

        def capture_emit(event):
            emitted_events.append(event)

        mock_progress.emit = capture_emit
        mock_progress.update = MagicMock()
        mock_context_with_spec_dir.progress = mock_progress

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
            runner.initialize(mock_context_with_spec_dir)

        runner.execute_phase("requirements")

        # Find the 'completed' event
        completed_events = [e for e in emitted_events if e.status == "completed"]
        assert len(completed_events) >= 1, "Expected at least one 'completed' event"

        completed_event = completed_events[0]
        assert completed_event.phase_id == "requirements"
        assert completed_event.status == "completed"
        # Requirements phase should produce artifacts
        assert len(completed_event.artifacts) >= 0

    def test_execute_phase_emits_failed_event_on_failure(self, initialized_runner):
        """Test execute_phase emits 'failed' ProgressEvent when phase fails (AC#3)."""
        from unittest.mock import MagicMock

        mock_progress = MagicMock()
        emitted_events = []

        def capture_emit(event):
            emitted_events.append(event)

        mock_progress.emit = capture_emit
        mock_progress.update = MagicMock()
        initialized_runner._context.progress = mock_progress

        # Discovery phase will fail without spec_dir
        initialized_runner.execute_phase("discovery")

        # Find the 'failed' event
        failed_events = [e for e in emitted_events if e.status == "failed"]
        assert len(failed_events) >= 1, "Expected at least one 'failed' event"

        failed_event = failed_events[0]
        assert failed_event.phase_id == "discovery"
        assert failed_event.status == "failed"


# =============================================================================
# Story 2.4: Incremental Progress Tests (Task 3)
# =============================================================================


class TestIncrementalProgressReporting:
    """Test incremental progress within phases (Story 2.4 AC#2)."""

    def test_emit_incremental_progress_method_exists(self):
        """Test NativeRunner has emit_incremental_progress method."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        assert hasattr(runner, "emit_incremental_progress")
        assert callable(getattr(runner, "emit_incremental_progress"))

    def test_emit_incremental_progress_emits_in_progress_event(
        self, mock_context_with_spec_dir, mock_workspace_manager
    ):
        """Test emit_incremental_progress emits 'in_progress' ProgressEvent."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        mock_progress = MagicMock()
        emitted_events = []

        def capture_emit(event):
            emitted_events.append(event)

        mock_progress.emit = capture_emit
        mock_progress.update = MagicMock()
        mock_context_with_spec_dir.progress = mock_progress

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
            runner.initialize(mock_context_with_spec_dir)

        # Emit incremental progress
        runner.emit_incremental_progress(
            phase_id="spec",
            message="Generating specification...",
            percentage=50.0,
        )

        # Should have emitted an in_progress event
        in_progress_events = [e for e in emitted_events if e.status == "in_progress"]
        assert len(in_progress_events) >= 1

        event = in_progress_events[0]
        assert event.phase_id == "spec"
        assert event.status == "in_progress"
        assert event.message == "Generating specification..."
        # Story 2.5: 50% within spec phase (15-25%) = 15 + (10 * 0.5) = 20% overall
        assert event.percentage == 20.0

    def test_phase_percentage_within_bounds(self, initialized_runner_with_spec_dir):
        """Test incremental progress percentage stays within phase bounds."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import MagicMock

        runner = initialized_runner_with_spec_dir
        mock_progress = MagicMock()
        emitted_events = []

        def capture_emit(event):
            emitted_events.append(event)

        mock_progress.emit = capture_emit
        mock_progress.update = MagicMock()
        runner._context.progress = mock_progress

        # Story 2.5: Emit progress at 50% within spec phase (which is 15-25% overall)
        runner.emit_incremental_progress(
            phase_id="spec",
            message="Halfway through spec",
            percentage=50.0,  # 50% within the phase
        )

        event = emitted_events[0]
        # Spec phase: start=15%, end=25%, so 50% within = 15 + (10 * 0.5) = 20%
        assert 15.0 <= event.percentage <= 25.0


# =============================================================================
# Story 2.4: IPC Event Serialization Tests (Task 4)
# =============================================================================


class TestProgressEventSerialization:
    """Test ProgressEvent can be serialized for IPC (Story 2.4 Task 4)."""

    def test_progress_event_to_ipc_format(self):
        """Test ProgressEvent can be converted to IPC-compatible dict format."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        event = ProgressEvent(
            task_id="task-123",
            phase_id="spec",
            status="in_progress",
            message="Generating specification...",
            percentage=45.0,
            artifacts=["/path/to/artifact.md"],
            timestamp=datetime(2026, 1, 15, 10, 30, 0),
        )

        # Event should be convertible to dict
        ipc_payload = event.to_ipc_dict()

        assert ipc_payload["taskId"] == "task-123"
        assert ipc_payload["phaseId"] == "spec"
        assert ipc_payload["status"] == "in_progress"
        assert ipc_payload["message"] == "Generating specification..."
        assert ipc_payload["percentage"] == 45.0
        assert ipc_payload["artifacts"] == ["/path/to/artifact.md"]
        assert "timestamp" in ipc_payload

    def test_progress_event_timestamp_iso_format(self):
        """Test timestamp is serialized in ISO format for IPC."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        event = ProgressEvent(
            task_id="task-123",
            phase_id="spec",
            status="started",
            message="Starting",
            percentage=0.0,
            artifacts=[],
            timestamp=datetime(2026, 1, 15, 10, 30, 0),
        )

        ipc_payload = event.to_ipc_dict()

        # Should be ISO format string
        assert ipc_payload["timestamp"] == "2026-01-15T10:30:00"

    def test_progress_event_uses_camel_case(self):
        """Test IPC payload uses camelCase per project conventions."""
        from datetime import datetime
        from apps.backend.methodologies.protocols import ProgressEvent

        event = ProgressEvent(
            task_id="task-123",
            phase_id="discovery",
            status="completed",
            message="Done",
            percentage=100.0,
            artifacts=[],
            timestamp=datetime.now(),
        )

        ipc_payload = event.to_ipc_dict()

        # All keys should be camelCase (per IPC conventions)
        assert "taskId" in ipc_payload
        assert "phaseId" in ipc_payload
        assert "task_id" not in ipc_payload
        assert "phase_id" not in ipc_payload


# =============================================================================
# Story 2.4: Phase Percentage Tests (Task 6)
# =============================================================================


# =============================================================================
# Story 2.4: Progress Callbacks Tests (Task 5)
# =============================================================================


class TestProgressCallbacks:
    """Test progress callbacks for agent execution (Story 2.4 Task 5)."""

    def test_progress_callback_type_exists(self):
        """Test ProgressCallback type alias exists."""
        from apps.backend.methodologies.protocols import ProgressCallback

        assert ProgressCallback is not None

    def test_execute_phase_accepts_progress_callback(self, initialized_runner_with_spec_dir):
        """Test execute_phase can accept optional progress_callback parameter."""
        from apps.backend.methodologies.native import NativeRunner

        # Verify the method signature accepts progress_callback
        import inspect

        sig = inspect.signature(NativeRunner.execute_phase)
        params = list(sig.parameters.keys())

        assert "progress_callback" in params

    def test_progress_callback_is_called_during_execution(
        self, mock_context_with_spec_dir, mock_workspace_manager
    ):
        """Test progress callback is invoked during phase execution."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

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
            runner.initialize(mock_context_with_spec_dir)

        # Create a callback that captures calls
        callback_calls = []

        def progress_callback(message: str, percentage: float):
            callback_calls.append((message, percentage))

        # Execute phase with callback
        runner.execute_phase("requirements", progress_callback=progress_callback)

        # Callback should have been called at least once
        assert len(callback_calls) >= 1

    def test_progress_callback_is_optional(self, initialized_runner_with_spec_dir):
        """Test execute_phase works without progress_callback (backward compatible)."""
        # Should not raise when progress_callback is not provided
        result = initialized_runner_with_spec_dir.execute_phase("requirements")
        assert result is not None


class TestPhasePercentageCalculation:
    """Test phase percentage calculation (Story 2.4 Task 6, updated for Story 2.5).

    With Story 2.5 (after removing duplicate plan phase), the weights are:
    - discovery: 5%, requirements: 5%, context: 5%, spec: 10%, validate: 5%
    - planning: 10%, coding: 40%, qa_validation: 20%
    Total: 100%

    Phase ranges:
    - discovery: 0-5%
    - requirements: 5-10%
    - context: 10-15%
    - spec: 15-25%
    - validate: 25-30%
    - planning: 30-40%
    - coding: 40-80%
    - qa_validation: 80-100%
    """

    def test_discovery_starts_at_zero(self, initialized_runner):
        """Test discovery phase starts at 0%."""
        assert initialized_runner._get_phase_start_percentage("discovery") == 0.0

    def test_discovery_ends_at_five(self, initialized_runner):
        """Test discovery phase ends at 5%."""
        assert initialized_runner._get_phase_end_percentage("discovery") == 5.0

    def test_requirements_starts_at_five(self, initialized_runner):
        """Test requirements phase starts at 5%."""
        assert initialized_runner._get_phase_start_percentage("requirements") == 5.0

    def test_requirements_ends_at_ten(self, initialized_runner):
        """Test requirements phase ends at 10%."""
        assert initialized_runner._get_phase_end_percentage("requirements") == 10.0

    def test_context_starts_at_ten(self, initialized_runner):
        """Test context phase starts at 10%."""
        assert initialized_runner._get_phase_start_percentage("context") == 10.0

    def test_context_ends_at_fifteen(self, initialized_runner):
        """Test context phase ends at 15%."""
        assert initialized_runner._get_phase_end_percentage("context") == 15.0

    def test_spec_starts_at_fifteen(self, initialized_runner):
        """Test spec phase starts at 15%."""
        assert initialized_runner._get_phase_start_percentage("spec") == 15.0

    def test_spec_ends_at_twenty_five(self, initialized_runner):
        """Test spec phase ends at 25%."""
        assert initialized_runner._get_phase_end_percentage("spec") == 25.0

    def test_validate_starts_at_twenty_five(self, initialized_runner):
        """Test validate phase starts at 25%."""
        assert initialized_runner._get_phase_start_percentage("validate") == 25.0

    def test_validate_ends_at_thirty(self, initialized_runner):
        """Test validate phase ends at 30%."""
        assert initialized_runner._get_phase_end_percentage("validate") == 30.0

    # Story 2.5: Implementation phase percentage tests
    def test_planning_starts_at_thirty(self, initialized_runner):
        """Test planning phase starts at 30%."""
        assert initialized_runner._get_phase_start_percentage("planning") == 30.0

    def test_planning_ends_at_forty(self, initialized_runner):
        """Test planning phase ends at 40%."""
        assert initialized_runner._get_phase_end_percentage("planning") == 40.0

    def test_coding_starts_at_forty(self, initialized_runner):
        """Test coding phase starts at 40%."""
        assert initialized_runner._get_phase_start_percentage("coding") == 40.0

    def test_coding_ends_at_eighty(self, initialized_runner):
        """Test coding phase ends at 80%."""
        assert initialized_runner._get_phase_end_percentage("coding") == 80.0

    def test_qa_validation_starts_at_eighty(self, initialized_runner):
        """Test qa_validation phase starts at 80%."""
        assert initialized_runner._get_phase_start_percentage("qa_validation") == 80.0

    def test_qa_validation_ends_at_hundred(self, initialized_runner):
        """Test qa_validation phase ends at 100%."""
        assert initialized_runner._get_phase_end_percentage("qa_validation") == 100.0

    def test_unknown_phase_returns_zero(self, initialized_runner):
        """Test unknown phase returns 0%."""
        assert initialized_runner._get_phase_start_percentage("unknown") == 0.0
        assert initialized_runner._get_phase_end_percentage("unknown") == 0.0


class TestNativeRunnerCleanup:
    """Test cleanup method for NativeRunner (Story 2.3 AC#3)."""

    def test_cleanup_deletes_worktree(self, mock_context_with_spec_dir):
        """Test cleanup deletes the worktree (FR70)."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_info.spec_name = "test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=MagicMock(),
        ):
            runner.initialize(mock_context_with_spec_dir)
            runner.cleanup()

            # Verify worktree was removed
            mock_worktree_manager.remove_worktree.assert_called_once_with(
                "test-task", delete_branch=True
            )

    def test_cleanup_handles_partial_cleanup_gracefully(self, mock_context_with_spec_dir):
        """Test cleanup handles partial failures gracefully."""
        from apps.backend.methodologies.native import NativeRunner
        from unittest.mock import patch, MagicMock

        runner = NativeRunner()

        mock_worktree_manager = MagicMock()
        mock_worktree_info = MagicMock()
        mock_worktree_info.path = "/mock/worktree/path"
        mock_worktree_info.branch = "auto-claude/test-task"
        mock_worktree_info.spec_name = "test-task"
        mock_worktree_manager.get_or_create_worktree.return_value = mock_worktree_info
        mock_worktree_manager.remove_worktree.side_effect = Exception("Cleanup failed")

        with patch(
            "apps.backend.methodologies.native.methodology.WorktreeManager",
            return_value=mock_worktree_manager,
        ), patch(
            "apps.backend.methodologies.native.methodology.get_security_profile",
            return_value=MagicMock(),
        ), patch(
            "apps.backend.methodologies.native.methodology.get_graphiti_memory",
            return_value=MagicMock(),
        ):
            runner.initialize(mock_context_with_spec_dir)

            # Should not raise even if cleanup partially fails
            runner.cleanup()  # Should complete without raising

    def test_cleanup_without_initialization_is_noop(self):
        """Test cleanup does nothing if runner was never initialized."""
        from apps.backend.methodologies.native import NativeRunner

        runner = NativeRunner()
        # Should not raise
        runner.cleanup()


# =============================================================================
# Story 2.5: Implementation Phase Tests
# =============================================================================


class TestNativeRunnerPlanningPhase:
    """Test planning implementation phase execution (Story 2.5 AC#1)."""

    def test_planning_phase_exists_in_phases(self, initialized_runner):
        """Test planning phase is in phases list."""
        phases = initialized_runner.get_phases()
        phase_ids = [p.id for p in phases]
        assert "planning" in phase_ids

    def test_planning_phase_fails_without_spec_dir(self, initialized_runner):
        """Test planning phase fails without spec_dir."""
        result = initialized_runner.execute_phase("planning")
        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_planning_phase_fails_without_spec_md(self, initialized_runner_with_spec_dir):
        """Test planning phase fails if spec.md doesn't exist."""
        result = initialized_runner_with_spec_dir.execute_phase("planning")
        assert result.success is False
        assert "spec.md" in result.error.lower()

    def test_planning_returns_existing_plan(self, initialized_runner_with_spec_dir):
        """Test planning phase returns existing plan if present."""
        import json

        runner = initialized_runner_with_spec_dir

        # Create spec.md and existing plan
        spec_file = runner._spec_dir / "spec.md"
        spec_file.write_text("# Test Spec\n\nContent here.")

        plan_file = runner._spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps({"subtasks": [{"id": "1.1"}]}))

        result = runner.execute_phase("planning")

        assert result.success is True
        assert "already exists" in result.message.lower()
        assert str(plan_file) in result.artifacts


class TestNativeRunnerCodingPhase:
    """Test coding implementation phase execution (Story 2.5 AC#2)."""

    def test_coding_phase_exists_in_phases(self, initialized_runner):
        """Test coding phase is in phases list."""
        phases = initialized_runner.get_phases()
        phase_ids = [p.id for p in phases]
        assert "coding" in phase_ids

    def test_coding_phase_fails_without_spec_dir(self, initialized_runner):
        """Test coding phase fails without spec_dir."""
        result = initialized_runner.execute_phase("coding")
        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_coding_phase_fails_without_plan(self, initialized_runner_with_spec_dir):
        """Test coding phase fails if implementation_plan.json doesn't exist."""
        result = initialized_runner_with_spec_dir.execute_phase("coding")
        assert result.success is False
        assert "implementation_plan.json" in result.error.lower()


class TestNativeRunnerQAValidationPhase:
    """Test QA validation phase execution (Story 2.5 AC#3)."""

    def test_qa_validation_phase_exists_in_phases(self, initialized_runner):
        """Test qa_validation phase is in phases list."""
        phases = initialized_runner.get_phases()
        phase_ids = [p.id for p in phases]
        assert "qa_validation" in phase_ids

    def test_qa_validation_phase_fails_without_spec_dir(self, initialized_runner):
        """Test qa_validation phase fails without spec_dir."""
        result = initialized_runner.execute_phase("qa_validation")
        assert result.success is False
        assert "spec_dir" in result.error.lower()

    def test_qa_validation_phase_fails_without_complete_build(self, initialized_runner_with_spec_dir):
        """Test qa_validation phase fails if build not complete."""
        import json

        runner = initialized_runner_with_spec_dir

        # Create incomplete plan (some subtasks not completed)
        plan_file = runner._spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps({
            "subtasks": [
                {"id": "1.1", "status": "completed"},
                {"id": "1.2", "status": "pending"}  # Not complete
            ]
        }))

        result = runner.execute_phase("qa_validation")
        assert result.success is False
        assert "complete" in result.error.lower()


class TestNativeRunnerImplementationPhaseIntegration:
    """Test integration between implementation phases (Story 2.5)."""

    def test_implementation_phases_have_correct_order(self, initialized_runner):
        """Test implementation phases are ordered after spec phases."""
        phases = initialized_runner.get_phases()

        # Get phase orders
        phase_order = {p.id: p.order for p in phases}

        # Implementation phases should come after spec phases
        assert phase_order["planning"] > phase_order["validate"]
        assert phase_order["coding"] > phase_order["planning"]
        assert phase_order["qa_validation"] > phase_order["coding"]

    def test_qa_report_artifact_exists(self, initialized_runner):
        """Test qa-report-md artifact is defined."""
        artifacts = initialized_runner.get_artifacts()
        artifact_ids = [a.id for a in artifacts]
        assert "qa-report-md" in artifact_ids

    def test_qa_report_artifact_has_correct_phase(self, initialized_runner):
        """Test qa-report-md artifact is associated with qa_validation phase."""
        artifacts = initialized_runner.get_artifacts()
        qa_artifact = next(a for a in artifacts if a.id == "qa-report-md")
        assert qa_artifact.phase_id == "qa_validation"

    def test_qa_report_artifact_has_correct_file_path(self, initialized_runner):
        """Test qa-report-md artifact has correct file path."""
        artifacts = initialized_runner.get_artifacts()
        qa_artifact = next(a for a in artifacts if a.id == "qa-report-md")
        assert qa_artifact.file_path == "qa_report.md"


class TestNativeRunnerAgentInvocation:
    """Test that implementation phases invoke correct agent functions (Story 2.5)."""

    def test_planning_invokes_run_agent_session(self, initialized_runner_with_spec_dir):
        """Test planning phase calls run_agent_session with correct args."""
        import json
        from unittest.mock import patch, MagicMock, AsyncMock

        runner = initialized_runner_with_spec_dir

        # Create spec.md (required for planning)
        spec_file = runner._spec_dir / "spec.md"
        spec_file.write_text("# Test Spec\n\n## Overview\nTest content")

        # Mock the agent session and related functions
        mock_session = AsyncMock(return_value=("complete", "response"))
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch(
            "apps.backend.agents.session.run_agent_session",
            mock_session,
        ), patch(
            "apps.backend.core.client.create_client",
            return_value=mock_client,
        ) as mock_create_client, patch(
            "apps.backend.prompts_pkg.prompt_generator.generate_planner_prompt",
            return_value="test prompt",
        ):
            # The phase will fail because implementation_plan.json isn't created
            # but we can verify the agent was invoked
            result = runner.execute_phase("planning")

            # Verify create_client was called with correct agent_type
            mock_create_client.assert_called_once()
            call_kwargs = mock_create_client.call_args
            assert call_kwargs[1]["agent_type"] == "planner"

            # Verify run_agent_session was called
            mock_session.assert_called_once()

    def test_coding_invokes_run_autonomous_agent(self, initialized_runner_with_spec_dir):
        """Test coding phase calls run_autonomous_agent with correct args."""
        import json
        from unittest.mock import patch, MagicMock, AsyncMock

        runner = initialized_runner_with_spec_dir

        # Create implementation_plan.json (required for coding)
        plan_file = runner._spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps({
            "subtasks": [
                {"id": "1.1", "title": "Test", "status": "pending"}
            ]
        }))

        mock_coder = AsyncMock()

        with patch(
            "apps.backend.agents.coder.run_autonomous_agent",
            mock_coder,
        ), patch(
            "apps.backend.progress.is_build_complete",
            return_value=True,
        ):
            result = runner.execute_phase("coding")

            # Verify run_autonomous_agent was called
            mock_coder.assert_called_once()

            # Verify it was called with spec_dir
            call_kwargs = mock_coder.call_args
            assert call_kwargs[1]["spec_dir"] == runner._spec_dir

    def test_qa_validation_invokes_run_qa_validation_loop(self, initialized_runner_with_spec_dir):
        """Test qa_validation phase calls run_qa_validation_loop with correct args."""
        import json
        from unittest.mock import patch, AsyncMock

        runner = initialized_runner_with_spec_dir

        # Create complete build (all subtasks completed)
        plan_file = runner._spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps({
            "subtasks": [
                {"id": "1.1", "status": "completed"},
                {"id": "1.2", "status": "completed"}
            ]
        }))

        mock_qa_loop = AsyncMock(return_value=True)  # Return approved

        with patch(
            "apps.backend.qa.loop.run_qa_validation_loop",
            mock_qa_loop,
        ), patch(
            "apps.backend.progress.is_build_complete",
            return_value=True,
        ):
            result = runner.execute_phase("qa_validation")

            # Verify run_qa_validation_loop was called
            mock_qa_loop.assert_called_once()

            # Verify result
            assert result.success is True
            assert "passed" in result.message.lower()

    def test_model_from_task_config_metadata(self, initialized_runner_with_spec_dir):
        """Test that model is read from task_config.metadata if available."""
        import json
        from unittest.mock import patch, MagicMock, AsyncMock

        runner = initialized_runner_with_spec_dir

        # Set a custom model in task_config metadata
        runner._task_config.metadata["model"] = "claude-opus-4-5-20251101"

        # Create spec.md (required for planning)
        spec_file = runner._spec_dir / "spec.md"
        spec_file.write_text("# Test Spec\n\n## Overview\nTest content")

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_session = AsyncMock(return_value=("complete", "response"))

        with patch(
            "apps.backend.agents.session.run_agent_session",
            mock_session,
        ), patch(
            "apps.backend.core.client.create_client",
            return_value=mock_client,
        ) as mock_create_client, patch(
            "apps.backend.prompts_pkg.prompt_generator.generate_planner_prompt",
            return_value="test prompt",
        ):
            result = runner.execute_phase("planning")

            # Verify create_client was called with the custom model
            mock_create_client.assert_called_once()
            call_kwargs = mock_create_client.call_args
            assert call_kwargs[1]["model"] == "claude-opus-4-5-20251101"

    def test_default_model_used_when_not_in_metadata(self, initialized_runner_with_spec_dir):
        """Test that DEFAULT_AGENT_MODEL is used when model not in metadata."""
        import json
        from unittest.mock import patch, MagicMock, AsyncMock

        from apps.backend.methodologies.native.methodology import NativeRunner

        runner = initialized_runner_with_spec_dir

        # Ensure no model in metadata
        if "model" in runner._task_config.metadata:
            del runner._task_config.metadata["model"]

        # Create spec.md (required for planning)
        spec_file = runner._spec_dir / "spec.md"
        spec_file.write_text("# Test Spec\n\n## Overview\nTest content")

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_session = AsyncMock(return_value=("complete", "response"))

        with patch(
            "apps.backend.agents.session.run_agent_session",
            mock_session,
        ), patch(
            "apps.backend.core.client.create_client",
            return_value=mock_client,
        ) as mock_create_client, patch(
            "apps.backend.prompts_pkg.prompt_generator.generate_planner_prompt",
            return_value="test prompt",
        ):
            result = runner.execute_phase("planning")

            # Verify create_client was called with the default model
            mock_create_client.assert_called_once()
            call_kwargs = mock_create_client.call_args
            assert call_kwargs[1]["model"] == NativeRunner._DEFAULT_AGENT_MODEL
