---
description: Start a new feature branch following the fork's rebase workflow
---

# Start Feature Workflow

Automatically identifies the next uncompleted feature from EPIC_BREAKDOWN.md and creates a properly named branch.

## Step 1: Identify Next Feature

Read `fork-docs/EPIC_BREAKDOWN.md` and find the FIRST uncompleted feature (`[ ]`) that:

- Has all dependencies completed
- Follows epic order (Epic 1 → 2 → 3...)

**Extract:**

- Epic number (e.g., `1`)
- Feature number (e.g., `1.1`)
- Feature title (e.g., "Provider Interface & Types")

## Step 2: Generate Branch Name

Convert feature info to branch name format:

```
feature/epic{N}-{feature_number}-{short_title}
```

**Rules:**

- Lowercase everything
- Replace spaces with hyphens
- Remove special characters
- Keep it under 50 chars

**Examples:**

- Feature 1.1 "Provider Interface & Types" → `feature/epic1-1.1-provider-interface-types`
- Feature 2.1 "Gemini CLI Provider Core" → `feature/epic2-2.1-gemini-cli-provider-core`
- Task 1.2.1 under Feature 1.2 → `feature/epic1-1.2-claude-cli-extraction` (use feature name, not task)

## Step 3: Confirm with User

Present the branch name:

> 🌿 **Starting Feature Branch**
>
> **Feature:** {Feature ID} — {Title}
> **Branch:** `feature/epic{N}-{X.Y}-{short-title}`
>
> Say "go" to create, or provide a different branch name.

## Step 4: Create Branch

// turbo

```bash
git checkout main
git pull origin main
```

Then create the feature branch:

```bash
git checkout -b feature/epic{N}-{X.Y}-{short-title}
```

## Step 5: Verify

// turbo

```bash
git branch --show-current
```

## Step 6: Confirm Ready

> ✅ **Branch created:** `feature/epic{N}-{X.Y}-{short-title}`
>
> You're now ready to implement:
>
> - **Feature {X.Y}**: {Title}
> - **Model**: {Recommended Model from EPIC_BREAKDOWN}
>
> Say "implement" to start, or "next" to see full details.

## Notes

- **Atomic features (🔹)**: Entire feature done in this branch
- **Composite features (🔸)**: All tasks in feature done in this branch, separate commits per task
- **Commit convention**: `feat(epic{N}): {description}` for features, `feat(epic{N}): task {X.Y.Z} - {description}` for tasks
