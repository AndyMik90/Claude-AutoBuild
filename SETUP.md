# AI Automation Pipeline - Complete Setup Guide

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Workflow Overview](#workflow-overview)
5. [Secrets Setup](#secrets-setup)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services

| Service | Purpose | Signup Link |
|---------|---------|-------------|
| **CodeRabbit** | AI-powered code reviews & planning | [Install App](https://github.com/apps/coderabbitai) |
| **OpenRouter** | AI model API (DeepSeek R1/Chat) | [Get API Key](https://openrouter.ai/keys) |
| **GitHub Copilot** (Optional) | AI-assisted issue implementation | [Enable in Settings](https://github.com/settings/copilot) |

### API Tokens Required

- **OpenRouter API Key**: For OpenHands AI agent
- **GitHub Personal Access Token (PAT)**: For creating branches/PRs
  - Permissions needed: `repo`, `workflow`, `write:packages`

---

## Installation

### Step 1: Create Repository from Template

1. Click **"Use this template"** button
2. Choose repository name
3. Select public/private
4. Click **"Create repository"**

### Step 2: Install CodeRabbit

1. Go to https://github.com/apps/coderabbitai
2. Click **"Install"**
3. Select your new repository
4. Authorize the app

### Step 3: Configure GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret Name | Value | How to Get |
|-------------|-------|------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | https://openrouter.ai/keys |
| `PAT_TOKEN` | GitHub Personal Access Token | Settings → Developer settings → Personal access tokens |
| `PAT_USERNAME` | Your GitHub username | Your profile |
| `COPILOT_PAT` (optional) | PAT for Copilot API access | Same as PAT_TOKEN (can reuse) |

---

## Configuration

### CodeRabbit Configuration (`.coderabbit.yaml`)

The template includes a pre-configured `.coderabbit.yaml` with:

- ✅ Auto-review enabled
- ✅ Path-based review instructions (TypeScript, React, Tests)
- ✅ Knowledge base learning enabled
- ✅ Code generation for implementation plans
- ✅ Professional, actionable tone

**No changes needed** unless customizing for your tech stack.

### Copilot Memory (Optional)

**Enable Copilot to learn your patterns:**

1. Go to **Settings → Copilot**
2. Toggle **"Copilot memory"** ON
3. Copilot now reads `.github/copilot-instructions.md` automatically

**Benefits:**
- Consistent code suggestions
- Remembers your conventions
- Learns from successful implementations

---

## Workflow Overview

### 🎯 Unified AI Automation Pipeline

```
NEW ISSUE CREATED
       ↓
┌──────────────────────────────────────┐
│ STAGE 1: CodeRabbit Planning        │
│ - Auto-labels issue                  │
│ - Requests @coderabbitai plan       │
│ - Waits for comprehensive plan      │
└──────────────────────────────────────┘
       ↓ Plan detected (>500 chars)
┌──────────────────────────────────────┐
│ STAGE 2: Copilot Implementation     │
│ - Assigns copilot-swe-agent via API │
│ - Requests implementation            │
│ - Copilot creates PR                 │
└──────────────────────────────────────┘
       ↓ PR created
┌──────────────────────────────────────┐
│ STAGE 3: CodeRabbit Review           │
│ - Auto-reviews PR                    │
│ - Checks quality, security, tests    │
│ - Adds auto-merge-ready label        │
└──────────────────────────────────────┘
       ↓ All checks pass
┌──────────────────────────────────────┐
│ STAGE 4: Auto-Merge                  │
│ - Merges to main branch              │
│ - Issue closed automatically          │
└──────────────────────────────────────┘
```

### 🔄 Master Automation Controller

**Runs every 30 minutes as backup:**

- Catches issues missed by event triggers
- Categories:
  - **Unplanned**: No CodeRabbit plan requested
  - **Planned, No Copilot**: Plan ready, Copilot not assigned
  - **Copilot Stale**: Assigned 12+ hours ago, no activity
  - **Needs Escalation**: Assigned 24+ hours, escalate to OpenHands

### 🧠 Issue Complexity Classifier

**Analyzes every new/edited issue:**

- Scores 0-100 based on keywords, length, complexity signals
- **Simple (score <40)** → DeepSeek Chat ($0.14/M)
- **Moderate (score 40-64)** → DeepSeek Chat
- **Complex (score 65+)** → DeepSeek R1 ($0.30/M)
- Labels issue with complexity & model

---

## Secrets Setup

### 1. OpenRouter API Key

```bash
# Get key from https://openrouter.ai/keys
# Add to repository secrets as: OPENROUTER_API_KEY
```

### 2. GitHub Personal Access Token (PAT)

```bash
# Create at: Settings → Developer settings → Personal access tokens → Tokens (classic)
# Required scopes:
#   - repo (full control)
#   - workflow
#   - write:packages

# Add to repository secrets as: PAT_TOKEN
# Add your username as: PAT_USERNAME
```

### 3. Optional: Copilot PAT

```bash
# For Copilot REST API assignment (December 2025 feature)
# Can reuse the same PAT as PAT_TOKEN
# Add to repository secrets as: COPILOT_PAT
```

---

## Testing

### Test 1: Issue → Plan → Copilot

1. **Create a test issue:**
   ```
   Title: Add hello world function
   Body: Create a simple function that returns "Hello, World!"
   ```

2. **Expected workflow:**
   - Issue auto-labeled: `auto-implement`, `needs-plan`, `stage-1-planning`
   - CodeRabbit comments with implementation plan
   - Copilot auto-assigned
   - Labels updated: `copilot-assigned`, `stage-2-implementation`

3. **Check logs:**
   - Actions → Unified AI Automation Pipeline
   - View run details

### Test 2: Manual Triggers

1. **Assign Copilot to all eligible issues:**
   ```
   Actions → Unified AI Automation Pipeline → Run workflow
   → Select: assign-copilot-all
   ```

2. **Trigger OpenHands on all issues:**
   ```
   Actions → Unified AI Automation Pipeline → Run workflow
   → Select: trigger-openhands-all
   ```

### Test 3: Master Controller

```
Actions → Master Automation Controller → Run workflow
→ Force check all: ✓
```

**Expected output:**
- Categorized issues summary
- Fixed any unplanned issues
- Assigned Copilot to planned issues
- Reactivated stale issues
- Escalated 24+ hour issues

---

## Troubleshooting

### Issue: CodeRabbit not responding

**Check:**
- CodeRabbit app installed?
- Issue has `needs-plan` label?
- Comment includes `@coderabbitai`?

**Fix:**
```bash
# Manually trigger by commenting:
@coderabbitai Please create an implementation plan
```

### Issue: Copilot not assigned

**Check:**
- `COPILOT_PAT` secret configured?
- Plan is >500 characters?
- Plan includes markers: "## Implementation", "## Coding Plan"

**Fix:**
```bash
# Manually run workflow:
Actions → Unified AI Automation Pipeline → Run workflow
→ assign-copilot-all
```

### Issue: OpenHands not triggering

**Check:**
- `OPENROUTER_API_KEY` configured?
- `PAT_TOKEN` and `PAT_USERNAME` configured?
- Issue has `fix-me` label?

**Fix:**
```bash
# Manually trigger by commenting:
@openhands-agent Implement this issue with tests
```

### Issue: Workflows not running

**Check:**
- `.github/workflows/*.yml` files present?
- No syntax errors? (Check Actions tab)
- Repository permissions allow workflows?

**Fix:**
```bash
# Re-validate all workflows:
Settings → Actions → General → Allow all actions
```

### Debug: View workflow logs

```
Actions → [Workflow Name] → [Run] → [Job] → [Step]
```

---

## Advanced Configuration

### Change AI Models

Edit `.github/workflows/openhands-resolver.yml`:

```yaml
# Current default (best value):
LLM_MODEL: 'openrouter/deepseek/deepseek-r1'

# Alternatives:
# - openrouter/deepseek/deepseek-chat (simpler, cheaper)
# - anthropic/claude-sonnet-4-20250514 (premium, expensive)
# - openai/gpt-4o (good balance)
```

### Adjust Master Controller Frequency

Edit `.github/workflows/master-automation-controller.yml`:

```yaml
schedule:
  - cron: '*/30 * * * *'  # Every 30 minutes (default)
  # - cron: '0 * * * *'     # Every hour
  # - cron: '0 */4 * * *'   # Every 4 hours
```

### Customize Complexity Scoring

Edit `.github/workflows/classify-issue-complexity.yml`:

```javascript
// Adjust signals and scoring thresholds
const simpleSignals = ['typo', 'fix', 'update']; // Add/remove
const complexSignals = ['implement', 'refactor']; // Add/remove

// Adjust score thresholds:
if (score < 40) complexity = 'simple';   // Change 40
else if (score < 65) complexity = 'moderate'; // Change 65
else complexity = 'complex';
```

---

## Next Steps

1. ✅ Complete setup above
2. 📝 Create test issue to verify pipeline
3. 🎯 Customize `.coderabbit.yaml` for your tech stack
4. 🧠 Enable Copilot Memory for learning
5. 📊 Monitor automation via Actions tab

---

## Support

- **CodeRabbit Issues**: https://github.com/coderabbitai/ai-pr-reviewer/issues
- **OpenHands Issues**: https://github.com/All-Hands-AI/OpenHands/issues
- **Template Issues**: [Create issue in this repo]

---

**Happy Automating! 🤖**
