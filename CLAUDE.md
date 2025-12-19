# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auto Claude is a multi-agent autonomous coding framework that builds software through coordinated AI agent sessions. It uses the Claude Code SDK to run agents in isolated workspaces with security controls.

## Commands

### Setup
```bash
# Install dependencies (from auto-claude/)
uv venv && uv pip install -r requirements.txt
# Or: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Set up OAuth token
claude setup-token
# Add to auto-claude/.env: CLAUDE_CODE_OAUTH_TOKEN=your-token
```

### Creating and Running Specs
```bash
# Create a spec interactively
python auto-claude/spec_runner.py --interactive

# Create spec from task description
python auto-claude/spec_runner.py --task "Add user authentication"

# Force complexity level (simple/standard/complex)
python auto-claude/spec_runner.py --task "Fix button" --complexity simple

# Run autonomous build
python auto-claude/run.py --spec 001

# List all specs
python auto-claude/run.py --list
```

### Workspace Management
```bash
# Review changes in isolated worktree
python auto-claude/run.py --spec 001 --review

# Merge completed build into project
python auto-claude/run.py --spec 001 --merge

# Discard build
python auto-claude/run.py --spec 001 --discard
```

### QA Validation
```bash
# Run QA manually
python auto-claude/run.py --spec 001 --qa

# Check QA status
python auto-claude/run.py --spec 001 --qa-status
```

### Testing
```bash
# Install test dependencies (required first time)
cd auto-claude && uv pip install -r ../tests/requirements-test.txt

# Run all tests (use virtual environment pytest)
auto-claude/.venv/bin/pytest tests/ -v

# Run single test file
auto-claude/.venv/bin/pytest tests/test_security.py -v

# Run specific test
auto-claude/.venv/bin/pytest tests/test_security.py::test_bash_command_validation -v

# Skip slow tests
auto-claude/.venv/bin/pytest tests/ -m "not slow"
```

### Spec Validation
```bash
python auto-claude/validate_spec.py --spec-dir auto-claude/specs/001-feature --checkpoint all
```

### Releases
```bash
# Automated version bump and release (recommended)
node scripts/bump-version.js patch   # 2.5.5 -> 2.5.6
node scripts/bump-version.js minor   # 2.5.5 -> 2.6.0
node scripts/bump-version.js major   # 2.5.5 -> 3.0.0
node scripts/bump-version.js 2.6.0   # Set specific version

# Then push to trigger GitHub release workflows
git push origin main
git push origin v2.6.0
```

See [RELEASE.md](RELEASE.md) for detailed release process documentation.

## Architecture

### Core Pipeline

**Spec Creation (spec_runner.py)** - Dynamic 3-8 phase pipeline based on task complexity:
- SIMPLE (3 phases): Discovery → Quick Spec → Validate
- STANDARD (6-7 phases): Discovery → Requirements → [Research] → Context → Spec → Plan → Validate
- COMPLEX (8 phases): Full pipeline with Research and Self-Critique phases

**Implementation (run.py → agent.py)** - Multi-session build:
1. Planner Agent creates subtask-based implementation plan
2. Coder Agent implements subtasks (can spawn subagents for parallel work)
3. QA Reviewer validates acceptance criteria
4. QA Fixer resolves issues in a loop

### Key Components

- **client.py** - Claude SDK client with security hooks and tool permissions
- **security.py** + **project_analyzer.py** - Dynamic command allowlisting based on detected project stack
- **worktree.py** - Git worktree isolation for safe feature development
- **memory.py** - File-based session memory (primary, always-available storage)
- **graphiti_memory.py** - Optional graph-based cross-session memory with semantic search
- **graphiti_providers.py** - Multi-provider factory for Graphiti (OpenAI, Anthropic, Azure, Ollama)
- **graphiti_config.py** - Configuration and validation for Graphiti integration
- **linear_updater.py** - Optional Linear integration for progress tracking

### Agent Prompts (auto-claude/prompts/)

| Prompt | Purpose |
|--------|---------|
| planner.md | Creates implementation plan with subtasks |
| coder.md | Implements individual subtasks |
| coder_recovery.md | Recovers from stuck/failed subtasks |
| qa_reviewer.md | Validates acceptance criteria |
| qa_fixer.md | Fixes QA-reported issues |
| spec_gatherer.md | Collects user requirements |
| spec_researcher.md | Validates external integrations |
| spec_writer.md | Creates spec.md document |
| spec_critic.md | Self-critique using ultrathink |
| complexity_assessor.md | AI-based complexity assessment |

### Spec Directory Structure

Each spec in `auto-claude/specs/XXX-name/` contains:
- `spec.md` - Feature specification
- `requirements.json` - Structured user requirements
- `context.json` - Discovered codebase context
- `implementation_plan.json` - Subtask-based plan with status tracking
- `qa_report.md` - QA validation results
- `QA_FIX_REQUEST.md` - Issues to fix (when rejected)

### Branching & Worktree Strategy

Auto Claude uses git worktrees for isolated builds. All branches stay LOCAL until user explicitly pushes:

```
main (user's branch)
└── auto-claude/{spec-name}  ← spec branch (isolated worktree)
```

**Key principles:**
- ONE branch per spec (`auto-claude/{spec-name}`)
- Parallel work uses subagents (agent decides when to spawn)
- NO automatic pushes to GitHub - user controls when to push
- User reviews in spec worktree (`.worktrees/{spec-name}/`)
- Final merge: spec branch → main (after user approval)

**Workflow:**
1. Build runs in isolated worktree on spec branch
2. Agent implements subtasks (can spawn subagents for parallel work)
3. User tests feature in `.worktrees/{spec-name}/`
4. User runs `--merge` to add to their project
5. User pushes to remote when ready

### Security Model

Three-layer defense:
1. **OS Sandbox** - Bash command isolation
2. **Filesystem Permissions** - Operations restricted to project directory
3. **Command Allowlist** - Dynamic allowlist from project analysis (security.py + project_analyzer.py)

Security profile cached in `.auto-claude-security.json`.

### Memory System

Dual-layer memory architecture:

**File-Based Memory (Primary)** - `memory.py`
- Zero dependencies, always available
- Human-readable files in `specs/XXX/memory/`
- Session insights, patterns, gotchas, codebase map

**Graphiti Memory (Optional Enhancement)** - `graphiti_memory.py`
- Graph database with semantic search (FalkorDB)
- Cross-session context retrieval
- Multi-provider support (V2):
  - LLM: OpenAI, Anthropic, Azure OpenAI, Ollama
  - Embedders: OpenAI, Voyage AI, Azure OpenAI, Ollama

Enable with: `GRAPHITI_ENABLED=true` + provider credentials. See `.env.example`.

## Project Structure

Auto Claude can be used in two ways:

**As a standalone CLI tool** (original project):
```bash
python auto-claude/run.py --spec 001
```

**With the optional Electron frontend** (`auto-claude-ui/`):
- Provides a GUI for task management and progress tracking
- Wraps the CLI commands - the backend works independently

**Directory layout:**
- `auto-claude/` - Python backend/CLI (the framework code)
- `auto-claude-ui/` - Optional Electron frontend
- `.auto-claude/specs/` - Per-project data (specs, plans, QA reports) - gitignored
