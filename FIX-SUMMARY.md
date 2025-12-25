# Fix for Issue #215: spawn python ENOENT

## Problem

Auto-Claude fails on macOS (and potentially Ubuntu when launched from GUI) with "spawn python ENOENT" error, even though Python is installed and detected correctly.

## Root Cause

The Python detector (`findPythonCommand()`) correctly finds Python at locations like:
- macOS: `/opt/homebrew/bin/python3`
- Ubuntu: `/usr/bin/python3`, `/snap/bin/python3`

However, when `spawn()` executes the Python process, it uses `process.env` which doesn't include these paths when the app is launched from the GUI (Finder on macOS, desktop launcher on Linux).

**Why this happens:**
- GUI-launched Electron apps don't inherit the full shell PATH
- Homebrew binaries on macOS are in `/opt/homebrew/bin` (not in GUI PATH)
- Snap binaries on Linux are in `/snap/bin` (not in GUI PATH)
- Terminal-launched apps work fine because the shell sets up PATH

## The Fix

**File:** `apps/frontend/src/main/ipc-handlers/context/project-context-handlers.ts`

**Line 191 - Changed from:**
```typescript
env: { ...process.env }
```

**To:**
```typescript
env: getAugmentedEnv()
```

**What `getAugmentedEnv()` does:**
- Already exists in `apps/frontend/src/main/env-utils.ts`
- Adds platform-specific binary paths to PATH:
  - **macOS**: `/opt/homebrew/bin`, `/usr/local/bin`, `/opt/homebrew/sbin`, `/usr/local/sbin`
  - **Linux**: `/usr/local/bin`, `/snap/bin`, `~/.local/bin`
  - **Windows**: Common Git and GitHub CLI paths
- Only adds paths that exist on the filesystem
- Already used for GitHub CLI detection (same issue, same fix)

## Testing

### On Ubuntu 24.04 (this system)
```bash
$ node test-env-fix.js
✓ getAugmentedEnv() working correctly
Python3 found at: /usr/bin/python3
Version: Python 3.12.3
```

### Required Testing (Need Node.js 24+)
1. Build the app: `npm run build`
2. Package the app: `npm run package`
3. Launch from GUI (not terminal)
4. Try "Analyze context" or "Generate context"
5. Verify no "spawn python ENOENT" errors

## Commit

```
commit 208c9d0
fix: use augmented env for Python analyzer spawn to fix macOS PATH issue

Fixes #215 - Python detection was working correctly but the spawn() call
wasn't using the augmented environment that includes Homebrew paths.
```

## Workaround (Until Fix is Released)

**For macOS users right now:**
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
open /Applications/Auto\ Claude.app
```

**For Linux users:**
```bash
export PATH="/snap/bin:/usr/local/bin:$PATH"
/path/to/auto-claude.AppImage
```

## Next Steps

1. ✅ Code fix applied and committed
2. ✅ Build successful (TypeScript compiled)
3. ⏳ Needs testing with Node.js 24+ (we have v18)
4. ⏳ Package and test from GUI launch
5. ⏳ Submit PR to upstream

## Additional Notes

- This is the SAME fix pattern used for GitHub CLI detection in the codebase
- The `getAugmentedEnv()` utility was created specifically for this type of issue
- The fix doesn't break anything - if paths are already in PATH, they won't be added again
- Zero-risk change: just uses existing utility instead of raw `process.env`
