"""
Backward compatibility shim - import from core.worktree.

This file exists to maintain backward compatibility for code that imports
from 'worktree' instead of 'core.worktree'.

IMPLEMENTATION: To avoid triggering core/__init__.py (which imports modules
with heavy dependencies like claude_agent_sdk), we:
1. Create a minimal fake 'core' module to satisfy Python's import system
2. Load core.worktree directly using importlib
3. Register it in sys.modules
4. Re-export everything

This allows 'from worktree import X' to work without requiring all of core's dependencies.
"""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

# Ensure apps/backend is in sys.path
_backend_dir = Path(__file__).parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Create a minimal 'core' module if it doesn't exist (to avoid importing core/__init__.py)
if "core" not in sys.modules:
    _core_module = ModuleType("core")
    _core_module.__file__ = str(_backend_dir / "core" / "__init__.py")
    _core_module.__path__ = [str(_backend_dir / "core")]
    sys.modules["core"] = _core_module

# Now load core.worktree directly
_worktree_file = _backend_dir / "core" / "worktree.py"
_spec = importlib.util.spec_from_file_location("core.worktree", _worktree_file)
_worktree_module = importlib.util.module_from_spec(_spec)
sys.modules["core.worktree"] = _worktree_module
_spec.loader.exec_module(_worktree_module)

# Re-export everything from core.worktree
from core.worktree import *  # noqa: F401, F403
