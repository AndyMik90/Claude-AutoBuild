#!/usr/bin/env python3
"""
SessionStart Hook - Load spec context and project guidelines

This hook runs at session start to:
- Load spec.md and implementation_plan.json
- Inject project-specific guidelines
- Set up session context

Exit codes:
  0 - Always (informational only)
"""

import json
import sys

def main():
    """Main hook entry point."""
    # Read stdin for session data
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        sys.exit(0)
    except Exception as e:
        sys.exit(0)

    sys.exit(0)

if __name__ == "__main__":
    main()
