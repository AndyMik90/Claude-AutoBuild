# AI-Powered Code Review Workflows

This document describes the AI-powered GitHub Actions workflows integrated into Auto-Claude for automated code review, issue resolution, and quality assurance.

## Overview

Auto-Claude now includes three AI-powered workflows that work alongside the existing CI/CD pipeline:

| Workflow | Purpose | Trigger | Status |
|----------|---------|---------|--------|
| **CodeRabbit AI Review** | Automated PR code review with fix suggestions | PR opened/updated | ✅ Active |
| **OpenHands AI Review** | Deep AI agent review with commit capabilities | Label or reviewer request | ✅ Active |
| **Copilot Auto-Assign** | Auto-assign issues to GitHub Copilot | Issue opened | ✅ Active |

## 1. CodeRabbit AI Review

**File:** `.github/workflows/ai-coderabbit-review.yml`

### What It Does

- Automatically reviews all pull requests using CodeRabbit AI
- Provides inline comments with code quality suggestions
- Identifies bugs, security issues, and best practice violations
- Suggests auto-fix code snippets
- Complements existing `pr-auto-label.yml` and `quality-security.yml` workflows

### How It Works

```yaml
Trigger: pull_request (opened, synchronize, reopened)
Permissions: read contents, write pull-requests, write issues
Timeout: 15 minutes
```

When a PR is opened or updated, CodeRabbit AI:
1. Analyzes all changed files
2. Reviews code for quality, bugs, and security issues
3. Posts inline comments with actionable suggestions
4. Provides auto-fix code snippets when applicable

### Configuration

**Required Secret:**
```bash
# Go to repository Settings → Secrets and variables → Actions
# Add new repository secret:
Name: CODERABBIT_TOKEN
Value: <your-coderabbit-api-token>
```

**Get your CodeRabbit token:**
1. Visit https://coderabbit.ai/
2. Sign up or log in with your GitHub account
3. Go to Settings → API Tokens
4. Generate a new token for this repository
5. Copy the token and add it to GitHub Secrets

**Workflow settings:**
- `auto_review: true` - Automatically post review comments
- `review_level: detailed` - Comprehensive code analysis
- `review_scope: changed_files` - Focus on PR changes only

### Integration with Existing Workflows

- **Runs in parallel** with `pr-auto-label.yml` (no conflict)
- **Complements** `quality-security.yml` (CodeQL + Bandit focus on security, CodeRabbit focuses on code quality)
- **Concurrency control** prevents multiple reviews for the same PR

### Example Output

CodeRabbit will post comments like:
```
🤖 CodeRabbit AI Review

**Potential Bug (Medium Severity)**
File: apps/backend/agents/coder.py:145

The error handling here doesn't catch TimeoutError.

Suggested fix:
```python
try:
    result = await client.create_session(...)
except (ValueError, TimeoutError) as e:
    logger.error(f"Session creation failed: {e}")
```
```

---

## 2. OpenHands AI Review

**File:** `.github/workflows/ai-openhands-review.yml`

### What It Does

- Deep AI agent-based PR review using Claude Sonnet 4.5
- Can create commits with fixes (when appropriate)
- Understands complex code patterns and architectural decisions
- Provides comprehensive feedback on implementation quality

### How It Works

```yaml
Trigger: pull_request_target (labeled with 'ai-review' OR reviewer 'openhands-agent' requested)
Permissions: read contents, write pull-requests, write issues
Timeout: 30 minutes
Uses: Claude Sonnet 4.5 via litellm proxy
```

**Two ways to trigger:**

#### Option 1: Label-based trigger
```bash
# Add the 'ai-review' label to any PR
gh pr edit <PR-NUMBER> --add-label ai-review
```

#### Option 2: Request reviewer
```bash
# Request 'openhands-agent' as a reviewer
gh pr edit <PR-NUMBER> --add-reviewer openhands-agent
```

### Configuration

**Required Secrets:**
```bash
# Go to repository Settings → Secrets and variables → Actions
# Add these repository secrets:

1. LLM_API_KEY=<your-anthropic-api-key>
   - Get from: https://console.anthropic.com/settings/keys
   - Used for Claude Sonnet API access

2. GITHUB_TOKEN
   - Automatically provided by GitHub Actions
   - No manual setup needed
```

**Get your Anthropic API key:**
1. Visit https://console.anthropic.com/
2. Sign up or log in
3. Go to Settings → API Keys
4. Create a new key
5. Copy the key and add it to GitHub Secrets as `LLM_API_KEY`

