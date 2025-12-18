#!/usr/bin/env python3
"""
Spec Creation Orchestrator
==========================

Dynamic spec creation with complexity-based phase selection.
The orchestrator uses AI to evaluate task complexity and adapts its process accordingly.

Complexity Assessment:
- By default, uses AI (complexity_assessor.md prompt) to analyze the task
- AI considers: scope, integrations, infrastructure, knowledge requirements, risk
- Falls back to heuristic analysis if AI assessment fails
- Use --no-ai-assessment to skip AI and use heuristics only

Complexity Tiers:
- SIMPLE (1-2 files): Discovery → Quick Spec → Validate (3 phases)
- STANDARD (3-10 files): Discovery → Requirements → Context → Spec → Plan → Validate (6 phases)
- STANDARD + Research: Same as above but with research phase for external dependencies (7 phases)
- COMPLEX (10+ files/integrations): Full 8-phase pipeline with research and self-critique

The AI considers:
- Number of files/services involved
- External integrations and research requirements
- Infrastructure changes (Docker, databases, etc.)
- Whether codebase has existing patterns to follow
- Risk factors and edge cases

Usage:
    python auto-claude/spec_runner.py --task "Add user authentication"
    python auto-claude/spec_runner.py --interactive
    python auto-claude/spec_runner.py --continue 001-feature
    python auto-claude/spec_runner.py --task "Fix button color" --complexity simple
    python auto-claude/spec_runner.py --task "Simple fix" --no-ai-assessment
"""

import asyncio
import os
import sys
from pathlib import Path

# Add auto-claude to path (parent of runners/)
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env file
from dotenv import load_dotenv

env_file = Path(__file__).parent.parent / ".env"
dev_env_file = Path(__file__).parent.parent.parent / "dev" / "auto-claude" / ".env"
if env_file.exists():
    load_dotenv(env_file)
elif dev_env_file.exists():
    load_dotenv(dev_env_file)

from review import ReviewState
from spec import SpecOrchestrator
from ui import Icons, highlight, icon, muted, print_section, print_status


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Dynamic spec creation with complexity-based phase selection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Complexity Tiers:
  simple    - 3 phases: Discovery → Quick Spec → Validate (1-2 files)
  standard  - 6 phases: Discovery → Requirements → Context → Spec → Plan → Validate
  complex   - 8 phases: Full pipeline with research and self-critique

