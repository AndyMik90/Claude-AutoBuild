#!/usr/bin/env python3
"""
Roadmap Creation Orchestrator
=============================

AI-powered roadmap generation for projects.
Analyzes project structure, understands target audience, and generates
a strategic feature roadmap.

Usage:
    python auto-claude/roadmap_runner.py --project /path/to/project
    python auto-claude/roadmap_runner.py --project /path/to/project --refresh
    python auto-claude/roadmap_runner.py --project /path/to/project --output roadmap.json
"""

import asyncio
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent))

# Load .env file
from dotenv import load_dotenv

env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

from client import create_client
from debug import (
    debug,
    debug_detailed,
    debug_error,
    debug_section,
    debug_success,
    debug_warning,
)
from graphiti_providers import get_graph_hints, is_graphiti_enabled
from init import init_auto_claude_dir
from ui import (
    Icons,
    box,
    icon,
    muted,
    print_section,
    print_status,
)

# Configuration
MAX_RETRIES = 3
PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass
class RoadmapPhaseResult:
    """Result of a roadmap phase execution."""

    phase: str
    success: bool
    output_files: list[str]
    errors: list[str]
    retries: int


@dataclass
class RoadmapConfig:
    """Configuration for roadmap generation."""

    project_dir: Path
    output_dir: Path
    model: str = "claude-opus-4-5-20251101"
    refresh: bool = False  # Force regeneration even if roadmap exists
    enable_competitor_analysis: bool = False  # Enable competitor analysis phase


