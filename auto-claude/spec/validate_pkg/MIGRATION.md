# Migration Guide

This document describes the changes made during the refactoring of `validate_spec.py` and how to update code that depends on it.

## Summary of Changes

The monolithic 633-line `validate_spec.py` file has been refactored into a modular package structure with:
- Main entry point reduced from 633 to 109 lines (83% reduction)
- 10 focused modules with clear responsibilities
- Total package size: 784 lines (including extensive documentation)

## File Structure

### Before
```
auto-claude/
└── validate_spec.py (633 lines)
```

### After
```
auto-claude/
├── validate_spec.py (109 lines - entry point)
└── validate_spec/
    ├── __init__.py
    ├── models.py
    ├── schemas.py
    ├── auto_fix.py
    ├── spec_validator.py
    ├── README.md
    ├── MIGRATION.md
    └── validators/
        ├── __init__.py
        ├── prereqs_validator.py
        ├── context_validator.py
        ├── spec_document_validator.py
        └── implementation_plan_validator.py
```

## Import Changes

### SpecValidator

**Before:**
```python
from validate_spec import SpecValidator
```

**After (option 1 - recommended):**
```python
from validate_spec import SpecValidator
```

**After (option 2 - explicit):**
```python
from validate_spec.spec_validator import SpecValidator
```

### ValidationResult

**Before:**
```python
from validate_spec import ValidationResult
```

**After (option 1 - recommended):**
```python
from validate_spec import ValidationResult
```

**After (option 2 - explicit):**
```python
from validate_spec.models import ValidationResult
```

### auto_fix_plan

**Before:**
```python
from validate_spec import auto_fix_plan
```

**After (option 1 - recommended):**
```python
from validate_spec import auto_fix_plan
```

**After (option 2 - explicit):**
```python
from validate_spec.auto_fix import auto_fix_plan
```

## Files Updated

The following files have been updated to use the new import structure:

### 1. `auto-claude/spec/phases/planning_phases.py`
**Changed:**
```python
# Before
from validate_spec import auto_fix_plan

# After
from validate_spec.auto_fix import auto_fix_plan
```

### 2. `auto-claude/spec/pipeline/orchestrator.py`
**Changed:**
```python
# Before
from validate_spec import SpecValidator

# After
from validate_spec.spec_validator import SpecValidator
```

## Backward Compatibility

The package exports maintain backward compatibility through `__init__.py`:

```python
# validate_spec/__init__.py
from .auto_fix import auto_fix_plan
from .models import ValidationResult
from .spec_validator import SpecValidator

__all__ = ["SpecValidator", "ValidationResult", "auto_fix_plan"]
```

This means existing code using:
```python
from validate_spec import SpecValidator, ValidationResult, auto_fix_plan
```

Will continue to work without changes.

## CLI Usage

The CLI interface remains **completely unchanged**:

```bash
# All existing commands work exactly the same
python auto-claude/validate_spec.py --spec-dir path/to/spec --checkpoint all
python auto-claude/validate_spec.py --spec-dir path/to/spec --checkpoint context
python auto-claude/validate_spec.py --spec-dir path/to/spec --auto-fix --checkpoint plan
python auto-claude/validate_spec.py --spec-dir path/to/spec --checkpoint all --json
```

## Testing

All existing functionality has been preserved:

1. **Validation logic**: Identical behavior
2. **Error messages**: Same format
3. **Auto-fix**: Same functionality
4. **CLI**: Same interface
5. **JSON output**: Same structure

## Benefits

### Maintainability
- Each validator is in its own file
- Easy to locate and modify specific validation logic
- Clear separation of concerns

### Testability
- Individual validators can be tested in isolation
- Mock dependencies are easier to set up
- Unit tests can focus on specific functionality

### Extensibility
- Adding new validators is straightforward
- New validation rules can be added without touching existing code
- Schema changes are centralized

### Readability
- Main entry point is now 109 lines instead of 633
- Each file has a single, clear purpose
- Documentation is embedded in each module

## Rollback

If needed, the original file is preserved as `validate_spec.py.backup`:

```bash
# To rollback
cd auto-claude
mv validate_spec.py validate_spec.py.refactored
mv validate_spec.py.backup validate_spec.py
rm -rf validate_spec/
```

## Questions?

For questions or issues related to this refactoring:
1. Check the [README.md](README.md) for usage examples
2. Review the inline documentation in each module
3. Compare with `validate_spec.py.backup` if needed
