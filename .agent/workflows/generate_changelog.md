---
description: Generate changelog entries from git diff between current branch and main
---

# Generate Changelog Workflow

Generates changelog entries by analyzing the git diff between the current branch and main.

## When to Use

- Before merging a feature branch to main
- When preparing a fork release
- After completing multiple features and wanting to summarize changes

## Steps

### Step 1: Get Current Branch Info

// turbo

```bash
git branch --show-current
```

### Step 2: Get Diff Summary

// turbo

```bash
git log main..HEAD --oneline --no-merges
```

### Step 3: Get Detailed Changes

// turbo

```bash
git diff main --stat
```

### Step 4: Analyze File Changes

// turbo

```bash
git diff main --name-status
```

### Step 5: Generate Changelog Entry

Based on the diff analysis, generate a changelog entry following this format:

```markdown
## [Unreleased]

### 🚀 Fork Features

- **[Feature Name]** — [Description based on commits]
  - Key changes: [summarize main file changes]
  - Reference: (Epic X, Feature X.Y) — if applicable

### 🔧 Fork Improvements

- **[Improvement]** — [Description]

### 🐛 Fork Bug Fixes

- **[Fix]** — [Description]

### 📚 Fork Documentation

- **[Doc change]** — [Description]
```

### Step 6: Present to User

Present the generated changelog entry and ask:

> 📝 **Generated Changelog Entry**
>
> [Show the generated entry]
>
> **Options:**
>
> 1. Say "apply" to add this to CHANGELOG.fork.md
> 2. Say "edit" to modify before applying
> 3. Say "cancel" to discard

### Step 7: On "apply"

1. Read current `CHANGELOG.fork.md`
2. Insert the new entries under `## [Unreleased]` in the appropriate categories
3. Confirm the update

### Guidelines for Changelog Generation

#### Categorization Rules

| Change Type             | Category              | Examples                                |
| ----------------------- | --------------------- | --------------------------------------- |
| New functionality       | 🚀 Fork Features      | New provider, new API, new UI component |
| Enhancement to existing | 🔧 Fork Improvements  | Performance, UX, refactoring            |
| Bug fixes               | 🐛 Fork Bug Fixes     | Error handling, edge cases              |
| Documentation           | 📚 Fork Documentation | README, guides, comments                |
| Upstream sync           | 🔄 Upstream Syncs     | Merge from upstream                     |
| Breaking change         | ⚠️ Breaking Changes   | API changes, removed features           |

#### Commit Message Parsing

Map conventional commit prefixes:

- `feat:` → 🚀 Fork Features
- `fix:` → 🐛 Fork Bug Fixes
- `docs:` → 📚 Fork Documentation
- `refactor:`, `perf:`, `style:` → 🔧 Fork Improvements
- `chore:` → Usually skip unless significant

#### Entry Quality

- Be concise but descriptive
- Focus on user-facing impact
- Group related commits into single entries
- Reference Epic/Feature IDs when applicable
