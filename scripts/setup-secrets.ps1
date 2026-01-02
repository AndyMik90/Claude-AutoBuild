# Auto-Claude GitHub Secrets Setup Script (PowerShell)
# This script uses GitHub CLI (gh) to add required secrets to the repository

$ErrorActionPreference = "Stop"

$REPO = "joelfuller2016/Auto-Claude"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Auto-Claude Secrets Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if gh CLI is installed
try {
    $null = Get-Command gh -ErrorAction Stop
    Write-Host "✅ GitHub CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ GitHub CLI (gh) is not installed." -ForegroundColor Red
    Write-Host "Install from: https://cli.github.com/" -ForegroundColor Yellow
    exit 1
}

# Check if authenticated
try {
    gh auth status 2>&1 | Out-Null
    Write-Host "✅ GitHub CLI authenticated" -ForegroundColor Green
} catch {
    Write-Host "❌ Not authenticated with GitHub CLI." -ForegroundColor Red
    Write-Host "Run: gh auth login" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Function to add secret
function Add-GitHubSecret {
    param(
        [string]$SecretName,
        [string]$Description,
        [bool]$IsOptional = $false
    )
    
    Write-Host "────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "Setting: $SecretName" -ForegroundColor White
    Write-Host "Purpose: $Description" -ForegroundColor Gray
    
    if ($IsOptional) {
        Write-Host "Status: Optional" -ForegroundColor Yellow
        $skip = Read-Host "Skip this secret? (y/N)"
        if ($skip -eq 'y' -or $skip -eq 'Y') {
            Write-Host "⏭️  Skipped" -ForegroundColor Yellow
            Write-Host ""
            return
        }
    }
    
    $secureValue = Read-Host "Enter value for $SecretName" -AsSecureString
    $plainValue = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    )
    
    if ([string]::IsNullOrWhiteSpace($plainValue)) {
        Write-Host "⚠️  Empty value, skipping" -ForegroundColor Yellow
        Write-Host ""
        return
    }
    
    # Add secret using gh CLI
    try {
        $plainValue | gh secret set $SecretName --repo $REPO
        Write-Host "✅ $SecretName added successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to add $SecretName" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "This script will guide you through adding all required secrets." -ForegroundColor White
Write-Host "Press Ctrl+C at any time to cancel." -ForegroundColor Gray
Write-Host ""
$confirm = Read-Host "Continue? (Y/n)"
if ($confirm -eq 'n' -or $confirm -eq 'N') {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "REQUIRED SECRETS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Required secrets
Add-GitHubSecret -SecretName "OPENROUTER_API_KEY" `
    -Description "OpenRouter API key for DeepSeek models (get from https://openrouter.ai/keys)" `
    -IsOptional $false

Add-GitHubSecret -SecretName "PAT_TOKEN" `
    -Description "GitHub Personal Access Token with repo + workflow scopes (get from https://github.com/settings/tokens)" `
    -IsOptional $false

Add-GitHubSecret -SecretName "PAT_USERNAME" `
    -Description "Your GitHub username (e.g., joelfuller2016)" `
    -IsOptional $false

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "OPTIONAL SECRETS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Optional secrets
Add-GitHubSecret -SecretName "COPILOT_PAT" `
    -Description "GitHub PAT for Copilot API (can reuse PAT_TOKEN value)" `
    -IsOptional $true

Add-GitHubSecret -SecretName "LLM_BASE_URL" `
    -Description "OpenRouter base URL (defaults to https://openrouter.ai/api/v1 if not set)" `
    -IsOptional $true

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ SETUP COMPLETE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To verify secrets are set, run:" -ForegroundColor White
Write-Host "  gh secret list --repo $REPO" -ForegroundColor Gray
Write-Host ""
Write-Host "To test the automation pipeline:" -ForegroundColor White
Write-Host "  Create a new issue with the 'fix-me' label" -ForegroundColor Gray
Write-Host "  OR check issue #174: https://github.com/$REPO/issues/174" -ForegroundColor Gray
Write-Host ""
