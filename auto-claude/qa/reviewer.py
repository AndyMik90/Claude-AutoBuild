"""
QA Reviewer Agent Session
==========================

Runs QA validation sessions to review implementation against
acceptance criteria.
"""

from pathlib import Path

from claude_agent_sdk import ClaudeSDKClient
from debug import debug, debug_detailed, debug_error, debug_section, debug_success
from task_logger import (
    LogEntryType,
    LogPhase,
    get_task_logger,
)

from .criteria import get_qa_signoff_status

# Configuration
QA_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


# =============================================================================
# PROMPT LOADING
# =============================================================================


def load_qa_reviewer_prompt() -> str:
    """Load the QA reviewer agent prompt."""
    prompt_file = QA_PROMPTS_DIR / "qa_reviewer.md"
    if not prompt_file.exists():
        raise FileNotFoundError(f"QA reviewer prompt not found: {prompt_file}")
    return prompt_file.read_text()


# =============================================================================
# QA REVIEWER SESSION
# =============================================================================


async def run_qa_agent_session(
    client: ClaudeSDKClient,
    spec_dir: Path,
    qa_session: int,
    max_iterations: int,
    verbose: bool = False,
) -> tuple[str, str]:
    """
    Run a QA reviewer agent session.

    Args:
        client: Claude SDK client
        spec_dir: Spec directory
        qa_session: QA iteration number
        max_iterations: Maximum number of QA iterations
        verbose: Whether to show detailed output

    Returns:
        (status, response_text) where status is:
        - "approved" if QA approves
        - "rejected" if QA finds issues
        - "error" if an error occurred
    """
    debug_section("qa_reviewer", f"QA Reviewer Session {qa_session}")
    debug(
        "qa_reviewer",
        "Starting QA reviewer session",
        spec_dir=str(spec_dir),
        qa_session=qa_session,
        max_iterations=max_iterations,
    )

    print(f"\n{'=' * 70}")
    print(f"  QA REVIEWER SESSION {qa_session}")
    print("  Validating all acceptance criteria...")
    print(f"{'=' * 70}\n")

    # Get task logger for streaming markers
    task_logger = get_task_logger(spec_dir)
    current_tool = None
    message_count = 0
    tool_count = 0

    # Load QA prompt
    prompt = load_qa_reviewer_prompt()
    debug_detailed(
        "qa_reviewer", "Loaded QA reviewer prompt", prompt_length=len(prompt)
    )

    # Add session context - use full path so agent can find files
    prompt += f"\n\n---\n\n**QA Session**: {qa_session}\n"
    prompt += f"**Spec Directory**: {spec_dir}\n"
    prompt += f"**Spec Name**: {spec_dir.name}\n"
    prompt += f"**Max Iterations**: {max_iterations}\n"
    prompt += f"\n**IMPORTANT**: All spec files (spec.md, implementation_plan.json, etc.) are located in: `{spec_dir}/`\n"
    prompt += f"Use the full path when reading files, e.g.: `cat {spec_dir}/spec.md`\n"

    try:
        debug("qa_reviewer", "Sending query to Claude SDK...")
        await client.query(prompt)
        debug_success("qa_reviewer", "Query sent successfully")

        response_text = ""
        debug("qa_reviewer", "Starting to receive response stream...")
        async for msg in client.receive_response():
            msg_type = type(msg).__name__
            message_count += 1
            debug_detailed(
                "qa_reviewer",
                f"Received message #{message_count}",
                msg_type=msg_type,
            )

            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(
                                block.text,
                                LogEntryType.TEXT,
                                LogPhase.VALIDATION,
                                print_to_console=False,
                            )
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        tool_name = block.name
                        tool_input = None
                        tool_count += 1

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

                        debug(
                            "qa_reviewer",
                            f"Tool call #{tool_count}: {tool_name}",
                            tool_input=tool_input,
                        )

                        # Log tool start (handles printing)
                        if task_logger:
                            task_logger.tool_start(
                                tool_name,
                                tool_input,
                                LogPhase.VALIDATION,
                                print_to_console=True,
                            )
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
                            debug_error(
                                "qa_reviewer",
                                f"Tool error: {current_tool}",
                                error=str(result_content)[:200],
                            )
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                # Store full error in detail for expandable view
                                task_logger.tool_end(
                                    current_tool,
                                    success=False,
                                    result=error_str[:100],
                                    detail=str(result_content),
                                    phase=LogPhase.VALIDATION,
                                )
                        else:
                            debug_detailed(
                                "qa_reviewer",
                                f"Tool success: {current_tool}",
                                result_length=len(str(result_content)),
                            )
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                # Store full result in detail for expandable view
                                detail_content = None
                                if current_tool in (
                                    "Read",
                                    "Grep",
                                    "Bash",
                                    "Edit",
                                    "Write",
                                ):
                                    result_str = str(result_content)
                                    if len(result_str) < 50000:
                                        detail_content = result_str
                                task_logger.tool_end(
                                    current_tool,
                                    success=True,
                                    detail=detail_content,
                                    phase=LogPhase.VALIDATION,
                                )

                        current_tool = None

        print("\n" + "-" * 70 + "\n")

        # Check the QA result from implementation_plan.json
        status = get_qa_signoff_status(spec_dir)
        debug(
            "qa_reviewer",
            "QA session completed",
            message_count=message_count,
            tool_count=tool_count,
            response_length=len(response_text),
            qa_status=status.get("status") if status else "unknown",
        )
        if status and status.get("status") == "approved":
            debug_success("qa_reviewer", "QA APPROVED")
            return "approved", response_text
        elif status and status.get("status") == "rejected":
            debug_error("qa_reviewer", "QA REJECTED")
            return "rejected", response_text
        else:
            # Agent didn't update the status properly
            debug_error(
                "qa_reviewer", "QA agent did not update implementation_plan.json"
            )
            return "error", "QA agent did not update implementation_plan.json"

    except Exception as e:
        debug_error(
            "qa_reviewer",
            f"QA session exception: {e}",
            exception_type=type(e).__name__,
        )
        print(f"Error during QA session: {e}")
        if task_logger:
            task_logger.log_error(f"QA session error: {e}", LogPhase.VALIDATION)
        return "error", str(e)
