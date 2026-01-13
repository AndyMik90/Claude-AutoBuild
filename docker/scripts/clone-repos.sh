#!/bin/bash
# Clone repositories from a comma-separated list
# Usage: ./clone-repos.sh "https://github.com/user/repo1,https://github.com/user/repo2"

set -e

REPOS="${1:-$CLONE_REPOS}"
PROJECTS_DIR="${PROJECTS_DIR:-/projects}"

if [ -z "$REPOS" ]; then
    echo "No repositories to clone"
    exit 0
fi

echo "Cloning repositories to $PROJECTS_DIR..."

IFS=',' read -ra REPO_LIST <<< "$REPOS"
for repo in "${REPO_LIST[@]}"; do
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
        echo "Pulling latest changes..."
        cd "$target_dir"
        git pull --ff-only || echo "Warning: Could not pull $repo_name"
        cd -
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
