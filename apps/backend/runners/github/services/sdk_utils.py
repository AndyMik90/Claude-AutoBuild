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

logger = logging.getLogger(__name__)

# Check if debug mode is enabled
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("true", "1", "yes")


async def process_sdk_stream(
    client: Any,
    on_thinking: Callable[[str], None] | None = None,
    on_tool_use: Callable[[str, str, dict[str, Any]], None] | None = None,
    on_tool_result: Callable[[str, bool, Any], None] | None = None,
    on_text: Callable[[str], None] | None = None,
    on_structured_output: Callable[[dict[str, Any]], None] | None = None,
    context_name: str = "SDK",
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

    print(f"[{context_name}] Processing SDK stream...", flush=True)
    if DEBUG_MODE:
        print(f"[DEBUG {context_name}] Awaiting response stream...", flush=True)

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
                    print(
                        f"[DEBUG {context_name}] Message #{msg_count}: {msg_type}{msg_details}",
                        flush=True,
                    )

                # Track thinking blocks
                if msg_type == "ThinkingBlock" or (
                    hasattr(msg, "type") and msg.type == "thinking"
                ):
                    thinking_text = getattr(msg, "thinking", "") or getattr(
                        msg, "text", ""
                    )
                    if thinking_text:
                        print(
                            f"[{context_name}] AI thinking: {len(thinking_text)} chars",
                            flush=True,
                        )
                        if DEBUG_MODE:
                            # Show first 200 chars of thinking
                            preview = thinking_text[:200].replace("\n", " ")
                            print(
                                f"[DEBUG {context_name}] Thinking preview: {preview}...",
                                flush=True,
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
                        print(
                            f"[DEBUG {context_name}] Tool call: {tool_name} (id={tool_id})",
                            flush=True,
                        )

                    if tool_name == "Task":
                        # Extract which agent was invoked
                        agent_name = tool_input.get("subagent_type", "unknown")
                        agents_invoked.append(agent_name)
                        # Track this tool ID to log its result later
                        subagent_tool_ids[tool_id] = agent_name
                        print(
                            f"[{context_name}] Invoked agent: {agent_name}", flush=True
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
                            print(
                                f"[{context_name}] Received structured output",
                                flush=True,
                            )
                            # Invoke callback
                            if on_structured_output:
                                on_structured_output(tool_input)
                    elif DEBUG_MODE:
                        # Log other tool calls in debug mode
                        print(
                            f"[DEBUG {context_name}] Other tool: {tool_name}",
                            flush=True,
                        )

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
                        print(
                            f"[Agent:{agent_name}] {status}: {result_preview}{'...' if len(str(result_content)) > 600 else ''}",
                            flush=True,
                        )
                    elif DEBUG_MODE:
                        status = "ERROR" if is_error else "OK"
                        print(
                            f"[DEBUG {context_name}] Tool result: {tool_id} [{status}]",
                            flush=True,
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
                                    print(
                                        f"[{context_name}] Invoking agent: {agent_name}",
                                        flush=True,
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
                                print(
                                    f"[{context_name}] AI response: {text_preview}{'...' if len(block.text) > 500 else ''}",
                                    flush=True,
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

                # Check for structured_output attribute
                if hasattr(msg, "structured_output") and msg.structured_output:
                    # Warn if overwriting existing structured output
                    if structured_output is not None:
                        logger.warning(
                            f"[{context_name}] Multiple StructuredOutput blocks received, "
                            f"overwriting previous output"
                        )
                    structured_output = msg.structured_output
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
                                print(
                                    f"[Agent:{agent_name}] {status}: {result_preview}{'...' if len(str(result_content)) > 600 else ''}",
                                    flush=True,
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
                    print(
                        f"[DEBUG {context_name}] Message processing error: {msg_error}",
                        flush=True,
                    )
                # Continue processing subsequent messages

    except Exception as e:
        # Log stream-level errors
        stream_error = str(e)
        logger.error(f"[{context_name}] SDK stream processing failed: {e}")
        print(f"[{context_name}] ERROR: Stream processing failed: {e}", flush=True)

    if DEBUG_MODE:
        print(
            f"[DEBUG {context_name}] Session ended. Total messages: {msg_count}",
            flush=True,
        )

    print(f"[{context_name}] Session ended. Total messages: {msg_count}", flush=True)

    return {
        "result_text": result_text,
        "structured_output": structured_output,
        "agents_invoked": agents_invoked,
        "msg_count": msg_count,
        "subagent_tool_ids": subagent_tool_ids,
        "error": stream_error,
    }
