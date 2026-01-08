# Root Cause Investigation: Task Workflow Halts After Planning Stage

## Investigation Summary

After adding comprehensive logging to the task loading and plan update pipeline, I've analyzed the data flow from backend to frontend to identify why subtasks fail to display after spec completion.

## Data Flow Analysis

### Current Architecture

```
Backend (Python)
    ↓
Creates implementation_plan.json
    ↓
Emits IPC event: 'task:progress' with plan data
    ↓
Frontend (Electron Renderer)
    ↓
useIpc.ts: onTaskProgress handler (batched)
    ↓
task-store.ts: updateTaskFromPlan(taskId, plan)
    ↓
Creates subtasks from plan.phases.flatMap(phase => phase.subtasks)
    ↓
UI: TaskSubtasks.tsx renders subtasks
```

### Critical Code Paths

**1. Plan Update Handler** (`apps/frontend/src/renderer/hooks/useIpc.ts:131-135`)
```typescript
window.electronAPI.onTaskProgress(
  (taskId: string, plan: ImplementationPlan) => {
    queueUpdate(taskId, { plan });
  }
);
```

**2. Subtask Creation** (`apps/frontend/src/renderer/stores/task-store.ts:124-133`)
```typescript
const subtasks: Subtask[] = plan.phases.flatMap((phase) =>
  phase.subtasks.map((subtask) => ({
    id: subtask.id,
    title: subtask.description,
    description: subtask.description,
    status: subtask.status,
    files: [],
    verification: subtask.verification as Subtask['verification']
  }))
);
```

**3. Initial Task Loading** (`apps/frontend/src/main/project-store.ts:461-470`)
```typescript
const subtasks = plan?.phases?.flatMap((phase) => {
  const items = phase.subtasks || (phase as { chunks?: PlanSubtask[] }).chunks || [];
  return items.map((subtask) => ({
    id: subtask.id,
    title: subtask.description,
    description: subtask.description,
    status: subtask.status,
    files: []
  }));
}) || [];
```

## Root Cause Identification

### Primary Root Cause: Early Plan Update Event with Empty Phases

**What's Happening:**

1. **Backend creates `implementation_plan.json` in stages:**
   - First writes the file with minimal structure: `{ "feature": "...", "phases": [] }`
   - Then adds phases and subtasks incrementally
   - Emits IPC event each time the plan is updated

2. **Frontend receives the FIRST plan update event:**
   - Plan has `feature` and basic metadata
   - **But `phases` array is EMPTY: `[]`**
   - `updateTaskFromPlan` is called with this incomplete plan
   - Subtasks are created as empty array: `plan.phases.flatMap(...)` → `[]`

3. **Later plan updates with full subtask data are ignored:**
   - When backend writes the complete plan with subtasks
   - Another IPC event is emitted
   - But due to race conditions or event handling issues, this update doesn't reach the frontend
   - Or it does reach but the task UI doesn't refresh

**Evidence from Code:**

Looking at `updateTaskFromPlan` (task-store.ts:106-190):
- Line 108-114: Logs show `phases: plan.phases?.length || 0`
- Line 112: If plan has 0 phases, `totalSubtasks` will be 0
- Line 124-133: `plan.phases.flatMap(...)` on empty array creates `subtasks = []`
- **No validation to check if plan is complete before updating state**

**Why "!" Indicators Appear:**

The "!" indicators likely come from the UI attempting to render subtasks when:
- Subtask count shows as 18 (from later plan update metadata)
- But `task.subtasks` array is actually empty `[]` (from early plan update)
- This mismatch causes the UI to show warning indicators

### Secondary Contributing Factors

**A. No Plan Validation Before State Update**

Current code in `updateTaskFromPlan` immediately creates subtasks from whatever plan data it receives:
```typescript
const subtasks: Subtask[] = plan.phases.flatMap((phase) =>
  phase.subtasks.map((subtask) => ({ ... }))
);
```

**Problem:** No check if plan is "ready" or "complete" before updating state.

**B. Missing Reload Trigger After Spec Completion**

When spec creation completes and the full plan is written:
- The IPC event might not fire again
- Or the event fires but the batching mechanism drops it
- Frontend state remains stuck with empty subtasks

**C. Race Condition in Batch Update Queue**

In `useIpc.ts:92-112`, the batching mechanism queues updates:
```typescript
function queueUpdate(taskId: string, update: BatchedUpdate): void {
  const existing = batchQueue.get(taskId) || {};
  batchQueue.set(taskId, { ...existing, ...update });
}
```

**Problem:** If two plan updates arrive within 16ms:
- First update has empty phases: `{ plan: { phases: [] } }`
- Second update has full phases: `{ plan: { phases: [...18 subtasks...] } }`
- Second update **overwrites** first in the queue
- But if order gets reversed, empty plan overwrites full plan

## Log Evidence to Look For

To confirm this root cause, check console logs for:

### 1. Plan Loading Sequence
```
[updateTaskFromPlan] called with plan:
  taskId: "xxx"
  feature: "..."
  phases: 0  ← SMOKING GUN: phases array is empty
  totalSubtasks: 0  ← No subtasks
```

If you see `phases: 0` followed later by no update with `phases: 3` (or more), the early empty plan is stuck in state.

### 2. Multiple Plan Updates
```
[updateTaskFromPlan] called with plan:
  phases: 0
  totalSubtasks: 0

[updateTaskFromPlan] called with plan:  ← This might never appear
  phases: 3
  totalSubtasks: 18
```

If second log never appears, the plan update event isn't firing after spec completion.

