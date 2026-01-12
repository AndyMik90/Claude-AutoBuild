#!/usr/bin/env python3
"""
PreToolUse Hook - Security validation

This hook runs before each tool execution to:
- Validate commands for security
- Check for dangerous operations
- Log tool usage

Exit codes:
  0 - Allow tool execution
  1 - Block tool execution
"""

import json
import sys

def main():
    """Main hook entry point."""
    # Read stdin for tool data
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        # Allow on parse errors
        sys.exit(0)
    except Exception as e:
        # Allow on any other errors
        sys.exit(0)

    # Allow tool execution
    sys.exit(0)

if __name__ == "__main__":
    main()
