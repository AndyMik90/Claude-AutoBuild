"""
Insight Extractor
=================

Automatically extracts structured insights from completed coding sessions.
Runs after each session to capture rich, actionable knowledge for Graphiti memory.

Uses Haiku by default for fast, cheap extraction (~$0.001 per extraction).
Falls back to generic insights if extraction fails (never blocks the build).
"""

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Default model for insight extraction (fast and cheap)
DEFAULT_EXTRACTION_MODEL = "claude-3-5-haiku-latest"

# Maximum diff size to send to the LLM (avoid context limits)
MAX_DIFF_CHARS = 15000

# Maximum attempt history entries to include
MAX_ATTEMPTS_TO_INCLUDE = 3


def is_extraction_enabled() -> bool:
    """Check if insight extraction is enabled."""
    enabled_str = os.environ.get("INSIGHT_EXTRACTION_ENABLED", "true").lower()
    return enabled_str in ("true", "1", "yes")


def get_extraction_model() -> str:
    """Get the model to use for insight extraction."""
    return os.environ.get("INSIGHT_EXTRACTOR_MODEL", DEFAULT_EXTRACTION_MODEL)


# =============================================================================
# Git Helpers
# =============================================================================

def get_session_diff(
    project_dir: Path,
    commit_before: Optional[str],
    commit_after: Optional[str],
) -> str:
    """
    Get the git diff between two commits.

    Args:
        project_dir: Project root directory
        commit_before: Commit hash before session (or None)
        commit_after: Commit hash after session (or None)

    Returns:
        Diff text (truncated if too large)
    """
    if not commit_before or not commit_after:
        return "(No commits to diff)"

    if commit_before == commit_after:
        return "(No changes - same commit)"

    try:
        result = subprocess.run(
            ["git", "diff", commit_before, commit_after],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )
        diff = result.stdout

        if len(diff) > MAX_DIFF_CHARS:
            # Truncate and add note
            diff = diff[:MAX_DIFF_CHARS] + f"\n\n... (truncated, {len(diff)} chars total)"

        return diff if diff else "(Empty diff)"

    except subprocess.TimeoutExpired:
        logger.warning("Git diff timed out")
        return "(Git diff timed out)"
    except Exception as e:
        logger.warning(f"Failed to get git diff: {e}")
        return f"(Failed to get diff: {e})"


def get_changed_files(
    project_dir: Path,
    commit_before: Optional[str],
    commit_after: Optional[str],
) -> list[str]:
    """
    Get list of files changed between two commits.

    Args:
        project_dir: Project root directory
        commit_before: Commit hash before session
        commit_after: Commit hash after session

    Returns:
        List of changed file paths
    """
    if not commit_before or not commit_after or commit_before == commit_after:
        return []

    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", commit_before, commit_after],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
        return files

    except Exception as e:
        logger.warning(f"Failed to get changed files: {e}")
        return []


