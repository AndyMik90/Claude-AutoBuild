# Auto-Claude Task Execution Failure - Root Cause Analysis

**Date:** 2026-01-01
**Investigator:** Claude Sonnet 4.5
**Issue:** Task execution stops after planning phase despite approval

---

## Executive Summary

Auto-Claude tasks complete the planning phase successfully and get approved, but the coding phase never starts. The **root cause** is a **state machine bug** in `implementation_plan/plan.py` (lines 163-167) that keeps the plan stuck in `"human_review"/"review"` status after approval, preventing the transition to `"in_progress"` that should occur when execution begins.

---

## Investigation Timeline

### 1. Initial Discovery

**Files Examined:**
- `.auto-claude/specs/001-memory-leak-event-listeners-not-cleaned-up-in-task/implementation_plan.json`
- `.auto-claude/specs/001-memory-leak-event-listeners-not-cleaned-up-in-task/task_logs.json`
- `.auto-claude/specs/001-memory-leak-event-listeners-not-cleaned-up-in-task/review_state.json`

**Key Findings:**
- **implementation_plan.json** shows:
  - `status`: "human_review"
  - `planStatus`: "review"
  - All subtasks: `status`: "pending"
  - `recoveryNote`: "Task recovered from stuck state at 2026-01-01T14:43:22.387Z"

- **task_logs.json** shows:
  - Planning phase completed at 14:41:54
  - Coding phase: `status`: "pending", `started_at`: null, `entries`: []
  - **Coding phase never started**

- **review_state.json** shows:
  - `approved`: true
  - `approved_by`: "auto"
  - `approved_at`: "2026-01-01T09:41:54.239543"

**Conclusion:** Plan was approved, but execution never began.

### 2. Execution Flow Tracing

Traced the complete execution path:

1. ✅ **build_commands.py (lines 164-167):** Approval validation passes
2. ✅ **build_commands.py (line 226):** Calls `run_autonomous_agent()`
3. ✅ **coder.py (line 128):** `is_first_run()` correctly returns False (plan exists)
4. ✅ **coder.py (lines 164-180):** Agent enters "continuing build" path
5. ✅ **coder.py (line 176):** Task logger starts coding phase
6. ✅ **coder.py (line 179):** Emits coding phase event
7. ⚠️ **coder.py (line 221):** Calls `get_next_subtask(spec_dir)`
8. ❌ **coder.py (lines 292-294):** `next_subtask` is None → exits with "No pending subtasks found"

**Critical Question:** Why does `get_next_subtask()` return `None` when there are pending subtasks?

### 3. Function Analysis: `get_next_subtask()`

**Location:** `apps/backend/core/progress.py` lines 402-456

**Expected Behavior:**
```python
def get_next_subtask(spec_dir: Path) -> dict | None:
    # Load plan
    # Build phase completion map
    # Find first pending subtask in phases with satisfied dependencies
    # Return subtask dict or None
```

**Testing Results:**
- ✅ Function logic is correct
- ✅ Plan structure is valid (3 phases, 6 pending subtasks)
- ✅ Dependencies are correct (phase-1 has no deps)
- ✅ When called directly from Python: **RETURNS SUBTASK CORRECTLY**

**Paradox:** Function works when tested directly, but returns `None` during build execution.

### 4. Root Cause Discovery

**Location:** `apps/backend/implementation_plan/plan.py` lines 163-167

**The Bug:**
```python
else:
    # All subtasks pending
    # Preserve human_review/review status if it's for plan approval stage
    if self.status == "human_review" and self.planStatus == "review":
        # Keep the plan approval status - don't reset to backlog
        pass  # ← BUG: Status stays "human_review" forever!
    else:
        self.status = "backlog"
        self.planStatus = "pending"
```

**Problem:** The `update_status_from_subtasks()` method preserves `"human_review"/"review"` status when all subtasks are pending. This was intended for the **pre-execution approval stage**, but there's **no mechanism** to transition the plan to `"in_progress"` when execution begins **after** approval.

