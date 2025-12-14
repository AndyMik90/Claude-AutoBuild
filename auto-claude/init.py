"""
Auto Claude project initialization utilities.

Handles first-time setup of .auto-claude directory and ensures proper gitignore configuration.
"""

from pathlib import Path


def ensure_gitignore_entry(project_dir: Path, entry: str = ".auto-claude/") -> bool:
    """
    Ensure an entry exists in the project's .gitignore file.
    
    Creates .gitignore if it doesn't exist.
    
    Args:
        project_dir: The project root directory
        entry: The gitignore entry to add (default: ".auto-claude/")
        
    Returns:
        True if entry was added, False if it already existed
    """
    gitignore_path = project_dir / ".gitignore"
    
    # Check if .gitignore exists and if entry is already present
    if gitignore_path.exists():
        content = gitignore_path.read_text()
        lines = content.splitlines()
        
        # Check if entry already exists (exact match or with trailing newline variations)
        entry_normalized = entry.rstrip("/")
        for line in lines:
            line_stripped = line.strip()
            # Match both ".auto-claude" and ".auto-claude/"
            if line_stripped == entry or line_stripped == entry_normalized or line_stripped == entry_normalized + "/":
                return False  # Already exists
        
        # Entry doesn't exist, append it
        # Ensure file ends with newline before adding our entry
        if content and not content.endswith("\n"):
            content += "\n"
        
        # Add a comment and the entry
        content += "\n# Auto Claude data directory\n"
        content += entry + "\n"
        
        gitignore_path.write_text(content)
        return True
    else:
        # Create new .gitignore with the entry
        content = "# Auto Claude data directory\n"
        content += entry + "\n"
        
        gitignore_path.write_text(content)
        return True


def init_auto_claude_dir(project_dir: Path) -> tuple[Path, bool]:
    """
    Initialize the .auto-claude directory for a project.
    
    Creates the directory if needed and ensures it's in .gitignore.
    
    Args:
        project_dir: The project root directory
        
    Returns:
        Tuple of (auto_claude_dir path, gitignore_was_updated)
    """
    project_dir = Path(project_dir)
    auto_claude_dir = project_dir / ".auto-claude"
    
    # Create the directory if it doesn't exist
    dir_created = not auto_claude_dir.exists()
    auto_claude_dir.mkdir(parents=True, exist_ok=True)
    
    # Ensure .auto-claude is in .gitignore (only on first creation)
    gitignore_updated = False
    if dir_created:
        gitignore_updated = ensure_gitignore_entry(project_dir, ".auto-claude/")
    else:
        # Even if dir exists, check gitignore on first run
        # Use a marker file to track if we've already checked
        marker = auto_claude_dir / ".gitignore_checked"
        if not marker.exists():
            gitignore_updated = ensure_gitignore_entry(project_dir, ".auto-claude/")
            marker.touch()
    
    return auto_claude_dir, gitignore_updated


def get_auto_claude_dir(project_dir: Path, ensure_exists: bool = True) -> Path:
    """
    Get the .auto-claude directory path, optionally ensuring it exists.
    
    Args:
        project_dir: The project root directory
        ensure_exists: If True, create directory and update gitignore if needed
        
    Returns:
        Path to the .auto-claude directory
    """
    if ensure_exists:
        auto_claude_dir, _ = init_auto_claude_dir(project_dir)
        return auto_claude_dir
    
    return Path(project_dir) / ".auto-claude"