def get_commit_messages(
    project_dir: Path,
    commit_before: Optional[str],
    commit_after: Optional[str],
) -> str:
    """Get commit messages between two commits."""
    if not commit_before or not commit_after or commit_before == commit_after:
        return "(No commits)"

    try:
        result = subprocess.run(
            ["git", "log", "--oneline", f"{commit_before}..{commit_after}"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip() if result.stdout.strip() else "(No commits)"

    except Exception as e:
        logger.warning(f"Failed to get commit messages: {e}")
        return f"(Failed: {e})"


# =============================================================================
# Input Gathering
# =============================================================================

def gather_extraction_inputs(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    commit_before: Optional[str],
    commit_after: Optional[str],
    success: bool,
    recovery_manager: Any,
) -> dict:
    """
    Gather all inputs needed for insight extraction.

    Args:
        spec_dir: Spec directory
        project_dir: Project root
        subtask_id: The subtask that was worked on
        session_num: Session number
        commit_before: Commit before session
        commit_after: Commit after session
        success: Whether session succeeded
        recovery_manager: Recovery manager with attempt history

    Returns:
        Dict with all inputs for the extractor
    """
    # Get subtask description from implementation plan
    subtask_description = _get_subtask_description(spec_dir, subtask_id)

    # Get git diff
    diff = get_session_diff(project_dir, commit_before, commit_after)

    # Get changed files
    changed_files = get_changed_files(project_dir, commit_before, commit_after)

    # Get commit messages
    commit_messages = get_commit_messages(project_dir, commit_before, commit_after)

    # Get attempt history
    attempt_history = _get_attempt_history(recovery_manager, subtask_id)

    return {
        "subtask_id": subtask_id,
        "subtask_description": subtask_description,
        "session_num": session_num,
        "success": success,
        "diff": diff,
        "changed_files": changed_files,
        "commit_messages": commit_messages,
        "attempt_history": attempt_history,
    }


def _get_subtask_description(spec_dir: Path, subtask_id: str) -> str:
    """Get subtask description from implementation plan."""
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return f"Subtask: {subtask_id}"

    try:
        with open(plan_file) as f:
            plan = json.load(f)

        # Search through phases for the subtask
        for phase in plan.get("phases", []):
            for subtask in phase.get("subtasks", []):
                if subtask.get("id") == subtask_id:
                    return subtask.get("description", f"Subtask: {subtask_id}")

        return f"Subtask: {subtask_id}"

    except Exception as e:
        logger.warning(f"Failed to load subtask description: {e}")
        return f"Subtask: {subtask_id}"


def _get_attempt_history(recovery_manager: Any, subtask_id: str) -> list[dict]:
    """Get previous attempt history for this subtask."""
    if not recovery_manager:
        return []

    try:
        history = recovery_manager.get_subtask_history(subtask_id)
        attempts = history.get("attempts", [])

        # Limit to recent attempts
        return attempts[-MAX_ATTEMPTS_TO_INCLUDE:]

    except Exception as e:
        logger.warning(f"Failed to get attempt history: {e}")
        return []


# =============================================================================
# LLM Extraction
# =============================================================================

def _build_extraction_prompt(inputs: dict) -> str:
    """Build the prompt for insight extraction."""
    prompt_file = Path(__file__).parent / "prompts" / "insight_extractor.md"

    if prompt_file.exists():
        base_prompt = prompt_file.read_text()
    else:
        # Fallback if prompt file missing
        base_prompt = """Extract structured insights from this coding session.
Output ONLY valid JSON with: file_insights, patterns_discovered, gotchas_discovered, approach_outcome, recommendations"""

    # Build session context
    session_context = f"""
---

## SESSION DATA

### Subtask
- **ID**: {inputs['subtask_id']}
- **Description**: {inputs['subtask_description']}
- **Session Number**: {inputs['session_num']}
- **Outcome**: {'SUCCESS' if inputs['success'] else 'FAILED'}

### Files Changed
{chr(10).join(f'- {f}' for f in inputs['changed_files']) if inputs['changed_files'] else '(No files changed)'}

### Commit Messages
{inputs['commit_messages']}

### Git Diff
```diff
{inputs['diff']}
```

### Previous Attempts
{_format_attempt_history(inputs['attempt_history'])}

---

Now analyze this session and output ONLY the JSON object.
"""

    return base_prompt + session_context


def _format_attempt_history(attempts: list[dict]) -> str:
    """Format attempt history for the prompt."""
    if not attempts:
        return "(First attempt - no previous history)"

    lines = []
    for i, attempt in enumerate(attempts, 1):
        success = "SUCCESS" if attempt.get("success") else "FAILED"
        approach = attempt.get("approach", "Unknown approach")
        error = attempt.get("error", "")
        lines.append(f"**Attempt {i}** ({success}): {approach}")
        if error:
            lines.append(f"  Error: {error}")

    return "\n".join(lines)


async def run_insight_extraction(inputs: dict) -> Optional[dict]:
    """
    Run the insight extraction using Anthropic API.

    Args:
        inputs: Gathered session inputs

    Returns:
        Extracted insights dict or None if failed
    """
    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic package not installed, skipping insight extraction")
        return None

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set, skipping insight extraction")
        return None

    model = get_extraction_model()
    prompt = _build_extraction_prompt(inputs)

    try:
        client = anthropic.Anthropic(api_key=api_key)

        message = client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ],
        )

        # Extract text content
        response_text = ""
        for block in message.content:
            if hasattr(block, "text"):
                response_text += block.text

        # Parse JSON from response
        return parse_insights(response_text)

    except Exception as e:
        logger.warning(f"Insight extraction failed: {e}")
        return None


