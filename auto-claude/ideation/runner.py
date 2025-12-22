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
import sys
from pathlib import Path

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from debug import debug, debug_error, debug_section, debug_success
from ui import Icons, box, icon, muted, print_section, print_status

from .config import IdeationConfigManager
from .generator import IDEATION_TYPE_LABELS
from .output_streamer import OutputStreamer
from .phase_executor import PhaseExecutor
from .project_index_phase import ProjectIndexPhase
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
        thinking_level: str = "medium",
        refresh: bool = False,
        append: bool = False,
    ):
        """Initialize the ideation orchestrator.

        Args:
            project_dir: Project directory to analyze
            output_dir: Output directory for ideation files (defaults to .auto-claude/ideation)
            enabled_types: List of ideation types to generate (defaults to all)
            include_roadmap_context: Include roadmap files in analysis
            include_kanban_context: Include kanban board in analysis
            max_ideas_per_type: Maximum ideas to generate per type
            model: Claude model to use
            thinking_level: Thinking level for extended reasoning
            refresh: Force regeneration of existing files
            append: Preserve existing ideas when merging
        """
        # Initialize configuration manager
        self.config_manager = IdeationConfigManager(
            project_dir=project_dir,
            output_dir=output_dir,
            enabled_types=enabled_types,
            include_roadmap_context=include_roadmap_context,
            include_kanban_context=include_kanban_context,
            max_ideas_per_type=max_ideas_per_type,
            model=model,
            thinking_level=thinking_level,
            refresh=refresh,
            append=append,
        )

        # Expose configuration for convenience
        self.project_dir = self.config_manager.project_dir
        self.output_dir = self.config_manager.output_dir
        self.model = self.config_manager.model
        self.refresh = self.config_manager.refresh
        self.append = self.config_manager.append
        self.enabled_types = self.config_manager.enabled_types
        self.max_ideas_per_type = self.config_manager.max_ideas_per_type

        # Initialize phase executor
        self.phase_executor = PhaseExecutor(
            output_dir=self.output_dir,
            generator=self.config_manager.generator,
            analyzer=self.config_manager.analyzer,
            prioritizer=self.config_manager.prioritizer,
            formatter=self.config_manager.formatter,
            enabled_types=self.enabled_types,
            max_ideas_per_type=self.max_ideas_per_type,
            refresh=self.refresh,
            append=self.append,
        )

        # Initialize project index phase
        self.project_index_phase = ProjectIndexPhase(
            self.project_dir, self.output_dir, self.refresh
        )

        # Initialize output streamer
        self.output_streamer = OutputStreamer()

    async def run(self) -> bool:
        """Run the complete ideation generation process.

        Returns:
            True if successful, False otherwise
        """
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

        # Diagnostic: Verify output directory exists or create it
        debug(
            "ideation_runner",
            "Verifying output directory",
            output_dir=str(self.output_dir),
            exists=self.output_dir.exists(),
        )
        if not self.output_dir.exists():
            debug("ideation_runner", "Creating output directory")
            self.output_dir.mkdir(parents=True, exist_ok=True)
            debug_success(
                "ideation_runner",
                "Output directory created",
                path=str(self.output_dir),
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
        result = await self.project_index_phase.execute()
        results.append(result)

        # Diagnostic: Log phase 1 result and file outputs
        self._log_phase_result("Phase 1: Project Analysis", result)

        if not result.success:
            debug_error(
                "ideation_runner",
                "Project analysis failed",
                errors=result.errors,
            )
            print_status("Project analysis failed", "error")
            return False

        # Phase 2: Context & Graph Hints (in parallel)
        debug("ideation_runner", "Starting Phase 2: Context & Graph Hints (parallel)")
        print_section("PHASE 2: CONTEXT & GRAPH HINTS (PARALLEL)", Icons.SEARCH)

        # Run context gathering and graph hints in parallel
        context_task = self.phase_executor.execute_context()
        hints_task = self.phase_executor.execute_graph_hints()
        context_result, hints_result = await asyncio.gather(context_task, hints_task)

        results.append(hints_result)
        results.append(context_result)

        # Diagnostic: Log phase 2 results and file outputs
        self._log_phase_result("Phase 2: Context Gathering", context_result)
        self._log_phase_result("Phase 2: Graph Hints", hints_result)

        if not context_result.success:
            debug_error(
                "ideation_runner",
                "Context gathering failed",
                errors=context_result.errors,
            )
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
            self.output_streamer.stream_ideation_result(
                ideation_type, self.phase_executor, MAX_RETRIES
            )
            for ideation_type in self.enabled_types
        ]

        # Run all ideation types concurrently
        ideation_results = await asyncio.gather(*ideation_tasks, return_exceptions=True)

        # Process results
        debug(
            "ideation_runner",
            "Processing Phase 3 results",
            total_results=len(ideation_results),
        )
        for i, result in enumerate(ideation_results):
            ideation_type = self.enabled_types[i]
            if isinstance(result, Exception):
                debug_error(
                    "ideation_runner",
                    f"Ideation type failed with exception",
                    ideation_type=ideation_type,
                    exception=str(result),
                )
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
                # Diagnostic: Log each ideation type result
                self._log_phase_result(f"Phase 3: {ideation_type}", result)

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
        debug("ideation_runner", "Starting Phase 4: Merge & Finalize")
        print_section("PHASE 4: MERGE & FINALIZE", Icons.SUCCESS)
        result = await self.phase_executor.execute_merge()
        results.append(result)

        # Diagnostic: Log merge result and verify final output file
        self._log_phase_result("Phase 4: Merge", result)
        self._verify_final_output()

        # Summary
        self._print_summary()

        debug_success(
            "ideation_runner",
            "Ideation generation complete",
            total_phases=len(results),
            successful_phases=sum(1 for r in results if r.success),
        )

        return True

    def _log_phase_result(self, phase_name: str, result: IdeationPhaseResult) -> None:
        """Log diagnostic information for a phase result.

        Args:
            phase_name: Human-readable name of the phase
            result: The phase result to log
        """
        # Check if output files actually exist on disk
        files_exist = {}
        for file_path in result.output_files:
            path = Path(file_path)
            files_exist[file_path] = {
                "exists": path.exists(),
                "size": path.stat().st_size if path.exists() else 0,
            }

        if result.success:
            debug_success(
                "ideation_runner",
                f"{phase_name} completed",
                success=result.success,
                output_files=result.output_files,
                files_verified=files_exist,
                ideas_count=result.ideas_count,
                retries=result.retries,
            )
        else:
            debug_error(
                "ideation_runner",
                f"{phase_name} failed",
                success=result.success,
                output_files=result.output_files,
                files_verified=files_exist,
                errors=result.errors,
                retries=result.retries,
            )

    def _verify_final_output(self) -> None:
        """Verify the final ideation.json output file exists and is valid.

        Logs diagnostic information about the file contents.
        """
        ideation_file = self.output_dir / "ideation.json"

        debug(
            "ideation_runner",
            "Verifying final output file",
            expected_path=str(ideation_file),
            exists=ideation_file.exists(),
        )

        if not ideation_file.exists():
            debug_error(
                "ideation_runner",
                "Final ideation.json file not found",
                expected_path=str(ideation_file),
                output_dir_contents=list(str(f) for f in self.output_dir.iterdir())
                if self.output_dir.exists()
                else [],
            )
            return

        try:
            with open(ideation_file) as f:
                data = json.load(f)

            ideas_count = len(data.get("ideas", []))
            summary = data.get("summary", {})
            by_type = summary.get("by_type", {})

            debug_success(
                "ideation_runner",
                "Final output file verified",
                path=str(ideation_file),
                file_size=ideation_file.stat().st_size,
                total_ideas=ideas_count,
                ideas_by_type=by_type,
            )
        except json.JSONDecodeError as e:
            debug_error(
                "ideation_runner",
                "Final ideation.json is invalid JSON",
                path=str(ideation_file),
                error=str(e),
            )
        except Exception as e:
            debug_error(
                "ideation_runner",
                "Error reading final ideation.json",
                path=str(ideation_file),
                error=str(e),
            )

    def _print_summary(self) -> None:
        """Print summary of ideation generation results."""
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
