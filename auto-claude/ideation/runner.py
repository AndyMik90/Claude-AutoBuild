"""
Ideation Runner - Main orchestration logic.

Orchestrates the ideation creation process through multiple phases:
1. Project Index - Analyze project structure
2. Context & Graph Hints - Gather context in parallel
3. Ideation Generation - Generate ideas in parallel
4. Merge - Combine all outputs
"""

import asyncio
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from debug import (
    debug,
    debug_section,
)
from graphiti_providers import is_graphiti_enabled
from init import init_auto_claude_dir
from ui import (
    Icons,
    box,
    icon,
    muted,
    print_key_value,
    print_section,
    print_status,
)

from .analyzer import ProjectAnalyzer
from .formatter import IdeationFormatter
from .generator import IDEATION_TYPE_LABELS, IDEATION_TYPES, IdeationGenerator
from .prioritizer import IdeaPrioritizer

# Import ideation components
from .types import IdeationPhaseResult

# Configuration
MAX_RETRIES = 3


class IdeationOrchestrator:
    """Orchestrates the ideation creation process."""

    def __init__(
        self,
        project_dir: Path,
        output_dir: Path | None = None,
        enabled_types: list[str] | None = None,
        include_roadmap_context: bool = True,
        include_kanban_context: bool = True,
        max_ideas_per_type: int = 5,
        model: str = "claude-opus-4-5-20251101",
        refresh: bool = False,
        append: bool = False,
    ):
        self.project_dir = Path(project_dir)
        self.model = model
        self.refresh = refresh
        self.append = append  # Preserve existing ideas when merging
        self.enabled_types = enabled_types or IDEATION_TYPES.copy()
        self.include_roadmap_context = include_roadmap_context
        self.include_kanban_context = include_kanban_context
        self.max_ideas_per_type = max_ideas_per_type

        # Default output to project's .auto-claude directory (installed instance)
        # Note: auto-claude/ is source code, .auto-claude/ is the installed instance
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            # Initialize .auto-claude directory and ensure it's in .gitignore
            init_auto_claude_dir(self.project_dir)
            self.output_dir = self.project_dir / ".auto-claude" / "ideation"

        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Create screenshots directory for UI/UX analysis
        (self.output_dir / "screenshots").mkdir(exist_ok=True)

        # Initialize components
        self.generator = IdeationGenerator(
            self.project_dir,
            self.output_dir,
            self.model,
            self.max_ideas_per_type,
        )
        self.analyzer = ProjectAnalyzer(
            self.project_dir,
            self.output_dir,
            self.include_roadmap_context,
            self.include_kanban_context,
        )
        self.prioritizer = IdeaPrioritizer(self.output_dir)
        self.formatter = IdeationFormatter(self.output_dir, self.project_dir)

    def _run_script(self, script: str, args: list[str]) -> tuple[bool, str]:
        """Run a Python script and return (success, output)."""
        script_path = Path(__file__).parent.parent / script

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

    async def phase_graph_hints(self) -> IdeationPhaseResult:
        """Retrieve graph hints for all enabled ideation types in parallel.

        This phase runs concurrently with context gathering to fetch
        historical insights from Graphiti without slowing down the pipeline.
        """
        hints_file = self.output_dir / "graph_hints.json"

        if hints_file.exists():
            print_status("graph_hints.json already exists", "success")
            return IdeationPhaseResult(
                phase="graph_hints",
                ideation_type=None,
                success=True,
                output_files=[str(hints_file)],
                ideas_count=0,
                errors=[],
                retries=0,
            )

        if not is_graphiti_enabled():
            print_status("Graphiti not enabled, skipping graph hints", "info")
            with open(hints_file, "w") as f:
                json.dump(
                    {
                        "enabled": False,
                        "reason": "Graphiti not configured",
                        "hints_by_type": {},
                        "created_at": datetime.now().isoformat(),
                    },
                    f,
                    indent=2,
                )
            return IdeationPhaseResult(
                phase="graph_hints",
                ideation_type=None,
                success=True,
                output_files=[str(hints_file)],
                ideas_count=0,
                errors=[],
                retries=0,
            )

        print_status("Querying Graphiti for ideation hints...", "progress")

        # Fetch hints for all enabled types in parallel
        hint_tasks = [
            self.analyzer.get_graph_hints(ideation_type)
            for ideation_type in self.enabled_types
        ]

        results = await asyncio.gather(*hint_tasks, return_exceptions=True)

        # Collect hints by type
        hints_by_type = {}
        total_hints = 0
        errors = []

        for i, result in enumerate(results):
            ideation_type = self.enabled_types[i]
            if isinstance(result, Exception):
                errors.append(f"{ideation_type}: {str(result)}")
                hints_by_type[ideation_type] = []
            else:
                hints_by_type[ideation_type] = result
                total_hints += len(result)

        # Save hints
        with open(hints_file, "w") as f:
            json.dump(
                {
                    "enabled": True,
                    "hints_by_type": hints_by_type,
                    "total_hints": total_hints,
                    "created_at": datetime.now().isoformat(),
                },
                f,
                indent=2,
            )

        if total_hints > 0:
            print_status(
                f"Retrieved {total_hints} graph hints across {len(self.enabled_types)} types",
                "success",
            )
        else:
            print_status("No relevant graph hints found", "info")

        return IdeationPhaseResult(
            phase="graph_hints",
            ideation_type=None,
            success=True,
            output_files=[str(hints_file)],
            ideas_count=0,
            errors=errors,
            retries=0,
        )

    async def phase_context(self) -> IdeationPhaseResult:
        """Create ideation context file."""

        context_file = self.output_dir / "ideation_context.json"

        print_status("Gathering project context...", "progress")

        context = self.analyzer.gather_context()

        # Check for graph hints and include them
        hints_file = self.output_dir / "graph_hints.json"
        graph_hints = {}
        if hints_file.exists():
            try:
                with open(hints_file) as f:
                    hints_data = json.load(f)
                    graph_hints = hints_data.get("hints_by_type", {})
            except (OSError, json.JSONDecodeError):
                pass

        # Write context file
        context_data = {
            "existing_features": context["existing_features"],
            "tech_stack": context["tech_stack"],
            "target_audience": context["target_audience"],
            "planned_features": context["planned_features"],
            "graph_hints": graph_hints,  # Include graph hints in context
            "config": {
                "enabled_types": self.enabled_types,
                "include_roadmap_context": self.include_roadmap_context,
                "include_kanban_context": self.include_kanban_context,
                "max_ideas_per_type": self.max_ideas_per_type,
            },
            "created_at": datetime.now().isoformat(),
        }

        with open(context_file, "w") as f:
            json.dump(context_data, f, indent=2)

        print_status("Created ideation_context.json", "success")
        print_key_value("Tech Stack", ", ".join(context["tech_stack"][:5]) or "Unknown")
        print_key_value("Planned Features", str(len(context["planned_features"])))
        print_key_value(
            "Target Audience", context["target_audience"] or "Not specified"
        )
        if graph_hints:
            total_hints = sum(len(h) for h in graph_hints.values())
            print_key_value("Graph Hints", str(total_hints))

        return IdeationPhaseResult(
            phase="context",
            ideation_type=None,
            success=True,
            output_files=[str(context_file)],
            ideas_count=0,
            errors=[],
            retries=0,
        )

    async def phase_project_index(self) -> IdeationPhaseResult:
        """Ensure project index exists."""

        project_index = self.output_dir / "project_index.json"
        auto_build_index = self.project_dir / ".auto-claude" / "project_index.json"

        # Check if we can copy existing index
        if auto_build_index.exists():
            import shutil

            shutil.copy(auto_build_index, project_index)
            print_status("Copied existing project_index.json", "success")
            return IdeationPhaseResult(
                "project_index", None, True, [str(project_index)], 0, [], 0
            )

        if project_index.exists() and not self.refresh:
            print_status("project_index.json already exists", "success")
            return IdeationPhaseResult(
                "project_index", None, True, [str(project_index)], 0, [], 0
            )

        # Run analyzer
        print_status("Running project analyzer...", "progress")
        success, output = self._run_script(
            "analyzer.py", ["--output", str(project_index)]
        )

        if success and project_index.exists():
            print_status("Created project_index.json", "success")
            return IdeationPhaseResult(
                "project_index", None, True, [str(project_index)], 0, [], 0
            )

        return IdeationPhaseResult("project_index", None, False, [], 0, [output], 1)

    async def phase_ideation_type(self, ideation_type: str) -> IdeationPhaseResult:
        """Run ideation for a specific type."""

        prompt_file = self.generator.get_prompt_file(ideation_type)
        if not prompt_file:
            return IdeationPhaseResult(
                phase="ideation",
                ideation_type=ideation_type,
                success=False,
                output_files=[],
                ideas_count=0,
                errors=[f"Unknown ideation type: {ideation_type}"],
                retries=0,
            )

        output_file = self.output_dir / f"{ideation_type}_ideas.json"

        if output_file.exists() and not self.refresh:
            # Load and validate existing ideas - only skip if we have valid ideas
            try:
                with open(output_file) as f:
                    data = json.load(f)
                    count = len(data.get(ideation_type, []))

                if count >= 1:
                    # Valid ideas exist, skip regeneration
                    print_status(
                        f"{ideation_type}_ideas.json already exists ({count} ideas)",
                        "success",
                    )
                    return IdeationPhaseResult(
                        phase="ideation",
                        ideation_type=ideation_type,
                        success=True,
                        output_files=[str(output_file)],
                        ideas_count=count,
                        errors=[],
                        retries=0,
                    )
                else:
                    # File exists but has no valid ideas - needs regeneration
                    print_status(
                        f"{ideation_type}_ideas.json exists but has 0 ideas, regenerating...",
                        "warning",
                    )
            except (json.JSONDecodeError, KeyError):
                # Invalid file - will regenerate
                print_status(
                    f"{ideation_type}_ideas.json exists but is invalid, regenerating...",
                    "warning",
                )

        errors = []

        # First attempt: run the full ideation agent
        print_status(
            f"Running {self.generator.get_type_label(ideation_type)} agent...",
            "progress",
        )

        context = f"""
**Ideation Context**: {self.output_dir / "ideation_context.json"}
**Project Index**: {self.output_dir / "project_index.json"}
**Output File**: {output_file}
**Max Ideas**: {self.max_ideas_per_type}

Generate up to {self.max_ideas_per_type} {self.generator.get_type_label(ideation_type)} ideas.
Avoid duplicating features that are already planned (see ideation_context.json).
Output your ideas to {output_file.name}.
"""
        success, output = await self.generator.run_agent(
            prompt_file,
            additional_context=context,
        )

        # Validate the output
        validation_result = self.prioritizer.validate_ideation_output(
            output_file, ideation_type
        )

        if validation_result["success"]:
            print_status(
                f"Created {output_file.name} ({validation_result['count']} ideas)",
                "success",
            )
            return IdeationPhaseResult(
                phase="ideation",
                ideation_type=ideation_type,
                success=True,
                output_files=[str(output_file)],
                ideas_count=validation_result["count"],
                errors=[],
                retries=0,
            )

        errors.append(validation_result["error"])

        # Recovery attempts: show the current state and ask AI to fix it
        for recovery_attempt in range(MAX_RETRIES - 1):
            print_status(
                f"Running recovery agent (attempt {recovery_attempt + 1})...", "warning"
            )

            recovery_success = await self.generator.run_recovery_agent(
                output_file,
                ideation_type,
                validation_result["error"],
                validation_result.get("current_content", ""),
            )

            if recovery_success:
                # Re-validate after recovery
                validation_result = self.prioritizer.validate_ideation_output(
                    output_file, ideation_type
                )

                if validation_result["success"]:
                    print_status(
                        f"Recovery successful: {output_file.name} ({validation_result['count']} ideas)",
                        "success",
                    )
                    return IdeationPhaseResult(
                        phase="ideation",
                        ideation_type=ideation_type,
                        success=True,
                        output_files=[str(output_file)],
                        ideas_count=validation_result["count"],
                        errors=[],
                        retries=recovery_attempt + 1,
                    )
                else:
                    errors.append(
                        f"Recovery {recovery_attempt + 1}: {validation_result['error']}"
                    )
            else:
                errors.append(f"Recovery {recovery_attempt + 1}: Agent failed to run")

        return IdeationPhaseResult(
            phase="ideation",
            ideation_type=ideation_type,
            success=False,
            output_files=[],
            ideas_count=0,
            errors=errors,
            retries=MAX_RETRIES,
        )

    async def phase_merge(self) -> IdeationPhaseResult:
        """Merge all ideation outputs into a single ideation.json."""

        # Load context for metadata
        context_data = self.formatter.load_context()

        # Merge all outputs
        ideation_file, total_ideas = self.formatter.merge_ideation_outputs(
            self.enabled_types,
            context_data,
            self.append,
        )

        return IdeationPhaseResult(
            phase="merge",
            ideation_type=None,
            success=True,
            output_files=[str(ideation_file)],
            ideas_count=total_ideas,
            errors=[],
            retries=0,
        )

    async def _run_ideation_type_with_streaming(
        self, ideation_type: str
    ) -> IdeationPhaseResult:
        """Run a single ideation type and stream results when complete."""
        result = await self.phase_ideation_type(ideation_type)

        if result.success:
            # Signal that this type is complete - UI can now show these ideas
            print(f"IDEATION_TYPE_COMPLETE:{ideation_type}:{result.ideas_count}")
            sys.stdout.flush()
        else:
            print(f"IDEATION_TYPE_FAILED:{ideation_type}")
            sys.stdout.flush()

        return result

    async def run(self) -> bool:
        """Run the complete ideation generation process."""

        debug_section("ideation_runner", "Starting Ideation Generation")
        debug(
            "ideation_runner",
            "Configuration",
            project_dir=str(self.project_dir),
            output_dir=str(self.output_dir),
            model=self.model,
            enabled_types=self.enabled_types,
            refresh=self.refresh,
            append=self.append,
        )

        print(
            box(
                f"Project: {self.project_dir}\n"
                f"Output: {self.output_dir}\n"
                f"Model: {self.model}\n"
                f"Types: {', '.join(self.enabled_types)}",
                title="IDEATION GENERATOR",
                style="heavy",
            )
        )

        results = []

        # Phase 1: Project Index
        debug("ideation_runner", "Starting Phase 1: Project Analysis")
        print_section("PHASE 1: PROJECT ANALYSIS", Icons.FOLDER)
        result = await self.phase_project_index()
        results.append(result)
        if not result.success:
            print_status("Project analysis failed", "error")
            return False

        # Phase 2: Context & Graph Hints (in parallel)
        print_section("PHASE 2: CONTEXT & GRAPH HINTS (PARALLEL)", Icons.SEARCH)

        # Run context gathering and graph hints in parallel
        context_task = self.phase_context()
        hints_task = self.phase_graph_hints()
        context_result, hints_result = await asyncio.gather(context_task, hints_task)

        results.append(hints_result)
        results.append(context_result)

        if not context_result.success:
            print_status("Context gathering failed", "error")
            return False
        # Note: hints_result.success is always True (graceful degradation)

        # Phase 3: Run all ideation types IN PARALLEL
        debug(
            "ideation_runner",
            "Starting Phase 3: Generating Ideas",
            types=self.enabled_types,
            parallel=True,
        )
        print_section("PHASE 3: GENERATING IDEAS (PARALLEL)", Icons.SUBTASK)
        print_status(
            f"Starting {len(self.enabled_types)} ideation agents in parallel...",
            "progress",
        )

        # Create tasks for all enabled types
        ideation_tasks = [
            self._run_ideation_type_with_streaming(ideation_type)
            for ideation_type in self.enabled_types
        ]

        # Run all ideation types concurrently
        ideation_results = await asyncio.gather(*ideation_tasks, return_exceptions=True)

        # Process results
        for i, result in enumerate(ideation_results):
            ideation_type = self.enabled_types[i]
            if isinstance(result, Exception):
                print_status(
                    f"{IDEATION_TYPE_LABELS[ideation_type]} ideation failed with exception: {result}",
                    "error",
                )
                results.append(
                    IdeationPhaseResult(
                        phase="ideation",
                        ideation_type=ideation_type,
                        success=False,
                        output_files=[],
                        ideas_count=0,
                        errors=[str(result)],
                        retries=0,
                    )
                )
            else:
                results.append(result)
                if result.success:
                    print_status(
                        f"{IDEATION_TYPE_LABELS[ideation_type]}: {result.ideas_count} ideas",
                        "success",
                    )
                else:
                    print_status(
                        f"{IDEATION_TYPE_LABELS[ideation_type]} ideation failed",
                        "warning",
                    )
                    for err in result.errors:
                        print(f"  {muted('Error:')} {err}")

        # Final Phase: Merge
        print_section("PHASE 4: MERGE & FINALIZE", Icons.SUCCESS)
        result = await self.phase_merge()
        results.append(result)

        # Summary
        ideation_file = self.output_dir / "ideation.json"
        if ideation_file.exists():
            with open(ideation_file) as f:
                ideation = json.load(f)

            ideas = ideation.get("ideas", [])
            summary = ideation.get("summary", {})
            by_type = summary.get("by_type", {})

            print(
                box(
                    f"Total Ideas: {len(ideas)}\n\n"
                    f"By Type:\n"
                    + "\n".join(
                        f"  {icon(Icons.ARROW_RIGHT)} {IDEATION_TYPE_LABELS.get(t, t)}: {c}"
                        for t, c in by_type.items()
                    )
                    + f"\n\nIdeation saved to: {ideation_file}",
                    title=f"{icon(Icons.SUCCESS)} IDEATION COMPLETE",
                    style="heavy",
                )
            )

        return True
