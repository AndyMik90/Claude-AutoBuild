"""
Phase execution logic for ideation generation.

Contains methods for executing individual phases of the ideation pipeline:
- Project index phase
- Context gathering phase
- Graph hints phase
- Ideation type generation phase
- Merge phase
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path

from debug import debug, debug_error, debug_success
from ui import print_key_value, print_status

from .types import IdeationPhaseResult


class PhaseExecutor:
    """Executes individual phases of the ideation pipeline."""

    def __init__(
        self,
        output_dir: Path,
        generator,
        analyzer,
        prioritizer,
        formatter,
        enabled_types: list[str],
        max_ideas_per_type: int,
        refresh: bool,
        append: bool,
    ):
        """Initialize the phase executor.

        Args:
            output_dir: Directory for output files
            generator: IdeationGenerator instance
            analyzer: ProjectAnalyzer instance
            prioritizer: IdeaPrioritizer instance
            formatter: IdeationFormatter instance
            enabled_types: List of enabled ideation types
            max_ideas_per_type: Maximum ideas to generate per type
            refresh: Force regeneration of existing files
            append: Preserve existing ideas when merging
        """
        self.output_dir = output_dir
        self.generator = generator
        self.analyzer = analyzer
        self.prioritizer = prioritizer
        self.formatter = formatter
        self.enabled_types = enabled_types
        self.max_ideas_per_type = max_ideas_per_type
        self.refresh = refresh
        self.append = append

    async def execute_graph_hints(self) -> IdeationPhaseResult:
        """Retrieve graph hints for all enabled ideation types in parallel.

        This phase runs concurrently with context gathering to fetch
        historical insights from Graphiti without slowing down the pipeline.

        Returns:
            IdeationPhaseResult with graph hints data
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

        # Check if Graphiti is enabled
        from graphiti_providers import is_graphiti_enabled

        if not is_graphiti_enabled():
            print_status("Graphiti not enabled, skipping graph hints", "info")
            debug(
                "phase_executor",
                "Writing graph_hints.json (Graphiti disabled)",
                file_path=str(hints_file),
            )
            try:
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
                # Verify file was written
                if not hints_file.exists():
                    raise OSError(f"File was not created: {hints_file}")
                debug_success(
                    "phase_executor",
                    "Successfully wrote graph_hints.json",
                    file_path=str(hints_file),
                    file_size=hints_file.stat().st_size,
                )
            except OSError as e:
                debug_error(
                    "phase_executor",
                    "Failed to write graph_hints.json",
                    file_path=str(hints_file),
                    error=str(e),
                )
                return IdeationPhaseResult(
                    phase="graph_hints",
                    ideation_type=None,
                    success=False,
                    output_files=[],
                    ideas_count=0,
                    errors=[f"Failed to write graph_hints.json: {e}"],
                    retries=0,
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
        debug(
            "phase_executor",
            "Writing graph_hints.json (Graphiti enabled)",
            file_path=str(hints_file),
            total_hints=total_hints,
        )
        try:
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
            # Verify file was written
            if not hints_file.exists():
                raise OSError(f"File was not created: {hints_file}")
            debug_success(
                "phase_executor",
                "Successfully wrote graph_hints.json",
                file_path=str(hints_file),
                file_size=hints_file.stat().st_size,
                total_hints=total_hints,
            )
        except OSError as e:
            debug_error(
                "phase_executor",
                "Failed to write graph_hints.json",
                file_path=str(hints_file),
                error=str(e),
            )
            errors.append(f"Failed to write graph_hints.json: {e}")
            return IdeationPhaseResult(
                phase="graph_hints",
                ideation_type=None,
                success=False,
                output_files=[],
                ideas_count=0,
                errors=errors,
                retries=0,
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

    async def execute_context(self) -> IdeationPhaseResult:
        """Create ideation context file.

        Returns:
            IdeationPhaseResult with context data
        """
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
                "include_roadmap_context": self.analyzer.include_roadmap,
                "include_kanban_context": self.analyzer.include_kanban,
                "max_ideas_per_type": self.max_ideas_per_type,
            },
            "created_at": datetime.now().isoformat(),
        }

        debug(
            "phase_executor",
            "Writing ideation_context.json",
            file_path=str(context_file),
        )
        try:
            with open(context_file, "w") as f:
                json.dump(context_data, f, indent=2)
            # Verify file was written
            if not context_file.exists():
                raise OSError(f"File was not created: {context_file}")
            debug_success(
                "phase_executor",
                "Successfully wrote ideation_context.json",
                file_path=str(context_file),
                file_size=context_file.stat().st_size,
            )
        except OSError as e:
            debug_error(
                "phase_executor",
                "Failed to write ideation_context.json",
                file_path=str(context_file),
                error=str(e),
            )
            return IdeationPhaseResult(
                phase="context",
                ideation_type=None,
                success=False,
                output_files=[],
                ideas_count=0,
                errors=[f"Failed to write ideation_context.json: {e}"],
                retries=0,
            )

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

    async def execute_ideation_type(
        self, ideation_type: str, max_retries: int = 3
    ) -> IdeationPhaseResult:
        """Run ideation for a specific type.

        Args:
            ideation_type: Type of ideation to run
            max_retries: Maximum number of recovery attempts

        Returns:
            IdeationPhaseResult with ideation data
        """
        debug(
            "phase_executor",
            f"Starting ideation for type: {ideation_type}",
            ideation_type=ideation_type,
            max_retries=max_retries,
        )

        prompt_file = self.generator.get_prompt_file(ideation_type)
        if not prompt_file:
            debug_error(
                "phase_executor",
                f"Unknown ideation type: {ideation_type}",
                ideation_type=ideation_type,
            )
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

        debug(
            "phase_executor",
            f"Agent run completed for {ideation_type}",
            ideation_type=ideation_type,
            agent_success=success,
            output_file_exists=output_file.exists(),
        )

        # Validate the output
        validation_result = self.prioritizer.validate_ideation_output(
            output_file, ideation_type
        )

        debug(
            "phase_executor",
            f"Validation result for {ideation_type}",
            ideation_type=ideation_type,
            validation_success=validation_result["success"],
            ideas_count=validation_result.get("count", 0),
            validation_error=validation_result.get("error"),
        )

        if validation_result["success"]:
            debug_success(
                "phase_executor",
                f"Ideation successful for {ideation_type}",
                ideation_type=ideation_type,
                ideas_count=validation_result["count"],
                output_file=str(output_file),
            )
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

        debug_error(
            "phase_executor",
            f"Initial validation failed for {ideation_type}, starting recovery",
            ideation_type=ideation_type,
            error=validation_result["error"],
        )
        errors.append(validation_result["error"])

        # Recovery attempts: show the current state and ask AI to fix it
        for recovery_attempt in range(max_retries - 1):
            debug(
                "phase_executor",
                f"Starting recovery attempt {recovery_attempt + 1} for {ideation_type}",
                ideation_type=ideation_type,
                attempt=recovery_attempt + 1,
                max_attempts=max_retries - 1,
            )
            print_status(
                f"Running recovery agent (attempt {recovery_attempt + 1})...", "warning"
            )

            recovery_success = await self.generator.run_recovery_agent(
                output_file,
                ideation_type,
                validation_result["error"],
                validation_result.get("current_content", ""),
            )

            debug(
                "phase_executor",
                f"Recovery agent completed for {ideation_type}",
                ideation_type=ideation_type,
                attempt=recovery_attempt + 1,
                recovery_success=recovery_success,
            )

            if recovery_success:
                # Re-validate after recovery
                validation_result = self.prioritizer.validate_ideation_output(
                    output_file, ideation_type
                )

                if validation_result["success"]:
                    debug_success(
                        "phase_executor",
                        f"Recovery successful for {ideation_type}",
                        ideation_type=ideation_type,
                        attempt=recovery_attempt + 1,
                        ideas_count=validation_result["count"],
                    )
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
                    debug_error(
                        "phase_executor",
                        f"Recovery validation failed for {ideation_type}",
                        ideation_type=ideation_type,
                        attempt=recovery_attempt + 1,
                        error=validation_result["error"],
                    )
                    errors.append(
                        f"Recovery {recovery_attempt + 1}: {validation_result['error']}"
                    )
            else:
                debug_error(
                    "phase_executor",
                    f"Recovery agent failed to run for {ideation_type}",
                    ideation_type=ideation_type,
                    attempt=recovery_attempt + 1,
                )
                errors.append(f"Recovery {recovery_attempt + 1}: Agent failed to run")

        debug_error(
            "phase_executor",
            f"All recovery attempts failed for {ideation_type}",
            ideation_type=ideation_type,
            total_errors=len(errors),
            errors=errors,
        )
        return IdeationPhaseResult(
            phase="ideation",
            ideation_type=ideation_type,
            success=False,
            output_files=[],
            ideas_count=0,
            errors=errors,
            retries=max_retries,
        )

    async def execute_merge(self) -> IdeationPhaseResult:
        """Merge all ideation outputs into a single ideation.json.

        Returns:
            IdeationPhaseResult with merged data
        """
        debug(
            "phase_executor",
            "Starting merge phase",
            enabled_types=self.enabled_types,
            append=self.append,
        )

        try:
            # Load context for metadata
            context_data = self.formatter.load_context()

            debug(
                "phase_executor",
                "Loaded context data for merge",
                context_loaded=context_data is not None,
            )

            # Merge all outputs
            ideation_file, total_ideas = self.formatter.merge_ideation_outputs(
                self.enabled_types,
                context_data,
                self.append,
            )

            # Verify the merge file was created
            if not ideation_file.exists():
                raise OSError(f"Merge file was not created: {ideation_file}")

            debug_success(
                "phase_executor",
                "Merge phase completed",
                output_file=str(ideation_file),
                file_size=ideation_file.stat().st_size,
                total_ideas=total_ideas,
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
        except Exception as e:
            # Catch all exceptions to ensure graceful failure and proper error reporting
            # The merge phase can fail from OSError, json.JSONDecodeError, KeyError, etc.
            debug_error(
                "phase_executor",
                "Merge phase failed",
                error=str(e),
                error_type=type(e).__name__,
            )
            return IdeationPhaseResult(
                phase="merge",
                ideation_type=None,
                success=False,
                output_files=[],
                ideas_count=0,
                errors=[f"Merge failed: {e}"],
                retries=0,
            )
