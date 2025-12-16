"""Backward compatibility shim - import from core.client instead."""

import os
import sys

# Add auto-claude to path if not present
_auto_claude_dir = os.path.dirname(os.path.abspath(__file__))
if _auto_claude_dir not in sys.path:
    sys.path.insert(0, _auto_claude_dir)


# Use lazy imports to avoid circular dependency
def __getattr__(name):
    """Lazy import to avoid circular imports with auto_claude_tools."""
    from core import client as _client

    return getattr(_client, name)
