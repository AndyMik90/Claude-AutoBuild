"""
Phase Execution Module
=======================

Individual phase implementations for spec creation pipeline.
"""

import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from task_logger import LogEntryType, LogPhase

# Import submodules
from . import context, discovery, requirements, validator, writer


@dataclass
class PhaseResult:
    """Result of a phase execution."""

    phase: str
    success: bool
    output_files: list[str]
    errors: list[str]
    retries: int


MAX_RETRIES = 3


class PhaseExecutor:
    """Executes individual phases of spec creation."""

    def __init__(
        self,
        project_dir: Path,
        spec_dir: Path,
        task_description: str,
        spec_validator,
        run_agent_fn,
        task_logger,
        ui_module,
    ):
        self.project_dir = project_dir
        self.spec_dir = spec_dir
        self.task_description = task_description
        self.spec_validator = spec_validator
        self.run_agent_fn = run_agent_fn
        self.task_logger = task_logger
        self.ui = ui_module

    async def phase_discovery(self) -> PhaseResult:
        """Analyze project structure."""
        errors = []
        retries = 0

        for attempt in range(MAX_RETRIES):
            retries = attempt

            success, output = discovery.run_discovery_script(
                self.project_dir,
                self.spec_dir,
            )

            if success:
                stats = discovery.get_project_index_stats(self.spec_dir)
                if stats:
                    self.task_logger.log(
                        f"Discovered {stats.get('file_count', 0)} files in project",
                        LogEntryType.SUCCESS,
                        LogPhase.PLANNING,
                    )
                self.ui.print_status("Created project_index.json", "success")
                spec_index = self.spec_dir / "project_index.json"
                return PhaseResult("discovery", True, [str(spec_index)], [], retries)

            errors.append(f"Attempt {attempt + 1}: {output}")
            self.task_logger.log(
                f"Discovery attempt {attempt + 1} failed",
                LogEntryType.ERROR,
                LogPhase.PLANNING,
            )
            self.ui.print_status(
                f"Attempt {attempt + 1} failed: {output[:200]}", "error"
            )

        return PhaseResult("discovery", False, [], errors, retries)

    async def phase_historical_context(self) -> PhaseResult:
        """Retrieve historical context from Graphiti knowledge graph (if enabled)."""
        from graphiti_providers import get_graph_hints, is_graphiti_enabled

        hints_file = self.spec_dir / "graph_hints.json"

        if hints_file.exists():
            self.ui.print_status("graph_hints.json already exists", "success")
            self.task_logger.log(
                "Historical context already available",
                LogEntryType.SUCCESS,
                LogPhase.PLANNING,
            )
            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        if not is_graphiti_enabled():
            self.ui.print_status(
                "Graphiti not enabled, skipping historical context", "info"
            )
            self.task_logger.log(
                "Knowledge graph not configured, skipping",
                LogEntryType.INFO,
                LogPhase.PLANNING,
            )
            validator.create_empty_hints(
                self.spec_dir,
                enabled=False,
                reason="Graphiti not configured",
            )
            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        # Get graph hints for this task
        task_query = self.task_description or ""

        # If we have requirements, use the full task description
        req = requirements.load_requirements(self.spec_dir)
        if req:
            task_query = req.get("task_description", task_query)

        if not task_query:
            self.ui.print_status(
                "No task description for graph query, skipping", "warning"
            )
            validator.create_empty_hints(
                self.spec_dir,
                enabled=True,
                reason="No task description available",
            )
            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        self.ui.print_status("Querying Graphiti knowledge graph...", "progress")
        self.task_logger.log(
            "Searching knowledge graph for relevant context...",
            LogEntryType.INFO,
            LogPhase.PLANNING,
        )

        try:
            hints = await get_graph_hints(
                query=task_query,
                project_id=str(self.project_dir),
                max_results=10,
            )

            # Save hints to file
            with open(hints_file, "w") as f:
                json.dump(
                    {
                        "enabled": True,
                        "query": task_query,
                        "hints": hints,
                        "hint_count": len(hints),
                        "created_at": datetime.now().isoformat(),
                    },
                    f,
                    indent=2,
                )

            if hints:
                self.ui.print_status(f"Retrieved {len(hints)} graph hints", "success")
                self.task_logger.log(
                    f"Found {len(hints)} relevant insights from past sessions",
                    LogEntryType.SUCCESS,
                    LogPhase.PLANNING,
                )
            else:
                self.ui.print_status("No relevant graph hints found", "info")

            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        except Exception as e:
            self.ui.print_status(f"Graph query failed: {e}", "warning")
            validator.create_empty_hints(
                self.spec_dir,
                enabled=True,
                reason=f"Error: {str(e)}",
            )
            return PhaseResult(
                "historical_context", True, [str(hints_file)], [str(e)], 0
            )

    async def phase_requirements(self, interactive: bool = True) -> PhaseResult:
        """Gather requirements from user or task description."""
        requirements_file = self.spec_dir / "requirements.json"

        if requirements_file.exists():
            self.ui.print_status("requirements.json already exists", "success")
            return PhaseResult("requirements", True, [str(requirements_file)], [], 0)

        # Non-interactive mode with task description
        if self.task_description and not interactive:
            req = requirements.create_requirements_from_task(self.task_description)
            requirements.save_requirements(self.spec_dir, req)
            self.ui.print_status(
                "Created requirements.json from task description", "success"
            )
            task_preview = (
                self.task_description[:100] + "..."
                if len(self.task_description) > 100
                else self.task_description
            )
            self.task_logger.log(
                f"Task: {task_preview}",
                LogEntryType.SUCCESS,
                LogPhase.PLANNING,
            )
            return PhaseResult("requirements", True, [str(requirements_file)], [], 0)

        # Interactive mode
        if interactive:
            try:
                self.task_logger.log(
                    "Gathering requirements interactively...",
                    LogEntryType.INFO,
                    LogPhase.PLANNING,
                )
                req = requirements.gather_requirements_interactively(self.ui)

                # Update task description for subsequent phases
                self.task_description = req["task_description"]

                requirements.save_requirements(self.spec_dir, req)
                self.ui.print_status("Created requirements.json", "success")
                return PhaseResult(
                    "requirements", True, [str(requirements_file)], [], 0
                )
            except (KeyboardInterrupt, EOFError):
                print()
                self.ui.print_status("Requirements gathering cancelled", "warning")
                return PhaseResult("requirements", False, [], ["User cancelled"], 0)

        # Fallback: create minimal requirements
        req = requirements.create_requirements_from_task(
            self.task_description or "Unknown task"
        )
        requirements.save_requirements(self.spec_dir, req)
        self.ui.print_status("Created minimal requirements.json", "success")
        return PhaseResult("requirements", True, [str(requirements_file)], [], 0)

    async def phase_quick_spec(self) -> PhaseResult:
        """Quick spec for simple tasks - combines context and spec in one step."""
        spec_file = self.spec_dir / "spec.md"
        plan_file = self.spec_dir / "implementation_plan.json"

        if spec_file.exists() and plan_file.exists():
            self.ui.print_status("Quick spec already exists", "success")
            return PhaseResult(
                "quick_spec", True, [str(spec_file), str(plan_file)], [], 0
            )

        errors = []
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running quick spec agent (attempt {attempt + 1})...", "progress"
            )

            context_str = f"""
**Task**: {self.task_description}
**Spec Directory**: {self.spec_dir}
**Complexity**: SIMPLE (1-2 files expected)

This is a SIMPLE task. Create a minimal spec and implementation plan directly.
No research or extensive analysis needed.

Create:
1. A concise spec.md with just the essential sections
2. A simple implementation_plan.json with 1-2 subtasks
"""
            success, output = await self.run_agent_fn(
                "spec_quick.md",
                additional_context=context_str,
            )

            if success and spec_file.exists():
                # Create minimal plan if agent didn't
                if not plan_file.exists():
                    writer.create_minimal_plan(self.spec_dir, self.task_description)

                self.ui.print_status("Quick spec created", "success")
                return PhaseResult(
                    "quick_spec", True, [str(spec_file), str(plan_file)], [], attempt
                )

            errors.append(f"Attempt {attempt + 1}: Quick spec agent failed")

        return PhaseResult("quick_spec", False, [], errors, MAX_RETRIES)

    async def phase_research(self) -> PhaseResult:
        """Research external integrations and validate assumptions."""
        research_file = self.spec_dir / "research.json"
        requirements_file = self.spec_dir / "requirements.json"

        if research_file.exists():
            self.ui.print_status("research.json already exists", "success")
            return PhaseResult("research", True, [str(research_file)], [], 0)

        if not requirements_file.exists():
            self.ui.print_status(
                "No requirements.json - skipping research phase", "warning"
            )
            validator.create_minimal_research(
                self.spec_dir,
                reason="No requirements file available",
            )
            return PhaseResult("research", True, [str(research_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running research agent (attempt {attempt + 1})...", "progress"
            )

            context_str = f"""
**Requirements File**: {requirements_file}
**Research Output**: {research_file}

Read the requirements.json to understand what integrations/libraries are needed.
Research each external dependency to validate:
- Correct package names
- Actual API patterns
- Configuration requirements
- Known issues or gotchas

Output your findings to research.json.
"""
            success, output = await self.run_agent_fn(
                "spec_researcher.md",
                additional_context=context_str,
            )

            if success and research_file.exists():
                self.ui.print_status("Created research.json", "success")
                return PhaseResult("research", True, [str(research_file)], [], attempt)

            if success and not research_file.exists():
                validator.create_minimal_research(
                    self.spec_dir,
                    reason="Agent completed but created no findings",
                )
                return PhaseResult("research", True, [str(research_file)], [], attempt)

            errors.append(f"Attempt {attempt + 1}: Research agent failed")

        validator.create_minimal_research(
            self.spec_dir,
            reason="Research agent failed after retries",
        )
        return PhaseResult("research", True, [str(research_file)], errors, MAX_RETRIES)

    async def phase_context(self) -> PhaseResult:
        """Discover relevant files for the task."""
        context_file = self.spec_dir / "context.json"

        if context_file.exists():
            self.ui.print_status("context.json already exists", "success")
            return PhaseResult("context", True, [str(context_file)], [], 0)

        # Load requirements for task description
        task = self.task_description
        services = []

        req = requirements.load_requirements(self.spec_dir)
        if req:
            task = req.get("task_description", task)
            services = req.get("services_involved", [])

        errors = []
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running context discovery (attempt {attempt + 1})...", "progress"
            )

            success, output = context.run_context_discovery(
                self.project_dir,
                self.spec_dir,
                task or "unknown task",
                services,
            )

            if success:
                stats = context.get_context_stats(self.spec_dir)
                if stats:
                    self.task_logger.log(
                        f"Found {stats.get('files_to_modify', 0)} files to modify, "
                        f"{stats.get('files_to_reference', 0)} files to reference",
                        LogEntryType.SUCCESS,
                        LogPhase.PLANNING,
                    )
                self.ui.print_status("Created context.json", "success")
                return PhaseResult("context", True, [str(context_file)], [], attempt)

            errors.append(f"Attempt {attempt + 1}: {output}")
            self.ui.print_status(f"Attempt {attempt + 1} failed", "error")

        # Create minimal context if script fails
        context.create_minimal_context(self.spec_dir, task or "unknown task", services)
        self.ui.print_status("Created minimal context.json (script failed)", "success")
        return PhaseResult("context", True, [str(context_file)], errors, MAX_RETRIES)

    async def phase_spec_writing(self) -> PhaseResult:
        """Write the spec.md document."""
        spec_file = self.spec_dir / "spec.md"

        if spec_file.exists():
            result = self.spec_validator.validate_spec_document()
            if result.valid:
                self.ui.print_status("spec.md already exists and is valid", "success")
                return PhaseResult("spec_writing", True, [str(spec_file)], [], 0)
            self.ui.print_status(
                "spec.md exists but has issues, regenerating...", "warning"
            )

        errors = []
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running spec writer (attempt {attempt + 1})...", "progress"
            )

            success, output = await self.run_agent_fn("spec_writer.md")

            if success and spec_file.exists():
                result = self.spec_validator.validate_spec_document()
                if result.valid:
                    self.ui.print_status("Created valid spec.md", "success")
                    return PhaseResult(
                        "spec_writing", True, [str(spec_file)], [], attempt
                    )
                else:
                    errors.append(
                        f"Attempt {attempt + 1}: Spec invalid - {result.errors}"
                    )
                    self.ui.print_status(
                        f"Spec created but invalid: {result.errors}", "error"
                    )
            else:
                errors.append(f"Attempt {attempt + 1}: Agent did not create spec.md")

        return PhaseResult("spec_writing", False, [], errors, MAX_RETRIES)

    async def phase_self_critique(self) -> PhaseResult:
        """Self-critique the spec using extended thinking."""
        spec_file = self.spec_dir / "spec.md"
        research_file = self.spec_dir / "research.json"
        critique_file = self.spec_dir / "critique_report.json"

        if not spec_file.exists():
            self.ui.print_status("No spec.md to critique", "error")
            return PhaseResult(
                "self_critique", False, [], ["spec.md does not exist"], 0
            )

        if critique_file.exists():
            with open(critique_file) as f:
                critique = json.load(f)
                if critique.get("issues_fixed", False) or critique.get(
                    "no_issues_found", False
                ):
                    self.ui.print_status("Self-critique already completed", "success")
                    return PhaseResult(
                        "self_critique", True, [str(critique_file)], [], 0
                    )

        errors = []
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running self-critique agent (attempt {attempt + 1})...", "progress"
            )

            context_str = f"""
**Spec File**: {spec_file}
**Research File**: {research_file}
**Critique Output**: {critique_file}

Use EXTENDED THINKING (ultrathink) to deeply analyze the spec.md:

1. **Technical Accuracy**: Do code examples match the research findings?
2. **Completeness**: Are all requirements covered? Edge cases handled?
3. **Consistency**: Do package names, APIs, and patterns match throughout?
4. **Feasibility**: Is the implementation approach realistic?

For each issue found:
- Fix it directly in spec.md
- Document what was fixed in critique_report.json

Output critique_report.json with:
{{
  "issues_found": [...],
  "issues_fixed": true/false,
  "no_issues_found": true/false,
  "critique_summary": "..."
}}
"""
            success, output = await self.run_agent_fn(
                "spec_critic.md",
                additional_context=context_str,
            )

            if success:
                if not critique_file.exists():
                    validator.create_minimal_critique(
                        self.spec_dir,
                        reason="Agent completed without explicit issues",
                    )

                result = self.spec_validator.validate_spec_document()
                if result.valid:
                    self.ui.print_status(
                        "Self-critique completed, spec is valid", "success"
                    )
                    return PhaseResult(
                        "self_critique", True, [str(critique_file)], [], attempt
                    )
                else:
                    self.ui.print_status(
                        f"Spec invalid after critique: {result.errors}", "warning"
                    )
                    errors.append(
                        f"Attempt {attempt + 1}: Spec still invalid after critique"
                    )
            else:
                errors.append(f"Attempt {attempt + 1}: Critique agent failed")

        validator.create_minimal_critique(
            self.spec_dir,
            reason="Critique failed after retries",
        )
        return PhaseResult(
            "self_critique", True, [str(critique_file)], errors, MAX_RETRIES
        )

    async def phase_planning(self) -> PhaseResult:
        """Create the implementation plan."""
        from validate_spec import auto_fix_plan

        plan_file = self.spec_dir / "implementation_plan.json"

        if plan_file.exists():
            result = self.spec_validator.validate_implementation_plan()
            if result.valid:
                self.ui.print_status(
                    "implementation_plan.json already exists and is valid", "success"
                )
                return PhaseResult("planning", True, [str(plan_file)], [], 0)
            self.ui.print_status("Plan exists but invalid, regenerating...", "warning")

        errors = []

        # Try Python script first (deterministic)
        self.ui.print_status("Trying planner.py (deterministic)...", "progress")
        success, output = self._run_script(
            "planner.py", ["--spec-dir", str(self.spec_dir)]
        )

        if success and plan_file.exists():
            result = self.spec_validator.validate_implementation_plan()
            if result.valid:
                self.ui.print_status(
                    "Created valid implementation_plan.json via script", "success"
                )
                stats = writer.get_plan_stats(self.spec_dir)
                if stats:
                    self.task_logger.log(
                        f"Implementation plan created with {stats.get('total_subtasks', 0)} subtasks",
                        LogEntryType.SUCCESS,
                        LogPhase.PLANNING,
                    )
                return PhaseResult("planning", True, [str(plan_file)], [], 0)
            else:
                if auto_fix_plan(self.spec_dir):
                    result = self.spec_validator.validate_implementation_plan()
                    if result.valid:
                        self.ui.print_status(
                            "Auto-fixed implementation_plan.json", "success"
                        )
                        return PhaseResult("planning", True, [str(plan_file)], [], 0)
                errors.append(f"Script output invalid: {result.errors}")

        # Fall back to agent
        self.ui.print_status("Falling back to planner agent...", "progress")
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running planner agent (attempt {attempt + 1})...", "progress"
            )

            success, output = await self.run_agent_fn("planner.md")

            if success and plan_file.exists():
                result = self.spec_validator.validate_implementation_plan()
                if result.valid:
                    self.ui.print_status(
                        "Created valid implementation_plan.json via agent", "success"
                    )
                    return PhaseResult("planning", True, [str(plan_file)], [], attempt)
                else:
                    if auto_fix_plan(self.spec_dir):
                        result = self.spec_validator.validate_implementation_plan()
                        if result.valid:
                            self.ui.print_status(
                                "Auto-fixed implementation_plan.json", "success"
                            )
                            return PhaseResult(
                                "planning", True, [str(plan_file)], [], attempt
                            )
                    errors.append(f"Agent attempt {attempt + 1}: {result.errors}")
                    self.ui.print_status("Plan created but invalid", "error")
            else:
                errors.append(f"Agent attempt {attempt + 1}: Did not create plan file")

        return PhaseResult("planning", False, [], errors, MAX_RETRIES)

    async def phase_validation(self) -> PhaseResult:
        """Final validation of all spec files with auto-fix retry."""
        for attempt in range(MAX_RETRIES):
            results = self.spec_validator.validate_all()
            all_valid = all(r.valid for r in results)

            for result in results:
                if result.valid:
                    self.ui.print_status(f"{result.checkpoint}: PASS", "success")
                else:
                    self.ui.print_status(f"{result.checkpoint}: FAIL", "error")
                for err in result.errors:
                    print(f"    {self.ui.muted('Error:')} {err}")

            if all_valid:
                print()
                self.ui.print_status("All validation checks passed", "success")
                return PhaseResult("validation", True, [], [], attempt)

            # If not valid, try to auto-fix with AI agent
            if attempt < MAX_RETRIES - 1:
                print()
                self.ui.print_status(
                    f"Attempting auto-fix (attempt {attempt + 1}/{MAX_RETRIES - 1})...",
                    "progress",
                )

                # Collect all errors for the fixer agent
                error_details = []
                for result in results:
                    if not result.valid:
                        error_details.append(
                            f"**{result.checkpoint}** validation failed:"
                        )
                        for err in result.errors:
                            error_details.append(f"  - {err}")
                        if result.fixes:
                            error_details.append("  Suggested fixes:")
                            for fix in result.fixes:
                                error_details.append(f"    - {fix}")

                context_str = f"""
**Spec Directory**: {self.spec_dir}

## Validation Errors to Fix

{chr(10).join(error_details)}

## Files in Spec Directory

The following files exist in the spec directory:
- context.json
- requirements.json
- spec.md
- implementation_plan.json
- project_index.json (if exists)

Read the failed files, understand the errors, and fix them.
"""
                success, output = await self.run_agent_fn(
                    "validation_fixer.md",
                    additional_context=context_str,
                )

                if not success:
                    self.ui.print_status("Auto-fix agent failed", "warning")

        # All retries exhausted
        errors = [f"{r.checkpoint}: {err}" for r in results for err in r.errors]
        return PhaseResult("validation", False, [], errors, MAX_RETRIES)

    def _run_script(self, script: str, args: list[str]) -> tuple[bool, str]:
        """Run a Python script and return (success, output)."""
        script_path = self.project_dir / "auto-claude" / script

        if not script_path.exists():
            return False, f"Script not found: {script_path}"

        cmd = [sys.executable, str(script_path)] + args

        try:
            result = subprocess.run(
                cmd,
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode == 0:
                return True, result.stdout
            else:
                return False, result.stderr or result.stdout

        except subprocess.TimeoutExpired:
            return False, "Script timed out"
        except Exception as e:
            return False, str(e)
