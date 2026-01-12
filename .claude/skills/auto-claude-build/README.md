# Auto-Claude Build Skill

Execute autonomous builds using Auto-Claude's multi-agent implementation pipeline.

## Quick Start

**Trigger phrases:**
- "build this autonomously"
- "implement spec 001"
- "run auto-claude on spec 002"

**What it does:**
Runs Auto-Claude's `run.py` to execute a multi-phase build: Planning → Coding → QA → Fix Loop.

## Build Workflow

```
User Request
    ↓
Planning Phase (creates subtasks)
    ↓
Coding Phase (implements subtasks, can parallelize)
    ↓
QA Phase (validates acceptance criteria)
    ↓
Fix Loop (resolves issues) → back to QA if needed
    ↓
Build Complete (isolated in worktree)
```

## Commands

```bash
# Start build
python run.py --spec 001

# Review in worktree
python run.py --spec 001 --review

# Re-run QA
python run.py --spec 001 --qa

# Merge to main project
python run.py --spec 001 --merge

# Discard build
python run.py --spec 001 --discard

# List all specs
python run.py --list
```

## Build Isolation

Builds run in isolated git worktrees:
- **Branch**: `auto-claude/spec-name`
- **Location**: `.worktrees/NNN-spec-name/`
- **Safety**: Your main codebase is untouched
- **Testing**: Full project available in worktree

## Requirements

- Spec must exist in `.auto-claude/specs/NNN-name/`
- Python 3.12+ with dependencies
- Git repository (for worktree isolation)
- Graphiti memory configured

## Related

- **auto-claude-spec** - Create specifications first
- **archon** - Query patterns before building
- **observability** - Track build costs and metrics
