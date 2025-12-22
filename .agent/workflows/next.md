---
description: Find and present the next uncompleted feature/task from EPIC_BREAKDOWN.md
---

# Next Feature Workflow

When the user says "next" (or similar), follow these steps exactly:

## Step 1: Read the Epic Breakdown

Read `fork-docs/EPIC_BREAKDOWN.md` and find the FIRST item that meets ALL of these criteria:

1. Has `[ ]` (unchecked) status
2. Is either:
   - A **Feature** (under an Epic with `[ ]`)
   - A **Task** (under a Feature with `[ ]`, for composite features only)
3. Has all dependencies completed (check the Dependencies field of its Epic)

**Priority order:**

- Follow the epic order: Epic 1 → Epic 2 → Epic 3 → etc.
- Within epics, follow feature order: Feature 1.1 → 1.2 → 1.3 → etc.
- For composite features with tasks, complete tasks in order

## Step 2: Check if Context7 is Needed

Analyze the feature/task to determine if Context7 MCP should be used during implementation.

**Context7 is REQUIRED when the feature involves:**

- Adding new external libraries or packages
- Integrating with third-party APIs (Gemini CLI, Jules API, etc.)
- Using SDK/CLI documentation (Claude SDK, Gemini CLI flags, etc.)
- Working with frameworks that have frequent updates
- Implementing authentication flows (OAuth, API keys)
- Parsing specific output formats (JSON schemas from external tools)

**Context7 is NOT needed for:**

- Internal refactoring
- Documentation updates
- Test writing (unless testing external integrations)
- Configuration file creation
- Simple data structure definitions

## Step 3: Present the Next Item

**DO NOT:**

- Create a plan
- Start implementing
- Use task_boundary
- Think extensively

**DO:**
Present the item in this exact format:

---

## 📋 Next: [Feature/Task ID] — [Title]

**Type:** 🔹 Atomic Feature / 🔸 Composite Task  
**Epic:** [Epic Name]  
**Model:** [Recommended Model]  
**Context7:** ✅ Required / ❌ Not needed

> [If Context7 required, list specific libraries/APIs to look up]
> Example: "Use Context7 for: `gemini-cli`, `httpx`, `subprocess` patterns"

### Description

[Copy the full description from EPIC_BREAKDOWN.md]

### Acceptance Criteria

[Copy acceptance criteria if it's an atomic feature, or just the task description if it's a task]

---

**Say "implement" when ready to proceed.**

---

## Step 4: Wait for User

Stop and wait for the user to say "implement" or give other instructions.

## Step 5: On "implement"

When the user says "implement":

- Proceed with normal Antigravity flow (PLANNING → EXECUTION → VERIFICATION)
- The model recommendation is a suggestion; Antigravity will use its standard logic

**If Context7 was marked as required:**
During the PLANNING phase, you MUST:

1. Call `mcp_context7_resolve-library-id` for each library/API identified
2. Call `mcp_context7_get-library-docs` to fetch current documentation
3. Use the fetched docs to inform your implementation plan

Example for Gemini CLI feature:

```
1. resolve-library-id("gemini cli")
2. get-library-docs(libraryId, topic="output-format json")
3. Use returned docs in implementation plan
```

## Step 6: After Implementation Complete

**CRITICAL**: After successfully completing the feature/task implementation:

1. **Update EPIC_BREAKDOWN.md** — Change `[ ]` to `[x]` for the completed item
2. **Update CHANGELOG.fork.md** — Add entry under `## [Unreleased]` in appropriate category
3. **Inform the user** — Confirm what was marked complete

Example completion message:

> ✅ **Completed: Feature 1.1 — Provider Interface & Types**
>
> Updated:
>
> - `fork-docs/EPIC_BREAKDOWN.md` — Marked feature as complete
> - `CHANGELOG.fork.md` — Added entry under Fork Features
>
> Say "next" to continue with the next feature.

## Special Cases

### All Features in Current Epic Complete

If all features in the current Epic are complete `[x]`, automatically move to the next Epic.

### Dependencies Not Met

If the next feature has unmet dependencies, skip it and find the next available one. Mention the skipped feature:

> ⏭️ Skipping Feature X.Y (depends on Epic Z which is not complete)

### All Complete

If everything in EPIC_BREAKDOWN.md is complete:

> ✅ All features and tasks in EPIC_BREAKDOWN.md are complete!
>
> Consider:
>
> - Running `/update_changelog` to document your work
> - Preparing a fork release
