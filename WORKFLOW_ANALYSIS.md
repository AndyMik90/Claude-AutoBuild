# Workflow State Transition Analysis

## Overview

This document analyzes the current state transition patterns in the auto-claude system and identifies critical gaps in validation failure recovery and change request workflows. The analysis focuses on how the system moves between different workflow states and where failures occur.

## Current Workflow Architecture

### Core Components

1. **Build Commands (`cli/build_commands.py`)**: Entry point and orchestration hub
2. **Autonomous Agent (`agents/coder.py`)**: Main execution loop for planning and coding phases
3. **Follow-up Planner (`agents/planner.py`)**: Handles change requests and new subtask addition
4. **QA Validation Loop (`qa/loop.py`)**: Self-validating quality assurance cycle
5. **Implementation Plan (`implementation_plan/plan.py`)**: State persistence and synchronization

## Current State Transition Patterns

### 1. Normal Build Flow

```
[START] → handle_build_command()
    ↓
run_autonomous_agent() → Planning Phase (first_run=True)
    ↓
Planning Phase → Implementation Plan Created
    ↓
Coding Phase → Process Subtasks Sequentially
    ↓
All Subtasks Complete → QA Validation Loop
    ↓
QA Approved → Build Complete
```

**Implementation Details:**
- `run_autonomous_agent()` uses `first_run` flag to determine planning vs coding phase
- State transitions managed through `StatusManager` and `BuildState` enum
- Subtask progress tracked in `implementation_plan.json`
- Post-session processing via `post_session_processing()` function

### 2. Planning Phase Transitions

**Key Files:** `agents/coder.py` (lines 133-285)

```
Fresh Start → first_run=True → StatusManager.set_active(state=PLANNING)
    ↓
Client created with planning phase config
    ↓
run_agent_session() → Planner Agent Creates Plan
    ↓
is_planning_phase=False → Transition to Coding Phase
    ↓
task_logger.end_phase(PLANNING) → task_logger.start_phase(CODING)
```

**State Management:**
- Uses phase-specific models and thinking budgets via `get_phase_model()`
- Linear integration updates task status to "In Progress"
- Implementation plan synced back to source if using worktree

### 3. Coding Phase Transitions

**Key Files:** `agents/coder.py` (lines 286-443)

```
Get Next Subtask → Generate Subtask Prompt
    ↓
run_agent_session() with coding phase config
    ↓
post_session_processing() → Update Subtask Status
    ↓
Recovery Manager → Track Attempts/Failures
    ↓
Continue Loop or Complete Build
```

**Recovery Pattern:**
- `RecoveryManager` tracks attempt counts per subtask
- After 3 failed attempts, subtask marked as "stuck"
- Linear integration notified of stuck subtasks
- Manual intervention suggested

### 4. QA Validation Loop

**Key Files:** `qa/loop.py` (lines 56-514)

```
QA Reviewer → run_qa_agent_session()
    ↓
Status: approved/rejected/error
    ↓
If rejected → QA Fixer → run_qa_fixer_session()
    ↓
Loop until approved or max iterations (50)
    ↓
Update qa_signoff in implementation_plan.json
```

**Critical Gap Identified:**
- QA fixer only addresses minor issues via code changes
- **No mechanism to re-engage main coder agent** for significant fixes
- When QA fails, workflow terminates instead of recovering

## Identified Workflow Gaps

### Gap 1: Validation Failure Recovery

**Location:** `cli/build_commands.py` lines 241-274

**Current Flow:**
```
run_autonomous_agent() completes → QA validation starts
    ↓
run_qa_validation_loop() → Reviewer + Fixer pattern
    ↓
IF qa_approved = False → Workflow ends with error message
    ↓
User must manually restart build process
```

**Problem:**
- QA loop has reviewer/fixer agents but no automatic coder agent re-engagement
- No transition from validation failure back to coding state
- Manual intervention required to resume development

**Impact:**
- Validation failures leave build in failed state
- No iterative improvement cycle
- Poor user experience requiring manual restarts

### Gap 2: Change Request Workflow

**Location:** `agents/planner.py` lines 134-164

