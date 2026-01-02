#!/bin/bash
# serve-docs.sh - Start documentation server and open browser (macOS/Linux)
# Usage: ./scripts/serve-docs.sh

set -e

echo "Starting Auto-Claude documentation server..."

# Check if we're in the right directory
if [ ! -f "docs/index.html" ]; then
    echo "Error: docs/index.html not found."
    echo "Please run this script from the project root directory."
    exit 1
fi

# Detect OS and set browser command
open_browser() {
    local url="$1"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "$url"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v xdg-open &> /dev/null; then
            xdg-open "$url"
        elif command -v gnome-open &> /dev/null; then
            gnome-open "$url"
        elif command -v kde-open &> /dev/null; then
            kde-open "$url"
        else
            echo "Could not detect browser. Please open $url manually."
        fi
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        # Windows (Git Bash, Cygwin)
        start "$url"
    else
        echo "Unknown OS. Please open $url manually."
    fi
}

# Open browser after delay (in background)
(sleep 2 && open_browser "http://localhost:3000") &

# Start the server
echo ""
echo "Documentation will open in your browser at http://localhost:3000"
echo "Press Ctrl+C to stop the server."
echo ""
npx serve docs -p 3000
