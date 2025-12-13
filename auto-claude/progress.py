"""
Progress Tracking Utilities
===========================

Functions for tracking and displaying progress of the autonomous coding agent.
Uses chunk-based implementation plans (implementation_plan.json).

Enhanced with colored output, icons, and better visual formatting.
"""

import json
from pathlib import Path
from typing import Optional

from ui import (
    Icons,
    icon,
    color,
    Color,
    success,
    error,
    warning,
    info,
    muted,
    highlight,
    bold,
    box,
    divider,
    progress_bar,
    print_header,
    print_section,
    print_status,
    print_phase_status,
    print_key_value,
)


def count_chunks(spec_dir: Path) -> tuple[int, int]:
    """
    Count completed and total chunks in implementation_plan.json.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        (completed_count, total_count)
    """
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return 0, 0

    try:
        with open(plan_file, "r") as f:
            plan = json.load(f)

        total = 0
        completed = 0

        for phase in plan.get("phases", []):
            for chunk in phase.get("chunks", []):
                total += 1
                if chunk.get("status") == "completed":
                    completed += 1

        return completed, total
    except (json.JSONDecodeError, IOError):
        return 0, 0


def count_chunks_detailed(spec_dir: Path) -> dict:
    """
    Count chunks by status.

    Returns:
        Dict with completed, in_progress, pending, failed counts
    """
    plan_file = spec_dir / "implementation_plan.json"

    result = {
        "completed": 0,
        "in_progress": 0,
        "pending": 0,
        "failed": 0,
        "total": 0,
    }

    if not plan_file.exists():
        return result

    try:
        with open(plan_file, "r") as f:
            plan = json.load(f)

        for phase in plan.get("phases", []):
            for chunk in phase.get("chunks", []):
                result["total"] += 1
                status = chunk.get("status", "pending")
                if status in result:
                    result[status] += 1
                else:
                    result["pending"] += 1

        return result
    except (json.JSONDecodeError, IOError):
        return result


def is_build_complete(spec_dir: Path) -> bool:
    """
    Check if all chunks are completed.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        True if all chunks complete, False otherwise
    """
    completed, total = count_chunks(spec_dir)
    return total > 0 and completed == total


def get_progress_percentage(spec_dir: Path) -> float:
    """
    Get the progress as a percentage.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        Percentage of chunks completed (0-100)
    """
    completed, total = count_chunks(spec_dir)
    if total == 0:
        return 0.0
    return (completed / total) * 100


def print_session_header(
    session_num: int,
    is_planner: bool,
    chunk_id: str = None,
    chunk_desc: str = None,
    phase_name: str = None,
    attempt: int = 1,
) -> None:
    """Print a formatted header for the session."""
    session_type = "PLANNER AGENT" if is_planner else "CODING AGENT"
    session_icon = Icons.GEAR if is_planner else Icons.LIGHTNING

    content = [
        bold(f"{icon(session_icon)} SESSION {session_num}: {session_type}"),
    ]

    if chunk_id:
        content.append("")
        chunk_line = f"{icon(Icons.CHUNK)} Chunk: {highlight(chunk_id)}"
        if chunk_desc:
            # Truncate long descriptions
            desc = chunk_desc[:50] + "..." if len(chunk_desc) > 50 else chunk_desc
            chunk_line += f" - {desc}"
        content.append(chunk_line)

    if phase_name:
        content.append(f"{icon(Icons.PHASE)} Phase: {phase_name}")

    if attempt > 1:
        content.append(warning(f"{icon(Icons.WARNING)} Attempt: {attempt}"))

    print()
    print(box(content, width=70, style="heavy"))
    print()


def print_progress_summary(spec_dir: Path, show_next: bool = True) -> None:
    """Print a summary of current progress with enhanced formatting."""
    completed, total = count_chunks(spec_dir)

    if total > 0:
        print()
        # Progress bar
        print(f"Progress: {progress_bar(completed, total, width=40)}")

        # Status message
        if completed == total:
            print_status("BUILD COMPLETE - All chunks completed!", "success")
        else:
            remaining = total - completed
            print_status(f"{remaining} chunks remaining", "info")

        # Phase summary
        try:
            with open(spec_dir / "implementation_plan.json", "r") as f:
                plan = json.load(f)

            print("\nPhases:")
            for phase in plan.get("phases", []):
                phase_chunks = phase.get("chunks", [])
                phase_completed = sum(1 for c in phase_chunks if c.get("status") == "completed")
                phase_total = len(phase_chunks)
                phase_name = phase.get("name", phase.get("id", "Unknown"))

                if phase_completed == phase_total:
                    status = "complete"
                elif phase_completed > 0 or any(c.get("status") == "in_progress" for c in phase_chunks):
                    status = "in_progress"
                else:
                    # Check if blocked by dependencies
                    deps = phase.get("depends_on", [])
                    all_deps_complete = True
                    for dep_id in deps:
                        for p in plan.get("phases", []):
                            if p.get("id") == dep_id or p.get("phase") == dep_id:
                                p_chunks = p.get("chunks", [])
                                if not all(c.get("status") == "completed" for c in p_chunks):
                                    all_deps_complete = False
                                break
                    status = "pending" if all_deps_complete else "blocked"

                print_phase_status(phase_name, phase_completed, phase_total, status)

            # Show next chunk if requested
            if show_next and completed < total:
                next_chunk = get_next_chunk(spec_dir)
                if next_chunk:
                    print()
                    next_id = next_chunk.get("id", "unknown")
                    next_desc = next_chunk.get("description", "")
                    if len(next_desc) > 60:
                        next_desc = next_desc[:57] + "..."
                    print(f"  {icon(Icons.ARROW_RIGHT)} Next: {highlight(next_id)} - {next_desc}")

        except (json.JSONDecodeError, IOError):
            pass
    else:
        print()
        print_status("No implementation chunks yet - planner needs to run", "pending")


