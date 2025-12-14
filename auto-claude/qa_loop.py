"""
QA Validation Loop
==================

Implements the self-validating QA loop:
1. QA Agent reviews completed implementation
2. If issues found → Coder Agent fixes
3. QA Agent re-reviews
4. Loop continues until approved or max iterations reached

This ensures production-quality output before sign-off.

Enhanced features:
- Iteration tracking with detailed history
- Recurring issue detection (3+ occurrences → human escalation)
- No-test project handling
- Integration with validation strategy and risk classification
"""

import json
from collections import Counter
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from claude_agent_sdk import ClaudeSDKClient

from client import create_client
from progress import count_subtasks, is_build_complete
from linear_updater import (
    is_linear_enabled,
    LinearTaskState,
    linear_qa_started,
    linear_qa_approved,
    linear_qa_rejected,
    linear_qa_max_iterations,
)
from task_logger import (
    TaskLogger,
    LogPhase,
    LogEntryType,
    get_task_logger,
)


# Configuration
MAX_QA_ITERATIONS = 50
RECURRING_ISSUE_THRESHOLD = 3  # Escalate if same issue appears this many times
ISSUE_SIMILARITY_THRESHOLD = 0.8  # Consider issues "same" if similarity >= this
QA_PROMPTS_DIR = Path(__file__).parent / "prompts"


# =============================================================================
# ITERATION TRACKING
# =============================================================================


def get_iteration_history(spec_dir: Path) -> List[Dict[str, Any]]:
    """
    Get the full iteration history from implementation_plan.json.

    Returns:
        List of iteration records with issues, timestamps, and outcomes.
    """
    plan = load_implementation_plan(spec_dir)
    if not plan:
        return []
    return plan.get("qa_iteration_history", [])


def record_iteration(
    spec_dir: Path,
    iteration: int,
    status: str,
    issues: List[Dict[str, Any]],
    duration_seconds: Optional[float] = None,
) -> bool:
    """
    Record a QA iteration to the history.

    Args:
        spec_dir: Spec directory
        iteration: Iteration number
        status: "approved", "rejected", or "error"
        issues: List of issues found (empty if approved)
        duration_seconds: Optional duration of the iteration

    Returns:
        True if recorded successfully
    """
    plan = load_implementation_plan(spec_dir)
    if not plan:
        plan = {}

    if "qa_iteration_history" not in plan:
        plan["qa_iteration_history"] = []

    record = {
        "iteration": iteration,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "issues": issues,
    }
    if duration_seconds is not None:
        record["duration_seconds"] = round(duration_seconds, 2)

    plan["qa_iteration_history"].append(record)

    # Update summary stats
    if "qa_stats" not in plan:
        plan["qa_stats"] = {}

    plan["qa_stats"]["total_iterations"] = len(plan["qa_iteration_history"])
    plan["qa_stats"]["last_iteration"] = iteration
    plan["qa_stats"]["last_status"] = status

    # Count issues by type
    issue_types = Counter()
    for rec in plan["qa_iteration_history"]:
        for issue in rec.get("issues", []):
            issue_type = issue.get("type", "unknown")
            issue_types[issue_type] += 1
    plan["qa_stats"]["issues_by_type"] = dict(issue_types)

    return save_implementation_plan(spec_dir, plan)


# =============================================================================
# RECURRING ISSUE DETECTION
# =============================================================================


def _normalize_issue_key(issue: Dict[str, Any]) -> str:
    """
    Create a normalized key for issue comparison.

    Combines title and file location for identifying "same" issues.
    """
    title = (issue.get("title") or "").lower().strip()
    file = (issue.get("file") or "").lower().strip()
    line = issue.get("line") or ""

    # Remove common prefixes/suffixes that might differ between iterations
    for prefix in ["error:", "issue:", "bug:", "fix:"]:
        if title.startswith(prefix):
            title = title[len(prefix):].strip()

    return f"{title}|{file}|{line}"


def _issue_similarity(issue1: Dict[str, Any], issue2: Dict[str, Any]) -> float:
    """
    Calculate similarity between two issues.

    Uses title similarity and location matching.

    Returns:
        Similarity score between 0.0 and 1.0
    """
    key1 = _normalize_issue_key(issue1)
    key2 = _normalize_issue_key(issue2)

    return SequenceMatcher(None, key1, key2).ratio()


