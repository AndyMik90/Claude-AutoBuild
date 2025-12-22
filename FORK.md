# Fork Maintenance Strategy

## Overview

This repository is a fork of [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude). We maintain a specific workflow to keep up with the active upstream development while preserving our custom modifications (Antigravity integration, extended providers, etc.).

## Branch Structure

- **`upstream`**: A read-only mirror of the original `upstream/main` branch. Never commit directly to this branch.
- **`main`**: Our stable fork containing all our customizations.
- **`integration`**: A disposable branch used to verify merges from upstream before applying them to `main`.
- **`feature/*`**: Feature branches for new development.

## Workflow

### 1. Syncing with Upstream (Weekly)

We use a **Merge** strategy for upstream updates to preserve the history of when we synced.

Run the automated agent workflow (or perform manually):

```bash
# 1. Update upstream mirror
git fetch upstream
git checkout upstream
git reset --hard upstream/main

# 2. Test merge on integration branch
git checkout integration
git reset --hard main    # Reset to current stable state
git merge upstream/main --no-ff

# 3. IF CONFLICTS:
#    - Resolve them
#    - Run tests: /run_backend_tests
#    - Verify Antigravity configs

# 4. Apply to main (only if integration tests pass)
git checkout main
git merge upstream/main --no-ff -m "Sync upstream vX.X.X"
```

### 2. developing Features

We use a **Rebase** strategy for our own features to keep our history clean.

```bash
# Start a feature
git checkout main
git checkout -b feature/my-new-feature

# Update feature with latest main
git fetch origin
git rebase origin/main

# Merge to main
git checkout main
git merge feature/my-new-feature --ff-only
git push origin main
```

## Conflict Minimization Tips

1.  **Isolate Core Changes**: If you must modify core files (like `run.py`), try to do it in a way that minimizes lines touched.
    - _Bad_: Rewriting a whole function.
    - _Good_: Monkey-patching or wrapping the function in a separate file.
2.  **Separate Files**: Keep new logic in new files (e.g., `providers/my_provider.py`) rather than appending to existing upstream files.

## Emergency Rollback

If a sync breaks everything:

```bash
# Reset main to the state before the merge
git checkout main
git reset --hard <commit-hash-before-merge>
```