class RoadmapOrchestrator:
    """Orchestrates the roadmap creation process."""

    def __init__(
        self,
        project_dir: Path,
        output_dir: Path | None = None,
        model: str = "claude-opus-4-5-20251101",
        refresh: bool = False,
        enable_competitor_analysis: bool = False,
    ):
        self.project_dir = Path(project_dir)
        self.model = model
        self.refresh = refresh
        self.enable_competitor_analysis = enable_competitor_analysis

        # Default output to project's .auto-claude directory (installed instance)
        # Note: auto-claude/ is source code, .auto-claude/ is the installed instance
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            # Initialize .auto-claude directory and ensure it's in .gitignore
            init_auto_claude_dir(self.project_dir)
            self.output_dir = self.project_dir / ".auto-claude" / "roadmap"

        self.output_dir.mkdir(parents=True, exist_ok=True)

        debug_section("roadmap_runner", "Roadmap Orchestrator Initialized")
        debug(
            "roadmap_runner",
            "Configuration",
            project_dir=str(self.project_dir),
            output_dir=str(self.output_dir),
            model=self.model,
            refresh=self.refresh,
        )

    def _run_script(self, script: str, args: list[str]) -> tuple[bool, str]:
        """Run a Python script and return (success, output)."""
        script_path = Path(__file__).parent / script

        debug_detailed(
            "roadmap_runner",
            f"Running script: {script}",
            script_path=str(script_path),
            args=args,
        )

        if not script_path.exists():
            debug_error("roadmap_runner", f"Script not found: {script_path}")
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
                debug_success("roadmap_runner", f"Script completed: {script}")
                return True, result.stdout
            else:
                debug_error(
                    "roadmap_runner",
                    f"Script failed: {script}",
                    returncode=result.returncode,
                    stderr=result.stderr[:500] if result.stderr else None,
                )
                return False, result.stderr or result.stdout

        except subprocess.TimeoutExpired:
            debug_error("roadmap_runner", f"Script timed out: {script}")
            return False, "Script timed out"
        except Exception as e:
            debug_error("roadmap_runner", f"Script exception: {script}", error=str(e))
            return False, str(e)

    async def _run_agent(
        self,
        prompt_file: str,
        additional_context: str = "",
    ) -> tuple[bool, str]:
        """Run an agent with the given prompt."""
        prompt_path = PROMPTS_DIR / prompt_file

        debug_detailed(
            "roadmap_runner",
            f"Running agent with prompt: {prompt_file}",
            prompt_path=str(prompt_path),
            model=self.model,
        )

        if not prompt_path.exists():
            debug_error("roadmap_runner", f"Prompt file not found: {prompt_path}")
            return False, f"Prompt not found: {prompt_path}"

        # Load prompt
        prompt = prompt_path.read_text()
        debug_detailed(
            "roadmap_runner", "Loaded prompt file", prompt_length=len(prompt)
        )

        # Add context
        prompt += f"\n\n---\n\n**Output Directory**: {self.output_dir}\n"
        prompt += f"**Project Directory**: {self.project_dir}\n"

        if additional_context:
            prompt += f"\n{additional_context}\n"
            debug_detailed(
                "roadmap_runner",
                "Added additional context",
                context_length=len(additional_context),
            )

        # Create client
        debug(
            "roadmap_runner",
            "Creating Claude client",
            project_dir=str(self.project_dir),
            model=self.model,
        )
        client = create_client(self.project_dir, self.output_dir, self.model)

        try:
            async with client:
                debug("roadmap_runner", "Sending query to agent")
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
                            elif block_type == "ToolUseBlock" and hasattr(
                                block, "name"
                            ):
                                debug_detailed(
                                    "roadmap_runner", f"Tool called: {block.name}"
                                )
                                print(f"\n[Tool: {block.name}]", flush=True)

                print()
                debug_success(
                    "roadmap_runner",
                    f"Agent completed: {prompt_file}",
                    response_length=len(response_text),
                )
                return True, response_text

        except Exception as e:
            debug_error("roadmap_runner", f"Agent failed: {prompt_file}", error=str(e))
            return False, str(e)

    async def phase_graph_hints(self) -> RoadmapPhaseResult:
        """Retrieve graph hints for roadmap generation from Graphiti (if enabled).

        This is a lightweight integration - hints are optional and cached.
        """
        debug("roadmap_runner", "Starting phase: graph_hints")
        hints_file = self.output_dir / "graph_hints.json"

        if hints_file.exists() and not self.refresh:
            debug(
                "roadmap_runner",
                "graph_hints.json already exists, skipping",
                hints_file=str(hints_file),
            )
            print_status("graph_hints.json already exists", "success")
            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [], 0)

        if not is_graphiti_enabled():
            debug("roadmap_runner", "Graphiti not enabled, creating placeholder")
            print_status("Graphiti not enabled, skipping graph hints", "info")
            with open(hints_file, "w") as f:
                json.dump(
                    {
                        "enabled": False,
                        "reason": "Graphiti not configured",
                        "hints": [],
                        "created_at": datetime.now().isoformat(),
                    },
                    f,
                    indent=2,
                )
            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [], 0)

        debug("roadmap_runner", "Querying Graphiti for roadmap insights")
        print_status("Querying Graphiti for roadmap insights...", "progress")

        try:
            hints = await get_graph_hints(
                query="product roadmap features priorities and strategic direction",
                project_id=str(self.project_dir),
                max_results=10,
            )

            debug_success("roadmap_runner", f"Retrieved {len(hints)} graph hints")

            with open(hints_file, "w") as f:
                json.dump(
                    {
                        "enabled": True,
                        "hints": hints,
                        "hint_count": len(hints),
                        "created_at": datetime.now().isoformat(),
                    },
                    f,
                    indent=2,
                )

            if hints:
                print_status(f"Retrieved {len(hints)} graph hints", "success")
            else:
                print_status("No relevant graph hints found", "info")

            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [], 0)

        except Exception as e:
            debug_error("roadmap_runner", "Graph query failed", error=str(e))
            print_status(f"Graph query failed: {e}", "warning")
            with open(hints_file, "w") as f:
                json.dump(
                    {
                        "enabled": True,
                        "error": str(e),
                        "hints": [],
                        "created_at": datetime.now().isoformat(),
                    },
                    f,
                    indent=2,
                )
            return RoadmapPhaseResult(
                "graph_hints", True, [str(hints_file)], [str(e)], 0
            )

    async def phase_competitor_analysis(self, enable_competitor_analysis: bool = False) -> RoadmapPhaseResult:
        """Run competitor analysis to research competitors and user feedback (if enabled).

        This is an optional phase - it gracefully degrades if disabled or if analysis fails.
        Competitor insights enhance roadmap features but are not required.
        """
        analysis_file = self.output_dir / "competitor_analysis.json"

        # Check if competitor analysis is enabled
        if not enable_competitor_analysis:
            print_status("Competitor analysis not enabled, skipping", "info")
            # Write a minimal file indicating analysis was skipped
            with open(analysis_file, "w") as f:
                json.dump({
                    "enabled": False,
                    "reason": "Competitor analysis not enabled by user",
                    "competitors": [],
                    "market_gaps": [],
                    "insights_summary": {
                        "top_pain_points": [],
                        "differentiator_opportunities": [],
                        "market_trends": []
                    },
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return RoadmapPhaseResult("competitor_analysis", True, [str(analysis_file)], [], 0)

        # Check if already exists (skip if not refresh)
        if analysis_file.exists() and not self.refresh:
            print_status("competitor_analysis.json already exists", "success")
            return RoadmapPhaseResult("competitor_analysis", True, [str(analysis_file)], [], 0)

        # Check if discovery file exists (required for competitor analysis)
        discovery_file = self.output_dir / "roadmap_discovery.json"
        if not discovery_file.exists():
            print_status("Discovery file not found, skipping competitor analysis", "warning")
            with open(analysis_file, "w") as f:
                json.dump({
                    "enabled": True,
                    "error": "Discovery file not found - cannot analyze competitors without project context",
                    "competitors": [],
                    "market_gaps": [],
                    "insights_summary": {
                        "top_pain_points": [],
                        "differentiator_opportunities": [],
                        "market_trends": []
                    },
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return RoadmapPhaseResult("competitor_analysis", True, [str(analysis_file)], ["Discovery file not found"], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running competitor analysis agent (attempt {attempt + 1})...", "progress")

            context = f"""
**Discovery File**: {discovery_file}
**Project Index**: {self.output_dir / "project_index.json"}
**Output File**: {analysis_file}

Research competitors based on the project type and target audience from roadmap_discovery.json.
Use WebSearch to find competitors and analyze user feedback (reviews, complaints, feature requests).
Output your findings to competitor_analysis.json.
"""
            success, output = await self._run_agent(
                "competitor_analysis.md",
                additional_context=context,
            )

            if success and analysis_file.exists():
                # Validate JSON structure
                try:
                    with open(analysis_file) as f:
                        data = json.load(f)

                    # Check for required fields (gracefully accept minimal structure)
                    if "competitors" in data:
                        competitor_count = len(data.get("competitors", []))
                        pain_point_count = sum(
                            len(c.get("pain_points", []))
                            for c in data.get("competitors", [])
                        )
                        print_status(
                            f"Analyzed {competitor_count} competitors, found {pain_point_count} pain points",
                            "success"
                        )
                        return RoadmapPhaseResult("competitor_analysis", True, [str(analysis_file)], [], attempt)
                    else:
                        errors.append("Missing 'competitors' field in competitor_analysis.json")
                except json.JSONDecodeError as e:
                    errors.append(f"Invalid JSON: {e}")
            else:
                errors.append(f"Attempt {attempt + 1}: Agent did not create competitor analysis file")

        # Graceful degradation: if all retries fail, create empty analysis and continue
        print_status("Competitor analysis failed, continuing without competitor insights", "warning")
        for err in errors:
            print(f"  {muted('Error:')} {err}")

        with open(analysis_file, "w") as f:
            json.dump({
                "enabled": True,
                "error": "Analysis failed after retries",
                "errors": errors,
                "competitors": [],
                "market_gaps": [],
                "insights_summary": {
                    "top_pain_points": [],
                    "differentiator_opportunities": [],
                    "market_trends": []
                },
                "created_at": datetime.now().isoformat(),
            }, f, indent=2)

        # Return success=True for graceful degradation (don't block roadmap generation)
        return RoadmapPhaseResult("competitor_analysis", True, [str(analysis_file)], errors, MAX_RETRIES)

    async def phase_project_index(self) -> RoadmapPhaseResult:
        """Ensure project index exists."""
        debug("roadmap_runner", "Starting phase: project_index")

        project_index = self.output_dir / "project_index.json"
        auto_build_index = Path(__file__).parent / "project_index.json"

        debug_detailed(
            "roadmap_runner",
            "Checking for existing project index",
            project_index=str(project_index),
            auto_build_index=str(auto_build_index),
        )

        # Check if we can copy existing index
        if auto_build_index.exists() and not project_index.exists():
            import shutil

            debug(
                "roadmap_runner", "Copying existing project_index.json from auto-claude"
            )
            shutil.copy(auto_build_index, project_index)
            print_status("Copied existing project_index.json", "success")
            debug_success("roadmap_runner", "Project index copied successfully")
            return RoadmapPhaseResult(
                "project_index", True, [str(project_index)], [], 0
            )

        if project_index.exists() and not self.refresh:
            debug("roadmap_runner", "project_index.json already exists, skipping")
            print_status("project_index.json already exists", "success")
            return RoadmapPhaseResult(
                "project_index", True, [str(project_index)], [], 0
            )

        # Run analyzer
        debug("roadmap_runner", "Running project analyzer to create index")
        print_status("Running project analyzer...", "progress")
        success, output = self._run_script(
            "analyzer.py", ["--output", str(project_index)]
        )

        if success and project_index.exists():
            debug_success("roadmap_runner", "Created project_index.json")
            print_status("Created project_index.json", "success")
            return RoadmapPhaseResult(
                "project_index", True, [str(project_index)], [], 0
            )

        debug_error(
            "roadmap_runner",
            "Failed to create project index",
            output=output[:500] if output else None,
        )
        return RoadmapPhaseResult("project_index", False, [], [output], 1)

    async def phase_discovery(self) -> RoadmapPhaseResult:
        """Run discovery phase to understand project and audience."""
        debug("roadmap_runner", "Starting phase: discovery")

        discovery_file = self.output_dir / "roadmap_discovery.json"

        if discovery_file.exists() and not self.refresh:
            debug("roadmap_runner", "roadmap_discovery.json already exists, skipping")
            print_status("roadmap_discovery.json already exists", "success")
            return RoadmapPhaseResult("discovery", True, [str(discovery_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            debug("roadmap_runner", f"Discovery attempt {attempt + 1}/{MAX_RETRIES}")
            print_status(
                f"Running discovery agent (attempt {attempt + 1})...", "progress"
            )

            context = f"""
**Project Index**: {self.output_dir / "project_index.json"}
**Output Directory**: {self.output_dir}
**Output File**: {discovery_file}

IMPORTANT: This runs NON-INTERACTIVELY. Do NOT ask questions or wait for user input.

Your task:
1. Analyze the project (read README, code structure, git history)
2. Infer target audience, vision, and constraints from your analysis
3. IMMEDIATELY create {discovery_file} with your findings

Do NOT ask questions. Make educated inferences and create the file.
"""
            success, output = await self._run_agent(
                "roadmap_discovery.md",
                additional_context=context,
            )

            if success and discovery_file.exists():
                # Validate
                try:
                    with open(discovery_file) as f:
                        data = json.load(f)

                    required = ["project_name", "target_audience", "product_vision"]
                    missing = [k for k in required if k not in data]

                    if not missing:
                        debug_success(
                            "roadmap_runner",
                            "Created valid roadmap_discovery.json",
                            attempt=attempt + 1,
                        )
                        print_status("Created valid roadmap_discovery.json", "success")
                        return RoadmapPhaseResult(
                            "discovery", True, [str(discovery_file)], [], attempt
                        )
                    else:
                        debug_warning(
                            "roadmap_runner", f"Missing required fields: {missing}"
                        )
                        errors.append(f"Missing required fields: {missing}")
                except json.JSONDecodeError as e:
                    debug_error(
                        "roadmap_runner", "Invalid JSON in discovery file", error=str(e)
                    )
                    errors.append(f"Invalid JSON: {e}")
            else:
                debug_warning(
                    "roadmap_runner",
                    f"Discovery attempt {attempt + 1} failed - file not created",
                )
                errors.append(
                    f"Attempt {attempt + 1}: Agent did not create discovery file"
                )

        debug_error(
            "roadmap_runner", "Discovery phase failed after all retries", errors=errors
        )
        return RoadmapPhaseResult("discovery", False, [], errors, MAX_RETRIES)

    async def phase_features(self) -> RoadmapPhaseResult:
        """Generate and prioritize features for the roadmap."""
        debug("roadmap_runner", "Starting phase: features")

        roadmap_file = self.output_dir / "roadmap.json"
        discovery_file = self.output_dir / "roadmap_discovery.json"

        if not discovery_file.exists():
            debug_error(
                "roadmap_runner",
                "Discovery file not found - cannot generate features",
                discovery_file=str(discovery_file),
            )
            return RoadmapPhaseResult(
                "features", False, [], ["Discovery file not found"], 0
            )

        if roadmap_file.exists() and not self.refresh:
            debug("roadmap_runner", "roadmap.json already exists, skipping")
            print_status("roadmap.json already exists", "success")
            return RoadmapPhaseResult("features", True, [str(roadmap_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            debug("roadmap_runner", f"Features attempt {attempt + 1}/{MAX_RETRIES}")
            print_status(
                f"Running feature generation agent (attempt {attempt + 1})...",
                "progress",
            )

            context = f"""
**Discovery File**: {discovery_file}
**Project Index**: {self.output_dir / "project_index.json"}
**Output File**: {roadmap_file}

Based on the discovery data:
1. Generate features that address user pain points
2. Prioritize using MoSCoW framework
3. Organize into phases
4. Create milestones
5. Map dependencies

Output the complete roadmap to roadmap.json.
"""
            success, output = await self._run_agent(
                "roadmap_features.md",
                additional_context=context,
            )

            if success and roadmap_file.exists():
                # Validate
                try:
                    with open(roadmap_file) as f:
                        data = json.load(f)

                    required = ["phases", "features", "vision"]
                    missing = [k for k in required if k not in data]
                    feature_count = len(data.get("features", []))

                    debug_detailed(
                        "roadmap_runner",
                        "Validating roadmap.json",
                        missing_fields=missing,
                        feature_count=feature_count,
                    )

                    if not missing and feature_count >= 3:
                        debug_success(
                            "roadmap_runner",
                            "Created valid roadmap.json",
                            attempt=attempt + 1,
                            feature_count=feature_count,
                        )
                        print_status("Created valid roadmap.json", "success")
                        return RoadmapPhaseResult(
                            "features", True, [str(roadmap_file)], [], attempt
                        )
                    else:
                        if missing:
                            debug_warning(
                                "roadmap_runner", f"Missing required fields: {missing}"
                            )
                            errors.append(f"Missing required fields: {missing}")
                        else:
                            debug_warning(
                                "roadmap_runner",
                                f"Roadmap has only {feature_count} features (min 3)",
                            )
                            errors.append("Roadmap has fewer than 3 features")
                except json.JSONDecodeError as e:
                    debug_error(
                        "roadmap_runner", "Invalid JSON in roadmap file", error=str(e)
                    )
                    errors.append(f"Invalid JSON: {e}")
            else:
                debug_warning(
                    "roadmap_runner",
                    f"Features attempt {attempt + 1} failed - file not created",
                )
                errors.append(
                    f"Attempt {attempt + 1}: Agent did not create roadmap file"
                )

        debug_error(
            "roadmap_runner", "Features phase failed after all retries", errors=errors
        )
        return RoadmapPhaseResult("features", False, [], errors, MAX_RETRIES)

    async def run(self) -> bool:
        """Run the complete roadmap generation process with optional competitor analysis."""
        debug_section("roadmap_runner", "Starting Roadmap Generation")
        debug(
            "roadmap_runner",
            "Run configuration",
            project_dir=str(self.project_dir),
            output_dir=str(self.output_dir),
            model=self.model,
            refresh=self.refresh,
        )

        print(
            box(
                f"Project: {self.project_dir}\n"
                f"Output: {self.output_dir}\n"
                f"Model: {self.model}\n"
                f"Competitor Analysis: {'enabled' if self.enable_competitor_analysis else 'disabled'}",
                title="ROADMAP GENERATOR",
                style="heavy",
            )
        )
        results = []

        # Phase 1: Project Index & Graph Hints (in parallel)
        debug(
            "roadmap_runner",
            "Starting Phase 1: Project Analysis & Graph Hints (parallel)",
        )
        print_section("PHASE 1: PROJECT ANALYSIS & GRAPH HINTS", Icons.FOLDER)

        # Run project index and graph hints in parallel
        import asyncio

        index_task = self.phase_project_index()
        hints_task = self.phase_graph_hints()
        index_result, hints_result = await asyncio.gather(index_task, hints_task)

        results.append(index_result)
        results.append(hints_result)

        debug(
            "roadmap_runner",
            "Phase 1 complete",
            index_success=index_result.success,
            hints_success=hints_result.success,
        )

        if not index_result.success:
            debug_error(
                "roadmap_runner",
                "Project analysis failed - aborting roadmap generation",
            )
            print_status("Project analysis failed", "error")
            return False
        # Note: hints_result.success is always True (graceful degradation)

        # Phase 2: Discovery
        debug("roadmap_runner", "Starting Phase 2: Project Discovery")
        print_section("PHASE 2: PROJECT DISCOVERY", Icons.SEARCH)
        result = await self.phase_discovery()
        results.append(result)
        if not result.success:
            debug_error(
                "roadmap_runner",
                "Discovery failed - aborting roadmap generation",
                errors=result.errors,
            )
            print_status("Discovery failed", "error")
            for err in result.errors:
                print(f"  {muted('Error:')} {err}")
            return False
        debug_success("roadmap_runner", "Phase 2 complete")

        # Phase 2.5: Competitor Analysis (optional, runs after discovery)
        print_section("PHASE 2.5: COMPETITOR ANALYSIS", Icons.SEARCH)
        competitor_result = await self.phase_competitor_analysis(
            enable_competitor_analysis=self.enable_competitor_analysis
        )
        results.append(competitor_result)
        # Note: competitor_result.success is always True (graceful degradation)

        # Phase 3: Feature Generation
        debug("roadmap_runner", "Starting Phase 3: Feature Generation")
        print_section("PHASE 3: FEATURE GENERATION", Icons.SUBTASK)
        result = await self.phase_features()
        results.append(result)
        if not result.success:
            debug_error(
                "roadmap_runner",
                "Feature generation failed - aborting",
                errors=result.errors,
            )
            print_status("Feature generation failed", "error")
            for err in result.errors:
                print(f"  {muted('Error:')} {err}")
            return False
        debug_success("roadmap_runner", "Phase 3 complete")

        # Summary
        roadmap_file = self.output_dir / "roadmap.json"
        if roadmap_file.exists():
            with open(roadmap_file) as f:
                roadmap = json.load(f)

            features = roadmap.get("features", [])
            phases = roadmap.get("phases", [])

            # Count by priority
            priority_counts = {}
            for f in features:
                p = f.get("priority", "unknown")
                priority_counts[p] = priority_counts.get(p, 0) + 1

            debug_success(
                "roadmap_runner",
                "Roadmap generation complete",
                phase_count=len(phases),
                feature_count=len(features),
                priority_breakdown=priority_counts,
            )

            print(
                box(
                    f"Vision: {roadmap.get('vision', 'N/A')}\n"
                    f"Phases: {len(phases)}\n"
                    f"Features: {len(features)}\n\n"
                    f"Priority breakdown:\n"
                    + "\n".join(
                        f"  {icon(Icons.ARROW_RIGHT)} {p.upper()}: {c}"
                        for p, c in priority_counts.items()
                    )
                    + f"\n\nRoadmap saved to: {roadmap_file}",
                    title=f"{icon(Icons.SUCCESS)} ROADMAP GENERATED",
                    style="heavy",
                )
            )

        return True


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="AI-powered roadmap generation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--project",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output directory for roadmap files (default: project/auto-claude/roadmap)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="claude-opus-4-5-20251101",
        help="Model to use (default: claude-opus-4-5-20251101)",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Force regeneration even if roadmap exists",
    )
    parser.add_argument(
        "--competitor-analysis",
        action="store_true",
        dest="enable_competitor_analysis",
        help="Enable competitor analysis phase",
    )

    args = parser.parse_args()

    debug(
        "roadmap_runner",
        "CLI invoked",
        project=str(args.project),
        output=str(args.output) if args.output else None,
        model=args.model,
        refresh=args.refresh,
    )

    # Validate project directory
    project_dir = args.project.resolve()
    if not project_dir.exists():
        debug_error(
            "roadmap_runner",
            "Project directory does not exist",
            project_dir=str(project_dir),
        )
        print(f"Error: Project directory does not exist: {project_dir}")
        sys.exit(1)

    debug(
        "roadmap_runner", "Creating RoadmapOrchestrator", project_dir=str(project_dir)
    )

    orchestrator = RoadmapOrchestrator(
        project_dir=project_dir,
        output_dir=args.output,
        model=args.model,
        refresh=args.refresh,
        enable_competitor_analysis=args.enable_competitor_analysis,
    )

    try:
        success = asyncio.run(orchestrator.run())
        debug("roadmap_runner", "Roadmap generation finished", success=success)
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        debug_warning("roadmap_runner", "Roadmap generation interrupted by user")
        print("\n\nRoadmap generation interrupted.")
        sys.exit(1)


if __name__ == "__main__":
    main()