**Environment Variables:**
- `LLM_MODEL: litellm_proxy/claude-sonnet-4-5-20250929` - Claude model
- `LLM_BASE_URL: https://llm-proxy.app.all-hands.dev` - Proxy endpoint
- Python 3.12+ required

### Integration with Existing Workflows

- **Uses `pull_request_target`** for security with fork PRs
- **Manual trigger** (label or reviewer) prevents unnecessary runs
- **Complements** CodeRabbit (OpenHands does deeper analysis)
- **Can create commits** to fix issues (CodeRabbit only suggests)

### Example Usage

```bash
# Scenario: Complex refactoring PR needs deep review

# 1. Create PR as usual
gh pr create --base develop --title "refactor: redesign agent architecture"

# 2. Request OpenHands review
gh pr edit 123 --add-label ai-review

# 3. Wait for review (check Actions tab)
# OpenHands will:
# - Analyze entire PR context
# - Review architecture decisions
# - Suggest improvements
# - Optionally create commits with fixes
```

### Example Output

OpenHands will post a comprehensive review comment:
```
🤖 OpenHands AI Review Complete

**Architecture Analysis:**
The refactoring properly separates concerns between the agent orchestration
layer and the individual agent implementations. Good use of dependency injection.

**Code Quality:**
✅ Proper error handling
✅ Type hints throughout
⚠️ Consider adding docstrings to new public methods

**Suggestions:**
1. Extract the retry logic in `coder.py:245` into a reusable decorator
2. Add integration tests for the new agent lifecycle

**Performance:**
The async/await pattern is correctly implemented. No blocking calls detected.

Overall: **APPROVE** with minor suggestions.
```

---

## 3. GitHub Copilot Auto-Assign

**File:** `.github/workflows/ai-copilot-assign.yml`

### What It Does

- Automatically assigns new issues to GitHub Copilot
- Enables automated issue analysis and resolution
- Adds explanatory comment to issues

### How It Works

```yaml
Trigger: issues (opened)
Permissions: write issues
Timeout: 5 minutes
```

When a new issue is created:
1. Automatically assigns it to user 'Copilot'
2. Adds a comment explaining the auto-assignment
3. Copilot can analyze and provide solutions

### Configuration

**Required:**
- A GitHub user account named **"Copilot"** must exist in your repository's collaborators
- **OR** update the workflow to use a different assignee

**Setup Steps:**

1. **Option A: Create 'Copilot' account**
   ```bash
   # Invite 'Copilot' as a collaborator
   # Go to: Settings → Collaborators → Add people
   # Search for: Copilot
   ```

2. **Option B: Use different assignee**
   ```yaml
   # Edit .github/workflows/ai-copilot-assign.yml
   # Change line 35:
   assignees: ['your-bot-account-name']
   ```

**No secrets required** - uses default `GITHUB_TOKEN`

### Integration with Existing Workflows

- **Independent** from PR workflows
- **Complements** `issue-auto-label.yml` (labels are added first, then Copilot is assigned)
- **Non-blocking** - if assignment fails, workflow logs warning but doesn't fail

### Example Output

When an issue is created:
```
Issue #42: "Bug: Settings page crashes on large datasets"

Assignees: @Copilot (auto-assigned)

Comment by github-actions[bot]:
🤖 This issue has been automatically assigned to **GitHub Copilot** for
automated analysis and potential resolution.

Copilot will review the issue and may provide suggested fixes or
implementation guidance.
```

---

## Workflow Comparison

| Feature | CodeRabbit | OpenHands | Copilot Assign |
|---------|------------|-----------|----------------|
| **Target** | Pull Requests | Pull Requests | Issues |
| **Trigger** | Automatic (PR events) | Manual (label/reviewer) | Automatic (issue creation) |
| **Speed** | Fast (~5 min) | Slower (~15-30 min) | Instant (<1 min) |
| **Depth** | Inline suggestions | Deep analysis | N/A |
| **Can modify code** | No (suggestions only) | Yes (can commit) | N/A |
| **Best for** | Quick PR feedback | Complex refactorings | Issue triage |
| **Cost** | CodeRabbit subscription | Anthropic API usage | Free (GitHub Actions) |

---

## Security Considerations

### CodeRabbit
- ✅ Uses `pull_request` trigger (safe for public repos)
- ✅ Concurrency control prevents race conditions
- ⚠️ Requires third-party token (CodeRabbit API)

