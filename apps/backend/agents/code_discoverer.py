"""
Code Discovery Agent Module
============================

Specialized agent using Opus 4.5 with ultrathink for deep codebase exploration
before subtask implementation.
"""

import asyncio
import json
import logging
from pathlib import Path

from core.client import create_client
from phase_config import MODEL_ID_MAP, THINKING_BUDGET_MAP
from prompt_generator import load_subtask_context
from task_logger import LogPhase, get_task_logger

from .session import run_agent_session
from .utils import load_implementation_plan

logger = logging.getLogger(__name__)


async def run_code_discovery(
    project_dir: Path,
    spec_dir: Path,
    subtask: dict,
    phase: dict | None = None,
) -> dict | None:
    """
    Run Code Discovery Agent (Opus 4.5 + ultrathink) to deeply analyze codebase
    before subtask implementation.

    This agent maps data flows, discovers patterns, identifies gotchas, and
    creates a comprehensive discovery context that guides the Coder Agent.

    Args:
        project_dir: Root directory for the project
        spec_dir: Directory containing the spec
        subtask: Subtask being analyzed (dict with id, description, etc.)
        phase: Phase information (optional)

    Returns:
        Discovery context dict or None if discovery failed
    """
    logger.info(f"Starting Code Discovery for subtask {subtask.get('id')}")

    # Check if discovery already exists (skip if re-running)
    discovery_file = spec_dir / f"discovery_{subtask.get('id')}.json"
    if discovery_file.exists():
        logger.info(f"Discovery context already exists: {discovery_file}")
        try:
            with open(discovery_file) as f:
                return json.load(f)
        except json.JSONDecodeError:
            logger.warning("Existing discovery file corrupted, re-running discovery")

    # Use Opus 4.5 with ultrathink (65,536 tokens)
    model = MODEL_ID_MAP["opus"]
    thinking_budget = THINKING_BUDGET_MAP["ultrathink"]

    logger.info(
        f"Discovery configuration: model={model}, thinking_budget={thinking_budget}"
    )

    # Create client with Opus + ultrathink
    client = create_client(
        project_dir,
        spec_dir,
        model,
        max_thinking_tokens=thinking_budget,
    )

    # Load context for subtask
    context = load_subtask_context(spec_dir, project_dir, subtask)

    # Generate discovery prompt
    prompt = _generate_discovery_prompt(
        spec_dir=spec_dir,
        project_dir=project_dir,
        subtask=subtask,
        phase=phase,
        context=context,
    )

    # Initialize task logger
    task_logger = get_task_logger(spec_dir)
    if task_logger:
        task_logger.start_phase(LogPhase.DISCOVERY, "Running Code Discovery Agent...")
        task_logger.set_subtask(subtask.get("id"))

    try:
        # Run discovery session
        async with client:
            status, response = await run_agent_session(
                client, prompt, spec_dir, verbose=True, phase=LogPhase.DISCOVERY
            )

        # Check if discovery_context.json was created
        if discovery_file.exists():
            logger.info(f"Discovery completed: {discovery_file}")
            try:
                with open(discovery_file) as f:
                    discovery_context = json.load(f)

                if task_logger:
                    task_logger.end_phase(
                        LogPhase.DISCOVERY,
                        success=True,
                        message="Code discovery completed successfully",
                    )

                return discovery_context
            except json.JSONDecodeError as e:
                logger.error(f"Discovery file corrupted: {e}")
                if task_logger:
                    task_logger.end_phase(
                        LogPhase.DISCOVERY,
                        success=False,
                        message=f"Discovery file parse error: {e}",
                    )
                return None
        else:
            logger.warning("Discovery session completed but no discovery file created")
            if task_logger:
                task_logger.end_phase(
                    LogPhase.DISCOVERY,
                    success=False,
                    message="Discovery file not created by agent",
                )
            return None

    except Exception as e:
        logger.error(f"Code discovery failed: {e}", exc_info=True)
        if task_logger:
            task_logger.end_phase(
                LogPhase.DISCOVERY, success=False, message=f"Discovery error: {e}"
            )
        return None


