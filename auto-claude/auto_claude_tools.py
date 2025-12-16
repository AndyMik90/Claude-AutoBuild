"""Backward compatibility shim - import from agents.tools_pkg instead."""

# Direct import to avoid triggering agents.__init__ circular dependencies
import sys
from pathlib import Path

# Add agents directory to path if needed
agents_dir = Path(__file__).parent / "agents"
if str(agents_dir) not in sys.path:
    sys.path.insert(0, str(agents_dir))

# Import directly from tools_pkg to avoid agents.__init__ circular imports
from tools_pkg import *  # noqa: F403, E402
