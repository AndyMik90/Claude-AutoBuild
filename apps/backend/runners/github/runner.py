#!/usr/bin/env python3
"""
GitHub Automation Runner
========================

CLI interface for GitHub automation features:
- PR Review: AI-powered code review
- Issue Triage: Classification, duplicate/spam detection
- Issue Auto-Fix: Automatic spec creation from issues
- Issue Batching: Group similar issues and create combined specs

Usage:
    # Review a specific PR
    python runner.py review-pr 123

    # Triage all open issues
    python runner.py triage --apply-labels

    # Triage specific issues
    python runner.py triage 1 2 3

    # Start auto-fix for an issue
    python runner.py auto-fix 456

    # Check for issues with auto-fix labels
    python runner.py check-auto-fix-labels

    # Show auto-fix queue
    python runner.py queue

    # Batch similar issues and create combined specs
    python runner.py batch-issues

    # Batch specific issues
    python runner.py batch-issues 1 2 3 4 5

    # Show batch status
    python runner.py batch-status
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

# Fix Windows console encoding for Unicode output (emojis, special chars)
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Load .env file with centralized error handling
from cli.utils import import_dotenv

load_dotenv = import_dotenv()

env_file = Path(__file__).parent.parent.parent / ".env"
if env_file.exists():
    load_dotenv(env_file)

from debug import debug_error

# Add github runner directory to path for direct imports
sys.path.insert(0, str(Path(__file__).parent))

# Now import models and orchestrator directly (they use relative imports internally)
from models import GitHubRunnerConfig
from orchestrator import GitHubOrchestrator, ProgressCallback


def print_progress(callback: ProgressCallback) -> None:
    """Print progress updates to console."""
    prefix = ""
    if callback.pr_number:
        prefix = f"[PR #{callback.pr_number}] "
    elif callback.issue_number:
        prefix = f"[Issue #{callback.issue_number}] "

    print(f"{prefix}[{callback.progress:3d}%] {callback.message}", flush=True)


def get_config(args) -> GitHubRunnerConfig:
    """Build config from CLI args and environment."""
    import shutil
    import subprocess

    token = args.token or os.environ.get("GITHUB_TOKEN", "")
    bot_token = args.bot_token or os.environ.get("GITHUB_BOT_TOKEN")
    repo = args.repo or os.environ.get("GITHUB_REPO", "")

    # Find gh CLI - use shutil.which for cross-platform support
    gh_path = shutil.which("gh")
    if not gh_path and sys.platform == "win32":
        # Fallback: check common Windows installation paths
        common_paths = [
            r"C:\Program Files\GitHub CLI\gh.exe",
            r"C:\Program Files (x86)\GitHub CLI\gh.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe"),
        ]
        for path in common_paths:
            if os.path.exists(path):
                gh_path = path
                break

    if os.environ.get("DEBUG"):
        print(f"[DEBUG] gh CLI path: {gh_path}", flush=True)
        print(
            f"[DEBUG] PATH env: {os.environ.get('PATH', 'NOT SET')[:200]}...",
            flush=True,
        )

    if not token and gh_path:
        # Try to get from gh CLI
        try:
            result = subprocess.run(
                [gh_path, "auth", "token"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                token = result.stdout.strip()
        except FileNotFoundError:
            pass  # gh not installed or not in PATH

    if not repo and gh_path:
        # Try to detect from git remote
        try:
            result = subprocess.run(
                [
                    gh_path,
                    "repo",
                    "view",
                    "--json",
                    "nameWithOwner",
                    "-q",
                    ".nameWithOwner",
                ],
                cwd=args.project,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                repo = result.stdout.strip()
            elif os.environ.get("DEBUG"):
                print(f"[DEBUG] gh repo view failed: {result.stderr}", flush=True)
        except FileNotFoundError:
            pass  # gh not installed or not in PATH

    if not token:
        print("Error: No GitHub token found. Set GITHUB_TOKEN or run 'gh auth login'")
        sys.exit(1)

    if not repo:
        print("Error: No GitHub repo found. Set GITHUB_REPO or run from a git repo.")
        sys.exit(1)

    return GitHubRunnerConfig(
        token=token,
        repo=repo,
        bot_token=bot_token,
        model=args.model,
        thinking_level=args.thinking_level,
        auto_fix_enabled=getattr(args, "auto_fix_enabled", False),
        auto_fix_labels=getattr(args, "auto_fix_labels", ["auto-fix"]),
        auto_post_reviews=getattr(args, "auto_post", False),
    )


async def cmd_review_pr(args) -> int:
    """Review a pull request."""
    import sys

    # Force unbuffered output so Electron sees it in real-time
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    debug = os.environ.get("DEBUG")
    if debug:
        print(f"[DEBUG] Starting PR review for PR #{args.pr_number}", flush=True)
        print(f"[DEBUG] Project directory: {args.project}", flush=True)
        print("[DEBUG] Building config...", flush=True)

    config = get_config(args)

    if debug:
        print(
            f"[DEBUG] Config built: repo={config.repo}, model={config.model}",
            flush=True,
        )
        print("[DEBUG] Creating orchestrator...", flush=True)

    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    if debug:
        print("[DEBUG] Orchestrator created", flush=True)
        print(
            f"[DEBUG] Calling orchestrator.review_pr({args.pr_number})...", flush=True
        )

    # Pass force_review flag if --force was specified
    force_review = getattr(args, "force", False)
    result = await orchestrator.review_pr(args.pr_number, force_review=force_review)

    if debug:
        print(f"[DEBUG] review_pr returned, success={result.success}", flush=True)

    if result.success:
        print(f"\n{'=' * 60}")
        print(f"PR #{result.pr_number} Review Complete")
        print(f"{'=' * 60}")
        print(f"Status: {result.overall_status}")
        print(f"Summary: {result.summary}")
        print(f"Findings: {len(result.findings)}")

        if result.findings:
            print("\nFindings by severity:")
            for f in result.findings:
                emoji = {"critical": "!", "high": "*", "medium": "-", "low": "."}
                print(
                    f"  {emoji.get(f.severity.value, '?')} [{f.severity.value.upper()}] {f.title}"
                )
                print(f"    File: {f.file}:{f.line}")
        return 0
    else:
        print(f"\nReview failed: {result.error}")
        return 1


async def cmd_followup_review_pr(args) -> int:
    """Perform a follow-up review of a pull request."""
    import sys

    # Force unbuffered output so Electron sees it in real-time
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    debug = os.environ.get("DEBUG")
    if debug:
        print(f"[DEBUG] Starting follow-up review for PR #{args.pr_number}", flush=True)
        print(f"[DEBUG] Project directory: {args.project}", flush=True)
        print("[DEBUG] Building config...", flush=True)

    config = get_config(args)

    if debug:
        print(
            f"[DEBUG] Config built: repo={config.repo}, model={config.model}",
            flush=True,
        )
        print("[DEBUG] Creating orchestrator...", flush=True)

    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    if debug:
        print("[DEBUG] Orchestrator created", flush=True)
        print(
            f"[DEBUG] Calling orchestrator.followup_review_pr({args.pr_number})...",
            flush=True,
        )

    try:
        result = await orchestrator.followup_review_pr(args.pr_number)
    except ValueError as e:
        print(f"\nFollow-up review failed: {e}")
        return 1

    if debug:
        print(
            f"[DEBUG] followup_review_pr returned, success={result.success}", flush=True
        )

    if result.success:
        print(f"\n{'=' * 60}")
        print(f"PR #{result.pr_number} Follow-up Review Complete")
        print(f"{'=' * 60}")
        print(f"Status: {result.overall_status}")
        print(f"Is Follow-up: {result.is_followup_review}")

        if result.resolved_findings:
            print(f"Resolved: {len(result.resolved_findings)} finding(s)")
        if result.unresolved_findings:
            print(f"Still Open: {len(result.unresolved_findings)} finding(s)")
        if result.new_findings_since_last_review:
            print(
                f"New Issues: {len(result.new_findings_since_last_review)} finding(s)"
            )

        print(f"\nSummary:\n{result.summary}")

        if result.findings:
            print("\nRemaining Findings:")
            for f in result.findings:
                emoji = {"critical": "!", "high": "*", "medium": "-", "low": "."}
                print(
                    f"  {emoji.get(f.severity.value, '?')} [{f.severity.value.upper()}] {f.title}"
                )
                print(f"    File: {f.file}:{f.line}")
        return 0
    else:
        print(f"\nFollow-up review failed: {result.error}")
        return 1


async def cmd_auto_pr_review(args) -> int:
    """Run autonomous PR review loop.

    This command runs the full Auto-PR-Review loop:
    1. Wait for CI checks and external bots to complete
    2. Run internal AI review
    3. If findings exist, apply fixes automatically
    4. Push fixes and loop back to step 1
    5. Stop when approved or max iterations reached

    The system NEVER auto-merges - human approval is always required.
    """
    import subprocess
    import sys

    # Force unbuffered output so Electron sees it in real-time
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)

    debug = os.environ.get("DEBUG")
    json_output = getattr(args, "json", False)

    def emit_progress(phase: str, progress: int, message: str, **extra):
        """Emit progress in a format the frontend can parse."""
        if json_output:
            import json as json_module

            progress_data = {
                "type": "progress",
                "phase": phase,
                "progress": progress,
                "message": message,
                "pr_number": args.pr_number,
                **extra,
            }
            print(f"PROGRESS:{json_module.dumps(progress_data)}", flush=True)
        else:
            print(f"[{progress:3d}%] {message}", flush=True)

    if debug:
        print(f"[DEBUG] Starting Auto-PR-Review for PR #{args.pr_number}", flush=True)
        print(f"[DEBUG] Project directory: {args.project}", flush=True)

    # Import the orchestrator
    try:
        from services.auto_pr_review_orchestrator import (
            AutoPRReviewOrchestrator,
            OrchestratorResult,
        )
    except ImportError:
        from .services.auto_pr_review_orchestrator import (
            AutoPRReviewOrchestrator,
            OrchestratorResult,
        )

    config = get_config(args)

    # Get repository - either from args or config
    repo = getattr(args, "repository", None) or config.repo
    if not repo:
        emit_progress("error", 0, "Repository not specified and could not be detected")
        return 1

    # Construct paths
    project_dir = Path(args.project)
    github_dir = project_dir / ".auto-claude" / "github"
    github_dir.mkdir(parents=True, exist_ok=True)

    # Create or use a spec directory for this PR review
    spec_dir = github_dir / "auto-pr-reviews" / f"pr-{args.pr_number}"
    spec_dir.mkdir(parents=True, exist_ok=True)

    # Get PR URL
    pr_url = f"https://github.com/{repo}/pull/{args.pr_number}"

    # Get branch name from GitHub API
    try:
        from gh_client import GHClient
    except ImportError:
        from .gh_client import GHClient

    gh_client = GHClient(project_dir=project_dir, repo=config.repo)
    pr_data = await gh_client.pr_get(args.pr_number)
    branch_name = pr_data.get("head", {}).get("ref", "unknown")

    # Get current user as triggered_by
    triggered_by = "cli"
    try:
        result = subprocess.run(
            ["gh", "api", "/user", "-q", ".login"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            triggered_by = result.stdout.strip() or "cli"
    except Exception:
        pass

    emit_progress(
        "initializing", 5, f"Starting Auto-PR-Review for PR #{args.pr_number}"
    )

    # Create the orchestrator
    orchestrator = AutoPRReviewOrchestrator(
        github_dir=github_dir,
        project_dir=project_dir,
        spec_dir=spec_dir,
        max_iterations=getattr(args, "max_iterations", 5),
        ci_timeout=float(getattr(args, "ci_timeout", 1800)),
        bot_timeout=float(getattr(args, "bot_timeout", 900)),
    )

    # Progress callback
    def on_progress(event_type: str, data):
        if event_type in ("iteration_start", "iteration_started"):
            emit_progress(
                "reviewing",
                20 + (data.get("iteration", 0) * 15),
                f"Starting iteration {data.get('iteration', 0)} of {data.get('max_iterations', 5)}",
                iteration=data.get("iteration", 0),
                max_iterations=data.get("max_iterations", 5),
            )
        elif event_type == "started":
            emit_progress(
                "awaiting_checks",
                5,
                f"Auto-PR-Review started for PR #{data.get('pr_number', args.pr_number)}",
                max_iterations=data.get("max_iterations", 5),
            )
        elif event_type == "polling":
            # Emit progress during CI/bot polling so frontend shows activity
            ci_count = data.get("ci_checks_count", 0)
            bot_count = data.get("bot_statuses_count", 0)
            poll_count = data.get("poll_count", 0)
            emit_progress(
                "awaiting_checks",
                10 + min(poll_count, 10),  # Progress slowly increases during polling
                f"Polling CI checks ({ci_count} checks, poll #{poll_count})...",
                poll_count=poll_count,
                ci_checks_count=ci_count,
                bot_statuses_count=bot_count,
            )
        elif event_type == "awaiting_checks":
            emit_progress("awaiting_checks", 10, "Waiting for CI checks to complete...")
        elif event_type == "waiting_for_ci":
            emit_progress("awaiting_checks", 10, "Waiting for CI checks to complete...")
        elif event_type == "waiting_for_bots":
            emit_progress("awaiting_checks", 15, "Waiting for external bot reviews...")
        elif event_type == "reviewing":
            emit_progress("pr_reviewing", 30, "Running AI review...")
        elif event_type == "ai_reviewing":
            # New: AI review phase after CI passes
            iteration = data.get("iteration", 1)
            message = data.get("message", "Running AI code review...")
            emit_progress("pr_reviewing", 35, message, iteration=iteration)
        elif event_type == "fixing":
            emit_progress(
                "pr_fixing",
                50,
                f"Applying fixes for {data.get('findings_count', 0)} findings...",
            )
        elif event_type == "pushing":
            emit_progress("pr_fixing", 70, "Pushing fixes to repository...")

    if debug:
        print("[DEBUG] Running orchestrator.run()", flush=True)

    try:
        result = await orchestrator.run(
            pr_number=args.pr_number,
            repo=repo,
            pr_url=pr_url,
            branch_name=branch_name,
            triggered_by=triggered_by,
            on_progress=on_progress,
        )

        # Emit final result
        if json_output:
            import json as json_module

            final_data = result.to_dict()
            final_data["type"] = "complete"
            print(f"RESULT:{json_module.dumps(final_data)}", flush=True)

        if result.result in (
            OrchestratorResult.READY_TO_MERGE,
            OrchestratorResult.NO_FINDINGS,
        ):
            emit_progress(
                "pr_ready_to_merge"
                if result.result == OrchestratorResult.READY_TO_MERGE
                else "completed",
                100,
                f"PR #{args.pr_number} is ready for human review!",
                ci_passed=result.ci_all_passed,
                findings_fixed=result.findings_fixed,
            )
            print(f"\n{'=' * 60}")
            print(f"Auto-PR-Review Complete: PR #{args.pr_number}")
            print(f"{'=' * 60}")
            print(f"Result: {result.result.value}")
            print(f"Iterations: {result.iterations_completed}")
            print(f"Findings Fixed: {result.findings_fixed}")
            print(f"CI All Passed: {result.ci_all_passed}")
            print("\n** HUMAN APPROVAL REQUIRED **")
            print(f"PR is ready for review at: {pr_url}")
            return 0
        elif result.result == OrchestratorResult.NEEDS_HUMAN_REVIEW:
            # Valid terminal state - findings exist but can't be auto-fixed
            emit_progress(
                "needs_human_review",
                100,
                f"PR #{args.pr_number} requires human review",
                ci_passed=result.ci_all_passed,
                findings_fixed=result.findings_fixed,
                findings_remaining=result.findings_unfixed,
            )
            print(f"\n{'=' * 60}")
            print(f"Auto-PR-Review: Human Review Required for PR #{args.pr_number}")
            print(f"{'=' * 60}")
            print(f"Result: {result.result.value}")
            print(f"Iterations: {result.iterations_completed}")
            print(f"Findings Fixed: {result.findings_fixed}")
            print(f"Findings Requiring Manual Review: {result.findings_unfixed}")
            print("\n** HUMAN REVIEW REQUIRED **")
            print("Some findings cannot be automatically fixed (e.g., CI failures")
            print("without specific file paths). Please review and fix manually.")
            print(f"PR URL: {pr_url}")
            return 0  # Exit successfully - this is a valid terminal state
        else:
            emit_progress(
                "failed"
                if result.result != OrchestratorResult.MAX_ITERATIONS
                else "max_iterations",
                100,
                f"Auto-PR-Review stopped: {result.result.value}",
                error=result.error_message,
            )
            print(f"\nAuto-PR-Review stopped: {result.result.value}")
            if result.error_message:
                print(f"Error: {result.error_message}")
            return 1

    except Exception as e:
        emit_progress("failed", 0, f"Auto-PR-Review failed: {str(e)}")
        if debug:
            import traceback

            traceback.print_exc()
        return 1


async def cmd_triage(args) -> int:
    """Triage issues."""
    config = get_config(args)
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    issue_numbers = args.issues if args.issues else None
    results = await orchestrator.triage_issues(
        issue_numbers=issue_numbers,
        apply_labels=args.apply_labels,
    )

    print(f"\n{'=' * 60}")
    print(f"Triaged {len(results)} issues")
    print(f"{'=' * 60}")

    for r in results:
        flags = []
        if r.is_duplicate:
            flags.append(f"DUP of #{r.duplicate_of}")
        if r.is_spam:
            flags.append("SPAM")
        if r.is_feature_creep:
            flags.append("CREEP")

        flag_str = f" [{', '.join(flags)}]" if flags else ""
        print(
            f"  #{r.issue_number}: {r.category.value} (confidence: {r.confidence:.0%}){flag_str}"
        )

        if r.labels_to_add:
            print(f"    + Labels: {', '.join(r.labels_to_add)}")

    return 0


async def cmd_auto_fix(args) -> int:
    """Start auto-fix for an issue."""
    config = get_config(args)
    config.auto_fix_enabled = True
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    state = await orchestrator.auto_fix_issue(args.issue_number)

    print(f"\n{'=' * 60}")
    print(f"Auto-Fix State for Issue #{state.issue_number}")
    print(f"{'=' * 60}")
    print(f"Status: {state.status.value}")
    if state.spec_id:
        print(f"Spec ID: {state.spec_id}")
    if state.pr_number:
        print(f"PR: #{state.pr_number}")
    if state.error:
        print(f"Error: {state.error}")

    return 0


async def cmd_check_labels(args) -> int:
    """Check for issues with auto-fix labels."""
    config = get_config(args)
    config.auto_fix_enabled = True
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    issues = await orchestrator.check_auto_fix_labels()

    if issues:
        print(f"Found {len(issues)} issues with auto-fix labels:")
        for num in issues:
            print(f"  #{num}")
    else:
        print("No issues with auto-fix labels found.")

    return 0


async def cmd_check_new(args) -> int:
    """Check for new issues not yet in the auto-fix queue."""
    config = get_config(args)
    config.auto_fix_enabled = True
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    issues = await orchestrator.check_new_issues()

    print("JSON Output")
    print(json.dumps(issues))

    return 0


async def cmd_queue(args) -> int:
    """Show auto-fix queue."""
    config = get_config(args)
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
    )

    queue = await orchestrator.get_auto_fix_queue()

    print(f"\n{'=' * 60}")
    print(f"Auto-Fix Queue ({len(queue)} items)")
    print(f"{'=' * 60}")

    if not queue:
        print("Queue is empty.")
        return 0

    for state in queue:
        status_emoji = {
            "pending": "...",
            "analyzing": "...",
            "creating_spec": "...",
            "building": "...",
            "qa_review": "...",
            "pr_created": "+++",
            "completed": "OK",
            "failed": "ERR",
        }
        emoji = status_emoji.get(state.status.value, "???")
        print(f"  [{emoji}] #{state.issue_number}: {state.status.value}")
        if state.pr_number:
            print(f"       PR: #{state.pr_number}")
        if state.error:
            print(f"       Error: {state.error[:50]}...")

    return 0


async def cmd_batch_issues(args) -> int:
    """Batch similar issues and create combined specs."""
    config = get_config(args)
    config.auto_fix_enabled = True
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    issue_numbers = args.issues if args.issues else None
    batches = await orchestrator.batch_and_fix_issues(issue_numbers)

    print(f"\n{'=' * 60}")
    print(f"Created {len(batches)} batches from similar issues")
    print(f"{'=' * 60}")

    if not batches:
        print("No batches created. Either no issues found or all issues are unique.")
        return 0

    for batch in batches:
        issue_nums = ", ".join(f"#{i.issue_number}" for i in batch.issues)
        print(f"\n  Batch: {batch.batch_id}")
        print(f"    Issues: {issue_nums}")
        print(f"    Theme: {batch.theme}")
        print(f"    Status: {batch.status.value}")
        if batch.spec_id:
            print(f"    Spec: {batch.spec_id}")

    return 0


async def cmd_batch_status(args) -> int:
    """Show batch status."""
    config = get_config(args)
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
    )

    status = await orchestrator.get_batch_status()

    print(f"\n{'=' * 60}")
    print("Batch Status")
    print(f"{'=' * 60}")
    print(f"Total batches: {status.get('total_batches', 0)}")
    print(f"Pending: {status.get('pending', 0)}")
    print(f"Processing: {status.get('processing', 0)}")
    print(f"Completed: {status.get('completed', 0)}")
    print(f"Failed: {status.get('failed', 0)}")

    return 0


async def cmd_analyze_preview(args) -> int:
    """
    Analyze issues and preview proposed batches without executing.

    This is the "proactive" workflow for reviewing issue groupings before action.
    """
    import json

    config = get_config(args)
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    issue_numbers = args.issues if args.issues else None
    max_issues = getattr(args, "max_issues", 200)

    result = await orchestrator.analyze_issues_preview(
        issue_numbers=issue_numbers,
        max_issues=max_issues,
    )

    if not result.get("success"):
        print(f"Error: {result.get('error', 'Unknown error')}")
        return 1

    print(f"\n{'=' * 60}")
    print("Issue Analysis Preview")
    print(f"{'=' * 60}")
    print(f"Total issues: {result.get('total_issues', 0)}")
    print(f"Analyzed: {result.get('analyzed_issues', 0)}")
    print(f"Already batched: {result.get('already_batched', 0)}")
    print(f"Proposed batches: {len(result.get('proposed_batches', []))}")
    print(f"Single issues: {len(result.get('single_issues', []))}")

    proposed_batches = result.get("proposed_batches", [])
    if proposed_batches:
        print(f"\n{'=' * 60}")
        print("Proposed Batches (for human review)")
        print(f"{'=' * 60}")

        for i, batch in enumerate(proposed_batches, 1):
            confidence = batch.get("confidence", 0)
            validated = "" if batch.get("validated") else "[NEEDS REVIEW] "
            print(
                f"\n  Batch {i}: {validated}{batch.get('theme', 'No theme')} ({confidence:.0%} confidence)"
            )
            print(f"    Primary issue: #{batch.get('primary_issue')}")
            print(f"    Issue count: {batch.get('issue_count', 0)}")
            print(f"    Reasoning: {batch.get('reasoning', 'N/A')}")
            print("    Issues:")
            for item in batch.get("issues", []):
                similarity = item.get("similarity_to_primary", 0)
                print(
                    f"      - #{item['issue_number']}: {item.get('title', '?')} ({similarity:.0%})"
                )

    # Output JSON for programmatic use
    if getattr(args, "json", False):
        print(f"\n{'=' * 60}")
        print("JSON Output")
        print(f"{'=' * 60}")
        # Print JSON on single line to avoid corruption from line-by-line stdout prefixes
        print(json.dumps(result))

    return 0


async def cmd_approve_batches(args) -> int:
    """
    Approve and execute batches from a JSON file.

    Usage: runner.py approve-batches approved_batches.json
    """
    import json

    config = get_config(args)
    orchestrator = GitHubOrchestrator(
        project_dir=args.project,
        config=config,
        progress_callback=print_progress,
    )

    # Load approved batches from file
    try:
        with open(args.batch_file) as f:
            approved_batches = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading batch file: {e}")
        return 1

    if not approved_batches:
        print("No batches in file to approve.")
        return 0

    print(f"Approving and executing {len(approved_batches)} batches...")

    created_batches = await orchestrator.approve_and_execute_batches(approved_batches)

    print(f"\n{'=' * 60}")
    print(f"Created {len(created_batches)} batches")
    print(f"{'=' * 60}")

    for batch in created_batches:
        issue_nums = ", ".join(f"#{i.issue_number}" for i in batch.issues)
        print(f"  {batch.batch_id}: {issue_nums}")

    return 0


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="GitHub automation CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Global options
    parser.add_argument(
        "--project",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current)",
    )
    parser.add_argument(
        "--token",
        type=str,
        help="GitHub token (or set GITHUB_TOKEN)",
    )
    parser.add_argument(
        "--bot-token",
        type=str,
        help="Bot account token for comments (optional)",
    )
    parser.add_argument(
        "--repo",
        type=str,
        help="GitHub repo (owner/name) or auto-detect",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="claude-sonnet-4-20250514",
        help="AI model to use",
    )
    parser.add_argument(
        "--thinking-level",
        type=str,
        default="medium",
        choices=["none", "low", "medium", "high"],
        help="Thinking level for extended reasoning",
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # review-pr command
    review_parser = subparsers.add_parser("review-pr", help="Review a pull request")
    review_parser.add_argument("pr_number", type=int, help="PR number to review")
    review_parser.add_argument(
        "--auto-post",
        action="store_true",
        help="Automatically post review to GitHub",
    )
    review_parser.add_argument(
        "--force",
        action="store_true",
        help="Force a new review even if commit was already reviewed",
    )

    # followup-review-pr command
    followup_parser = subparsers.add_parser(
        "followup-review-pr",
        help="Follow-up review of a PR (after contributor changes)",
    )
    followup_parser.add_argument("pr_number", type=int, help="PR number to review")

    # triage command
    triage_parser = subparsers.add_parser("triage", help="Triage issues")
    triage_parser.add_argument(
        "issues",
        type=int,
        nargs="*",
        help="Specific issue numbers (or all open if none)",
    )
    triage_parser.add_argument(
        "--apply-labels",
        action="store_true",
        help="Apply suggested labels to GitHub",
    )

    # auto-fix command
    autofix_parser = subparsers.add_parser("auto-fix", help="Start auto-fix for issue")
    autofix_parser.add_argument("issue_number", type=int, help="Issue number to fix")

    # check-auto-fix-labels command
    subparsers.add_parser(
        "check-auto-fix-labels", help="Check for issues with auto-fix labels"
    )

    # check-new command
    subparsers.add_parser(
        "check-new", help="Check for new issues not yet in auto-fix queue"
    )

    # queue command
    subparsers.add_parser("queue", help="Show auto-fix queue")

    # batch-issues command
    batch_parser = subparsers.add_parser(
        "batch-issues", help="Batch similar issues and create combined specs"
    )
    batch_parser.add_argument(
        "issues",
        type=int,
        nargs="*",
        help="Specific issue numbers (or all open if none)",
    )

    # batch-status command
    subparsers.add_parser("batch-status", help="Show batch status")

    # auto-pr-review command (autonomous PR review loop)
    auto_pr_review_parser = subparsers.add_parser(
        "auto-pr-review",
        help="Run autonomous PR review loop (wait for CI, review, fix, repeat)",
    )
    auto_pr_review_parser.add_argument(
        "pr_number", type=int, help="PR number to review"
    )
    auto_pr_review_parser.add_argument(
        "--repository",
        type=str,
        help="Repository in owner/repo format (auto-detected from git if not specified)",
    )
    auto_pr_review_parser.add_argument(
        "--max-iterations",
        type=int,
        default=5,
        help="Maximum number of review/fix iterations (default: 5)",
    )
    auto_pr_review_parser.add_argument(
        "--ci-timeout",
        type=int,
        default=1800,
        help="CI check timeout in seconds (default: 1800 = 30 min)",
    )
    auto_pr_review_parser.add_argument(
        "--bot-timeout",
        type=int,
        default=900,
        help="External bot timeout in seconds (default: 900 = 15 min)",
    )
    auto_pr_review_parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON for programmatic use",
    )

    # analyze-preview command (proactive workflow)
    analyze_parser = subparsers.add_parser(
        "analyze-preview",
        help="Analyze issues and preview proposed batches without executing",
    )
    analyze_parser.add_argument(
        "issues",
        type=int,
        nargs="*",
        help="Specific issue numbers (or all open if none)",
    )
    analyze_parser.add_argument(
        "--max-issues",
        type=int,
        default=200,
        help="Maximum number of issues to analyze (default: 200)",
    )
    analyze_parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON for programmatic use",
    )

    # approve-batches command
    approve_parser = subparsers.add_parser(
        "approve-batches",
        help="Approve and execute batches from a JSON file",
    )
    approve_parser.add_argument(
        "batch_file",
        type=Path,
        help="JSON file containing approved batches",
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Route to command handler
    commands = {
        "review-pr": cmd_review_pr,
        "followup-review-pr": cmd_followup_review_pr,
        "auto-pr-review": cmd_auto_pr_review,
        "triage": cmd_triage,
        "auto-fix": cmd_auto_fix,
        "check-auto-fix-labels": cmd_check_labels,
        "check-new": cmd_check_new,
        "queue": cmd_queue,
        "batch-issues": cmd_batch_issues,
        "batch-status": cmd_batch_status,
        "analyze-preview": cmd_analyze_preview,
        "approve-batches": cmd_approve_batches,
    }

    handler = commands.get(args.command)
    if not handler:
        print(f"Unknown command: {args.command}")
        sys.exit(1)

    try:
        exit_code = asyncio.run(handler(args))
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(1)
    except Exception as e:
        import traceback

        debug_error("github_runner", "Command failed", error=str(e))
        print(f"Error: {e}")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
