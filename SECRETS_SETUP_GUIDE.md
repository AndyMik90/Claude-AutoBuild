# GitHub Secrets Setup Guide - Auto-Claude

Complete guide for configuring all required secrets for the AI automation pipeline.

---

## 📋 Quick Start (Automated)

### Option 1: Using PowerShell (Windows - Recommended)

```powershell
cd Auto-Claude
.\scripts\setup-secrets.ps1
```

### Option 2: Using Bash (Mac/Linux)

```bash
cd Auto-Claude
chmod +x scripts/setup-secrets.sh
./scripts/setup-secrets.sh
```

---

## 🔐 Required Secrets

### 1. OPENROUTER_API_KEY

**Purpose:** Access to DeepSeek R1 and Chat models via OpenRouter

**How to Get:**
1. Go to https://openrouter.ai/keys
2. Sign up or log in
3. Click "Create Key"
4. Copy the API key (starts with `sk-or-v1-...`)

**Cost:** Pay-per-use (see pricing below)

---

### 2. PAT_TOKEN

**Purpose:** GitHub Personal Access Token for creating branches, PRs, and comments

**How to Get:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Tokens (classic)"
3. Name: `Auto-Claude Automation`
4. Expiration: `No expiration` (or 1 year)
5. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
   - ✅ `write:packages` (Upload packages to GitHub Package Registry)
6. Click "Generate token"
7. **IMPORTANT:** Copy token immediately (you won't see it again!)

**Format:** `ghp_...` (classic) or `github_pat_...` (fine-grained)

---

### 3. PAT_USERNAME

**Purpose:** Your GitHub username for commit attribution

**Value:** Your GitHub username (e.g., `joelfuller2016`)

**No API key needed** - just your username as plain text.

---

## 🔧 Optional Secrets

### 4. COPILOT_PAT (Optional)

**Purpose:** Dedicated token for Copilot REST API assignment

**How to Get:**
- Can reuse the same value as `PAT_TOKEN`
- OR create a separate token with same scopes

**When to Set:**
- If you want separate tokens for different purposes
- For better security/auditing

**Default:** Falls back to `PAT_TOKEN` if not set

---

### 5. LLM_BASE_URL (Optional)

**Purpose:** Custom OpenRouter base URL

**Default Value:** `https://openrouter.ai/api/v1`

**When to Set:**
- Using self-hosted OpenRouter instance
- Using proxy for OpenRouter API

**Most users can skip this.**

---

## 📝 Manual Setup (GitHub Web UI)

If you prefer manual setup:

1. **Go to Repository Settings**
   - Navigate to https://github.com/joelfuller2016/Auto-Claude
   - Click "Settings" tab
   - Click "Secrets and variables" → "Actions"

2. **Add Each Secret**
   - Click "New repository secret"
   - Name: `OPENROUTER_API_KEY`
   - Value: [paste your key]
   - Click "Add secret"
   - Repeat for each secret

3. **Verify All Secrets Added**
   - You should see 3-5 secrets listed
   - ✅ OPENROUTER_API_KEY
   - ✅ PAT_TOKEN
   - ✅ PAT_USERNAME
   - Optional: COPILOT_PAT
   - Optional: LLM_BASE_URL

---

## ✅ Verification

### Using GitHub CLI

```bash
gh secret list --repo joelfuller2016/Auto-Claude
```

**Expected Output:**
```
OPENROUTER_API_KEY  Updated 2026-01-02
PAT_TOKEN           Updated 2026-01-02
PAT_USERNAME        Updated 2026-01-02
COPILOT_PAT         Updated 2026-01-02  (optional)
LLM_BASE_URL        Updated 2026-01-02  (optional)
```

### Using Web UI

1. Go to Settings → Secrets and variables → Actions
2. Verify all secrets are listed with "Updated [date]"

### Test the Pipeline

Create a test issue:
```bash
gh issue create \
  --repo joelfuller2016/Auto-Claude \
  --title "Test: Hello World" \
  --body "Test the automation pipeline" \
  --label "fix-me"
```

Then watch:
- Actions tab: https://github.com/joelfuller2016/Auto-Claude/actions
- Issue should get automated comments
- OpenHands should create a PR

---

## 💰 Cost Breakdown

### OpenRouter Pricing (DeepSeek Models)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Typical Issue Cost |
|-------|----------------------|------------------------|-------------------|
| DeepSeek Chat | $0.14 | $0.28 | $0.001 - $0.005 |
| DeepSeek R1 | $0.30 | $1.20 | $0.003 - $0.015 |

**Monthly Estimate (50 issues):**
- 30 simple (Chat): ~$0.04
- 15 moderate (Chat): ~$0.03
- 5 complex (R1): ~$0.06
- **Total: ~$0.13/month**

**Comparison:**
- Claude Sonnet 4: ~$4.50/month (35x more expensive)
- GPT-4: ~$3.00/month (23x more expensive)

---

## 🔒 Security Best Practices

1. **Never commit secrets to git**
   - Secrets are stored encrypted in GitHub
   - Only visible in Settings → Secrets

2. **Rotate tokens periodically**
   - Update every 6-12 months
   - Immediately if compromised

3. **Use minimal scope**
   - PAT_TOKEN only needs `repo`, `workflow`, `write:packages`
   - Don't grant admin or org permissions

4. **Monitor usage**
   - Check OpenRouter dashboard: https://openrouter.ai/activity
   - Review GitHub Actions usage: Settings → Billing

5. **Enable 2FA**
   - Required for PAT creation: https://github.com/settings/security

---

## 🚨 Troubleshooting

### Error: "Secret not found"
- Verify secret name exactly matches (case-sensitive)
- Check Settings → Secrets - secret should be listed

### Error: "Invalid API key"
- Verify OPENROUTER_API_KEY is correct
- Test at https://openrouter.ai/playground

### Error: "GitHub API rate limit"
- PAT_TOKEN needs `repo` scope
- Check token hasn't expired

### Error: "Permission denied"
- PAT_TOKEN needs `workflow` scope
- Regenerate token with correct scopes

### Workflows not running
- Check Actions tab for error messages
- Verify all required secrets are set
- Check workflow file syntax

---

## 📚 Additional Resources

- **OpenRouter Docs:** https://openrouter.ai/docs
- **GitHub Secrets Docs:** https://docs.github.com/en/actions/security-guides/encrypted-secrets
- **GitHub PAT Docs:** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token
- **DeepSeek Models:** https://www.deepseek.com/

---

## 🆘 Support

If you encounter issues:

1. **Check workflow logs:**
   - Actions tab → Failed workflow → Click job → Expand steps

2. **Verify secrets:**
   ```bash
   gh secret list --repo joelfuller2016/Auto-Claude
   ```

3. **Test OpenRouter API:**
   ```bash
   curl https://openrouter.ai/api/v1/models \
     -H "Authorization: Bearer $OPENROUTER_API_KEY"
   ```

4. **Create GitHub issue:**
   - https://github.com/joelfuller2016/Auto-Claude/issues/new
   - Label: `bug`, `automation`

---

**Last Updated:** 2026-01-02
**Version:** 1.0.0
