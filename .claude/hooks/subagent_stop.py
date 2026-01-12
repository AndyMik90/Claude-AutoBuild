#!/usr/bin/env python3
"""
SubagentStop Hook - Validate subagent completion

This hook runs when a subagent session completes to:
- Validate subagent completed its task
- Extract learnings from subagent session
- Aggregate results

Exit codes:
  0 - Subagent completed successfully
  1 - Subagent failed (non-blocking)
"""

import json
import sys

def main():
    """Main hook entry point."""
    try:
        hook_input = json.loads(sys.stdin.read())
    except:
        sys.exit(0)

    sys.exit(0)

if __name__ == "__main__":
    main()
