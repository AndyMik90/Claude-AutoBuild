"""
Backward compatibility shim for auto_fix module.

DEPRECATED: This module has been moved to spec.validate_pkg.auto_fix.

Please update your imports:
    OLD: from validate_spec.auto_fix import auto_fix_plan
    NEW: from spec.validate_pkg.auto_fix import auto_fix_plan

This shim provides compatibility but will be removed in a future version.
"""

import sys
from pathlib import Path

# Lazy import to avoid circular dependencies
def __getattr__(name):
    """Lazy import mechanism to avoid circular imports."""
    if name == "auto_fix_plan":
        # Add spec directory to path temporarily to allow direct imports
        # without triggering spec.__init__
        spec_dir = Path(__file__).parent.parent / "spec"
        if str(spec_dir) not in sys.path:
            sys.path.insert(0, str(spec_dir))

        try:
            # Import directly from validate_pkg without going through spec package
            from validate_pkg.auto_fix import auto_fix_plan

            # Cache the imported value in this module
            globals()["auto_fix_plan"] = auto_fix_plan
            return auto_fix_plan
        finally:
            # Clean up path modification
            if str(spec_dir) in sys.path:
                sys.path.remove(str(spec_dir))

    raise AttributeError(f"module 'validate_spec.auto_fix' has no attribute '{name}'")

__all__ = ["auto_fix_plan"]