def parse_insights(response_text: str) -> Optional[dict]:
    """
    Parse the LLM response into structured insights.

    Args:
        response_text: Raw LLM response

    Returns:
        Parsed insights dict or None if parsing failed
    """
    # Try to extract JSON from the response
    text = response_text.strip()

    # Handle markdown code blocks
    if text.startswith("```"):
        # Remove code block markers
        lines = text.split("\n")
        # Remove first line (```json or ```)
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Remove last line if it's ``
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        insights = json.loads(text)

        # Validate structure
        if not isinstance(insights, dict):
            logger.warning("Insights is not a dict")
            return None

        # Ensure required keys exist with defaults
        insights.setdefault("file_insights", [])
        insights.setdefault("patterns_discovered", [])
        insights.setdefault("gotchas_discovered", [])
        insights.setdefault("approach_outcome", {})
        insights.setdefault("recommendations", [])

        return insights

    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse insights JSON: {e}")
        logger.debug(f"Response text was: {text[:500]}")
        return None


# =============================================================================
# Main Entry Point
# =============================================================================

async def extract_session_insights(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    commit_before: Optional[str],
    commit_after: Optional[str],
    success: bool,
    recovery_manager: Any,
) -> dict:
    """
    Extract insights from a completed coding session.

    This is the main entry point called from post_session_processing().
    Falls back to generic insights if extraction fails.

    Args:
        spec_dir: Spec directory
        project_dir: Project root
        subtask_id: Subtask that was worked on
        session_num: Session number
        commit_before: Commit before session
        commit_after: Commit after session
        success: Whether session succeeded
        recovery_manager: Recovery manager with attempt history

    Returns:
        Insights dict (rich if extraction succeeded, generic if failed)
    """
    # Check if extraction is enabled
    if not is_extraction_enabled():
        logger.info("Insight extraction disabled")
        return _get_generic_insights(subtask_id, success)

    # Check for no changes
    if commit_before == commit_after:
        logger.info("No changes to extract insights from")
        return _get_generic_insights(subtask_id, success)

    try:
        # Gather inputs
        inputs = gather_extraction_inputs(
            spec_dir=spec_dir,
            project_dir=project_dir,
            subtask_id=subtask_id,
            session_num=session_num,
            commit_before=commit_before,
            commit_after=commit_after,
            success=success,
            recovery_manager=recovery_manager,
        )

        # Run extraction
        extracted = await run_insight_extraction(inputs)

        if extracted:
            # Add metadata
            extracted["subtask_id"] = subtask_id
            extracted["session_num"] = session_num
            extracted["success"] = success
            extracted["changed_files"] = inputs["changed_files"]

            logger.info(
                f"Extracted insights: {len(extracted.get('file_insights', []))} file insights, "
                f"{len(extracted.get('patterns_discovered', []))} patterns, "
                f"{len(extracted.get('gotchas_discovered', []))} gotchas"
            )
            return extracted
        else:
            logger.warning("Extraction returned no results, using generic insights")
            return _get_generic_insights(subtask_id, success)

    except Exception as e:
        logger.warning(f"Insight extraction failed: {e}, using generic insights")
        return _get_generic_insights(subtask_id, success)


def _get_generic_insights(subtask_id: str, success: bool) -> dict:
    """Return generic insights when extraction fails or is disabled."""
    return {
        "file_insights": [],
        "patterns_discovered": [],
        "gotchas_discovered": [],
        "approach_outcome": {
            "success": success,
            "approach_used": f"Implemented subtask: {subtask_id}",
            "why_it_worked": None,
            "why_it_failed": None,
            "alternatives_tried": [],
        },
        "recommendations": [],
        "subtask_id": subtask_id,
        "success": success,
        "changed_files": [],
    }


# =============================================================================
# CLI for Testing
# =============================================================================

if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description="Test insight extraction")
    parser.add_argument("--spec-dir", type=Path, required=True, help="Spec directory")
    parser.add_argument("--project-dir", type=Path, required=True, help="Project directory")
    parser.add_argument("--commit-before", type=str, required=True, help="Commit before session")
    parser.add_argument("--commit-after", type=str, required=True, help="Commit after session")
    parser.add_argument("--subtask-id", type=str, default="test-subtask", help="Subtask ID")

    args = parser.parse_args()

    async def main():
        insights = await extract_session_insights(
            spec_dir=args.spec_dir,
            project_dir=args.project_dir,
            subtask_id=args.subtask_id,
            session_num=1,
            commit_before=args.commit_before,
            commit_after=args.commit_after,
            success=True,
            recovery_manager=None,
        )
        print(json.dumps(insights, indent=2))

    asyncio.run(main())