Examples:
  # Simple UI fix (auto-detected as simple)
  python spec_runner.py --task "Fix button color in Header component"

  # Force simple mode
  python spec_runner.py --task "Update text" --complexity simple

  # Complex integration (auto-detected)
  python spec_runner.py --task "Add Graphiti memory integration with FalkorDB"

  # Interactive mode
  python spec_runner.py --interactive
        """,
    )
    parser.add_argument(
        "--task",
        type=str,
        help="Task description (what to build). For very long descriptions, use --task-file instead.",
    )
    parser.add_argument(
        "--task-file",
        type=Path,
        help="Read task description from a file (useful for long specs)",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Run in interactive mode (gather requirements from user)",
    )
    parser.add_argument(
        "--continue",
        dest="continue_spec",
        type=str,
        help="Continue an existing spec",
    )
    parser.add_argument(
        "--complexity",
        type=str,
        choices=["simple", "standard", "complex"],
        help="Override automatic complexity detection",
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="claude-opus-4-5-20251101",
        help="Model to use for agent phases",
    )
    parser.add_argument(
        "--no-ai-assessment",
        action="store_true",
        help="Use heuristic complexity assessment instead of AI (faster but less accurate)",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="[Deprecated] No longer has any effect - kept for compatibility",
    )
    parser.add_argument(
        "--no-build",
        action="store_true",
        help="Don't automatically start the build after spec creation (default: auto-start build)",
    )
    parser.add_argument(
        "--spec-dir",
        type=Path,
        help="Use existing spec directory instead of creating a new one (for UI integration)",
    )
    parser.add_argument(
        "--auto-approve",
        action="store_true",
        help="Skip human review checkpoint and automatically approve spec for building",
    )

    args = parser.parse_args()

    # Handle task from file if provided
    task_description = args.task
    if args.task_file:
        if not args.task_file.exists():
            print(f"Error: Task file not found: {args.task_file}")
            sys.exit(1)
        task_description = args.task_file.read_text().strip()
        if not task_description:
            print(f"Error: Task file is empty: {args.task_file}")
            sys.exit(1)

    # Validate task description isn't problematic
    if task_description:
        # Warn about very long descriptions but don't block
        if len(task_description) > 5000:
            print(
                f"Warning: Task description is very long ({len(task_description)} chars). Consider breaking into subtasks."
            )
        # Sanitize null bytes which could cause issues
        task_description = task_description.replace("\x00", "")

    # Find project root (look for auto-claude folder)
    project_dir = args.project_dir

    # Auto-detect if running from within auto-claude directory (the source code)
    if project_dir.name == "auto-claude" and (project_dir / "run.py").exists():
        # Running from within auto-claude/ source directory, go up 1 level
        project_dir = project_dir.parent
    elif not (project_dir / ".auto-claude").exists():
        # No .auto-claude folder found - try to find project root
        # First check for .auto-claude (installed instance)
        for parent in project_dir.parents:
            if (parent / ".auto-claude").exists():
                project_dir = parent
                break

    # Note: --dev flag is deprecated but kept for API compatibility
    if args.dev:
        print(
            f"\n{icon(Icons.GEAR)} Note: --dev flag is deprecated. All specs now go to .auto-claude/specs/\n"
        )

    orchestrator = SpecOrchestrator(
        project_dir=project_dir,
        task_description=task_description,
        spec_name=args.continue_spec,
        spec_dir=args.spec_dir,
        model=args.model,
        complexity_override=args.complexity,
        use_ai_assessment=not args.no_ai_assessment,
        dev_mode=args.dev,
    )

    try:
        success = asyncio.run(
            orchestrator.run(
                interactive=args.interactive or not task_description,
                auto_approve=args.auto_approve,
            )
        )

        if not success:
            sys.exit(1)

        # Auto-start build unless --no-build is specified
        if not args.no_build:
            # Verify spec is approved before starting build (defensive check)
            review_state = ReviewState.load(orchestrator.spec_dir)
            if not review_state.is_approved():
                print()
                print_status("Build cannot start: spec not approved.", "error")
                print()
                print(f"  {muted('To approve the spec, run:')}")
                print(
                    f"  {highlight(f'python auto-claude/review.py --spec-dir {orchestrator.spec_dir}')}"
                )
                print()
                print(
                    f"  {muted('Or re-run spec_runner with --auto-approve to skip review:')}"
                )
                example_cmd = 'python auto-claude/spec_runner.py --task "..." --auto-approve'
                print(f"  {highlight(example_cmd)}")
                sys.exit(1)

            print()
            print_section("STARTING BUILD", Icons.LIGHTNING)
            print()

            # Build the run.py command
            run_script = Path(__file__).parent.parent / "run.py"
            run_cmd = [
                sys.executable,
                str(run_script),
                "--spec",
                orchestrator.spec_dir.name,
                "--project-dir",
                str(orchestrator.project_dir),
                "--auto-continue",  # Non-interactive mode for chained execution
            ]

            # Pass through dev mode
            if args.dev:
                run_cmd.append("--dev")

            # Pass through model if not default
            if args.model != "claude-opus-4-5-20251101":
                run_cmd.extend(["--model", args.model])

            print(f"  {muted('Running:')} {' '.join(run_cmd)}")
            print()

            # Execute run.py - replace current process
            os.execv(sys.executable, run_cmd)

        sys.exit(0)

    except KeyboardInterrupt:
        print("\n\nSpec creation interrupted.")
        print(
            f"To continue: python auto-claude/spec_runner.py --continue {orchestrator.spec_dir.name}"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
