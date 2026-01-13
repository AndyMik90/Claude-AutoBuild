#!/bin/bash
set -e

echo "=== Auto-Claude Docker Container Starting ==="

# Configure git for HTTPS authentication with GitHub token
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git with GitHub token..."
    git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
    git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "git@github.com:"
    # Secure git config file since it contains embedded credentials
    chmod 600 "$HOME/.gitconfig"
    echo "Git configured for authenticated HTTPS cloning"
else
    echo "Warning: GITHUB_TOKEN not set - only public repos can be cloned"
fi

# Set git user for commits (required for Auto-Claude operations)
git config --global user.email "autoclaude@docker.local"
git config --global user.name "Auto-Claude Docker"

# Clone repositories from CLONE_REPOS environment variable
if [ -n "$CLONE_REPOS" ]; then
    echo "Cloning repositories from CLONE_REPOS..."
    IFS=',' read -ra REPOS <<< "$CLONE_REPOS"
    for repo in "${REPOS[@]}"; do
        # Trim whitespace
        repo=$(echo "$repo" | xargs)
        if [ -z "$repo" ]; then
            continue
        fi

        # Extract repo name from URL
        repo_name=$(basename "$repo" .git)
        target_dir="${PROJECTS_DIR}/${repo_name}"

        if [ -d "$target_dir" ]; then
            echo "Repository already exists: $repo_name"
            # Pull latest changes
            echo "Pulling latest changes for $repo_name..."
            cd "$target_dir" && git pull --ff-only || echo "Warning: Could not pull $repo_name"
            cd /app
        else
            echo "Cloning: $repo -> $target_dir"
            if git clone "$repo" "$target_dir"; then
                echo "Successfully cloned: $repo_name"
            else
                echo "Error: Failed to clone $repo"
            fi
        fi
    done
    echo "Repository cloning complete"
fi

# Initialize data directory structure
echo "Initializing data directories..."
mkdir -p "${DATA_DIR}/logs"
mkdir -p "${DATA_DIR}/state"

# Initialize projects.json if it doesn't exist
if [ ! -f "${DATA_DIR}/projects.json" ]; then
    echo "[]" > "${DATA_DIR}/projects.json"
    echo "Created empty projects.json"
fi

# Verify Auto-Claude is accessible
if [ ! -f "${AUTO_CLAUDE_PATH}/run.py" ]; then
    echo "ERROR: Auto-Claude not found at ${AUTO_CLAUDE_PATH}"
    echo "Container may not be built correctly"
    exit 1
fi
echo "Auto-Claude found at: ${AUTO_CLAUDE_PATH}"

# Check Claude authentication and initialize CLI config
if [ -z "$CLAUDE_CODE_OAUTH_TOKEN" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Warning: No Claude authentication configured"
    echo "Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to use Auto-Claude"
else
    # Create ~/.claude directory with restricted permissions (owner only)
    mkdir -p "$HOME/.claude"
    chmod 700 "$HOME/.claude"

    # Create ~/.claude.json with hasCompletedOnboarding=true to skip first-run wizard
    # This is required for interactive mode in headless/Docker environments
    # See: https://github.com/anthropics/claude-code/issues/4714
    echo "Creating Claude CLI configuration..."

    # Build the customApiKeyResponses if ANTHROPIC_API_KEY is set
    API_KEY_RESPONSE=""
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        # Get last 20 chars of API key for approval
        LAST_20=$(echo -n "$ANTHROPIC_API_KEY" | tail -c 20)
        API_KEY_RESPONSE="\"customApiKeyResponses\": { \"approved\": [\"$LAST_20\"], \"rejected\": [] },"
    fi

    cat > "$HOME/.claude.json" << EOF
{
  $API_KEY_RESPONSE
  "theme": "dark",
  "hasCompletedOnboarding": true,
  "hasTrustDialogAccepted": true,
  "hasCompletedProjectOnboarding": true,
  "autoUpdaterStatus": "disabled"
}
EOF
    chmod 600 "$HOME/.claude.json"
    echo "Claude CLI configuration created with onboarding complete"

    # Create credentials file for Claude CLI interactive mode (OAuth token auth)
    # This allows interactive Claude sessions to authenticate without browser OAuth
    if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
        echo "Setting up Claude CLI credentials..."
        cat > "$HOME/.claude/.credentials.json" << EOF
{
  "accessToken": "$CLAUDE_CODE_OAUTH_TOKEN",
  "refreshToken": null,
  "expiresAt": null
}
EOF
        chmod 600 "$HOME/.claude/.credentials.json"
        echo "Claude CLI credentials configured"
    fi
fi

# Display startup summary
echo ""
echo "=== Startup Summary ==="
echo "Projects directory: ${PROJECTS_DIR}"
echo "Data directory: ${DATA_DIR}"
echo "Auto-Claude path: ${AUTO_CLAUDE_PATH}"
echo "Web port: ${WEB_PORT:-8080}"
echo "Auth enabled: ${AUTH_ENABLED:-false}"
echo "Graphiti enabled: ${GRAPHITI_ENABLED:-false}"
echo ""

# Run database migrations
if [ -n "$DATABASE_URL" ]; then
    echo "Running database migrations..."
    cd /app
    python -m alembic upgrade head
    echo "Database migrations complete"
fi

# Execute the main command
echo "Starting web server..."
exec "$@"
