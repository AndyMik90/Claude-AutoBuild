"""Context utilities for hooks."""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional

def get_project_root() -> Path:
    """Get the Auto-Claude project root directory."""
    # From .claude/hooks/utils/ go up 3 levels
    return Path(__file__).parent.parent.parent.parent

def get_current_spec_dir() -> Optional[Path]:
    """Get the current spec directory if one is active."""
    # Check for SPEC_DIR environment variable
    spec_dir = os.environ.get("SPEC_DIR")
    if spec_dir:
        return Path(spec_dir)

    # Look for .auto-claude/current_spec file
    project_root = get_project_root()
    current_spec_file = project_root / ".auto-claude" / "current_spec"
    if current_spec_file.exists():
        spec_name = current_spec_file.read_text().strip()
        return project_root / ".auto-claude" / "specs" / spec_name

    return None

def load_spec_context() -> Optional[Dict[str, Any]]:
    """Load the current spec context if available."""
    spec_dir = get_current_spec_dir()
    if not spec_dir or not spec_dir.exists():
        return None

    context = {}

    # Load spec.md
    spec_file = spec_dir / "spec.md"
    if spec_file.exists():
        context["spec"] = spec_file.read_text()

    # Load implementation_plan.json
    plan_file = spec_dir / "implementation_plan.json"
    if plan_file.exists():
        try:
            context["plan"] = json.loads(plan_file.read_text())
        except json.JSONDecodeError:
            pass

    # Load requirements.json
    req_file = spec_dir / "requirements.json"
    if req_file.exists():
        try:
            context["requirements"] = json.loads(req_file.read_text())
        except json.JSONDecodeError:
            pass

    return context if context else None

def get_archon_project_id() -> Optional[str]:
    """Get the Archon project ID for the current spec."""
    spec_dir = get_current_spec_dir()
    if not spec_dir:
        return None

    # Check for archon_project_id file in spec dir
    archon_file = spec_dir / ".archon_project_id"
    if archon_file.exists():
        return archon_file.read_text().strip()

    return None