def has_recurring_issues(
    current_issues: List[Dict[str, Any]],
    history: List[Dict[str, Any]],
    threshold: int = RECURRING_ISSUE_THRESHOLD,
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Check if any current issues have appeared repeatedly in history.

    Args:
        current_issues: Issues from current iteration
        history: Previous iteration records
        threshold: Number of occurrences to consider "recurring"

    Returns:
        (has_recurring, recurring_issues) tuple
    """
    # Flatten all historical issues
    historical_issues = []
    for record in history:
        historical_issues.extend(record.get("issues", []))

    if not historical_issues:
        return False, []

    recurring = []

    for current in current_issues:
        occurrence_count = 1  # Count current occurrence

        for historical in historical_issues:
            similarity = _issue_similarity(current, historical)
            if similarity >= ISSUE_SIMILARITY_THRESHOLD:
                occurrence_count += 1

        if occurrence_count >= threshold:
            recurring.append({
                **current,
                "occurrence_count": occurrence_count,
            })

    return len(recurring) > 0, recurring


def get_recurring_issue_summary(
    history: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Analyze iteration history for issue patterns.

    Returns:
        Summary with most common issues, fix success rate, etc.
    """
    all_issues = []
    for record in history:
        all_issues.extend(record.get("issues", []))

    if not all_issues:
        return {"total_issues": 0, "unique_issues": 0, "most_common": []}

    # Group similar issues
    issue_groups: Dict[str, List[Dict[str, Any]]] = {}

    for issue in all_issues:
        key = _normalize_issue_key(issue)
        matched = False

        for existing_key in issue_groups:
            if SequenceMatcher(None, key, existing_key).ratio() >= ISSUE_SIMILARITY_THRESHOLD:
                issue_groups[existing_key].append(issue)
                matched = True
                break

        if not matched:
            issue_groups[key] = [issue]

    # Find most common issues
    sorted_groups = sorted(
        issue_groups.items(),
        key=lambda x: len(x[1]),
        reverse=True
    )

    most_common = []
    for key, issues in sorted_groups[:5]:  # Top 5
        most_common.append({
            "title": issues[0].get("title", key),
            "file": issues[0].get("file"),
            "occurrences": len(issues),
        })

    # Calculate statistics
    approved_count = sum(1 for r in history if r.get("status") == "approved")
    rejected_count = sum(1 for r in history if r.get("status") == "rejected")

    return {
        "total_issues": len(all_issues),
        "unique_issues": len(issue_groups),
        "most_common": most_common,
        "iterations_approved": approved_count,
        "iterations_rejected": rejected_count,
        "fix_success_rate": approved_count / len(history) if history else 0,
    }


async def escalate_to_human(
    spec_dir: Path,
    recurring_issues: List[Dict[str, Any]],
    iteration: int,
) -> None:
    """
    Create human escalation file for recurring issues.

    Args:
        spec_dir: Spec directory
        recurring_issues: Issues that have recurred
        iteration: Current iteration number
    """
    history = get_iteration_history(spec_dir)
    summary = get_recurring_issue_summary(history)

    escalation_file = spec_dir / "QA_ESCALATION.md"

    content = f"""# QA Escalation - Human Intervention Required

**Generated**: {datetime.now(timezone.utc).isoformat()}
**Iteration**: {iteration}/{MAX_QA_ITERATIONS}
**Reason**: Recurring issues detected ({RECURRING_ISSUE_THRESHOLD}+ occurrences)

## Summary

- **Total QA Iterations**: {len(history)}
- **Total Issues Found**: {summary['total_issues']}
- **Unique Issues**: {summary['unique_issues']}
- **Fix Success Rate**: {summary['fix_success_rate']:.1%}

## Recurring Issues

These issues have appeared {RECURRING_ISSUE_THRESHOLD}+ times without being resolved:

"""

    for i, issue in enumerate(recurring_issues, 1):
        content += f"""### {i}. {issue.get('title', 'Unknown Issue')}

- **File**: {issue.get('file', 'N/A')}
- **Line**: {issue.get('line', 'N/A')}
- **Type**: {issue.get('type', 'N/A')}
- **Occurrences**: {issue.get('occurrence_count', 'N/A')}
- **Description**: {issue.get('description', 'No description')}

"""

    content += """## Most Common Issues (All Time)

"""
    for issue in summary.get("most_common", []):
        content += f"- **{issue['title']}** ({issue['occurrences']} occurrences)"
        if issue.get("file"):
            content += f" in `{issue['file']}`"
        content += "\n"

    content += """

## Recommended Actions

1. Review the recurring issues manually
2. Check if the issue stems from:
   - Unclear specification
   - Complex edge case
   - Infrastructure/environment problem
   - Test framework limitations
3. Update the spec or acceptance criteria if needed
4. Run QA manually after making changes: `python run.py --spec {spec} --qa`

## Related Files

- `QA_FIX_REQUEST.md` - Latest fix request
- `qa_report.md` - Latest QA report
- `implementation_plan.json` - Full iteration history
"""

    escalation_file.write_text(content)
    print(f"\n📝 Escalation file created: {escalation_file}")


# =============================================================================
# NO-TEST PROJECT HANDLING
# =============================================================================


def check_test_discovery(spec_dir: Path) -> Optional[Dict[str, Any]]:
    """
    Check if test discovery has been run and what frameworks were found.

    Returns:
        Test discovery result or None if not run
    """
    discovery_file = spec_dir / "test_discovery.json"
    if not discovery_file.exists():
        return None

    try:
        with open(discovery_file) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def is_no_test_project(spec_dir: Path, project_dir: Path) -> bool:
    """
    Determine if this is a project with no test infrastructure.

    Checks test_discovery.json if available, otherwise scans project.

    Returns:
        True if no test frameworks detected
    """
    # Check cached discovery first
    discovery = check_test_discovery(spec_dir)
    if discovery:
        frameworks = discovery.get("frameworks", [])
        return len(frameworks) == 0

    # If no discovery file, check common test indicators
    test_indicators = [
        "pytest.ini",
        "pyproject.toml",
        "setup.cfg",
        "jest.config.js",
        "jest.config.ts",
        "vitest.config.js",
        "vitest.config.ts",
        "karma.conf.js",
        "cypress.config.js",
        "playwright.config.ts",
        ".rspec",
        "spec/spec_helper.rb",
    ]

    test_dirs = ["tests", "test", "__tests__", "spec"]

    # Check for test config files
    for indicator in test_indicators:
        if (project_dir / indicator).exists():
            return False

    # Check for test directories
    for test_dir in test_dirs:
        test_path = project_dir / test_dir
        if test_path.exists() and test_path.is_dir():
            # Check if directory has test files
            for f in test_path.iterdir():
                if f.is_file() and (
                    f.name.startswith("test_") or
                    f.name.endswith("_test.py") or
                    f.name.endswith(".spec.js") or
                    f.name.endswith(".spec.ts") or
                    f.name.endswith(".test.js") or
                    f.name.endswith(".test.ts")
                ):
                    return False

    return True


def create_manual_test_plan(spec_dir: Path, spec_name: str) -> Path:
    """
    Create a manual test plan when automated testing isn't possible.

    Args:
        spec_dir: Spec directory
        spec_name: Name of the spec

    Returns:
        Path to created manual test plan
    """
    manual_plan_file = spec_dir / "MANUAL_TEST_PLAN.md"

    # Read spec if available for context
    spec_file = spec_dir / "spec.md"
    spec_content = ""
    if spec_file.exists():
        spec_content = spec_file.read_text()

    # Extract acceptance criteria from spec if present
    acceptance_criteria = []
    if "## Acceptance Criteria" in spec_content:
        in_criteria = False
        for line in spec_content.split("\n"):
            if "## Acceptance Criteria" in line:
                in_criteria = True
                continue
            if in_criteria and line.startswith("## "):
                break
            if in_criteria and line.strip().startswith("- "):
                acceptance_criteria.append(line.strip()[2:])

    content = f"""# Manual Test Plan - {spec_name}

**Generated**: {datetime.now(timezone.utc).isoformat()}
**Reason**: No automated test framework detected

## Overview

This project does not have automated testing infrastructure. Please perform
manual verification of the implementation using the checklist below.

## Pre-Test Setup

1. [ ] Ensure all dependencies are installed
2. [ ] Start any required services
3. [ ] Set up test environment variables

## Acceptance Criteria Verification

"""

    if acceptance_criteria:
        for i, criterion in enumerate(acceptance_criteria, 1):
            content += f"{i}. [ ] {criterion}\n"
    else:
        content += """1. [ ] Core functionality works as expected
2. [ ] Edge cases are handled
3. [ ] Error states are handled gracefully
4. [ ] UI/UX meets requirements (if applicable)
"""

    content += """

## Functional Tests

### Happy Path
- [ ] Primary use case works correctly
- [ ] Expected outputs are generated
- [ ] No console errors

### Edge Cases
- [ ] Empty input handling
- [ ] Invalid input handling
- [ ] Boundary conditions

### Error Handling
- [ ] Errors display appropriate messages
- [ ] System recovers gracefully from errors
- [ ] No data loss on failure

## Non-Functional Tests

### Performance
- [ ] Response time is acceptable
- [ ] No memory leaks observed
- [ ] No excessive resource usage

### Security
- [ ] Input is properly sanitized
- [ ] No sensitive data exposed
- [ ] Authentication works correctly (if applicable)

## Browser/Environment Testing (if applicable)

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Mobile viewport

## Sign-off

**Tester**: _______________
**Date**: _______________
**Result**: [ ] PASS  [ ] FAIL

### Notes
_Add any observations or issues found during testing_

"""

    manual_plan_file.write_text(content)
    return manual_plan_file


def load_implementation_plan(spec_dir: Path) -> Optional[dict]:
    """Load the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return None
    try:
        with open(plan_file) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def save_implementation_plan(spec_dir: Path, plan: dict) -> bool:
    """Save the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    try:
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        return True
    except IOError:
        return False


def get_qa_signoff_status(spec_dir: Path) -> Optional[dict]:
    """Get the current QA sign-off status from implementation plan."""
    plan = load_implementation_plan(spec_dir)
    if not plan:
        return None
    return plan.get("qa_signoff")


def is_qa_approved(spec_dir: Path) -> bool:
    """Check if QA has approved the build."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return False
    return status.get("status") == "approved"


def is_qa_rejected(spec_dir: Path) -> bool:
    """Check if QA has rejected the build (needs fixes)."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return False
    return status.get("status") == "rejected"


def is_fixes_applied(spec_dir: Path) -> bool:
    """Check if fixes have been applied and ready for re-validation."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return False
    return status.get("status") == "fixes_applied" and status.get("ready_for_qa_revalidation", False)


def get_qa_iteration_count(spec_dir: Path) -> int:
    """Get the number of QA iterations so far."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return 0
    return status.get("qa_session", 0)


def load_qa_reviewer_prompt() -> str:
    """Load the QA reviewer agent prompt."""
    prompt_file = QA_PROMPTS_DIR / "qa_reviewer.md"
    if not prompt_file.exists():
        raise FileNotFoundError(f"QA reviewer prompt not found: {prompt_file}")
    return prompt_file.read_text()


def load_qa_fixer_prompt() -> str:
    """Load the QA fixer agent prompt."""
    prompt_file = QA_PROMPTS_DIR / "qa_fixer.md"
    if not prompt_file.exists():
        raise FileNotFoundError(f"QA fixer prompt not found: {prompt_file}")
    return prompt_file.read_text()


def should_run_qa(spec_dir: Path) -> bool:
    """
    Determine if QA validation should run.

    QA should run when:
    - All subtasks are completed
    - QA has not yet approved
    """
    if not is_build_complete(spec_dir):
        return False

    if is_qa_approved(spec_dir):
        return False

    return True


def should_run_fixes(spec_dir: Path) -> bool:
    """
    Determine if QA fixes should run.

    Fixes should run when:
    - QA has rejected the build
    - Max iterations not reached
    """
    if not is_qa_rejected(spec_dir):
        return False

    iterations = get_qa_iteration_count(spec_dir)
    if iterations >= MAX_QA_ITERATIONS:
        return False

    return True


async def run_qa_agent_session(
    client: ClaudeSDKClient,
    spec_dir: Path,
    qa_session: int,
    verbose: bool = False,
) -> tuple[str, str]:
    """
    Run a QA reviewer agent session.

    Args:
        client: Claude SDK client
        spec_dir: Spec directory
        qa_session: QA iteration number
        verbose: Whether to show detailed output

    Returns:
        (status, response_text) where status is:
        - "approved" if QA approves
        - "rejected" if QA finds issues
        - "error" if an error occurred
    """
    print(f"\n{'=' * 70}")
    print(f"  QA REVIEWER SESSION {qa_session}")
    print(f"  Validating all acceptance criteria...")
    print(f"{'=' * 70}\n")

    # Get task logger for streaming markers
    task_logger = get_task_logger(spec_dir)
    current_tool = None

    # Load QA prompt
    prompt = load_qa_reviewer_prompt()

    # Add session context - use full path so agent can find files
    prompt += f"\n\n---\n\n**QA Session**: {qa_session}\n"
    prompt += f"**Spec Directory**: {spec_dir}\n"
    prompt += f"**Spec Name**: {spec_dir.name}\n"
    prompt += f"**Max Iterations**: {MAX_QA_ITERATIONS}\n"
    prompt += f"\n**IMPORTANT**: All spec files (spec.md, implementation_plan.json, etc.) are located in: `{spec_dir}/`\n"
    prompt += f"Use the full path when reading files, e.g.: `cat {spec_dir}/spec.md`\n"

    try:
        await client.query(prompt)

        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(block.text, LogEntryType.TEXT, LogPhase.VALIDATION, print_to_console=False)
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        tool_name = block.name
                        tool_input = None

                        # Extract tool input for display
                        if hasattr(block, "input") and block.input:
                            inp = block.input
                            if isinstance(inp, dict):
                                if "file_path" in inp:
                                    fp = inp["file_path"]
                                    if len(fp) > 50:
                                        fp = "..." + fp[-47:]
                                    tool_input = fp
                                elif "pattern" in inp:
                                    tool_input = f"pattern: {inp['pattern']}"

                        # Log tool start (handles printing)
                        if task_logger:
                            task_logger.tool_start(tool_name, tool_input, LogPhase.VALIDATION, print_to_console=True)
                        else:
                            print(f"\n[QA Tool: {tool_name}]", flush=True)

                        if verbose and hasattr(block, "input"):
                            input_str = str(block.input)
                            if len(input_str) > 300:
                                print(f"   Input: {input_str[:300]}...", flush=True)
                            else:
                                print(f"   Input: {input_str}", flush=True)
                        current_tool = tool_name

            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "ToolResultBlock":
                        is_error = getattr(block, "is_error", False)
                        result_content = getattr(block, "content", "")

                        if is_error:
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                # Store full error in detail for expandable view
                                task_logger.tool_end(current_tool, success=False, result=error_str[:100], detail=str(result_content), phase=LogPhase.VALIDATION)
                        else:
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                # Store full result in detail for expandable view
                                detail_content = None
                                if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                    result_str = str(result_content)
                                    if len(result_str) < 50000:
                                        detail_content = result_str
                                task_logger.tool_end(current_tool, success=True, detail=detail_content, phase=LogPhase.VALIDATION)

                        current_tool = None

        print("\n" + "-" * 70 + "\n")

        # Check the QA result from implementation_plan.json
        status = get_qa_signoff_status(spec_dir)
        if status and status.get("status") == "approved":
            return "approved", response_text
        elif status and status.get("status") == "rejected":
            return "rejected", response_text
        else:
            # Agent didn't update the status properly
            return "error", "QA agent did not update implementation_plan.json"

    except Exception as e:
        print(f"Error during QA session: {e}")
        if task_logger:
            task_logger.log_error(f"QA session error: {e}", LogPhase.VALIDATION)
        return "error", str(e)


async def run_qa_fixer_session(
    client: ClaudeSDKClient,
    spec_dir: Path,
    fix_session: int,
    verbose: bool = False,
) -> tuple[str, str]:
    """
    Run a QA fixer agent session.

    Args:
        client: Claude SDK client
        spec_dir: Spec directory
        fix_session: Fix iteration number
        verbose: Whether to show detailed output

    Returns:
        (status, response_text) where status is:
        - "fixed" if fixes were applied
        - "error" if an error occurred
    """
    print(f"\n{'=' * 70}")
    print(f"  QA FIXER SESSION {fix_session}")
    print(f"  Applying fixes from QA_FIX_REQUEST.md...")
    print(f"{'=' * 70}\n")

    # Get task logger for streaming markers
    task_logger = get_task_logger(spec_dir)
    current_tool = None

    # Check that fix request file exists
    fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    if not fix_request_file.exists():
        return "error", "QA_FIX_REQUEST.md not found"

    # Load fixer prompt
    prompt = load_qa_fixer_prompt()

    # Add session context - use full path so agent can find files
    prompt += f"\n\n---\n\n**Fix Session**: {fix_session}\n"
    prompt += f"**Spec Directory**: {spec_dir}\n"
    prompt += f"**Spec Name**: {spec_dir.name}\n"
    prompt += f"\n**IMPORTANT**: All spec files are located in: `{spec_dir}/`\n"
    prompt += f"The fix request file is at: `{spec_dir}/QA_FIX_REQUEST.md`\n"

    try:
        await client.query(prompt)

        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(block.text, LogEntryType.TEXT, LogPhase.VALIDATION, print_to_console=False)
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        tool_name = block.name
                        tool_input = None

                        if hasattr(block, "input") and block.input:
                            inp = block.input
                            if isinstance(inp, dict):
                                if "file_path" in inp:
                                    fp = inp["file_path"]
                                    if len(fp) > 50:
                                        fp = "..." + fp[-47:]
                                    tool_input = fp
                                elif "command" in inp:
                                    cmd = inp["command"]
                                    if len(cmd) > 50:
                                        cmd = cmd[:47] + "..."
                                    tool_input = cmd

                        # Log tool start (handles printing)
                        if task_logger:
                            task_logger.tool_start(tool_name, tool_input, LogPhase.VALIDATION, print_to_console=True)
                        else:
                            print(f"\n[Fixer Tool: {tool_name}]", flush=True)

                        if verbose and hasattr(block, "input"):
                            input_str = str(block.input)
                            if len(input_str) > 300:
                                print(f"   Input: {input_str[:300]}...", flush=True)
                            else:
                                print(f"   Input: {input_str}", flush=True)
                        current_tool = tool_name

            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "ToolResultBlock":
                        is_error = getattr(block, "is_error", False)
                        result_content = getattr(block, "content", "")

                        if is_error:
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                # Store full error in detail for expandable view
                                task_logger.tool_end(current_tool, success=False, result=error_str[:100], detail=str(result_content), phase=LogPhase.VALIDATION)
                        else:
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                # Store full result in detail for expandable view
                                detail_content = None
                                if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                    result_str = str(result_content)
                                    if len(result_str) < 50000:
                                        detail_content = result_str
                                task_logger.tool_end(current_tool, success=True, detail=detail_content, phase=LogPhase.VALIDATION)

                        current_tool = None

        print("\n" + "-" * 70 + "\n")

        # Check if fixes were applied
        status = get_qa_signoff_status(spec_dir)
        if status and status.get("ready_for_qa_revalidation"):
            return "fixed", response_text
        else:
            # Fixer didn't update the status properly, but we'll trust it worked
            return "fixed", response_text

    except Exception as e:
        print(f"Error during fixer session: {e}")
        if task_logger:
            task_logger.log_error(f"QA fixer error: {e}", LogPhase.VALIDATION)
        return "error", str(e)


async def run_qa_validation_loop(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    verbose: bool = False,
) -> bool:
    """
    Run the full QA validation loop.

    This is the self-validating loop:
    1. QA Agent reviews
    2. If rejected → Fixer Agent fixes
    3. QA Agent re-reviews
    4. Loop until approved or max iterations

    Enhanced with:
    - Iteration tracking with detailed history
    - Recurring issue detection (3+ occurrences → human escalation)
    - No-test project handling

    Args:
        project_dir: Project root directory
        spec_dir: Spec directory
        model: Claude model to use
        verbose: Whether to show detailed output

    Returns:
        True if QA approved, False otherwise
    """
    import time as time_module

    print("\n" + "=" * 70)
    print("  QA VALIDATION LOOP")
    print("  Self-validating quality assurance")
    print("=" * 70)

    # Initialize task logger for the validation phase
    task_logger = get_task_logger(spec_dir)

    # Verify build is complete
    if not is_build_complete(spec_dir):
        print("\n❌ Build is not complete. Cannot run QA validation.")
        completed, total = count_subtasks(spec_dir)
        print(f"   Progress: {completed}/{total} subtasks completed")
        return False

    # Check if already approved
    if is_qa_approved(spec_dir):
        print("\n✅ Build already approved by QA.")
        return True

    # Check for no-test projects
    if is_no_test_project(spec_dir, project_dir):
        print("\n⚠️  No test framework detected in project.")
        print("Creating manual test plan...")
        manual_plan = create_manual_test_plan(spec_dir, spec_dir.name)
        print(f"📝 Manual test plan created: {manual_plan}")
        print("\nNote: Automated testing will be limited for this project.")

    # Start validation phase in task logger
    if task_logger:
        task_logger.start_phase(LogPhase.VALIDATION, "Starting QA validation...")

    # Check Linear integration status
    linear_task = None
    if is_linear_enabled():
        linear_task = LinearTaskState.load(spec_dir)
        if linear_task and linear_task.task_id:
            print(f"Linear task: {linear_task.task_id}")
            # Update Linear to "In Review" when QA starts
            await linear_qa_started(spec_dir)
            print("Linear task moved to 'In Review'")

    qa_iteration = get_qa_iteration_count(spec_dir)

    while qa_iteration < MAX_QA_ITERATIONS:
        qa_iteration += 1
        iteration_start = time_module.time()

        print(f"\n--- QA Iteration {qa_iteration}/{MAX_QA_ITERATIONS} ---")

        # Run QA reviewer
        client = create_client(project_dir, spec_dir, model)

        async with client:
            status, response = await run_qa_agent_session(
                client, spec_dir, qa_iteration, verbose
            )

        iteration_duration = time_module.time() - iteration_start

        if status == "approved":
            # Record successful iteration
            record_iteration(spec_dir, qa_iteration, "approved", [], iteration_duration)

            print("\n" + "=" * 70)
            print("  ✅ QA APPROVED")
            print("=" * 70)
            print("\nAll acceptance criteria verified.")
            print("The implementation is production-ready.")
            print("\nNext steps:")
            print("  1. Review the auto-claude/* branch")
            print("  2. Create a PR and merge to main")

            # End validation phase successfully
            if task_logger:
                task_logger.end_phase(LogPhase.VALIDATION, success=True, message="QA validation passed - all criteria met")

            # Update Linear: QA approved, awaiting human review
            if linear_task and linear_task.task_id:
                await linear_qa_approved(spec_dir)
                print("\nLinear: Task marked as QA approved, awaiting human review")

            return True

        elif status == "rejected":
            print(f"\n❌ QA found issues. Iteration {qa_iteration}/{MAX_QA_ITERATIONS}")

            # Get issues from QA report
            qa_status = get_qa_signoff_status(spec_dir)
            current_issues = qa_status.get("issues_found", []) if qa_status else []

            # Record rejected iteration
            record_iteration(spec_dir, qa_iteration, "rejected", current_issues, iteration_duration)

            # Check for recurring issues
            history = get_iteration_history(spec_dir)
            has_recurring, recurring_issues = has_recurring_issues(current_issues, history)

            if has_recurring:
                print(f"\n⚠️  Recurring issues detected ({len(recurring_issues)} issue(s) appeared {RECURRING_ISSUE_THRESHOLD}+ times)")
                print("Escalating to human review due to recurring issues...")

                # Create escalation file
                await escalate_to_human(spec_dir, recurring_issues, qa_iteration)

                # End validation phase
                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message=f"QA escalated to human after {qa_iteration} iterations due to recurring issues"
                    )

                # Update Linear
                if linear_task and linear_task.task_id:
                    await linear_qa_max_iterations(spec_dir, qa_iteration)
                    print("\nLinear: Task marked as needing human intervention (recurring issues)")

                return False

            # Record rejection in Linear
            if linear_task and linear_task.task_id:
                issues_count = len(current_issues)
                await linear_qa_rejected(spec_dir, issues_count, qa_iteration)

            if qa_iteration >= MAX_QA_ITERATIONS:
                print("\n⚠️  Maximum QA iterations reached.")
                print("Escalating to human review.")
                break

            # Run fixer
            print("\nRunning QA Fixer Agent...")

            fix_client = create_client(project_dir, spec_dir, model)

            async with fix_client:
                fix_status, fix_response = await run_qa_fixer_session(
                    fix_client, spec_dir, qa_iteration, verbose
                )

            if fix_status == "error":
                print(f"\n❌ Fixer encountered error: {fix_response}")
                record_iteration(spec_dir, qa_iteration, "error", [{"title": "Fixer error", "description": fix_response}])
                break

            print("\n✅ Fixes applied. Re-running QA validation...")

        elif status == "error":
            print(f"\n❌ QA error: {response}")
            record_iteration(spec_dir, qa_iteration, "error", [{"title": "QA error", "description": response}])
            print("Retrying...")

    # Max iterations reached without approval
    print("\n" + "=" * 70)
    print("  ⚠️  QA VALIDATION INCOMPLETE")
    print("=" * 70)
    print(f"\nReached maximum iterations ({MAX_QA_ITERATIONS}) without approval.")
    print("\nRemaining issues require human review:")

    # Show iteration summary
    history = get_iteration_history(spec_dir)
    summary = get_recurring_issue_summary(history)
    if summary["total_issues"] > 0:
        print(f"\n📊 Iteration Summary:")
        print(f"   Total iterations: {len(history)}")
        print(f"   Total issues found: {summary['total_issues']}")
        print(f"   Unique issues: {summary['unique_issues']}")
        if summary.get("most_common"):
            print(f"   Most common issues:")
            for issue in summary["most_common"][:3]:
                print(f"     - {issue['title']} ({issue['occurrences']} occurrences)")

    # End validation phase as failed
    if task_logger:
        task_logger.end_phase(LogPhase.VALIDATION, success=False, message=f"QA validation incomplete after {qa_iteration} iterations")

    # Show the fix request file if it exists
    fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    if fix_request_file.exists():
        print(f"\nSee: {fix_request_file}")

    qa_report_file = spec_dir / "qa_report.md"
    if qa_report_file.exists():
        print(f"See: {qa_report_file}")

    # Update Linear: max iterations reached, needs human intervention
    if linear_task and linear_task.task_id:
        await linear_qa_max_iterations(spec_dir, qa_iteration)
        print("\nLinear: Task marked as needing human intervention")

    print("\nManual intervention required.")
    return False