def print_build_complete_banner(spec_dir: Path) -> None:
    """Print a completion banner."""
    content = [
        success(f"{icon(Icons.SUCCESS)} BUILD COMPLETE!"),
        "",
        "All chunks have been implemented successfully.",
        "",
        muted("Next steps:"),
        f"  1. Review the {highlight('auto-claude/*')} branch",
        "  2. Run manual tests",
        "  3. Create a PR and merge to main",
    ]

    print()
    print(box(content, width=70, style="heavy"))
    print()


def print_paused_banner(
    spec_dir: Path,
    spec_name: str,
    has_worktree: bool = False,
) -> None:
    """Print a paused banner with resume instructions."""
    completed, total = count_chunks(spec_dir)

    content = [
        warning(f"{icon(Icons.PAUSE)} BUILD PAUSED"),
        "",
        f"Progress saved: {completed}/{total} chunks complete",
    ]

    if has_worktree:
        content.append("")
        content.append(muted("Your build is in a separate workspace and is safe."))

    print()
    print(box(content, width=70, style="heavy"))


def get_plan_summary(spec_dir: Path) -> dict:
    """
    Get a detailed summary of implementation plan status.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        Dictionary with plan statistics
    """
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return {
            "workflow_type": None,
            "total_phases": 0,
            "total_chunks": 0,
            "completed_chunks": 0,
            "pending_chunks": 0,
            "in_progress_chunks": 0,
            "failed_chunks": 0,
            "phases": [],
        }

    try:
        with open(plan_file, "r") as f:
            plan = json.load(f)

        summary = {
            "workflow_type": plan.get("workflow_type"),
            "total_phases": len(plan.get("phases", [])),
            "total_chunks": 0,
            "completed_chunks": 0,
            "pending_chunks": 0,
            "in_progress_chunks": 0,
            "failed_chunks": 0,
            "phases": [],
        }

        for phase in plan.get("phases", []):
            phase_info = {
                "id": phase.get("id"),
                "phase": phase.get("phase"),
                "name": phase.get("name"),
                "depends_on": phase.get("depends_on", []),
                "chunks": [],
                "completed": 0,
                "total": 0,
            }

            for chunk in phase.get("chunks", []):
                status = chunk.get("status", "pending")
                summary["total_chunks"] += 1
                phase_info["total"] += 1

                if status == "completed":
                    summary["completed_chunks"] += 1
                    phase_info["completed"] += 1
                elif status == "in_progress":
                    summary["in_progress_chunks"] += 1
                elif status == "failed":
                    summary["failed_chunks"] += 1
                else:
                    summary["pending_chunks"] += 1

                phase_info["chunks"].append({
                    "id": chunk.get("id"),
                    "description": chunk.get("description"),
                    "status": status,
                    "service": chunk.get("service"),
                })

            summary["phases"].append(phase_info)

        return summary

    except (json.JSONDecodeError, IOError):
        return {
            "workflow_type": None,
            "total_phases": 0,
            "total_chunks": 0,
            "completed_chunks": 0,
            "pending_chunks": 0,
            "in_progress_chunks": 0,
            "failed_chunks": 0,
            "phases": [],
        }


def get_current_phase(spec_dir: Path) -> Optional[dict]:
    """Get the current phase being worked on."""
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return None

    try:
        with open(plan_file, "r") as f:
            plan = json.load(f)

        for phase in plan.get("phases", []):
            chunks = phase.get("chunks", [])
            # Phase is current if it has incomplete chunks and dependencies are met
            has_incomplete = any(c.get("status") != "completed" for c in chunks)
            if has_incomplete:
                return {
                    "id": phase.get("id"),
                    "phase": phase.get("phase"),
                    "name": phase.get("name"),
                    "completed": sum(1 for c in chunks if c.get("status") == "completed"),
                    "total": len(chunks),
                }

        return None

    except (json.JSONDecodeError, IOError):
        return None


def get_next_chunk(spec_dir: Path) -> dict | None:
    """
    Find the next chunk to work on, respecting phase dependencies.

    Args:
        spec_dir: Directory containing implementation_plan.json

    Returns:
        The next chunk dict to work on, or None if all complete
    """
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return None

    try:
        with open(plan_file, "r") as f:
            plan = json.load(f)

        phases = plan.get("phases", [])

        # Build a map of phase completion
        phase_complete = {}
        for phase in phases:
            phase_id = phase.get("id") or phase.get("phase")
            chunks = phase.get("chunks", [])
            phase_complete[phase_id] = all(
                c.get("status") == "completed" for c in chunks
            )

        # Find next available chunk
        for phase in phases:
            phase_id = phase.get("id") or phase.get("phase")
            depends_on = phase.get("depends_on", [])

            # Check if dependencies are satisfied
            deps_satisfied = all(phase_complete.get(dep, False) for dep in depends_on)
            if not deps_satisfied:
                continue

            # Find first pending chunk in this phase
            for chunk in phase.get("chunks", []):
                if chunk.get("status") == "pending":
                    return {
                        "phase_id": phase_id,
                        "phase_name": phase.get("name"),
                        "phase_num": phase.get("phase"),
                        **chunk,
                    }

        return None

    except (json.JSONDecodeError, IOError):
        return None


def format_duration(seconds: float) -> str:
    """Format a duration in human-readable form."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}m"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}h"
