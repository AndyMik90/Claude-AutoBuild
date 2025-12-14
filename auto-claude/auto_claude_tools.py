"""
Custom MCP Tools for Auto-Claude Agents
========================================

This module provides custom MCP tools that agents can use for reliable
operations on auto-claude data structures. These tools replace prompt-based
JSON manipulation with guaranteed-correct operations.

Benefits:
- 100% reliable JSON operations (no malformed output)
- Reduced context usage (tool definitions << prompt instructions)
- Type-safe with proper error handling
- Each agent only sees tools relevant to their role via allowed_tools

Usage:
    from auto_claude_tools import create_auto_claude_mcp_server, get_allowed_tools

    # Create the MCP server
    mcp_server = create_auto_claude_mcp_server(spec_dir, project_dir)

    # Get allowed tools for a specific agent type
    allowed_tools = get_allowed_tools("coder")

    # Use in ClaudeAgentOptions
    options = ClaudeAgentOptions(
        mcp_servers={"auto-claude": mcp_server},
        allowed_tools=allowed_tools,
        ...
    )
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    from claude_agent_sdk import tool, create_sdk_mcp_server
    SDK_TOOLS_AVAILABLE = True
except ImportError:
    SDK_TOOLS_AVAILABLE = False
    tool = None
    create_sdk_mcp_server = None


# =============================================================================
# Tool Definitions
# =============================================================================

def _create_tools(spec_dir: Path, project_dir: Path):
    """Create all custom tools with the given spec and project directories."""

    if not SDK_TOOLS_AVAILABLE:
        return []

    tools = []

    # -------------------------------------------------------------------------
    # Tool: update_subtask_status
    # -------------------------------------------------------------------------
    @tool(
        "update_subtask_status",
        "Update the status of a subtask in implementation_plan.json. Use this when completing or starting a subtask.",
        {"subtask_id": str, "status": str, "notes": str}
    )
    async def update_subtask_status(args: dict[str, Any]) -> dict[str, Any]:
        """Update subtask status in the implementation plan."""
        subtask_id = args["subtask_id"]
        status = args["status"]
        notes = args.get("notes", "")

        valid_statuses = ["pending", "in_progress", "completed", "failed"]
        if status not in valid_statuses:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error: Invalid status '{status}'. Must be one of: {valid_statuses}"
                }]
            }

        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return {
                "content": [{
                    "type": "text",
                    "text": "Error: implementation_plan.json not found"
                }]
            }

        try:
            with open(plan_file, "r") as f:
                plan = json.load(f)

            # Find and update the subtask
            subtask_found = False
            for phase in plan.get("phases", []):
                for subtask in phase.get("subtasks", []):
                    if subtask.get("id") == subtask_id:
                        subtask["status"] = status
                        if notes:
                            subtask["notes"] = notes
                        subtask["updated_at"] = datetime.now(timezone.utc).isoformat()
                        subtask_found = True
                        break
                if subtask_found:
                    break

            if not subtask_found:
                return {
                    "content": [{
                        "type": "text",
                        "text": f"Error: Subtask '{subtask_id}' not found in implementation plan"
                    }]
                }

            # Update plan metadata
            plan["last_updated"] = datetime.now(timezone.utc).isoformat()

            with open(plan_file, "w") as f:
                json.dump(plan, f, indent=2)

            return {
                "content": [{
                    "type": "text",
                    "text": f"Successfully updated subtask '{subtask_id}' to status '{status}'"
                }]
            }

        except json.JSONDecodeError as e:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error: Invalid JSON in implementation_plan.json: {e}"
                }]
            }
        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error updating subtask status: {e}"
                }]
            }

    tools.append(update_subtask_status)

    # -------------------------------------------------------------------------
    # Tool: get_build_progress
    # -------------------------------------------------------------------------
    @tool(
        "get_build_progress",
        "Get the current build progress including completed subtasks, pending subtasks, and next subtask to work on.",
        {}
    )
    async def get_build_progress(args: dict[str, Any]) -> dict[str, Any]:
        """Get current build progress."""
        plan_file = spec_dir / "implementation_plan.json"

        if not plan_file.exists():
            return {
                "content": [{
                    "type": "text",
                    "text": "No implementation plan found. Run the planner first."
                }]
            }

        try:
            with open(plan_file, "r") as f:
                plan = json.load(f)

            stats = {
                "total": 0,
                "completed": 0,
                "in_progress": 0,
                "pending": 0,
                "failed": 0,
            }

            phases_summary = []
            next_subtask = None

            for phase in plan.get("phases", []):
                phase_id = phase.get("id") or phase.get("phase")
                phase_name = phase.get("name", phase_id)
                phase_subtasks = phase.get("subtasks", [])

                phase_stats = {"completed": 0, "total": len(phase_subtasks)}

                for subtask in phase_subtasks:
                    stats["total"] += 1
                    status = subtask.get("status", "pending")

                    if status == "completed":
                        stats["completed"] += 1
                        phase_stats["completed"] += 1
                    elif status == "in_progress":
                        stats["in_progress"] += 1
                    elif status == "failed":
                        stats["failed"] += 1
                    else:
                        stats["pending"] += 1
                        # Track next subtask to work on
                        if next_subtask is None:
                            next_subtask = {
                                "id": subtask.get("id"),
                                "description": subtask.get("description"),
                                "phase": phase_name,
                            }

                phases_summary.append(f"  {phase_name}: {phase_stats['completed']}/{phase_stats['total']}")

            progress_pct = (stats["completed"] / stats["total"] * 100) if stats["total"] > 0 else 0

            result = f"""Build Progress: {stats['completed']}/{stats['total']} subtasks ({progress_pct:.0f}%)

