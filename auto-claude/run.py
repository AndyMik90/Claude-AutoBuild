#!/usr/bin/env python3
"""
Auto Claude Framework
=====================

A multi-session autonomous coding framework for building features and applications.
Uses subtask-based implementation plans with phase dependencies.

Key Features:
- Safe workspace isolation (builds in separate workspace by default)
- Parallel execution with Git worktrees
- Smart recovery from interruptions
- Linear integration for project management

Usage:
    python auto-claude/run.py --spec 001-initial-app
    python auto-claude/run.py --spec 001
    python auto-claude/run.py --list

    # Workspace management
    python auto-claude/run.py --spec 001 --merge     # Add completed build to project
    python auto-claude/run.py --spec 001 --review    # See what was built
    python auto-claude/run.py --spec 001 --discard   # Delete build (requires confirmation)

Prerequisites:
    - CLAUDE_CODE_OAUTH_TOKEN environment variable set (run: claude setup-token)
    - Spec created via: claude /spec
    - Claude Code CLI installed
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Add auto-claude directory to path for imports
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

# Load .env file - check both auto-claude/ and dev/auto-claude/ locations
from dotenv import load_dotenv
env_file = SCRIPT_DIR / ".env"
dev_env_file = SCRIPT_DIR.parent / "dev" / "auto-claude" / ".env"
if env_file.exists():
    load_dotenv(env_file)
elif dev_env_file.exists():
    load_dotenv(dev_env_file)

from agent import run_autonomous_agent, run_followup_planner, sync_plan_to_source
from progress import count_subtasks, print_paused_banner, is_build_complete
from linear_updater import is_linear_enabled, LinearTaskState
from linear_integration import LinearManager
from graphiti_config import is_graphiti_enabled, get_graphiti_status
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
    print_header,
    print_status,
    print_key_value,
    select_menu,
    MenuOption,
    StatusManager,
    BuildState,
)
from workspace import (
    WorkspaceMode,
    WorkspaceChoice,
    choose_workspace,
    setup_workspace,
    finalize_workspace,
    handle_workspace_choice,
    merge_existing_build,
    review_existing_build,
    discard_existing_build,
    check_existing_build,
    get_existing_build_worktree,
    list_all_worktrees,
    cleanup_all_worktrees,
)
from worktree import WorktreeManager
from debug import (
    debug,
    debug_detailed,
    debug_verbose,
    debug_success,
    debug_error,
    debug_warning,
    debug_section,
    is_debug_enabled,
)
from qa_loop import (
    run_qa_validation_loop,
    should_run_qa,
    is_qa_approved,
    print_qa_status,
)
from review import ReviewState, display_review_status
from init import init_auto_claude_dir


# Configuration
DEFAULT_MODEL = "claude-opus-4-5-20251101"


def collect_followup_task(spec_dir: Path, max_retries: int = 3) -> str | None:
    """
    Collect a follow-up task description from the user.

    Provides multiple input methods (type, paste, file) similar to the
    HUMAN_INPUT.md pattern used during build interrupts. Includes retry
    logic for empty input.

    Args:
        spec_dir: The spec directory where FOLLOWUP_REQUEST.md will be saved
        max_retries: Maximum number of times to prompt on empty input (default: 3)

    Returns:
        The collected task description, or None if cancelled
    """
    retry_count = 0

    while retry_count < max_retries:
        # Present options menu
        options = [
            MenuOption(
                key="type",
                label="Type follow-up task",
                icon=Icons.EDIT,
                description="Enter a description of additional work needed",
            ),
            MenuOption(
                key="paste",
                label="Paste from clipboard",
                icon=Icons.CLIPBOARD,
                description="Paste text you've copied (Cmd+V / Ctrl+Shift+V)",
            ),
            MenuOption(
                key="file",
                label="Read from file",
                icon=Icons.DOCUMENT,
                description="Load task description from a text file",
            ),
            MenuOption(
                key="quit",
                label="Cancel",
                icon=Icons.DOOR,
                description="Exit without adding follow-up",
            ),
        ]

        # Show retry message if this is a retry
        subtitle = "Describe the additional work you want to add to this spec."
        if retry_count > 0:
            subtitle = warning(f"Empty input received. Please try again. ({max_retries - retry_count} attempts remaining)")

        choice = select_menu(
            title="How would you like to provide your follow-up task?",
            options=options,
            subtitle=subtitle,
            allow_quit=False,  # We have explicit quit option
        )

        if choice == 'quit' or choice is None:
            return None

        followup_task = ""

        if choice == 'file':
            # Read from file
            print()
            print(f"{icon(Icons.DOCUMENT)} Enter the path to your task description file:")
            try:
                file_path_str = input(f"  {icon(Icons.POINTER)} ").strip()
            except (KeyboardInterrupt, EOFError):
                print()
                print_status("Cancelled.", "warning")
                return None

            # Handle empty file path
            if not file_path_str:
                print()
                print_status("No file path provided.", "warning")
                retry_count += 1
                continue

            try:
                # Expand ~ and resolve path
                file_path = Path(file_path_str).expanduser().resolve()
                if file_path.exists():
                    followup_task = file_path.read_text().strip()
                    if followup_task:
                        print_status(f"Loaded {len(followup_task)} characters from file", "success")
                    else:
                        print()
                        print_status("File is empty. Please provide a file with task description.", "error")
                        retry_count += 1
                        continue
                else:
                    print_status(f"File not found: {file_path}", "error")
                    print(muted(f"  Check that the path is correct and the file exists."))
                    retry_count += 1
                    continue
            except PermissionError:
                print_status(f"Permission denied: cannot read {file_path_str}", "error")
                print(muted(f"  Check file permissions and try again."))
                retry_count += 1
                continue
            except Exception as e:
                print_status(f"Error reading file: {e}", "error")
                retry_count += 1
                continue

        elif choice in ['type', 'paste']:
            print()
            content = [
                "Enter/paste your follow-up task description below.",
                "",
                muted("Describe what additional work you want to add."),
                muted("The planner will create new subtasks based on this."),
                "",
                muted("Press Enter on an empty line when done."),
            ]
            print(box(content, width=60, style="light"))
            print()

            lines = []
            empty_count = 0
            while True:
                try:
                    line = input()
                    if line == "":
                        empty_count += 1
                        if empty_count >= 1:  # Stop on first empty line
                            break
                    else:
                        empty_count = 0
                        lines.append(line)
                except KeyboardInterrupt:
                    print()
                    print_status("Cancelled.", "warning")
                    return None
                except EOFError:
                    break

            followup_task = "\n".join(lines).strip()

        # Validate that we have content
        if not followup_task:
            print()
            print_status("No task description provided.", "warning")
            retry_count += 1
            continue

        # Save to FOLLOWUP_REQUEST.md
        request_file = spec_dir / "FOLLOWUP_REQUEST.md"
        request_file.write_text(followup_task)

        # Show confirmation
        content = [
            success(f"{icon(Icons.SUCCESS)} FOLLOW-UP TASK SAVED"),
            "",
            f"Saved to: {highlight(str(request_file.name))}",
            "",
            muted("The planner will create new subtasks based on this task."),
        ]
        print()
        print(box(content, width=70, style="heavy"))

        return followup_task

    # Max retries exceeded
    print()
    print_status("Maximum retry attempts reached. Follow-up cancelled.", "error")
    return None


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


def list_specs(project_dir: Path, dev_mode: bool = False) -> list[dict]:
    """
    List all specs in the project.

    Args:
        project_dir: Project root directory
        dev_mode: If True, use dev/auto-claude/specs/

    Returns:
        List of spec info dicts with keys: number, name, path, status, progress
    """
    specs_dir = get_specs_dir(project_dir, dev_mode)
    specs = []

    if not specs_dir.exists():
        return specs

    for spec_folder in sorted(specs_dir.iterdir()):
        if not spec_folder.is_dir():
            continue

        # Parse folder name (e.g., "001-initial-app")
        folder_name = spec_folder.name
        parts = folder_name.split("-", 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue

        number = parts[0]
        name = parts[1]

        # Check for spec.md
        spec_file = spec_folder / "spec.md"
        if not spec_file.exists():
            continue

        # Check for existing build in worktree
        has_build = get_existing_build_worktree(project_dir, folder_name) is not None

        # Check progress via implementation_plan.json
        plan_file = spec_folder / "implementation_plan.json"
        if plan_file.exists():
            completed, total = count_subtasks(spec_folder)
            if total > 0:
                if completed == total:
                    status = "complete"
                else:
                    status = "in_progress"
                progress = f"{completed}/{total}"
            else:
                status = "initialized"
                progress = "0/0"
        else:
            status = "pending"
            progress = "-"

        # Add build indicator
        if has_build:
            status = f"{status} (has build)"

        specs.append({
            "number": number,
            "name": name,
            "folder": folder_name,
            "path": spec_folder,
            "status": status,
            "progress": progress,
            "has_build": has_build,
        })

    return specs


def find_spec(project_dir: Path, spec_identifier: str, dev_mode: bool = False) -> Path | None:
    """
    Find a spec by number or full name.

    Args:
        project_dir: Project root directory
        spec_identifier: Either "001" or "001-feature-name"
        dev_mode: If True, use dev/auto-claude/specs/

    Returns:
        Path to spec folder, or None if not found
    """
    specs_dir = get_specs_dir(project_dir, dev_mode)

    if not specs_dir.exists():
        return None

    # Try exact match first
    exact_path = specs_dir / spec_identifier
    if exact_path.exists() and (exact_path / "spec.md").exists():
        return exact_path

    # Try matching by number prefix
    for spec_folder in specs_dir.iterdir():
        if spec_folder.is_dir() and spec_folder.name.startswith(spec_identifier + "-"):
            if (spec_folder / "spec.md").exists():
                return spec_folder

    return None


def print_specs_list(project_dir: Path, dev_mode: bool = False) -> None:
    """Print a formatted list of all specs."""
    specs = list_specs(project_dir, dev_mode)

    if not specs:
        print("\nNo specs found.")
        print("\nCreate your first spec:")
        print("  claude /spec")
        return

    print("\n" + "=" * 70)
    print("  AVAILABLE SPECS")
    print("=" * 70)
    print()

    # Status symbols
    status_symbols = {
        "complete": "[OK]",
        "in_progress": "[..]",
        "initialized": "[--]",
        "pending": "[  ]",
    }

    for spec in specs:
        # Get base status for symbol
        base_status = spec["status"].split(" ")[0]
        symbol = status_symbols.get(base_status, "[??]")

        print(f"  {symbol} {spec['folder']}")
        status_line = f"       Status: {spec['status']} | Subtasks: {spec['progress']}"
        print(status_line)
        print()

    print("-" * 70)
    print("\nTo run a spec:")
    print("  python auto-claude/run.py --spec 001")
    print("  python auto-claude/run.py --spec 001-feature-name")
    print()


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Auto Claude Framework - Autonomous multi-session coding agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all specs
  python auto-claude/run.py --list

  # Run a specific spec (by number or full name)
  python auto-claude/run.py --spec 001
  python auto-claude/run.py --spec 001-initial-app

  # Workspace management (after build completes)
  python auto-claude/run.py --spec 001 --merge     # Add build to your project
  python auto-claude/run.py --spec 001 --review    # See what was built
  python auto-claude/run.py --spec 001 --discard   # Delete build (with confirmation)

  # Advanced options
  python auto-claude/run.py --spec 001 --direct       # Skip workspace isolation
  python auto-claude/run.py --spec 001 --isolated     # Force workspace isolation

  # Status checks
  python auto-claude/run.py --spec 001 --review-status  # Check human review status
  python auto-claude/run.py --spec 001 --qa-status      # Check QA validation status

Prerequisites:
  1. Create a spec first: claude /spec
  2. Run 'claude setup-token' and set CLAUDE_CODE_OAUTH_TOKEN

Environment Variables:
  CLAUDE_CODE_OAUTH_TOKEN  Your Claude Code OAuth token (required)
                           Get it by running: claude setup-token
  AUTO_BUILD_MODEL         Override default model (optional)
        """,
    )

    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available specs and their status",
    )

    parser.add_argument(
        "--spec",
        type=str,
        default=None,
        help="Spec to run (e.g., '001' or '001-feature-name')",
    )

    parser.add_argument(
        "--project-dir",
        type=Path,
        default=None,
        help="Project directory (default: current working directory)",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Maximum number of agent sessions (default: unlimited)",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=os.environ.get("AUTO_BUILD_MODEL", DEFAULT_MODEL),
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output",
    )

    # Workspace options
    workspace_group = parser.add_mutually_exclusive_group()
    workspace_group.add_argument(
        "--isolated",
        action="store_true",
        help="Force building in isolated workspace (safer)",
    )
    workspace_group.add_argument(
        "--direct",
        action="store_true",
        help="Build directly in your project (no isolation)",
    )

    # Build management commands
    build_group = parser.add_mutually_exclusive_group()
    build_group.add_argument(
        "--merge",
        action="store_true",
        help="Merge an existing build into your project",
    )
    build_group.add_argument(
        "--review",
        action="store_true",
        help="Review what an existing build contains",
    )
    build_group.add_argument(
        "--discard",
        action="store_true",
        help="Discard an existing build (requires confirmation)",
    )

    # Merge options
    parser.add_argument(
        "--no-commit",
        action="store_true",
        help="With --merge: stage changes but don't commit (review in IDE first)",
    )

    # QA options
    parser.add_argument(
        "--qa",
        action="store_true",
        help="Run QA validation loop on a completed build",
    )
    parser.add_argument(
        "--qa-status",
        action="store_true",
        help="Show QA validation status for a spec",
    )
    parser.add_argument(
        "--skip-qa",
        action="store_true",
        help="Skip automatic QA validation after build completes",
    )

    # Follow-up options
    parser.add_argument(
        "--followup",
        action="store_true",
        help="Add follow-up tasks to a completed spec (extends existing implementation plan)",
    )

    # Review options
    parser.add_argument(
        "--review-status",
        action="store_true",
        help="Show human review/approval status for a spec",
    )

    # Dev mode (deprecated)
    parser.add_argument(
        "--dev",
        action="store_true",
        help="[Deprecated] No longer has any effect - kept for compatibility",
    )

    # Non-interactive mode (for UI/automation)
    parser.add_argument(
        "--auto-continue",
        action="store_true",
        help="Non-interactive mode: auto-continue existing builds, skip prompts (for UI integration)",
    )

    # Worktree management
    parser.add_argument(
        "--list-worktrees",
        action="store_true",
        help="List all spec worktrees and their status",
    )
    parser.add_argument(
        "--cleanup-worktrees",
        action="store_true",
        help="Remove all spec worktrees and their branches (with confirmation)",
    )

    # Force bypass
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip approval check and start build anyway (for debugging)",
    )

    return parser.parse_args()


