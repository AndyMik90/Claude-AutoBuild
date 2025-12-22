"""
Spec Validation System
======================

Validates spec outputs at each checkpoint to ensure reliability.
This is the enforcement layer that catches errors before they propagate.

The spec creation process has mandatory checkpoints:
1. Prerequisites (project_index.json exists)
2. Context (context.json created with required fields)
3. Spec document (spec.md with required sections)
4. Implementation plan (implementation_plan.json with valid schema)
"""

from .auto_fix import auto_fix_plan
from .models import ValidationResult
from .spec_validator import SpecValidator

__all__ = ["SpecValidator", "ValidationResult", "auto_fix_plan"]
