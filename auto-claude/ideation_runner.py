#!/usr/bin/env python3
"""
Ideation Creation Orchestrator
==============================

AI-powered ideation generation for projects.
Analyzes project context, existing features, and generates three types of ideas:
1. Low-Hanging Fruit - Quick wins building on existing patterns
2. UI/UX Improvements - Visual and interaction enhancements
3. High-Value Features - Strategic features for target users

Usage:
    python auto-claude/ideation_runner.py --project /path/to/project
    python auto-claude/ideation_runner.py --project /path/to/project --types low_hanging_fruit,high_value_features
    python auto-claude/ideation_runner.py --project /path/to/project --refresh
"""

import asyncio
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, List

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
from debug import (
    debug,
    debug_detailed,
    debug_verbose,
    debug_success,
    debug_error,
    debug_warning,
    debug_section,
)
from graphiti_providers import get_graph_hints, is_graphiti_enabled
from init import init_auto_claude_dir


# Configuration
MAX_RETRIES = 3
PROMPTS_DIR = Path(__file__).parent / "prompts"

# Ideation types
# Note: high_value_features removed - strategic features belong to Roadmap
# low_hanging_fruit renamed to code_improvements to cover all code-revealed opportunities
IDEATION_TYPES = [
    "code_improvements",
    "ui_ux_improvements",
    "documentation_gaps",
    "security_hardening",
    "performance_optimizations",
    "code_quality",
]

IDEATION_TYPE_LABELS = {
    "code_improvements": "Code Improvements",
    "ui_ux_improvements": "UI/UX Improvements",
    "documentation_gaps": "Documentation Gaps",
    "security_hardening": "Security Hardening",
    "performance_optimizations": "Performance Optimizations",
    "code_quality": "Code Quality & Refactoring",
}

IDEATION_TYPE_PROMPTS = {
    "code_improvements": "ideation_code_improvements.md",
    "ui_ux_improvements": "ideation_ui_ux.md",
    "documentation_gaps": "ideation_documentation.md",
    "security_hardening": "ideation_security.md",
    "performance_optimizations": "ideation_performance.md",
    "code_quality": "ideation_code_quality.md",
}


@dataclass
class IdeationPhaseResult:
    """Result of an ideation phase execution."""
    phase: str
    ideation_type: Optional[str]
    success: bool
    output_files: list[str]
    ideas_count: int
    errors: list[str]
    retries: int


@dataclass
class IdeationConfig:
    """Configuration for ideation generation."""
    project_dir: Path
    output_dir: Path
    enabled_types: List[str] = field(default_factory=lambda: IDEATION_TYPES.copy())
    include_roadmap_context: bool = True
    include_kanban_context: bool = True
    max_ideas_per_type: int = 5
    model: str = "claude-opus-4-5-20251101"
    refresh: bool = False
    append: bool = False  # If True, preserve existing ideas when merging


