#!/bin/bash
# Health check script for Auto-Claude Docker container

set -e

# Check if the web server is responding
curl -f http://localhost:8080/health || exit 1

echo "Health check passed"
