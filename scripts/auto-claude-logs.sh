#!/bin/bash

# Auto Claude - View logs and manage the app
# Usage: auto-claude-logs [tail|stop|status]

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"
LOG_FILE="$PROJECT_DIR/.auto-claude-startup.log"

command=${1:-tail}

case $command in
  tail)
    echo "📋 Auto Claude Logs (press Ctrl+C to exit)"
    echo "=========================================="
    tail -f "$LOG_FILE"
    ;;
  stop)
    echo "Stopping Auto Claude..."
    pkill -f "npm start" || echo "Process not found"
    pkill -f "electron" || echo "Electron process not found"
    docker-compose -f "$PROJECT_DIR/docker-compose.yml" down
    echo "✓ Auto Claude stopped"
    ;;
  status)
    if pgrep -f "npm start" > /dev/null || pgrep -f "electron" > /dev/null; then
      echo "✓ Auto Claude is running"
    else
      echo "✗ Auto Claude is not running"
    fi
    docker ps --filter "name=auto-claude" --format "table {{.Names}}\t{{.Status}}"
    ;;
  *)
    echo "Usage: auto-claude-logs [command]"
    echo ""
    echo "Commands:"
    echo "  tail    - View live logs (default)"
    echo "  stop    - Stop Auto Claude and containers"
    echo "  status  - Check if Auto Claude is running"
    ;;
esac
