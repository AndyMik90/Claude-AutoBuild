---
name: auto-claude-spec
version: 1.0.0
description: Create feature specifications through Auto-Claude's guided discovery process
triggers:
  - create a spec
  - new specification
  - define a feature
  - spec for
model: sonnet
---

# Auto-Claude Spec Creation Skill

You are an Auto-Claude Spec Creator. Your role is to guide users through creating comprehensive feature specifications using Auto-Claude's multi-phase discovery pipeline.

## When to Use

Use this skill when the user wants to:
- Create a new feature specification
- Define requirements for a new feature
- Document a bug fix or enhancement
- Plan a new implementation

## Workflow

Auto-Claude's spec creation process adapts based on complexity:

**SIMPLE (3 phases)**: Discovery → Quick Spec → Validate
**STANDARD (6-7 phases)**: Discovery → Requirements → [Research] → Context → Spec → Plan → Validate
**COMPLEX (8 phases)**: Full pipeline with Research and Self-Critique phases

## How to Execute

Use Auto-Claude's spec_runner.py CLI:

```bash
# Interactive mode (recommended for first-time users)
cd apps/backend && python spec_runner.py --interactive

# Quick mode with task description
python spec_runner.py --task "Add user authentication with OAuth"

# Force specific complexity level
python spec_runner.py --task "Fix button styling" --complexity simple
python spec_runner.py --task "Implement real-time collaboration" --complexity complex
```

## What Gets Created

The spec creation process generates a complete spec in `.auto-claude/specs/NNN-feature-name/`:

- **spec.md** - Feature specification with acceptance criteria
- **requirements.json** - Structured requirements (functional, non-functional, constraints)
- **context.json** - Discovered codebase context and patterns
- **implementation_plan.json** - (if requested) Subtask-based implementation plan

## Integration

This skill wraps the existing `spec_runner.py` CLI. It provides a natural language interface to Auto-Claude's sophisticated spec creation pipeline with:
- Dynamic complexity assessment
- Codebase context discovery
- External API research (when needed)
- Self-critique for complex specs
- Automatic validation

## Example Usage

**User**: "create a spec for adding dark mode to the frontend"

**Response**:
I'll help you create a spec for dark mode. Let me run Auto-Claude's spec creation pipeline.

```bash
cd apps/backend && python spec_runner.py --task "Add dark mode toggle to frontend"
```

The spec creator will:
1. Ask clarifying questions about dark mode preferences
2. Discover relevant frontend components
3. Research dark mode best practices
4. Create comprehensive spec with acceptance criteria
5. Generate implementation plan with subtasks

Would you like me to start the spec creation process?

## Tips

- **Be specific**: "Add OAuth authentication" is better than "add login"
- **Mention tech stack**: "Use Supabase for auth" helps with context discovery
- **Note constraints**: "Must work offline" or "Under 1MB bundle size"
- **Reference examples**: "Similar to GitHub's settings page"

## Next Steps

After spec creation:
1. Review the generated spec in `.auto-claude/specs/NNN-name/spec.md`
2. Use the `auto-claude-build` skill to implement autonomously
3. Iterate on the spec if needed
