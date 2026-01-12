# Auto-Claude Instructions for Claude Code

This file provides guidance to Claude Code when working with the Auto-Claude autonomous coding framework.

## Project Overview

Auto-Claude is a multi-agent autonomous coding framework that builds software through coordinated AI agent sessions. It integrates with:
- **Claude Agent SDK** - All AI interactions use the SDK, not raw Anthropic API
- **Graphiti Memory** - Session-level knowledge graph (mandatory)
- **Archon MCP** - Cross-session project/task/knowledge management
- **OpenTelemetry** - Observability via Arize Phoenix

## Skills Available

Auto-Claude provides specialized skills for autonomous development workflows:

- **auto-claude-spec** - Create feature specifications through guided discovery
- **auto-claude-build** - Execute autonomous builds with multi-phase pipeline
- **single-file-agents** - Run specialized SFA tools for analysis and utilities
- **archon** - Query knowledge base, manage tasks, sync project data
- **observability** - Session analytics, cost tracking, pattern detection

## Hooks Enabled

Auto-Claude uses lifecycle hooks for quality assurance and automation:

- **PreToolUse** - Security validation using 3-layer defense model
- **PostToolUse** - Extract insights to Graphiti and Archon RAG
- **Stop** - Quality gates (tests, builds, acceptance criteria validation)
- **SessionStart** - Load spec context and project guidelines
- **SubagentStop** - Validate subagent completion
- **PreCompact** - Preserve critical context during summarization

## Architecture

**Core Pipeline:**
```
Spec Creation → Planning → Coding → QA → Fix Loop
```

**Key Locations:**
- `apps/backend/` - Python backend with ALL agent logic
- `apps/backend/agents/` - Agent implementations (planner, coder, qa_reviewer, qa_fixer)
- `apps/backend/spec_agents/` - Spec creation agents
- `apps/backend/core/client.py` - Claude SDK client factory
- `apps/backend/prompts/` - Agent system prompts
- `.auto-claude/specs/` - Spec data and execution artifacts

**Security Model:**
- OS sandbox (Bash command isolation)
- Filesystem permissions (restricted to project directory)
- Dynamic command allowlist (based on detected tech stack)

## Working with Auto-Claude

**Creating Specs:**
```bash
# Interactive mode
cd apps/backend && python spec_runner.py --interactive

# From task description
python spec_runner.py --task "Add user authentication"
```

**Running Builds:**
```bash
# Autonomous build
cd apps/backend && python run.py --spec 001

# Review in isolated worktree
python run.py --spec 001 --review

# Merge completed build
python run.py --spec 001 --merge
```

**Using Skills:**
- Say "create a spec for adding dark mode"
- Say "build this autonomously"
- Say "search archon for authentication patterns"
- Say "analyze session costs"

## Important Notes

- **NEVER use raw Anthropic API** - Always use `create_client()` from `core.client`
- **Backend uses Python 3.12+** with uv for dependency management
- **Frontend is Electron** with React/TypeScript
- **All agent code lives in apps/backend/** - Frontend is just UI
- **Graphiti is mandatory** - Memory system for session insights
- **Archon is optional** - But recommended for cross-session learning

## Testing

```bash
# Install test dependencies first
cd apps/backend && uv pip install -r ../../tests/requirements-test.txt

# Run tests
apps/backend/.venv/bin/pytest tests/ -v
```

## Contributing

When submitting PRs to AndyMik90/Auto-Claude:
- **Always target `develop` branch** (NOT main)
- Use sign-off commits: `git commit -s -m "fix: description"`
- Verify only your changes: `git log --oneline upstream/develop..HEAD`

---

For detailed documentation, see:
- Main README: `/Users/jeff/Dev_Projects/Auto-claude/README.md`
- Project instructions: `/Users/jeff/Dev_Projects/Auto-claude/CLAUDE.md`
- Archon project: Auto-Claude Modernization Plan (ID: d66acf46-577a-4aae-b166-a7e67aafa884)