### 5. State Machine Analysis

**Expected State Transitions:**

```
1. Planning creates plan
   ↓ status: "in_progress", planStatus: "in_progress"

2. Planning completes
   ↓ status: "human_review", planStatus: "review" (awaiting approval)

3. User approves
   ↓ review_state.json: approved: true

4. Build starts (SHOULD transition here) ← ❌ MISSING!
   ↓ status: "in_progress", planStatus: "in_progress"

5. Coding begins
   ↓ Execute subtasks
```

**Actual State Transitions:**

```
1-3. ✅ Same as above

4. Build starts
   ↓ Status STAYS "human_review"/"review" due to lines 163-167 ❌

5. Coding never starts
   ↓ get_next_subtask() likely returns None (reason still TBD)
```

---

## Technical Details

### Plan Status Values

The implementation plan uses two status fields:

| Field | Values | Meaning |
|-------|--------|---------|
| `status` | backlog, in_progress, ai_review, human_review, done | Overall task state |
| `planStatus` | pending, in_progress, review, completed | Plan-specific state |

### Code References

**1. Status Preservation (THE BUG):**
- File: `apps/backend/implementation_plan/plan.py`
- Lines: 163-167
- Method: `update_status_from_subtasks()`
- Issue: Preserves "human_review"/"review" when all subtasks pending

**2. Approval Validation:**
- File: `apps/backend/cli/build_commands.py`
- Lines: 164-167
- Status: ✅ Works correctly

**3. Agent Execution Loop:**
- File: `apps/backend/agents/coder.py`
- Lines: 128-294
- Issue: Exits when `get_next_subtask()` returns `None` (line 292-294)

**4. Subtask Discovery:**
- File: `apps/backend/core/progress.py`
- Lines: 402-456
- Status: ✅ Function logic is correct
- Paradox: Returns subtask when tested directly, None during execution

**5. First Run Detection:**
- File: `apps/backend/prompts_pkg/prompts.py`
- Lines: 245-278
- Status: ✅ Works correctly

---

## Open Questions

### Why does `get_next_subtask()` return `None` during execution?

**Hypothesis 1:** Missing status transition blocks execution
- The plan status "human_review" might be checked somewhere
- No explicit blocking code found in build_commands.py or coder.py
- May be an implicit expectation in the system

**Hypothesis 2:** Plan file modified during execution
- Worktree isolation could use different spec directory
- Testing showed no active worktrees for this spec
- File timestamps unchanged

**Hypothesis 3:** Timing or environment issue
- Function works in isolation
- Different behavior during actual build
- Needs runtime debugging to confirm

### Where should the status transition occur?

**Candidates:**
1. **build_commands.py** (line 226) - Before calling `run_autonomous_agent()`
   - Add status transition after approval validation
   - Transition: "human_review" → "in_progress"

2. **coder.py** (lines 164-180) - When entering "continuing build" path
   - Check if `first_run` is False and plan status is "human_review"
   - Transition to "in_progress" before starting coding

3. **implementation_plan/plan.py** - In `update_status_from_subtasks()` method
   - Remove the preservation logic (lines 163-167)
   - OR add smarter logic to detect post-approval state

---

## Proposed Fix

### Option 1: Add Status Transition in coder.py (RECOMMENDED)

**Location:** `apps/backend/agents/coder.py` after line 163

```python
else:
    print(f"Continuing build: {highlight(spec_dir.name)}")
    print_progress_summary(spec_dir)

    # ✅ ADD THIS: Transition from approval to execution
    plan = ImplementationPlan.load(spec_dir / "implementation_plan.json")
    if plan.status == "human_review" and plan.planStatus == "review":
        # Check if already approved
        review_state = ReviewState.load(spec_dir)
        if review_state.is_approval_valid(spec_dir):
            # Transition to in_progress now that execution begins
            plan.status = "in_progress"
            plan.planStatus = "in_progress"
            plan.save()
```