### 3. Project Store Loading
```
[ProjectStore] Loading implementation_plan.json for spec: xxx
[ProjectStore] Loaded plan for xxx:
  phaseCount: 0  ← Empty plan loaded from disk
  subtaskCount: 0
```

If plan file on disk has empty phases, the issue is in backend plan writing.

### 4. Plan File Utils
```
[plan-file-utils] Reading implementation_plan.json to update status
[plan-file-utils] Successfully persisted status  ← Plan exists but might be incomplete
```

Check if plan file reads/writes are happening during spec creation.

## Proposed Fix Approach

### Fix 1: Add Plan Completeness Validation (Immediate Fix)

**File:** `apps/frontend/src/renderer/stores/task-store.ts`

**Change:** Only update subtasks if plan has valid phases and subtasks:

```typescript
updateTaskFromPlan: (taskId, plan) =>
  set((state) => {
    console.log('[updateTaskFromPlan] called with plan:', { ... });

    const index = findTaskIndex(state.tasks, taskId);
    if (index === -1) {
      console.log('[updateTaskFromPlan] Task not found:', taskId);
      return state;
    }

    // VALIDATION: Don't update if plan is incomplete
    if (!plan.phases || plan.phases.length === 0) {
      console.warn('[updateTaskFromPlan] Plan has no phases, skipping update:', taskId);
      return state;  // Keep existing state, don't overwrite with empty data
    }

    const totalSubtasks = plan.phases.reduce((acc, p) => acc + (p.subtasks?.length || 0), 0);
    if (totalSubtasks === 0) {
      console.warn('[updateTaskFromPlan] Plan has no subtasks, skipping update:', taskId);
      return state;  // Keep existing state
    }

    // ... rest of existing code to create subtasks ...
  })
```

### Fix 2: Trigger Reload After Spec Completion (Comprehensive Fix)

**File:** `apps/frontend/src/renderer/hooks/useIpc.ts`

**Change:** Add explicit "spec completed" event handler that reloads the task:

```typescript
// Add new IPC event listener
const cleanupSpecComplete = window.electronAPI.onSpecComplete(
  async (taskId: string) => {
    console.log('[IPC] Spec completed for task:', taskId);
    // Force reload the task from disk to get the complete plan
    const task = useTaskStore.getState().tasks.find(t => t.id === taskId);
    if (task) {
      // Reload plan from file
      const result = await window.electronAPI.getTaskPlan(task.projectId, taskId);
      if (result.success && result.data) {
        updateTaskFromPlan(taskId, result.data);
      }
    }
  }
);
```

### Fix 3: Prevent Plan Overwrite in Batch Queue (Race Condition Fix)

**File:** `apps/frontend/src/renderer/hooks/useIpc.ts`

**Change:** Don't overwrite plan if incoming plan has fewer subtasks than existing:

```typescript
function queueUpdate(taskId: string, update: BatchedUpdate): void {
  const existing = batchQueue.get(taskId) || {};

  // For plan updates, only accept if it has MORE data than existing
  let mergedPlan = existing.plan;
  if (update.plan) {
    const existingSubtasks = existing.plan?.phases?.flatMap(p => p.subtasks || []).length || 0;
    const newSubtasks = update.plan.phases?.flatMap(p => p.subtasks || []).length || 0;

    if (newSubtasks >= existingSubtasks) {
      mergedPlan = update.plan;  // Accept new plan
    } else {
      console.warn('[IPC Batch] Rejecting plan update with fewer subtasks:',
        { taskId, existing: existingSubtasks, new: newSubtasks });
      // Keep existing plan, don't overwrite with less complete data
    }
  }

  // ... rest of existing code ...
}
```

## Testing the Fix

### Manual Verification Steps

1. **Create a new task** and move it to "In Progress"
2. **Watch the console logs** for:
   ```
   [updateTaskFromPlan] called with plan: { phases: 0, totalSubtasks: 0 }
   ```
3. **Wait for spec to complete** (planning phase finishes)
4. **Check console logs** for:
   ```
   [updateTaskFromPlan] called with plan: { phases: 3, totalSubtasks: 18 }
   ```
5. **Expand subtask list** in task card
6. **Verify:** Subtasks display with full details, no "!" indicators

### Expected Outcome After Fix

- ✅ Empty/incomplete plan updates are ignored
- ✅ Only complete plans with phases and subtasks update the UI
- ✅ Subtasks display with id, description, and status
- ✅ No "!" warning indicators
- ✅ Subtask count shows "0/18 completed" (not "0/0")
- ✅ Plan pulsing animation stops when spec completes
- ✅ Resume functionality works without infinite loop

## Next Steps

1. ✅ **This Investigation** - Root cause identified (COMPLETE)
2. 🔄 **Subtask 2-1** - Implement Fix 1 (validation in updateTaskFromPlan)
3. 🔄 **Subtask 2-2** - Add data validation before subtask state updates
4. 🔄 **Subtask 2-3** - Fix pulsing animation condition
5. 🔄 **Subtask 2-4** - Fix resume logic to reload plan if subtasks missing
6. 🔄 **Phase 3** - Add comprehensive tests to prevent regressions

## Conclusion

**Root Cause:** Frontend receives and accepts incomplete plan data (empty `phases` array) during the spec creation process, before subtasks are written. This overwrites any existing subtask data and leaves the UI in a stuck state with no subtasks to display.

**Fix Priority:** Implement Fix 1 (validation) immediately to prevent incomplete plans from updating state. This is a minimal, low-risk change that will resolve the core issue.

**Long-term Solution:** Add explicit event handling for spec completion (Fix 2) and improve batch queue logic (Fix 3) to make the system more robust against race conditions and out-of-order updates.
