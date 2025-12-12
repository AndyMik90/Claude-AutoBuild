"""
Agent Session Logic
===================

Core agent interaction functions for running autonomous coding sessions.
Uses chunk-based implementation plans with minimal, focused prompts.

Architecture:
- Orchestrator (Python) handles all bookkeeping: memory, commits, progress
- Agent focuses ONLY on implementing code
- Post-session processing updates memory automatically (100% reliable)

Enhanced with status file updates for ccstatusline integration.
Enhanced with Graphiti memory for cross-session context retrieval.
"""

import asyncio
import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from claude_code_sdk import ClaudeSDKClient

from client import create_client
from progress import (
    print_session_header,
    print_progress_summary,
    print_build_complete_banner,
    count_chunks,
    count_chunks_detailed,
    is_build_complete,
    get_next_chunk,
    get_current_phase,
)
from prompt_generator import (
    generate_chunk_prompt,
    generate_planner_prompt,
    load_chunk_context,
    format_context_for_prompt,
)
from prompts import is_first_run
from recovery import RecoveryManager
from linear_updater import (
    is_linear_enabled,
    LinearTaskState,
    linear_task_started,
    linear_chunk_completed,
    linear_chunk_failed,
    linear_build_complete,
    linear_task_stuck,
)
from graphiti_config import is_graphiti_enabled
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
    StatusManager,
    BuildState,
)
from task_logger import (
    TaskLogger,
    LogPhase,
    LogEntryType,
    get_task_logger,
    clear_task_logger,
)

# Configure logging
logger = logging.getLogger(__name__)


# Configuration
AUTO_CONTINUE_DELAY_SECONDS = 3
HUMAN_INTERVENTION_FILE = "PAUSE"


# =============================================================================
# Graphiti Memory Integration
# =============================================================================

async def get_graphiti_context(
    spec_dir: Path,
    project_dir: Path,
    chunk: dict,
) -> Optional[str]:
    """
    Retrieve relevant context from Graphiti for the current chunk.

    This searches the knowledge graph for context relevant to the chunk's
    task description, returning past insights, patterns, and gotchas.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        chunk: The current chunk being worked on

    Returns:
        Formatted context string or None if unavailable
    """
    if not is_graphiti_enabled():
        return None

    try:
        from graphiti_memory import GraphitiMemory

        # Create memory manager
        memory = GraphitiMemory(spec_dir, project_dir)

        if not memory.is_enabled:
            return None

        # Build search query from chunk description
        chunk_desc = chunk.get("description", "")
        chunk_id = chunk.get("id", "")
        query = f"{chunk_desc} {chunk_id}".strip()

        if not query:
            await memory.close()
            return None

        # Get relevant context
        context_items = await memory.get_relevant_context(query, num_results=5)

        # Also get recent session history
        session_history = await memory.get_session_history(limit=3)

        await memory.close()

        if not context_items and not session_history:
            return None

        # Format the context
        sections = ["## Graphiti Memory Context\n"]
        sections.append("_Retrieved from knowledge graph for this chunk:_\n")

        if context_items:
            sections.append("### Relevant Knowledge\n")
            for item in context_items:
                content = item.get("content", "")[:500]  # Truncate
                item_type = item.get("type", "unknown")
                sections.append(f"- **[{item_type}]** {content}\n")

        if session_history:
            sections.append("### Recent Session Insights\n")
            for session in session_history[:2]:  # Only show last 2
                session_num = session.get("session_number", "?")
                recommendations = session.get("recommendations_for_next_session", [])
                if recommendations:
                    sections.append(f"**Session {session_num} recommendations:**")
                    for rec in recommendations[:3]:  # Limit to 3
                        sections.append(f"- {rec}")
                    sections.append("")

        return "\n".join(sections)

    except ImportError:
        logger.debug("Graphiti packages not installed")
        return None
    except Exception as e:
        logger.warning(f"Failed to get Graphiti context: {e}")
        return None


