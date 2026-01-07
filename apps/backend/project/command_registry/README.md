# Command Registry Module

This directory contains the refactored command registry system for dynamic security profiles.

## Structure

The original 771-line `command_registry.py` has been refactored into focused, maintainable modules:

```
command_registry/
├── __init__.py              # Package exports (44 lines)
├── base.py                  # Core shell commands (165 lines)
├── languages.py             # Language-specific commands (151 lines)
├── package_managers.py      # Package manager commands (40 lines)
├── frameworks.py            # Framework-specific commands (155 lines)
├── databases.py             # Database commands (121 lines)
├── infrastructure.py        # DevOps/infrastructure commands (89 lines)
├── cloud.py                 # Cloud provider CLIs (75 lines)
├── code_quality.py          # Linting/security tools (40 lines)
└── version_managers.py      # Version management tools (30 lines)
```

## Modules

### base.py
Core shell commands that are always safe regardless of project type, plus the validated commands that require extra security checks.

**Exports:**
- `BASE_COMMANDS` - Set of 126 core shell commands
- `VALIDATED_COMMANDS` - Dict of 5 commands requiring validation

### languages.py
Programming language interpreters, compilers, and language-specific tooling.

**Exports:**
- `LANGUAGE_COMMANDS` - Dict mapping 19 languages to their commands

### package_managers.py
Package managers across different ecosystems (npm, pip, cargo, etc.).

**Exports:**
- `PACKAGE_MANAGER_COMMANDS` - Dict of 22 package managers

### frameworks.py
Web frameworks, testing frameworks, build tools, and framework-specific tooling.

**Exports:**
- `FRAMEWORK_COMMANDS` - Dict of 123 frameworks

### databases.py
Database clients, management tools, and ORMs.

**Exports:**
- `DATABASE_COMMANDS` - Dict of 20 database systems

### infrastructure.py
Containerization, orchestration, IaC, and DevOps tooling.

**Exports:**
- `INFRASTRUCTURE_COMMANDS` - Dict of 17 infrastructure tools

### cloud.py
Cloud provider CLIs and platform-specific tooling.

**Exports:**
- `CLOUD_COMMANDS` - Dict of 15 cloud providers

### code_quality.py
Linters, formatters, security scanners, and code analysis tools.

**Exports:**
- `CODE_QUALITY_COMMANDS` - Dict of 22 code quality tools

### version_managers.py
Runtime version management tools (nvm, pyenv, etc.).

**Exports:**
- `VERSION_MANAGER_COMMANDS` - Dict of 12 version managers

## Usage

### Direct Import from Package
```python
from project.command_registry import BASE_COMMANDS, LANGUAGE_COMMANDS
```

### Import from Specific Modules
```python
from project.command_registry.base import BASE_COMMANDS
from project.command_registry.languages import LANGUAGE_COMMANDS
```

### Legacy Import (Backward Compatible)
```python
# Still works via the facade in project/command_registry.py
from project.command_registry import BASE_COMMANDS
```

## Benefits

1. **Maintainability** - Each module has a single, clear responsibility
2. **Readability** - Smaller files are easier to understand and navigate
3. **Extensibility** - New command categories can be added as new modules
4. **Type Safety** - All modules include proper type hints
5. **Documentation** - Each module is self-documenting with clear docstrings
6. **Backward Compatibility** - Existing imports continue to work unchanged

## Testing

All imports have been verified to work correctly:
- Direct package imports
- Individual module imports
- Backward compatibility with existing code (project_analyzer.py, etc.)
- Data integrity (all 381 command definitions preserved)
