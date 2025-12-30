"""
Claude Client
=============

Claude integration for AI-based conflict resolution.

This module provides the factory function for creating an AIResolver
configured to use Claude via the Agent SDK.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resolver import AIResolver

logger = logging.getLogger(__name__)

# Default model ID for merge resolution (haiku for speed)
DEFAULT_MERGE_MODEL = "claude-haiku-4-5-20251001"


def create_claude_resolver() -> AIResolver:
    """
    Create an AIResolver configured to use Claude via the Agent SDK.

    Uses the same OAuth token pattern as the rest of the auto-claude framework.
    Reads model/thinking settings from environment variables:
    - UTILITY_MODEL_ID: Full model ID (e.g., "claude-haiku-4-5-20251001")
    - UTILITY_THINKING_BUDGET: Thinking budget tokens (e.g., "1024")

    Returns:
        Configured AIResolver instance
    """
    # Import here to avoid circular dependency
    from core.auth import ensure_claude_code_oauth_token, get_auth_token

    from .resolver import AIResolver

    if not get_auth_token():
        logger.warning("No authentication token found, AI resolution unavailable")
        return AIResolver()

    # Ensure SDK can find the token
    ensure_claude_code_oauth_token()

    try:
        from core.simple_client import create_simple_client
    except ImportError:
        logger.warning("core.simple_client not available, AI resolution unavailable")
        return AIResolver()

    # Read model settings from environment (passed from frontend)
    model = os.environ.get("UTILITY_MODEL_ID", DEFAULT_MERGE_MODEL)
    thinking_budget_str = os.environ.get("UTILITY_THINKING_BUDGET", "")
    try:
        thinking_budget = int(thinking_budget_str) if thinking_budget_str else 1024
    except ValueError:
        logger.warning(
            f"Invalid UTILITY_THINKING_BUDGET value '{thinking_budget_str}', using default 1024"
        )
        thinking_budget = 1024

    logger.info(
        f"Merge resolver using model={model}, thinking_budget={thinking_budget}"
    )

    def call_claude(system: str, user: str) -> str:
        """Call Claude using the Agent SDK for merge resolution."""

        async def _run_merge() -> str:
            # Create a minimal client for merge resolution
            client = create_simple_client(
                agent_type="merge_resolver",
                model=model,
                system_prompt=system,
                max_thinking_tokens=thinking_budget,
            )

            try:
                # Use async context manager to handle connect/disconnect
                # This is the standard pattern used throughout the codebase
                async with client:
                    await client.query(user)

                    response_text = ""
                    async for msg in client.receive_response():
                        msg_type = type(msg).__name__
                        if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                            for block in msg.content:
                                if hasattr(block, "text"):
                                    response_text += block.text

                    logger.info(f"AI merge response: {len(response_text)} chars")
                    return response_text

            except Exception as e:
                logger.error(f"Claude SDK call failed: {e}")
                print(f"    [ERROR] Claude SDK error: {e}", file=sys.stderr)
                return ""

        try:
            return asyncio.run(_run_merge())
        except Exception as e:
            logger.error(f"asyncio.run failed: {e}")
            print(f"    [ERROR] asyncio error: {e}", file=sys.stderr)
            return ""

    logger.info("Using Claude Agent SDK for merge resolution")
    return AIResolver(ai_call_fn=call_claude)
