"""Log streaming WebSocket routes."""

from pathlib import Path

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from config import get_settings, Settings
from services.project_service import ProjectService
from services.log_streamer import get_log_streamer
from services.build_runner import get_build_runner


router = APIRouter()


@router.websocket("/logs/{project_id}/{spec_id}")
async def log_stream(
    websocket: WebSocket,
    project_id: str,
    spec_id: str,
):
    """WebSocket endpoint for streaming build logs."""
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
):
    """WebSocket endpoint for streaming logs by build ID."""
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
