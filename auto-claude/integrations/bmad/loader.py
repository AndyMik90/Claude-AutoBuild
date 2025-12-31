"""
BMAD Agent Loader Singleton
===========================

Provides a shared BMAD agent loader singleton for use across
all Auto-Claude modules. This eliminates code duplication and
ensures consistent BMAD integration.

Usage:
    from integrations.bmad.loader import get_bmad_loader

    bmad = get_bmad_loader()
    if bmad:
        prompt = bmad.enhance_prompt(prompt, "developer")
"""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .agent_loader import BMADAgentLoader

# Import the loader class with graceful fallback
try:
    from .agent_loader import BMADAgentLoader as _BMADAgentLoader

    BMAD_AVAILABLE = True
except ImportError:
    BMAD_AVAILABLE = False
    _BMADAgentLoader = None  # type: ignore[misc, assignment]

# Global singleton instance (lazy initialized)
_bmad_loader: BMADAgentLoader | None = None
_initialization_attempted: bool = False
_initialization_lock = threading.Lock()


def get_bmad_loader() -> BMADAgentLoader | None:
    """
    Get or create the BMAD agent loader singleton.

    This function provides thread-safe lazy initialization of the
    BMAD agent loader. It returns None if BMAD is not available
    or if the BMAD-METHOD files are not found.

    Thread Safety: Uses a lock to prevent race conditions during
    initialization when called from multiple threads.

    Returns:
        BMADAgentLoader instance if available, None otherwise.
    """
    global _bmad_loader, _initialization_attempted

    if not BMAD_AVAILABLE:
        return None

    # Fast path: already initialized (no lock needed for read)
    if _initialization_attempted:
        return _bmad_loader

    # Slow path: acquire lock for initialization
    with _initialization_lock:
        # Double-check after acquiring lock
        if _initialization_attempted:
            return _bmad_loader

        _initialization_attempted = True

        try:
            loader = _BMADAgentLoader()
            if loader.is_available():
                _bmad_loader = loader
                print(f"[BMAD] Agents available: {', '.join(loader.list_agents())}")
            else:
                print("[BMAD] BMAD-METHOD not found at expected paths")
                _bmad_loader = None
        except Exception as e:
            print(f"[BMAD] Failed to initialize: {e}")
            _bmad_loader = None

    return _bmad_loader


def is_bmad_available() -> bool:
    """
    Check if BMAD integration is available.

    This is a quick check that doesn't trigger full initialization.

    Returns:
        True if BMAD module is importable, False otherwise.
    """
    return BMAD_AVAILABLE


def reset_bmad_loader() -> None:
    """
    Reset the BMAD loader singleton.

    This is primarily useful for testing or when BMAD paths
    might have changed. After calling this, the next call to
    get_bmad_loader() will re-initialize.

    Thread Safety: Uses lock to prevent race with concurrent get_bmad_loader calls.
    """
    global _bmad_loader, _initialization_attempted
    with _initialization_lock:
        _bmad_loader = None
        _initialization_attempted = False
