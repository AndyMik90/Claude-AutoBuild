"""
Agent Session Logic
===================

Core agent interaction functions for running autonomous coding sessions.
Uses subtask-based implementation plans with minimal, focused prompts.

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

from claude_agent_sdk import ClaudeSDKClient

from client import create_client
from progress import (
    print_session_header,
    print_progress_summary,
    print_build_complete_banner,
    count_subtasks,
    count_subtasks_detailed,
    is_build_complete,
    get_next_subtask,
    get_current_phase,
)
from prompt_generator import (
    generate_subtask_prompt,
    generate_planner_prompt,
    load_subtask_context,
    format_context_for_prompt,
)
from prompts import is_first_run
from recovery import RecoveryManager
from linear_updater import (
    is_linear_enabled,
    LinearTaskState,
    linear_task_started,
    linear_subtask_completed,
    linear_subtask_failed,
    linear_build_complete,
    linear_task_stuck,
)
from graphiti_config import is_graphiti_enabled, get_graphiti_status
from memory import save_session_insights as save_file_based_memory
from debug import (
    debug,
    debug_detailed,
    debug_success,
    debug_error,
    debug_warning,
    debug_section,
    is_debug_enabled,
)
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
from insight_extractor import extract_session_insights

# Configure logging
logger = logging.getLogger(__name__)


# Configuration
AUTO_CONTINUE_DELAY_SECONDS = 3
HUMAN_INTERVENTION_FILE = "PAUSE"


# =============================================================================
# Graphiti Memory Integration
# =============================================================================

def debug_memory_system_status() -> None:
    """
    Print memory system status for debugging.
    
    Called at startup when DEBUG=true to show memory configuration.
    """
    if not is_debug_enabled():
        return

    debug_section("memory", "Memory System Status")
    
    # Get Graphiti status
    graphiti_status = get_graphiti_status()
    
    debug("memory", "Memory system configuration",
          primary_system="Graphiti" if graphiti_status.get("available") else "File-based (fallback)",
          graphiti_enabled=graphiti_status.get("enabled"),
          graphiti_available=graphiti_status.get("available"))
    
    if graphiti_status.get("enabled"):
        debug_detailed("memory", "Graphiti configuration",
                       host=graphiti_status.get("host"),
                       port=graphiti_status.get("port"),
                       database=graphiti_status.get("database"),
                       llm_provider=graphiti_status.get("llm_provider"),
                       embedder_provider=graphiti_status.get("embedder_provider"))
        
        if not graphiti_status.get("available"):
            debug_warning("memory", "Graphiti not available",
                          reason=graphiti_status.get("reason"),
                          errors=graphiti_status.get("errors"))
            debug("memory", "Will use file-based memory as fallback")
        else:
            debug_success("memory", "Graphiti ready as PRIMARY memory system")
    else:
        debug("memory", "Graphiti disabled, using file-based memory only",
              note="Set GRAPHITI_ENABLED=true to enable Graphiti")


async def get_graphiti_context(
    spec_dir: Path,
    project_dir: Path,
    subtask: dict,
) -> Optional[str]:
    """
    Retrieve relevant context from Graphiti for the current subtask.

    This searches the knowledge graph for context relevant to the subtask's
    task description, returning past insights, patterns, and gotchas.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        subtask: The current subtask being worked on

    Returns:
        Formatted context string or None if unavailable
    """
    if is_debug_enabled():
        debug("memory", "Retrieving Graphiti context for subtask",
              subtask_id=subtask.get("id", "unknown"),
              subtask_desc=subtask.get("description", "")[:100])

    if not is_graphiti_enabled():
        if is_debug_enabled():
            debug("memory", "Graphiti not enabled, skipping context retrieval")
        return None

    try:
        from graphiti_memory import GraphitiMemory

        # Create memory manager
        memory = GraphitiMemory(spec_dir, project_dir)

        if not memory.is_enabled:
            if is_debug_enabled():
                debug_warning("memory", "GraphitiMemory.is_enabled=False")
            return None

        # Build search query from subtask description
        subtask_desc = subtask.get("description", "")
        subtask_id = subtask.get("id", "")
        query = f"{subtask_desc} {subtask_id}".strip()

        if not query:
            await memory.close()
            if is_debug_enabled():
                debug_warning("memory", "Empty query, skipping context retrieval")
            return None

        if is_debug_enabled():
            debug_detailed("memory", "Searching Graphiti knowledge graph",
                          query=query[:200],
                          num_results=5)

        # Get relevant context
        context_items = await memory.get_relevant_context(query, num_results=5)

        # Also get recent session history
        session_history = await memory.get_session_history(limit=3)

        await memory.close()

        if is_debug_enabled():
            debug("memory", "Graphiti context retrieval complete",
                  context_items_found=len(context_items) if context_items else 0,
                  session_history_found=len(session_history) if session_history else 0)

        if not context_items and not session_history:
            if is_debug_enabled():
                debug("memory", "No relevant context found in Graphiti")
            return None

        # Format the context
        sections = ["## Graphiti Memory Context\n"]
        sections.append("_Retrieved from knowledge graph for this subtask:_\n")

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

        if is_debug_enabled():
            debug_success("memory", "Graphiti context formatted",
                          total_sections=len(sections))

        return "\n".join(sections)

    except ImportError:
        logger.debug("Graphiti packages not installed")
        if is_debug_enabled():
            debug_warning("memory", "Graphiti packages not installed")
        return None
    except Exception as e:
        logger.warning(f"Failed to get Graphiti context: {e}")
        return None


async def save_session_memory(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    success: bool,
    subtasks_completed: list[str],
    discoveries: Optional[dict] = None,
) -> tuple[bool, str]:
    """
    Save session insights to memory.

    Memory Strategy:
    - PRIMARY: Graphiti (when enabled) - provides semantic search, cross-session context
    - FALLBACK: File-based (when Graphiti is disabled) - zero dependencies, always works

    This is called after each session to persist learnings.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        subtask_id: The subtask that was worked on
        session_num: Current session number
        success: Whether the subtask was completed successfully
        subtasks_completed: List of subtask IDs completed this session
        discoveries: Optional dict with file discoveries, patterns, gotchas

    Returns:
        Tuple of (success, storage_type) where storage_type is "graphiti" or "file"
    """
    # Debug: Log memory save start
    if is_debug_enabled():
        debug_section("memory", f"Saving Session {session_num} Memory")
        debug("memory", "Memory save initiated",
              subtask_id=subtask_id,
              session_num=session_num,
              success=success,
              subtasks_completed=subtasks_completed,
              spec_dir=str(spec_dir))

    # Build insights structure (same format for both storage systems)
    insights = {
        "subtasks_completed": subtasks_completed,
        "discoveries": discoveries or {
            "files_understood": {},
            "patterns_found": [],
            "gotchas_encountered": [],
        },
        "what_worked": [f"Implemented subtask: {subtask_id}"] if success else [],
        "what_failed": [] if success else [f"Failed to complete subtask: {subtask_id}"],
        "recommendations_for_next_session": [],
    }

    if is_debug_enabled():
        debug_detailed("memory", "Insights structure built", insights=insights)

    # Check Graphiti status for debugging
    graphiti_enabled = is_graphiti_enabled()
    if is_debug_enabled():
        graphiti_status = get_graphiti_status()
        debug("memory", "Graphiti status check",
              enabled=graphiti_status.get("enabled"),
              available=graphiti_status.get("available"),
              host=graphiti_status.get("host"),
              port=graphiti_status.get("port"),
              database=graphiti_status.get("database"),
              llm_provider=graphiti_status.get("llm_provider"),
              embedder_provider=graphiti_status.get("embedder_provider"),
              reason=graphiti_status.get("reason") or "OK")

    # PRIMARY: Try Graphiti if enabled
    if graphiti_enabled:
        if is_debug_enabled():
            debug("memory", "Attempting PRIMARY storage: Graphiti")

        try:
            from graphiti_memory import GraphitiMemory

            memory = GraphitiMemory(spec_dir, project_dir)

            if is_debug_enabled():
                debug_detailed("memory", "GraphitiMemory instance created",
                               is_enabled=memory.is_enabled,
                               group_id=getattr(memory, 'group_id', 'unknown'))

            if memory.is_enabled:
                if is_debug_enabled():
                    debug("memory", "Saving to Graphiti...")

                # Use structured insights if we have rich extracted data
                if discoveries and discoveries.get("file_insights"):
                    # Rich insights from insight_extractor
                    if is_debug_enabled():
                        debug("memory", "Using save_structured_insights (rich data available)")
                    result = await memory.save_structured_insights(discoveries)
                else:
                    # Fallback to basic session insights
                    result = await memory.save_session_insights(session_num, insights)

                await memory.close()

                if result:
                    logger.info(f"Session {session_num} insights saved to Graphiti (primary)")
                    if is_debug_enabled():
                        debug_success("memory", f"Session {session_num} saved to Graphiti (PRIMARY)",
                                      storage_type="graphiti",
                                      subtasks_saved=len(subtasks_completed))
                    return True, "graphiti"
                else:
                    logger.warning("Graphiti save returned False, falling back to file-based")
                    if is_debug_enabled():
                        debug_warning("memory", "Graphiti save returned False, using FALLBACK")
            else:
                logger.warning("Graphiti memory not enabled, falling back to file-based")
                if is_debug_enabled():
                    debug_warning("memory", "GraphitiMemory.is_enabled=False, using FALLBACK")

        except ImportError as e:
            logger.debug("Graphiti packages not installed, falling back to file-based")
            if is_debug_enabled():
                debug_warning("memory", "Graphiti packages not installed", error=str(e))
        except Exception as e:
            logger.warning(f"Graphiti save failed: {e}, falling back to file-based")
            if is_debug_enabled():
                debug_error("memory", "Graphiti save failed", error=str(e))
    else:
        if is_debug_enabled():
            debug("memory", "Graphiti not enabled, skipping to FALLBACK")

    # FALLBACK: File-based memory (when Graphiti is disabled or fails)
    if is_debug_enabled():
        debug("memory", "Attempting FALLBACK storage: File-based")

    try:
        memory_dir = spec_dir / "memory" / "session_insights"
        if is_debug_enabled():
            debug_detailed("memory", "File-based memory path",
                           memory_dir=str(memory_dir),
                           session_file=f"session_{session_num:03d}.json")

        save_file_based_memory(spec_dir, session_num, insights)
        logger.info(f"Session {session_num} insights saved to file-based memory (fallback)")

        if is_debug_enabled():
            debug_success("memory", f"Session {session_num} saved to file-based (FALLBACK)",
                          storage_type="file",
                          file_path=str(memory_dir / f"session_{session_num:03d}.json"),
                          subtasks_saved=len(subtasks_completed))
        return True, "file"
    except Exception as e:
        logger.error(f"File-based memory save also failed: {e}")
        if is_debug_enabled():
            debug_error("memory", "File-based memory save FAILED", error=str(e))
        return False, "none"


# Keep the old function name as an alias for backwards compatibility
async def save_session_to_graphiti(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    success: bool,
    subtasks_completed: list[str],
    discoveries: Optional[dict] = None,
) -> bool:
    """Backwards compatibility wrapper for save_session_memory."""
    result, _ = await save_session_memory(
        spec_dir, project_dir, subtask_id, session_num, success, subtasks_completed, discoveries
    )
    return result


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


def find_subtask_in_plan(plan: dict, subtask_id: str) -> Optional[dict]:
    """Find a subtask by ID in the plan."""
    for phase in plan.get("phases", []):
        for subtask in phase.get("subtasks", []):
            if subtask.get("id") == subtask_id:
                return subtask
    return None


def find_phase_for_subtask(plan: dict, subtask_id: str) -> Optional[dict]:
    """Find the phase containing a subtask."""
    for phase in plan.get("phases", []):
        for subtask in phase.get("subtasks", []):
            if subtask.get("id") == subtask_id:
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
    subtask_id: str,
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
        subtask_id: The subtask that was being worked on
        session_num: Current session number
        commit_before: Git commit hash before session
        commit_count_before: Number of commits before session
        recovery_manager: Recovery manager instance
        linear_enabled: Whether Linear integration is enabled
        status_manager: Optional status manager for ccstatusline
        source_spec_dir: Original spec directory (for syncing back from worktree)

    Returns:
        True if subtask was completed successfully
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

    subtask = find_subtask_in_plan(plan, subtask_id)
    if not subtask:
        print(f"  Warning: Subtask {subtask_id} not found in plan")
        return False

    subtask_status = subtask.get("status", "pending")

    # Check for new commits
    commit_after = get_latest_commit(project_dir)
    commit_count_after = get_commit_count(project_dir)
    new_commits = commit_count_after - commit_count_before

    print_key_value("Subtask status", subtask_status)
    print_key_value("New commits", str(new_commits))

    if subtask_status == "completed":
        # Success! Record the attempt and good commit
        print_status(f"Subtask {subtask_id} completed successfully", "success")

        # Update status file
        if status_manager:
            subtasks = count_subtasks_detailed(spec_dir)
            status_manager.update_subtasks(
                completed=subtasks["completed"],
                total=subtasks["total"],
                in_progress=0,
            )

        # Record successful attempt
        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=True,
            approach=f"Implemented: {subtask.get('description', 'subtask')[:100]}",
        )

        # Record good commit for rollback safety
        if commit_after and commit_after != commit_before:
            recovery_manager.record_good_commit(commit_after, subtask_id)
            print_status(f"Recorded good commit: {commit_after[:8]}", "success")

        # Record Linear session result (if enabled)
        if linear_enabled:
            # Get progress counts for the comment
            subtasks_detail = count_subtasks_detailed(spec_dir)
            await linear_subtask_completed(
                spec_dir=spec_dir,
                subtask_id=subtask_id,
                completed_count=subtasks_detail["completed"],
                total_count=subtasks_detail["total"],
            )
            print_status("Linear progress recorded", "success")

        # Extract rich insights from session (LLM-powered analysis)
        try:
            extracted_insights = await extract_session_insights(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                commit_before=commit_before,
                commit_after=commit_after,
                success=True,
                recovery_manager=recovery_manager,
            )
            insight_count = len(extracted_insights.get("file_insights", []))
            pattern_count = len(extracted_insights.get("patterns_discovered", []))
            if insight_count > 0 or pattern_count > 0:
                print_status(
                    f"Extracted {insight_count} file insights, {pattern_count} patterns",
                    "success",
                )
        except Exception as e:
            logger.warning(f"Insight extraction failed: {e}")
            extracted_insights = None

        # Save session memory (Graphiti=primary, file-based=fallback)
        try:
            save_success, storage_type = await save_session_memory(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                success=True,
                subtasks_completed=[subtask_id],
                discoveries=extracted_insights,
            )
            if save_success:
                if storage_type == "graphiti":
                    print_status("Session saved to Graphiti memory", "success")
                else:
                    print_status("Session saved to file-based memory (fallback)", "info")
            else:
                print_status("Failed to save session memory", "warning")
        except Exception as e:
            logger.warning(f"Error saving session memory: {e}")
            print_status("Memory save failed", "warning")

        return True

    elif subtask_status == "in_progress":
        # Session ended without completion
        print_status(f"Subtask {subtask_id} still in progress", "warning")

        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=False,
            approach="Session ended with subtask in_progress",
            error="Subtask not marked as completed",
        )

        # Still record commit if one was made (partial progress)
        if commit_after and commit_after != commit_before:
            recovery_manager.record_good_commit(commit_after, subtask_id)
            print_status(f"Recorded partial progress commit: {commit_after[:8]}", "info")

        # Record Linear session result (if enabled)
        if linear_enabled:
            attempt_count = recovery_manager.get_attempt_count(subtask_id)
            await linear_subtask_failed(
                spec_dir=spec_dir,
                subtask_id=subtask_id,
                attempt=attempt_count,
                error_summary="Session ended without completion",
            )

        # Extract insights even from failed sessions (valuable for future attempts)
        try:
            extracted_insights = await extract_session_insights(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                commit_before=commit_before,
                commit_after=commit_after,
                success=False,
                recovery_manager=recovery_manager,
            )
        except Exception as e:
            logger.debug(f"Insight extraction failed for incomplete session: {e}")
            extracted_insights = None

        # Save failed session memory (to track what didn't work)
        try:
            await save_session_memory(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                success=False,
                subtasks_completed=[],
                discoveries=extracted_insights,
            )
        except Exception as e:
            logger.debug(f"Failed to save incomplete session memory: {e}")

        return False

    else:
        # Subtask still pending or failed
        print_status(f"Subtask {subtask_id} not completed (status: {subtask_status})", "error")

        recovery_manager.record_attempt(
            subtask_id=subtask_id,
            session=session_num,
            success=False,
            approach="Session ended without progress",
            error=f"Subtask status is {subtask_status}",
        )

        # Record Linear session result (if enabled)
        if linear_enabled:
            attempt_count = recovery_manager.get_attempt_count(subtask_id)
            await linear_subtask_failed(
                spec_dir=spec_dir,
                subtask_id=subtask_id,
                attempt=attempt_count,
                error_summary=f"Subtask status: {subtask_status}",
            )

        # Extract insights even from completely failed sessions
        try:
            extracted_insights = await extract_session_insights(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                commit_before=commit_before,
                commit_after=commit_after,
                success=False,
                recovery_manager=recovery_manager,
            )
        except Exception as e:
            logger.debug(f"Insight extraction failed for failed session: {e}")
            extracted_insights = None

        # Save failed session memory (to track what didn't work)
        try:
            await save_session_memory(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=session_num,
                success=False,
                subtasks_completed=[],
                discoveries=extracted_insights,
            )
        except Exception as e:
            logger.debug(f"Failed to save failed session memory: {e}")

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
        - "complete" if all subtasks complete
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
                                task_logger.tool_end(current_tool, success=False, result="BLOCKED", detail=str(result_content), phase=phase)
                        elif is_error:
                            # Show errors (truncated)
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                # Store full error in detail for expandable view
                                task_logger.tool_end(current_tool, success=False, result=error_str[:100], detail=str(result_content), phase=phase)
                        else:
                            # Tool succeeded
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                # Store full result in detail for expandable view (only for certain tools)
                                # Skip storing for very large outputs like Glob results
                                detail_content = None
                                if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                    result_str = str(result_content)
                                    # Only store if not too large (detail truncation happens in logger)
                                    if len(result_str) < 50000:  # 50KB max before truncation
                                        detail_content = result_str
                                task_logger.tool_end(current_tool, success=True, detail=detail_content, phase=phase)

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

    The agent can use subagents (via Task tool) for parallel execution if needed.
    This is decided by the agent itself based on the task complexity.

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

    # Debug: Print memory system status at startup
    debug_memory_system_status()

    # Update initial subtask counts
    subtasks = count_subtasks_detailed(spec_dir)
    status_manager.update_subtasks(
        completed=subtasks["completed"],
        total=subtasks["total"],
        in_progress=subtasks["in_progress"],
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
            muted("The agent will analyze your spec and create a subtask-based plan."),
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

        # Get the next subtask to work on
        next_subtask = get_next_subtask(spec_dir)
        subtask_id = next_subtask.get("id") if next_subtask else None
        phase_name = next_subtask.get("phase_name") if next_subtask else None

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
        status_manager.update_subtasks(in_progress=1)

        # Print session header
        print_session_header(
            session_num=iteration,
            is_planner=first_run,
            subtask_id=subtask_id,
            subtask_desc=next_subtask.get("description") if next_subtask else None,
            phase_name=phase_name,
            attempt=recovery_manager.get_attempt_count(subtask_id) + 1 if subtask_id else 1,
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

            if not next_subtask:
                print("No pending subtasks found - build may be complete!")
                break

            # Get attempt count for recovery context
            attempt_count = recovery_manager.get_attempt_count(subtask_id)
            recovery_hints = recovery_manager.get_recovery_hints(subtask_id) if attempt_count > 0 else None

            # Find the phase for this subtask
            plan = load_implementation_plan(spec_dir)
            phase = find_phase_for_subtask(plan, subtask_id) if plan else {}

            # Generate focused, minimal prompt for this subtask
            prompt = generate_subtask_prompt(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask=next_subtask,
                phase=phase or {},
                attempt_count=attempt_count,
                recovery_hints=recovery_hints,
            )

            # Load and append relevant file context
            context = load_subtask_context(spec_dir, project_dir, next_subtask)
            if context.get("patterns") or context.get("files_to_modify"):
                prompt += "\n\n" + format_context_for_prompt(context)

            # Retrieve and append Graphiti memory context (if enabled)
            graphiti_context = await get_graphiti_context(spec_dir, project_dir, next_subtask)
            if graphiti_context:
                prompt += "\n\n" + graphiti_context
                print_status("Graphiti memory context loaded", "success")

            # Show what we're working on
            print(f"Working on: {highlight(subtask_id)}")
            print(f"Description: {next_subtask.get('description', 'No description')}")
            if attempt_count > 0:
                print_status(f"Previous attempts: {attempt_count}", "warning")
            print()

        # Set subtask info in logger
        if task_logger and subtask_id:
            task_logger.set_subtask(subtask_id)
            task_logger.set_session(iteration)

        # Run session with async context manager
        async with client:
            status, response = await run_agent_session(
                client, prompt, spec_dir, verbose, phase=current_log_phase
            )

        # === POST-SESSION PROCESSING (100% reliable) ===
        if subtask_id and not first_run:
            linear_is_enabled = linear_task is not None and linear_task.task_id is not None
            success = await post_session_processing(
                spec_dir=spec_dir,
                project_dir=project_dir,
                subtask_id=subtask_id,
                session_num=iteration,
                commit_before=commit_before,
                commit_count_before=commit_count_before,
                recovery_manager=recovery_manager,
                linear_enabled=linear_is_enabled,
                status_manager=status_manager,
                source_spec_dir=source_spec_dir,
            )

            # Check for stuck subtasks
            attempt_count = recovery_manager.get_attempt_count(subtask_id)
            if not success and attempt_count >= 3:
                recovery_manager.mark_subtask_stuck(
                    subtask_id,
                    f"Failed after {attempt_count} attempts"
                )
                print()
                print_status(f"Subtask {subtask_id} marked as STUCK after {attempt_count} attempts", "error")
                print(muted("Consider: manual intervention or skipping this subtask"))

                # Record stuck subtask in Linear (if enabled)
                if linear_is_enabled:
                    await linear_task_stuck(
                        spec_dir=spec_dir,
                        subtask_id=subtask_id,
                        attempt_count=attempt_count,
                    )
                    print_status("Linear notified of stuck subtask", "info")
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
                task_logger.end_phase(LogPhase.CODING, success=True, message="All subtasks completed successfully")

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

            # Show next subtask info
            next_subtask = get_next_subtask(spec_dir)
            if next_subtask:
                subtask_id = next_subtask.get('id')
                print(f"\nNext: {highlight(subtask_id)} - {next_subtask.get('description')}")

                attempt_count = recovery_manager.get_attempt_count(subtask_id)
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

    # Show stuck subtasks if any
    stuck_subtasks = recovery_manager.get_stuck_subtasks()
    if stuck_subtasks:
        print()
        print_status("STUCK SUBTASKS (need manual intervention):", "error")
        for stuck in stuck_subtasks:
            print(f"  {icon(Icons.ERROR)} {stuck['subtask_id']}: {stuck['reason']}")

    # Instructions
    completed, total = count_subtasks(spec_dir)
    if completed < total:
        content = [
            bold(f"{icon(Icons.PLAY)} NEXT STEPS"),
            "",
            f"{total - completed} subtasks remaining.",
            f"Run again: {highlight(f'python auto-claude/run.py --spec {spec_dir.name}')}",
        ]
    else:
        content = [
            bold(f"{icon(Icons.SUCCESS)} NEXT STEPS"),
            "",
            "All subtasks completed!",
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
    Run the follow-up planner to add new subtasks to a completed spec.

    This is a simplified version of run_autonomous_agent that:
    1. Creates a client
    2. Loads the followup planner prompt
    3. Runs a single planning session
    4. Returns after the plan is updated (doesn't enter coding loop)

    The planner agent will:
    - Read FOLLOWUP_REQUEST.md for the new task
    - Read the existing implementation_plan.json
    - Add new phase(s) with pending subtasks
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
        muted("The agent will read your FOLLOWUP_REQUEST.md and add new subtasks."),
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

        # Verify the plan was updated (should have pending subtasks now)
        plan_file = spec_dir / "implementation_plan.json"
        if plan_file.exists():
            plan = ImplementationPlan.load(plan_file)

            # Check if there are any pending subtasks
            all_subtasks = [c for p in plan.phases for c in p.subtasks]
            pending_subtasks = [c for c in all_subtasks if c.status.value == "pending"]

            if pending_subtasks:
                # Reset the plan status to in_progress (in case planner didn't)
                plan.reset_for_followup()
                plan.save(plan_file)

                print()
                content = [
                    bold(f"{icon(Icons.SUCCESS)} FOLLOW-UP PLANNING COMPLETE"),
                    "",
                    f"New pending subtasks: {highlight(str(len(pending_subtasks)))}",
                    f"Total subtasks: {len(all_subtasks)}",
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
                print_status("Warning: No pending subtasks found after planning", "warning")
                print(muted("The planner may not have added new subtasks."))
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
