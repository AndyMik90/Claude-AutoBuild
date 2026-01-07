"""
AI Resolver
===========

Handles conflicts that cannot be resolved by deterministic rules.

This component is called ONLY when the AutoMerger cannot handle a conflict.
It uses minimal context to reduce token usage:

1. Only the conflict region, not the entire file
2. Task intents (1 sentence each)
3. Semantic change descriptions
4. The baseline code for reference

The AI is given a focused task: merge these specific changes.
No file exploration, no open-ended questions.

This module now serves as a compatibility layer, importing from the
refactored ai_resolver package.
"""

from __future__ import annotations

# Re-export all public APIs from the ai_resolver package
from .ai_resolver import (
    AIResolver,
    ConflictContext,
    create_claude_resolver,
)

# For backwards compatibility, also expose the AICallFunction type
from .ai_resolver.resolver import AICallFunction

__all__ = [
    "AIResolver",
    "ConflictContext",
    "create_claude_resolver",
    "AICallFunction",
]
