"""Git operations API routes.

Provides git repository operations for the web UI.
"""

import asyncio
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from config import get_settings, Settings


router = APIRouter()


def validate_path(path: str, settings: Settings) -> Path:
    """Validate and sanitize a path to prevent path traversal attacks.

    Args:
        path: The user-provided path string
        settings: Application settings containing allowed base directories

    Returns:
        A validated, resolved Path object

    Raises:
        HTTPException: If path is invalid, contains traversal attempts,
                       or is outside allowed directories
    """
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")

    # Check for null bytes which could be used for path injection
    if '\x00' in path:
        raise HTTPException(status_code=400, detail="Invalid path: null bytes not allowed")

    # Normalize the path to resolve any .. or . components
    try:
        # Convert to Path and resolve to absolute path
        resolved_path = Path(path).resolve()
    except (ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {e}")

    # Check for path traversal by comparing the resolved path with the original
    # If the original path contained .. that escaped, the resolved path will differ
    original_parts = Path(path).parts

    # Detect explicit traversal attempts (.. in path)
    if '..' in original_parts:
        raise HTTPException(status_code=400, detail="Invalid path: path traversal not allowed")

    # Verify path is within allowed base directory (projects_dir)
    # This prevents arbitrary filesystem access
    base_dir = settings.projects_dir.resolve()
    try:
        resolved_path.relative_to(base_dir)
    except ValueError:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: path must be within {base_dir}"
        )

    # Ensure the path exists and is a directory
    if not resolved_path.exists():
        raise HTTPException(status_code=404, detail="Path not found")

    if not resolved_path.is_dir():
        raise HTTPException(status_code=400, detail="Path must be a directory")

    return resolved_path


class GitInit(BaseModel):
    """Request model for initializing a git repo."""
    path: str


async def run_git_command(cwd: str, *args: str, timeout: float = 60.0) -> tuple[int, str, str]:
    """Run a git command and return (returncode, stdout, stderr).

    Args:
        cwd: Working directory for the git command
        *args: Git command arguments
        timeout: Maximum time in seconds to wait for the command (default: 60)

    Returns:
        Tuple of (returncode, stdout, stderr)

    Raises:
        asyncio.TimeoutError: If the command exceeds the timeout
    """
    process = await asyncio.create_subprocess_exec(
        "git",
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        return process.returncode, stdout.decode().strip(), stderr.decode().strip()
    except asyncio.TimeoutError:
        # Kill the process if it times out
        process.kill()
        await process.wait()
        return -1, "", f"Git command timed out after {timeout} seconds"


@router.get("/branches")
async def get_branches(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> list[str]:
    """Get list of branches."""
    validated_path = validate_path(path, settings)

    returncode, stdout, stderr = await run_git_command(str(validated_path), "branch", "-a", "--format=%(refname:short)")

    if returncode != 0:
        raise HTTPException(status_code=400, detail=stderr or "Failed to get branches")

    branches = [b.strip() for b in stdout.split("\n") if b.strip()]
    return branches


@router.get("/current-branch")
async def get_current_branch(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get current branch name."""
    validated_path = validate_path(path, settings)

    returncode, stdout, stderr = await run_git_command(str(validated_path), "rev-parse", "--abbrev-ref", "HEAD")

    if returncode != 0:
        return {"branch": None}

    return {"branch": stdout.strip()}


@router.get("/main-branch")
async def detect_main_branch(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Detect the main branch (main, master, etc.)."""
    validated_path = validate_path(path, settings)

    # Check for common main branch names
    for branch in ["main", "master", "develop"]:
        returncode, _, _ = await run_git_command(
            str(validated_path), "rev-parse", "--verify", f"refs/heads/{branch}"
        )
        if returncode == 0:
            return {"branch": branch}

    return {"branch": None}


@router.get("/status")
async def get_git_status(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get git status."""
    validated_path = validate_path(path, settings)

    # Check if it's a git repo
    returncode, _, _ = await run_git_command(str(validated_path), "rev-parse", "--is-inside-work-tree")
    if returncode != 0:
        return {"isRepo": False, "clean": False, "branch": None, "files": []}

    # Get current branch
    _, branch, _ = await run_git_command(str(validated_path), "rev-parse", "--abbrev-ref", "HEAD")

    # Get status
    returncode, stdout, _ = await run_git_command(str(validated_path), "status", "--porcelain")

    files = []
    if stdout:
        for line in stdout.split("\n"):
            if line:
                status = line[:2]
                file_path = line[3:]
                files.append({"status": status.strip(), "path": file_path})

    return {
        "isRepo": True,
        "clean": len(files) == 0,
        "branch": branch,
        "files": files,
    }


@router.post("/init")
async def init_repo(
    data: GitInit,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Initialize a git repository."""
    validated_path = validate_path(data.path, settings)

    returncode, stdout, stderr = await run_git_command(str(validated_path), "init")

    if returncode != 0:
        raise HTTPException(status_code=400, detail=stderr or "Failed to initialize repository")

    return {"success": True, "message": stdout or "Initialized empty Git repository"}


@router.get("/log")
async def get_git_log(
    path: str = Query(..., description="Repository path"),
    limit: int = Query(10, description="Number of commits"),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Get recent commits."""
    validated_path = validate_path(path, settings)

    returncode, stdout, stderr = await run_git_command(
        str(validated_path),
        "log",
        f"-{limit}",
        "--format=%H%x00%s%x00%an%x00%ae%x00%aI",
    )

    if returncode != 0:
        return []

    commits = []
    for line in stdout.split("\n"):
        if line:
            parts = line.split("\x00", 4)
            if len(parts) == 5:
                commits.append({
                    "hash": parts[0],
                    "message": parts[1],
                    "author": parts[2],
                    "email": parts[3],
                    "date": parts[4],
                })

    return commits


@router.get("/diff")
async def get_git_diff(
    path: str = Query(..., description="Repository path"),
    staged: bool = Query(False, description="Show staged changes"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get git diff."""
    validated_path = validate_path(path, settings)

    args = ["diff"]
    if staged:
        args.append("--cached")

    returncode, stdout, stderr = await run_git_command(str(validated_path), *args)

    return {"diff": stdout}


@router.get("/remote")
async def get_git_remote(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Get git remotes."""
    validated_path = validate_path(path, settings)

    returncode, stdout, _ = await run_git_command(str(validated_path), "remote", "-v")

    if returncode != 0:
        return []

    remotes = {}
    for line in stdout.split("\n"):
        if line:
            parts = line.split()
            if len(parts) >= 2:
                name = parts[0]
                url = parts[1]
                if name not in remotes:
                    remotes[name] = {"name": name, "url": url}

    return list(remotes.values())


@router.post("/fetch")
async def git_fetch(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Fetch from remote."""
    validated_path = validate_path(path, settings)

    returncode, stdout, stderr = await run_git_command(str(validated_path), "fetch", "--all")

    if returncode != 0:
        raise HTTPException(status_code=400, detail=stderr or "Failed to fetch")

    return {"success": True, "message": stdout or stderr or "Fetch complete"}


@router.post("/pull")
async def git_pull(
    path: str = Query(..., description="Repository path"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Pull from remote."""
    validated_path = validate_path(path, settings)

    returncode, stdout, stderr = await run_git_command(str(validated_path), "pull")

    if returncode != 0:
        raise HTTPException(status_code=400, detail=stderr or "Failed to pull")

    return {"success": True, "message": stdout or stderr or "Pull complete"}
