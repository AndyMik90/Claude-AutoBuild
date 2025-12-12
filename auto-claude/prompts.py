"""
Prompt Loading Utilities
========================

Functions for loading agent prompts from markdown files.
"""

from pathlib import Path


# Directory containing prompt files
PROMPTS_DIR = Path(__file__).parent / "prompts"


def get_planner_prompt(spec_dir: Path) -> str:
    """
    Load the planner agent prompt with spec path injected.
    The planner creates chunk-based implementation plans.

    Args:
        spec_dir: Directory containing the spec.md file

    Returns:
        The planner prompt content with spec path
    """
    prompt_file = PROMPTS_DIR / "planner.md"

    if not prompt_file.exists():
        raise FileNotFoundError(
            f"Planner prompt not found at {prompt_file}\n"
            "Make sure the auto-claude/prompts/planner.md file exists."
        )

    prompt = prompt_file.read_text()

    # Inject spec directory information at the beginning
    spec_context = f"""## SPEC LOCATION

Your spec file is located at: `{spec_dir}/spec.md`

Store all build artifacts in this spec directory:
- `{spec_dir}/implementation_plan.json` - Chunk-based implementation plan
- `{spec_dir}/build-progress.txt` - Progress notes
- `{spec_dir}/init.sh` - Environment setup script

The project root is the parent of auto-claude/. Implement code in the project root, not in the spec directory.

---

"""
    return spec_context + prompt


def get_coding_prompt(spec_dir: Path) -> str:
    """
    Load the coding agent prompt with spec path injected.

    Args:
        spec_dir: Directory containing the spec.md and implementation_plan.json

    Returns:
        The coding agent prompt content with spec path
    """
    prompt_file = PROMPTS_DIR / "coder.md"

    if not prompt_file.exists():
        raise FileNotFoundError(
            f"Coding prompt not found at {prompt_file}\n"
            "Make sure the auto-claude/prompts/coder.md file exists."
        )

    prompt = prompt_file.read_text()

    spec_context = f"""## SPEC LOCATION

Your spec and progress files are located at:
- Spec: `{spec_dir}/spec.md`
- Implementation plan: `{spec_dir}/implementation_plan.json`
- Progress notes: `{spec_dir}/build-progress.txt`
- Recovery context: `{spec_dir}/memory/attempt_history.json`

The project root is the parent of auto-claude/. All code goes in the project root, not in the spec directory.

---

"""

    # Check for recovery context (stuck chunks, retry hints)
    recovery_context = _get_recovery_context(spec_dir)
    if recovery_context:
        spec_context += recovery_context

    # Check for human input file
    human_input_file = spec_dir / "HUMAN_INPUT.md"
    if human_input_file.exists():
        human_input = human_input_file.read_text().strip()
        if human_input:
            spec_context += f"""## HUMAN INPUT (READ THIS FIRST!)

The human has left you instructions. READ AND FOLLOW THESE CAREFULLY:

{human_input}

After addressing this input, you may delete or clear the HUMAN_INPUT.md file.

---

"""

    return spec_context + prompt


def _get_recovery_context(spec_dir: Path) -> str:
    """
    Get recovery context if there are failed attempts or stuck chunks.

    Args:
        spec_dir: Spec directory containing memory/

    Returns:
        Recovery context string or empty string
    """
    import json

    attempt_history_file = spec_dir / "memory" / "attempt_history.json"

    if not attempt_history_file.exists():
        return ""

    try:
        with open(attempt_history_file) as f:
            history = json.load(f)

        # Check for stuck chunks
        stuck_chunks = history.get("stuck_chunks", [])
        if stuck_chunks:
            context = """## ⚠️ RECOVERY ALERT - STUCK CHUNKS DETECTED

Some chunks have been attempted multiple times without success. These chunks need:
- A COMPLETELY DIFFERENT approach
- Possibly simpler implementation
- Or escalation to human if infeasible

Stuck chunks:
"""
            for stuck in stuck_chunks:
                context += f"- {stuck['chunk_id']}: {stuck['reason']} ({stuck['attempt_count']} attempts)\n"

            context += "\nBefore working on any chunk, check memory/attempt_history.json for previous attempts!\n\n---\n\n"
            return context

        # Check for chunks with multiple attempts
        chunks_with_retries = []
        for chunk_id, chunk_data in history.get("chunks", {}).items():
            attempts = chunk_data.get("attempts", [])
            if len(attempts) > 1 and chunk_data.get("status") != "completed":
                chunks_with_retries.append((chunk_id, len(attempts)))

        if chunks_with_retries:
            context = """## ⚠️ RECOVERY CONTEXT - RETRY AWARENESS

Some chunks have been attempted before. When working on these:
1. READ memory/attempt_history.json for the specific chunk
2. See what approaches were tried
3. Use a DIFFERENT approach

Chunks with previous attempts:
"""
            for chunk_id, attempt_count in chunks_with_retries:
                context += f"- {chunk_id}: {attempt_count} attempts\n"

            context += "\n---\n\n"
            return context

        return ""

    except (json.JSONDecodeError, IOError):
        return ""


def get_followup_planner_prompt(spec_dir: Path) -> str:
    """
    Load the follow-up planner agent prompt with spec path and key files injected.
    The follow-up planner adds new chunks to an existing completed implementation plan.

    Args:
        spec_dir: Directory containing the completed spec and implementation_plan.json

    Returns:
        The follow-up planner prompt content with paths injected
    """
    prompt_file = PROMPTS_DIR / "followup_planner.md"

    if not prompt_file.exists():
        raise FileNotFoundError(
            f"Follow-up planner prompt not found at {prompt_file}\n"
            "Make sure the auto-claude/prompts/followup_planner.md file exists."
        )

    prompt = prompt_file.read_text()

    # Inject spec directory information at the beginning
    spec_context = f"""## SPEC LOCATION (FOLLOW-UP MODE)

You are adding follow-up work to a **completed** spec.

**Key files in this spec directory:**
- Spec: `{spec_dir}/spec.md`
- Follow-up request: `{spec_dir}/FOLLOWUP_REQUEST.md` (READ THIS FIRST!)
- Implementation plan: `{spec_dir}/implementation_plan.json` (APPEND to this, don't replace)
- Progress notes: `{spec_dir}/build-progress.txt`
- Context: `{spec_dir}/context.json`
- Memory: `{spec_dir}/memory/`

**Important paths:**
- Spec directory: `{spec_dir}`
- Project root: Parent of auto-claude/ (where code should be implemented)

**Your task:**
1. Read `{spec_dir}/FOLLOWUP_REQUEST.md` to understand what to add
2. Read `{spec_dir}/implementation_plan.json` to see existing phases/chunks
3. ADD new phase(s) with pending chunks to the existing plan
4. PRESERVE all existing chunks and their statuses

---

"""
    return spec_context + prompt


def is_first_run(spec_dir: Path) -> bool:
    """
    Check if this is the first run (no implementation plan exists yet).

    Args:
        spec_dir: Directory containing spec files

    Returns:
        True if implementation_plan.json doesn't exist
    """
    plan_file = spec_dir / "implementation_plan.json"
    return not plan_file.exists()