Status breakdown:
  Completed: {stats['completed']}
  In Progress: {stats['in_progress']}
  Pending: {stats['pending']}
  Failed: {stats['failed']}

Phases:
{chr(10).join(phases_summary)}"""

            if next_subtask:
                result += f"""

Next subtask to work on:
  ID: {next_subtask['id']}
  Phase: {next_subtask['phase']}
  Description: {next_subtask['description']}"""
            elif stats["completed"] == stats["total"]:
                result += "\n\nAll subtasks completed! Build is ready for QA."

            return {
                "content": [{
                    "type": "text",
                    "text": result
                }]
            }

        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error reading build progress: {e}"
                }]
            }

    tools.append(get_build_progress)

    # -------------------------------------------------------------------------
    # Tool: record_discovery
    # -------------------------------------------------------------------------
    @tool(
        "record_discovery",
        "Record a codebase discovery to session memory. Use this when you learn something important about the codebase.",
        {"file_path": str, "description": str, "category": str}
    )
    async def record_discovery(args: dict[str, Any]) -> dict[str, Any]:
        """Record a discovery to the codebase map."""
        file_path = args["file_path"]
        description = args["description"]
        category = args.get("category", "general")

        memory_dir = spec_dir / "memory"
        memory_dir.mkdir(exist_ok=True)

        codebase_map_file = memory_dir / "codebase_map.json"

        try:
            # Load existing map or create new
            if codebase_map_file.exists():
                with open(codebase_map_file, "r") as f:
                    codebase_map = json.load(f)
            else:
                codebase_map = {
                    "discovered_files": {},
                    "last_updated": None,
                }

            # Add or update the discovery
            codebase_map["discovered_files"][file_path] = {
                "description": description,
                "category": category,
                "discovered_at": datetime.now(timezone.utc).isoformat(),
            }
            codebase_map["last_updated"] = datetime.now(timezone.utc).isoformat()

            with open(codebase_map_file, "w") as f:
                json.dump(codebase_map, f, indent=2)

            return {
                "content": [{
                    "type": "text",
                    "text": f"Recorded discovery for '{file_path}': {description}"
                }]
            }

        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error recording discovery: {e}"
                }]
            }

    tools.append(record_discovery)

    # -------------------------------------------------------------------------
    # Tool: record_gotcha
    # -------------------------------------------------------------------------
    @tool(
        "record_gotcha",
        "Record a gotcha or pitfall to avoid. Use this when you encounter something that future sessions should know.",
        {"gotcha": str, "context": str}
    )
    async def record_gotcha(args: dict[str, Any]) -> dict[str, Any]:
        """Record a gotcha to session memory."""
        gotcha = args["gotcha"]
        context = args.get("context", "")

        memory_dir = spec_dir / "memory"
        memory_dir.mkdir(exist_ok=True)

        gotchas_file = memory_dir / "gotchas.md"

        try:
            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

            entry = f"\n## [{timestamp}]\n{gotcha}"
            if context:
                entry += f"\n\n_Context: {context}_"
            entry += "\n"

            with open(gotchas_file, "a") as f:
                if not gotchas_file.exists() or gotchas_file.stat().st_size == 0:
                    f.write("# Gotchas & Pitfalls\n\nThings to watch out for in this codebase.\n")
                f.write(entry)

            return {
                "content": [{
                    "type": "text",
                    "text": f"Recorded gotcha: {gotcha}"
                }]
            }

        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error recording gotcha: {e}"
                }]
            }

    tools.append(record_gotcha)

    # -------------------------------------------------------------------------
    # Tool: get_session_context
    # -------------------------------------------------------------------------
    @tool(
        "get_session_context",
        "Get context from previous sessions including discoveries, gotchas, and patterns.",
        {}
    )
    async def get_session_context(args: dict[str, Any]) -> dict[str, Any]:
        """Get accumulated session context."""
        memory_dir = spec_dir / "memory"

        if not memory_dir.exists():
            return {
                "content": [{
                    "type": "text",
                    "text": "No session memory found. This appears to be the first session."
                }]
            }

        result_parts = []

        # Load codebase map
        codebase_map_file = memory_dir / "codebase_map.json"
        if codebase_map_file.exists():
            try:
                with open(codebase_map_file, "r") as f:
                    codebase_map = json.load(f)

                discoveries = codebase_map.get("discovered_files", {})
                if discoveries:
                    result_parts.append("## Codebase Discoveries")
                    for path, info in list(discoveries.items())[:20]:  # Limit to 20
                        desc = info.get("description", "No description")
                        result_parts.append(f"- `{path}`: {desc}")
            except Exception:
                pass

        # Load gotchas
        gotchas_file = memory_dir / "gotchas.md"
        if gotchas_file.exists():
            try:
                content = gotchas_file.read_text()
                if content.strip():
                    result_parts.append("\n## Gotchas")
                    # Take last 1000 chars to avoid too much context
                    result_parts.append(content[-1000:] if len(content) > 1000 else content)
            except Exception:
                pass

        # Load patterns
        patterns_file = memory_dir / "patterns.md"
        if patterns_file.exists():
            try:
                content = patterns_file.read_text()
                if content.strip():
                    result_parts.append("\n## Patterns")
                    result_parts.append(content[-1000:] if len(content) > 1000 else content)
            except Exception:
                pass

        if not result_parts:
            return {
                "content": [{
                    "type": "text",
                    "text": "No session context available yet."
                }]
            }

        return {
            "content": [{
                "type": "text",
                "text": "\n".join(result_parts)
            }]
        }

    tools.append(get_session_context)

    # -------------------------------------------------------------------------
    # Tool: update_qa_status
    # -------------------------------------------------------------------------
    @tool(
        "update_qa_status",
        "Update the QA sign-off status in implementation_plan.json. Use after QA review.",
        {"status": str, "issues": str, "tests_passed": str}
    )
    async def update_qa_status(args: dict[str, Any]) -> dict[str, Any]:
        """Update QA status in the implementation plan."""
        status = args["status"]
        issues_str = args.get("issues", "[]")
        tests_str = args.get("tests_passed", "{}")

        valid_statuses = ["pending", "in_review", "approved", "rejected", "fixes_applied"]
        if status not in valid_statuses:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error: Invalid QA status '{status}'. Must be one of: {valid_statuses}"
                }]
            }

        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return {
                "content": [{
                    "type": "text",
                    "text": "Error: implementation_plan.json not found"
                }]
            }

        try:
            # Parse issues and tests
            try:
                issues = json.loads(issues_str) if issues_str else []
            except json.JSONDecodeError:
                issues = [{"description": issues_str}] if issues_str else []

            try:
                tests_passed = json.loads(tests_str) if tests_str else {}
            except json.JSONDecodeError:
                tests_passed = {}

            with open(plan_file, "r") as f:
                plan = json.load(f)

            # Get current QA session number
            current_qa = plan.get("qa_signoff", {})
            qa_session = current_qa.get("qa_session", 0)
            if status in ["in_review", "rejected"]:
                qa_session += 1

            plan["qa_signoff"] = {
                "status": status,
                "qa_session": qa_session,
                "issues_found": issues,
                "tests_passed": tests_passed,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "ready_for_qa_revalidation": status == "fixes_applied",
            }

            # Update plan status to match QA result
            # This ensures the UI shows the correct column after QA
            if status == "approved":
                plan["status"] = "human_review"
                plan["planStatus"] = "review"
            elif status == "rejected":
                plan["status"] = "human_review"
                plan["planStatus"] = "review"

            plan["last_updated"] = datetime.now(timezone.utc).isoformat()

            with open(plan_file, "w") as f:
                json.dump(plan, f, indent=2)

            return {
                "content": [{
                    "type": "text",
                    "text": f"Updated QA status to '{status}' (session {qa_session})"
                }]
            }

        except Exception as e:
            return {
                "content": [{
                    "type": "text",
                    "text": f"Error updating QA status: {e}"
                }]
            }

    tools.append(update_qa_status)

    return tools


# =============================================================================
# Public API
# =============================================================================

def create_auto_claude_mcp_server(spec_dir: Path, project_dir: Path):
    """
    Create an MCP server with auto-claude custom tools.

    Args:
        spec_dir: Path to the spec directory
        project_dir: Path to the project root

    Returns:
        MCP server instance, or None if SDK tools not available
    """
    if not SDK_TOOLS_AVAILABLE:
        return None

    tools = _create_tools(spec_dir, project_dir)

    return create_sdk_mcp_server(
        name="auto-claude",
        version="1.0.0",
        tools=tools
    )


# Tool name constants for easy reference
TOOL_UPDATE_SUBTASK_STATUS = "mcp__auto-claude__update_subtask_status"
TOOL_GET_BUILD_PROGRESS = "mcp__auto-claude__get_build_progress"
TOOL_RECORD_DISCOVERY = "mcp__auto-claude__record_discovery"
TOOL_RECORD_GOTCHA = "mcp__auto-claude__record_gotcha"
TOOL_GET_SESSION_CONTEXT = "mcp__auto-claude__get_session_context"
TOOL_UPDATE_QA_STATUS = "mcp__auto-claude__update_qa_status"


def get_allowed_tools(agent_type: str) -> list[str]:
    """
    Get the list of allowed tools for a specific agent type.

    This ensures each agent only sees tools relevant to their role,
    preventing context pollution and accidental misuse.

    Args:
        agent_type: One of 'planner', 'coder', 'qa_reviewer', 'qa_fixer'

    Returns:
        List of allowed tool names
    """
    # Base tools all agents can use
    base_read_tools = ["Read", "Glob", "Grep"]
    base_write_tools = ["Write", "Edit", "Bash"]

    # Auto-claude tool mappings by agent type
    tool_mappings = {
        "planner": {
            "base": base_read_tools + base_write_tools,
            "auto_claude": [
                TOOL_GET_BUILD_PROGRESS,
                TOOL_GET_SESSION_CONTEXT,
                TOOL_RECORD_DISCOVERY,
            ],
        },
        "coder": {
            "base": base_read_tools + base_write_tools,
            "auto_claude": [
                TOOL_UPDATE_SUBTASK_STATUS,
                TOOL_GET_BUILD_PROGRESS,
                TOOL_RECORD_DISCOVERY,
                TOOL_RECORD_GOTCHA,
                TOOL_GET_SESSION_CONTEXT,
            ],
        },
        "qa_reviewer": {
            "base": base_read_tools + ["Bash"],  # Can run tests but not edit
            "auto_claude": [
                TOOL_GET_BUILD_PROGRESS,
                TOOL_UPDATE_QA_STATUS,
                TOOL_GET_SESSION_CONTEXT,
            ],
        },
        "qa_fixer": {
            "base": base_read_tools + base_write_tools,
            "auto_claude": [
                TOOL_UPDATE_SUBTASK_STATUS,
                TOOL_GET_BUILD_PROGRESS,
                TOOL_UPDATE_QA_STATUS,
                TOOL_RECORD_GOTCHA,
            ],
        },
    }

    if agent_type not in tool_mappings:
        # Default to coder tools
        agent_type = "coder"

    mapping = tool_mappings[agent_type]
    return mapping["base"] + mapping["auto_claude"]


def is_tools_available() -> bool:
    """Check if SDK tools functionality is available."""
    return SDK_TOOLS_AVAILABLE
