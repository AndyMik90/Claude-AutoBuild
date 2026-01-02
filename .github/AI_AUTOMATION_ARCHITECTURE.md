# AI Automation Architecture for Auto-Claude

## Overview

This document describes the complete AI-powered issue and PR automation pipeline for Auto-Claude, combining CodeRabbit (planning), GitHub Copilot (implementation), and OpenHands (escalation/fallback).

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    NEW ISSUE CREATED                          │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
         ┌───────────────────────────────────┐
         │  STAGE 1: CodeRabbit Planning     │
         │  - Auto-assign @coderabbitai      │
         │  - Request implementation plan    │
         │  - Label: needs-plan              │
         │  - Timeout: Until plan complete   │
         └───────────┬───────────────────────┘
                     ▼
         ┌───────────────────────────────────┐
         │  STAGE 2: Copilot Assignment      │
         │  - Detect plan completion         │
         │  - Assign copilot-swe-agent       │
         │  - Label: copilot-assigned        │
         │  - Timeout: 4 hours               │
         └───────────┬───────────────────────┘
                     ▼
         ┌───────────────────────────────────┐
         │  STAGE 3: OpenHands Escalation    │
         │  - Trigger if no PR after timeout │
         │  - Add fix-me label               │
         │  - Call OpenHands resolver        │
         │  - Model: DeepSeek R1             │
         └───────────┬───────────────────────┘
                     ▼
         ┌───────────────────────────────────┐
         │  STAGE 4: PR Lifecycle            │
         │  - Auto-request CodeRabbit review │
         │  - Auto-approve bot PRs           │
         │  - Auto-merge when clean          │
         └───────────────────────────────────┘
```

---

## Key Workflows

### 1. Unified AI Automation Pipeline
**File:** `.github/workflows/unified-ai-automation.yml`

**Purpose:** Orchestrates the complete CodeRabbit → Copilot workflow

**Triggers:**
- `issues.opened` - New issue created
- `issue_comment.created` - CodeRabbit plan posted
- `schedule` - Hourly backup check

**Jobs:**
1. **new-issue-request-plan**
   - Triggers on issue creation
   - Labels: `auto-implement`, `needs-plan`, `stage-1-planning`
   - Comments: @coderabbitai request for implementation plan

2. **detect-plan-assign-copilot**
   - Triggers on CodeRabbit comment
   - Detects plan completion (>500 chars, contains "## Implementation")
   - Assigns `copilot-swe-agent` via REST API
   - Labels: `copilot-assigned`, `stage-2-implementation`

3. **pr-request-reviews**
   - Triggers on PR creation
   - Requests @coderabbitai review
   - Labels: `needs-review`, `auto-merge-ready`

### 2. Master Automation Controller
**File:** `.github/workflows/master-automation-controller.yml`

**Purpose:** Backup catch-all automation that runs every 30 minutes

**Schedule:** `*/30 * * * *` (every 30 minutes)

**Jobs:**
1. **process-issues**
   - Finds unplanned issues → Requests CodeRabbit plan
   - Finds planned issues → Assigns Copilot
   - Finds stale Copilot issues → Escalates to OpenHands

2. **process-prs**
   - Marks draft PRs as ready
   - Requests CodeRabbit reviews
   - Auto-approves bot PRs
   - Attempts auto-merge

### 3. Issue Complexity Classifier
**File:** `.github/workflows/classify-issue-complexity.yml`

**Purpose:** AI-driven complexity classification for model routing

**Triggers:** `issues.opened`, `issues.edited`

**Logic:**
- **Simple signals:** typo, formatting, rename, single file → DeepSeek Chat ($0.14/M)
- **Complex signals:** refactor, security, multi-file, architecture → DeepSeek R1 ($0.30/M)
- **Heuristics:** Body length, code blocks, file mentions

**Output:** Labels like `complexity:simple`, `timeout:90min`

### 4. OpenHands Resolver
**File:** `.github/workflows/openhands-resolver.yml`

**Purpose:** Autonomous coding agent for issue resolution

**Triggers:**
- `issues.labeled` - `fix-me` label added
- `issue_comment.created` - @openhands-agent mentioned

**Implementation:**
- Calls reusable workflow: `All-Hands-AI/OpenHands/.github/workflows/openhands-resolver.yml@main`
- Model: `openrouter/deepseek/deepseek-r1`
- Max iterations: 50
- Creates branch: `openhands-fix-issue-{number}` → PR

---

## Integration Details

### CodeRabbit Integration

**How to Trigger:**
```markdown
@coderabbitai Please create a detailed implementation plan for this issue:

1. **Requirements Analysis**
2. **Implementation Steps**
3. **Files to Modify**
4. **Test Cases**
5. **Acceptance Criteria**
```

**Plan Detection:**
- Comment from user containing "coderabbitai"
- Length > 500 characters
- Contains indicators: "## Implementation", "## Coding Plan", "### Phase"

**Configuration:**
- File: `.coderabbit.yaml` (in repo root)
- Auto-review enabled
- Request changes workflow enabled

### Copilot Integration

**Assignment Method (REST API):**
```bash
gh api repos/{owner}/{repo}/issues/{issue_number}/assignees \
  -X POST \
  -f 'assignees[]=copilot-swe-agent'
```

**Alternative usernames:**
- `copilot-swe-agent` (primary, official)
- `Copilot` (fallback)

**Required Secret:** `COPILOT_PAT` (Personal Access Token with `copilot` scope)

**Trigger Comment:**
```markdown
@copilot Please implement this issue following the plan above.

Requirements:
- Follow implementation plan exactly
- Include unit tests
- Create PR with "Fixes #{issue_number}" in description
```

### OpenHands Integration

**Trigger Methods:**
1. **Label-based:** Add `fix-me` label to issue
2. **Comment-based:** @openhands-agent mention
3. **Automated:** After Copilot timeout (4 hours)

**Required Secrets:**
- `OPENROUTER_API_KEY` - For DeepSeek R1 model access
- `PAT_TOKEN` - For PR creation
- `PAT_USERNAME` - For git configuration

**Model Configuration:**
```yaml
LLM_MODEL: 'openrouter/deepseek/deepseek-r1'
LLM_BASE_URL: 'https://openrouter.ai/api/v1'
```

---

## Cost Optimization Strategy

### Model Selection Matrix

| Task Type | Model | Cost/1M Input | Cost/1M Output | When to Use |
|-----------|-------|---------------|----------------|-------------|
| Simple fixes | DeepSeek Chat | $0.14 | $0.28 | Typos, formatting, single-file changes |
| Complex reasoning | DeepSeek R1 | $0.30 | $1.20 | Refactors, multi-file, architecture |
| Premium quality | Claude Sonnet 4 | $3.00 | $15.00 | Production-critical, security-sensitive |

### Automatic Classification

The `classify-issue-complexity.yml` workflow automatically routes issues to the appropriate model based on:
- **Keyword analysis:** Simple vs complex indicators
- **Body length:** Short = simple, long = complex
- **Code blocks:** More blocks = more complex
- **File mentions:** 3+ files = complex

---

## Label Taxonomy

### Planning Stage
- `auto-implement` - Issue enters automation pipeline
- `needs-plan` - Awaiting CodeRabbit plan
- `stage-1-planning` - Currently in planning phase

### Implementation Stage
- `copilot-assigned` - Assigned to GitHub Copilot
- `stage-2-implementation` - Currently being implemented
- `in-progress` - Work is ongoing

### Escalation Stage
- `fix-me` - Triggers OpenHands resolver
- `escalated-to-openhands` - Timeout occurred, OpenHands taking over
- `stage-3-escalation` - In escalation phase

### PR Lifecycle
- `needs-review` - Awaiting CodeRabbit review
- `auto-approved` - Automatically approved (bot PRs)
- `auto-merge-ready` - Ready for auto-merge
- `needs-issue-link` - PR missing "Fixes #N" link

### Complexity
- `complexity:simple` - Simple task
- `complexity:medium` - Moderate complexity
- `complexity:complex` - High complexity
- `timeout:Xmin` - Timeout threshold for this issue

---

## Workflow State Transitions

```
State Flow for a Typical Issue:

[Created]
    ↓ (unified-ai-automation: new-issue-request-plan)
[needs-plan, stage-1-planning]
    ↓ (CodeRabbit posts plan)
[plan detected] ← (unified-ai-automation: detect-plan-assign-copilot)
    ↓
[copilot-assigned, stage-2-implementation, in-progress]
    ↓ (Copilot creates PR OR timeout)
    ├─→ [PR created] → [needs-review] → [auto-approved] → [merged] → [CLOSED]
    └─→ [Timeout] → (master-controller: escalate-stale)
            ↓
        [fix-me, escalated-to-openhands, stage-3-escalation]
            ↓ (OpenHands creates PR)
        [PR created] → [needs-review] → [auto-approved] → [merged] → [CLOSED]
```

---

## Manual Override Options

### Force Copilot Assignment (All Issues)
```bash
# Trigger via workflow_dispatch
gh workflow run master-automation-controller.yml -f action=assign-copilot-all
```

### Force OpenHands Escalation (All Issues)
```bash
# Trigger via workflow_dispatch
gh workflow run master-automation-controller.yml -f action=escalate-to-openhands
```

### Process Specific Issue
```bash
# Add labels manually
gh issue edit <number> --add-label "auto-implement,needs-plan"

# Or for immediate OpenHands
gh issue edit <number> --add-label "fix-me"
```

---

## Monitoring & Debugging

### Check Issue Status
```bash
# View labels
gh issue view <number> --json labels

# View comments (check for bot responses)
gh issue view <number> --comments
```

### Check Workflow Runs
```bash
# List recent workflow runs
gh run list --workflow=unified-ai-automation.yml --limit 10

# View specific run logs
gh run view <run-id> --log
```

### Common Issues

**Problem:** CodeRabbit not responding
- **Solution:** Check `.coderabbit.yaml` configuration
- **Solution:** Verify CodeRabbit app installed on repo

**Problem:** Copilot not getting assigned
- **Solution:** Verify `COPILOT_PAT` secret is set
- **Solution:** Check PAT has `copilot` scope
- **Solution:** Try `gh auth status` to verify CLI authentication

**Problem:** OpenHands not triggering
- **Solution:** Verify `OPENROUTER_API_KEY` secret is set
- **Solution:** Check `PAT_TOKEN` and `PAT_USERNAME` secrets
- **Solution:** Verify `fix-me` label was added

---

## Performance Metrics

### Expected Timelines
- **CodeRabbit Plan:** 2-5 minutes
- **Copilot Implementation:** 10-120 minutes (varies by complexity)
- **OpenHands Implementation:** 15-60 minutes (max 50 iterations)
- **Total Pipeline:** 15 minutes - 4 hours (typical: 30-90 minutes)

### Success Rates (Typical)
- **CodeRabbit Plan Success:** ~95%
- **Copilot PR Creation:** ~60-70%
- **OpenHands PR Creation:** ~80-90%
- **Overall Issue Resolution:** ~85%

---

## Security Considerations

### Secret Management
- Store in GitHub repository secrets (Settings > Secrets)
- Never commit secrets to code
- Rotate regularly (quarterly recommended)
- Use fine-grained PATs (not classic tokens)

### Permissions
All workflows require:
```yaml
permissions:
  contents: write        # For committing fixes
  pull-requests: write   # For PR comments and creation
  issues: write          # For labels and comments
```

### Bot PR Approval
Bot PRs are auto-approved ONLY if:
- Author is `copilot-swe-agent`, `Copilot`, or `openhands-agent`
- No security-sensitive files modified
- All CI checks pass

---

## Future Enhancements

1. **Multi-Model Routing:** Use different models based on task type
2. **Learning System:** Track success rates, adjust timeouts
3. **Cost Tracking:** Monitor API costs per issue
4. **Quality Metrics:** Automated code quality scoring
5. **Human Review:** Optional human approval before auto-merge

---

**Last Updated:** 2026-01-01  
**Architecture Version:** 1.0  
**Maintained by:** Auto-Claude Team
