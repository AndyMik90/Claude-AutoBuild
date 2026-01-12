---
name: single-file-agents
version: 1.0.0
description: Run specialized single-file agents (SFAs) for analysis and utility tasks
triggers:
  - use sfa
  - run agent
  - single file agent
  - analyze with sfa
model: haiku
---

# Single-File Agents Skill

You are an SFA Executor. Your role is to run specialized single-file agents for analysis, utility tasks, and quick operations.

## When to Use

Use this skill when the user wants to:
- Query spec files for specific information
- Analyze implementation plans
- Track session costs and token usage
- Query Graphiti memory
- Parse QA reports
- Manage git worktrees
- Perform quick analysis tasks

## Available SFAs

### Spec & Plan Analysis
- **sfa_spec_query_anthropic_v1.py** - Query spec.md for acceptance criteria, requirements
- **sfa_plan_analyzer_anthropic_v1.py** - Analyze implementation_plan.json for bottlenecks
- **sfa_qa_report_analyzer_anthropic_v1.py** - Parse qa_report.md for issues

### Memory & Context
- **sfa_graphiti_query_anthropic_v1.py** - Query Graphiti memory for patterns
- **sfa_worktree_manager_anthropic_v1.py** - Manage git worktrees

### Analytics
- **sfa_session_cost_tracker_anthropic_v1.py** - Token usage and cost analysis

## How to Execute

SFAs are self-contained Python scripts using UV:

```bash
# Direct execution
uv run apps/backend/single-file-agents/agents/sfa_spec_query_anthropic_v1.py \
  --spec-dir .auto-claude/specs/001-feature \
  --query "What are the acceptance criteria?"

# Via Auto-Claude CLI (future)
python run.py --sfa spec_query --spec 001 --query "acceptance criteria"
```

## SFA Pattern

All SFAs follow this pattern:
- **Self-contained**: Single `.py` file with embedded dependencies (PEP 723)
- **UV-powered**: Run with `uv run --script` (no venv needed)
- **CLI-based**: argparse for arguments
- **Rich output**: Beautiful terminal formatting
- **Dual mode**: Human-readable + JSON output

## Example Usage

**User**: "use sfa to query spec 001 for acceptance criteria"

**Response**:
I'll run the spec query SFA to extract acceptance criteria from spec 001.

```bash
uv run apps/backend/single-file-agents/agents/sfa_spec_query_anthropic_v1.py \
  --spec-dir .auto-claude/specs/001-auth-feature \
  --query "What are the acceptance criteria?"
```

The SFA will:
1. Load spec.md from the spec directory
2. Use Claude to extract relevant information
3. Return formatted results with citations

## Creating New SFAs

Template structure:
```python
#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["anthropic>=0.45.2", "rich>=13.7.0"]
# ///

import argparse
from anthropic import Anthropic
from rich.console import Console

def main():
    parser = argparse.ArgumentParser()
    # Add arguments
    args = parser.parse_args()

    # Your logic here
    console = Console()
    console.print("[green]Results:[/green]")

if __name__ == "__main__":
    main()
```

## Integration

SFAs complement Auto-Claude's core agents:
- **Core agents** (planner, coder, QA) - Multi-module, complex workflows
- **SFAs** - Single-purpose, quick analysis, utilities

Use SFAs when:
- You need quick information
- Analysis doesn't require state management
- Task is well-scoped and standalone

## Tips

- SFAs are fast (< 30 seconds)
- Use `--json` flag for machine-readable output
- Check `--help` for available options
- Create custom SFAs for project-specific needs

## Next Steps

After SFA execution:
1. Review results
2. Use findings to inform next actions
3. Store insights in Archon RAG (if needed)