async def save_session_to_graphiti(
    spec_dir: Path,
    project_dir: Path,
    chunk_id: str,
    session_num: int,
    success: bool,
    chunks_completed: list[str],
    discoveries: Optional[dict] = None,
) -> bool:
    """
    Save session insights to Graphiti knowledge graph.

    This is called after each session to persist learnings.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        chunk_id: The chunk that was worked on
        session_num: Current session number
        success: Whether the chunk was completed successfully
        chunks_completed: List of chunk IDs completed this session
        discoveries: Optional dict with file discoveries, patterns, gotchas

    Returns:
        True if saved successfully
    """
    if not is_graphiti_enabled():
        return False

    try:
        from graphiti_memory import GraphitiMemory

        memory = GraphitiMemory(spec_dir, project_dir)

        if not memory.is_enabled:
            return False

        # Build insights structure matching memory.py format
        insights = {
            "chunks_completed": chunks_completed,
            "discoveries": discoveries or {
                "files_understood": {},
                "patterns_found": [],
                "gotchas_encountered": [],
            },
            "what_worked": [f"Implemented chunk: {chunk_id}"] if success else [],
            "what_failed": [] if success else [f"Failed to complete chunk: {chunk_id}"],
            "recommendations_for_next_session": [],
        }

        result = await memory.save_session_insights(session_num, insights)
        await memory.close()

        if result:
            logger.info(f"Session {session_num} insights saved to Graphiti")

        return result

    except ImportError:
        logger.debug("Graphiti packages not installed")
        return False
    except Exception as e:
        logger.warning(f"Failed to save to Graphiti: {e}")
        return False


def get_latest_commit(project_dir: Path) -> Optional[str]:
    """Get the hash of the latest git commit."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


def get_commit_count(project_dir: Path) -> int:
    """Get the total number of commits."""
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        return int(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError):
        return 0


def load_implementation_plan(spec_dir: Path) -> Optional[dict]:
    """Load the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return None
    try:
        with open(plan_file) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def find_chunk_in_plan(plan: dict, chunk_id: str) -> Optional[dict]:
    """Find a chunk by ID in the plan."""
    for phase in plan.get("phases", []):
        for chunk in phase.get("chunks", []):
            if chunk.get("id") == chunk_id:
                return chunk
    return None


def find_phase_for_chunk(plan: dict, chunk_id: str) -> Optional[dict]:
    """Find the phase containing a chunk."""
    for phase in plan.get("phases", []):
        for chunk in phase.get("chunks", []):
            if chunk.get("id") == chunk_id:
                return phase
    return None


def sync_plan_to_source(spec_dir: Path, source_spec_dir: Optional[Path]) -> bool:
    """
    Sync implementation_plan.json from worktree back to source spec directory.
    
    When running in isolated mode (worktrees), the agent updates the implementation
    plan inside the worktree. This function syncs those changes back to the main
    project's spec directory so the frontend/UI can see the progress.
    
    Args:
        spec_dir: Current spec directory (may be inside worktree)
        source_spec_dir: Original spec directory in main project (outside worktree)
        
    Returns:
        True if sync was performed, False if not needed or failed
    """
    # Skip if no source specified or same path (not in worktree mode)
    if not source_spec_dir:
        return False
    
    # Resolve paths and check if they're different
    spec_dir_resolved = spec_dir.resolve()
    source_spec_dir_resolved = source_spec_dir.resolve()
    
    if spec_dir_resolved == source_spec_dir_resolved:
        return False  # Same directory, no sync needed
    
    # Sync the implementation plan
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return False
    
    source_plan_file = source_spec_dir / "implementation_plan.json"
    
    try:
        shutil.copy2(plan_file, source_plan_file)
        logger.debug(f"Synced implementation plan to source: {source_plan_file}")
        return True
    except Exception as e:
        logger.warning(f"Failed to sync implementation plan to source: {e}")
        return False


