"""
Backward compatibility shim - import from core.workspace package.

This file exists to maintain backward compatibility for code that imports
from 'workspace' instead of 'core.workspace'. The workspace module has been
refactored into a package (core/workspace/) with multiple sub-modules.

IMPLEMENTATION: To avoid triggering core/__init__.py (which imports modules
with heavy dependencies like claude_agent_sdk), we:
1. Create a minimal fake 'core' module to satisfy Python's import system
2. Load core.workspace package directly using importlib
3. Register it in sys.modules
4. Re-export everything

This allows 'from workspace import X' to work without requiring all of core's dependencies.
"""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

# Ensure auto-claude is in sys.path
_auto_claude_dir = Path(__file__).parent
if str(_auto_claude_dir) not in sys.path:
    sys.path.insert(0, str(_auto_claude_dir))

# Create a minimal 'core' module if it doesn't exist (to avoid importing core/__init__.py)
if "core" not in sys.modules:
    _core_module = ModuleType("core")
    _core_module.__file__ = str(_auto_claude_dir / "core" / "__init__.py")
    _core_module.__path__ = [str(_auto_claude_dir / "core")]
    sys.modules["core"] = _core_module

# Now load core.workspace package directly
_workspace_init = _auto_claude_dir / "core" / "workspace" / "__init__.py"
_spec = importlib.util.spec_from_file_location("core.workspace", _workspace_init)
_workspace_module = importlib.util.module_from_spec(_spec)
sys.modules["core.workspace"] = _workspace_module
_spec.loader.exec_module(_workspace_module)

# Re-export everything from core.workspace
from core.workspace import *  # noqa: F401, F403

__all__ = _workspace_module.__all__