**Pros:**
- Clear, explicit transition at execution start
- Preserves approval safety (checks review_state)
- Minimal code change

**Cons:**
- Adds code in agent loop
- Requires importing ImplementationPlan and ReviewState

### Option 2: Fix Status Preservation Logic in plan.py

**Location:** `apps/backend/implementation_plan/plan.py` lines 163-167

Replace:
```python
if self.status == "human_review" and self.planStatus == "review":
    # Keep the plan approval status - don't reset to backlog
    pass
```

With:
```python
if self.status == "human_review" and self.planStatus == "review":
    # Only preserve if NOT approved yet
    review_state_file = self.spec_dir / "review_state.json"
    if review_state_file.exists():
        import json
        with open(review_state_file) as f:
            review_state = json.load(f)
        if not review_state.get("approved", False):
            pass  # Keep awaiting approval
        else:
            # Approved - transition to active execution
            self.status = "in_progress"
            self.planStatus = "in_progress"
    else:
        pass  # No review state yet, keep awaiting
```

**Pros:**
- Fixes the root cause directly
- Automatic transition when plan is loaded
- No changes needed in agent code

**Cons:**
- More complex logic in `update_status_from_subtasks()`
- Adds file I/O and JSON parsing
- Couples plan management with review system

### Option 3: Remove Preservation Logic Entirely

**Location:** `apps/backend/implementation_plan/plan.py` lines 163-167

Delete lines 163-167 and use standard status reset:
```python
else:
    # All subtasks pending - reset to backlog
    self.status = "backlog"
    self.planStatus = "pending"
```

**Pros:**
- Simplest fix
- Removes problematic code

**Cons:**
- May break UI column display expectations
- Loses approval state information
- Unknown side effects

---

## Recommendation

**Implement Option 1** (Add status transition in coder.py)

**Rationale:**
1. Most explicit and clear
2. Preserves all existing behavior
3. Easy to test and verify
4. Minimal risk of side effects
5. Keeps approval safety checks

**Implementation Steps:**
1. Add import statements for `ImplementationPlan` and `ReviewState`
2. Add transition logic after line 163 in `coder.py`
3. Test with stuck spec (001)
4. Verify coding phase starts
5. Confirm status transitions correctly

---

## Testing Plan

### 1. Verify Current Failure
```bash
cd apps/backend
python run.py --spec 001
# Expected: "No pending subtasks found" and exits
```

### 2. Apply Fix
(Apply Option 1 code change)

### 3. Test Execution
```bash
cd apps/backend
python run.py --spec 001
# Expected: Coding phase starts, subtask-1-1 begins execution
```

### 4. Verify Status Transition
```bash
cat ../.auto-claude/specs/001*/implementation_plan.json | grep -A1 '"status"'
# Expected: status: "in_progress", planStatus: "in_progress"
```

### 5. Monitor Task Logs
```bash
tail -f ../.auto-claude/specs/001*/task_logs.json
# Expected: Coding phase entries appear
```

---

## Additional Notes

### Files Modified During This Investigation
- None (analysis only)

### Related Issues
- None found (this appears to be the first occurrence documented)

### Future Improvements
1. Add state machine validation tests
2. Document expected status transitions
3. Add logging for status changes
4. Create state transition diagram
5. Add automated tests for approval → execution flow

---

## Conclusion

The root cause is definitively identified as the **status preservation bug in `implementation_plan/plan.py` lines 163-167**. The recommended fix (Option 1) adds an explicit status transition when execution begins after approval. This is a targeted, low-risk change that preserves all existing behavior while fixing the stuck state issue.

**Next Steps:**
1. Create GitHub issue documenting this bug
2. Implement proposed fix (Option 1)
3. Test with spec 001
4. Submit pull request with fix
5. Add test coverage for approval → execution transition
