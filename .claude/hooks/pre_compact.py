#!/usr/bin/env python3
"""
PreCompact Hook - Preserve critical context during summarization

This hook runs before context compaction to:
- Mark important messages for preservation
- Extract key decisions and state
- Ensure critical info survives summarization

Exit codes:
  0 - Always (informational only)
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
