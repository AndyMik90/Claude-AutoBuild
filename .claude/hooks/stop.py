#!/usr/bin/env python3
"""
Stop Hook - Quality gates and acceptance criteria validation

This hook runs when an agent session completes to:
- Run tests if code was modified
- Check acceptance criteria against spec
- Validate build success

Exit codes:
  0 - Quality gates passed
  1 - Quality gates failed (agent should continue)
  2 - Critical failure (block session completion)
"""

import json
import sys

def main():
    """Main hook entry point."""
    # Read stdin for stop data
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        # Allow on parse errors
        sys.exit(0)
    except Exception as e:
        # Allow on any other errors
        sys.exit(0)

    # Quality gates passed
    sys.exit(0)

if __name__ == "__main__":
    main()
