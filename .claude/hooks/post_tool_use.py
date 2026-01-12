#!/usr/bin/env python3
"""
PostToolUse Hook - Extract insights and log tool usage

This hook runs after each tool execution to:
- Extract insights for Graphiti memory
- Log tool usage for analytics
- Detect patterns and errors

Exit codes:
  0 - Always (this is informational only)
"""

import json
import sys
from pathlib import Path

# Add utils to path
sys.path.insert(0, str(Path(__file__).parent))
from utils.logging import log_hook_execution, log_hook_result

def main():
    """Main hook entry point."""
    # Read stdin for tool result
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        # Silently fail on parse errors
        sys.exit(0)
    except Exception as e:
        # Silently fail on any other errors
        sys.exit(0)

    # Log execution
    logger = log_hook_execution("post_tool_use", hook_input)

    # Extract tool info
    result = {
        "tool_name": hook_input.get("tool", {}).get("name", "unknown"),
        "success": True,
        "insights": []
    }

    # Log result
    log_hook_result(logger, result, exit_code=0)

    # Successfully processed
    sys.exit(0)

if __name__ == "__main__":
    main()
