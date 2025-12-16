"""
Backward compatibility shim for validate_spec package.

DEPRECATED: This package has been moved to spec.validate_pkg.

Please update your imports:
    OLD: from validate_spec import SpecValidator, ValidationResult, auto_fix_plan
    NEW: from spec.validate_pkg import SpecValidator, ValidationResult, auto_fix_plan

This shim provides compatibility but will be removed in a future version.
"""

import sys
from pathlib import Path


# Lazy import to avoid circular dependencies
def __getattr__(name):
    """Lazy import mechanism to avoid circular imports."""
    if name in ("SpecValidator", "ValidationResult", "auto_fix_plan"):
        # Add spec directory to path temporarily to allow direct imports
        # without triggering spec.__init__
        spec_dir = Path(__file__).parent.parent / "spec"
        if str(spec_dir) not in sys.path:
            sys.path.insert(0, str(spec_dir))

        try:
            # Import directly from validate_pkg without going through spec package
            from validate_pkg import SpecValidator, ValidationResult, auto_fix_plan

            # Cache the imported values in this module
            globals()["SpecValidator"] = SpecValidator
            globals()["ValidationResult"] = ValidationResult
            globals()["auto_fix_plan"] = auto_fix_plan

            return globals()[name]
        finally:
            # Clean up path modification
            if str(spec_dir) in sys.path:
                sys.path.remove(str(spec_dir))

    raise AttributeError(f"module 'validate_spec' has no attribute '{name}'")


__all__ = ["SpecValidator", "ValidationResult", "auto_fix_plan"]
