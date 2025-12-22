"""
Discovery Module
================

Project structure analysis and indexing.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path


def run_discovery_script(
    project_dir: Path,
    spec_dir: Path,
) -> tuple[bool, str]:
    """Run the analyzer.py script to discover project structure.

    Returns:
        (success, output_message)
    """
    spec_index = spec_dir / "project_index.json"
    auto_build_index = project_dir / "auto-claude" / "project_index.json"

    # Check if project_index already exists
    if auto_build_index.exists() and not spec_index.exists():
        # Copy existing index
        shutil.copy(auto_build_index, spec_index)
        return True, "Copied existing project_index.json"

    if spec_index.exists():
        return True, "project_index.json already exists"

    # Run analyzer - use framework-relative path instead of project_dir
    script_path = Path(__file__).parent.parent / "analyzer.py"
    if not script_path.exists():
        return False, f"Script not found: {script_path}"

    cmd = [sys.executable, str(script_path), "--output", str(spec_index)]

    try:
        result = subprocess.run(
            cmd,
            cwd=project_dir,
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode == 0 and spec_index.exists():
            return True, "Created project_index.json"
        else:
            return False, result.stderr or result.stdout

    except subprocess.TimeoutExpired:
        return False, "Script timed out"
    except Exception as e:
        return False, str(e)


def get_project_index_stats(spec_dir: Path) -> dict:
    """Get statistics from project index if available."""
    spec_index = spec_dir / "project_index.json"
    if not spec_index.exists():
        return {}

    try:
        with open(spec_index) as f:
            index_data = json.load(f)
        return {
            "file_count": len(index_data.get("files", [])),
            "project_type": index_data.get("project_type", "unknown"),
        }
    except Exception:
        return {}