class IdeationOrchestrator:
    """Orchestrates the ideation creation process."""

    def __init__(
        self,
        project_dir: Path,
        output_dir: Optional[Path] = None,
        enabled_types: Optional[List[str]] = None,
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
        prompt += f"**Max Ideas**: {self.max_ideas_per_type}\n"

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

    async def _get_graph_hints(self, ideation_type: str) -> list[dict]:
        """Get graph hints for a specific ideation type from Graphiti.

        This runs in parallel with ideation agents to provide historical context.
        """
        if not is_graphiti_enabled():
            return []

        # Create a query based on ideation type
        query_map = {
            "code_improvements": "code patterns, quick wins, and improvement opportunities that worked well",
            "ui_ux_improvements": "UI and UX improvements and user interface patterns",
            "documentation_gaps": "documentation improvements and common user confusion points",
            "security_hardening": "security vulnerabilities and hardening measures",
            "performance_optimizations": "performance bottlenecks and optimization techniques",
            "code_quality": "code quality improvements and refactoring patterns",
        }

        query = query_map.get(ideation_type, f"ideas for {ideation_type}")

        try:
            hints = await get_graph_hints(
                query=query,
                project_id=str(self.project_dir),
                max_results=5,
            )
            debug_success("ideation_runner", f"Got {len(hints)} graph hints for {ideation_type}")
            return hints
        except Exception as e:
            debug_warning("ideation_runner", f"Graph hints failed for {ideation_type}: {e}")
            return []

    def _gather_context(self) -> dict:
        """Gather context from project for ideation."""
        context = {
            "existing_features": [],
            "tech_stack": [],
            "target_audience": None,
            "planned_features": [],
        }

        # Get project index (from .auto-claude - the installed instance)
        project_index_path = self.project_dir / ".auto-claude" / "project_index.json"
        if project_index_path.exists():
            try:
                with open(project_index_path) as f:
                    index = json.load(f)
                    # Extract tech stack from services
                    for service_name, service_info in index.get("services", {}).items():
                        if service_info.get("language"):
                            context["tech_stack"].append(service_info["language"])
                        if service_info.get("framework"):
                            context["tech_stack"].append(service_info["framework"])
                    context["tech_stack"] = list(set(context["tech_stack"]))
            except (json.JSONDecodeError, KeyError):
                pass

        # Get roadmap context if enabled
        if self.include_roadmap_context:
            roadmap_path = self.project_dir / ".auto-claude" / "roadmap" / "roadmap.json"
            if roadmap_path.exists():
                try:
                    with open(roadmap_path) as f:
                        roadmap = json.load(f)
                        # Extract planned features
                        for feature in roadmap.get("features", []):
                            context["planned_features"].append(feature.get("title", ""))
                        # Get target audience
                        audience = roadmap.get("target_audience", {})
                        context["target_audience"] = audience.get("primary")
                except (json.JSONDecodeError, KeyError):
                    pass

            # Also check discovery for audience
            discovery_path = self.project_dir / ".auto-claude" / "roadmap" / "roadmap_discovery.json"
            if discovery_path.exists() and not context["target_audience"]:
                try:
                    with open(discovery_path) as f:
                        discovery = json.load(f)
                        audience = discovery.get("target_audience", {})
                        context["target_audience"] = audience.get("primary_persona")

                        # Also get existing features
                        current_state = discovery.get("current_state", {})
                        context["existing_features"] = current_state.get("existing_features", [])
                except (json.JSONDecodeError, KeyError):
                    pass

        # Get kanban context if enabled
        if self.include_kanban_context:
            specs_dir = self.project_dir / ".auto-claude" / "specs"
            if specs_dir.exists():
                for spec_dir in specs_dir.iterdir():
                    if spec_dir.is_dir():
                        spec_file = spec_dir / "spec.md"
                        if spec_file.exists():
                            # Extract title from spec
                            content = spec_file.read_text()
                            lines = content.split("\n")
                            for line in lines:
                                if line.startswith("# "):
                                    context["planned_features"].append(line[2:].strip())
                                    break

        # Remove duplicates from planned features
        context["planned_features"] = list(set(context["planned_features"]))

        return context

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
                json.dump({
                    "enabled": False,
                    "reason": "Graphiti not configured",
                    "hints_by_type": {},
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
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
            self._get_graph_hints(ideation_type)
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
            json.dump({
                "enabled": True,
                "hints_by_type": hints_by_type,
                "total_hints": total_hints,
                "created_at": datetime.now().isoformat(),
            }, f, indent=2)

        if total_hints > 0:
            print_status(f"Retrieved {total_hints} graph hints across {len(self.enabled_types)} types", "success")
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

        context = self._gather_context()

        # Check for graph hints and include them
        hints_file = self.output_dir / "graph_hints.json"
        graph_hints = {}
        if hints_file.exists():
            try:
                with open(hints_file) as f:
                    hints_data = json.load(f)
                    graph_hints = hints_data.get("hints_by_type", {})
            except (json.JSONDecodeError, IOError):
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

        print_status(f"Created ideation_context.json", "success")
        print_key_value("Tech Stack", ", ".join(context["tech_stack"][:5]) or "Unknown")
        print_key_value("Planned Features", str(len(context["planned_features"])))
        print_key_value("Target Audience", context["target_audience"] or "Not specified")
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
            return IdeationPhaseResult("project_index", None, True, [str(project_index)], 0, [], 0)

        if project_index.exists() and not self.refresh:
            print_status("project_index.json already exists", "success")
            return IdeationPhaseResult("project_index", None, True, [str(project_index)], 0, [], 0)

        # Run analyzer
        print_status("Running project analyzer...", "progress")
        success, output = self._run_script(
            "analyzer.py",
            ["--output", str(project_index)]
        )

        if success and project_index.exists():
            print_status("Created project_index.json", "success")
            return IdeationPhaseResult("project_index", None, True, [str(project_index)], 0, [], 0)

        return IdeationPhaseResult("project_index", None, False, [], 0, [output], 1)

    async def phase_ideation_type(self, ideation_type: str) -> IdeationPhaseResult:
        """Run ideation for a specific type."""

        prompt_file = IDEATION_TYPE_PROMPTS.get(ideation_type)
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
                    print_status(f"{ideation_type}_ideas.json already exists ({count} ideas)", "success")
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
                    print_status(f"{ideation_type}_ideas.json exists but has 0 ideas, regenerating...", "warning")
            except (json.JSONDecodeError, KeyError):
                # Invalid file - will regenerate
                print_status(f"{ideation_type}_ideas.json exists but is invalid, regenerating...", "warning")

        errors = []

        # First attempt: run the full ideation agent
        print_status(f"Running {IDEATION_TYPE_LABELS[ideation_type]} agent...", "progress")

        context = f"""
**Ideation Context**: {self.output_dir / "ideation_context.json"}
**Project Index**: {self.output_dir / "project_index.json"}
**Output File**: {output_file}
**Max Ideas**: {self.max_ideas_per_type}

Generate up to {self.max_ideas_per_type} {IDEATION_TYPE_LABELS[ideation_type]} ideas.
Avoid duplicating features that are already planned (see ideation_context.json).
Output your ideas to {output_file.name}.
"""
        success, output = await self._run_agent(
            prompt_file,
            additional_context=context,
        )

        # Validate the output
        validation_result = self._validate_ideation_output(output_file, ideation_type)

        if validation_result["success"]:
            print_status(f"Created {output_file.name} ({validation_result['count']} ideas)", "success")
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
            print_status(f"Running recovery agent (attempt {recovery_attempt + 1})...", "warning")

            recovery_success = await self._run_recovery_agent(
                output_file,
                ideation_type,
                validation_result["error"],
                validation_result.get("current_content", "")
            )

            if recovery_success:
                # Re-validate after recovery
                validation_result = self._validate_ideation_output(output_file, ideation_type)

                if validation_result["success"]:
                    print_status(f"Recovery successful: {output_file.name} ({validation_result['count']} ideas)", "success")
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
                    errors.append(f"Recovery {recovery_attempt + 1}: {validation_result['error']}")
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

    def _validate_ideation_output(self, output_file: Path, ideation_type: str) -> dict:
        """Validate ideation output file and return validation result."""
        debug_detailed("ideation_runner", f"Validating output for {ideation_type}",
                      output_file=str(output_file))

        if not output_file.exists():
            debug_warning("ideation_runner", "Output file does not exist",
                         output_file=str(output_file))
            return {
                "success": False,
                "error": "Output file does not exist",
                "current_content": "",
                "count": 0,
            }

        try:
            content = output_file.read_text()
            data = json.loads(content)
            debug_verbose("ideation_runner", "Parsed JSON successfully",
                         keys=list(data.keys()))

            # Check for correct key
            ideas = data.get(ideation_type, [])

            # Also check for common incorrect key "ideas"
            if not ideas and "ideas" in data:
                debug_warning("ideation_runner", "Wrong JSON key detected",
                             expected=ideation_type, found="ideas")
                return {
                    "success": False,
                    "error": f"Wrong JSON key: found 'ideas' but expected '{ideation_type}'",
                    "current_content": content,
                    "count": 0,
                }

            if len(ideas) >= 1:
                debug_success("ideation_runner", f"Validation passed for {ideation_type}",
                             ideas_count=len(ideas))
                return {
                    "success": True,
                    "error": None,
                    "current_content": content,
                    "count": len(ideas),
                }
            else:
                debug_warning("ideation_runner", f"No ideas found for {ideation_type}")
                return {
                    "success": False,
                    "error": f"No {ideation_type} ideas found in output",
                    "current_content": content,
                    "count": 0,
                }

        except json.JSONDecodeError as e:
            debug_error("ideation_runner", "JSON parse error", error=str(e))
            return {
                "success": False,
                "error": f"Invalid JSON: {e}",
                "current_content": output_file.read_text() if output_file.exists() else "",
                "count": 0,
            }

    async def _run_recovery_agent(
        self,
        output_file: Path,
        ideation_type: str,
        error: str,
        current_content: str,
    ) -> bool:
        """Run a recovery agent to fix validation errors in the output file."""

        # Truncate content if too long
        max_content_length = 8000
        if len(current_content) > max_content_length:
            current_content = current_content[:max_content_length] + "\n... (truncated)"

        recovery_prompt = f"""# Ideation Output Recovery

The ideation output file failed validation. Your task is to fix it.

## Error
{error}

## Expected Format
The output file must be valid JSON with the following structure:

```json
{{
  "{ideation_type}": [
    {{
      "id": "...",
      "type": "{ideation_type}",
      "title": "...",
      "description": "...",
      ... other fields ...
    }}
  ]
}}
```

**CRITICAL**: The top-level key MUST be `"{ideation_type}"` (not "ideas" or anything else).

## Current File Content
File: {output_file}

```json
{current_content}
```

## Your Task
1. Read the current file content above
2. Identify what's wrong based on the error message
3. Fix the JSON structure to match the expected format
4. Write the corrected content to {output_file}

Common fixes:
- If the key is "ideas", rename it to "{ideation_type}"
- If the JSON is invalid, fix the syntax errors
- If there are no ideas, ensure the array has at least one idea object

Write the fixed JSON to the file now.
"""

        client = create_client(self.project_dir, self.output_dir, self.model)

        try:
            async with client:
                await client.query(recovery_prompt)

                async for msg in client.receive_response():
                    msg_type = type(msg).__name__

                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            if block_type == "TextBlock" and hasattr(block, "text"):
                                print(block.text, end="", flush=True)
                            elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                                print(f"\n[Recovery Tool: {block.name}]", flush=True)

                print()
                return True

        except Exception as e:
            print_status(f"Recovery agent error: {e}", "error")
            return False

    async def phase_merge(self) -> IdeationPhaseResult:
        """Merge all ideation outputs into a single ideation.json."""

        ideation_file = self.output_dir / "ideation.json"

        # Load existing ideas if in append mode
        existing_ideas = []
        existing_session = None
        if self.append and ideation_file.exists():
            try:
                with open(ideation_file) as f:
                    existing_session = json.load(f)
                    existing_ideas = existing_session.get("ideas", [])
                    print_status(f"Preserving {len(existing_ideas)} existing ideas", "info")
            except json.JSONDecodeError:
                pass

        # Collect new ideas from the enabled types
        new_ideas = []
        output_files = []

        for ideation_type in self.enabled_types:
            type_file = self.output_dir / f"{ideation_type}_ideas.json"
            if type_file.exists():
                try:
                    with open(type_file) as f:
                        data = json.load(f)
                        ideas = data.get(ideation_type, [])
                        new_ideas.extend(ideas)
                        output_files.append(str(type_file))
                except (json.JSONDecodeError, KeyError):
                    pass

        # In append mode, filter out ideas from types we're regenerating
        # (to avoid duplicates) and keep ideas from other types
        if self.append and existing_ideas:
            # Keep existing ideas that are NOT from the types we just generated
            preserved_ideas = [
                idea for idea in existing_ideas
                if idea.get("type") not in self.enabled_types
            ]
            all_ideas = preserved_ideas + new_ideas
            print_status(f"Merged: {len(preserved_ideas)} preserved + {len(new_ideas)} new = {len(all_ideas)} total", "info")
        else:
            all_ideas = new_ideas

        # Load context for metadata
        context_file = self.output_dir / "ideation_context.json"
        context_data = {}
        if context_file.exists():
            try:
                with open(context_file) as f:
                    context_data = json.load(f)
            except json.JSONDecodeError:
                pass

        # Create merged ideation session
        # Preserve session ID and generated_at if appending
        session_id = existing_session.get("id") if existing_session else f"ideation-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        generated_at = existing_session.get("generated_at") if existing_session else datetime.now().isoformat()

        ideation_session = {
            "id": session_id,
            "project_id": str(self.project_dir),
            "config": context_data.get("config", {}),
            "ideas": all_ideas,
            "project_context": {
                "existing_features": context_data.get("existing_features", []),
                "tech_stack": context_data.get("tech_stack", []),
                "target_audience": context_data.get("target_audience"),
                "planned_features": context_data.get("planned_features", []),
            },
            "summary": {
                "total_ideas": len(all_ideas),
                "by_type": {},
                "by_status": {},
            },
            "generated_at": generated_at,
            "updated_at": datetime.now().isoformat(),
        }

        # Count by type and status
        for idea in all_ideas:
            idea_type = idea.get("type", "unknown")
            idea_status = idea.get("status", "draft")
            ideation_session["summary"]["by_type"][idea_type] = \
                ideation_session["summary"]["by_type"].get(idea_type, 0) + 1
            ideation_session["summary"]["by_status"][idea_status] = \
                ideation_session["summary"]["by_status"].get(idea_status, 0) + 1

        with open(ideation_file, "w") as f:
            json.dump(ideation_session, f, indent=2)

        action = "Updated" if self.append else "Created"
        print_status(f"{action} ideation.json ({len(all_ideas)} total ideas)", "success")

        return IdeationPhaseResult(
            phase="merge",
            ideation_type=None,
            success=True,
            output_files=[str(ideation_file)],
            ideas_count=len(all_ideas),
            errors=[],
            retries=0,
        )

    async def _run_ideation_type_with_streaming(self, ideation_type: str) -> IdeationPhaseResult:
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
        debug("ideation_runner", "Configuration",
              project_dir=str(self.project_dir),
              output_dir=str(self.output_dir),
              model=self.model,
              enabled_types=self.enabled_types,
              refresh=self.refresh,
              append=self.append)

        print(box(
            f"Project: {self.project_dir}\n"
            f"Output: {self.output_dir}\n"
            f"Model: {self.model}\n"
            f"Types: {', '.join(self.enabled_types)}",
            title="IDEATION GENERATOR",
            style="heavy"
        ))

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
        debug("ideation_runner", "Starting Phase 3: Generating Ideas",
              types=self.enabled_types, parallel=True)
        print_section("PHASE 3: GENERATING IDEAS (PARALLEL)", Icons.SUBTASK)
        print_status(f"Starting {len(self.enabled_types)} ideation agents in parallel...", "progress")

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
                print_status(f"{IDEATION_TYPE_LABELS[ideation_type]} ideation failed with exception: {result}", "error")
                results.append(IdeationPhaseResult(
                    phase="ideation",
                    ideation_type=ideation_type,
                    success=False,
                    output_files=[],
                    ideas_count=0,
                    errors=[str(result)],
                    retries=0,
                ))
            else:
                results.append(result)
                if result.success:
                    print_status(f"{IDEATION_TYPE_LABELS[ideation_type]}: {result.ideas_count} ideas", "success")
                else:
                    print_status(f"{IDEATION_TYPE_LABELS[ideation_type]} ideation failed", "warning")
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

            print(box(
                f"Total Ideas: {len(ideas)}\n\n"
                f"By Type:\n" +
                "\n".join(f"  {icon(Icons.ARROW_RIGHT)} {IDEATION_TYPE_LABELS.get(t, t)}: {c}"
                         for t, c in by_type.items()) +
                f"\n\nIdeation saved to: {ideation_file}",
                title=f"{icon(Icons.SUCCESS)} IDEATION COMPLETE",
                style="heavy"
            ))

        return True


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="AI-powered ideation generation",
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
        help="Output directory for ideation files (default: project/auto-claude/ideation)",
    )
    parser.add_argument(
        "--types",
        type=str,
        help=f"Comma-separated ideation types to run (options: {','.join(IDEATION_TYPES)})",
    )
    parser.add_argument(
        "--no-roadmap",
        action="store_true",
        help="Don't include roadmap context",
    )
    parser.add_argument(
        "--no-kanban",
        action="store_true",
        help="Don't include kanban context",
    )
    parser.add_argument(
        "--max-ideas",
        type=int,
        default=5,
        help="Maximum ideas per type (default: 5)",
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
        help="Force regeneration even if ideation exists",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="Append new ideas to existing session instead of replacing",
    )

    args = parser.parse_args()

    # Validate project directory
    project_dir = args.project.resolve()
    if not project_dir.exists():
        print(f"Error: Project directory does not exist: {project_dir}")
        sys.exit(1)

    # Parse types
    enabled_types = None
    if args.types:
        enabled_types = [t.strip() for t in args.types.split(",")]
        invalid_types = [t for t in enabled_types if t not in IDEATION_TYPES]
        if invalid_types:
            print(f"Error: Invalid ideation types: {invalid_types}")
            print(f"Valid types: {IDEATION_TYPES}")
            sys.exit(1)

    orchestrator = IdeationOrchestrator(
        project_dir=project_dir,
        output_dir=args.output,
        enabled_types=enabled_types,
        include_roadmap_context=not args.no_roadmap,
        include_kanban_context=not args.no_kanban,
        max_ideas_per_type=args.max_ideas,
        model=args.model,
        refresh=args.refresh,
        append=args.append,
    )

    try:
        success = asyncio.run(orchestrator.run())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nIdeation generation interrupted.")
        sys.exit(1)


if __name__ == "__main__":
    main()