def validate_environment(spec_dir: Path) -> bool:
    """
    Validate that the environment is set up correctly.

    Returns:
        True if valid, False otherwise (with error messages printed)
    """
    valid = True

    # Check for Claude Code OAuth token
    if not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        print("Error: CLAUDE_CODE_OAUTH_TOKEN environment variable not set")
        print("\nGet your OAuth token by running:")
        print("  claude setup-token")
        print("\nThen set it:")
        print("  export CLAUDE_CODE_OAUTH_TOKEN='your-token-here'")
        valid = False

    # Check for spec.md in spec directory
    spec_file = spec_dir / "spec.md"
    if not spec_file.exists():
        print(f"\nError: spec.md not found in {spec_dir}")
        valid = False

    # Check Linear integration (optional but show status)
    if is_linear_enabled():
        print("Linear integration: ENABLED")
        # Show Linear project status if initialized
        project_dir = spec_dir.parent.parent  # auto-claude/specs/001-name -> project root
        linear_manager = LinearManager(spec_dir, project_dir)
        if linear_manager.is_initialized:
            summary = linear_manager.get_progress_summary()
            print(f"  Project: {summary.get('project_name', 'Unknown')}")
            print(f"  Issues: {summary.get('mapped_subtasks', 0)}/{summary.get('total_subtasks', 0)} mapped")
        else:
            print("  Status: Will be initialized during planner session")
    else:
        print("Linear integration: DISABLED (set LINEAR_API_KEY to enable)")

    # Check Graphiti integration (optional but show status)
    graphiti_status = get_graphiti_status()
    if graphiti_status["available"]:
        print("Graphiti memory: ENABLED")
        print(f"  Database: {graphiti_status['database']}")
        print(f"  Host: {graphiti_status['host']}:{graphiti_status['port']}")
    elif graphiti_status["enabled"]:
        print(f"Graphiti memory: CONFIGURED but unavailable ({graphiti_status['reason']})")
    else:
        print("Graphiti memory: DISABLED (set GRAPHITI_ENABLED=true to enable)")

    print()
    return valid


