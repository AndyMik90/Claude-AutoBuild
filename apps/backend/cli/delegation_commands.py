"""
Delegation CLI Commands
========================

Command-line handlers for the delegation system.
"""

from pathlib import Path

from .utils import get_project_dir, print_banner
from delegation.delegation_runner import run_delegation, show_delegation_status


def handle_delegate_command(
    task: str,
    project_dir: Path | None = None,
    model: str | None = None,
    verbose: bool = False,
) -> None:
    """
    Handle the --delegate command.

    Args:
        task: The task description to delegate
        project_dir: Project directory (default: current working directory)
        model: Claude model to use
        verbose: Enable verbose output
    """
    # Get project directory
    project_dir = get_project_dir(project_dir)

    # Get model from env var or use default
    if not model:
        import os

        model = os.environ.get("AUTO_BUILD_MODEL", "claude-sonnet-4-5-20250929")

    print_banner()
    print("\nDelegating task to intelligent coordination system...\n")

    # Run delegation
    result = run_delegation(
        project_dir=project_dir,
        task=task,
        model=model,
        verbose=verbose,
    )

    # Report results
    print()
    print("=" * 70)
    if result["status"] == "success":
        print("Delegation completed successfully!")
        print(f"  Delegation ID: {result['delegation_id']}")
        print(f"  Pattern: {result['pattern']}")
        print(f"  Complexity: {result['complexity']}")
        print(f"  Steps: {result['steps_completed']}/{result['total_steps']}")
        print(f"  Directory: {result['delegation_dir']}")
    else:
        print("Delegation failed!")
        print(f"  Error: {result.get('error', 'Unknown error')}")
        print(f"  Directory: {result.get('delegation_dir', 'Unknown')}")
    print("=" * 70)


def handle_delegate_list_command(project_dir: Path | None = None) -> None:
    """
    Handle listing delegations.

    Args:
        project_dir: Project directory (default: current working directory)
    """
    project_dir = get_project_dir(project_dir)
    show_delegation_status(project_dir)
