"""Log streaming WebSocket routes."""

import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status

from config import get_settings
from database import async_session_maker
from db.models import User
from services.project_service import ProjectService
from services.log_streamer import get_log_streamer
from services.build_runner import get_build_runner
from services.jwt_service import get_jwt_service, TokenError
from services.auth_service import get_auth_service


router = APIRouter()


async def authenticate_websocket(
    websocket: WebSocket,
    token: Optional[str] = None,
) -> Optional[User]:
    """Authenticate WebSocket connection using JWT token.

    For WebSocket connections, the token must be passed as a query parameter
    since HTTP Authorization headers are not reliably available.

    Args:
        websocket: WebSocket connection
        token: JWT access token from query parameter

    Returns:
        Authenticated user or None if authentication fails
    """
    if token is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

    jwt_service = get_jwt_service()

    try:
        payload = jwt_service.decode_access_token(token)
    except TokenError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None

    async with async_session_maker() as db:
        auth_service = get_auth_service(db)
        user = await auth_service.get_user_by_id(user_id)

        if user is None or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return None

    return user


@router.websocket("/logs/{project_id}/{spec_id}")
async def log_stream(
    websocket: WebSocket,
    project_id: str,
    spec_id: str,
    token: Optional[str] = Query(default=None),
):
    """WebSocket endpoint for streaming build logs.

    Requires JWT authentication via query parameter.
    Example: ws://host/logs/{project_id}/{spec_id}?token=<jwt_token>
    """
    # Authenticate before accepting the connection
    user = await authenticate_websocket(websocket, token)
    if user is None:
        return

    await websocket.accept()

    settings = get_settings()
    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)

    if not project:
        await websocket.send_text("Error: Project not found\n")
        await websocket.close()
        return

    log_streamer = get_log_streamer(settings)
    build_runner = get_build_runner(settings)

    # Check if there's an active build
    active_build = build_runner.get_active_build(project.path, spec_id)

    if active_build and active_build.log_file:
        # Tail the active log file
        log_file = Path(active_build.log_file)
        await log_streamer.tail_file(log_file, project_id, spec_id, follow=True)
    else:
        # Check for existing log file
        logs_dir = settings.logs_dir
        log_files = list(logs_dir.glob(f"*-{spec_id}.log"))
        if log_files:
            latest_log = max(log_files, key=lambda f: f.stat().st_mtime)
            await log_streamer.tail_file(latest_log, project_id, spec_id, follow=False)
        else:
            await websocket.send_text("No logs available yet. Start a build to see logs.\n")
            await websocket.close()
            return

    try:
        async for line in log_streamer.subscribe(project_id, spec_id):
            await websocket.send_text(line)
    except WebSocketDisconnect:
        pass
    finally:
        log_streamer.stop_tail(project_id, spec_id)


@router.websocket("/logs/build/{build_id}")
async def build_log_stream(
    websocket: WebSocket,
    build_id: str,
    token: Optional[str] = Query(default=None),
):
    """WebSocket endpoint for streaming logs by build ID.

    Requires JWT authentication via query parameter.
    Example: ws://host/logs/build/{build_id}?token=<jwt_token>
    """
    # Authenticate before accepting the connection
    user = await authenticate_websocket(websocket, token)
    if user is None:
        return

    await websocket.accept()

    settings = get_settings()
    log_file = settings.logs_dir / f"{build_id}.log"

    if not log_file.exists():
        await websocket.send_text("Error: Log file not found\n")
        await websocket.close()
        return

    log_streamer = get_log_streamer(settings)

    # Use build_id as both project and spec for uniqueness
    await log_streamer.tail_file(log_file, build_id, build_id, follow=True)

    try:
        async for line in log_streamer.subscribe(build_id, build_id):
            await websocket.send_text(line)
    except WebSocketDisconnect:
        pass
    finally:
        log_streamer.stop_tail(build_id, build_id)
