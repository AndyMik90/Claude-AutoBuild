"""
Spec Creation Pipeline Orchestrator
====================================

Main orchestration logic for spec creation with dynamic complexity adaptation.
"""

import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from client import create_client
from init import init_auto_claude_dir
from review import run_review_checkpoint
from task_logger import (
    LogEntryType,
    LogPhase,
    get_task_logger,
    update_task_logger_path,
)
from ui import (
    Icons,
    box,
    highlight,
    icon,
    muted,
    print_key_value,
    print_section,
    print_status,
)
from validate_spec import SpecValidator

from . import complexity, phases, requirements


def get_specs_dir(project_dir: Path, dev_mode: bool = False) -> Path:
    """Get the specs directory path.

    IMPORTANT: Only .auto-claude/ is considered an "installed" auto-claude.
    The auto-claude/ folder (if it exists) is SOURCE CODE being developed,
    not an installation. This allows Auto Claude to be used to develop itself.

    This function also ensures .auto-claude is added to .gitignore on first use.

    Args:
        project_dir: The project root directory
        dev_mode: Deprecated, kept for API compatibility. Has no effect.

    Returns:
        Path to the specs directory within .auto-claude/
    """
    # Initialize .auto-claude directory and ensure it's in .gitignore
    init_auto_claude_dir(project_dir)

    # Return the specs directory path
    return project_dir / ".auto-claude" / "specs"


