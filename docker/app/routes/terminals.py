"""Terminal management API routes.

Provides PTY terminal sessions with WebSocket streaming for real-time I/O.
Each terminal session is isolated per-project and uses the credential hierarchy
(global → user → project) for Claude authentication.
"""

import asyncio
import json
import os
import pty
import select
import shutil
import signal
import struct
import fcntl
import tempfile
import termios
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict
import uuid as uuid_module
import logging

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings, Settings
from database import get_db
from db.models.user import User
from routes.auth import get_current_user
from services.project_service import ProjectService
from services.user_credential_service import CredentialHierarchyService, CredentialService
from routes.websocket import manager as ws_manager


router = APIRouter()


async def get_project_service(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ProjectService:
    """Get project service with current user."""
    return ProjectService(db, settings, current_user)


# In-memory storage for terminal sessions
terminals: dict[str, "TerminalSession"] = {}


class TerminalCreate(BaseModel):
    """Request model for creating a terminal."""
    projectId: str
    name: Optional[str] = None
    cwd: Optional[str] = None


class TerminalResize(BaseModel):
    """Request model for resizing a terminal."""
    cols: int
    rows: int


class TerminalWrite(BaseModel):
    """Request model for writing to a terminal."""
    data: str


class TerminalRename(BaseModel):
    """Request model for renaming a terminal."""
    name: str


class TerminalSession:
    """Represents a PTY terminal session.

    Security: Terminal sessions are sandboxed using bubblewrap (bwrap) to prevent
    users from accessing files outside their project directory. The sandbox:
    - Binds the project directory as writable /workspace
    - Provides read-only access to system binaries and libraries
    - Isolates the filesystem view using Linux namespaces

    Credentials: Each session uses credentials from the hierarchy (global → user → project)
    specific to the user and project. This ensures multi-user isolation where each user's
    terminals use their own configured Claude/Anthropic keys.
    """

    # Check if bubblewrap is available at class load time
    BWRAP_PATH: Optional[str] = shutil.which("bwrap")
    SANDBOX_ENABLED: bool = BWRAP_PATH is not None

    def __init__(
        self,
        terminal_id: str,
        project_id: str,
        user_id: str,
        name: str,
        cwd: str,
        credentials: Optional[Dict[str, Optional[str]]] = None,
    ):
        self.id = terminal_id
        self.project_id = project_id
        self.user_id = user_id
        self.name = name
        self.cwd = cwd
        self.credentials = credentials or {}
        self.created_at = datetime.now(timezone.utc)
        self.master_fd: Optional[int] = None
        self.slave_fd: Optional[int] = None
        self.pid: Optional[int] = None
        self.cols = 80
        self.rows = 24
        self._running = False
        self._reader_task: Optional[asyncio.Task] = None
        self._config_dir: Optional[str] = None  # Temp dir for per-session Claude config

    def _setup_session_config(self) -> str:
        """Create per-session Claude CLI config with user-specific credentials.

        Creates a temporary directory containing:
        - .claude.json: Claude CLI config with hasCompletedOnboarding=true
        - .claude/.credentials.json: OAuth token if available

        Returns:
            Path to the temporary config directory.
        """
        # Create temp directory for this session's Claude config
        config_dir = tempfile.mkdtemp(prefix=f"claude-session-{self.id}-")
        self._config_dir = config_dir

        # Get credentials from hierarchy (passed during terminal creation)
        oauth_token = self.credentials.get("claude_oauth_token")
        anthropic_key = self.credentials.get("anthropic_api_key")

        # Build customApiKeyResponses if API key is set
        api_key_response = ""
        if anthropic_key:
            last_20 = anthropic_key[-20:] if len(anthropic_key) >= 20 else anthropic_key
            api_key_response = f'"customApiKeyResponses": {{ "approved": ["{last_20}"], "rejected": [] }},'

        # Create .claude.json with onboarding complete
        claude_json = f'''{{
  {api_key_response}
  "theme": "dark",
  "hasCompletedOnboarding": true,
  "hasTrustDialogAccepted": true,
  "hasCompletedProjectOnboarding": true,
  "autoUpdaterStatus": "disabled"
}}'''
        with open(os.path.join(config_dir, ".claude.json"), "w") as f:
            f.write(claude_json)

        # Create .claude directory
        claude_dir = os.path.join(config_dir, ".claude")
        os.makedirs(claude_dir, exist_ok=True)

        # Create credentials file if OAuth token is available
        if oauth_token:
            credentials_json = json.dumps({
                "accessToken": oauth_token,
                "refreshToken": None,
                "expiresAt": None
            }, indent=2)
            with open(os.path.join(claude_dir, ".credentials.json"), "w") as f:
                f.write(credentials_json)

        logger.info(f"Terminal {self.id}: created session config at {config_dir} "
                    f"(has_oauth={bool(oauth_token)}, has_api_key={bool(anthropic_key)})")

        return config_dir

    def _cleanup_session_config(self) -> None:
        """Clean up the per-session Claude config directory."""
        if self._config_dir and os.path.exists(self._config_dir):
            try:
                shutil.rmtree(self._config_dir)
                logger.info(f"Terminal {self.id}: cleaned up session config at {self._config_dir}")
            except Exception as e:
                logger.warning(f"Terminal {self.id}: failed to cleanup config: {e}")
            self._config_dir = None

    def _build_sandbox_command(self) -> list[str]:
        """Build the bubblewrap command for sandboxing the terminal.

        The sandbox restricts filesystem access to only the project directory,
        preventing users from navigating to other projects or system files.

        Uses bind mounts for /dev and /proc for Docker compatibility.
        Uses symlinks for /bin, /sbin, /lib, /lib64 to match Debian/Ubuntu layout
        where these are symlinks to /usr subdirectories.

        Credentials are injected from the per-session config created by _setup_session_config(),
        NOT from global environment variables. This ensures multi-user isolation.
        """
        # Resolve the project root (cwd might be a subdirectory)
        project_path = Path(self.cwd).resolve()

        # Build bwrap arguments
        args = [
            self.BWRAP_PATH,
            # Device filesystem first (needed for early initialization)
            "--dev", "/dev",
            # Bind project directory as writable /workspace
            "--bind", str(project_path), "/workspace",
            # Read-only system directories
            "--ro-bind", "/usr", "/usr",
            "--ro-bind", "/etc", "/etc",
            "--ro-bind", "/proc", "/proc",
            # Create symlinks matching Debian/Ubuntu filesystem layout
            # where /bin, /sbin, /lib, /lib64 are symlinks to /usr subdirectories
            "--symlink", "usr/bin", "/bin",
            "--symlink", "usr/sbin", "/sbin",
            "--symlink", "usr/lib", "/lib",
            "--symlink", "usr/lib64", "/lib64",
            # Temp directory (in-memory)
            "--tmpfs", "/tmp",
            # Set working directory
            "--chdir", "/workspace",
            # Environment variables
            "--setenv", "HOME", "/workspace",
            "--setenv", "USER", "autoclaude",
            "--setenv", "TERM", "xterm-256color",
            "--setenv", "COLORTERM", "truecolor",
            "--setenv", "PS1", r"\[\033[01;32m\]\u@sandbox\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ ",
        ]

        # Bind per-session Claude CLI config (created by _setup_session_config)
        # This contains user-specific credentials from the hierarchy
        if self._config_dir:
            session_claude_dir = os.path.join(self._config_dir, ".claude")
            session_claude_json = os.path.join(self._config_dir, ".claude.json")
            if os.path.exists(session_claude_dir):
                args.extend(["--bind", session_claude_dir, "/workspace/.claude"])
            if os.path.exists(session_claude_json):
                args.extend(["--bind", session_claude_json, "/workspace/.claude.json"])

        # Pass through user-specific Claude authentication environment variables
        # These come from the credential hierarchy, not global env vars
        oauth_token = self.credentials.get("claude_oauth_token")
        anthropic_key = self.credentials.get("anthropic_api_key")

        if oauth_token:
            args.extend(["--setenv", "CLAUDE_CODE_OAUTH_TOKEN", oauth_token])
        if anthropic_key:
            args.extend(["--setenv", "ANTHROPIC_API_KEY", anthropic_key])

        args.extend([
            # Kill child when parent dies
            "--die-with-parent",
            # Execute bash (use full path since we're creating symlinks)
            "/usr/bin/bash",
        ])

        return args

    async def start(self) -> None:
        """Start the terminal session.

        If bubblewrap is available, the terminal runs in a sandbox that restricts
        access to only the project directory. Otherwise, falls back to unsandboxed
        mode with a warning.

        Before starting, creates per-session Claude config with user-specific
        credentials from the hierarchy.
        """
        # Create per-session Claude config with user credentials
        self._setup_session_config()

        # Create pseudo-terminal
        self.master_fd, self.slave_fd = pty.openpty()

        # Fork process
        self.pid = os.fork()

        if self.pid == 0:
            # Child process
            os.setsid()
            os.dup2(self.slave_fd, 0)
            os.dup2(self.slave_fd, 1)
            os.dup2(self.slave_fd, 2)

            if self.slave_fd > 2:
                os.close(self.slave_fd)
            if self.master_fd > 2:
                os.close(self.master_fd)

            # Set environment
            env = os.environ.copy()
            env["TERM"] = "xterm-256color"
            env["COLORTERM"] = "truecolor"

            if self.SANDBOX_ENABLED:
                # Execute sandboxed shell using bubblewrap
                sandbox_cmd = self._build_sandbox_command()
                os.execvpe(sandbox_cmd[0], sandbox_cmd, env)
            else:
                # Fallback: unsandboxed mode (log warning)
                logger.warning(
                    f"Terminal {self.id}: bubblewrap not available, running unsandboxed! "
                    "Install bubblewrap for filesystem isolation."
                )
                # Change to working directory
                try:
                    os.chdir(self.cwd)
                except Exception:
                    pass
                # Execute shell directly
                shell = os.environ.get("SHELL", "/bin/bash")
                os.execvpe(shell, [shell], env)
        else:
            # Parent process
            os.close(self.slave_fd)
            self.slave_fd = None

            # Set non-blocking
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Set initial size
            self._set_size(self.cols, self.rows)

            # Start reader
            self._running = True
            self._reader_task = asyncio.create_task(self._read_loop())

            if self.SANDBOX_ENABLED:
                logger.info(f"Terminal {self.id}: started in sandbox (project: {self.cwd})")
            else:
                logger.warning(f"Terminal {self.id}: started WITHOUT sandbox")

    async def stop(self) -> None:
        """Stop the terminal session and cleanup resources."""
        self._running = False

        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass

        if self.pid:
            try:
                os.kill(self.pid, signal.SIGTERM)
                # Wait a bit then force kill
                await asyncio.sleep(0.5)
                try:
                    os.kill(self.pid, signal.SIGKILL)
                except OSError:
                    pass
                # Retry waitpid to ensure process is reaped
                for retry in range(5):
                    try:
                        pid_result, _ = os.waitpid(self.pid, os.WNOHANG)
                        if pid_result != 0:
                            # Process was reaped successfully
                            break
                    except ChildProcessError:
                        # Process already reaped
                        break
                    except OSError:
                        break
                    await asyncio.sleep(0.1 * (retry + 1))
            except OSError:
                pass

        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None

        # Cleanup per-session Claude config
        self._cleanup_session_config()

    def write(self, data: str) -> None:
        """Write data to the terminal."""
        if self.master_fd is not None:
            try:
                os.write(self.master_fd, data.encode("utf-8"))
            except OSError:
                pass

    def resize(self, cols: int, rows: int) -> None:
        """Resize the terminal."""
        self.cols = cols
        self.rows = rows
        self._set_size(cols, rows)

    def _set_size(self, cols: int, rows: int) -> None:
        """Set terminal size."""
        if self.master_fd is not None:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    async def _read_loop(self) -> None:
        """Read output from terminal and broadcast."""
        loop = asyncio.get_event_loop()

        while self._running and self.master_fd is not None:
            try:
                # Use select to check if data is available
                readable, _, _ = select.select([self.master_fd], [], [], 0.1)

                if readable:
                    data = os.read(self.master_fd, 4096)
                    if data:
                        # Broadcast to WebSocket
                        await ws_manager.broadcast(
                            "terminal:data",
                            {"terminalId": self.id, "data": data.decode("utf-8", errors="replace")}
                        )
                    else:
                        # EOF
                        break
                else:
                    await asyncio.sleep(0.01)

            except OSError:
                break
            except Exception as e:
                print(f"Terminal read error: {e}")
                await asyncio.sleep(0.1)

        # Terminal exited
        await ws_manager.broadcast(
            "terminal:exit",
            {"terminalId": self.id, "code": 0}
        )

    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "projectId": self.project_id,
            "userId": self.user_id,
            "name": self.name,
            "cwd": self.cwd,
            "cols": self.cols,
            "rows": self.rows,
            "createdAt": self.created_at.isoformat(),
        }


