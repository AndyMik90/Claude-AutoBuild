"""Auto-Claude Docker Web UI - FastAPI Application."""

import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings, Settings
from models import SystemHealth
from database import engine, close_db

# Import routes
from routes import projects, specs, builds, logs, tasks, terminals, files, git, settings as settings_routes
from routes import auth, register, users
from routes import user_credentials, admin_settings
from routes import auth_oidc
from routes import debug

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    settings = get_settings()

    # Ensure directories exist
    settings.repos_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.logs_dir.mkdir(parents=True, exist_ok=True)

    # Initialize projects.json if needed (legacy support during migration)
    if not settings.projects_json_path.exists():
        settings.projects_json_path.write_text("[]")

    logger.info("Auto-Claude Web UI starting...")
    logger.info(f"Database URL: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'local'}")

    yield

    # Cleanup
    logger.info("Shutting down...")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title="Auto-Claude Web UI",
    description="Web interface for Auto-Claude autonomous coding framework",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware - origins configurable via CORS_ALLOWED_ORIGINS env var
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes - Authentication (public routes)
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(auth_oidc.router, prefix="/api/auth/oidc", tags=["auth-oidc"])
app.include_router(register.router, prefix="/api/register", tags=["register"])

# Include API routes - User management (admin only)
app.include_router(users.router, prefix="/api/users", tags=["users"])

# Include API routes - User credentials (current user)
app.include_router(user_credentials.router, prefix="/api/users/me/credentials", tags=["user-credentials"])

# Include API routes - Admin settings (admin only)
app.include_router(admin_settings.router, prefix="/api/admin/settings", tags=["admin-settings"])

# Include API routes - Debug endpoints (development only)
app.include_router(debug.router, prefix="/api/debug", tags=["debug"])

# Include API routes - Core functionality
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(specs.router, prefix="/api/projects", tags=["specs"])
app.include_router(tasks.router, prefix="/api/projects", tags=["tasks"])
app.include_router(builds.router, prefix="/api/projects", tags=["builds"])
app.include_router(terminals.router, prefix="/api/terminals", tags=["terminals"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(git.router, prefix="/api/git", tags=["git"])
app.include_router(logs.router, prefix="/ws/logs", tags=["logs"])
app.include_router(settings_routes.router, prefix="/api/settings", tags=["settings"])


# Health check endpoint
@app.get("/health", response_model=SystemHealth)
async def health_check(settings: Settings = Depends(get_settings)) -> SystemHealth:
    """Health check endpoint for container orchestration."""
    from sqlalchemy import select, func
    from database import async_session_maker
    from db.models import Project

    # Get project count directly from database
    projects_count = 0
    try:
        async with async_session_maker() as session:
            result = await session.execute(select(func.count()).select_from(Project))
            projects_count = result.scalar() or 0
    except Exception:
        pass  # Health check should not fail due to DB issues

    return SystemHealth(
        status="healthy",
        claude_auth=settings.has_claude_auth,
        github_auth=bool(settings.github_token),
        graphiti_enabled=settings.graphiti_enabled,
        projects_count=projects_count,
        active_builds=0,  # TODO: Track active builds
    )


# Static files path (React build output)
# In container: /static, in development: docker/static (relative to app/)
static_path = Path("/static")
if not static_path.exists():
    static_path = Path(__file__).parent.parent / "static"

# Mount static assets (JS, CSS, etc.)
if static_path.exists():
    assets_path = static_path / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")


# WebSocket endpoint for real-time events (must be before catch-all route)
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time events."""
    from routes.websocket import manager
    await manager.connect(ws)
    try:
        await manager.send_to(ws, "connection", {"status": "connected"})
        while True:
            try:
                data = await ws.receive_text()
                # Handle ping/pong for keepalive
                import json
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await manager.send_to(ws, "pong", {})
                except json.JSONDecodeError:
                    pass
            except WebSocketDisconnect:
                break
    finally:
        await manager.disconnect(ws)


# Serve React SPA - catch-all route for client-side routing
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve React SPA for all non-API routes."""
    # Check if requesting a specific static file
    file_path = static_path / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)

    # Otherwise serve index.html for SPA client-side routing
    index_path = static_path / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Frontend not built. Run 'npm run build' in frontend/")
