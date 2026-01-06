# Bug Report: Windows - Coding Phase Never Starts (404 Model Error)

**Related Issue:** #609

## Two Distinct Issues

This bug report covers two separate issues that both prevented the coding phase from working on Windows:

| Aspect | Issue #609 (Process Spawn) | Model ID Issue (API Error) |
|--------|---------------------------|---------------------------|
| **Symptom** | Coding phase never starts | Coding phase starts but fails with 404 |
| **Error** | Process doesn't spawn | `API Error: 404 model not found` |
| **Root Cause** | `os.execv()` + worktree issues | Wrong model ID in `phase_config.py` |
| **Fixes** | subprocess.run, read-tree/checkout-index | Correct model ID to `20250929` |

The #609 fixes got the process to **start**, but then the model ID bug caused it to **fail immediately**. Both needed to be fixed for the full pipeline to work.

---

## Environment Details
- **OS:** Windows 10 (MSYS_NT-10.0-19045)
- **Python Version:** 3.12
- **Node.js Version:** v24.12.0
- **Auto Claude Version:** 2.7.2
- **Claude CLI Version:** 2.0.76

## Issue Description

On Windows, the coding phase fails immediately after planning completes with a 404 API error for an invalid model ID.

### Steps to Reproduce
1. Open Auto Claude UI on Windows
2. Create a new spec (any simple task like "add Test 1 to README")
3. Let planning phase complete
4. Observe coding phase fails repeatedly with 404 error

### Expected Behavior
Coding phase should start and execute the implementation plan.

### Actual Behavior
Coding phase fails immediately with:
```
API Error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-4-5-20241022"},"request_id":"req_..."}
```

The error repeats every ~2 minutes as the system retries.

### Error Messages/Logs
```
10:53:12 AM - Continuing implementation...
10:53:54 AM - API Error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-4-5-20241022"},"request_id":"req_011CWpfBAsqy7Wqn5eCCtnTw"}
```

## Root Cause Analysis

### Primary Issue: Invalid Model ID in phase_config.py
**File:** `apps/backend/phase_config.py` (Line 16)

The model ID `claude-sonnet-4-5-20241022` does not exist. The correct model ID is `claude-sonnet-4-5-20250929` (Claude Sonnet 4.5 was released September 29, 2025).

**Evidence:**
- Frontend `models.ts` already had the correct ID
- Anthropic API returns 404 for the invalid model
- Web search confirmed correct model ID

### Secondary Issue: Project .env Override
**File:** `<project>/.auto-claude/.env`

The project-specific `.env` file had `AUTO_BUILD_MODEL=claude-sonnet-4-5-20241022` which overrides `phase_config.py`, causing the error to persist even after fixing the source code.

---

# Fix History

## Fix 1: Correct Model ID in phase_config.py

**File:** `apps/backend/phase_config.py`
**Line:** 16

**Before:**
```python
MODEL_ID_MAP: dict[str, str] = {
    "opus": "claude-opus-4-5-20251101",
    "sonnet": "claude-sonnet-4-5-20241022",  # WRONG - this model doesn't exist
    "haiku": "claude-haiku-4-5-20251001",
}
```

**After:**
```python
MODEL_ID_MAP: dict[str, str] = {
    "opus": "claude-opus-4-5-20251101",
    "sonnet": "claude-sonnet-4-5-20250929",  # CORRECT - matches Anthropic API
    "haiku": "claude-haiku-4-5-20251001",
}
```

**Status:** Applied and verified working

---

## Fix 2: Comment Out Stale .env Override (Per-Project)

**File:** `<project>/.auto-claude/.env`

**Before:**
```bash
# Model override (OPTIONAL)
AUTO_BUILD_MODEL=claude-sonnet-4-5-20241022
```

**After:**
```bash
# Model override (OPTIONAL)
# AUTO_BUILD_MODEL=claude-sonnet-4-5-20250929
```

**Note:** This is a per-project fix. Users who created projects before this fix may have the stale model ID in their project's `.env` file.

**Recommendation:** Let `phase_config.py` be the single source of truth for model IDs. Only use `AUTO_BUILD_MODEL` override for special testing scenarios.

---

## Previously Applied Fixes (From Issue #609)

### Fix 3: os.execv() to subprocess.run() for Windows
**File:** `apps/backend/runners/spec_runner.py`
**Lines:** 50, 344-349

**Problem:** `os.execv()` doesn't work correctly on Windows for process replacement.

**Solution:**
```python
import subprocess  # Added

# Lines 344-349: Windows fix
if sys.platform == "win32":
    result = subprocess.run(run_cmd)
    sys.exit(result.returncode)
else:
    os.execv(sys.executable, run_cmd)
```

### Fix 4: Git Worktree Creation for Windows
**File:** `apps/backend/core/worktree.py`
**Lines:** 22, 335-366

**Problem:** Git worktree creation fails on Windows with "Could not reset index file" error.

**Solution:** Use `read-tree` + `checkout-index` instead of standard worktree checkout on Windows:
```python
import sys  # Added to imports

if sys.platform == "win32":
    result = self._run_git(
        ["worktree", "add", "--no-checkout", "-b", branch_name, str(worktree_path), self.base_branch]
    )
    # Step 1: Read tree into worktree's index
    read_result = self._run_git(["read-tree", "HEAD"], cwd=worktree_path)
    # Step 2: Checkout files from index
    checkout_result = self._run_git(["checkout-index", "-a", "-f"], cwd=worktree_path)
```

### Fix 5: Git Long Paths
**Command:** `git config --global core.longpaths true`

**Problem:** Windows has path length limitations that cause errors with deeply nested files.

---

## Verification

After applying all fixes:

1. Kill stale processes:
   ```powershell
   taskkill /F /IM python.exe /IM node.exe /IM electron.exe 2>$null
   ```

2. Restart Auto Claude UI:
   ```powershell
   cd <auto-claude-path>
   npm run dev
   ```

3. Create and run a test spec - all phases should complete successfully:
   - Planning phase
   - Coding phase
   - Validation phase

---

## Files Modified Summary

| File | Change |
|------|--------|
| `apps/backend/phase_config.py` | Fixed sonnet model ID |
| `apps/backend/runners/spec_runner.py` | Windows subprocess fix |
| `apps/backend/core/worktree.py` | Windows worktree creation fix |
| `<project>/.auto-claude/.env` | Comment out stale model override |

---

## Additional Notes

### Stale Process Issue
Windows does not properly clean up PTY daemon and child processes when Auto Claude UI closes. Before each session, run:
```powershell
taskkill /F /IM python.exe /IM node.exe /IM electron.exe 2>$null
```

### Model ID Verification
Current valid model IDs (as of January 2026):
- `claude-opus-4-5-20251101`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`

Source: [Anthropic API Documentation](https://docs.anthropic.com/en/docs/about-claude/models)