async def post_session_processing(
    spec_dir: Path,
    project_dir: Path,
    chunk_id: str,
    session_num: int,
    commit_before: Optional[str],
    commit_count_before: int,
    recovery_manager: RecoveryManager,
    linear_enabled: bool = False,
    status_manager: Optional[StatusManager] = None,
    source_spec_dir: Optional[Path] = None,
) -> bool:
    """
    Process session results and update memory automatically.

    This runs in Python (100% reliable) instead of relying on agent compliance.

    Args:
        spec_dir: Spec directory containing memory/
        project_dir: Project root for git operations
        chunk_id: The chunk that was being worked on
        session_num: Current session number
        commit_before: Git commit hash before session
        commit_count_before: Number of commits before session
        recovery_manager: Recovery manager instance
        linear_enabled: Whether Linear integration is enabled
        status_manager: Optional status manager for ccstatusline
        source_spec_dir: Original spec directory (for syncing back from worktree)

    Returns:
        True if chunk was completed successfully
    """
    print()
    print(muted("--- Post-Session Processing ---"))
    
    # Sync implementation plan back to source (for worktree mode)
    if sync_plan_to_source(spec_dir, source_spec_dir):
        print_status("Implementation plan synced to main project", "success")

    # Check if implementation plan was updated
    plan = load_implementation_plan(spec_dir)
    if not plan:
        print("  Warning: Could not load implementation plan")
        return False

    chunk = find_chunk_in_plan(plan, chunk_id)
    if not chunk:
        print(f"  Warning: Chunk {chunk_id} not found in plan")
        return False

    chunk_status = chunk.get("status", "pending")

    # Check for new commits
    commit_after = get_latest_commit(project_dir)
    commit_count_after = get_commit_count(project_dir)
    new_commits = commit_count_after - commit_count_before

    print_key_value("Chunk status", chunk_status)
    print_key_value("New commits", str(new_commits))

    if chunk_status == "completed":
        # Success! Record the attempt and good commit
        print_status(f"Chunk {chunk_id} completed successfully", "success")

        # Update status file
        if status_manager:
            chunks = count_chunks_detailed(spec_dir)
            status_manager.update_chunks(
                completed=chunks["completed"],
                total=chunks["total"],
                in_progress=0,
            )

        # Record successful attempt
        recovery_manager.record_attempt(
            chunk_id=chunk_id,
            session=session_num,
            success=True,
            approach=f"Implemented: {chunk.get('description', 'chunk')[:100]}",
        )

        # Record good commit for rollback safety
        if commit_after and commit_after != commit_before:
            recovery_manager.record_good_commit(commit_after, chunk_id)
            print_status(f"Recorded good commit: {commit_after[:8]}", "success")

        # Record Linear session result (if enabled)
        if linear_enabled:
            # Get progress counts for the comment
            chunks_detail = count_chunks_detailed(spec_dir)
            await linear_chunk_completed(
                spec_dir=spec_dir,
                chunk_id=chunk_id,
                completed_count=chunks_detail["completed"],
                total_count=chunks_detail["total"],
            )
            print_status("Linear progress recorded", "success")

        # Save to Graphiti if enabled (async, fire-and-forget)
        if is_graphiti_enabled():
            try:
                # Run async save in a non-blocking way
                asyncio.create_task(
                    save_session_to_graphiti(
                        spec_dir=spec_dir,
                        project_dir=project_dir,
                        chunk_id=chunk_id,
                        session_num=session_num,
                        success=True,
                        chunks_completed=[chunk_id],
                    )
                )
                print_status("Graphiti session save queued", "success")
            except RuntimeError:
                # Not in async context, skip
                logger.debug("Skipping Graphiti save - not in async context")

        return True

    elif chunk_status == "in_progress":
        # Session ended without completion
        print_status(f"Chunk {chunk_id} still in progress", "warning")

        recovery_manager.record_attempt(
            chunk_id=chunk_id,
            session=session_num,
            success=False,
            approach="Session ended with chunk in_progress",
            error="Chunk not marked as completed",
        )

        # Still record commit if one was made (partial progress)
        if commit_after and commit_after != commit_before:
            recovery_manager.record_good_commit(commit_after, chunk_id)
            print_status(f"Recorded partial progress commit: {commit_after[:8]}", "info")

        # Record Linear session result (if enabled)
        if linear_enabled:
            attempt_count = recovery_manager.get_attempt_count(chunk_id)
            await linear_chunk_failed(
                spec_dir=spec_dir,
                chunk_id=chunk_id,
                attempt=attempt_count,
                error_summary="Session ended without completion",
            )

        return False

    else:
        # Chunk still pending or failed
        print_status(f"Chunk {chunk_id} not completed (status: {chunk_status})", "error")

        recovery_manager.record_attempt(
            chunk_id=chunk_id,
            session=session_num,
            success=False,
            approach="Session ended without progress",
            error=f"Chunk status is {chunk_status}",
        )

        # Record Linear session result (if enabled)
        if linear_enabled:
            attempt_count = recovery_manager.get_attempt_count(chunk_id)
            await linear_chunk_failed(
                spec_dir=spec_dir,
                chunk_id=chunk_id,
                attempt=attempt_count,
                error_summary=f"Chunk status: {chunk_status}",
            )

        return False


