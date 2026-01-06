# Auto-Claude: Resume & Restart Guide

How to handle interrupted builds and resume work in Auto-Claude.

---

## Quick Reference

| Scenario | Action |
|----------|--------|
| Paused mid-task, want to continue | Just run the same command again |
| Want to pause gracefully | Press `Ctrl+C` once |
| Want to exit immediately | Press `Ctrl+C` twice |
| Build seems stuck | Create `PAUSE` file, review, delete to resume |
| Need to add instructions | Create `HUMAN_INPUT.md` in spec directory |

---

## How Resumption Works

### State That Is Preserved (Survives Interruption)

| State | Location | Description |
|-------|----------|-------------|
| Subtask status | `implementation_plan.json` | pending/in_progress/completed/failed |
| Git commits | `.git/` in worktree | All committed work is saved |
| Attempt history | `memory/attempt_history.json` | What approaches were tried |
| Session insights | `memory/session_insights/` | Learnings from past sessions |
| Build commits | `memory/build_commits.json` | Good commits for rollback |
| Codebase map | `memory/codebase_map.json` | File structure and patterns |
| Patterns | `memory/patterns.md` | Code patterns discovered |
| Gotchas | `memory/gotchas.md` | Pitfalls to avoid |
| Graphiti memory | Project's graphiti DB | Cross-session context |

### State That Is Lost

| State | Reason |
|-------|--------|
| Agent's internal context | Fresh context window each session |
| Uncommitted file changes | Not saved to git |
| In-memory variables | Process terminated |

**Key Point:** Completed subtasks are never re-attempted. The agent picks up at the next pending subtask.

---

## Resuming an Interrupted Build

### Method 1: Command Line

Simply run the same command again:

```bash
cd <project-directory>
python <auto-claude-path>/apps/backend/run.py --spec <spec-number>
```

Example:
```bash
python I:/AI_Projects/Auto-Claude/apps/backend/run.py --spec 001
```

### Method 2: Auto-Claude UI

1. Open Auto-Claude UI
2. Navigate to the spec that was interrupted
3. Click "Resume" or "Continue Build"

The agent will:
1. Read `implementation_plan.json` to find current progress
2. Identify the next pending subtask
3. Load recovery context (if previous attempts failed)
4. Continue from where it left off

---

## Graceful Pause Options

### Option 1: Ctrl+C (Keyboard Interrupt)

- **Press once:** Pauses the build, prompts for optional instructions
- **Press twice:** Exits immediately

After single Ctrl+C:
```
Build paused. Options:
1. Add instructions for next session (will be saved)
2. Press Ctrl+C again to exit
3. Wait to continue...
```

### Option 2: PAUSE File

Create a file named `PAUSE` in the spec directory:

```bash
touch .auto-claude/specs/<spec-name>/PAUSE
```

The build will pause at the next checkpoint. To resume:

```bash
rm .auto-claude/specs/<spec-name>/PAUSE
python run.py --spec <spec-number>
```

### Option 3: Add Human Instructions

Create `HUMAN_INPUT.md` in the spec directory with guidance:

```markdown
# Human Instructions

Please focus on the authentication module first.
The API endpoint should use JWT tokens, not session cookies.
```

This will be automatically injected into the next session's prompt.

---

## Checking Build Status

### View Progress Summary

```bash
python run.py --spec <spec-number> --status
```

Or check `implementation_plan.json` directly:

```json
{
  "phases": [
    {
      "subtasks": [
        {"id": "subtask-1-1", "status": "completed"},
        {"id": "subtask-1-2", "status": "completed"},
        {"id": "subtask-2-1", "status": "in_progress"},  // <-- Current
        {"id": "subtask-2-2", "status": "pending"},
        {"id": "subtask-2-3", "status": "pending"}
      ]
    }
  ]
}
```

### Subtask Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Not started yet |
| `in_progress` | Currently being worked on |
| `completed` | Finished successfully |
| `blocked` | Waiting on dependency |
| `failed` | Attempted but failed |

---

## Recovery from Failed Subtasks

### Automatic Recovery

When a subtask fails multiple times, Auto-Claude:
1. Records the attempt in `attempt_history.json`
2. Marks the subtask as "stuck" after 3+ failures
3. Tries different approaches on retry
4. Loads Graphiti memory for context

### Manual Recovery

If a subtask is stuck:

1. **Review attempt history:**
   ```bash
   cat .auto-claude/specs/<spec>/memory/attempt_history.json
   ```

2. **Add human guidance:**
   ```bash
   echo "Try using library X instead of Y" > .auto-claude/specs/<spec>/HUMAN_INPUT.md
   ```

3. **Reset subtask status (if needed):**
   Edit `implementation_plan.json` and change status from `failed` to `pending`

4. **Resume:**
   ```bash
   python run.py --spec <spec-number>
   ```

---

## Starting Fresh (Full Reset)

If you want to completely restart a spec:

### Option 1: Delete and Recreate

```bash
# Delete the spec directory
rm -rf .auto-claude/specs/<spec-name>

# Delete the worktree
git worktree remove .worktrees/<spec-name> --force

# Recreate the spec
python spec_runner.py --task "Your task description"
```

### Option 2: Reset Status Only

Edit `implementation_plan.json` and set all subtasks to `pending`:

```json
{"id": "subtask-1-1", "status": "pending", "started_at": null, "completed_at": null}
```

Then run again:
```bash
python run.py --spec <spec-number>
```

---

## Windows-Specific Notes

### Kill Stale Processes Before Resume

Windows doesn't properly clean up processes. Before resuming:

```powershell
taskkill /F /IM python.exe /IM node.exe /IM electron.exe 2>$null
```

### Verify No Lock Files

Check for stale lock files:

```powershell
dir .auto-claude\specs\<spec>\*.lock
dir .worktrees\<spec>\.git\index.lock
```

Delete any found lock files before resuming.

---

## Troubleshooting

### Build Won't Resume

1. **Check for PAUSE file:** `ls .auto-claude/specs/<spec>/PAUSE`
2. **Check for lock files:** `ls .auto-claude/specs/<spec>/*.lock`
3. **Kill stale processes:** `taskkill /F /IM python.exe`
4. **Verify plan exists:** `cat .auto-claude/specs/<spec>/implementation_plan.json`

### Wrong Subtask Running

The agent always picks the first `pending` subtask respecting phase dependencies. If wrong:
1. Check `implementation_plan.json` for status values
2. Manually set completed tasks to `completed`
3. Manually set the target task to `pending`

### Lost Work

Check git history in the worktree:
```bash
cd .worktrees/<spec-name>
git log --oneline -20
git diff HEAD~1
```

Committed work is always preserved.

---

## Best Practices

1. **Let subtasks complete** - Interrupting mid-subtask loses that subtask's uncommitted work
2. **Use PAUSE file for planned breaks** - Cleaner than Ctrl+C
3. **Check status before resuming** - Understand where you left off
4. **Add HUMAN_INPUT.md for guidance** - Help the agent if it's struggling
5. **Kill stale processes on Windows** - Prevents conflicts
6. **Review attempt history** - Understand what's been tried before
