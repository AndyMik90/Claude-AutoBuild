"""
Build Commands
==============

CLI commands for building specs and handling the main build flow.
"""

import asyncio
import sys
from pathlib import Path

# Ensure parent directory is in path for imports (before other imports)
_PARENT_DIR = Path(__file__).parent.parent
if str(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_DIR))

# Import only what we need at module level
# Heavy imports are lazy-loaded in functions to avoid import errors
from progress import print_paused_banner
from review import ReviewState
from ui import (
    BuildState,
    Icons,
    MenuOption,
    StatusManager,
    bold,
    box,
    highlight,
    icon,
    muted,
    print_status,
    select_menu,
    success,
    warning,
)
from workspace import (
    WorkspaceMode,
    check_existing_build,
    choose_workspace,
    finalize_workspace,
    get_existing_build_worktree,
    handle_workspace_choice,
    setup_workspace,
)

from .input_handlers import (
    read_from_file,
    read_multiline_input,
)


def handle_build_command(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    max_iterations: int | None,
    verbose: bool,
    force_isolated: bool,
    force_direct: bool,
    auto_continue: bool,
    skip_qa: bool,
    force_bypass_approval: bool,
    base_branch: str | None = None,
) -> None:
    """
    Handle the main build command.

    Args:
        project_dir: Project root directory
        spec_dir: Spec directory path
        model: Model to use (used as default; may be overridden by task_metadata.json)
        max_iterations: Maximum number of iterations (None for unlimited)
        verbose: Enable verbose output
        force_isolated: Force isolated workspace mode
        force_direct: Force direct workspace mode
        auto_continue: Auto-continue mode (non-interactive)
        skip_qa: Skip automatic QA validation
        force_bypass_approval: Force bypass approval check
        base_branch: Base branch for worktree creation (default: current branch)
    """
    # Lazy imports to avoid loading heavy modules
    from agent import run_autonomous_agent, sync_plan_to_source
    from debug import (
        debug,
        debug_info,
        debug_section,
        debug_success,
    )
    from phase_config import get_phase_model
    from qa_loop import run_qa_validation_loop, should_run_qa

    from .utils import print_banner, validate_environment

    # Get the resolved model for the planning phase (first phase of build)
    # This respects task_metadata.json phase configuration from the UI
    planning_model = get_phase_model(spec_dir, "planning", model)
    coding_model = get_phase_model(spec_dir, "coding", model)
    qa_model = get_phase_model(spec_dir, "qa", model)

    print_banner()
    print(f"\nProject directory: {project_dir}")
    print(f"Spec: {spec_dir.name}")
    # Show phase-specific models if they differ
    if planning_model != coding_model or coding_model != qa_model:
        print(
            f"Models: Planning={planning_model.split('-')[1] if '-' in planning_model else planning_model}, "
            f"Coding={coding_model.split('-')[1] if '-' in coding_model else coding_model}, "
            f"QA={qa_model.split('-')[1] if '-' in qa_model else qa_model}"
        )
    else:
        print(f"Model: {planning_model}")

    if max_iterations:
        print(f"Max iterations: {max_iterations}")
    else:
        print("Max iterations: Unlimited (runs until all subtasks complete)")

    print()

    # Validate environment
    if not validate_environment(spec_dir):
        sys.exit(1)

    # Check human review approval
    review_state = ReviewState.load(spec_dir)
    if not review_state.is_approval_valid(spec_dir):
        if force_bypass_approval:
            # User explicitly bypassed approval check
            print()
            print(
                warning(
                    f"{icon(Icons.WARNING)} WARNING: Bypassing approval check with --force"
                )
            )
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

            content.extend(
                [
                    "",
                    highlight("To review and approve:"),
                    f"  python auto-claude/review.py --spec-dir {spec_dir}",
                    "",
                    muted("Or use --force to bypass this check (not recommended)."),
                ]
            )
            print(box(content, width=70, style="heavy"))
            print()
            sys.exit(1)
    else:
        debug_success(
            "run.py", "Review approval validated", approved_by=review_state.approved_by
        )

    # Check for existing build
    if get_existing_build_worktree(project_dir, spec_dir.name):
        if auto_continue:
            # Non-interactive mode: auto-continue with existing build
            debug("run.py", "Auto-continue mode: continuing with existing build")
            print("Auto-continue: Resuming existing build...")
        else:
            continue_existing = check_existing_build(project_dir, spec_dir.name)
            if continue_existing:
                # Continue with existing worktree

                # Check if validation recovery is needed for existing build
                if _check_validation_recovery_needed(spec_dir):
                    print()
                    print(
                        warning(
                            f"{icon(Icons.WARNING)} VALIDATION RECOVERY DETECTED"
                        )
                    )
                    print()
                    print(muted("Previous build has validation feedback that needs addressing."))
                    print(muted("Will attempt automatic recovery during the build process."))
                    print()

                    # Don't exit here - let the normal build process handle recovery
                    # when it reaches the QA validation phase
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
        force_isolated=force_isolated,
        force_direct=force_direct,
        auto_continue=auto_continue,
    )

    if workspace_mode == WorkspaceMode.ISOLATED:
        # Keep reference to original spec directory for syncing progress back
        source_spec_dir = spec_dir

        working_dir, worktree_manager, localized_spec_dir = setup_workspace(
            project_dir,
            spec_dir.name,
            workspace_mode,
            source_spec_dir=spec_dir,
            base_branch=base_branch,
        )
        # Use the localized spec directory (inside worktree) for AI access
        if localized_spec_dir:
            spec_dir = localized_spec_dir

    # Run the autonomous agent
    debug_section("run.py", "Starting Build Execution")
    debug(
        "run.py",
        "Build configuration",
        model=model,
        workspace_mode=str(workspace_mode),
        working_dir=str(working_dir),
        spec_dir=str(spec_dir),
    )

    try:
        debug("run.py", "Starting agent execution")

        asyncio.run(
            run_autonomous_agent(
                project_dir=working_dir,  # Use worktree if isolated
                spec_dir=spec_dir,
                model=model,
                max_iterations=max_iterations,
                verbose=verbose,
                source_spec_dir=source_spec_dir,  # For syncing progress back to main project
            )
        )
        debug_success("run.py", "Agent execution completed")

        # Run QA validation BEFORE finalization (while worktree still exists)
        # QA must sign off before the build is considered complete
        qa_approved = True  # Default to approved if QA is skipped
        if not skip_qa and should_run_qa(spec_dir):
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
                        model=model,
                        verbose=verbose,
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
                    print("  ⚠️  QA VALIDATION FAILED")
                    print("=" * 70)
                    print("\nAttempting automatic recovery with validation feedback...")

                    # Attempt validation failure recovery
                    recovery_successful = handle_validation_failure_recovery(
                        project_dir=working_dir,
                        spec_dir=spec_dir,
                        model=model,
                        max_iterations=max_iterations,
                        verbose=verbose,
                        worktree_manager=worktree_manager,
                        working_dir=working_dir,
                        source_spec_dir=source_spec_dir,
                    )

                    if recovery_successful:
                        # Recovery completed, run QA again to verify fixes
                        print("\n" + "=" * 70)
                        print("  🔄 RE-VALIDATING AFTER RECOVERY")
                        print("=" * 70)
                        print("\nRe-running QA validation to verify fixes...\n")

                        try:
                            qa_approved = asyncio.run(
                                run_qa_validation_loop(
                                    project_dir=working_dir,
                                    spec_dir=spec_dir,
                                    model=model,
                                    verbose=verbose,
                                )
                            )

                            if qa_approved:
                                print("\n" + "=" * 70)
                                print("  ✅ RECOVERY SUCCESSFUL - QA VALIDATION PASSED")
                                print("=" * 70)
                                print("\nAll validation issues have been resolved.")
                                print("The implementation is production-ready.\n")
                            else:
                                print("\n" + "=" * 70)
                                print("  ⚠️  RECOVERY INCOMPLETE - VALIDATION STILL FAILING")
                                print("=" * 70)
                                print("\nSome issues persist after recovery attempts.")
                                print(f"See: {spec_dir / 'qa_report.md'}")
                                print(f"Or:  {spec_dir / 'QA_FIX_REQUEST.md'}")
                                print(
                                    f"\nResume QA: python auto-claude/run.py --spec {spec_dir.name} --qa\n"
                                )
                        except KeyboardInterrupt:
                            print("\n\nQA validation paused after recovery.")
                            print(f"Resume: python auto-claude/run.py --spec {spec_dir.name} --qa")
                            qa_approved = False
                    else:
                        # Recovery failed or max attempts exceeded
                        print("\n" + "=" * 70)
                        print("  ❌ RECOVERY FAILED - ESCALATION REQUIRED")
                        print("=" * 70)
                        print("\nAutomatic recovery was unable to resolve validation issues.")
                        print(f"See: {spec_dir / 'VALIDATION_ESCALATION.md'}")
                        print(f"Or:  {spec_dir / 'qa_report.md'}")
                        print(
                            f"\nManual intervention required. Review feedback and run again:\n"
                            f"python auto-claude/run.py --spec {spec_dir.name}\n"
                        )

                # Sync implementation plan to main project after QA
                # This ensures the main project has the latest status (human_review)
                if sync_plan_to_source(spec_dir, source_spec_dir):
                    debug_info(
                        "run.py", "Implementation plan synced to main project after QA"
                    )
            except KeyboardInterrupt:
                print("\n\nQA validation paused.")
                print(f"Resume: python auto-claude/run.py --spec {spec_dir.name} --qa")
                qa_approved = False

        # Post-build finalization (only for isolated sequential mode)
        # This happens AFTER QA validation so the worktree still exists
        if worktree_manager:
            choice = finalize_workspace(
                project_dir,
                spec_dir.name,
                worktree_manager,
                auto_continue=auto_continue,
            )
            handle_workspace_choice(
                choice, project_dir, spec_dir.name, worktree_manager
            )

    except KeyboardInterrupt:
        _handle_build_interrupt(
            spec_dir=spec_dir,
            project_dir=project_dir,
            worktree_manager=worktree_manager,
            working_dir=working_dir,
            model=model,
            max_iterations=max_iterations,
            verbose=verbose,
        )
    except Exception as e:
        print(f"\nFatal error: {e}")
        if verbose:
            import traceback

            traceback.print_exc()
        sys.exit(1)


