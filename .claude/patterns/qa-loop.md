# QA Loop Pattern

Auto-Claude's iterative quality assurance and fix loop for validating builds against acceptance criteria.

## Pattern Overview

```
Build Complete → QA Reviewer → [Accept ✓] → Merge
                             ↓ [Reject ✗]
                         QA Fixer → Re-validate → [Iterate up to max attempts]
```

## QA Reviewer Phase

**Agent**: qa_reviewer
**Tools**: Read, Glob, Grep, Bash, Electron MCP (for frontend E2E)

### Validation Criteria

1. **Acceptance Criteria** (from spec.md)
   - Each criterion validated individually
   - Must explicitly confirm or reject

2. **Tests**
   - Run test suite if available
   - All tests must pass
   - New tests for new functionality (ideal)

3. **Build**
   - Project builds successfully
   - No compilation errors
   - Dependencies resolve

4. **Functionality**
   - Feature works as described
   - Edge cases handled
   - Error states covered

5. **Quality**
   - Code follows project conventions
   - No obvious bugs or security issues
   - Logging/error handling present

### E2E Testing (Frontend)

If Electron app and ELECTRON_MCP_ENABLED=true:
- Start app with `npm run dev`
- Use Electron MCP tools to interact with UI
- Validate UI behavior matches spec
- Take screenshots for verification

### Output

**qa_report.md**:
```markdown
# QA Report - [Timestamp]

## Acceptance Criteria Validation
- [✓] Criterion 1: User can log in with OAuth
- [✓] Criterion 2: Session persists on refresh
- [✗] Criterion 3: Logout clears session properly

## Test Results
- Unit tests: 45/45 passed
- Integration tests: 8/8 passed
- E2E tests: 2/3 passed (1 failure)

## Build Validation
- ✓ Build succeeded
- ✓ No type errors
- ✓ No lint warnings

## Decision: **REJECTED**
- Reason: Logout does not clear session properly
- Failed test: e2e/auth/logout.spec.ts

## Next Steps
See QA_FIX_REQUEST.md for detailed fix guidance.
```

## QA Fixer Phase

**Agent**: qa_fixer
**Max Iterations**: 3 (default)

### Fix Process

1. **Read QA_FIX_REQUEST.md**
   - Understand specific issues
   - Identify affected files

2. **Fix Issues**
   - Make targeted changes
   - Re-run failing tests
   - Verify fix locally

3. **Request Re-validation**
   - Trigger QA reviewer again
   - Increment iteration count

4. **Iterate or Escalate**
   - If accepted: Done
   - If rejected and < max iterations: Fix again
   - If max iterations reached: Manual intervention

### QA_FIX_REQUEST.md Format

```markdown
# QA Fix Request - Iteration 1

## Issues Found
1. **Logout does not clear session**
   - File: src/auth/logout.ts:42
   - Expected: Session cleared from localStorage
   - Actual: Session token remains
   - Test: e2e/auth/logout.spec.ts

## Suggested Fixes
1. Add `localStorage.clear()` in logout function
2. Verify with: `npm run test:e2e -- logout.spec.ts`

## Acceptance Criteria Still Failing
- [✗] Criterion 3: Logout clears session properly
```

## Loop Control

### Success Exit
- All acceptance criteria met
- All tests pass
- Build succeeds
- QA reviewer accepts

### Failure Exit
- Max iterations reached (default: 3)
- Critical errors (build fails completely)
- Manual override requested

### Iteration Tracking

Stored in `.auto-claude/specs/NNN/qa_iterations.json`:
```json
{
  "total_iterations": 2,
  "attempts": [
    {
      "iteration": 1,
      "result": "rejected",
      "issues_count": 3,
      "timestamp": "2026-01-12T10:30:00Z"
    },
    {
      "iteration": 2,
      "result": "accepted",
      "issues_count": 0,
      "timestamp": "2026-01-12T11:15:00Z"
    }
  ]
}
```

## Integration Points

### Graphiti Memory
- Store QA patterns (common issues, fixes)
- Query for similar QA failures
- Learn from past fixes

### Archon Sync
- Store QA reports as documents (type: note)
- Track QA metrics per project
- Build pattern library

### OTEL Tracing
- Emit spans for each QA iteration
- Track: iteration count, duration, issues found
- Alert on excessive iterations

## Best Practices

1. **Clear Acceptance Criteria**: QA quality depends on spec quality
2. **Automated Tests**: More tests → more reliable QA
3. **E2E for Frontend**: Use Electron MCP for UI validation
4. **Iteration Limits**: Don't loop forever, escalate to human
5. **Learn from Failures**: Store common issues in knowledge base

## Metrics

**Target Metrics**:
- QA acceptance rate: > 80% on first try
- Average iterations: < 1.5
- Max iterations hit: < 10% of builds

**Red Flags**:
- QA always accepts (too lenient)
- QA always rejects (spec unclear or too strict)
- High iteration counts (fixer not effective)