### OpenHands
- ✅ Uses `pull_request_target` for fork PR security
- ✅ Manual trigger prevents unauthorized runs
- ⚠️ Requires Anthropic API key (store as secret)
- ⚠️ Can create commits (use label-based trigger for control)

### Copilot Assign
- ✅ Minimal permissions (issues: write only)
- ✅ Non-blocking (warns on failure)
- ✅ No external secrets required

---

## Cost Estimates

| Workflow | Cost Model | Estimated Cost |
|----------|------------|----------------|
| **CodeRabbit** | Subscription | $15-50/month per repo |
| **OpenHands** | API usage | ~$0.015 per 1K tokens (Claude Sonnet 4.5) |
| **Copilot Assign** | Free | $0 (uses GitHub Actions) |

**OpenHands cost example:**
- Average PR review: 20K input + 5K output tokens
- Cost per review: ~$0.30-$0.50
- 100 reviews/month: ~$30-$50/month

---

## Troubleshooting

### CodeRabbit not posting reviews

**Check:**
1. Is `CODERABBIT_TOKEN` secret set correctly?
   ```bash
   gh secret list | grep CODERABBIT_TOKEN
   ```
2. Is the PR from a fork? (CodeRabbit requires proper permissions)
3. Check workflow logs: `Actions` tab → `AI CodeRabbit Review`

**Fix:**
```bash
# Re-add secret
gh secret set CODERABBIT_TOKEN < coderabbit_token.txt
```

### OpenHands workflow not triggering

**Check:**
1. Is the PR labeled with `ai-review` OR reviewer `openhands-agent` requested?
   ```bash
   gh pr view <PR-NUMBER> --json labels,reviewRequests
   ```
2. Is `LLM_API_KEY` secret set?
   ```bash
   gh secret list | grep LLM_API_KEY
   ```

**Fix:**
```bash
# Add label to PR
gh pr edit <PR-NUMBER> --add-label ai-review

# Or request reviewer
gh pr edit <PR-NUMBER> --add-reviewer openhands-agent
```

### Copilot assignment fails

**Check:**
1. Does user 'Copilot' exist and have access to the repository?
2. Check workflow logs for error details

**Fix:**
```bash
# Option 1: Invite Copilot user as collaborator
# Go to: Settings → Collaborators → Add people

# Option 2: Change assignee in workflow
# Edit .github/workflows/ai-copilot-assign.yml line 35
```

---

## Disabling Workflows

To disable any workflow temporarily:

```bash
# Option 1: Delete the workflow file
rm .github/workflows/ai-coderabbit-review.yml

# Option 2: Disable in GitHub UI
# Go to: Actions → Select workflow → ⋮ menu → Disable workflow

# Option 3: Add condition to workflow
# Edit workflow and add to job:
if: false  # This disables the job
```

---

## Best Practices

### When to use CodeRabbit
- ✅ Every PR (automatic reviews)
- ✅ Quick feedback needed
- ✅ Team wants inline suggestions

### When to use OpenHands
- ✅ Complex architectural changes
- ✅ Need deep context understanding
- ✅ Want AI to create fix commits
- ⚠️ Large PRs (will take longer)

### When to use Copilot Assign
- ✅ Want automated issue triage
- ✅ Have Copilot account available
- ✅ Want AI-assisted issue resolution

### Recommended workflow
```
1. PR created → CodeRabbit reviews automatically
2. If complex → Add 'ai-review' label → OpenHands does deep analysis
3. Issue created → Copilot auto-assigned → Copilot provides guidance
```

---

## Future Enhancements

Potential improvements:
- [ ] Add GPT-4 Turbo as alternative to Claude for OpenHands
- [ ] Integrate OpenHands fixes with PR auto-merge
- [ ] Add cost tracking dashboard for API usage
- [ ] Create workflow for auto-applying CodeRabbit suggestions
- [ ] Add Copilot PR review workflow (similar to OpenHands)

---

## Support

**Questions or Issues?**
- CodeRabbit: https://coderabbit.ai/docs
- OpenHands: https://github.com/OpenHands/OpenHands
- GitHub Copilot: https://docs.github.com/copilot

**Repository-specific issues:**
- Create an issue: `gh issue create --title "AI Workflows: <your question>"`

---

**Last Updated:** 2026-01-01
**Workflows Version:** 1.0
**Maintained by:** Auto-Claude Contributors
