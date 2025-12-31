"""
Delegation Runner
=================

Main orchestration loop for the delegation system.
"""

import sys
from pathlib import Path
from typing import Any, Dict, List

from debug import debug, debug_error, debug_section, debug_success
from delegation.coordinator import DelegationCoordinator
from delegation.models import create_delegation_id
from ui import print_banner, print_status


def create_delegation_directory(project_dir: Path, task: str) -> Path:
    """
    Create a new delegation directory for the task.

    Args:
        project_dir: Root project directory
        task: The task description

    Returns:
        Path to the new delegation directory
    """
    # Create delegations directory if it doesn't exist
    auto_claude_dir = project_dir / ".auto-claude"
    delegations_dir = auto_claude_dir / "delegations"
    delegations_dir.mkdir(parents=True, exist_ok=True)

    # Generate delegation ID and create directory
    delegation_id = create_delegation_id(task, delegations_dir)
    delegation_dir = delegations_dir / delegation_id
    delegation_dir.mkdir(exist_ok=True)

    # Create artifacts directory
    artifacts_dir = delegation_dir / "artifacts"
    artifacts_dir.mkdir(exist_ok=True)

    # Create task.md file
    task_file = delegation_dir / "task.md"
    task_file.write_text(f"# Task\n\n{task}\n")

    return delegation_dir


def run_delegation(
    project_dir: Path,
    task: str,
    model: str,
    verbose: bool = False,
) -> Dict[str, Any]:
    """
    Run a delegation workflow for the given task.

    Args:
        project_dir: Root project directory
        task: The task description
        model: Claude model to use
        verbose: Enable verbose output

    Returns:
        Dictionary with delegation results
    """
    debug_section("delegation", "Delegation Runner")
    debug("delegation", "Starting delegation", task=task[:100], model=model)

    # Create delegation directory
    delegation_dir = create_delegation_directory(project_dir, task)
    debug_success("delegation", "Delegation directory created", path=str(delegation_dir))

    # Create coordinator
    coordinator = DelegationCoordinator(
        project_dir=project_dir,
        delegation_dir=delegation_dir,
        model=model,
    )

    # Run delegation
    try:
        context = coordinator.analyze_and_delegate(task, verbose)

        # Create summary file
        summary_file = delegation_dir / "summary.md"
        summary_content = f"""# Delegation Summary

## Task
{context.task}

## Pattern
{context.pattern_name}

## Complexity
{context.complexity}

## Status
{context.status.value}

## Steps Completed
{len([r for r in context.step_results if r.status == 'completed'])} / {context.total_steps}

## Results
"""
        for i, result in enumerate(context.step_results, 1):
            summary_content += f"\n### Step {i}: {result.step_name}\n"
            summary_content += f"- Agent: {result.agent_type}\n"
            summary_content += f"- Status: {result.status}\n"
            if result.error:
                summary_content += f"- Error: {result.error}\n"

        summary_file.write_text(summary_content)

        print_status(f"Summary saved to: {summary_file}", "success")

        return {
            "status": "success",
            "delegation_id": context.delegation_id,
            "delegation_dir": str(delegation_dir),
            "pattern": context.pattern_name,
            "complexity": context.complexity,
            "steps_completed": len([r for r in context.step_results if r.status == 'completed']),
            "total_steps": context.total_steps,
        }

    except Exception as e:
        debug_error("delegation", "Delegation failed", error=str(e))
        return {
            "status": "error",
            "error": str(e),
            "delegation_dir": str(delegation_dir),
        }


def list_delegations(project_dir: Path) -> List[Dict[str, Any]]:
    """
    List all delegations in the project.

    Args:
        project_dir: Root project directory

    Returns:
        List of delegation information dictionaries
    """
    delegations_dir = project_dir / ".auto-claude" / "delegations"

    if not delegations_dir.exists():
        return []

    delegations = []
    for item in delegations_dir.iterdir():
        if item.is_dir():
            # Try to load delegation metadata
            metadata_file = item / "delegation.json"
            if metadata_file.exists():
                import json

                try:
                    with open(metadata_file) as f:
                        metadata = json.load(f)
                    delegations.append(metadata)
                except (OSError, json.JSONDecodeError):
                    # Skip corrupted files
                    pass

    # Sort by started_at (newest first)
    delegations.sort(key=lambda d: d.get("started_at", 0), reverse=True)
    return delegations


def show_delegation_status(project_dir: Path) -> None:
    """
    Show status of all delegations.

    Args:
        project_dir: Root project directory
    """
    print_banner()
    print("\nDelegation Status\n")

    delegations = list_delegations(project_dir)

    if not delegations:
        print("No delegations found.")
        return

    for d in delegations:
        status_emoji = {
            "pending": "⏳",
            "in_progress": "🔄",
            "completed": "✅",
            "failed": "❌",
            "cancelled": "🚫",
        }.get(d.get("status", "pending"), "❓")

        print(f"\n{status_emoji} {d.get('delegation_id', 'unknown')}")
        print(f"   Task: {d.get('task', 'unknown')[:60]}...")
        print(f"   Pattern: {d.get('pattern_name', 'unknown')}")
        print(f"   Status: {d.get('status', 'unknown')}")
        print(f"   Steps: {d.get('current_step', 0)} / {d.get('total_steps', 0)}")