async def run_agent_session(
    client: ClaudeSDKClient,
    message: str,
    spec_dir: Path,
    verbose: bool = False,
    phase: LogPhase = LogPhase.CODING,
) -> tuple[str, str]:
    """
    Run a single agent session using Claude Agent SDK.

    Args:
        client: Claude SDK client
        message: The prompt to send
        spec_dir: Spec directory path
        verbose: Whether to show detailed output
        phase: Current execution phase for logging

    Returns:
        (status, response_text) where status is:
        - "continue" if agent should continue working
        - "complete" if all chunks complete
        - "error" if an error occurred
    """
    print("Sending prompt to Claude Agent SDK...\n")

    # Get task logger for this spec
    task_logger = get_task_logger(spec_dir)
    current_tool = None

    try:
        # Send the query
        await client.query(message)

        # Collect response text and show tool use
        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            # Handle AssistantMessage (text and tool use)
            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(block.text, LogEntryType.TEXT, phase, print_to_console=False)
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

                        # Log tool start (handles printing too)
                        if task_logger:
                            task_logger.tool_start(tool_name, tool_input, phase, print_to_console=True)
                        else:
                            print(f"\n[Tool: {tool_name}]", flush=True)

                        if verbose and hasattr(block, "input"):
                            input_str = str(block.input)
                            if len(input_str) > 300:
                                print(f"   Input: {input_str[:300]}...", flush=True)
                            else:
                                print(f"   Input: {input_str}", flush=True)
                        current_tool = tool_name

            # Handle UserMessage (tool results)
            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "ToolResultBlock":
                        result_content = getattr(block, "content", "")
                        is_error = getattr(block, "is_error", False)

                        # Check if command was blocked by security hook
                        if "blocked" in str(result_content).lower():
                            print(f"   [BLOCKED] {result_content}", flush=True)
                            if task_logger and current_tool:
                                task_logger.tool_end(current_tool, success=False, result="BLOCKED", phase=phase)
                        elif is_error:
                            # Show errors (truncated)
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                task_logger.tool_end(current_tool, success=False, result=error_str[:100], phase=phase)
                        else:
                            # Tool succeeded
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                task_logger.tool_end(current_tool, success=True, phase=phase)

                        current_tool = None

        print("\n" + "-" * 70 + "\n")

        # Check if build is complete
        if is_build_complete(spec_dir):
            return "complete", response_text

        return "continue", response_text

    except Exception as e:
        print(f"Error during agent session: {e}")
        if task_logger:
            task_logger.log_error(f"Session error: {e}", phase)
        return "error", str(e)


