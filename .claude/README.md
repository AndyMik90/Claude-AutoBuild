# Auto-Claude .claude/ Directory

This directory contains Claude Code customizations for the Auto-Claude autonomous coding framework.

## Structure

```
.claude/
├── CLAUDE.md               # Auto-Claude instructions for Claude Code
├── settings.json           # Hook and environment configuration
├── settings.local.json     # User-specific overrides (gitignored)
├── README.md              # This file
├── hooks/                 # Lifecycle automation
├── skills/                # Modular agent capabilities
├── agents/                # Specialized sub-agent definitions
├── patterns/              # Reusable development patterns
├── output-styles/         # Response formatting templates
└── status_lines/          # Terminal status displays
```

## Hooks

Lifecycle hooks provide automation at key points:

- **pre_tool_use.py** - Security validation before tool execution
- **post_tool_use.py** - Extract insights after tool execution
- **stop.py** - Quality gates when agent completes
- **session_start.py** - Load context when session begins
- **subagent_stop.py** - Validate subagent completion
- **user_prompt_submit.py** - Detect user intent
- **pre_compact.py** - Preserve context during summarization
- **notification.py** - Handle system notifications

## Skills

Skills enable natural language workflows:

- **auto-claude-spec/** - "create a spec for X"
- **auto-claude-build/** - "build this autonomously"
- **single-file-agents/** - "use sfa to analyze Y"
- **archon/** - "search archon for Z patterns"
- **observability/** - "analyze session costs"

## Agents

Sub-agents provide specialized capabilities:

- **spec-creator-agent.md** - Guided spec creation
- **autonomous-builder-agent.md** - Multi-phase builds
- **qa-loop-agent.md** - Quality assurance
- **archon-sync-agent.md** - Knowledge management
- **session-analytics-agent.md** - Observability

## Configuration

Edit `settings.json` to:
- Enable/disable hooks
- Configure environment variables
- Add custom skills or agents

Create `settings.local.json` for user-specific overrides (gitignored).

## Development

**Adding a new skill:**
1. Create directory in `skills/`
2. Add `SKILL.md` with YAML frontmatter
3. Add `README.md` for user documentation
4. Optional: Add `cookbook/` for examples

**Adding a new hook:**
1. Create Python script in `hooks/`
2. Add entry to `settings.json`
3. Implement hook logic
4. Test with Claude Code

**Adding a new agent:**
1. Create markdown file in `agents/`
2. Add YAML frontmatter with tools/model
3. Write system prompt as markdown content

## Resources

- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Agent SDK Documentation](https://platform.claude.com/docs/en/agent-sdk/overview)
- Research guides in Archon project: Auto-Claude Modernization Plan