def print_qa_status(spec_dir: Path) -> None:
    """Print the current QA status."""
    status = get_qa_signoff_status(spec_dir)

    if not status:
        print("QA Status: Not started")
        return

    qa_status = status.get("status", "unknown")
    qa_session = status.get("qa_session", 0)
    timestamp = status.get("timestamp", "unknown")

    print(f"QA Status: {qa_status.upper()}")
    print(f"QA Sessions: {qa_session}")
    print(f"Last Updated: {timestamp}")

    if qa_status == "approved":
        tests = status.get("tests_passed", {})
        print(f"Tests: Unit {tests.get('unit', '?')}, Integration {tests.get('integration', '?')}, E2E {tests.get('e2e', '?')}")
    elif qa_status == "rejected":
        issues = status.get("issues_found", [])
        print(f"Issues Found: {len(issues)}")
        for issue in issues[:3]:  # Show first 3
            print(f"  - {issue.get('title', 'Unknown')}: {issue.get('type', 'unknown')}")
        if len(issues) > 3:
            print(f"  ... and {len(issues) - 3} more")

    # Show iteration history summary
    history = get_iteration_history(spec_dir)
    if history:
        summary = get_recurring_issue_summary(history)
        print(f"\nIteration History:")
        print(f"  Total iterations: {len(history)}")
        print(f"  Approved: {summary.get('iterations_approved', 0)}")
        print(f"  Rejected: {summary.get('iterations_rejected', 0)}")
        if summary.get("most_common"):
            print(f"  Most common issues:")
            for issue in summary["most_common"][:3]:
                print(f"    - {issue['title']} ({issue['occurrences']} occurrences)")
