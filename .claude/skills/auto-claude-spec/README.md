# Auto-Claude Spec Creation Skill

Create feature specifications through Auto-Claude's guided discovery process.

## Quick Start

**Trigger phrases:**
- "create a spec for X"
- "new specification for Y"
- "define a feature Z"

**What it does:**
Runs Auto-Claude's `spec_runner.py` to guide you through a multi-phase discovery process that creates comprehensive feature specifications with acceptance criteria.

## Usage Examples

### Interactive Mode

```
You: create a spec for adding user authentication

Claude: I'll help you create a spec for user authentication. Let me start Auto-Claude's
spec creation pipeline in interactive mode.

[Runs: cd apps/backend && python spec_runner.py --interactive]

The spec creator will ask you questions about:
- Authentication methods (OAuth, JWT, password-based)
- User roles and permissions
- Security requirements
- Integration points

Would you like me to start?
```

### Quick Mode

```
You: new spec for implementing real-time notifications using WebSockets

Claude: I'll create a spec for real-time notifications with WebSockets.

[Runs: python spec_runner.py --task "Implement real-time notifications using WebSockets"]

Auto-Claude will:
1. Assess complexity (likely STANDARD or COMPLEX)
2. Research WebSocket best practices
3. Discover relevant backend/frontend code
4. Create spec with acceptance criteria
5. Generate implementation plan
```

## What Gets Created

After spec creation, you'll have:

```
.auto-claude/specs/NNN-feature-name/
├── spec.md                    # Feature specification
├── requirements.json          # Structured requirements
├── context.json              # Codebase context
└── implementation_plan.json   # Subtask breakdown (optional)
```

## Complexity Levels

Auto-Claude automatically detects complexity, but you can force a level:

- **SIMPLE** (3 phases): Bug fixes, small tweaks, simple features
- **STANDARD** (6-7 phases): Most features, moderate complexity
- **COMPLEX** (8 phases): Large features, architectural changes, multiple integrations

## Tips for Better Specs

1. **Be specific about tech**: "Use Supabase Auth" vs "add authentication"
2. **Mention constraints**: "Must work offline", "Under 100ms latency"
3. **Reference examples**: "Similar to Slack's notification system"
4. **Note integrations**: "Integrates with existing user model"

## Next Steps

After creating a spec:
1. Review: `cat .auto-claude/specs/NNN-name/spec.md`
2. Build: Use the `auto-claude-build` skill
3. Track: Spec automatically syncs to Archon (if enabled)

## Requirements

- Python 3.12+ with dependencies installed
- Run from Auto-Claude project root
- Backend dependencies: `cd apps/backend && uv pip install -r requirements.txt`

## Related

- **auto-claude-build** - Implement the spec autonomously
- **archon** - Query similar implementations
- **observability** - Track spec creation costs
