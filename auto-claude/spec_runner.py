#!/usr/bin/env python3
"""
Spec Creation Orchestrator
==========================

Dynamic spec creation with complexity-based phase selection.
The orchestrator uses AI to evaluate task complexity and adapts its process accordingly.

Complexity Assessment:
- By default, uses AI (complexity_assessor.md prompt) to analyze the task
- AI considers: scope, integrations, infrastructure, knowledge requirements, risk
- Falls back to heuristic analysis if AI assessment fails
- Use --no-ai-assessment to skip AI and use heuristics only

Complexity Tiers:
- SIMPLE (1-2 files): Discovery → Quick Spec → Validate (3 phases)
- STANDARD (3-10 files): Discovery → Requirements → Context → Spec → Plan → Validate (6 phases)
- STANDARD + Research: Same as above but with research phase for external dependencies (7 phases)
- COMPLEX (10+ files/integrations): Full 8-phase pipeline with research and self-critique

The AI considers:
- Number of files/services involved
- External integrations and research requirements
- Infrastructure changes (Docker, databases, etc.)
- Whether codebase has existing patterns to follow
- Risk factors and edge cases

Usage:
    python auto-claude/spec_runner.py --task "Add user authentication"
    python auto-claude/spec_runner.py --interactive
    python auto-claude/spec_runner.py --continue 001-feature
    python auto-claude/spec_runner.py --task "Fix button color" --complexity simple
    python auto-claude/spec_runner.py --task "Simple fix" --no-ai-assessment
"""

import asyncio
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent))

# Load .env file - check both auto-claude/ and dev/auto-claude/ locations
from dotenv import load_dotenv
env_file = Path(__file__).parent / ".env"
dev_env_file = Path(__file__).parent.parent / "dev" / "auto-claude" / ".env"
if env_file.exists():
    load_dotenv(env_file)
elif dev_env_file.exists():
    load_dotenv(dev_env_file)

from client import create_client
from validate_spec import SpecValidator, auto_fix_plan
from linear_updater import is_linear_enabled, create_linear_task
from review import ReviewState, run_review_checkpoint
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
    StatusManager,
    BuildState,
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
from task_logger import (
    TaskLogger,
    LogPhase,
    LogEntryType,
    get_task_logger,
    clear_task_logger,
    update_task_logger_path,
)
from init import init_auto_claude_dir


# Configuration
MAX_RETRIES = 3
PROMPTS_DIR = Path(__file__).parent / "prompts"


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


class Complexity(Enum):
    """Task complexity tiers that determine which phases to run."""
    SIMPLE = "simple"      # 1-2 files, single service, no integrations
    STANDARD = "standard"  # 3-10 files, 1-2 services, minimal integrations
    COMPLEX = "complex"    # 10+ files, multiple services, external integrations


@dataclass
class ComplexityAssessment:
    """Result of analyzing task complexity."""
    complexity: Complexity
    confidence: float  # 0.0 to 1.0
    signals: dict = field(default_factory=dict)
    reasoning: str = ""

    # Detected characteristics
    estimated_files: int = 1
    estimated_services: int = 1
    external_integrations: list = field(default_factory=list)
    infrastructure_changes: bool = False
    
    # AI-recommended phases (if using AI assessment)
    recommended_phases: list = field(default_factory=list)
    
    # Flags from AI assessment
    needs_research: bool = False
    needs_self_critique: bool = False

    def phases_to_run(self) -> list[str]:
        """Return list of phase names to run based on complexity."""
        # If AI provided recommended phases, use those
        if self.recommended_phases:
            return self.recommended_phases

        # Otherwise fall back to default phase sets
        # Note: historical_context runs early (after discovery) if Graphiti is enabled
        # It's included by default but gracefully skips if not configured
        if self.complexity == Complexity.SIMPLE:
            return ["discovery", "historical_context", "quick_spec", "validation"]
        elif self.complexity == Complexity.STANDARD:
            # Standard can optionally include research if flagged
            phases = ["discovery", "historical_context", "requirements"]
            if self.needs_research:
                phases.append("research")
            phases.extend(["context", "spec_writing", "planning", "validation"])
            return phases
        else:  # COMPLEX
            return ["discovery", "historical_context", "requirements", "research", "context", "spec_writing", "self_critique", "planning", "validation"]


class ComplexityAnalyzer:
    """Analyzes task description and context to determine complexity."""

    # Keywords that suggest different complexity levels
    SIMPLE_KEYWORDS = [
        "fix", "typo", "update", "change", "rename", "remove", "delete",
        "adjust", "tweak", "correct", "modify", "style", "color", "text",
        "label", "button", "margin", "padding", "font", "size", "hide", "show"
    ]

    COMPLEX_KEYWORDS = [
        "integrate", "integration", "api", "sdk", "library", "package",
        "database", "migrate", "migration", "docker", "kubernetes", "deploy",
        "authentication", "oauth", "graphql", "websocket", "queue", "cache",
        "redis", "postgres", "mongo", "elasticsearch", "kafka", "rabbitmq",
        "microservice", "refactor", "architecture", "infrastructure"
    ]

    MULTI_SERVICE_KEYWORDS = [
        "backend", "frontend", "worker", "service", "api", "client",
        "server", "database", "queue", "cache", "proxy"
    ]

    def __init__(self, project_index: Optional[dict] = None):
        self.project_index = project_index or {}

    def analyze(self, task_description: str, requirements: Optional[dict] = None) -> ComplexityAssessment:
        """Analyze task and return complexity assessment."""
        task_lower = task_description.lower()
        signals = {}

        # 1. Keyword analysis
        simple_matches = sum(1 for kw in self.SIMPLE_KEYWORDS if kw in task_lower)
        complex_matches = sum(1 for kw in self.COMPLEX_KEYWORDS if kw in task_lower)
        multi_service_matches = sum(1 for kw in self.MULTI_SERVICE_KEYWORDS if kw in task_lower)

        signals["simple_keywords"] = simple_matches
        signals["complex_keywords"] = complex_matches
        signals["multi_service_keywords"] = multi_service_matches

        # 2. External integrations detection
        integrations = self._detect_integrations(task_lower)
        signals["external_integrations"] = len(integrations)

        # 3. Infrastructure changes detection
        infra_changes = self._detect_infrastructure_changes(task_lower)
        signals["infrastructure_changes"] = infra_changes

        # 4. Estimate files and services
        estimated_files = self._estimate_files(task_lower, requirements)
        estimated_services = self._estimate_services(task_lower, requirements)
        signals["estimated_files"] = estimated_files
        signals["estimated_services"] = estimated_services

        # 5. Requirements-based signals (if available)
        if requirements:
            services_involved = requirements.get("services_involved", [])
            signals["explicit_services"] = len(services_involved)
            estimated_services = max(estimated_services, len(services_involved))

        # Determine complexity
        complexity, confidence, reasoning = self._calculate_complexity(
            signals, integrations, infra_changes, estimated_files, estimated_services
        )

        return ComplexityAssessment(
            complexity=complexity,
            confidence=confidence,
            signals=signals,
            reasoning=reasoning,
            estimated_files=estimated_files,
            estimated_services=estimated_services,
            external_integrations=integrations,
            infrastructure_changes=infra_changes,
        )

    def _detect_integrations(self, task_lower: str) -> list[str]:
        """Detect external integrations mentioned in task."""
        integration_patterns = [
            r'\b(graphiti|graphql|apollo)\b',
            r'\b(stripe|paypal|payment)\b',
            r'\b(auth0|okta|oauth|jwt)\b',
            r'\b(aws|gcp|azure|s3|lambda)\b',
            r'\b(redis|memcached|cache)\b',
            r'\b(postgres|mysql|mongodb|database)\b',
            r'\b(elasticsearch|algolia|search)\b',
            r'\b(kafka|rabbitmq|sqs|queue)\b',
            r'\b(docker|kubernetes|k8s)\b',
            r'\b(openai|anthropic|llm|ai)\b',
            r'\b(sendgrid|twilio|email|sms)\b',
        ]

        found = []
        for pattern in integration_patterns:
            matches = re.findall(pattern, task_lower)
            found.extend(matches)

        return list(set(found))

    def _detect_infrastructure_changes(self, task_lower: str) -> bool:
        """Detect if task involves infrastructure changes."""
        infra_patterns = [
            r'\bdocker\b', r'\bkubernetes\b', r'\bk8s\b',
            r'\bdeploy\b', r'\binfrastructure\b', r'\bci/cd\b',
            r'\benvironment\b', r'\bconfig\b', r'\b\.env\b',
            r'\bdatabase migration\b', r'\bschema\b',
        ]

        for pattern in infra_patterns:
            if re.search(pattern, task_lower):
                return True
        return False

    def _estimate_files(self, task_lower: str, requirements: Optional[dict]) -> int:
        """Estimate number of files to be modified."""
        # Base estimate from task description
        if any(kw in task_lower for kw in ["single", "one file", "one component", "this file"]):
            return 1

        # Check for explicit file mentions
        file_mentions = len(re.findall(r'\.(tsx?|jsx?|py|go|rs|java|rb|php|vue|svelte)\b', task_lower))
        if file_mentions > 0:
            return max(1, file_mentions)

        # Heuristic based on task scope
        if any(kw in task_lower for kw in self.SIMPLE_KEYWORDS):
            return 2
        elif any(kw in task_lower for kw in ["feature", "add", "implement", "create"]):
            return 5
        elif any(kw in task_lower for kw in self.COMPLEX_KEYWORDS):
            return 15

        return 5  # Default estimate

    def _estimate_services(self, task_lower: str, requirements: Optional[dict]) -> int:
        """Estimate number of services involved."""
        service_count = sum(1 for kw in self.MULTI_SERVICE_KEYWORDS if kw in task_lower)

        # If project is a monorepo, check project_index
        if self.project_index.get("project_type") == "monorepo":
            services = self.project_index.get("services", {})
            if services:
                # Check which services are mentioned
                mentioned = sum(1 for svc in services if svc.lower() in task_lower)
                if mentioned > 0:
                    return mentioned

        return max(1, min(service_count, 5))

    def _calculate_complexity(
        self,
        signals: dict,
        integrations: list,
        infra_changes: bool,
        estimated_files: int,
        estimated_services: int,
    ) -> tuple[Complexity, float, str]:
        """Calculate final complexity based on all signals."""

        reasons = []

        # Strong indicators for SIMPLE
        if (
            estimated_files <= 2 and
            estimated_services == 1 and
            len(integrations) == 0 and
            not infra_changes and
            signals["simple_keywords"] > 0 and
            signals["complex_keywords"] == 0
        ):
            reasons.append(f"Single service, {estimated_files} file(s), no integrations")
            return Complexity.SIMPLE, 0.9, "; ".join(reasons)

        # Strong indicators for COMPLEX
        if (
            len(integrations) >= 2 or
            infra_changes or
            estimated_services >= 3 or
            estimated_files >= 10 or
            signals["complex_keywords"] >= 3
        ):
            reasons.append(f"{len(integrations)} integrations, {estimated_services} services, {estimated_files} files")
            if infra_changes:
                reasons.append("infrastructure changes detected")
            return Complexity.COMPLEX, 0.85, "; ".join(reasons)

        # Default to STANDARD
        reasons.append(f"{estimated_files} files, {estimated_services} service(s)")
        if len(integrations) > 0:
            reasons.append(f"{len(integrations)} integration(s)")

        return Complexity.STANDARD, 0.75, "; ".join(reasons)