def _handle_build_interrupt(
    spec_dir: Path,
    project_dir: Path,
    worktree_manager,
    working_dir: Path,
    model: str,
    max_iterations: int | None,
    verbose: bool,
) -> None:
    """
    Handle keyboard interrupt during build.

    Args:
        spec_dir: Spec directory path
        project_dir: Project root directory
        worktree_manager: Worktree manager instance (if using isolated mode)
        working_dir: Current working directory
        model: Model being used
        max_iterations: Maximum iterations
        verbose: Verbose mode flag
    """
    from agent import run_autonomous_agent

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

        if choice == "quit" or choice is None:
            print()
            print_status("Exiting...", "info")
            status_manager.set_inactive()
            sys.exit(0)

        human_input = ""

        if choice == "file":
            # Read from file
            human_input = read_from_file()
            if human_input is None:
                human_input = ""

        elif choice in ["type", "paste"]:
            human_input = read_multiline_input("Enter/paste your instructions below.")
            if human_input is None:
                print()
                print_status("Exiting without saving instructions...", "warning")
                status_manager.set_inactive()
                sys.exit(0)

        if human_input:
            # Save to HUMAN_INPUT.md
            input_file = spec_dir / "HUMAN_INPUT.md"
            input_file.write_text(human_input)

            content = [
                success(f"{icon(Icons.SUCCESS)} INSTRUCTIONS SAVED"),
                "",
                f"Saved to: {highlight(str(input_file.name))}",
                "",
                muted(
                    "The agent will read and follow these instructions when you resume."
                ),
            ]
            print()
            print(box(content, width=70, style="heavy"))
        elif choice != "skip":
            print()
            print_status("No instructions provided.", "info")

        # If 'skip' was selected, actually resume the build
        if choice == "skip":
            print()
            print_status("Resuming build...", "info")
            status_manager.update(state=BuildState.RUNNING)
            asyncio.run(
                run_autonomous_agent(
                    project_dir=working_dir,
                    spec_dir=spec_dir,
                    model=model,
                    max_iterations=max_iterations,
                    verbose=verbose,
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


def handle_validation_failure_recovery(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    max_iterations: int | None,
    verbose: bool,
    worktree_manager=None,
    working_dir: Path | None = None,
    source_spec_dir: Path | None = None,
) -> bool:
    """
    Handle validation failure recovery by re-engaging the coder agent with QA feedback.

    Args:
        project_dir: Project root directory
        spec_dir: Spec directory path
        model: Model to use for recovery
        max_iterations: Maximum iterations for recovery
        verbose: Enable verbose output
        worktree_manager: Worktree manager instance (if using isolated mode)
        working_dir: Current working directory (defaults to project_dir if None)
        source_spec_dir: Original spec directory for syncing progress

    Returns:
        bool: True if recovery was successful, False if max retries exceeded or escalation needed
    """
    from agent import run_autonomous_agent
    from debug import debug, debug_info, debug_success, debug_warning
    from implementation_plan import ImplementationPlan
    from qa_loop import get_validation_feedback

    # Default working_dir to project_dir if not provided
    if working_dir is None:
        working_dir = project_dir

    # Load implementation plan to check recovery attempts
    plan = ImplementationPlan.load(spec_dir)

    # Get current recovery attempt count (initialize if not present)
    recovery_attempts = getattr(plan, 'validation_recovery_attempts', 0)
    max_recovery_attempts = 3  # Configurable retry limit

    debug(
        "build_commands.py",
        "Starting validation failure recovery",
        attempt=recovery_attempts + 1,
        max_attempts=max_recovery_attempts
    )

    if recovery_attempts >= max_recovery_attempts:
        debug_warning(
            "build_commands.py",
            "Max recovery attempts exceeded, escalating to human",
            attempts=recovery_attempts,
            max_attempts=max_recovery_attempts
        )

        # Create escalation report
        escalation_file = spec_dir / "VALIDATION_ESCALATION.md"
        escalation_content = [
            "# Validation Recovery Escalation",
            "",
            f"This build has exceeded the maximum validation recovery attempts ({max_recovery_attempts}).",
            "",
            "## What was attempted:",
            f"- {recovery_attempts} automatic recovery attempts",
            "- Each attempt incorporated QA feedback and re-engaged the coder agent",
            "",
            "## What requires human attention:",
            "1. Review the validation feedback in `qa_report.md`",
            "2. Review failed recovery attempts in recovery logs",
            "3. Determine if the implementation approach needs revision",
            "4. Consider modifying acceptance criteria if requirements are unclear",
            "",
            "## To resume after intervention:",
            f"```bash",
            f"python auto-claude/run.py --spec {spec_dir.name}",
            "```",
        ]
        escalation_file.write_text("\n".join(escalation_content))

        print()
        print(
            warning(
                f"{icon(Icons.WARNING)} MAX RECOVERY ATTEMPTS EXCEEDED"
            )
        )
        print()
        print(muted(f"Made {recovery_attempts} attempts to fix validation failures automatically."))
        print(muted("Human intervention required."))
        print()
        print(highlight(f"See: {escalation_file.name} for details"))
        print()

        return False

    # Increment recovery attempts
    plan.validation_recovery_attempts = recovery_attempts + 1
    plan.save()

    print()
    print(
        warning(
            f"{icon(Icons.WARNING)} VALIDATION FAILURE - ATTEMPTING RECOVERY"
        )
    )
    print()
    print(muted(f"Recovery attempt {plan.validation_recovery_attempts} of {max_recovery_attempts}"))
    print()

    # Get validation feedback to provide to the coder agent
    feedback_file = spec_dir / "qa_report.md"
    qa_fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    human_input_file = spec_dir / "HUMAN_INPUT.md"

    recovery_prompt = ["## VALIDATION RECOVERY"]
    recovery_prompt.append("")
    recovery_prompt.append("The previous implementation failed QA validation.")
    recovery_prompt.append("Please address the following feedback and fix the issues:")
    recovery_prompt.append("")

    # Add QA feedback if available
    if feedback_file.exists():
        qa_feedback = feedback_file.read_text()
        recovery_prompt.append("### QA Feedback:")
        recovery_prompt.append("")
        recovery_prompt.append(qa_feedback)
        recovery_prompt.append("")

    # Add specific fix requests if available
    if qa_fix_request_file.exists():
        fix_requests = qa_fix_request_file.read_text()
        recovery_prompt.append("### Specific Fix Requests:")
        recovery_prompt.append("")
        recovery_prompt.append(fix_requests)
        recovery_prompt.append("")

    # Add human input if available
    if human_input_file.exists():
        human_input = human_input_file.read_text()
        recovery_prompt.append("### Human Guidance:")
        recovery_prompt.append("")
        recovery_prompt.append(human_input)
        recovery_prompt.append("")

    recovery_prompt.append("## Instructions:")
    recovery_prompt.append("")
    recovery_prompt.append("1. Review all feedback carefully")
    recovery_prompt.append("2. Fix the identified issues")
    recovery_prompt.append("3. Ensure all acceptance criteria are met")
    recovery_prompt.append("4. Test your changes if applicable")
    recovery_prompt.append("")
    recovery_prompt.append(f"This is recovery attempt {plan.validation_recovery_attempts} of {max_recovery_attempts}.")
    recovery_prompt.append("If issues persist after the max attempts, this will be escalated for human review.")
    recovery_prompt.append("")

    # Save recovery prompt as HUMAN_INPUT.md for the agent to read
    recovery_input_file = spec_dir / "HUMAN_INPUT.md"
    recovery_input_file.write_text("\n".join(recovery_prompt))

    # Update status to indicate recovery is in progress
    status_manager = StatusManager(project_dir)
    status_manager.update(state=BuildState.RUNNING)

    print(muted("Engaging coder agent with validation feedback..."))
    print()

    try:
        # Re-engage the autonomous agent with recovery context
        asyncio.run(
            run_autonomous_agent(
                project_dir=working_dir,
                spec_dir=spec_dir,
                model=model,
                max_iterations=max_iterations,
                verbose=verbose,
                source_spec_dir=source_spec_dir,
            )
        )

        debug_success(
            "build_commands.py",
            "Validation recovery completed",
            attempt=plan.validation_recovery_attempts
        )

        # Clear recovery attempts on successful completion
        plan.validation_recovery_attempts = 0
        plan.save()

        print()
        print(success(f"{icon(Icons.SUCCESS)} RECOVERY COMPLETED"))
        print()
        print(muted("The coder agent has addressed the validation feedback."))
        print(muted("Running QA validation again to verify fixes..."))
        print()

        return True

    except Exception as e:
        debug_warning(
            "build_commands.py",
            "Validation recovery failed",
            attempt=plan.validation_recovery_attempts,
            error=str(e)
        )

        print()
        print(
            warning(
                f"{icon(Icons.WARNING)} RECOVERY ATTEMPT FAILED"
            )
        )
        print()
        print(muted(f"Recovery attempt {plan.validation_recovery_attempts} encountered an error: {e}"))
        print(muted("Will try again or escalate if max attempts reached."))
        print()

        # Don't increment again here - it's already incremented above
        return False


def _check_validation_recovery_needed(spec_dir: Path) -> bool:
    """
    Check if validation recovery is needed based on spec state.

    Args:
        spec_dir: Spec directory path

    Returns:
        bool: True if recovery is needed, False otherwise
    """
    qa_fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    human_input_file = spec_dir / "HUMAN_INPUT.md"

    # Check if there are active QA fix requests
    if qa_fix_request_file.exists():
        content = qa_fix_request_file.read_text()
        # Simple heuristic - if file has substantial content, recovery might be needed
        if len(content.strip()) > 50:  # More than just minimal content
            return True

    # Check if human input contains recovery instructions
    if human_input_file.exists():
        content = human_input_file.read_text()
        if "VALIDATION RECOVERY" in content or "validation feedback" in content.lower():
            return True

    return False


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
