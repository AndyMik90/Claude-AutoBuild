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
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent))

# Load .env file
from dotenv import load_dotenv
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

from client import create_client
from ui import (
    Icons,
    icon,
    box,
    success,
    error,
    warning,
    info,
    muted,
    highlight,
    bold,
    print_status,
    print_key_value,
    print_section,
)
from graphiti_providers import get_graph_hints, is_graphiti_enabled
from init import init_auto_claude_dir


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


class RoadmapOrchestrator:
    """Orchestrates the roadmap creation process."""

    def __init__(
        self,
        project_dir: Path,
        output_dir: Optional[Path] = None,
        model: str = "claude-opus-4-5-20251101",
        refresh: bool = False,
    ):
        self.project_dir = Path(project_dir)
        self.model = model
        self.refresh = refresh

        # Default output to project's .auto-claude directory (installed instance)
        # Note: auto-claude/ is source code, .auto-claude/ is the installed instance
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            # Initialize .auto-claude directory and ensure it's in .gitignore
            init_auto_claude_dir(self.project_dir)
            self.output_dir = self.project_dir / ".auto-claude" / "roadmap"

        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _run_script(self, script: str, args: list[str]) -> tuple[bool, str]:
        """Run a Python script and return (success, output)."""
        script_path = Path(__file__).parent / script

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

    async def _run_agent(
        self,
        prompt_file: str,
        additional_context: str = "",
    ) -> tuple[bool, str]:
        """Run an agent with the given prompt."""
        prompt_path = PROMPTS_DIR / prompt_file

        if not prompt_path.exists():
            return False, f"Prompt not found: {prompt_path}"

        # Load prompt
        prompt = prompt_path.read_text()

        # Add context
        prompt += f"\n\n---\n\n**Output Directory**: {self.output_dir}\n"
        prompt += f"**Project Directory**: {self.project_dir}\n"

        if additional_context:
            prompt += f"\n{additional_context}\n"

        # Create client
        client = create_client(self.project_dir, self.output_dir, self.model)

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
                            elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                                print(f"\n[Tool: {block.name}]", flush=True)

                print()
                return True, response_text

        except Exception as e:
            return False, str(e)

    async def phase_graph_hints(self) -> RoadmapPhaseResult:
        """Retrieve graph hints for roadmap generation from Graphiti (if enabled).

        This is a lightweight integration - hints are optional and cached.
        """
        hints_file = self.output_dir / "graph_hints.json"

        if hints_file.exists() and not self.refresh:
            print_status("graph_hints.json already exists", "success")
            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [], 0)

        if not is_graphiti_enabled():
            print_status("Graphiti not enabled, skipping graph hints", "info")
            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": False,
                    "reason": "Graphiti not configured",
                    "hints": [],
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [], 0)

        print_status("Querying Graphiti for roadmap insights...", "progress")

        try:
            hints = await get_graph_hints(
                query="product roadmap features priorities and strategic direction",
                project_id=str(self.project_dir),
                max_results=10,
            )

            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": True,
                    "hints": hints,
                    "hint_count": len(hints),
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)

            if hints:
                print_status(f"Retrieved {len(hints)} graph hints", "success")
            else:
                print_status("No relevant graph hints found", "info")

            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [], 0)

        except Exception as e:
            print_status(f"Graph query failed: {e}", "warning")
            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": True,
                    "error": str(e),
                    "hints": [],
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return RoadmapPhaseResult("graph_hints", True, [str(hints_file)], [str(e)], 0)

    async def phase_project_index(self) -> RoadmapPhaseResult:
        """Ensure project index exists."""

        project_index = self.output_dir / "project_index.json"
        auto_build_index = Path(__file__).parent / "project_index.json"

        # Check if we can copy existing index
        if auto_build_index.exists() and not project_index.exists():
            import shutil
            shutil.copy(auto_build_index, project_index)
            print_status("Copied existing project_index.json", "success")
            return RoadmapPhaseResult("project_index", True, [str(project_index)], [], 0)

        if project_index.exists() and not self.refresh:
            print_status("project_index.json already exists", "success")
            return RoadmapPhaseResult("project_index", True, [str(project_index)], [], 0)

        # Run analyzer
        print_status("Running project analyzer...", "progress")
        success, output = self._run_script(
            "analyzer.py",
            ["--output", str(project_index)]
        )

        if success and project_index.exists():
            print_status("Created project_index.json", "success")
            return RoadmapPhaseResult("project_index", True, [str(project_index)], [], 0)

        return RoadmapPhaseResult("project_index", False, [], [output], 1)

    async def phase_discovery(self) -> RoadmapPhaseResult:
        """Run discovery phase to understand project and audience."""

        discovery_file = self.output_dir / "roadmap_discovery.json"

        if discovery_file.exists() and not self.refresh:
            print_status("roadmap_discovery.json already exists", "success")
            return RoadmapPhaseResult("discovery", True, [str(discovery_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running discovery agent (attempt {attempt + 1})...", "progress")

            context = f"""
**Project Index**: {self.output_dir / "project_index.json"}
**Output File**: {discovery_file}

Analyze the project and engage with the user to understand:
1. Target audience (MOST IMPORTANT)
2. Product vision
3. Current state and gaps
4. Competitive context
5. Constraints

Output your findings to roadmap_discovery.json.
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
                        print_status("Created valid roadmap_discovery.json", "success")
                        return RoadmapPhaseResult("discovery", True, [str(discovery_file)], [], attempt)
                    else:
                        errors.append(f"Missing required fields: {missing}")
                except json.JSONDecodeError as e:
                    errors.append(f"Invalid JSON: {e}")
            else:
                errors.append(f"Attempt {attempt + 1}: Agent did not create discovery file")

        return RoadmapPhaseResult("discovery", False, [], errors, MAX_RETRIES)

    async def phase_features(self) -> RoadmapPhaseResult:
        """Generate and prioritize features for the roadmap."""

        roadmap_file = self.output_dir / "roadmap.json"
        discovery_file = self.output_dir / "roadmap_discovery.json"

        if not discovery_file.exists():
            return RoadmapPhaseResult("features", False, [], ["Discovery file not found"], 0)

        if roadmap_file.exists() and not self.refresh:
            print_status("roadmap.json already exists", "success")
            return RoadmapPhaseResult("features", True, [str(roadmap_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running feature generation agent (attempt {attempt + 1})...", "progress")

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

                    if not missing and len(data.get("features", [])) >= 3:
                        print_status("Created valid roadmap.json", "success")
                        return RoadmapPhaseResult("features", True, [str(roadmap_file)], [], attempt)
                    else:
                        if missing:
                            errors.append(f"Missing required fields: {missing}")
                        else:
                            errors.append("Roadmap has fewer than 3 features")
                except json.JSONDecodeError as e:
                    errors.append(f"Invalid JSON: {e}")
            else:
                errors.append(f"Attempt {attempt + 1}: Agent did not create roadmap file")

        return RoadmapPhaseResult("features", False, [], errors, MAX_RETRIES)

    async def run(self) -> bool:
        """Run the complete roadmap generation process."""

        print(box(
            f"Project: {self.project_dir}\n"
            f"Output: {self.output_dir}\n"
            f"Model: {self.model}",
            title="ROADMAP GENERATOR",
            style="heavy"
        ))

        results = []

        # Phase 1: Project Index & Graph Hints (in parallel)
        print_section("PHASE 1: PROJECT ANALYSIS & GRAPH HINTS", Icons.FOLDER)

        # Run project index and graph hints in parallel
        import asyncio
        index_task = self.phase_project_index()
        hints_task = self.phase_graph_hints()
        index_result, hints_result = await asyncio.gather(index_task, hints_task)

        results.append(index_result)
        results.append(hints_result)

        if not index_result.success:
            print_status("Project analysis failed", "error")
            return False
        # Note: hints_result.success is always True (graceful degradation)

        # Phase 2: Discovery
        print_section("PHASE 2: PROJECT DISCOVERY", Icons.SEARCH)
        result = await self.phase_discovery()
        results.append(result)
        if not result.success:
            print_status("Discovery failed", "error")
            for err in result.errors:
                print(f"  {muted('Error:')} {err}")
            return False

        # Phase 3: Feature Generation
        print_section("PHASE 3: FEATURE GENERATION", Icons.SUBTASK)
        result = await self.phase_features()
        results.append(result)
        if not result.success:
            print_status("Feature generation failed", "error")
            for err in result.errors:
                print(f"  {muted('Error:')} {err}")
            return False

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

            print(box(
                f"Vision: {roadmap.get('vision', 'N/A')}\n"
                f"Phases: {len(phases)}\n"
                f"Features: {len(features)}\n\n"
                f"Priority breakdown:\n" +
                "\n".join(f"  {icon(Icons.ARROW_RIGHT)} {p.upper()}: {c}" for p, c in priority_counts.items()) +
                f"\n\nRoadmap saved to: {roadmap_file}",
                title=f"{icon(Icons.SUCCESS)} ROADMAP GENERATED",
                style="heavy"
            ))

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

    args = parser.parse_args()

    # Validate project directory
    project_dir = args.project.resolve()
    if not project_dir.exists():
        print(f"Error: Project directory does not exist: {project_dir}")
        sys.exit(1)

    orchestrator = RoadmapOrchestrator(
        project_dir=project_dir,
        output_dir=args.output,
        model=args.model,
        refresh=args.refresh,
    )

    try:
        success = asyncio.run(orchestrator.run())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nRoadmap generation interrupted.")
        sys.exit(1)


if __name__ == "__main__":
    main()