@dataclass
class PhaseResult:
    """Result of a phase execution."""
    phase: str
    success: bool
    output_files: list[str]
    errors: list[str]
    retries: int


class SpecOrchestrator:
    """Orchestrates the spec creation process with dynamic complexity adaptation."""

    def __init__(
        self,
        project_dir: Path,
        task_description: Optional[str] = None,
        spec_name: Optional[str] = None,
        spec_dir: Optional[Path] = None,  # Use existing spec directory (for UI integration)
        model: str = "claude-opus-4-5-20251101",
        complexity_override: Optional[str] = None,  # Force a specific complexity
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
        self.assessment: Optional[ComplexityAssessment] = None

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
        """Remove orphaned pending folders that have no substantial content.

        A folder is considered orphaned if:
        - Its name ends with '-pending'
        - It has no requirements.json (meaning requirements phase never completed)
        - It only contains task_logs.json or is empty
        """
        if not self.specs_dir.exists():
            return

        import shutil
        from datetime import datetime, timedelta

        orphaned = []
        for folder in self.specs_dir.glob("[0-9][0-9][0-9]-pending"):
            if not folder.is_dir():
                continue

            # Check if folder has substantial content
            requirements_file = folder / "requirements.json"
            spec_file = folder / "spec.md"
            plan_file = folder / "implementation_plan.json"

            # If any of these exist, the spec has made progress - don't delete
            if requirements_file.exists() or spec_file.exists() or plan_file.exists():
                continue

            # Check folder age - only clean up folders older than 10 minutes
            # to avoid deleting a folder that's currently being created
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
                debug("spec_runner", f"Cleaned up orphaned pending folder: {folder.name}")
            except OSError as e:
                debug_warning("spec_runner", f"Failed to clean up {folder.name}: {e}")

    def _create_spec_dir(self) -> Path:
        """Create a new spec directory with incremented number and placeholder name."""
        existing = list(self.specs_dir.glob("[0-9][0-9][0-9]-*"))

        if existing:
            # Find the HIGHEST folder number, not count of folders
            # This prevents collisions when folders are deleted or specs fail mid-way
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
        # Common words to skip for cleaner names
        skip_words = {
            "a", "an", "the", "to", "for", "of", "in", "on", "at", "by", "with",
            "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "must", "can", "this", "that", "these",
            "those", "i", "you", "we", "they", "it", "add", "create", "make",
            "implement", "build", "new", "using", "use", "via", "from",
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
            # Fallback: just use first 4 words regardless
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
            import shutil
            shutil.move(str(self.spec_dir), str(new_spec_dir))

            # Update our references
            self.spec_dir = new_spec_dir
            self.validator = SpecValidator(self.spec_dir)

            # Update the global task logger to use the new path
            update_task_logger_path(new_spec_dir)

            print_status(f"Spec folder: {highlight(new_dir_name)}", "success")
            return True
            
        except (json.JSONDecodeError, IOError, OSError) as e:
            print_status(f"Could not rename spec folder: {e}", "warning")
            return False

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
        interactive: bool = False,
    ) -> tuple[bool, str]:
        """Run an agent with the given prompt."""
        prompt_path = PROMPTS_DIR / prompt_file

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
                                # Log text to task logger
                                if task_logger and block.text.strip():
                                    task_logger.log(block.text, LogEntryType.TEXT, LogPhase.PLANNING, print_to_console=False)
                            elif block_type == "ToolUseBlock" and hasattr(block, "name"):
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

                                # Log tool start
                                if task_logger:
                                    task_logger.tool_start(tool_name, tool_input, LogPhase.PLANNING, print_to_console=True)
                                else:
                                    print(f"\n[Tool: {tool_name}]", flush=True)
                                current_tool = tool_name

                    # Handle tool results
                    elif msg_type == "UserMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            if block_type == "ToolResultBlock":
                                is_error = getattr(block, "is_error", False)
                                result_content = getattr(block, "content", "")
                                if task_logger and current_tool:
                                    # Store full result in detail for expandable view
                                    detail_content = None
                                    if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                        result_str = str(result_content)
                                        if len(result_str) < 50000:
                                            detail_content = result_str
                                    task_logger.tool_end(current_tool, success=not is_error, detail=detail_content, phase=LogPhase.PLANNING)
                                current_tool = None

                print()
                return True, response_text

        except Exception as e:
            if task_logger:
                task_logger.log_error(f"Agent error: {e}", LogPhase.PLANNING)
            return False, str(e)

    # === Phase Implementations ===

    async def phase_complexity_assessment_with_requirements(self) -> PhaseResult:
        """Assess complexity after requirements are gathered (with full context)."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        assessment_file = self.spec_dir / "complexity_assessment.json"
        requirements_file = self.spec_dir / "requirements.json"

        # Load requirements for full context
        requirements_context = ""
        if requirements_file.exists():
            with open(requirements_file) as f:
                req = json.load(f)
                self.task_description = req.get("task_description", self.task_description)
                requirements_context = f"""
**Task Description**: {req.get('task_description', 'Not provided')}
**Workflow Type**: {req.get('workflow_type', 'Not specified')}
**Services Involved**: {', '.join(req.get('services_involved', []))}
**User Requirements**:
{chr(10).join(f'- {r}' for r in req.get('user_requirements', []))}
**Acceptance Criteria**:
{chr(10).join(f'- {c}' for c in req.get('acceptance_criteria', []))}
**Constraints**:
{chr(10).join(f'- {c}' for c in req.get('constraints', []))}
"""

        if self.complexity_override:
            # Manual override
            complexity = Complexity(self.complexity_override)
            self.assessment = ComplexityAssessment(
                complexity=complexity,
                confidence=1.0,
                reasoning=f"Manual override: {self.complexity_override}",
            )
            print_status(f"Complexity override: {complexity.value.upper()}", "success")
            task_logger.log(f"Complexity override: {complexity.value.upper()}", LogEntryType.SUCCESS, LogPhase.PLANNING)
        elif self.use_ai_assessment:
            # Run AI assessment with full requirements context
            print_status("Running AI complexity assessment...", "progress")
            task_logger.log("Analyzing task complexity with AI...", LogEntryType.INFO, LogPhase.PLANNING)
            self.assessment = await self._run_ai_complexity_assessment(requirements_context)

            if self.assessment:
                print_status(f"AI assessed complexity: {highlight(self.assessment.complexity.value.upper())}", "success")
                print_key_value("Confidence", f"{self.assessment.confidence:.0%}")
                print_key_value("Reasoning", self.assessment.reasoning)
                task_logger.log(f"Complexity: {self.assessment.complexity.value.upper()} ({self.assessment.confidence:.0%} confidence)", LogEntryType.SUCCESS, LogPhase.PLANNING)

                # Show flags if set
                if self.assessment.needs_research:
                    print(f"  {muted('→ Research phase enabled')}")
                    task_logger.log("Research phase will be included", LogEntryType.INFO, LogPhase.PLANNING)
                if self.assessment.needs_self_critique:
                    print(f"  {muted('→ Self-critique phase enabled')}")
                    task_logger.log("Self-critique phase will be included", LogEntryType.INFO, LogPhase.PLANNING)
            else:
                # Fall back to heuristic assessment
                print_status("AI assessment failed, falling back to heuristics...", "warning")
                task_logger.log("AI assessment failed, using heuristic fallback", LogEntryType.INFO, LogPhase.PLANNING)
                self.assessment = self._heuristic_assessment()
                print_status(f"Assessed complexity: {highlight(self.assessment.complexity.value.upper())}", "success")
                task_logger.log(f"Complexity: {self.assessment.complexity.value.upper()}", LogEntryType.SUCCESS, LogPhase.PLANNING)
        else:
            # Use heuristic assessment
            task_logger.log("Assessing task complexity...", LogEntryType.INFO, LogPhase.PLANNING)
            self.assessment = self._heuristic_assessment()
            print_status(f"Assessed complexity: {highlight(self.assessment.complexity.value.upper())}", "success")
            print_key_value("Confidence", f"{self.assessment.confidence:.0%}")
            print_key_value("Reasoning", self.assessment.reasoning)
            task_logger.log(f"Complexity: {self.assessment.complexity.value.upper()} ({self.assessment.confidence:.0%} confidence)", LogEntryType.SUCCESS, LogPhase.PLANNING)

        # Show what phases will run
        phases = self.assessment.phases_to_run()
        print()
        print(f"  Phases to run ({highlight(str(len(phases)))}):")
        for i, phase in enumerate(phases, 1):
            print(f"    {i}. {phase}")

        # Save assessment to spec dir (may already exist from AI agent)
        if not assessment_file.exists():
            with open(assessment_file, "w") as f:
                json.dump({
                    "complexity": self.assessment.complexity.value,
                    "confidence": self.assessment.confidence,
                    "reasoning": self.assessment.reasoning,
                    "signals": self.assessment.signals,
                    "estimated_files": self.assessment.estimated_files,
                    "estimated_services": self.assessment.estimated_services,
                    "external_integrations": self.assessment.external_integrations,
                    "infrastructure_changes": self.assessment.infrastructure_changes,
                    "phases_to_run": phases,
                    "needs_research": self.assessment.needs_research,
                    "needs_self_critique": self.assessment.needs_self_critique,
                    "dev_mode": self.dev_mode,  # Track if this spec was created in dev mode
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)

        return PhaseResult("complexity_assessment", True, [str(assessment_file)], [], 0)

    async def _run_ai_complexity_assessment(self, additional_requirements_context: str = "") -> Optional[ComplexityAssessment]:
        """Run AI agent to assess complexity. Returns None if it fails."""
        assessment_file = self.spec_dir / "complexity_assessment.json"
        
        # Prepare context for the AI
        context = f"""
**Project Directory**: {self.project_dir}
**Spec Directory**: {self.spec_dir}
"""
        
        # Add requirements context (this is the key information for accurate assessment)
        if additional_requirements_context:
            context += f"\n## Requirements (from user)\n{additional_requirements_context}\n"
        else:
            context += f"\n**Task Description**: {self.task_description or 'Not provided'}\n"
        
        # Add project index if available
        auto_build_index = Path(__file__).parent / "project_index.json"
        if auto_build_index.exists():
            context += f"\n**Project Index**: Available at {auto_build_index}\n"
        
        # Point to requirements file for detailed reading
        requirements_file = self.spec_dir / "requirements.json"
        if requirements_file.exists():
            context += f"\n**Requirements File**: {requirements_file} (read this for full details)\n"
        
        try:
            success, output = await self._run_agent(
                "complexity_assessor.md",
                additional_context=context,
            )
            
            if success and assessment_file.exists():
                with open(assessment_file) as f:
                    data = json.load(f)
                
                # Parse AI assessment into ComplexityAssessment
                complexity_str = data.get("complexity", "standard").lower()
                complexity = Complexity(complexity_str)
                
                # Extract flags
                flags = data.get("flags", {})
                
                return ComplexityAssessment(
                    complexity=complexity,
                    confidence=data.get("confidence", 0.75),
                    reasoning=data.get("reasoning", "AI assessment"),
                    signals=data.get("analysis", {}),
                    estimated_files=data.get("analysis", {}).get("scope", {}).get("estimated_files", 5),
                    estimated_services=data.get("analysis", {}).get("scope", {}).get("estimated_services", 1),
                    external_integrations=data.get("analysis", {}).get("integrations", {}).get("external_services", []),
                    infrastructure_changes=data.get("analysis", {}).get("infrastructure", {}).get("docker_changes", False),
                    recommended_phases=data.get("recommended_phases", []),
                    needs_research=flags.get("needs_research", False),
                    needs_self_critique=flags.get("needs_self_critique", False),
                )
            
            return None
            
        except Exception as e:
            print_status(f"AI assessment failed: {e}", "warning")
            return None

    def _heuristic_assessment(self) -> ComplexityAssessment:
        """Fall back to heuristic-based complexity assessment."""
        # Load project index if available
        project_index = {}
        auto_build_index = Path(__file__).parent / "project_index.json"
        if auto_build_index.exists():
            with open(auto_build_index) as f:
                project_index = json.load(f)

        analyzer = ComplexityAnalyzer(project_index)
        return analyzer.analyze(self.task_description or "")

    async def phase_discovery(self) -> PhaseResult:
        """Analyze project structure."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        errors = []
        retries = 0

        for attempt in range(MAX_RETRIES):
            retries = attempt

            # Check if project_index already exists
            auto_build_index = Path(__file__).parent / "project_index.json"
            spec_index = self.spec_dir / "project_index.json"

            if auto_build_index.exists() and not spec_index.exists():
                # Copy existing index
                import shutil
                shutil.copy(auto_build_index, spec_index)
                print_status("Copied existing project_index.json", "success")
                task_logger.log("Using existing project index", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("discovery", True, [str(spec_index)], [], 0)

            if spec_index.exists():
                print_status("project_index.json already exists", "success")
                task_logger.log("Project index already exists", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("discovery", True, [str(spec_index)], [], 0)

            # Run analyzer
            print_status("Running project analyzer...", "progress")
            task_logger.log("Scanning project structure and dependencies...", LogEntryType.INFO, LogPhase.PLANNING)
            success, output = self._run_script(
                "analyzer.py",
                ["--output", str(spec_index)]
            )

            if success and spec_index.exists():
                # Log what was discovered
                try:
                    with open(spec_index) as f:
                        index_data = json.load(f)
                    file_count = len(index_data.get("files", []))
                    task_logger.log(f"Discovered {file_count} files in project", LogEntryType.SUCCESS, LogPhase.PLANNING)
                except Exception:
                    task_logger.log("Created project index", LogEntryType.SUCCESS, LogPhase.PLANNING)
                print_status("Created project_index.json", "success")
                return PhaseResult("discovery", True, [str(spec_index)], [], retries)

            errors.append(f"Attempt {attempt + 1}: {output}")
            task_logger.log(f"Discovery attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)
            print_status(f"Attempt {attempt + 1} failed: {output[:200]}", "error")

        return PhaseResult("discovery", False, [], errors, retries)

    async def phase_historical_context(self) -> PhaseResult:
        """Retrieve historical context from Graphiti knowledge graph (if enabled).

        This phase runs early in the pipeline to gather hints from past sessions
        and similar tasks that can inform requirements and spec creation.
        """
        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        hints_file = self.spec_dir / "graph_hints.json"

        # Check if hints already exist
        if hints_file.exists():
            print_status("graph_hints.json already exists", "success")
            task_logger.log("Historical context already available", LogEntryType.SUCCESS, LogPhase.PLANNING)
            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        # Check if Graphiti is enabled
        if not is_graphiti_enabled():
            print_status("Graphiti not enabled, skipping historical context", "info")
            task_logger.log("Knowledge graph not configured, skipping", LogEntryType.INFO, LogPhase.PLANNING)
            # Create empty hints file
            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": False,
                    "reason": "Graphiti not configured",
                    "hints": [],
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        # Get graph hints for this task
        task_query = self.task_description or ""

        # If we have requirements, use the full task description
        requirements_file = self.spec_dir / "requirements.json"
        if requirements_file.exists():
            try:
                with open(requirements_file) as f:
                    req = json.load(f)
                    task_query = req.get("task_description", task_query)
            except (json.JSONDecodeError, IOError):
                pass

        if not task_query:
            print_status("No task description for graph query, skipping", "warning")
            task_logger.log("No task description for graph query", LogEntryType.INFO, LogPhase.PLANNING)
            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": True,
                    "reason": "No task description available",
                    "hints": [],
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        print_status("Querying Graphiti knowledge graph...", "progress")
        task_logger.log("Searching knowledge graph for relevant context...", LogEntryType.INFO, LogPhase.PLANNING)

        try:
            hints = await get_graph_hints(
                query=task_query,
                project_id=str(self.project_dir),
                max_results=10,
            )

            # Save hints to file
            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": True,
                    "query": task_query,
                    "hints": hints,
                    "hint_count": len(hints),
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)

            if hints:
                print_status(f"Retrieved {len(hints)} graph hints", "success")
                task_logger.log(f"Found {len(hints)} relevant insights from past sessions", LogEntryType.SUCCESS, LogPhase.PLANNING)
                # Show a preview of what was found
                hint_types = {}
                for h in hints:
                    ht = h.get("type", "unknown")
                    hint_types[ht] = hint_types.get(ht, 0) + 1
                for ht, count in hint_types.items():
                    print(f"  {muted(f'• {ht}:')} {count}")
            else:
                print_status("No relevant graph hints found", "info")
                task_logger.log("No relevant historical context found", LogEntryType.INFO, LogPhase.PLANNING)

            return PhaseResult("historical_context", True, [str(hints_file)], [], 0)

        except Exception as e:
            print_status(f"Graph query failed: {e}", "warning")
            task_logger.log(f"Knowledge graph query failed: {e}", LogEntryType.ERROR, LogPhase.PLANNING)
            # Create error hints file but don't fail the phase
            with open(hints_file, "w") as f:
                json.dump({
                    "enabled": True,
                    "error": str(e),
                    "hints": [],
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return PhaseResult("historical_context", True, [str(hints_file)], [str(e)], 0)

    def _open_editor_for_input(self, field_name: str) -> str:
        """Open the user's editor for long-form text input."""
        import shlex
        import tempfile
        
        editor = os.environ.get("EDITOR", os.environ.get("VISUAL", "nano"))
        
        # Create temp file with helpful instructions
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(f"# Enter your {field_name.replace('_', ' ')} below\n")
            f.write("# Lines starting with # will be ignored\n")
            f.write("# Save and close the editor when done\n\n")
            temp_path = f.name
        
        try:
            # Parse editor command (handles "code --wait" etc.)
            editor_cmd = shlex.split(editor)
            editor_cmd.append(temp_path)
            
            # Open editor
            result = subprocess.run(editor_cmd)
            
            if result.returncode != 0:
                print(f"     {muted('Editor exited with error, using empty input')}")
                return ""
            
            # Read the content
            with open(temp_path) as f:
                lines = f.readlines()
            
            # Filter out comment lines and join
            content_lines = [
                line.rstrip() for line in lines 
                if not line.strip().startswith("#")
            ]
            return "\n".join(content_lines).strip()
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    def _interactive_requirements_gathering(self) -> dict:
        """Gather requirements interactively from the user via CLI prompts."""
        print()
        print(f"  {muted('Answer the following questions to define your task:')}")
        print()

        # Task description - multi-line support with editor option
        print(f"  {bold('1. What do you want to build or fix?')}")
        print(f"     {muted('(Describe the feature, bug fix, or change)')}")
        print(f"     {muted('Type \"edit\" to open in your editor, or enter text below')}")
        print(f"     {muted('(Press Enter often for new lines, blank line = done)')}")
        
        task = ""
        task_lines = []
        while True:
            try:
                line = input("     > " if not task_lines else "       ")
                
                # Check for editor command on first line
                if not task_lines and line.strip().lower() == "edit":
                    task = self._open_editor_for_input("task_description")
                    if task:
                        print(f"     {muted(f'Got {len(task)} chars from editor')}")
                    break
                
                if not line and task_lines:  # Blank line and we have content = done
                    break
                if line:
                    task_lines.append(line)
            except EOFError:
                break
        
        # If we collected lines (not from editor)
        if task_lines:
            task = " ".join(task_lines).strip()
        
        if not task:
            task = "No task description provided"
        print()

        # Workflow type
        print(f"  {bold('2. What type of work is this?')}")
        print(f"     {muted('[1] feature  - New functionality')}")
        print(f"     {muted('[2] bugfix   - Fix existing issue')}")
        print(f"     {muted('[3] refactor - Improve code structure')}")
        print(f"     {muted('[4] docs     - Documentation changes')}")
        print(f"     {muted('[5] test     - Add or improve tests')}")
        workflow_choice = input("     > ").strip()
        workflow_map = {
            "1": "feature", "feature": "feature",
            "2": "bugfix", "bugfix": "bugfix",
            "3": "refactor", "refactor": "refactor",
            "4": "docs", "docs": "docs",
            "5": "test", "test": "test",
        }
        workflow_type = workflow_map.get(workflow_choice.lower(), "feature")
        print()

        # Additional context (optional) - multi-line support
        print(f"  {bold('3. Any additional context or constraints?')}")
        print(f"     {muted('(Press Enter to skip, or enter a blank line when done)')}")
        
        context_lines = []
        while True:
            try:
                line = input("     > " if not context_lines else "       ")
                if not line:  # Blank line = done (allows skip on first empty)
                    break
                context_lines.append(line)
            except EOFError:
                break
        
        additional_context = " ".join(context_lines).strip()
        print()

        return {
            "task_description": task,
            "workflow_type": workflow_type,
            "services_involved": [],  # AI will discover this during planning and context fetching
            "additional_context": additional_context if additional_context else None,
            "created_at": datetime.now().isoformat(),
        }

    async def phase_requirements(self, interactive: bool = True) -> PhaseResult:
        """Gather requirements from user or task description."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        requirements_file = self.spec_dir / "requirements.json"

        # Check if requirements already exist
        if requirements_file.exists():
            print_status("requirements.json already exists", "success")
            task_logger.log("Requirements already defined", LogEntryType.SUCCESS, LogPhase.PLANNING)
            return PhaseResult("requirements", True, [str(requirements_file)], [], 0)

        # If we have a task description and not interactive, create requirements directly
        if self.task_description and not interactive:
            task_logger.log("Creating requirements from task description...", LogEntryType.INFO, LogPhase.PLANNING)
            requirements = {
                "task_description": self.task_description,
                "workflow_type": "feature",  # Default, agent will refine
                "services_involved": [],  # AI will discover during planning and context fetching
                "created_at": datetime.now().isoformat(),
            }
            with open(requirements_file, "w") as f:
                json.dump(requirements, f, indent=2)
            print_status("Created requirements.json from task description", "success")
            # Log a summary of the task
            task_preview = self.task_description[:100] + "..." if len(self.task_description) > 100 else self.task_description
            task_logger.log(f"Task: {task_preview}", LogEntryType.SUCCESS, LogPhase.PLANNING)
            return PhaseResult("requirements", True, [str(requirements_file)], [], 0)

        # Interactive mode - gather requirements via CLI prompts
        if interactive:
            try:
                task_logger.log("Gathering requirements interactively...", LogEntryType.INFO, LogPhase.PLANNING)
                requirements = self._interactive_requirements_gathering()

                # Update task description for subsequent phases
                self.task_description = requirements["task_description"]

                # Re-run complexity assessment with the actual task
                print()
                print_status("Re-assessing complexity with actual task...", "progress")
                task_logger.log("Re-assessing task complexity...", LogEntryType.INFO, LogPhase.PLANNING)
                analyzer = ComplexityAnalyzer()
                self.assessment = analyzer.analyze(self.task_description, requirements)
                print_status(f"Updated complexity: {highlight(self.assessment.complexity.value.upper())}", "success")
                print_key_value("Confidence", f"{self.assessment.confidence:.0%}")
                print_key_value("Reasoning", self.assessment.reasoning)
                task_logger.log(f"Complexity: {self.assessment.complexity.value.upper()} ({self.assessment.confidence:.0%} confidence)", LogEntryType.SUCCESS, LogPhase.PLANNING)

                with open(requirements_file, "w") as f:
                    json.dump(requirements, f, indent=2)
                print()
                print_status("Created requirements.json", "success")
                task_logger.log("Requirements captured", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("requirements", True, [str(requirements_file)], [], 0)
            except (KeyboardInterrupt, EOFError):
                print()
                print_status("Requirements gathering cancelled", "warning")
                return PhaseResult("requirements", False, [], ["User cancelled"], 0)

        # Fallback: create minimal requirements
        requirements = {
            "task_description": self.task_description or "Unknown task",
            "workflow_type": "feature",
            "services_involved": [],  # AI will discover during planning and context fetching
            "created_at": datetime.now().isoformat(),
        }
        with open(requirements_file, "w") as f:
            json.dump(requirements, f, indent=2)
        print_status("Created minimal requirements.json", "success")
        return PhaseResult("requirements", True, [str(requirements_file)], [], 0)

    async def phase_quick_spec(self) -> PhaseResult:
        """Quick spec for simple tasks - combines context and spec in one step."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        spec_file = self.spec_dir / "spec.md"
        plan_file = self.spec_dir / "implementation_plan.json"

        if spec_file.exists() and plan_file.exists():
            print_status("Quick spec already exists", "success")
            task_logger.log("Quick spec already exists", LogEntryType.SUCCESS, LogPhase.PLANNING)
            return PhaseResult("quick_spec", True, [str(spec_file), str(plan_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running quick spec agent (attempt {attempt + 1})...", "progress")
            task_logger.log("Creating quick spec for simple task...", LogEntryType.INFO, LogPhase.PLANNING)

            context = f"""
**Task**: {self.task_description}
**Spec Directory**: {self.spec_dir}
**Complexity**: SIMPLE (1-2 files expected)

This is a SIMPLE task. Create a minimal spec and implementation plan directly.
No research or extensive analysis needed.

Create:
1. A concise spec.md with just the essential sections
2. A simple implementation_plan.json with 1-2 subtasks
"""
            success, output = await self._run_agent(
                "spec_quick.md",
                additional_context=context,
            )

            if success and spec_file.exists():
                # Create minimal plan if agent didn't
                if not plan_file.exists():
                    self._create_minimal_plan()

                print_status("Quick spec created", "success")
                task_logger.log("Quick spec and plan created successfully", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("quick_spec", True, [str(spec_file), str(plan_file)], [], attempt)

            errors.append(f"Attempt {attempt + 1}: Quick spec agent failed")
            task_logger.log(f"Quick spec attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)

        return PhaseResult("quick_spec", False, [], errors, MAX_RETRIES)

    def _create_minimal_plan(self):
        """Create a minimal implementation plan for simple tasks."""
        plan = {
            "spec_name": self.spec_dir.name,
            "workflow_type": "simple",
            "total_phases": 1,
            "recommended_workers": 1,
            "phases": [
                {
                    "phase": 1,
                    "name": "Implementation",
                    "description": self.task_description or "Simple implementation",
                    "depends_on": [],
                    "subtasks": [
                        {
                            "id": "subtask-1-1",
                            "description": self.task_description or "Implement the change",
                            "service": "main",
                            "status": "pending",
                            "files_to_create": [],
                            "files_to_modify": [],
                            "patterns_from": [],
                            "verification": {
                                "type": "manual",
                                "run": "Verify the change works as expected"
                            }
                        }
                    ]
                }
            ],
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "complexity": "simple",
                "estimated_sessions": 1,
            }
        }

        plan_file = self.spec_dir / "implementation_plan.json"
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)

    async def phase_research(self) -> PhaseResult:
        """Research external integrations and validate assumptions."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        research_file = self.spec_dir / "research.json"
        requirements_file = self.spec_dir / "requirements.json"

        # Check if research already exists
        if research_file.exists():
            print_status("research.json already exists", "success")
            task_logger.log("Integration research already complete", LogEntryType.SUCCESS, LogPhase.PLANNING)
            return PhaseResult("research", True, [str(research_file)], [], 0)

        # Load requirements to understand what integrations need research
        if not requirements_file.exists():
            print_status("No requirements.json - skipping research phase", "warning")
            task_logger.log("Skipping research (no requirements)", LogEntryType.INFO, LogPhase.PLANNING)
            # Create empty research file
            with open(research_file, "w") as f:
                json.dump({
                    "integrations_researched": [],
                    "research_skipped": True,
                    "reason": "No requirements file available",
                    "created_at": datetime.now().isoformat(),
                }, f, indent=2)
            return PhaseResult("research", True, [str(research_file)], [], 0)

        # Run research agent
        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running research agent (attempt {attempt + 1})...", "progress")
            print(f"  {muted('Validating external integrations against documentation...')}")
            task_logger.log("Researching external integrations and APIs...", LogEntryType.INFO, LogPhase.PLANNING)

            context = f"""
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
            success, output = await self._run_agent(
                "spec_researcher.md",
                additional_context=context,
            )

            if success and research_file.exists():
                print_status("Created research.json", "success")
                task_logger.log("Integration research complete", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("research", True, [str(research_file)], [], attempt)

            # If agent didn't create file, create minimal one
            if success and not research_file.exists():
                print_status("Agent completed but no research.json created, creating minimal...", "warning")
                task_logger.log("Research complete (no findings)", LogEntryType.SUCCESS, LogPhase.PLANNING)
                with open(research_file, "w") as f:
                    json.dump({
                        "integrations_researched": [],
                        "research_completed": True,
                        "agent_output": output[:2000] if output else "",
                        "created_at": datetime.now().isoformat(),
                    }, f, indent=2)
                return PhaseResult("research", True, [str(research_file)], [], attempt)

            errors.append(f"Attempt {attempt + 1}: Research agent failed")
            task_logger.log(f"Research attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)

        # Create minimal research file on failure
        with open(research_file, "w") as f:
            json.dump({
                "integrations_researched": [],
                "research_failed": True,
                "errors": errors,
                "created_at": datetime.now().isoformat(),
            }, f, indent=2)
        print_status("Created minimal research.json (agent failed)", "warning")
        task_logger.log("Research phase failed, continuing with minimal data", LogEntryType.INFO, LogPhase.PLANNING)
        return PhaseResult("research", True, [str(research_file)], errors, MAX_RETRIES)

    async def phase_context(self) -> PhaseResult:
        """Discover relevant files for the task."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        context_file = self.spec_dir / "context.json"
        requirements_file = self.spec_dir / "requirements.json"

        if context_file.exists():
            print_status("context.json already exists", "success")
            task_logger.log("File context already discovered", LogEntryType.SUCCESS, LogPhase.PLANNING)
            return PhaseResult("context", True, [str(context_file)], [], 0)

        # Load requirements for task description
        task = self.task_description
        services = ""

        if requirements_file.exists():
            with open(requirements_file) as f:
                req = json.load(f)
                task = req.get("task_description", task)
                services = ",".join(req.get("services_involved", []))

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running context discovery (attempt {attempt + 1})...", "progress")
            task_logger.log("Discovering relevant files for this task...", LogEntryType.INFO, LogPhase.PLANNING)

            args = [
                "--task", task or "unknown task",
                "--output", str(context_file),
            ]
            if services:
                args.extend(["--services", services])

            success, output = self._run_script("context.py", args)

            if success and context_file.exists():
                # Validate the created context.json has required fields
                try:
                    with open(context_file) as f:
                        ctx = json.load(f)
                    # Check for required field and fix common issues
                    if "task_description" not in ctx:
                        # Common issue: field named "task" instead of "task_description"
                        if "task" in ctx:
                            ctx["task_description"] = ctx.pop("task")
                            with open(context_file, "w") as f:
                                json.dump(ctx, f, indent=2)
                            print_status("Fixed context.json schema (task → task_description)", "success")
                        else:
                            ctx["task_description"] = task or "unknown task"
                            with open(context_file, "w") as f:
                                json.dump(ctx, f, indent=2)
                            print_status("Added missing task_description to context.json", "success")
                except (json.JSONDecodeError, IOError) as e:
                    errors.append(f"Attempt {attempt + 1}: Invalid context.json - {e}")
                    task_logger.log(f"Context discovery attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)
                    context_file.unlink(missing_ok=True)
                    continue

                # Log what was discovered
                try:
                    files_to_modify = len(ctx.get("files_to_modify", []))
                    files_to_reference = len(ctx.get("files_to_reference", []))
                    task_logger.log(f"Found {files_to_modify} files to modify, {files_to_reference} files to reference", LogEntryType.SUCCESS, LogPhase.PLANNING)
                except Exception:
                    task_logger.log("Context discovery complete", LogEntryType.SUCCESS, LogPhase.PLANNING)

                print_status("Created context.json", "success")
                return PhaseResult("context", True, [str(context_file)], [], attempt)

            errors.append(f"Attempt {attempt + 1}: {output}")
            task_logger.log(f"Context discovery attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)
            print_status(f"Attempt {attempt + 1} failed", "error")

        # Create minimal context if script fails
        minimal_context = {
            "task_description": task or "unknown task",
            "scoped_services": services.split(",") if services else [],
            "files_to_modify": [],
            "files_to_reference": [],
            "created_at": datetime.now().isoformat(),
        }
        with open(context_file, "w") as f:
            json.dump(minimal_context, f, indent=2)
        print_status("Created minimal context.json (script failed)", "success")
        task_logger.log("Created minimal context (discovery script failed)", LogEntryType.INFO, LogPhase.PLANNING)
        return PhaseResult("context", True, [str(context_file)], errors, MAX_RETRIES)

    async def phase_spec_writing(self) -> PhaseResult:
        """Write the spec.md document."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        spec_file = self.spec_dir / "spec.md"

        if spec_file.exists():
            # Validate existing spec
            result = self.validator.validate_spec_document()
            if result.valid:
                print_status("spec.md already exists and is valid", "success")
                task_logger.log("Spec document already exists", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("spec_writing", True, [str(spec_file)], [], 0)
            print_status("spec.md exists but has issues, regenerating...", "warning")
            task_logger.log("Regenerating spec document (validation issues)", LogEntryType.INFO, LogPhase.PLANNING)

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running spec writer (attempt {attempt + 1})...", "progress")
            task_logger.log("Writing spec document with AI agent...", LogEntryType.INFO, LogPhase.PLANNING)

            success, output = await self._run_agent("spec_writer.md")

            if success and spec_file.exists():
                # Validate
                result = self.validator.validate_spec_document()
                if result.valid:
                    print_status("Created valid spec.md", "success")
                    task_logger.log("Spec document created successfully", LogEntryType.SUCCESS, LogPhase.PLANNING)
                    return PhaseResult("spec_writing", True, [str(spec_file)], [], attempt)
                else:
                    errors.append(f"Attempt {attempt + 1}: Spec invalid - {result.errors}")
                    task_logger.log(f"Spec validation failed: {result.errors[:100]}", LogEntryType.ERROR, LogPhase.PLANNING)
                    print_status(f"Spec created but invalid: {result.errors}", "error")
            else:
                errors.append(f"Attempt {attempt + 1}: Agent did not create spec.md")
                task_logger.log(f"Spec writer attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)

        return PhaseResult("spec_writing", False, [], errors, MAX_RETRIES)

    async def phase_self_critique(self) -> PhaseResult:
        """Self-critique the spec using extended thinking."""

        spec_file = self.spec_dir / "spec.md"
        research_file = self.spec_dir / "research.json"
        critique_file = self.spec_dir / "critique_report.json"

        if not spec_file.exists():
            print_status("No spec.md to critique", "error")
            return PhaseResult("self_critique", False, [], ["spec.md does not exist"], 0)

        # Check if critique already done
        if critique_file.exists():
            with open(critique_file) as f:
                critique = json.load(f)
                if critique.get("issues_fixed", False) or critique.get("no_issues_found", False):
                    print_status("Self-critique already completed", "success")
                    return PhaseResult("self_critique", True, [str(critique_file)], [], 0)

        errors = []
        for attempt in range(MAX_RETRIES):
            print_status(f"Running self-critique agent (attempt {attempt + 1})...", "progress")
            print(f"  {muted('Using extended thinking to find issues in the spec...')}")

            context = f"""
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
            success, output = await self._run_agent(
                "spec_critic.md",
                additional_context=context,
            )

            if success:
                # Create critique report if agent didn't
                if not critique_file.exists():
                    with open(critique_file, "w") as f:
                        json.dump({
                            "issues_found": [],
                            "no_issues_found": True,
                            "critique_summary": "Agent completed without explicit issues",
                            "created_at": datetime.now().isoformat(),
                        }, f, indent=2)

                # Re-validate spec after critique
                result = self.validator.validate_spec_document()
                if result.valid:
                    print_status("Self-critique completed, spec is valid", "success")
                    return PhaseResult("self_critique", True, [str(critique_file)], [], attempt)
                else:
                    print_status(f"Spec invalid after critique: {result.errors}", "warning")
                    errors.append(f"Attempt {attempt + 1}: Spec still invalid after critique")
            else:
                errors.append(f"Attempt {attempt + 1}: Critique agent failed")

        # Create minimal critique report on failure
        with open(critique_file, "w") as f:
            json.dump({
                "issues_found": [],
                "critique_failed": True,
                "errors": errors,
                "created_at": datetime.now().isoformat(),
            }, f, indent=2)
        print_status("Self-critique failed, continuing with existing spec", "warning")
        return PhaseResult("self_critique", True, [str(critique_file)], errors, MAX_RETRIES)

    async def phase_planning(self) -> PhaseResult:
        """Create the implementation plan."""

        # Get task logger for detailed logging
        task_logger = get_task_logger(self.spec_dir)

        plan_file = self.spec_dir / "implementation_plan.json"

        if plan_file.exists():
            # Validate existing plan
            result = self.validator.validate_implementation_plan()
            if result.valid:
                print_status("implementation_plan.json already exists and is valid", "success")
                task_logger.log("Implementation plan already exists", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("planning", True, [str(plan_file)], [], 0)
            print_status("Plan exists but invalid, regenerating...", "warning")
            task_logger.log("Regenerating implementation plan (validation issues)", LogEntryType.INFO, LogPhase.PLANNING)

        errors = []

        # Try Python script first (deterministic)
        print_status("Trying planner.py (deterministic)...", "progress")
        task_logger.log("Creating implementation plan...", LogEntryType.INFO, LogPhase.PLANNING)
        success, output = self._run_script(
            "planner.py",
            ["--spec-dir", str(self.spec_dir)]
        )

        if success and plan_file.exists():
            # Validate
            result = self.validator.validate_implementation_plan()
            if result.valid:
                print_status("Created valid implementation_plan.json via script", "success")
                # Log subtask count
                try:
                    with open(plan_file) as f:
                        plan_data = json.load(f)
                    total_subtasks = sum(len(p.get("subtasks", [])) for p in plan_data.get("phases", []))
                    task_logger.log(f"Implementation plan created with {total_subtasks} subtasks", LogEntryType.SUCCESS, LogPhase.PLANNING)
                except Exception:
                    task_logger.log("Implementation plan created", LogEntryType.SUCCESS, LogPhase.PLANNING)
                return PhaseResult("planning", True, [str(plan_file)], [], 0)
            else:
                print_status("Script output invalid, trying auto-fix...", "warning")
                if auto_fix_plan(self.spec_dir):
                    result = self.validator.validate_implementation_plan()
                    if result.valid:
                        print_status("Auto-fixed implementation_plan.json", "success")
                        task_logger.log("Implementation plan created (auto-fixed)", LogEntryType.SUCCESS, LogPhase.PLANNING)
                        return PhaseResult("planning", True, [str(plan_file)], [], 0)

                errors.append(f"Script output invalid: {result.errors}")
                task_logger.log("Script-based planning failed, trying AI agent", LogEntryType.INFO, LogPhase.PLANNING)

        # Fall back to agent
        print_status("Falling back to planner agent...", "progress")
        task_logger.log("Creating implementation plan with AI agent...", LogEntryType.INFO, LogPhase.PLANNING)
        for attempt in range(MAX_RETRIES):
            print_status(f"Running planner agent (attempt {attempt + 1})...", "progress")

            success, output = await self._run_agent("planner.md")

            if success and plan_file.exists():
                # Validate
                result = self.validator.validate_implementation_plan()
                if result.valid:
                    print_status("Created valid implementation_plan.json via agent", "success")
                    # Log subtask count
                    try:
                        with open(plan_file) as f:
                            plan_data = json.load(f)
                        total_subtasks = sum(len(p.get("subtasks", [])) for p in plan_data.get("phases", []))
                        task_logger.log(f"Implementation plan created with {total_subtasks} subtasks", LogEntryType.SUCCESS, LogPhase.PLANNING)
                    except Exception:
                        task_logger.log("Implementation plan created", LogEntryType.SUCCESS, LogPhase.PLANNING)
                    return PhaseResult("planning", True, [str(plan_file)], [], attempt)
                else:
                    # Try auto-fix
                    if auto_fix_plan(self.spec_dir):
                        result = self.validator.validate_implementation_plan()
                        if result.valid:
                            print_status("Auto-fixed implementation_plan.json", "success")
                            task_logger.log("Implementation plan created (auto-fixed)", LogEntryType.SUCCESS, LogPhase.PLANNING)
                            return PhaseResult("planning", True, [str(plan_file)], [], attempt)

                    errors.append(f"Agent attempt {attempt + 1}: {result.errors}")
                    task_logger.log(f"Planning attempt {attempt + 1} produced invalid plan", LogEntryType.ERROR, LogPhase.PLANNING)
                    print_status("Plan created but invalid", "error")
            else:
                errors.append(f"Agent attempt {attempt + 1}: Did not create plan file")
                task_logger.log(f"Planning attempt {attempt + 1} failed", LogEntryType.ERROR, LogPhase.PLANNING)

        return PhaseResult("planning", False, [], errors, MAX_RETRIES)

    async def phase_validation(self) -> PhaseResult:
        """Final validation of all spec files with auto-fix retry."""

        for attempt in range(MAX_RETRIES):
            results = self.validator.validate_all()
            all_valid = all(r.valid for r in results)

            for result in results:
                if result.valid:
                    print_status(f"{result.checkpoint}: PASS", "success")
                else:
                    print_status(f"{result.checkpoint}: FAIL", "error")
                for err in result.errors:
                    print(f"    {muted('Error:')} {err}")

            if all_valid:
                print()
                print_status("All validation checks passed", "success")
                return PhaseResult("validation", True, [], [], attempt)

            # If not valid, try to auto-fix with AI agent
            if attempt < MAX_RETRIES - 1:
                print()
                print_status(f"Attempting auto-fix (attempt {attempt + 1}/{MAX_RETRIES - 1})...", "progress")

                # Collect all errors for the fixer agent
                error_details = []
                for result in results:
                    if not result.valid:
                        error_details.append(f"**{result.checkpoint}** validation failed:")
                        for err in result.errors:
                            error_details.append(f"  - {err}")
                        if result.fixes:
                            error_details.append(f"  Suggested fixes:")
                            for fix in result.fixes:
                                error_details.append(f"    - {fix}")

                # Run the validation fixer agent
                context = f"""
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
                success, output = await self._run_agent(
                    "validation_fixer.md",
                    additional_context=context,
                )

                if not success:
                    print_status("Auto-fix agent failed", "warning")

        # All retries exhausted
        errors = [
            f"{r.checkpoint}: {err}"
            for r in results
            for err in r.errors
        ]
        return PhaseResult("validation", False, [], errors, MAX_RETRIES)

    # === Main Orchestration ===

    async def run(self, interactive: bool = True, auto_approve: bool = False) -> bool:
        """Run the spec creation process with dynamic phase selection.

        Args:
            interactive: Whether to run in interactive mode for requirements gathering
            auto_approve: Whether to skip human review checkpoint and auto-approve

        Returns:
            True if spec creation and review completed successfully, False otherwise
        """
        debug_section("spec_runner", "Starting Spec Creation")
        debug("spec_runner", "Configuration",
              spec_dir=str(self.spec_dir),
              project_dir=str(self.project_dir),
              task=self.task_description,
              interactive=interactive,
              model=self.model)

        # Initialize task logger for planning phase
        task_logger = get_task_logger(self.spec_dir)
        task_logger.start_phase(LogPhase.PLANNING, "Starting spec creation process")

        print(box(
            f"Spec Directory: {self.spec_dir}\n"
            f"Project: {self.project_dir}" +
            (f"\nTask: {self.task_description}" if self.task_description else ""),
            title="SPEC CREATION ORCHESTRATOR",
            style="heavy"
        ))

        results = []
        phase_num = 0  # Track phase number for display

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
            display_name, display_icon = phase_display.get(name, (name.upper(), Icons.GEAR))
            print_section(f"PHASE {phase_num}: {display_name}", display_icon)
            # Log phase start to task logger
            task_logger.log(f"Starting phase {phase_num}: {display_name}", LogEntryType.INFO)
            return phase_fn()

        # === PHASE 1: DISCOVERY ===
        result = await run_phase("discovery", self.phase_discovery)
        results.append(result)
        if not result.success:
            print_status("Discovery failed", "error")
            task_logger.log("Discovery phase failed", LogEntryType.ERROR)
            task_logger.end_phase(LogPhase.PLANNING, success=False, message="Discovery failed")
            return False

        # === PHASE 2: REQUIREMENTS GATHERING ===
        result = await run_phase("requirements", lambda: self.phase_requirements(interactive))
        results.append(result)
        if not result.success:
            print_status("Requirements gathering failed", "error")
            task_logger.log("Requirements gathering failed", LogEntryType.ERROR)
            task_logger.end_phase(LogPhase.PLANNING, success=False, message="Requirements gathering failed")
            return False

        # Rename spec folder with better name from requirements
        self._rename_spec_dir_from_requirements()

        # === CREATE LINEAR TASK (if enabled) ===
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
                print_status("Linear task creation failed (continuing without)", "warning")

        # === PHASE 3: AI COMPLEXITY ASSESSMENT ===
        result = await run_phase("complexity_assessment", self.phase_complexity_assessment_with_requirements)
        results.append(result)
        if not result.success:
            print_status("Complexity assessment failed", "error")
            task_logger.log("Complexity assessment failed", LogEntryType.ERROR)
            task_logger.end_phase(LogPhase.PLANNING, success=False, message="Complexity assessment failed")
            return False

        # Map of all available phases (remaining after discovery/requirements/complexity)
        all_phases = {
            "historical_context": self.phase_historical_context,
            "research": self.phase_research,
            "context": self.phase_context,
            "spec_writing": self.phase_spec_writing,
            "self_critique": self.phase_self_critique,
            "planning": self.phase_planning,
            "validation": self.phase_validation,
            "quick_spec": self.phase_quick_spec,
        }

        # Get remaining phases to run based on complexity (excluding discovery/requirements which are done)
        all_phases_to_run = self.assessment.phases_to_run()
        phases_to_run = [p for p in all_phases_to_run if p not in ["discovery", "requirements"]]

        print()
        print(f"  Running {highlight(self.assessment.complexity.value.upper())} workflow")
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
                print_status(f"Phase '{phase_name}' failed after {result.retries} retries", "error")
                print(f"  {muted('Errors:')}")
                for err in result.errors:
                    print(f"    {icon(Icons.ARROW_RIGHT)} {err}")
                print()
                print_status("Spec creation incomplete. Fix errors and retry.", "warning")
                task_logger.log(f"Phase '{phase_name}' failed: {'; '.join(result.errors)}", LogEntryType.ERROR)
                task_logger.end_phase(LogPhase.PLANNING, success=False, message=f"Phase {phase_name} failed")
                return False

        # Summary
        files_created = []
        for r in results:
            for f in r.output_files:
                files_created.append(Path(f).name)

        print(box(
            f"Complexity: {self.assessment.complexity.value.upper()}\n"
            f"Phases run: {len(phases_executed) + 1}\n"  # +1 for complexity_assessment
            f"Spec saved to: {self.spec_dir}\n\n"
            f"Files created:\n" +
            "\n".join(f"  {icon(Icons.SUCCESS)} {f}" for f in files_created),
            title=f"{icon(Icons.SUCCESS)} SPEC CREATION COMPLETE",
            style="heavy"
        ))

        # End planning phase successfully
        task_logger.end_phase(LogPhase.PLANNING, success=True, message="Spec creation complete")

        # === HUMAN REVIEW CHECKPOINT ===
        # Pause before build to allow human to review spec and implementation plan
        print()
        print_section("HUMAN REVIEW CHECKPOINT", Icons.SEARCH)

        try:
            review_state = run_review_checkpoint(
                spec_dir=self.spec_dir,
                auto_approve=auto_approve,
            )

            if not review_state.is_approved():
                # User rejected or exited without approval
                print()
                print_status("Build will not proceed without approval.", "warning")
                return False

            debug_success("spec_runner", "Review checkpoint passed - spec approved")

        except SystemExit as e:
            # run_review_checkpoint may call sys.exit() on reject or Ctrl+C
            if e.code != 0:
                return False
            # Code 0 means graceful exit (e.g., Ctrl+C with saved feedback)
            return False
        except KeyboardInterrupt:
            print()
            print_status("Review interrupted. Run again to continue.", "info")
            return False

        return True


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Dynamic spec creation with complexity-based phase selection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Complexity Tiers:
  simple    - 3 phases: Discovery → Quick Spec → Validate (1-2 files)
  standard  - 6 phases: Discovery → Requirements → Context → Spec → Plan → Validate
  complex   - 8 phases: Full pipeline with research and self-critique

Examples:
  # Simple UI fix (auto-detected as simple)
  python spec_runner.py --task "Fix button color in Header component"

  # Force simple mode
  python spec_runner.py --task "Update text" --complexity simple

  # Complex integration (auto-detected)
  python spec_runner.py --task "Add Graphiti memory integration with FalkorDB"

  # Interactive mode
  python spec_runner.py --interactive
        """
    )
    parser.add_argument(
        "--task",
        type=str,
        help="Task description (what to build). For very long descriptions, use --task-file instead.",
    )
    parser.add_argument(
        "--task-file",
        type=Path,
        help="Read task description from a file (useful for long specs)",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Run in interactive mode (gather requirements from user)",
    )
    parser.add_argument(
        "--continue",
        dest="continue_spec",
        type=str,
        help="Continue an existing spec",
    )
    parser.add_argument(
        "--complexity",
        type=str,
        choices=["simple", "standard", "complex"],
        help="Override automatic complexity detection",
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="claude-opus-4-5-20251101",
        help="Model to use for agent phases",
    )
    parser.add_argument(
        "--no-ai-assessment",
        action="store_true",
        help="Use heuristic complexity assessment instead of AI (faster but less accurate)",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="[Deprecated] No longer has any effect - kept for compatibility",
    )
    parser.add_argument(
        "--no-build",
        action="store_true",
        help="Don't automatically start the build after spec creation (default: auto-start build)",
    )
    parser.add_argument(
        "--spec-dir",
        type=Path,
        help="Use existing spec directory instead of creating a new one (for UI integration)",
    )
    parser.add_argument(
        "--auto-approve",
        action="store_true",
        help="Skip human review checkpoint and automatically approve spec for building",
    )

    args = parser.parse_args()

    # Handle task from file if provided
    task_description = args.task
    if args.task_file:
        if not args.task_file.exists():
            print(f"Error: Task file not found: {args.task_file}")
            sys.exit(1)
        task_description = args.task_file.read_text().strip()
        if not task_description:
            print(f"Error: Task file is empty: {args.task_file}")
            sys.exit(1)

    # Validate task description isn't problematic
    if task_description:
        # Warn about very long descriptions but don't block
        if len(task_description) > 5000:
            print(f"Warning: Task description is very long ({len(task_description)} chars). Consider breaking into subtasks.")
        # Sanitize null bytes which could cause issues
        task_description = task_description.replace('\x00', '')

    # Find project root (look for auto-claude folder)
    project_dir = args.project_dir

    # Auto-detect if running from within auto-claude directory (the source code)
    if project_dir.name == "auto-claude" and (project_dir / "run.py").exists():
        # Running from within auto-claude/ source directory, go up 1 level
        project_dir = project_dir.parent
    elif not (project_dir / ".auto-claude").exists():
        # No .auto-claude folder found - try to find project root
        # First check for .auto-claude (installed instance)
        for parent in project_dir.parents:
            if (parent / ".auto-claude").exists():
                project_dir = parent
                break

    # Note: --dev flag is deprecated but kept for API compatibility
    if args.dev:
        print(f"\n{icon(Icons.GEAR)} Note: --dev flag is deprecated. All specs now go to .auto-claude/specs/\n")

    orchestrator = SpecOrchestrator(
        project_dir=project_dir,
        task_description=task_description,
        spec_name=args.continue_spec,
        spec_dir=args.spec_dir,
        model=args.model,
        complexity_override=args.complexity,
        use_ai_assessment=not args.no_ai_assessment,
        dev_mode=args.dev,
    )

    try:
        success = asyncio.run(orchestrator.run(
            interactive=args.interactive or not task_description,
            auto_approve=args.auto_approve,
        ))

        if not success:
            sys.exit(1)

        # Auto-start build unless --no-build is specified
        if not args.no_build:
            # Verify spec is approved before starting build (defensive check)
            review_state = ReviewState.load(orchestrator.spec_dir)
            if not review_state.is_approved():
                print()
                print_status("Build cannot start: spec not approved.", "error")
                print()
                print(f"  {muted('To approve the spec, run:')}")
                print(f"  {highlight(f'python auto-claude/review.py --spec-dir {orchestrator.spec_dir}')}")
                print()
                print(f"  {muted('Or re-run spec_runner with --auto-approve to skip review:')}")
                print(f"  {highlight(f'python auto-claude/spec_runner.py --task \"...\" --auto-approve')}")
                sys.exit(1)

            print()
            print_section("STARTING BUILD", Icons.LIGHTNING)
            print()

            # Build the run.py command
            run_script = Path(__file__).parent / "run.py"
            run_cmd = [
                sys.executable,
                str(run_script),
                "--spec", orchestrator.spec_dir.name,
                "--project-dir", str(orchestrator.project_dir),
                "--auto-continue",  # Non-interactive mode for chained execution
            ]

            # Pass through dev mode
            if args.dev:
                run_cmd.append("--dev")

            # Pass through model if not default
            if args.model != "claude-opus-4-5-20251101":
                run_cmd.extend(["--model", args.model])

            print(f"  {muted('Running:')} {' '.join(run_cmd)}")
            print()

            # Execute run.py - replace current process
            os.execv(sys.executable, run_cmd)

        sys.exit(0)

    except KeyboardInterrupt:
        print("\n\nSpec creation interrupted.")
        print(f"To continue: python auto-claude/spec_runner.py --continue {orchestrator.spec_dir.name}")
        sys.exit(1)


if __name__ == "__main__":
    main()