def _generate_discovery_prompt(
    spec_dir: Path,
    project_dir: Path,
    subtask: dict,
    phase: dict | None,
    context: dict,
) -> str:
    """
    Generate prompt for Code Discovery Agent.

    Args:
        spec_dir: Spec directory path
        project_dir: Project root path
        subtask: Subtask being analyzed
        phase: Phase information
        context: Subtask context (patterns, files)

    Returns:
        Complete prompt string
    """
    # Load discovery prompt template
    prompt_file = spec_dir.parent.parent / "prompts" / "code_discoverer.md"
    if not prompt_file.exists():
        # Fall back to backend/prompts location
        prompt_file = Path(__file__).parent.parent / "prompts" / "code_discoverer.md"

    if not prompt_file.exists():
        raise FileNotFoundError(
            f"Code Discovery prompt template not found: {prompt_file}"
        )

    with open(prompt_file) as f:
        base_prompt = f.read()

    # Add environment context
    environment_section = f"""
---

## YOUR ENVIRONMENT

**Working Directory**: `{project_dir}`
**Spec Directory**: `{spec_dir.relative_to(project_dir)}`
**Discovery Output**: `{spec_dir.relative_to(project_dir)}/discovery_{subtask.get('id')}.json`

---

## YOUR SUBTASK

"""

    # Add subtask details
    subtask_section = f"""
**Subtask ID**: {subtask.get('id')}
**Description**: {subtask.get('description')}
**Service**: {subtask.get('service', 'N/A')}
**Phase**: {phase.get('name') if phase else 'N/A'}

**Files to Modify**:
"""
    for file in subtask.get("files_to_modify", []):
        subtask_section += f"- {file}\n"

    subtask_section += "\n**Patterns From**:\n"
    for file in subtask.get("patterns_from", []):
        subtask_section += f"- {file}\n"

    subtask_section += f"""
**Verification Strategy**:
{subtask.get('verification', 'No specific verification defined')}

---

## INITIAL CONTEXT

"""

    # Add patterns if available
    if context.get("patterns"):
        subtask_section += "**Code Patterns Found**:\n```json\n"
        subtask_section += json.dumps(context["patterns"], indent=2)
        subtask_section += "\n```\n\n"

    # Add files to reference
    if context.get("files_to_reference"):
        subtask_section += "**Files to Reference**:\n"
        for file in context["files_to_reference"]:
            subtask_section += f"- {file}\n"
        subtask_section += "\n"

    # Construct full prompt
    full_prompt = base_prompt + environment_section + subtask_section

    full_prompt += """
---

## BEGIN YOUR DISCOVERY

Follow the phases systematically. Use your full 65,536 thinking token capacity to deeply understand this codebase area.

Remember: You are saving the Coder Agent from hours of debugging by providing accurate, comprehensive discovery context.

Start with Phase 0: Load Subtask Context.
"""

    return full_prompt


def should_run_discovery(subtask: dict, spec_dir: Path) -> bool:
    """
    Determine if Code Discovery should run for this subtask.

    Discovery is valuable for:
    - Complex subtasks touching multiple files
    - Subtasks with unclear data flows
    - First subtask in a phase (to establish patterns)
    - Subtasks after multiple failures (recovery mode)

    Args:
        subtask: Subtask dict
        spec_dir: Spec directory

    Returns:
        True if discovery should run
    """
    # Always run discovery for complex subtasks
    files_to_modify = subtask.get("files_to_modify", [])
    if len(files_to_modify) >= 3:
        return True

    # Run discovery if subtask has failed before (check recovery history)
    recovery_file = spec_dir / "recovery_state.json"
    if recovery_file.exists():
        try:
            with open(recovery_file) as f:
                recovery = json.load(f)
                attempts = recovery.get("attempts", {}).get(subtask.get("id"), [])
                if len(attempts) >= 2:  # Failed 2+ times
                    return True
        except (json.JSONDecodeError, KeyError):
            pass

    # Run discovery for first subtask in phase (establish patterns)
    plan = load_implementation_plan(spec_dir)
    if plan:
        for phase in plan.get("phases", []):
            chunks = phase.get("chunks", [])
            if chunks and chunks[0].get("id") == subtask.get("id"):
                return True

    # Skip for simple subtasks
    if len(files_to_modify) <= 1:
        return False

    # Default: run discovery (better safe than sorry)
    return True