class SpecOrchestrator:
    """Orchestrates the spec creation process with dynamic complexity adaptation."""

    def __init__(
        self,
        project_dir: Path,
        task_description: str | None = None,
        spec_name: str | None = None,
        spec_dir: Path
        | None = None,  # Use existing spec directory (for UI integration)
        model: str = "claude-opus-4-5-20251101",
        complexity_override: str | None = None,  # Force a specific complexity
        use_ai_assessment: bool = True,  # Use AI for complexity assessment (vs heuristics)
        dev_mode: bool = False,  # Dev mode: specs in gitignored folder, code changes to auto-claude/
    ):
        self.project_dir = Path(project_dir)
        self.task_description = task_description
        self.model = model
        self.complexity_override = complexity_override
        self.use_ai_assessment = use_ai_assessment
        self.dev_mode = dev_mode

        # Get the appropriate specs directory (within the project)
        self.specs_dir = get_specs_dir(self.project_dir, dev_mode)

        # Clean up orphaned pending folders before creating new spec
        self._cleanup_orphaned_pending_folders()

        # Complexity assessment (populated during run)
        self.assessment: complexity.ComplexityAssessment | None = None

        # Create/use spec directory
        if spec_dir:
            # Use provided spec directory (from UI)
            self.spec_dir = Path(spec_dir)
        elif spec_name:
            self.spec_dir = self.specs_dir / spec_name
        else:
            self.spec_dir = self._create_spec_dir()

        self.spec_dir.mkdir(parents=True, exist_ok=True)
        self.validator = SpecValidator(self.spec_dir)

    def _cleanup_orphaned_pending_folders(self) -> None:
        """Remove orphaned pending folders that have no substantial content."""
        if not self.specs_dir.exists():
            return

        orphaned = []
        for folder in self.specs_dir.glob("[0-9][0-9][0-9]-pending"):
            if not folder.is_dir():
                continue

            # Check if folder has substantial content
            requirements_file = folder / "requirements.json"
            spec_file = folder / "spec.md"
            plan_file = folder / "implementation_plan.json"

            if requirements_file.exists() or spec_file.exists() or plan_file.exists():
                continue

            # Check folder age - only clean up folders older than 10 minutes
            try:
                folder_mtime = datetime.fromtimestamp(folder.stat().st_mtime)
                if datetime.now() - folder_mtime < timedelta(minutes=10):
                    continue
            except OSError:
                continue

            orphaned.append(folder)

        # Clean up orphaned folders
        for folder in orphaned:
            try:
                shutil.rmtree(folder)
            except OSError:
                pass

    def _create_spec_dir(self) -> Path:
        """Create a new spec directory with incremented number and placeholder name."""
        existing = list(self.specs_dir.glob("[0-9][0-9][0-9]-*"))

        if existing:
            # Find the HIGHEST folder number
            numbers = []
            for folder in existing:
                try:
                    num = int(folder.name[:3])
                    numbers.append(num)
                except ValueError:
                    pass
            next_num = max(numbers) + 1 if numbers else 1
        else:
            next_num = 1

        # Start with placeholder - will be renamed after requirements gathering
        name = "pending"
        return self.specs_dir / f"{next_num:03d}-{name}"

    def _generate_spec_name(self, task_description: str) -> str:
        """Generate a clean kebab-case name from task description."""
        skip_words = {
            "a",
            "an",
            "the",
            "to",
            "for",
            "of",
            "in",
            "on",
            "at",
            "by",
            "with",
            "and",
            "or",
            "but",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "being",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
            "must",
            "can",
            "this",
            "that",
            "these",
            "those",
            "i",
            "you",
            "we",
            "they",
            "it",
            "add",
            "create",
            "make",
            "implement",
            "build",
            "new",
            "using",
            "use",
            "via",
            "from",
        }

        # Clean and tokenize
        text = task_description.lower()
        text = "".join(c if c.isalnum() or c == " " else " " for c in text)
        words = text.split()

        # Filter out skip words and short words
        meaningful = [w for w in words if w not in skip_words and len(w) > 2]

        # Take first 4 meaningful words
        name_parts = meaningful[:4]

        if not name_parts:
            name_parts = words[:4]

        return "-".join(name_parts) if name_parts else "spec"

    def _rename_spec_dir_from_requirements(self) -> bool:
        """Rename spec directory based on requirements.json task description."""
        requirements_file = self.spec_dir / "requirements.json"

        if not requirements_file.exists():
            return False

        try:
            with open(requirements_file) as f:
                req = json.load(f)

            task_desc = req.get("task_description", "")
            if not task_desc:
                return False

            # Generate new name
            new_name = self._generate_spec_name(task_desc)

            # Extract the number prefix from current dir
            current_name = self.spec_dir.name
            if current_name[:3].isdigit():
                prefix = current_name[:4]  # "001-"
            else:
                prefix = ""

            new_dir_name = f"{prefix}{new_name}"
            new_spec_dir = self.spec_dir.parent / new_dir_name

            # Don't rename if it's already a good name (not "pending")
            if "pending" not in current_name:
                return True

            # Don't rename if target already exists
            if new_spec_dir.exists():
                return True

            # Rename the directory
            shutil.move(str(self.spec_dir), str(new_spec_dir))

            # Update our references
            self.spec_dir = new_spec_dir
            self.validator = SpecValidator(self.spec_dir)

            # Update the global task logger to use the new path
            update_task_logger_path(new_spec_dir)

            print_status(f"Spec folder: {highlight(new_dir_name)}", "success")
            return True

        except (json.JSONDecodeError, OSError) as e:
            print_status(f"Could not rename spec folder: {e}", "warning")
            return False

    async def _run_agent(
        self,
        prompt_file: str,
        additional_context: str = "",
        interactive: bool = False,
    ) -> tuple[bool, str]:
        """Run an agent with the given prompt."""
        from pathlib import Path as PathlibPath

        prompt_path = PathlibPath(__file__).parent.parent / "prompts" / prompt_file

        if not prompt_path.exists():
            return False, f"Prompt not found: {prompt_path}"

        # Load prompt
        prompt = prompt_path.read_text()

        # Add context
        prompt += f"\n\n---\n\n**Spec Directory**: {self.spec_dir}\n"
        prompt += f"**Project Directory**: {self.project_dir}\n"

        if additional_context:
            prompt += f"\n{additional_context}\n"

        # Create client
        client = create_client(self.project_dir, self.spec_dir, self.model)

        # Get task logger for this spec
        task_logger = get_task_logger(self.spec_dir)
        current_tool = None

        try:
            async with client:
                await client.query(prompt)

                response_text = ""
                async for msg in client.receive_response():
                    msg_type = type(msg).__name__

                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            if block_type == "TextBlock" and hasattr(block, "text"):
                                response_text += block.text
                                print(block.text, end="", flush=True)
                                if task_logger and block.text.strip():
                                    task_logger.log(
                                        block.text,
                                        LogEntryType.TEXT,
                                        LogPhase.PLANNING,
                                        print_to_console=False,
                                    )
                            elif block_type == "ToolUseBlock" and hasattr(
                                block, "name"
                            ):
                                tool_name = block.name
                                tool_input = None

                                # Extract meaningful tool input for display
                                if hasattr(block, "input") and block.input:
                                    inp = block.input
                                    if isinstance(inp, dict):
                                        if "pattern" in inp:
                                            tool_input = f"pattern: {inp['pattern']}"
                                        elif "file_path" in inp:
                                            fp = inp["file_path"]
                                            if len(fp) > 50:
                                                fp = "..." + fp[-47:]
                                            tool_input = fp
                                        elif "command" in inp:
                                            cmd = inp["command"]
                                            if len(cmd) > 50:
                                                cmd = cmd[:47] + "..."
                                            tool_input = cmd
                                        elif "path" in inp:
                                            tool_input = inp["path"]

                                if task_logger:
                                    task_logger.tool_start(
                                        tool_name,
                                        tool_input,
                                        LogPhase.PLANNING,
                                        print_to_console=True,
                                    )
                                else:
                                    print(f"\n[Tool: {tool_name}]", flush=True)
                                current_tool = tool_name

                    elif msg_type == "UserMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            if block_type == "ToolResultBlock":
                                is_error = getattr(block, "is_error", False)
                                result_content = getattr(block, "content", "")
                                if task_logger and current_tool:
                                    detail_content = None
                                    if current_tool in (
                                        "Read",
                                        "Grep",
                                        "Bash",
                                        "Edit",
                                        "Write",
                                    ):
                                        result_str = str(result_content)
                                        if len(result_str) < 50000:
                                            detail_content = result_str
                                    task_logger.tool_end(
                                        current_tool,
                                        success=not is_error,
                                        detail=detail_content,
                                        phase=LogPhase.PLANNING,
                                    )
                                current_tool = None

                print()
                return True, response_text

        except Exception as e:
            if task_logger:
                task_logger.log_error(f"Agent error: {e}", LogPhase.PLANNING)
            return False, str(e)

    async def run(self, interactive: bool = True, auto_approve: bool = False) -> bool:
        """Run the spec creation process with dynamic phase selection.

        Args:
            interactive: Whether to run in interactive mode for requirements gathering
            auto_approve: Whether to skip human review checkpoint and auto-approve

        Returns:
            True if spec creation and review completed successfully, False otherwise
        """
        # Import UI module for use in phases
        import ui

        # Initialize task logger for planning phase
        task_logger = get_task_logger(self.spec_dir)
        task_logger.start_phase(LogPhase.PLANNING, "Starting spec creation process")

        print(
            box(
                f"Spec Directory: {self.spec_dir}\n"
                f"Project: {self.project_dir}"
                + (f"\nTask: {self.task_description}" if self.task_description else ""),
                title="SPEC CREATION ORCHESTRATOR",
                style="heavy",
            )
        )

        # Create phase executor
        phase_executor = phases.PhaseExecutor(
            project_dir=self.project_dir,
            spec_dir=self.spec_dir,
            task_description=self.task_description,
            spec_validator=self.validator,
            run_agent_fn=self._run_agent,
            task_logger=task_logger,
            ui_module=ui,
        )

        results = []
        phase_num = 0

        # Phase display names and icons
        phase_display = {
            "discovery": ("PROJECT DISCOVERY", Icons.FOLDER),
            "historical_context": ("HISTORICAL CONTEXT", Icons.SEARCH),
            "requirements": ("REQUIREMENTS GATHERING", Icons.FILE),
            "complexity_assessment": ("COMPLEXITY ASSESSMENT", Icons.GEAR),
            "research": ("INTEGRATION RESEARCH", Icons.SEARCH),
            "context": ("CONTEXT DISCOVERY", Icons.FOLDER),
            "quick_spec": ("QUICK SPEC", Icons.LIGHTNING),
            "spec_writing": ("SPEC DOCUMENT CREATION", Icons.FILE),
            "self_critique": ("SPEC SELF-CRITIQUE", Icons.GEAR),
            "planning": ("IMPLEMENTATION PLANNING", Icons.SUBTASK),
            "validation": ("FINAL VALIDATION", Icons.SUCCESS),
        }

        def run_phase(name: str, phase_fn):
            """Run a phase with proper numbering and display."""
            nonlocal phase_num
            phase_num += 1
            display_name, display_icon = phase_display.get(
                name, (name.upper(), Icons.GEAR)
            )
            print_section(f"PHASE {phase_num}: {display_name}", display_icon)
            task_logger.log(
                f"Starting phase {phase_num}: {display_name}", LogEntryType.INFO
            )
            return phase_fn()

        # === PHASE 1: DISCOVERY ===
        result = await run_phase("discovery", phase_executor.phase_discovery)
        results.append(result)
        if not result.success:
            print_status("Discovery failed", "error")
            task_logger.end_phase(
                LogPhase.PLANNING, success=False, message="Discovery failed"
            )
            return False

        # === PHASE 2: REQUIREMENTS GATHERING ===
        result = await run_phase(
            "requirements", lambda: phase_executor.phase_requirements(interactive)
        )
        results.append(result)
        if not result.success:
            print_status("Requirements gathering failed", "error")
            task_logger.end_phase(
                LogPhase.PLANNING,
                success=False,
                message="Requirements gathering failed",
            )
            return False

        # Rename spec folder with better name from requirements
        self._rename_spec_dir_from_requirements()

        # Update task description from requirements
        req = requirements.load_requirements(self.spec_dir)
        if req:
            self.task_description = req.get("task_description", self.task_description)
            # Update phase executor's task description
            phase_executor.task_description = self.task_description

        # === CREATE LINEAR TASK (if enabled) ===
        from linear_updater import create_linear_task, is_linear_enabled

        if is_linear_enabled():
            print_status("Creating Linear task...", "progress")
            linear_state = await create_linear_task(
                spec_dir=self.spec_dir,
                title=self.task_description or self.spec_dir.name,
                description=f"Auto-build spec: {self.spec_dir.name}",
            )
            if linear_state:
                print_status(f"Linear task created: {linear_state.task_id}", "success")
            else:
                print_status(
                    "Linear task creation failed (continuing without)", "warning"
                )

        # === PHASE 3: AI COMPLEXITY ASSESSMENT ===
        result = await run_phase(
            "complexity_assessment",
            lambda: self._phase_complexity_assessment_with_requirements(),
        )
        results.append(result)
        if not result.success:
            print_status("Complexity assessment failed", "error")
            task_logger.end_phase(
                LogPhase.PLANNING, success=False, message="Complexity assessment failed"
            )
            return False

        # Map of all available phases
        all_phases = {
            "historical_context": phase_executor.phase_historical_context,
            "research": phase_executor.phase_research,
            "context": phase_executor.phase_context,
            "spec_writing": phase_executor.phase_spec_writing,
            "self_critique": phase_executor.phase_self_critique,
            "planning": phase_executor.phase_planning,
            "validation": phase_executor.phase_validation,
            "quick_spec": phase_executor.phase_quick_spec,
        }

        # Get remaining phases to run based on complexity
        all_phases_to_run = self.assessment.phases_to_run()
        phases_to_run = [
            p for p in all_phases_to_run if p not in ["discovery", "requirements"]
        ]

        print()
        print(
            f"  Running {highlight(self.assessment.complexity.value.upper())} workflow"
        )
        print(f"  {muted('Remaining phases:')} {', '.join(phases_to_run)}")
        print()

        phases_executed = ["discovery", "requirements", "complexity_assessment"]
        for phase_name in phases_to_run:
            if phase_name not in all_phases:
                print_status(f"Unknown phase: {phase_name}, skipping", "warning")
                continue

            result = await run_phase(phase_name, all_phases[phase_name])
            results.append(result)
            phases_executed.append(phase_name)

            if not result.success:
                print()
                print_status(
                    f"Phase '{phase_name}' failed after {result.retries} retries",
                    "error",
                )
                print(f"  {muted('Errors:')}")
                for err in result.errors:
                    print(f"    {icon(Icons.ARROW_RIGHT)} {err}")
                print()
                print_status(
                    "Spec creation incomplete. Fix errors and retry.", "warning"
                )
                task_logger.log(
                    f"Phase '{phase_name}' failed: {'; '.join(result.errors)}",
                    LogEntryType.ERROR,
                )
                task_logger.end_phase(
                    LogPhase.PLANNING,
                    success=False,
                    message=f"Phase {phase_name} failed",
                )
                return False

        # Summary
        files_created = []
        for r in results:
            for f in r.output_files:
                files_created.append(Path(f).name)

        print(
            box(
                f"Complexity: {self.assessment.complexity.value.upper()}\n"
                f"Phases run: {len(phases_executed) + 1}\n"
                f"Spec saved to: {self.spec_dir}\n\n"
                f"Files created:\n"
                + "\n".join(f"  {icon(Icons.SUCCESS)} {f}" for f in files_created),
                title=f"{icon(Icons.SUCCESS)} SPEC CREATION COMPLETE",
                style="heavy",
            )
        )

        # End planning phase successfully
        task_logger.end_phase(
            LogPhase.PLANNING, success=True, message="Spec creation complete"
        )

        # === HUMAN REVIEW CHECKPOINT ===
        print()
        print_section("HUMAN REVIEW CHECKPOINT", Icons.SEARCH)

        try:
            review_state = run_review_checkpoint(
                spec_dir=self.spec_dir,
                auto_approve=auto_approve,
            )

            if not review_state.is_approved():
                print()
                print_status("Build will not proceed without approval.", "warning")
                return False

        except SystemExit as e:
            if e.code != 0:
                return False
            return False
        except KeyboardInterrupt:
            print()
            print_status("Review interrupted. Run again to continue.", "info")
            return False

        return True

    async def _phase_complexity_assessment_with_requirements(
        self,
    ) -> phases.PhaseResult:
        """Assess complexity after requirements are gathered (with full context)."""
        task_logger = get_task_logger(self.spec_dir)
        assessment_file = self.spec_dir / "complexity_assessment.json"
        requirements_file = self.spec_dir / "requirements.json"

        # Load requirements for full context
        requirements_context = ""
        if requirements_file.exists():
            with open(requirements_file) as f:
                req = json.load(f)
                self.task_description = req.get(
                    "task_description", self.task_description
                )
                requirements_context = f"""
**Task Description**: {req.get("task_description", "Not provided")}
**Workflow Type**: {req.get("workflow_type", "Not specified")}
**Services Involved**: {", ".join(req.get("services_involved", []))}
**User Requirements**:
{chr(10).join(f"- {r}" for r in req.get("user_requirements", []))}
**Acceptance Criteria**:
{chr(10).join(f"- {c}" for c in req.get("acceptance_criteria", []))}
**Constraints**:
{chr(10).join(f"- {c}" for c in req.get("constraints", []))}
"""

        if self.complexity_override:
            # Manual override
            comp = complexity.Complexity(self.complexity_override)
            self.assessment = complexity.ComplexityAssessment(
                complexity=comp,
                confidence=1.0,
                reasoning=f"Manual override: {self.complexity_override}",
            )
            print_status(f"Complexity override: {comp.value.upper()}", "success")
        elif self.use_ai_assessment:
            # Run AI assessment
            print_status("Running AI complexity assessment...", "progress")
            task_logger.log(
                "Analyzing task complexity with AI...",
                LogEntryType.INFO,
                LogPhase.PLANNING,
            )
            self.assessment = await complexity.run_ai_complexity_assessment(
                self.spec_dir,
                self.task_description,
                self._run_agent,
            )

            if self.assessment:
                print_status(
                    f"AI assessed complexity: {highlight(self.assessment.complexity.value.upper())}",
                    "success",
                )
                print_key_value("Confidence", f"{self.assessment.confidence:.0%}")
                print_key_value("Reasoning", self.assessment.reasoning)

                if self.assessment.needs_research:
                    print(f"  {muted('→ Research phase enabled')}")
                if self.assessment.needs_self_critique:
                    print(f"  {muted('→ Self-critique phase enabled')}")
            else:
                # Fall back to heuristic assessment
                print_status(
                    "AI assessment failed, falling back to heuristics...", "warning"
                )
                self.assessment = self._heuristic_assessment()
        else:
            # Use heuristic assessment
            self.assessment = self._heuristic_assessment()
            print_status(
                f"Assessed complexity: {highlight(self.assessment.complexity.value.upper())}",
                "success",
            )
            print_key_value("Confidence", f"{self.assessment.confidence:.0%}")
            print_key_value("Reasoning", self.assessment.reasoning)

        # Show what phases will run
        phase_list = self.assessment.phases_to_run()
        print()
        print(f"  Phases to run ({highlight(str(len(phase_list)))}):")
        for i, phase in enumerate(phase_list, 1):
            print(f"    {i}. {phase}")

        # Save assessment
        if not assessment_file.exists():
            complexity.save_assessment(self.spec_dir, self.assessment, self.dev_mode)

        return phases.PhaseResult(
            "complexity_assessment", True, [str(assessment_file)], [], 0
        )

    def _heuristic_assessment(self) -> complexity.ComplexityAssessment:
        """Fall back to heuristic-based complexity assessment."""
        project_index = {}
        auto_build_index = self.project_dir / "auto-claude" / "project_index.json"
        if auto_build_index.exists():
            with open(auto_build_index) as f:
                project_index = json.load(f)

        analyzer = complexity.ComplexityAnalyzer(project_index)
        return analyzer.analyze(self.task_description or "")