**Current Flow:**
```
run_followup_planner() → Adds new subtasks to completed plan
    ↓
plan.reset_for_followup() → Status set to in_progress
    ↓
StatusManager.update(state=PAUSED) ← Critical Issue
    ↓
User must manually run: python auto-claude/run.py --spec {name}
```

**Problem:**
- Follow-up planner correctly adds subtasks and resets plan
- But sets `BuildState.PAUSED` instead of triggering coding phase
- No automatic transition from planning completion to execution

**Impact:**
- Change requests require manual intervention to process
- Breaks seamless workflow experience
- User must manually trigger coding phase

### Gap 3: State Transition Orchestration

**Missing Component:** Centralized state transition manager

**Current Issues:**
- State transitions scattered across multiple modules
- No unified mechanism for complex state changes
- Limited ability to handle recovery scenarios
- No pattern for "retry with different agent type"

### Gap 4: Feedback Loop Integration

**Location:** `qa/loop.py` and `agents/session.py`

**Current Limitations:**
- QA feedback reaches fixer agent but not main coder agent
- No mechanism to route validation feedback back to development phase
- Recovery hints only used within coding phase, not from QA failures

## Recovery Design Recommendations

### 1. Validation Failure Recovery Manager

**Required Functionality:**
```python
class ValidationRecoveryManager:
    def handle_validation_failure(self, spec_dir, qa_feedback):
        """Transition from QA failure back to coding phase"""

    def should_engage_coder_agent(self, qa_issues):
        """Determine if main coder agent needs to be engaged"""

    def create_recovery_prompt(self, qa_feedback, context):
        """Generate focused prompt for addressing validation issues"""
```

**Integration Points:**
- Hook into `qa/loop.py` after QA rejection
- Transition `BuildState.ERROR` → `BuildState.BUILDING`
- Re-engage `run_autonomous_agent()` with recovery context

### 2. Follow-up Workflow Continuation

**Required Changes:**
```python
# In agents/planner.py - replace PAUSED state
if pending_subtasks:
    plan.reset_for_followup()
    plan.save(plan_file)

    # Instead of PAUSED, trigger continuation
    status_manager.update(state=BuildState.BUILDING)
    return trigger_coder_continuation(spec_dir, project_dir)
```

### 3. State Transition Orchestrator

**New Component:**
```python
class WorkflowOrchestrator:
    def transition_to_recovery(self, from_state, context):
        """Handle complex state transitions for recovery"""

    def transition_from_followup(self):
        """Handle post-followup-planning transitions"""

    def get_next_action(self, current_state, context):
        """Determine next workflow action based on state"""
```

## Implementation Strategy

### Phase 1: Validation Recovery
- Add `ValidationRecoveryManager` class
- Integrate into `qa/loop.py` after rejection
- Implement state transition `QA_REJECTED` → `CODING_RECOVERY`
- Route QA feedback to main coder agent

### Phase 2: Follow-up Continuation
- Modify `agents/planner.py` to trigger automatic continuation
- Remove manual `PAUSED` state for follow-ups
- Implement direct transition to coding phase

### Phase 3: Feedback Integration
- Enhance `agents/session.py` to process validation feedback
- Add recovery context to agent prompts
- Implement retry limits and escalation logic

### Phase 4: Unified Orchestration
- Create `WorkflowOrchestrator` for complex transitions
- Consolidate state transition logic
- Add comprehensive error handling and recovery

## Success Metrics

1. **Validation Recovery Rate**: % of validation failures that auto-recover
2. **Follow-up Automation**: % of change requests that process without manual intervention
3. **State Transition Success**: % of complex transitions that complete successfully
4. **User Experience**: Reduction in manual restarts and interventions

## Risk Assessment

**High Risk Areas:**
- State transition complexity could introduce new bugs
- Infinite loop potential in recovery scenarios
- Backward compatibility with existing workflows

**Mitigation Strategies:**
- Implement comprehensive retry limits
- Add extensive logging and debugging
- Maintain backward compatibility flags
- Gradual rollout with feature flags

## Conclusion

The current workflow system has solid foundations but lacks robust recovery mechanisms and automatic continuation capabilities. The identified gaps are primarily in state transition orchestration rather than core functionality. Implementing the recommended recovery patterns will significantly improve system resilience and user experience.