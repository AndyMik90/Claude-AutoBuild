"""
Feedback Management Tools
==========================

Tools for managing user feedback in task_metadata.json.
"""

import json
from pathlib import Path
from typing import Any

try:
    from claude_agent_sdk import tool

    SDK_TOOLS_AVAILABLE = True
except ImportError:
    SDK_TOOLS_AVAILABLE = False
    tool = None


def create_feedback_tools(spec_dir: Path, _project_dir: Path) -> list:
    """
    Create feedback management tools.

    Args:
        spec_dir: Path to the spec directory
        project_dir: Path to the project root

    Returns:
        List of feedback tool functions
    """
    if not SDK_TOOLS_AVAILABLE:
        return []

    tools = []

    # -------------------------------------------------------------------------
    # Tool: mark_feedback_read
    # -------------------------------------------------------------------------
    @tool(
        "mark_feedback_read",
        "Mark specific user feedback items as read after incorporating them. "
        "Call this when you have successfully addressed feedback corrections. "
        "Provide the indices as a comma-separated string (e.g., '0' or '0,1,2').",
        {"feedback_indices": str},
    )
    async def mark_feedback_read(args: dict[str, Any]) -> dict[str, Any]:
        """Mark specific feedback entries as read in task_metadata.json."""
        feedback_indices_str = args.get("feedback_indices", "")

        # Parse comma-separated string into list of integers
        try:
            if not feedback_indices_str or not feedback_indices_str.strip():
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": "Error: feedback_indices cannot be empty. Provide indices as comma-separated string (e.g., '0' or '0,1,2').",
                        }
                    ]
                }

            feedback_indices = [
                int(idx.strip()) for idx in feedback_indices_str.split(",")
            ]
        except ValueError as e:
            error_msg = f"Error: feedback_indices must be comma-separated integers (e.g., '0' or '0,1,2'), got '{feedback_indices_str}'"
            return {
                "content": [
                    {
                        "type": "text",
                        "text": error_msg,
                    }
                ]
            }

        if not feedback_indices:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: feedback_indices cannot be empty. Specify which feedback items you addressed.",
                    }
                ]
            }

        metadata_file = spec_dir / "task_metadata.json"
        if not metadata_file.exists():
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: task_metadata.json not found",
                    }
                ]
            }

        try:
            with open(metadata_file) as f:
                metadata = json.load(f)

            feedback_list = metadata.get("feedback", [])
            if not feedback_list:
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": "No feedback entries found in task_metadata.json",
                        }
                    ]
                }

            # Mark specified feedback items as read
            marked_count = 0
            invalid_indices = []
            for idx in feedback_indices:
                if 0 <= idx < len(feedback_list):
                    feedback_list[idx]["read"] = True
                    marked_count += 1
                else:
                    invalid_indices.append(idx)

            if invalid_indices:
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": f"Error: Invalid feedback indices: {invalid_indices}. "
                            f"Valid range is 0-{len(feedback_list) - 1}",
                        }
                    ]
                }

            # Save updated metadata
            with open(metadata_file, "w") as f:
                json.dump(metadata, f, indent=2)

            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Successfully marked {marked_count} feedback item(s) as read: {feedback_indices}",
                    }
                ]
            }

        except json.JSONDecodeError as e:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Invalid JSON in task_metadata.json: {e}",
                    }
                ]
            }
        except Exception as e:
            return {
                "content": [
                    {"type": "text", "text": f"Error marking feedback as read: {e}"}
                ]
            }

    tools.append(mark_feedback_read)

    return tools
