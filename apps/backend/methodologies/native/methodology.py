"""Native Auto Claude methodology runner.

This module implements the MethodologyRunner Protocol for the Native Auto Claude
methodology. It wraps the existing spec creation logic to provide a
plugin-compatible interface.

Architecture Source: architecture.md#Native-Plugin-Structure
Story Reference: Story 2.1 - Create Native Methodology Plugin Structure
Story Reference: Story 2.2 - Implement Native MethodologyRunner
Story Reference: Story 2.3 - Integrate Workspace Management with Native Runner
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

# Story 2.3: Workspace management imports
from core.worktree import WorktreeError, WorktreeManager
from integrations.graphiti.memory import get_graphiti_memory
from security import get_security_profile

from apps.backend.methodologies.protocols import (
    Artifact,
    Checkpoint,
    CheckpointStatus,
    ComplexityLevel,
    Phase,
    PhaseResult,
    PhaseStatus,
    ProgressCallback,
    ProgressEvent,
    RunContext,
    TaskConfig,
)

# Type hints for optional dependencies
if TYPE_CHECKING:
    from integrations.graphiti.memory import GraphitiMemory
    from project_analyzer import SecurityProfile

logger = logging.getLogger(__name__)


class NativeRunner:
    """MethodologyRunner implementation for Native Auto Claude methodology.

    This class implements the MethodologyRunner Protocol, providing the interface
    for the plugin framework to execute the Native methodology.

    The Native methodology follows an 8-phase pipeline:
    1. Discovery - Gather project context and user requirements
    2. Requirements - Structure and validate requirements
    3. Context - Build codebase context for implementation
    4. Spec - Generate specification document
    5. Validate - Validate spec completeness
    6. Planning - Create implementation plan via planner agent
    7. Coding - Implement subtasks via coder agent
    8. QA Validation - Validate via QA reviewer/fixer loop

    Delegation Pattern:
        - Discovery: delegates to spec.discovery.run_discovery_script
        - Requirements: delegates to spec.requirements module
        - Context: delegates to spec.context module
        - Spec/Validate: require framework agent infrastructure
        - Planning/Coding/QA: delegate to agents module

    Example:
        runner = NativeRunner()
        runner.initialize(context)
        phases = runner.get_phases()
        for phase in phases:
            result = runner.execute_phase(phase.id)
    """

    # Default model for agent execution (Story 2.5)
    _DEFAULT_AGENT_MODEL: str = "claude-sonnet-4-5-20250929"

    def __init__(self) -> None:
        """Initialize NativeRunner instance."""
        self._context: RunContext | None = None
        self._phases: list[Phase] = []
        self._checkpoints: list[Checkpoint] = []
        self._artifacts: list[Artifact] = []
        self._initialized: bool = False
        # Story 2.2: Additional context attributes for phase execution
        self._project_dir: str = ""
        self._spec_dir: Path | None = None
        self._task_config: TaskConfig | None = None
        self._complexity: ComplexityLevel | None = None
        # Story 2.3: Workspace management attributes
        self._worktree_manager: WorktreeManager | None = None
        self._worktree_path: str | None = None
        self._worktree_spec_name: str | None = None
        self._security_profile = None
        self._graphiti_memory = None
        # Story 2.4: Progress callback for current execution
        self._current_progress_callback: ProgressCallback | None = None

    def initialize(self, context: RunContext) -> None:
        """Initialize the runner with framework context.

        Sets up the runner with access to framework services and
        initializes phase, checkpoint, and artifact definitions.
        Also creates git worktree, applies security sandbox, and
        initializes Graphiti memory (Story 2.3).

        Args:
            context: RunContext with access to all framework services

        Raises:
            RuntimeError: If runner is already initialized or worktree creation fails
        """
        if self._initialized:
            raise RuntimeError("NativeRunner already initialized")

        self._context = context
        # Story 2.2: Extract and store key context attributes for phase execution
        self._project_dir = context.workspace.get_project_root()
        self._task_config = context.task_config
        self._complexity = context.task_config.complexity

        # Get spec_dir from task_config metadata if available
        spec_dir_str = context.task_config.metadata.get("spec_dir")
        if spec_dir_str:
            self._spec_dir = Path(spec_dir_str)

        # Story 2.3: Initialize workspace management
        self._init_workspace()
        self._init_security()
        self._init_memory()

        self._init_phases()
        self._init_checkpoints()
        self._init_artifacts()
        self._initialized = True

    def get_phases(self) -> list[Phase]:
        """Return all phase definitions for the Native methodology.

        Returns:
            List of Phase objects defining the 8-phase pipeline:
            discovery, requirements, context, spec, validate, planning, coding, qa_validation

        Raises:
            RuntimeError: If runner has not been initialized
        """
        self._ensure_initialized()
        return self._phases.copy()

    def execute_phase(
        self,
        phase_id: str,
        progress_callback: ProgressCallback | None = None,
    ) -> PhaseResult:
        """Execute a specific phase of the Native methodology.

        Delegates to the existing spec creation logic for each phase.
        Emits ProgressEvents at phase start and end for frontend updates.
        Optionally invokes a progress callback for fine-grained progress reporting.

        Args:
            phase_id: ID of the phase to execute (discovery, requirements,
                     context, spec, plan, or validate)
            progress_callback: Optional callback invoked during execution for
                     incremental progress reporting. Signature: (message, percentage) -> None

        Returns:
            PhaseResult indicating success/failure and any artifacts produced

        Raises:
            RuntimeError: If runner has not been initialized

        Story Reference: Story 2.2 - Implement Native MethodologyRunner
        Story Reference: Story 2.4 - Implement Progress Reporting for Native Runner
        """
        self._ensure_initialized()

        # Store callback for use during phase execution
        self._current_progress_callback = progress_callback

        # Find the phase
        phase = self._find_phase(phase_id)
        if phase is None:
            return PhaseResult(
                success=False,
                phase_id=phase_id,
                error=f"Unknown phase: {phase_id}",
            )

        # Update phase status to IN_PROGRESS
        phase.status = PhaseStatus.IN_PROGRESS

        # Get task_id for progress events
        task_id = self._task_config.task_id if self._task_config else "unknown"

        # Emit start progress event (Story 2.4 AC#1)
        if self._context:
            self._context.progress.update(phase_id, 0.0, f"Starting {phase.name}")
            self._emit_progress_event(
                phase_id=phase_id,
                status="started",
                message=f"Starting {phase.name} phase",
                percentage=self._get_phase_start_percentage(phase_id),
                artifacts=[],
            )

        # Execute the phase using the dispatch table
        try:
            result = self._execute_phase_impl(phase_id)

            # Update phase status based on result
            if result.success:
                phase.status = PhaseStatus.COMPLETED
                if self._context:
                    self._context.progress.update(
                        phase_id, 1.0, f"{phase.name} completed"
                    )
                    # Emit completed progress event (Story 2.4 AC#3)
                    self._emit_progress_event(
                        phase_id=phase_id,
                        status="completed",
                        message=f"Completed {phase.name} phase",
                        percentage=self._get_phase_end_percentage(phase_id),
                        artifacts=result.artifacts,
                    )
            else:
                phase.status = PhaseStatus.FAILED
                if self._context:
                    self._context.progress.update(
                        phase_id, 0.0, f"{phase.name} failed: {result.error}"
                    )
                    # Emit failed progress event (Story 2.4 AC#3)
                    self._emit_progress_event(
                        phase_id=phase_id,
                        status="failed",
                        message=f"{phase.name} failed: {result.error}",
                        percentage=self._get_phase_start_percentage(phase_id),
                        artifacts=[],
                    )

            return result

        except Exception as e:
            phase.status = PhaseStatus.FAILED
            # Emit failed progress event on exception
            if self._context:
                self._emit_progress_event(
                    phase_id=phase_id,
                    status="failed",
                    message=f"{phase.name} failed: {str(e)}",
                    percentage=self._get_phase_start_percentage(phase_id),
                    artifacts=[],
                )
            return PhaseResult(
                success=False,
                phase_id=phase_id,
                error=str(e),
            )
        finally:
            # Clear the progress callback after execution (Story 2.4 Medium #3)
            self._current_progress_callback = None

    def _execute_phase_impl(self, phase_id: str) -> PhaseResult:
        """Dispatch to the appropriate phase implementation.

        Args:
            phase_id: ID of the phase to execute

        Returns:
            PhaseResult from the phase execution
        """
        dispatch = {
            "discovery": self._execute_discovery,
            "requirements": self._execute_requirements,
            "context": self._execute_context,
            "spec": self._execute_spec,
            "validate": self._execute_validate,
            # Story 2.5: Implementation phases
            "planning": self._execute_planning,
            "coding": self._execute_coding,
            "qa_validation": self._execute_qa_validation,
        }

        handler = dispatch.get(phase_id)
        if handler is None:
            return PhaseResult(
                success=False,
                phase_id=phase_id,
                error=f"No implementation for phase: {phase_id}",
            )

        return handler()

    def _execute_discovery(self) -> PhaseResult:
        """Execute the discovery phase.

        Delegates to spec.discovery.run_discovery_script to analyze
        project structure and create project_index.json.

        Returns:
            PhaseResult with success status and artifacts
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="discovery",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Import here to avoid circular imports
        from apps.backend.spec import discovery

        project_dir = Path(self._project_dir)

        # Report progress: starting discovery
        self._invoke_progress_callback("Starting project discovery...", 10.0)

        # Delegate to existing discovery logic
        self._invoke_progress_callback("Analyzing project structure...", 30.0)
        success, message = discovery.run_discovery_script(project_dir, self._spec_dir)

        if success:
            # Verify the artifact was created
            self._invoke_progress_callback("Verifying discovery results...", 90.0)
            index_file = self._spec_dir / "project_index.json"
            artifacts = [str(index_file)] if index_file.exists() else []

            return PhaseResult(
                success=True,
                phase_id="discovery",
                message=message,
                artifacts=artifacts,
            )
        else:
            return PhaseResult(
                success=False,
                phase_id="discovery",
                error=message,
            )

    def _execute_requirements(self) -> PhaseResult:
        """Execute the requirements phase.

        Delegates to spec.requirements module to structure requirements
        from task configuration and produce requirements.json artifact.

        Returns:
            PhaseResult with success status and artifacts
        """
        if self._task_config is None:
            return PhaseResult(
                success=False,
                phase_id="requirements",
                error="No task configuration available",
            )

        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="requirements",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Import here to avoid circular imports
        from apps.backend.spec import requirements as req_module

        # Report progress: checking existing requirements
        self._invoke_progress_callback("Checking for existing requirements...", 10.0)

        # Check if requirements already exist
        existing_req = req_module.load_requirements(self._spec_dir)
        if existing_req:
            req_file = self._spec_dir / "requirements.json"
            self._invoke_progress_callback("Found existing requirements", 100.0)
            return PhaseResult(
                success=True,
                phase_id="requirements",
                message="Requirements already exist",
                artifacts=[str(req_file)],
            )

        # Report progress: extracting task description
        self._invoke_progress_callback("Extracting task description...", 30.0)

        # Create requirements from task name/metadata
        task_description = self._task_config.task_name or self._task_config.task_id
        if not task_description:
            task_description = self._task_config.metadata.get(
                "task_description", "Unknown task"
            )

        # Report progress: creating requirements
        self._invoke_progress_callback("Creating requirements structure...", 60.0)

        req_data = req_module.create_requirements_from_task(task_description)

        # Report progress: saving requirements
        self._invoke_progress_callback("Saving requirements file...", 90.0)

        req_file = req_module.save_requirements(self._spec_dir, req_data)

        return PhaseResult(
            success=True,
            phase_id="requirements",
            message="Requirements created from task configuration",
            artifacts=[str(req_file)],
        )

    def _execute_context(self) -> PhaseResult:
        """Execute the context phase.

        Delegates to spec.context module to build codebase context
        and produce context.json artifact.

        Returns:
            PhaseResult with success status and artifacts
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="context",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Import here to avoid circular imports
        from apps.backend.spec import context as ctx_module
        from apps.backend.spec import requirements as req_module

        project_dir = Path(self._project_dir)

        # Report progress: loading requirements
        self._invoke_progress_callback("Loading requirements for context...", 10.0)

        # Load requirements for task description
        task = "Unknown task"
        services: list[str] = []

        req = req_module.load_requirements(self._spec_dir)
        if req:
            task = req.get("task_description", task)
            services = req.get("services_involved", [])

        # Report progress: checking existing context
        self._invoke_progress_callback("Checking for existing context...", 20.0)

        # Check if context already exists
        context_file = self._spec_dir / "context.json"
        if context_file.exists():
            self._invoke_progress_callback("Found existing context", 100.0)
            return PhaseResult(
                success=True,
                phase_id="context",
                message="Context already exists",
                artifacts=[str(context_file)],
            )

        # Report progress: running context discovery
        self._invoke_progress_callback("Running context discovery...", 40.0)

        # Delegate to existing context discovery logic
        success, message = ctx_module.run_context_discovery(
            project_dir, self._spec_dir, task, services
        )

        if success:
            self._invoke_progress_callback("Context discovery completed", 100.0)
            artifacts = [str(context_file)] if context_file.exists() else []
            return PhaseResult(
                success=True,
                phase_id="context",
                message=message,
                artifacts=artifacts,
            )
        else:
            # Report progress: creating minimal context
            self._invoke_progress_callback("Creating minimal context fallback...", 80.0)

            # Create minimal context on failure (matches existing behavior)
            ctx_module.create_minimal_context(self._spec_dir, task, services)
            return PhaseResult(
                success=True,
                phase_id="context",
                message="Created minimal context (discovery failed)",
                artifacts=[str(context_file)] if context_file.exists() else [],
            )

    def _execute_spec(self) -> PhaseResult:
        """Execute the spec phase.

        Generates the specification document via agent execution.
        Requires framework agent infrastructure for full implementation.

        Returns:
            PhaseResult with success status and artifacts
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="spec",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        spec_file = self._spec_dir / "spec.md"

        # Check if spec already exists
        if spec_file.exists():
            return PhaseResult(
                success=True,
                phase_id="spec",
                message="Specification already exists",
                artifacts=[str(spec_file)],
            )

        # Spec generation requires agent execution via framework
        # The framework should call spec_agents/writer logic
        return PhaseResult(
            success=False,
            phase_id="spec",
            error="Spec generation requires framework agent infrastructure. "
            "Use SpecOrchestrator for full pipeline execution.",
        )

    def _execute_validate(self) -> PhaseResult:
        """Execute the validation phase.

        Validates spec completeness and quality.
        Can delegate to spec.validate_pkg for validation logic.

        Returns:
            PhaseResult with success status and validation info
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="validate",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Import here to avoid circular imports
        from apps.backend.spec.validate_pkg.spec_validator import SpecValidator

        validator = SpecValidator(self._spec_dir)
        results = validator.validate_all()

        all_valid = all(r.valid for r in results)
        errors = [f"{r.checkpoint}: {err}" for r in results for err in r.errors]

        if all_valid:
            return PhaseResult(
                success=True,
                phase_id="validate",
                message="All validation checks passed",
                artifacts=[],
            )
        else:
            return PhaseResult(
                success=False,
                phase_id="validate",
                error=f"Validation failed: {'; '.join(errors)}",
            )

    # =========================================================================
    # Story 2.5: Implementation Phase Methods
    # =========================================================================

    def _run_async(self, coro):
        """Run an async coroutine safely from sync context.

        Handles the case where we might already be in an async context
        by using a ThreadPoolExecutor with asyncio.run().

        Args:
            coro: The async coroutine to execute

        Returns:
            The result of the coroutine

        Note:
            Uses asyncio.run() which creates a new event loop. This is
            preferred over get_event_loop() which is deprecated in Python 3.10+.
        """
        import asyncio

        try:
            # Check if we're already in an async context
            asyncio.get_running_loop()
            # We're in an async context, run in thread
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as executor:
                return executor.submit(asyncio.run, coro).result()
        except RuntimeError:
            # No running loop, safe to use asyncio.run
            return asyncio.run(coro)

    def _execute_planning(self) -> PhaseResult:
        """Execute the planning phase via planner agent.

        Invokes the existing planner agent to create implementation_plan.json
        from the spec.md document. Uses the Claude SDK client for agent execution.

        Returns:
            PhaseResult with success status and implementation_plan.json artifact

        Story Reference: Story 2.5 AC#1 - Planning phase produces implementation_plan.json
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="planning",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Check if spec.md exists
        spec_file = self._spec_dir / "spec.md"
        if not spec_file.exists():
            return PhaseResult(
                success=False,
                phase_id="planning",
                error="spec.md not found. Run spec phase first.",
            )

        # Check if plan already exists
        plan_file = self._spec_dir / "implementation_plan.json"
        if plan_file.exists():
            return PhaseResult(
                success=True,
                phase_id="planning",
                message="Implementation plan already exists",
                artifacts=[str(plan_file)],
            )

        # Report progress
        self._invoke_progress_callback("Starting planner agent...", 10.0)

        try:
            from apps.backend.agents.session import run_agent_session
            from apps.backend.core.client import create_client
            from apps.backend.prompts_pkg.prompt_generator import (
                generate_planner_prompt,
            )
            from apps.backend.task_logger import LogPhase

            project_dir = Path(self._worktree_path or self._project_dir)

            # Generate planner prompt
            self._invoke_progress_callback("Generating planner prompt...", 20.0)
            prompt = generate_planner_prompt(self._spec_dir, project_dir)

            # Create client for planner agent
            self._invoke_progress_callback("Creating planner agent client...", 30.0)
            model = (
                self._task_config.metadata.get("model", self._DEFAULT_AGENT_MODEL)
                if self._task_config
                else self._DEFAULT_AGENT_MODEL
            )
            client = create_client(
                project_dir,
                self._spec_dir,
                model=model,
                agent_type="planner",
                max_thinking_tokens=None,
            )

            # Run planner agent session
            self._invoke_progress_callback("Running planner agent...", 50.0)

            async def _run_planner():
                async with client:
                    status, response = await run_agent_session(
                        client,
                        prompt,
                        self._spec_dir,
                        verbose=False,
                        phase=LogPhase.PLANNING,
                    )
                    return status, response

            status, response = self._run_async(_run_planner())

            self._invoke_progress_callback("Planner agent completed", 90.0)

            # Verify the plan was created
            if plan_file.exists():
                return PhaseResult(
                    success=True,
                    phase_id="planning",
                    message="Implementation plan created by planner agent",
                    artifacts=[str(plan_file)],
                )
            else:
                return PhaseResult(
                    success=False,
                    phase_id="planning",
                    error=f"Planner agent completed with status '{status}' but implementation_plan.json was not created",
                )

        except Exception as e:
            logger.error(f"Planning phase failed: {e}")
            return PhaseResult(
                success=False,
                phase_id="planning",
                error=f"Planning phase failed: {str(e)}",
            )

    def _execute_coding(self) -> PhaseResult:
        """Execute the coding phase via coder agent.

        Loads the implementation_plan.json and executes each subtask via the
        coder agent. Updates subtask status in the plan after each execution.

        Returns:
            PhaseResult with success status

        Story Reference: Story 2.5 AC#2 - Coding phase implements subtasks
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="coding",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Check if plan exists
        plan_file = self._spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return PhaseResult(
                success=False,
                phase_id="coding",
                error="implementation_plan.json not found. Run planning phase first.",
            )

        self._invoke_progress_callback("Loading implementation plan...", 5.0)

        try:
            from apps.backend.agents.coder import run_autonomous_agent

            project_dir = Path(self._worktree_path or self._project_dir)

            self._invoke_progress_callback("Starting coder agent loop...", 10.0)

            model = (
                self._task_config.metadata.get("model", self._DEFAULT_AGENT_MODEL)
                if self._task_config
                else self._DEFAULT_AGENT_MODEL
            )

            async def _run_coder():
                await run_autonomous_agent(
                    project_dir=project_dir,
                    spec_dir=self._spec_dir,
                    model=model,
                    max_iterations=None,
                    verbose=False,
                    source_spec_dir=None,
                )

            self._run_async(_run_coder())

            self._invoke_progress_callback("Coder agent completed", 100.0)

            # Check if all subtasks are completed
            from apps.backend.progress import is_build_complete

            if is_build_complete(self._spec_dir):
                return PhaseResult(
                    success=True,
                    phase_id="coding",
                    message="All subtasks implemented successfully",
                    artifacts=[],
                )
            else:
                # Get progress info
                from apps.backend.progress import count_subtasks

                completed, total = count_subtasks(self._spec_dir)
                return PhaseResult(
                    success=False,
                    phase_id="coding",
                    error=f"Coding incomplete: {completed}/{total} subtasks completed",
                )

        except Exception as e:
            logger.error(f"Coding phase failed: {e}")
            return PhaseResult(
                success=False,
                phase_id="coding",
                error=f"Coding phase failed: {str(e)}",
            )

    def _execute_qa_validation(self) -> PhaseResult:
        """Execute the QA validation phase via QA reviewer/fixer loop.

        Runs the QA validation loop that:
        1. QA reviewer validates acceptance criteria
        2. If issues found, QA fixer applies fixes
        3. Loop continues until approved or max iterations

        Returns:
            PhaseResult with success status and qa_report.md artifact

        Story Reference: Story 2.5 AC#3 - QA validation with reviewer/fixer loop
        """
        if self._spec_dir is None:
            return PhaseResult(
                success=False,
                phase_id="qa_validation",
                error="No spec_dir configured. Set spec_dir in task_config.metadata.",
            )

        # Check if build is complete
        from apps.backend.progress import is_build_complete

        if not is_build_complete(self._spec_dir):
            return PhaseResult(
                success=False,
                phase_id="qa_validation",
                error="Build not complete. Run coding phase first.",
            )

        self._invoke_progress_callback("Starting QA validation loop...", 10.0)

        try:
            from apps.backend.qa.loop import run_qa_validation_loop

            project_dir = Path(self._worktree_path or self._project_dir)

            model = (
                self._task_config.metadata.get("model", self._DEFAULT_AGENT_MODEL)
                if self._task_config
                else self._DEFAULT_AGENT_MODEL
            )

            async def _run_qa():
                return await run_qa_validation_loop(
                    project_dir=project_dir,
                    spec_dir=self._spec_dir,
                    model=model,
                    verbose=False,
                )

            approved = self._run_async(_run_qa())

            self._invoke_progress_callback("QA validation completed", 100.0)

            # Get QA report artifact
            qa_report = self._spec_dir / "qa_report.md"
            artifacts = [str(qa_report)] if qa_report.exists() else []

            if approved:
                return PhaseResult(
                    success=True,
                    phase_id="qa_validation",
                    message="QA validation passed - all acceptance criteria verified",
                    artifacts=artifacts,
                )
            else:
                return PhaseResult(
                    success=False,
                    phase_id="qa_validation",
                    error="QA validation failed - see qa_report.md for details",
                    artifacts=artifacts,
                )

        except Exception as e:
            logger.error(f"QA validation phase failed: {e}")
            return PhaseResult(
                success=False,
                phase_id="qa_validation",
                error=f"QA validation phase failed: {str(e)}",
            )

    def get_checkpoints(self) -> list[Checkpoint]:
        """Return checkpoint definitions for Semi-Auto mode.

        Returns:
            List of Checkpoint objects defining the 3 pause points:
            after_planning, after_spec, after_validation

        Raises:
            RuntimeError: If runner has not been initialized
        """
        self._ensure_initialized()
        return self._checkpoints.copy()

    def get_artifacts(self) -> list[Artifact]:
        """Return artifact definitions produced by the Native methodology.

        Returns:
            List of Artifact objects defining methodology outputs:
            requirements.json, context.json, spec.md, implementation_plan.json

        Raises:
            RuntimeError: If runner has not been initialized
        """
        self._ensure_initialized()
        return self._artifacts.copy()

    def _ensure_initialized(self) -> None:
        """Ensure the runner has been initialized.

        Raises:
            RuntimeError: If runner has not been initialized
        """
        if not self._initialized:
            raise RuntimeError("NativeRunner not initialized. Call initialize() first.")

    def _find_phase(self, phase_id: str) -> Phase | None:
        """Find a phase by its ID.

        Args:
            phase_id: ID of the phase to find

        Returns:
            Phase object if found, None otherwise
        """
        for phase in self._phases:
            if phase.id == phase_id:
                return phase
        return None

    # =========================================================================
    # Story 2.4: Progress Reporting Methods
    # =========================================================================

    # Phase weights for percentage calculation (Story 2.4 Task 6, Story 2.5)
    # Phase weights for percentage calculation (Story 2.4 Task 6, Story 2.5)
    # Total: 100% (5+5+5+10+5+10+40+20 = 100)
    _PHASE_WEIGHTS: dict[str, int] = {
        "discovery": 5,
        "requirements": 5,
        "context": 5,
        "spec": 10,
        "validate": 5,
        # Story 2.5: Implementation phases
        "planning": 10,
        "coding": 40,
        "qa_validation": 20,
    }

    def _emit_progress_event(
        self,
        phase_id: str,
        status: str,
        message: str,
        percentage: float,
        artifacts: list[str],
    ) -> None:
        """Emit a ProgressEvent to the progress service.

        Creates a ProgressEvent with the current task context and emits
        it via the progress service for frontend display.

        Args:
            phase_id: ID of the phase being executed
            status: Progress status (started, in_progress, completed, failed)
            message: Human-readable progress message
            percentage: Completion percentage (0.0 to 100.0)
            artifacts: List of artifact file paths produced

        Story Reference: Story 2.4 - Implement Progress Reporting for Native Runner
        """
        if not self._context:
            return

        task_id = self._task_config.task_id if self._task_config else "unknown"

        event = ProgressEvent(
            task_id=task_id,
            phase_id=phase_id,
            status=status,
            message=message,
            percentage=percentage,
            artifacts=artifacts,
            timestamp=datetime.now(),
        )

        # Emit via progress service if emit method is available
        if hasattr(self._context.progress, "emit"):
            self._context.progress.emit(event)

        # Invoke progress callback if provided (Story 2.4 Task 5)
        if self._current_progress_callback is not None:
            self._current_progress_callback(message, percentage)

    def _invoke_progress_callback(self, message: str, percentage: float) -> None:
        """Invoke the current progress callback if set.

        This is a convenience method for phase execution methods to
        report incremental progress during their work.

        Args:
            message: Human-readable progress message
            percentage: Progress within the current phase (0.0 to 100.0)

        Story Reference: Story 2.4 Task 5 - Add progress callbacks to existing agents
        """
        if self._current_progress_callback is not None:
            try:
                self._current_progress_callback(message, percentage)
            except Exception as e:
                logger.warning(f"Progress callback failed: {e}")

    def _get_phase_start_percentage(self, phase_id: str) -> float:
        """Calculate the cumulative percentage at the start of a phase.

        Args:
            phase_id: ID of the phase

        Returns:
            Percentage at phase start (0.0 to 100.0)

        Story Reference: Story 2.4 Task 6
        """
        phases = list(self._PHASE_WEIGHTS.keys())
        if phase_id not in phases:
            return 0.0

        idx = phases.index(phase_id)
        return float(sum(self._PHASE_WEIGHTS[p] for p in phases[:idx]))

    def _get_phase_end_percentage(self, phase_id: str) -> float:
        """Calculate the cumulative percentage at the end of a phase.

        Args:
            phase_id: ID of the phase

        Returns:
            Percentage at phase end (0.0 to 100.0)

        Story Reference: Story 2.4 Task 6
        """
        phases = list(self._PHASE_WEIGHTS.keys())
        if phase_id not in phases:
            return 0.0

        idx = phases.index(phase_id)
        return float(sum(self._PHASE_WEIGHTS[p] for p in phases[: idx + 1]))

    def emit_incremental_progress(
        self,
        phase_id: str,
        message: str,
        percentage: float,
        artifacts: list[str] | None = None,
    ) -> None:
        """Emit incremental progress within a phase.

        Called during phase execution to report significant progress
        such as agent started, subtask completed, etc.

        The percentage is relative to the current phase (0-100%), and
        is automatically converted to overall task percentage based
        on phase weights.

        Args:
            phase_id: ID of the phase being executed
            message: Human-readable progress message
            percentage: Progress within the phase (0.0 to 100.0)
            artifacts: Optional list of artifact paths produced so far

        Story Reference: Story 2.4 AC#2 - Incremental progress events
        """
        if not self._initialized:
            return

        try:
            # Calculate overall percentage from phase percentage
            phase_start = self._get_phase_start_percentage(phase_id)
            phase_end = self._get_phase_end_percentage(phase_id)
            phase_weight = phase_end - phase_start

            # Convert phase percentage to overall percentage
            overall_percentage = phase_start + (phase_weight * (percentage / 100.0))

            self._emit_progress_event(
                phase_id=phase_id,
                status="in_progress",
                message=message,
                percentage=overall_percentage,
                artifacts=artifacts or [],
            )
        except Exception as e:
            # Don't let progress reporting errors break phase execution
            logger.warning(f"Failed to emit incremental progress: {e}")

    def _init_phases(self) -> None:
        """Initialize phase definitions for the Native methodology."""
        self._phases = [
            Phase(
                id="discovery",
                name="Discovery",
                description="Gather project context and user requirements",
                order=1,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            Phase(
                id="requirements",
                name="Requirements",
                description="Structure and validate requirements",
                order=2,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            Phase(
                id="context",
                name="Context",
                description="Build codebase context for implementation",
                order=3,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            Phase(
                id="spec",
                name="Specification",
                description="Generate specification document",
                order=4,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            Phase(
                id="validate",
                name="Validation",
                description="Validate spec completeness",
                order=5,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            # Story 2.5: Implementation phases
            Phase(
                id="planning",
                name="Planning",
                description="Create implementation plan from spec via planner agent",
                order=6,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            Phase(
                id="coding",
                name="Coding",
                description="Implement subtasks from the plan via coder agent",
                order=7,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
            Phase(
                id="qa_validation",
                name="QA Validation",
                description="Validate acceptance criteria via QA reviewer/fixer loop",
                order=8,
                status=PhaseStatus.PENDING,
                is_optional=False,
            ),
        ]

    def _init_checkpoints(self) -> None:
        """Initialize checkpoint definitions for Semi-Auto mode."""
        self._checkpoints = [
            Checkpoint(
                id="after_planning",
                name="Planning Review",
                description="Review implementation plan before coding",
                phase_id="planning",
                status=CheckpointStatus.PENDING,
                requires_approval=True,
            ),
            Checkpoint(
                id="after_spec",
                name="Specification Review",
                description="Review specification before planning",
                phase_id="spec",
                status=CheckpointStatus.PENDING,
                requires_approval=True,
            ),
            Checkpoint(
                id="after_validation",
                name="Validation Review",
                description="Review validation results before completion",
                phase_id="validate",
                status=CheckpointStatus.PENDING,
                requires_approval=True,
            ),
        ]

    def _init_artifacts(self) -> None:
        """Initialize artifact definitions for the Native methodology."""
        self._artifacts = [
            Artifact(
                id="requirements-json",
                artifact_type="json",
                name="Requirements",
                file_path="requirements.json",
                phase_id="discovery",
                content_type="application/json",
            ),
            Artifact(
                id="context-json",
                artifact_type="json",
                name="Context",
                file_path="context.json",
                phase_id="context",
                content_type="application/json",
            ),
            Artifact(
                id="spec-md",
                artifact_type="markdown",
                name="Specification",
                file_path="spec.md",
                phase_id="spec",
                content_type="text/markdown",
            ),
            Artifact(
                id="implementation-plan-json",
                artifact_type="json",
                name="Implementation Plan",
                file_path="implementation_plan.json",
                phase_id="plan",
                content_type="application/json",
            ),
            # Story 2.5: QA artifacts
            Artifact(
                id="qa-report-md",
                artifact_type="markdown",
                name="QA Report",
                file_path="qa_report.md",
                phase_id="qa_validation",
                content_type="text/markdown",
            ),
        ]

    # =========================================================================
    # Story 2.3: Workspace Management Methods
    # =========================================================================

    def _init_workspace(self) -> None:
        """Initialize git worktree for task isolation (FR65).

        Creates a git worktree for the task to isolate file operations.
        The worktree path is stored for agent use.

        Raises:
            RuntimeError: If worktree creation fails
        """
        project_path = Path(self._project_dir)

        # Generate spec name from task config
        task_name = self._task_config.task_name if self._task_config else "unknown"
        task_id = self._task_config.task_id if self._task_config else "unknown"
        self._worktree_spec_name = task_name or task_id or "native-task"

        # Sanitize spec name for use in branch names
        self._worktree_spec_name = (
            self._worktree_spec_name.lower().replace(" ", "-").replace("_", "-")
        )

        try:
            self._worktree_manager = WorktreeManager(project_path)
            self._worktree_manager.setup()

            worktree_info = self._worktree_manager.get_or_create_worktree(
                self._worktree_spec_name
            )
            self._worktree_path = str(worktree_info.path)

        except WorktreeError as e:
            raise RuntimeError(
                f"Failed to create worktree for task '{self._worktree_spec_name}': {e}"
            ) from e

    def _init_security(self) -> None:
        """Initialize security sandbox for the worktree (FR66).

        Applies security profile to restrict operations to the workspace.
        Uses the worktree path as the security boundary.
        """
        if self._worktree_path:
            worktree_path = Path(self._worktree_path)
            self._security_profile = get_security_profile(worktree_path, self._spec_dir)

    def _init_memory(self) -> None:
        """Initialize Graphiti memory service (FR68).

        Sets up Graphiti memory integration. If memory service is
        unavailable, initialization continues without it (NFR23).
        """
        if not self._spec_dir:
            self._graphiti_memory = None
            return

        try:
            self._graphiti_memory = get_graphiti_memory(
                spec_dir=self._spec_dir,
                project_dir=Path(self._project_dir),
            )
        except Exception as e:
            # NFR23: Don't block on memory failure, but log for debugging
            logger.debug(f"Graphiti memory initialization failed (non-blocking): {e}")
            self._graphiti_memory = None

    def get_workspace_path(self) -> str | None:
        """Get the worktree path for agents to use.

        Returns:
            Path to the isolated workspace, or None if not initialized
        """
        return self._worktree_path

    def get_security_profile(self) -> "SecurityProfile | None":
        """Get the security profile for the workspace.

        Returns:
            SecurityProfile for agent operations, or None if not initialized
        """
        return self._security_profile

    def get_graphiti_memory(self) -> "GraphitiMemory | None":
        """Get the Graphiti memory service.

        Returns:
            GraphitiMemory instance or None if unavailable/not initialized
        """
        return self._graphiti_memory

    def cleanup(self) -> None:
        """Clean up workspace resources (FR70).

        Deletes the worktree and closes the Graphiti memory connection.
        Handles partial cleanup gracefully - failures are logged but
        don't raise exceptions.
        """
        if not self._initialized:
            return

        # Clean up worktree
        if self._worktree_manager and self._worktree_spec_name:
            try:
                self._worktree_manager.remove_worktree(
                    self._worktree_spec_name, delete_branch=True
                )
            except Exception as e:
                # Handle partial cleanup gracefully - log but don't raise
                logger.warning(
                    f"Failed to remove worktree '{self._worktree_spec_name}': {e}"
                )

        # Close Graphiti memory connection (AC#3: archive/cleanup memory)
        if self._graphiti_memory is not None:
            try:
                import asyncio

                # GraphitiMemory.close() is async, run it synchronously
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # If we're already in an async context, create a task
                    asyncio.create_task(self._graphiti_memory.close())
                else:
                    loop.run_until_complete(self._graphiti_memory.close())
            except Exception as e:
                logger.warning(f"Failed to close Graphiti memory: {e}")

        # Reset state
        self._worktree_path = None
        self._security_profile = None
        self._graphiti_memory = None
