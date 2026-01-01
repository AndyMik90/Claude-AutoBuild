# GitHub Actions Workflows

## AI-Powered Code Review (NEW! 🤖)

Three new AI workflows have been added to automate code review and issue management:

| Workflow | What it does | Setup Required |
|----------|--------------|----------------|
| `ai-coderabbit-review.yml` | Auto-reviews PRs with fix suggestions | Add `CODERABBIT_TOKEN` secret |
| `ai-openhands-review.yml` | Deep AI review (label-triggered) | Add `LLM_API_KEY` secret |
| `ai-copilot-assign.yml` | Auto-assigns issues to Copilot | Create 'Copilot' user account |

### Quick Setup

#### 1. CodeRabbit (Auto PR Review)
```bash
# Get token from https://coderabbit.ai/
gh secret set CODERABBIT_TOKEN
# Paste your CodeRabbit API token

# Done! All PRs will now get automatic AI reviews
```

#### 2. OpenHands (Deep AI Review)
```bash
# Get API key from https://console.anthropic.com/
gh secret set LLM_API_KEY
# Paste your Anthropic API key

# Usage: Add 'ai-review' label to any PR
gh pr edit <PR-NUMBER> --add-label ai-review
```

#### 3. Copilot (Issue Auto-Assign)
```bash
# Option A: Invite 'Copilot' user as collaborator
# Settings → Collaborators → Add people → Search: Copilot

# Option B: Edit ai-copilot-assign.yml line 35 to use different assignee

# Done! New issues auto-assigned to Copilot
```

### Full Documentation
See [`docs/AI_WORKFLOWS.md`](../../docs/AI_WORKFLOWS.md) for:
- Detailed setup instructions
- Configuration options
- Troubleshooting guide
- Cost estimates
- Best practices

---

## Existing Workflows

### CI/CD
- `ci.yml` - Continuous integration tests
- `lint.yml` - Code linting
- `quality-security.yml` - CodeQL + Bandit security scans

### Release Management
- `release.yml` - Production releases
- `beta-release.yml` - Beta releases
- `prepare-release.yml` - Release preparation
- `validate-version.yml` - Version validation

### PR Automation
- `pr-auto-label.yml` - Auto-label PRs by type/area/size
- `pr-status-check.yml` - PR status validation
- `pr-status-gate.yml` - PR merge gate

### Issue Management
- `issue-auto-label.yml` - Auto-label issues
- `welcome.yml` - Welcome new contributors
- `stale.yml` - Mark stale issues

### Build
- `build-prebuilds.yml` - Prebuild compilation
- `test-on-tag.yml` - Tag testing

### Notifications
- `discord-release.yml` - Discord release notifications

---

## Workflow Naming Conventions

| Prefix | Category | Example |
|--------|----------|---------|
| `ai-*` | AI-powered automation | `ai-coderabbit-review.yml` |
| `pr-*` | Pull request workflows | `pr-auto-label.yml` |
| `test-*` | Testing workflows | `test-on-tag.yml` |
| `build-*` | Build workflows | `build-prebuilds.yml` |
| (none) | Core workflows | `ci.yml`, `release.yml` |

---

**Need help?** See [`docs/AI_WORKFLOWS.md`](../../docs/AI_WORKFLOWS.md) or create an issue.