def print_banner() -> None:
    """Print the Auto-Build banner."""
    content = [
        bold(f"{icon(Icons.LIGHTNING)} AUTO-BUILD FRAMEWORK"),
        "",
        "Autonomous Multi-Session Coding Agent",
        muted("Subtask-Based Implementation with Phase Dependencies"),
    ]
    print()
    print(box(content, width=70, style="heavy"))


def main() -> None:
    """Main entry point."""
    args = parse_args()

    debug_section("run.py", "Starting Auto-Build Framework")
    debug("run.py", "Arguments parsed", args=vars(args))

    # Determine project directory
    if args.project_dir:
        project_dir = args.project_dir.resolve()
        debug("run.py", "Using provided project directory", project_dir=str(project_dir))
    else:
        project_dir = Path.cwd()
        debug("run.py", "Using current working directory", project_dir=str(project_dir))

        # Auto-detect if running from within auto-claude directory (the source code)
        if project_dir.name == "auto-claude" and (project_dir / "run.py").exists():
            # Running from within auto-claude/ source directory, go up 1 level
            project_dir = project_dir.parent

    # Note: --dev flag is deprecated but kept for API compatibility
    if args.dev:
        print(f"\n{icon(Icons.GEAR)} Note: --dev flag is deprecated. All specs now use .auto-claude/specs/\n")

    # Handle --list
    if args.list:
        print_banner()
        print_specs_list(project_dir, args.dev)
        return

    # Handle --list-worktrees
    if args.list_worktrees:
        print_banner()
        print("\n" + "=" * 70)
        print("  SPEC WORKTREES")
        print("=" * 70)
        print()

        worktrees = list_all_worktrees(project_dir)
        if not worktrees:
            print("  No worktrees found.")
            print()
            print("  Worktrees are created when you run a build in isolated mode.")
        else:
            for wt in worktrees:
                print(f"  {icon(Icons.FOLDER)} {wt.spec_name}")
                print(f"       Branch: {wt.branch}")
                print(f"       Path: {wt.path}")
                print(f"       Commits: {wt.commit_count}, Files: {wt.files_changed}")
                print()

            print("-" * 70)
            print()
            print("  To merge:   python auto-claude/run.py --spec <name> --merge")
            print("  To review:  python auto-claude/run.py --spec <name> --review")
            print("  To discard: python auto-claude/run.py --spec <name> --discard")
            print()
            print("  To cleanup all worktrees: python auto-claude/run.py --cleanup-worktrees")
        print()
        return

    # Handle --cleanup-worktrees
    if args.cleanup_worktrees:
        print_banner()
        cleanup_all_worktrees(project_dir, confirm=True)
        return

    # Require --spec if not listing
    if not args.spec:
        print_banner()
        print("\nError: --spec is required")
        print("\nUsage:")
        print("  python auto-claude/run.py --list           # See all specs")
        print("  python auto-claude/run.py --spec 001       # Run a spec")
        print("\nCreate a new spec with:")
        print("  claude /spec")
        sys.exit(1)

    # Find the spec
    debug("run.py", "Finding spec", spec_identifier=args.spec, dev_mode=args.dev)
    spec_dir = find_spec(project_dir, args.spec, args.dev)
    if not spec_dir:
        debug_error("run.py", "Spec not found", spec=args.spec)
        print_banner()
        print(f"\nError: Spec '{args.spec}' not found")
        print("\nAvailable specs:")
        print_specs_list(project_dir, args.dev)
        sys.exit(1)

    debug_success("run.py", "Spec found", spec_dir=str(spec_dir))

    # Handle build management commands
    if args.merge:
        merge_existing_build(project_dir, spec_dir.name, no_commit=args.no_commit)
        return

    if args.review:
        review_existing_build(project_dir, spec_dir.name)
        return

    if args.discard:
        discard_existing_build(project_dir, spec_dir.name)
        return

    # Handle QA commands
    if args.qa_status:
        print_banner()
        print(f"\nSpec: {spec_dir.name}\n")
        print_qa_status(spec_dir)
        return

    # Handle review status command
    if args.review_status:
        print_banner()
        print(f"\nSpec: {spec_dir.name}\n")
        display_review_status(spec_dir)
        # Also show if approval is valid for build
        review_state = ReviewState.load(spec_dir)
        print()
        if review_state.is_approval_valid(spec_dir):
            print(success(f"{icon(Icons.SUCCESS)} Ready to build - approval is valid."))
        elif review_state.approved:
            print(warning(f"{icon(Icons.WARNING)} Spec changed since approval - re-review required."))
        else:
            print(info(f"{icon(Icons.INFO)} Review required before building."))
        print()
        return

    if args.qa:
        # Run QA validation loop directly
        print_banner()
        print(f"\nRunning QA validation for: {spec_dir.name}")
        if not validate_environment(spec_dir):
            sys.exit(1)

        if not should_run_qa(spec_dir):
            if is_qa_approved(spec_dir):
                print("\n✅ Build already approved by QA.")
            else:
                completed, total = count_subtasks(spec_dir)
                print(f"\n❌ Build not complete ({completed}/{total} subtasks).")
                print("Complete all subtasks before running QA validation.")
            return

        try:
            approved = asyncio.run(
                run_qa_validation_loop(
                    project_dir=project_dir,
                    spec_dir=spec_dir,
                    model=args.model,
                    verbose=args.verbose,
                )
            )
            if approved:
                print("\n✅ QA validation passed. Ready for merge.")
            else:
                print("\n❌ QA validation incomplete. See reports for details.")
                sys.exit(1)
        except KeyboardInterrupt:
            print("\n\nQA validation paused.")
            print(f"Resume with: python auto-claude/run.py --spec {spec_dir.name} --qa")
        return

    # Handle --followup command
    if args.followup:
        print_banner()
        print(f"\nFollow-up request for: {spec_dir.name}")

        # Check if implementation_plan.json exists
        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            print()
            print(error(f"{icon(Icons.ERROR)} No implementation plan found."))
            print()
            content = [
                "This spec has not been built yet.",
                "",
                "Follow-up tasks can only be added to specs that have been",
                "built at least once. Run a regular build first:",
                "",
                highlight(f"  python auto-claude/run.py --spec {spec_dir.name}"),
                "",
                muted("After the build completes, you can add follow-up tasks."),
            ]
            print(box(content, width=70, style="light"))
            sys.exit(1)

        # Check if build is complete
        if not is_build_complete(spec_dir):
            completed, total = count_subtasks(spec_dir)
            pending = total - completed
            print()
            print(error(f"{icon(Icons.ERROR)} Build not complete ({completed}/{total} subtasks)."))
            print()
            content = [
                f"There are still {pending} pending subtask(s) to complete.",
                "",
                "Follow-up tasks can only be added after all current subtasks",
                "are finished. Complete the current build first:",
                "",
                highlight(f"  python auto-claude/run.py --spec {spec_dir.name}"),
                "",
                muted("The build will continue from where it left off."),
            ]
            print(box(content, width=70, style="light"))
            sys.exit(1)

        # Check for prior follow-ups (for sequential follow-up context)
        prior_followup_count = 0
        try:
            with open(plan_file, "r") as f:
                plan_data = json.load(f)
            phases = plan_data.get("phases", [])
            # Count phases that look like follow-up phases (name contains "Follow" or high phase number)
            for phase in phases:
                phase_name = phase.get("name", "")
                if "follow" in phase_name.lower() or "followup" in phase_name.lower():
                    prior_followup_count += 1
        except (json.JSONDecodeError, KeyError):
            pass  # If plan parsing fails, just continue without prior count

        # Build is complete - proceed to follow-up workflow
        print()
        if prior_followup_count > 0:
            print(success(f"{icon(Icons.SUCCESS)} Build is complete ({prior_followup_count} prior follow-up(s)). Ready for more follow-up tasks."))
        else:
            print(success(f"{icon(Icons.SUCCESS)} Build is complete. Ready for follow-up tasks."))

        # Collect follow-up task from user
        followup_task = collect_followup_task(spec_dir)

        if followup_task is None:
            # User cancelled
            print()
            print_status("Follow-up cancelled.", "info")
            return

        # Successfully collected follow-up task
        # The collect_followup_task() function already saved to FOLLOWUP_REQUEST.md
        # Now run the follow-up planner to add new subtasks
        print()

        if not validate_environment(spec_dir):
            sys.exit(1)

        try:
            success = asyncio.run(
                run_followup_planner(
                    project_dir=project_dir,
                    spec_dir=spec_dir,
                    model=args.model,
                    verbose=args.verbose,
                )
            )

            if success:
                # Show next steps after successful planning
                content = [
                    bold(f"{icon(Icons.SUCCESS)} FOLLOW-UP PLANNING COMPLETE"),
                    "",
                    "New subtasks have been added to your implementation plan.",
                    "",
                    highlight("To continue building:"),
                    f"  python auto-claude/run.py --spec {spec_dir.name}",
                ]
                print(box(content, width=70, style="heavy"))
            else:
                # Planning didn't fully succeed
                content = [
                    bold(f"{icon(Icons.WARNING)} FOLLOW-UP PLANNING INCOMPLETE"),
                    "",
                    "Check the implementation plan manually.",
                    "",
                    muted("You may need to run the follow-up again."),
                ]
                print(box(content, width=70, style="light"))
                sys.exit(1)

        except KeyboardInterrupt:
            print("\n\nFollow-up planning paused.")
            print(f"To retry: python auto-claude/run.py --spec {spec_dir.name} --followup")
            sys.exit(0)
        except Exception as e:
            print()
            print(error(f"{icon(Icons.ERROR)} Follow-up planning error: {e}"))
            if args.verbose:
                import traceback
                traceback.print_exc()
            sys.exit(1)

        return

    # Normal build flow
    print_banner()
    print(f"\nProject directory: {project_dir}")
    print(f"Spec: {spec_dir.name}")
    print(f"Model: {args.model}")

    if args.max_iterations:
        print(f"Max iterations: {args.max_iterations}")
    else:
        print("Max iterations: Unlimited (runs until all subtasks complete)")

    print()

    # Validate environment
    if not validate_environment(spec_dir):
        sys.exit(1)

    # Check human review approval
    review_state = ReviewState.load(spec_dir)
    if not review_state.is_approval_valid(spec_dir):
        if args.force:
            # User explicitly bypassed approval check
            print()
            print(warning(f"{icon(Icons.WARNING)} WARNING: Bypassing approval check with --force"))
            print(muted("This spec has not been approved for building."))
            print()
        else:
            print()
            content = [
                bold(f"{icon(Icons.WARNING)} BUILD BLOCKED - REVIEW REQUIRED"),
                "",
                "This spec requires human approval before building.",
            ]

            if review_state.approved and not review_state.is_approval_valid(spec_dir):
                # Spec changed after approval
                content.append("")
                content.append(warning("The spec has been modified since approval."))
                content.append("Please re-review and re-approve.")

            content.extend([
                "",
                highlight("To review and approve:"),
                f"  python auto-claude/review.py --spec-dir {spec_dir}",
                "",
                muted("Or use --force to bypass this check (not recommended)."),
            ])
            print(box(content, width=70, style="heavy"))
            print()
            sys.exit(1)
    else:
        debug_success("run.py", "Review approval validated", approved_by=review_state.approved_by)

    # Check for existing build
    if get_existing_build_worktree(project_dir, spec_dir.name):
        if args.auto_continue:
            # Non-interactive mode: auto-continue with existing build
            debug("run.py", "Auto-continue mode: continuing with existing build")
            print("Auto-continue: Resuming existing build...")
        else:
            continue_existing = check_existing_build(project_dir, spec_dir.name)
            if continue_existing:
                # Continue with existing worktree
                pass
            else:
                # User chose to start fresh or merged existing
                pass

    # Choose workspace (skip for parallel mode - it always uses worktrees)
    working_dir = project_dir
    worktree_manager = None
    source_spec_dir = None  # Track original spec dir for syncing back from worktree

    # Let user choose workspace mode (or auto-select if --auto-continue)
    workspace_mode = choose_workspace(
        project_dir,
        spec_dir.name,
        force_isolated=args.isolated,
        force_direct=args.direct,
        auto_continue=args.auto_continue,
    )

    if workspace_mode == WorkspaceMode.ISOLATED:
        # Keep reference to original spec directory for syncing progress back
        source_spec_dir = spec_dir

        working_dir, worktree_manager, localized_spec_dir = setup_workspace(
            project_dir, spec_dir.name, workspace_mode, source_spec_dir=spec_dir
        )
        # Use the localized spec directory (inside worktree) for AI access
        if localized_spec_dir:
            spec_dir = localized_spec_dir

    # Run the autonomous agent
    debug_section("run.py", "Starting Build Execution")
    debug("run.py", "Build configuration",
          model=args.model,
          workspace_mode=str(workspace_mode),
          working_dir=str(working_dir),
          spec_dir=str(spec_dir))

    try:
        debug("run.py", "Starting agent execution")

        asyncio.run(
            run_autonomous_agent(
                project_dir=working_dir,  # Use worktree if isolated
                spec_dir=spec_dir,
                model=args.model,
                max_iterations=args.max_iterations,
                verbose=args.verbose,
                source_spec_dir=source_spec_dir,  # For syncing progress back to main project
            )
        )
        debug_success("run.py", "Agent execution completed")

        # Run QA validation BEFORE finalization (while worktree still exists)
        # QA must sign off before the build is considered complete
        qa_approved = True  # Default to approved if QA is skipped
        if not args.skip_qa and should_run_qa(spec_dir):
            print("\n" + "=" * 70)
            print("  SUBTASKS COMPLETE - STARTING QA VALIDATION")
            print("=" * 70)
            print("\nAll subtasks completed. Now running QA validation loop...")
            print("This ensures production-quality output before sign-off.\n")

            try:
                qa_approved = asyncio.run(
                    run_qa_validation_loop(
                        project_dir=working_dir,
                        spec_dir=spec_dir,
                        model=args.model,
                        verbose=args.verbose,
                    )
                )

                if qa_approved:
                    print("\n" + "=" * 70)
                    print("  ✅ QA VALIDATION PASSED")
                    print("=" * 70)
                    print("\nAll acceptance criteria verified.")
                    print("The implementation is production-ready.\n")
                else:
                    print("\n" + "=" * 70)
                    print("  ⚠️  QA VALIDATION INCOMPLETE")
                    print("=" * 70)
                    print("\nSome issues require manual attention.")
                    print(f"See: {spec_dir / 'qa_report.md'}")
                    print(f"Or:  {spec_dir / 'QA_FIX_REQUEST.md'}")
                    print(f"\nResume QA: python auto-claude/run.py --spec {spec_dir.name} --qa\n")

                # Sync implementation plan to main project after QA
                # This ensures the main project has the latest status (human_review)
                if sync_plan_to_source(spec_dir, source_spec_dir):
                    debug_info("run.py", "Implementation plan synced to main project after QA")
            except KeyboardInterrupt:
                print("\n\nQA validation paused.")
                print(f"Resume: python auto-claude/run.py --spec {spec_dir.name} --qa")
                qa_approved = False

        # Post-build finalization (only for isolated sequential mode)
        # This happens AFTER QA validation so the worktree still exists
        if worktree_manager:
            choice = finalize_workspace(project_dir, spec_dir.name, worktree_manager, auto_continue=args.auto_continue)
            handle_workspace_choice(choice, project_dir, spec_dir.name, worktree_manager)

    except KeyboardInterrupt:
        # Print paused banner
        print_paused_banner(spec_dir, spec_dir.name, has_worktree=bool(worktree_manager))

        # Update status file
        status_manager = StatusManager(project_dir)
        status_manager.update(state=BuildState.PAUSED)

        # Offer to add human input with enhanced menu
        try:
            options = [
                MenuOption(
                    key="type",
                    label="Type instructions",
                    icon=Icons.EDIT,
                    description="Enter guidance for the agent's next session",
                ),
                MenuOption(
                    key="paste",
                    label="Paste from clipboard",
                    icon=Icons.CLIPBOARD,
                    description="Paste text you've copied (Cmd+V / Ctrl+Shift+V)",
                ),
                MenuOption(
                    key="file",
                    label="Read from file",
                    icon=Icons.DOCUMENT,
                    description="Load instructions from a text file",
                ),
                MenuOption(
                    key="skip",
                    label="Continue without instructions",
                    icon=Icons.SKIP,
                    description="Resume the build as-is",
                ),
                MenuOption(
                    key="quit",
                    label="Quit",
                    icon=Icons.DOOR,
                    description="Exit without resuming",
                ),
            ]

            choice = select_menu(
                title="What would you like to do?",
                options=options,
                subtitle="Progress saved. You can add instructions for the agent.",
                allow_quit=False,  # We have explicit quit option
            )

            if choice == 'quit' or choice is None:
                print()
                print_status("Exiting...", "info")
                status_manager.set_inactive()
                sys.exit(0)

            human_input = ""

            if choice == 'file':
                # Read from file
                print()
                print(f"{icon(Icons.DOCUMENT)} Enter the path to your instructions file:")
                file_path = input(f"  {icon(Icons.POINTER)} ").strip()

                if file_path:
                    try:
                        # Expand ~ and resolve path
                        file_path = Path(file_path).expanduser().resolve()
                        if file_path.exists():
                            human_input = file_path.read_text().strip()
                            print_status(f"Loaded {len(human_input)} characters from file", "success")
                        else:
                            print_status(f"File not found: {file_path}", "error")
                    except Exception as e:
                        print_status(f"Error reading file: {e}", "error")

            elif choice in ['type', 'paste']:
                print()
                content = [
                    "Enter/paste your instructions below.",
                    muted("Press Enter on an empty line when done."),
                ]
                print(box(content, width=60, style="light"))
                print()

                lines = []
                empty_count = 0
                while True:
                    try:
                        line = input()
                        if line == "":
                            empty_count += 1
                            if empty_count >= 1:  # Stop on first empty line
                                break
                        else:
                            empty_count = 0
                            lines.append(line)
                    except KeyboardInterrupt:
                        print()
                        print_status("Exiting without saving instructions...", "warning")
                        status_manager.set_inactive()
                        sys.exit(0)

                human_input = "\n".join(lines).strip()

            if human_input:
                # Save to HUMAN_INPUT.md
                input_file = spec_dir / "HUMAN_INPUT.md"
                input_file.write_text(human_input)

                content = [
                    success(f"{icon(Icons.SUCCESS)} INSTRUCTIONS SAVED"),
                    "",
                    f"Saved to: {highlight(str(input_file.name))}",
                    "",
                    muted("The agent will read and follow these instructions when you resume."),
                ]
                print()
                print(box(content, width=70, style="heavy"))
            elif choice != 'skip':
                print()
                print_status("No instructions provided.", "info")

            # If 'skip' was selected, actually resume the build
            if choice == 'skip':
                print()
                print_status("Resuming build...", "info")
                status_manager.update(state=BuildState.RUNNING)
                asyncio.run(
                    run_autonomous_agent(
                        project_dir=working_dir,
                        spec_dir=spec_dir,
                        model=args.model,
                        max_iterations=args.max_iterations,
                        verbose=args.verbose,
                    )
                )
                # Build completed or was interrupted again - exit
                sys.exit(0)

        except KeyboardInterrupt:
            # User pressed Ctrl+C again during input prompt - exit immediately
            print()
            print_status("Exiting...", "warning")
            status_manager = StatusManager(project_dir)
            status_manager.set_inactive()
            sys.exit(0)
        except EOFError:
            # stdin closed
            pass

        # Resume instructions (shown when user provided instructions or chose file/type/paste)
        print()
        content = [
            bold(f"{icon(Icons.PLAY)} TO RESUME"),
            "",
            f"Run: {highlight(f'python auto-claude/run.py --spec {spec_dir.name}')}",
        ]
        if worktree_manager:
            content.append("")
            content.append(muted("Your build is in a separate workspace and is safe."))
        print(box(content, width=70, style="light"))
        print()
    except Exception as e:
        print(f"\nFatal error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