async def run_autonomous_agent(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    max_iterations: Optional[int] = None,
    verbose: bool = False,
    source_spec_dir: Optional[Path] = None,
) -> None:
    """
    Run the autonomous agent loop with automatic memory management.

    Args:
        project_dir: Root directory for the project
        spec_dir: Directory containing the spec (auto-claude/specs/001-name/)
        model: Claude model to use
        max_iterations: Maximum number of iterations (None for unlimited)
        verbose: Whether to show detailed output
        source_spec_dir: Original spec directory in main project (for syncing from worktree)
    """
    # Initialize recovery manager (handles memory persistence)
    recovery_manager = RecoveryManager(spec_dir, project_dir)

    # Initialize status manager for ccstatusline
    status_manager = StatusManager(project_dir)
    status_manager.set_active(spec_dir.name, BuildState.BUILDING)

    # Initialize task logger for persistent logging
    task_logger = get_task_logger(spec_dir)

    # Update initial chunk counts
    chunks = count_chunks_detailed(spec_dir)
    status_manager.update_chunks(
        completed=chunks["completed"],
        total=chunks["total"],
        in_progress=chunks["in_progress"],
    )

    # Check Linear integration status
    linear_task = None
    if is_linear_enabled():
        linear_task = LinearTaskState.load(spec_dir)
        if linear_task and linear_task.task_id:
            print_status("Linear integration: ENABLED", "success")
            print_key_value("Task", linear_task.task_id)
            print_key_value("Status", linear_task.status)
            print()
        else:
            print_status("Linear enabled but no task created for this spec", "warning")
            print()

    # Check if this is a fresh start or continuation
    first_run = is_first_run(spec_dir)

    # Track which phase we're in for logging
    current_log_phase = LogPhase.CODING
    is_planning_phase = False

    if first_run:
        print_status("Fresh start - will use Planner Agent to create implementation plan", "info")
        content = [
            bold(f"{icon(Icons.GEAR)} PLANNER SESSION"),
            "",
            f"Spec: {highlight(spec_dir.name)}",
            muted("The agent will analyze your spec and create a chunk-based plan."),
        ]
        print()
        print(box(content, width=70, style="heavy"))
        print()

        # Update status for planning phase
        status_manager.update(state=BuildState.PLANNING)
        is_planning_phase = True
        current_log_phase = LogPhase.PLANNING

        # Start planning phase in task logger
        if task_logger:
            task_logger.start_phase(LogPhase.PLANNING, "Starting implementation planning...")

        # Update Linear to "In Progress" when build starts
        if linear_task and linear_task.task_id:
            print_status("Updating Linear task to In Progress...", "progress")
            await linear_task_started(spec_dir)
    else:
        print(f"Continuing build: {highlight(spec_dir.name)}")
        print_progress_summary(spec_dir)

        # Check if already complete
        if is_build_complete(spec_dir):
            print_build_complete_banner(spec_dir)
            status_manager.update(state=BuildState.COMPLETE)
            return

        # Start/continue coding phase in task logger
        if task_logger:
            task_logger.start_phase(LogPhase.CODING, "Continuing implementation...")

    # Show human intervention hint
    content = [
        bold("INTERACTIVE CONTROLS"),
        "",
        f"Press {highlight('Ctrl+C')} once  {icon(Icons.ARROW_RIGHT)} Pause and optionally add instructions",
        f"Press {highlight('Ctrl+C')} twice {icon(Icons.ARROW_RIGHT)} Exit immediately",
    ]
    print(box(content, width=70, style="light"))
    print()

    # Main loop
    iteration = 0

    while True:
        iteration += 1

        # Check for human intervention (PAUSE file)
        pause_file = spec_dir / HUMAN_INTERVENTION_FILE
        if pause_file.exists():
            print("\n" + "=" * 70)
            print("  PAUSED BY HUMAN")
            print("=" * 70)

            pause_content = pause_file.read_text().strip()
            if pause_content:
                print(f"\nMessage: {pause_content}")

            print(f"\nTo resume, delete the PAUSE file:")
            print(f"  rm {pause_file}")
            print(f"\nThen run again:")
            print(f"  python auto-claude/run.py --spec {spec_dir.name}")
            return

        # Check max iterations
        if max_iterations and iteration > max_iterations:
            print(f"\nReached max iterations ({max_iterations})")
            print("To continue, run the script again without --max-iterations")
            break

        # Get the next chunk to work on
        next_chunk = get_next_chunk(spec_dir)
        chunk_id = next_chunk.get("id") if next_chunk else None
        phase_name = next_chunk.get("phase_name") if next_chunk else None

        # Update status for this session
        status_manager.update_session(iteration)
        if phase_name:
            current_phase = get_current_phase(spec_dir)
            if current_phase:
                status_manager.update_phase(
                    current_phase.get("name", ""),
                    current_phase.get("phase", 0),
                    current_phase.get("total", 0),
                )
        status_manager.update_chunks(in_progress=1)

        # Print session header
        print_session_header(
            session_num=iteration,
            is_planner=first_run,
            chunk_id=chunk_id,
            chunk_desc=next_chunk.get("description") if next_chunk else None,
            phase_name=phase_name,
            attempt=recovery_manager.get_attempt_count(chunk_id) + 1 if chunk_id else 1,
        )

        # Capture state before session for post-processing
        commit_before = get_latest_commit(project_dir)
        commit_count_before = get_commit_count(project_dir)

        # Create client (fresh context)
        client = create_client(project_dir, spec_dir, model)

        # Generate appropriate prompt
        if first_run:
            prompt = generate_planner_prompt(spec_dir, project_dir)
            first_run = False
            current_log_phase = LogPhase.PLANNING

            # Set session info in logger
            if task_logger:
                task_logger.set_session(iteration)
        else:
            # Switch to coding phase after planning
            if is_planning_phase:
                is_planning_phase = False
                current_log_phase = LogPhase.CODING
                if task_logger:
                    task_logger.end_phase(LogPhase.PLANNING, success=True, message="Implementation plan created")
                    task_logger.start_phase(LogPhase.CODING, "Starting implementation...")
            if not next_chunk:
                print("No pending chunks found - build may be complete!")
                break

            # Get attempt count for recovery context
            attempt_count = recovery_manager.get_attempt_count(chunk_id)
            recovery_hints = recovery_manager.get_recovery_hints(chunk_id) if attempt_count > 0 else None

            # Find the phase for this chunk
            plan = load_implementation_plan(spec_dir)
            phase = find_phase_for_chunk(plan, chunk_id) if plan else {}

            # Generate focused, minimal prompt for this chunk
            prompt = generate_chunk_prompt(
                spec_dir=spec_dir,
                project_dir=project_dir,
                chunk=next_chunk,
                phase=phase or {},
                attempt_count=attempt_count,
                recovery_hints=recovery_hints,
            )

            # Load and append relevant file context
            context = load_chunk_context(spec_dir, project_dir, next_chunk)
            if context.get("patterns") or context.get("files_to_modify"):
                prompt += "\n\n" + format_context_for_prompt(context)

            # Retrieve and append Graphiti memory context (if enabled)
            graphiti_context = await get_graphiti_context(spec_dir, project_dir, next_chunk)
            if graphiti_context:
                prompt += "\n\n" + graphiti_context
                print_status("Graphiti memory context loaded", "success")

            # Show what we're working on
            print(f"Working on: {highlight(chunk_id)}")
            print(f"Description: {next_chunk.get('description', 'No description')}")
            if attempt_count > 0:
                print_status(f"Previous attempts: {attempt_count}", "warning")
            print()

        # Set chunk info in logger
        if task_logger and chunk_id:
            task_logger.set_chunk(chunk_id)
            task_logger.set_session(iteration)

        # Run session with async context manager
        async with client:
            status, response = await run_agent_session(
                client, prompt, spec_dir, verbose, phase=current_log_phase
            )

        # === POST-SESSION PROCESSING (100% reliable) ===
        if chunk_id and not first_run:
            linear_is_enabled = linear_task is not None and linear_task.task_id is not None
            success = await post_session_processing(
                spec_dir=spec_dir,
                project_dir=project_dir,
                chunk_id=chunk_id,
                session_num=iteration,
                commit_before=commit_before,
                commit_count_before=commit_count_before,
                recovery_manager=recovery_manager,
                linear_enabled=linear_is_enabled,
                status_manager=status_manager,
                source_spec_dir=source_spec_dir,
            )

            # Check for stuck chunks
            attempt_count = recovery_manager.get_attempt_count(chunk_id)
            if not success and attempt_count >= 3:
                recovery_manager.mark_chunk_stuck(
                    chunk_id,
                    f"Failed after {attempt_count} attempts"
                )
                print()
                print_status(f"Chunk {chunk_id} marked as STUCK after {attempt_count} attempts", "error")
                print(muted("Consider: manual intervention or skipping this chunk"))

                # Record stuck chunk in Linear (if enabled)
                if linear_is_enabled:
                    await linear_task_stuck(
                        spec_dir=spec_dir,
                        chunk_id=chunk_id,
                        attempt_count=attempt_count,
                    )
                    print_status("Linear notified of stuck chunk", "info")
        elif is_planning_phase and source_spec_dir:
            # After planning phase, sync the newly created implementation plan back to source
            if sync_plan_to_source(spec_dir, source_spec_dir):
                print_status("Implementation plan synced to main project", "success")

        # Handle session status
        if status == "complete":
            print_build_complete_banner(spec_dir)
            status_manager.update(state=BuildState.COMPLETE)

            # End coding phase in task logger
            if task_logger:
                task_logger.end_phase(LogPhase.CODING, success=True, message="All chunks completed successfully")

            # Notify Linear that build is complete (moving to QA)
            if linear_task and linear_task.task_id:
                await linear_build_complete(spec_dir)
                print_status("Linear notified: build complete, ready for QA", "success")

            break

        elif status == "continue":
            print(muted(f"\nAgent will auto-continue in {AUTO_CONTINUE_DELAY_SECONDS}s..."))
            print_progress_summary(spec_dir)

            # Update state back to building
            status_manager.update(state=BuildState.BUILDING)

            # Show next chunk info
            next_chunk = get_next_chunk(spec_dir)
            if next_chunk:
                chunk_id = next_chunk.get('id')
                print(f"\nNext: {highlight(chunk_id)} - {next_chunk.get('description')}")

                attempt_count = recovery_manager.get_attempt_count(chunk_id)
                if attempt_count > 0:
                    print_status(f"WARNING: {attempt_count} previous attempt(s)", "warning")

            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        elif status == "error":
            print_status("Session encountered an error", "error")
            print(muted("Will retry with a fresh session..."))
            status_manager.update(state=BuildState.ERROR)
            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        # Small delay between sessions
        if max_iterations is None or iteration < max_iterations:
            print("\nPreparing next session...\n")
            await asyncio.sleep(1)

    # Final summary
    content = [
        bold(f"{icon(Icons.SESSION)} SESSION SUMMARY"),
        "",
        f"Project: {project_dir}",
        f"Spec: {highlight(spec_dir.name)}",
        f"Sessions completed: {iteration}",
    ]
    print()
    print(box(content, width=70, style="heavy"))
    print_progress_summary(spec_dir)

    # Show stuck chunks if any
    stuck_chunks = recovery_manager.get_stuck_chunks()
    if stuck_chunks:
        print()
        print_status("STUCK CHUNKS (need manual intervention):", "error")
        for stuck in stuck_chunks:
            print(f"  {icon(Icons.ERROR)} {stuck['chunk_id']}: {stuck['reason']}")

    # Instructions
    completed, total = count_chunks(spec_dir)
    if completed < total:
        content = [
            bold(f"{icon(Icons.PLAY)} NEXT STEPS"),
            "",
            f"{total - completed} chunks remaining.",
            f"Run again: {highlight(f'python auto-claude/run.py --spec {spec_dir.name}')}",
        ]
    else:
        content = [
            bold(f"{icon(Icons.SUCCESS)} NEXT STEPS"),
            "",
            "All chunks completed!",
            "  1. Review the auto-claude/* branch",
            "  2. Run manual tests",
            "  3. Merge to main",
        ]

    print()
    print(box(content, width=70, style="light"))
    print()

    # Set final status
    if completed == total:
        status_manager.update(state=BuildState.COMPLETE)
    else:
        status_manager.update(state=BuildState.PAUSED)