@router.get("")
async def list_terminals(
    project_id: Optional[str] = Query(None, alias="projectId"),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """List active terminal sessions.

    Args:
        project_id: Optional project ID to filter terminals.
                   If provided, only returns terminals for that project.

    Returns:
        List of terminal sessions for the current user.
    """
    user_id = str(current_user.id)

    # Filter terminals by user and optionally by project
    result = []
    for t in terminals.values():
        # Only show terminals belonging to the current user
        if t.user_id != user_id:
            continue
        # If project_id filter is provided, only show that project's terminals
        if project_id and t.project_id != project_id:
            continue
        result.append(t.to_dict())

    return result


async def get_credential_hierarchy_service(
    db: AsyncSession = Depends(get_db),
) -> CredentialHierarchyService:
    """Get credential hierarchy service."""
    return CredentialHierarchyService(db)


@router.post("")
async def create_terminal(
    data: TerminalCreate,
    project_service: ProjectService = Depends(get_project_service),
    hierarchy_service: CredentialHierarchyService = Depends(get_credential_hierarchy_service),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new terminal session with user-specific credentials.

    The terminal session uses credentials from the hierarchy:
    1. Global (if admin locked) → 2. User defaults → 3. Project overrides

    This ensures multi-user isolation where each user's terminals use
    their own configured Claude/Anthropic keys.
    """
    # Validate project
    project = await project_service.get_project(data.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get effective credentials from hierarchy for this user/project
    # Fetch project credentials separately to avoid lazy loading issues
    project_creds = None
    try:
        from db.models.project import ProjectCredentials
        from sqlalchemy import select

        result = await db.execute(
            select(ProjectCredentials).where(ProjectCredentials.project_id == project.id)
        )
        pc = result.scalar_one_or_none()

        if pc:
            cred_service = CredentialService()
            project_creds = {}
            # ProjectCredentials only has encrypted fields, no has_* flags
            if pc.claude_oauth_token_encrypted:
                try:
                    project_creds["claude_oauth_token"] = cred_service.decrypt_credential(
                        pc.claude_oauth_token_encrypted
                    )
                except Exception:
                    pass
            if pc.anthropic_api_key_encrypted:
                try:
                    project_creds["anthropic_api_key"] = cred_service.decrypt_credential(
                        pc.anthropic_api_key_encrypted
                    )
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Failed to fetch project credentials: {e}")

    # Get effective credentials from hierarchy
    effective_result = await hierarchy_service.get_effective_credentials(
        user_id=current_user.id,
        project_credentials=project_creds,
    )
    effective_creds = effective_result.get("credentials", {})

    # Determine working directory
    cwd = data.cwd or project.path
    if not Path(cwd).exists():
        cwd = project.path

    # Create terminal
    # Use frontend's ID if provided (allows frontend to track terminals),
    # otherwise generate a new one
    terminal_id = data.name if data.name else str(uuid_module.uuid4())

    # Check if terminal with this ID already exists
    existing = terminals.get(terminal_id)
    if existing:
        # Return existing terminal instead of creating duplicate
        logger.info(
            f"Terminal {terminal_id} already exists for project {existing.project_id}, "
            f"returning existing terminal"
        )
        return existing.to_dict()

    # Count terminals for this project to generate name
    project_terminal_count = sum(
        1 for t in terminals.values()
        if t.project_id == data.projectId and t.user_id == str(current_user.id)
    )
    name = f"Terminal {project_terminal_count + 1}"

    terminal = TerminalSession(
        terminal_id=terminal_id,
        project_id=data.projectId,
        user_id=str(current_user.id),
        name=name,
        cwd=cwd,
        credentials=effective_creds,
    )

    await terminal.start()
    terminals[terminal_id] = terminal

    logger.info(
        f"Created terminal {terminal_id} for user {current_user.id} "
        f"in project {data.projectId} with credentials from hierarchy"
    )

    return terminal.to_dict()


@router.get("/{terminal_id}")
async def get_terminal(terminal_id: str) -> dict:
    """Get a terminal session."""
    terminal = terminals.get(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    return terminal.to_dict()


@router.delete("/{terminal_id}")
async def close_terminal(terminal_id: str) -> dict:
    """Close a terminal session."""
    terminal = terminals.get(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    await terminal.stop()
    del terminals[terminal_id]

    return {"success": True}


@router.post("/{terminal_id}/write")
async def write_terminal(terminal_id: str, data: TerminalWrite) -> dict:
    """Write data to a terminal."""
    terminal = terminals.get(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    terminal.write(data.data)
    return {"success": True}


@router.post("/{terminal_id}/resize")
async def resize_terminal(terminal_id: str, data: TerminalResize) -> dict:
    """Resize a terminal."""
    terminal = terminals.get(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    terminal.resize(data.cols, data.rows)
    return {"success": True}


@router.post("/{terminal_id}/rename")
async def rename_terminal(terminal_id: str, data: TerminalRename) -> dict:
    """Rename a terminal."""
    terminal = terminals.get(terminal_id)
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    terminal.name = data.name
    return {"success": True}


# WebSocket endpoint for direct terminal I/O
@router.websocket("/{terminal_id}/ws")
async def terminal_websocket(
    websocket: WebSocket,
    terminal_id: str,
):
    """WebSocket for direct terminal I/O."""
    terminal = terminals.get(terminal_id)
    if not terminal:
        await websocket.close(code=4404)
        return

    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            terminal.write(data)
    except WebSocketDisconnect:
        pass
