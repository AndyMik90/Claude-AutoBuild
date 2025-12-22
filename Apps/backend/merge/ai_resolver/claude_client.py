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
import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resolver import AIResolver

logger = logging.getLogger(__name__)


def create_claude_resolver() -> AIResolver:
    """
    Create an AIResolver configured to use Claude via the Agent SDK.

    Uses the same OAuth token pattern as the rest of the auto-claude framework.

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
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
    except ImportError:
        logger.warning("claude_agent_sdk not installed, AI resolution unavailable")
        return AIResolver()

    def call_claude(system: str, user: str) -> str:
        """Call Claude using the Agent SDK for merge resolution."""

        async def _run_merge() -> str:
            # Create a minimal client for merge resolution
            client = ClaudeSDKClient(
                options=ClaudeAgentOptions(
                    model="sonnet",
                    system_prompt=system,
                    allowed_tools=[],  # No tools needed for merge
                    max_turns=1,
                )
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