async def run_followup_planner(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    verbose: bool = False,
) -> bool:
    """
    Run the follow-up planner to add new chunks to a completed spec.

    This is a simplified version of run_autonomous_agent that:
    1. Creates a client
    2. Loads the followup planner prompt
    3. Runs a single planning session
    4. Returns after the plan is updated (doesn't enter coding loop)

    The planner agent will:
    - Read FOLLOWUP_REQUEST.md for the new task
    - Read the existing implementation_plan.json
    - Add new phase(s) with pending chunks
    - Update the plan status back to in_progress

    Args:
        project_dir: Root directory for the project
        spec_dir: Directory containing the completed spec
        model: Claude model to use
        verbose: Whether to show detailed output

    Returns:
        bool: True if planning completed successfully
    """
    from prompts import get_followup_planner_prompt
    from implementation_plan import ImplementationPlan

    # Initialize status manager for ccstatusline
    status_manager = StatusManager(project_dir)
    status_manager.set_active(spec_dir.name, BuildState.PLANNING)

    # Initialize task logger for persistent logging
    task_logger = get_task_logger(spec_dir)

    # Show header
    content = [
        bold(f"{icon(Icons.GEAR)} FOLLOW-UP PLANNER SESSION"),
        "",
        f"Spec: {highlight(spec_dir.name)}",
        muted("Adding follow-up work to completed spec."),
        "",
        muted("The agent will read your FOLLOWUP_REQUEST.md and add new chunks."),
    ]
    print()
    print(box(content, width=70, style="heavy"))
    print()

    # Start planning phase in task logger
    if task_logger:
        task_logger.start_phase(LogPhase.PLANNING, "Starting follow-up planning...")
        task_logger.set_session(1)

    # Create client (fresh context)
    client = create_client(project_dir, spec_dir, model)

    # Generate follow-up planner prompt
    prompt = get_followup_planner_prompt(spec_dir)

    print_status("Running follow-up planner...", "progress")
    print()

    try:
        # Run single planning session
        async with client:
            status, response = await run_agent_session(
                client, prompt, spec_dir, verbose, phase=LogPhase.PLANNING
            )

        # End planning phase in task logger
        if task_logger:
            task_logger.end_phase(
                LogPhase.PLANNING,
                success=(status != "error"),
                message="Follow-up planning session completed"
            )

        if status == "error":
            print()
            print_status("Follow-up planning failed", "error")
            status_manager.update(state=BuildState.ERROR)
            return False

        # Verify the plan was updated (should have pending chunks now)
        plan_file = spec_dir / "implementation_plan.json"
        if plan_file.exists():
            plan = ImplementationPlan.load(plan_file)

            # Check if there are any pending chunks
            all_chunks = [c for p in plan.phases for c in p.chunks]
            pending_chunks = [c for c in all_chunks if c.status.value == "pending"]

            if pending_chunks:
                # Reset the plan status to in_progress (in case planner didn't)
                plan.reset_for_followup()
                plan.save(plan_file)

                print()
                content = [
                    bold(f"{icon(Icons.SUCCESS)} FOLLOW-UP PLANNING COMPLETE"),
                    "",
                    f"New pending chunks: {highlight(str(len(pending_chunks)))}",
                    f"Total chunks: {len(all_chunks)}",
                    "",
                    muted("Next steps:"),
                    f"  Run: {highlight(f'python auto-claude/run.py --spec {spec_dir.name}')}",
                ]
                print(box(content, width=70, style="heavy"))
                print()
                status_manager.update(state=BuildState.PAUSED)
                return True
            else:
                print()
                print_status("Warning: No pending chunks found after planning", "warning")
                print(muted("The planner may not have added new chunks."))
                print(muted("Check implementation_plan.json manually."))
                status_manager.update(state=BuildState.PAUSED)
                return False
        else:
            print()
            print_status("Error: implementation_plan.json not found after planning", "error")
            status_manager.update(state=BuildState.ERROR)
            return False

    except Exception as e:
        print()
        print_status(f"Follow-up planning error: {e}", "error")
        if task_logger:
            task_logger.log_error(f"Follow-up planning error: {e}", LogPhase.PLANNING)
        status_manager.update(state=BuildState.ERROR)
        return False
