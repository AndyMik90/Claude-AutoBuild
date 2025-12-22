---
description: Update the fork changelog after completing work
---

# Update Fork Changelog

Use this workflow after completing features, syncing upstream, or preparing releases.

## When to Use

- After completing a feature from `EPIC_BREAKDOWN.md`
- After syncing with upstream using `/sync_upstream`
- Before creating a fork release

## Steps

### 1. Determine Change Type

Identify which category your change belongs to:

- 🚀 **Fork Features** — New fork-specific functionality
- 🔧 **Fork Improvements** — Enhancements to fork code
- 🐛 **Fork Bug Fixes** — Fixes for fork-specific issues
- 📚 **Fork Documentation** — Docs for fork features
- 🔄 **Upstream Syncs** — Recording an upstream sync
- ⚠️ **Breaking Changes** — Backward-incompatible changes

### 2. Add Entry to CHANGELOG.fork.md

Open `CHANGELOG.fork.md` and add your entry under `## [Unreleased]` in the appropriate category section.

**Entry format:**

```markdown
- **Short descriptive title** — Detailed explanation of what changed and why
  - Additional context if needed
  - Reference: (Epic X, Feature X.Y)
```

### 3. For Upstream Syncs

When recording an upstream sync, include:

```markdown
### 🔄 Upstream Syncs

- **Sync upstream vX.X.X** — Merged upstream changes from AndyMik90/Auto-Claude
  - Upstream version: X.X.X
  - Notable upstream changes: [brief summary]
  - Conflicts resolved: [list any conflicts]
```

### 4. For Feature Completion

When completing an epic/feature from EPIC_BREAKDOWN.md:

```markdown
### 🚀 Fork Features

- **[Feature Name]** — [Description of what the feature does]
  - Key components: [list main files/modules added]
  - Reference: (Epic X, Feature X.Y)
```

### 5. Mark Epic Breakdown Progress

After adding the changelog entry, also update `fork-docs/EPIC_BREAKDOWN.md`:

- Mark the completed feature/task with `[x]`

## Preparing a Release

When ready to release:

// turbo

1. Run `git log --oneline origin/main..HEAD` to review all commits

2. Move all entries from `## [Unreleased]` to a new version section:

   ```markdown
   ## [2.X.X-fork.N] - YYYY-MM-DD
   ```

3. Determine version number:

   - Check current upstream version in `CHANGELOG.md`
   - Increment fork number: `2.7.1-fork.1` → `2.7.1-fork.2`
   - If upstream synced, reset: `2.8.0-fork.1`

4. Clear `## [Unreleased]` categories for next cycle

5. Commit: `git commit -m "chore: release vX.X.X-fork.N"`
