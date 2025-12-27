"""
QA Management Tools
===================

Tools for managing QA status and sign-off in implementation_plan.json.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from claude_agent_sdk import tool

    SDK_TOOLS_AVAILABLE = True
except ImportError:
    SDK_TOOLS_AVAILABLE = False
    tool = None


def create_qa_tools(spec_dir: Path, project_dir: Path) -> list:
    """
    Create QA management tools.

    Args:
        spec_dir: Path to the spec directory
        project_dir: Path to the project root

    Returns:
        List of QA tool functions
    """
    if not SDK_TOOLS_AVAILABLE:
        return []

    tools = []

    # -------------------------------------------------------------------------
    # Tool: update_qa_status
    # -------------------------------------------------------------------------
    @tool(
        "update_qa_status",
        "Update the QA sign-off status in implementation_plan.json. Use after QA review.",
        {"status": str, "issues": str, "tests_passed": str},
    )
    async def update_qa_status(args: dict[str, Any]) -> dict[str, Any]:
        """Update QA status in the implementation plan."""
        status = args["status"]
        issues_str = args.get("issues", "[]")
        tests_str = args.get("tests_passed", "{}")

        valid_statuses = [
            "pending",
            "in_review",
            "approved",
            "rejected",
            "fixes_applied",
        ]
        if status not in valid_statuses:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Invalid QA status '{status}'. Must be one of: {valid_statuses}",
                    }
                ]
            }

        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: implementation_plan.json not found",
                    }
                ]
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

            with open(plan_file) as f:
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
                "content": [
                    {
                        "type": "text",
                        "text": f"Updated QA status to '{status}' (session {qa_session})",
                    }
                ]
            }

        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error updating QA status: {e}"}]
            }

    tools.append(update_qa_status)

    return tools
