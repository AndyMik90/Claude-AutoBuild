#!/bin/bash
# Auto-Claude GitHub Secrets Setup Script
# This script uses GitHub CLI (gh) to add required secrets to the repository

set -e  # Exit on error

REPO="joelfuller2016/Auto-Claude"

echo "=========================================="
echo "Auto-Claude Secrets Setup"
echo "=========================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Function to add secret
add_secret() {
    local secret_name=$1
    local secret_description=$2
    local is_optional=$3
    
    echo "────────────────────────────────────────"
    echo "Setting: $secret_name"
    echo "Purpose: $secret_description"
    
    if [ "$is_optional" = "true" ]; then
        echo "Status: Optional"
        read -p "Skip this secret? (y/N): " skip
        if [[ $skip =~ ^[Yy]$ ]]; then
            echo "⏭️  Skipped"
            echo ""
            return
        fi
    fi
    
    read -sp "Enter value for $secret_name: " secret_value
    echo ""
    
    if [ -z "$secret_value" ]; then
        echo "⚠️  Empty value, skipping"
        echo ""
        return
    fi
    
    # Add secret using gh CLI
    echo "$secret_value" | gh secret set "$secret_name" --repo "$REPO"
    
    if [ $? -eq 0 ]; then
        echo "✅ $secret_name added successfully"
    else
        echo "❌ Failed to add $secret_name"
    fi
    
    echo ""
}

echo "This script will guide you through adding all required secrets."
echo "Press Ctrl+C at any time to cancel."
echo ""
read -p "Continue? (Y/n): " confirm
if [[ $confirm =~ ^[Nn]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "=========================================="
echo "REQUIRED SECRETS"
echo "=========================================="
echo ""

# Required secrets
add_secret "OPENROUTER_API_KEY" \
    "OpenRouter API key for DeepSeek models (get from https://openrouter.ai/keys)" \
    "false"

add_secret "PAT_TOKEN" \
    "GitHub Personal Access Token with repo + workflow scopes (get from https://github.com/settings/tokens)" \
    "false"

add_secret "PAT_USERNAME" \
    "Your GitHub username (e.g., joelfuller2016)" \
    "false"

echo ""
echo "=========================================="
echo "OPTIONAL SECRETS"
echo "=========================================="
echo ""

# Optional secrets
add_secret "COPILOT_PAT" \
    "GitHub PAT for Copilot API (can reuse PAT_TOKEN value)" \
    "true"

add_secret "LLM_BASE_URL" \
    "OpenRouter base URL (defaults to https://openrouter.ai/api/v1 if not set)" \
    "true"

echo ""
echo "=========================================="
echo "✅ SETUP COMPLETE"
echo "=========================================="
echo ""
echo "To verify secrets are set, run:"
echo "  gh secret list --repo $REPO"
echo ""
echo "To test the automation pipeline:"
echo "  Create a new issue with the 'fix-me' label"
echo "  OR check issue #174: https://github.com/$REPO/issues/174"
echo ""
