"""
SDK Stream Processing Utilities
================================

Shared utilities for processing Claude Agent SDK response streams.

This module extracts common SDK message processing patterns used across
parallel orchestrator and follow-up reviewers.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any

try:
    from .io_utils import safe_print
except (ImportError, ValueError, SystemError):
    from core.io_utils import safe_print

logger = logging.getLogger(__name__)

# Check if debug mode is enabled
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("true", "1", "yes")


def _short_model_name(model: str | None) -> str:
    """Convert full model name to a short display name for logs.

    Examples:
        claude-sonnet-4-5-20250929 -> sonnet-4.5
        claude-opus-4-5-20251101 -> opus-4.5
        claude-3-5-sonnet-20241022 -> sonnet-3.5
    """
    if not model:
        return "unknown"

    model_lower = model.lower()

    # Handle new model naming (claude-{model}-{version}-{date})
    if "opus-4-5" in model_lower or "opus-4.5" in model_lower:
        return "opus-4.5"
    if "sonnet-4-5" in model_lower or "sonnet-4.5" in model_lower:
        return "sonnet-4.5"
    if "haiku-4" in model_lower:
        return "haiku-4"

    # Handle older model naming (claude-3-5-{model})
    if "3-5-sonnet" in model_lower or "3.5-sonnet" in model_lower:
        return "sonnet-3.5"
    if "3-5-haiku" in model_lower or "3.5-haiku" in model_lower:
        return "haiku-3.5"
    if "3-opus" in model_lower:
        return "opus-3"
    if "3-sonnet" in model_lower:
        return "sonnet-3"
    if "3-haiku" in model_lower:
        return "haiku-3"

    # Fallback: return last part before date (if matches pattern)
    parts = model.split("-")
    if len(parts) >= 2:
        # Try to find model type (opus, sonnet, haiku)
        for i, part in enumerate(parts):
            if part.lower() in ("opus", "sonnet", "haiku"):
                return part.lower()

    return model[:20]  # Truncate if nothing else works


async def process_sdk_stream(
    client: Any,
    on_thinking: Callable[[str], None] | None = None,
    on_tool_use: Callable[[str, str, dict[str, Any]], None] | None = None,
    on_tool_result: Callable[[str, bool, Any], None] | None = None,
    on_text: Callable[[str], None] | None = None,
    on_structured_output: Callable[[dict[str, Any]], None] | None = None,
    context_name: str = "SDK",
    model: str | None = None,
) -> dict[str, Any]:
    """
    Process SDK response stream with customizable callbacks.

    This function handles the common pattern of:
    - Tracking thinking blocks
    - Tracking tool invocations (especially Task/subagent calls)
    - Tracking tool results
    - Collecting text output
    - Extracting structured output

    Args:
        client: Claude SDK client with receive_response() method
        on_thinking: Callback for thinking blocks - receives thinking text
        on_tool_use: Callback for tool invocations - receives (tool_name, tool_id, tool_input)
        on_tool_result: Callback for tool results - receives (tool_id, is_error, result_content)
        on_text: Callback for text output - receives text string
        on_structured_output: Callback for structured output - receives dict
        context_name: Name for logging (e.g., "ParallelOrchestrator", "ParallelFollowup")
        model: Model name for logging (e.g., "claude-sonnet-4-5-20250929")

    Returns:
        Dictionary with:
        - result_text: Accumulated text output
        - structured_output: Final structured output (if any)
        - agents_invoked: List of agent names invoked via Task tool
        - msg_count: Total message count
        - subagent_tool_ids: Mapping of tool_id -> agent_name
        - error: Error message if stream processing failed (None on success)
    """
    result_text = ""
    structured_output = None
    agents_invoked = []
    msg_count = 0
    stream_error = None
    # Track subagent tool IDs to log their results
    subagent_tool_ids: dict[str, str] = {}  # tool_id -> agent_name

    safe_print(f"[{context_name}] Processing SDK stream...")
    if DEBUG_MODE:
        safe_print(f"[DEBUG {context_name}] Awaiting response stream...")

    try:
        async for msg in client.receive_response():
            try:
                msg_type = type(msg).__name__
                msg_count += 1

                if DEBUG_MODE:
                    # Log every message type for visibility
                    msg_details = ""
                    if hasattr(msg, "type"):
                        msg_details = f" (type={msg.type})"
                    safe_print(
                        f"[DEBUG {context_name}] Message #{msg_count}: {msg_type}{msg_details}"
                    )

                # Track thinking blocks
                if msg_type == "ThinkingBlock" or (
                    hasattr(msg, "type") and msg.type == "thinking"
                ):
                    thinking_text = getattr(msg, "thinking", "") or getattr(
                        msg, "text", ""
                    )
                    if thinking_text:
                        safe_print(
                            f"[{context_name}] AI thinking: {len(thinking_text)} chars"
                        )
                        if DEBUG_MODE:
                            # Show first 200 chars of thinking
                            preview = thinking_text[:200].replace("\n", " ")
                            safe_print(
                                f"[DEBUG {context_name}] Thinking preview: {preview}..."
                            )
                        # Invoke callback
                        if on_thinking:
                            on_thinking(thinking_text)

                # Track subagent invocations (Task tool calls)
                if msg_type == "ToolUseBlock" or (
                    hasattr(msg, "type") and msg.type == "tool_use"
                ):
                    tool_name = getattr(msg, "name", "")
                    tool_id = getattr(msg, "id", "unknown")
                    tool_input = getattr(msg, "input", {})

                    if DEBUG_MODE:
                        safe_print(
                            f"[DEBUG {context_name}] Tool call: {tool_name} (id={tool_id})"
                        )

                    if tool_name == "Task":
                        # Extract which agent was invoked
                        agent_name = tool_input.get("subagent_type", "unknown")
                        agents_invoked.append(agent_name)
                        # Track this tool ID to log its result later
                        subagent_tool_ids[tool_id] = agent_name
                        # Log with model info if available
                        model_info = f" [{_short_model_name(model)}]" if model else ""
                        safe_print(
                            f"[{context_name}] Invoking agent: {agent_name}{model_info}"
                        )
                    elif tool_name == "StructuredOutput":
                        if tool_input:
                            # Warn if overwriting existing structured output
                            if structured_output is not None:
                                logger.warning(
                                    f"[{context_name}] Multiple StructuredOutput blocks received, "
                                    f"overwriting previous output"
                                )
                            structured_output = tool_input
                            safe_print(f"[{context_name}] Received structured output")
                            # Invoke callback
                            if on_structured_output:
                                on_structured_output(tool_input)
                    elif DEBUG_MODE:
                        # Log other tool calls in debug mode
                        safe_print(f"[DEBUG {context_name}] Other tool: {tool_name}")

                    # Invoke callback for all tool uses
                    if on_tool_use:
                        on_tool_use(tool_name, tool_id, tool_input)

                # Track tool results
                if msg_type == "ToolResultBlock" or (
                    hasattr(msg, "type") and msg.type == "tool_result"
                ):
                    tool_id = getattr(msg, "tool_use_id", "unknown")
                    is_error = getattr(msg, "is_error", False)
                    result_content = getattr(msg, "content", "")

                    # Handle list of content blocks
                    if isinstance(result_content, list):
                        result_content = " ".join(
                            str(getattr(c, "text", c)) for c in result_content
                        )

                    # Check if this is a subagent result
                    if tool_id in subagent_tool_ids:
                        agent_name = subagent_tool_ids[tool_id]
                        status = "ERROR" if is_error else "complete"
                        result_preview = (
                            str(result_content)[:600].replace("\n", " ").strip()
                        )
                        safe_print(
                            f"[Agent:{agent_name}] {status}: {result_preview}{'...' if len(str(result_content)) > 600 else ''}"
                        )
                    elif DEBUG_MODE:
                        status = "ERROR" if is_error else "OK"
                        safe_print(
                            f"[DEBUG {context_name}] Tool result: {tool_id} [{status}]"
                        )

                    # Invoke callback
                    if on_tool_result:
                        on_tool_result(tool_id, is_error, result_content)

                # Collect text output and check for tool uses in content blocks
                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__

                        # Check for tool use blocks within content
                        if (
                            block_type == "ToolUseBlock"
                            or getattr(block, "type", "") == "tool_use"
                        ):
                            tool_name = getattr(block, "name", "")
                            tool_id = getattr(block, "id", "unknown")
                            tool_input = getattr(block, "input", {})

                            if tool_name == "Task":
                                agent_name = tool_input.get("subagent_type", "unknown")
                                if agent_name not in agents_invoked:
                                    agents_invoked.append(agent_name)
                                    subagent_tool_ids[tool_id] = agent_name
                                    # Log with model info if available
                                    model_info = (
                                        f" [{_short_model_name(model)}]"
                                        if model
                                        else ""
                                    )
                                    safe_print(
                                        f"[{context_name}] Invoking agent: {agent_name}{model_info}"
                                    )
                            elif tool_name == "StructuredOutput":
                                if tool_input:
                                    # Warn if overwriting existing structured output
                                    if structured_output is not None:
                                        logger.warning(
                                            f"[{context_name}] Multiple StructuredOutput blocks received, "
                                            f"overwriting previous output"
                                        )
                                    structured_output = tool_input
                                    # Invoke callback
                                    if on_structured_output:
                                        on_structured_output(tool_input)

                            # Invoke callback
                            if on_tool_use:
                                on_tool_use(tool_name, tool_id, tool_input)

                        # Collect text - must check block type since only TextBlock has .text
                        block_type = type(block).__name__
                        if block_type == "TextBlock" and hasattr(block, "text"):
                            result_text += block.text
                            # Always print text content preview (not just in DEBUG_MODE)
                            text_preview = block.text[:500].replace("\n", " ").strip()
                            if text_preview:
                                safe_print(
                                    f"[{context_name}] AI response: {text_preview}{'...' if len(block.text) > 500 else ''}"
                                )
                                # Invoke callback
                                if on_text:
                                    on_text(block.text)

                        # Check for StructuredOutput in content (legacy check)
                        if getattr(block, "name", "") == "StructuredOutput":
                            structured_data = getattr(block, "input", None)
                            if structured_data:
                                # Warn if overwriting existing structured output
                                if structured_output is not None:
                                    logger.warning(
                                        f"[{context_name}] Multiple StructuredOutput blocks received, "
                                        f"overwriting previous output"
                                    )
                                structured_output = structured_data
                                # Invoke callback
                                if on_structured_output:
                                    on_structured_output(structured_data)

                # Check for ResultMessage with structured output (per Anthropic SDK docs)
                # See: https://platform.claude.com/docs/en/agent-sdk/structured-outputs
                if hasattr(msg, "type") and msg.type == "result":
                    subtype = getattr(msg, "subtype", None)
                    if subtype == "success":
                        if hasattr(msg, "structured_output") and msg.structured_output:
                            # Warn if overwriting existing structured output
                            if structured_output is not None:
                                logger.warning(
                                    f"[{context_name}] Multiple StructuredOutput blocks received, "
                                    f"overwriting previous output"
                                )
                            structured_output = msg.structured_output
                            safe_print(
                                f"[{context_name}] Received structured output from ResultMessage"
                            )
                            # Invoke callback
                            if on_structured_output:
                                on_structured_output(msg.structured_output)
                    elif subtype == "error_max_structured_output_retries":
                        # SDK failed to produce valid structured output after retries
                        logger.warning(
                            f"[{context_name}] Claude could not produce valid structured output "
                            f"after maximum retries - schema validation failed"
                        )
                        safe_print(
                            f"[{context_name}] WARNING: Structured output validation failed after retries"
                        )
                        # Set error so caller knows structured output isn't available
                        if not stream_error:
                            stream_error = "structured_output_validation_failed"
                    elif DEBUG_MODE:
                        safe_print(
                            f"[DEBUG {context_name}] ResultMessage subtype: {subtype}"
                        )
                # Fallback: Check for structured_output attribute on any message type
                # (handles legacy SDK versions or alternative message formats)
                elif hasattr(msg, "structured_output") and msg.structured_output:
                    # Warn if overwriting existing structured output
                    if structured_output is not None:
                        logger.warning(
                            f"[{context_name}] Multiple StructuredOutput blocks received, "
                            f"overwriting previous output"
                        )
                    structured_output = msg.structured_output
                    safe_print(
                        f"[{context_name}] Received structured output (fallback)"
                    )
                    # Invoke callback
                    if on_structured_output:
                        on_structured_output(msg.structured_output)

                # Check for tool results in UserMessage (subagent results come back here)
                if msg_type == "UserMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__
                        # Check for tool result blocks
                        if (
                            block_type == "ToolResultBlock"
                            or getattr(block, "type", "") == "tool_result"
                        ):
                            tool_id = getattr(block, "tool_use_id", "unknown")
                            is_error = getattr(block, "is_error", False)
                            result_content = getattr(block, "content", "")

                            # Handle list of content blocks
                            if isinstance(result_content, list):
                                result_content = " ".join(
                                    str(getattr(c, "text", c)) for c in result_content
                                )

                            # Check if this is a subagent result
                            if tool_id in subagent_tool_ids:
                                agent_name = subagent_tool_ids[tool_id]
                                status = "ERROR" if is_error else "complete"
                                result_preview = (
                                    str(result_content)[:600].replace("\n", " ").strip()
                                )
                                safe_print(
                                    f"[Agent:{agent_name}] {status}: {result_preview}{'...' if len(str(result_content)) > 600 else ''}"
                                )

                            # Invoke callback
                            if on_tool_result:
                                on_tool_result(tool_id, is_error, result_content)

            except (AttributeError, TypeError, KeyError) as msg_error:
                # Log individual message processing errors but continue
                logger.warning(
                    f"[{context_name}] Error processing message #{msg_count}: {msg_error}"
                )
                if DEBUG_MODE:
                    safe_print(
                        f"[DEBUG {context_name}] Message processing error: {msg_error}"
                    )
                # Continue processing subsequent messages

    except BrokenPipeError:
        # Pipe closed by parent process - expected during shutdown
        stream_error = "Output pipe closed"
        logger.debug(f"[{context_name}] Output pipe closed by parent process")
    except Exception as e:
        # Log stream-level errors
        stream_error = str(e)
        logger.error(f"[{context_name}] SDK stream processing failed: {e}")
        safe_print(f"[{context_name}] ERROR: Stream processing failed: {e}")

    if DEBUG_MODE:
        safe_print(f"[DEBUG {context_name}] Session ended. Total messages: {msg_count}")

    safe_print(f"[{context_name}] Session ended. Total messages: {msg_count}")

    return {
        "result_text": result_text,
        "structured_output": structured_output,
        "agents_invoked": agents_invoked,
        "msg_count": msg_count,
        "subagent_tool_ids": subagent_tool_ids,
        "error": stream_error,
    }
