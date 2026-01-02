"""
Bridge between CrewAI and Auto-Claude.

The bridge exposes Auto-Claude functionality as CrewAI-compatible tools,
maintaining security boundaries and handling async/sync conversion.
"""

from .auto_claude_bridge import AutoClaudeBridge

__all__ = ["AutoClaudeBridge"]
