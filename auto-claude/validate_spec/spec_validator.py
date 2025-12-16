"""
Backward compatibility shim for spec_validator module.

DEPRECATED: This module has been moved to spec.validate_pkg.spec_validator.

Please update your imports:
    OLD: from validate_spec.spec_validator import SpecValidator
    NEW: from spec.validate_pkg.spec_validator import SpecValidator

This shim provides compatibility but will be removed in a future version.
"""

import sys
from pathlib import Path


# Lazy import to avoid circular dependencies
def __getattr__(name):
    """Lazy import mechanism to avoid circular imports."""
    if name == "SpecValidator":
        # Add spec directory to path temporarily to allow direct imports
        # without triggering spec.__init__
        spec_dir = Path(__file__).parent.parent / "spec"
        if str(spec_dir) not in sys.path:
            sys.path.insert(0, str(spec_dir))

        try:
            # Import directly from validate_pkg without going through spec package
            from validate_pkg.spec_validator import SpecValidator

            # Cache the imported value in this module
            globals()["SpecValidator"] = SpecValidator
            return SpecValidator
        finally:
            # Clean up path modification
            if str(spec_dir) in sys.path:
                sys.path.remove(str(spec_dir))

    raise AttributeError(
        f"module 'validate_spec.spec_validator' has no attribute '{name}'"
    )
