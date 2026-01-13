"""Build runner service for executing Auto-Claude builds."""

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional, Dict
from dataclasses import dataclass, field

from config import Settings
from models import Build, BuildStatus

logger = logging.getLogger(__name__)


@dataclass
class ActiveBuild:
    """Represents an active build process."""
    build: Build
    process: asyncio.subprocess.Process
    log_file: Path
    subscribers: list[Callable[[str], None]] = field(default_factory=list)
    _log_task: Optional[asyncio.Task] = field(default=None)


class BuildRunner:
    """Service for running Auto-Claude builds."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.active_builds: dict[str, ActiveBuild] = {}

    def _get_env(self, project_env: Optional[Dict[str, str]] = None) -> dict[str, str]:
        """Get environment variables for build subprocess.

        Args:
            project_env: Optional project-specific environment variables from
                        agent profile and credentials. Takes precedence over
                        global settings.
        """
        env = os.environ.copy()

        # Start with global defaults
        # Claude authentication
        if self.settings.claude_code_oauth_token:
            env["CLAUDE_CODE_OAUTH_TOKEN"] = self.settings.claude_code_oauth_token
        if self.settings.anthropic_api_key:
            env["ANTHROPIC_API_KEY"] = self.settings.anthropic_api_key

        # Graphiti settings (global)
        if self.settings.graphiti_enabled:
            env["GRAPHITI_ENABLED"] = "true"
            env["GRAPHITI_FALKORDB_HOST"] = self.settings.graphiti_falkordb_host
            env["GRAPHITI_FALKORDB_PORT"] = str(self.settings.graphiti_falkordb_port)
            if self.settings.graphiti_mcp_url:
                env["GRAPHITI_MCP_URL"] = self.settings.graphiti_mcp_url

        # Other settings
        env["DEFAULT_BRANCH"] = self.settings.default_branch
        if self.settings.debug:
            env["DEBUG"] = "true"

        # Override with project-specific environment if provided
        if project_env:
            env.update(project_env)

        return env

    async def start_build(
        self,
        project_path: str,
        spec_id: str,
        log_callback: Optional[Callable[[str], None]] = None,
        project_env: Optional[Dict[str, str]] = None,
    ) -> Build:
        """Start a new build for a spec.

        Args:
            project_path: Path to the project directory.
            spec_id: ID of the spec to build.
            log_callback: Optional callback for log streaming.
            project_env: Optional project-specific environment variables from
                        agent profile and credentials.
        """
        build_key = f"{project_path}:{spec_id}"
        logger.info(f"Starting build: {build_key}")

        # Check if already running
        if build_key in self.active_builds:
            logger.info(f"Build already running: {build_key}")
            return self.active_builds[build_key].build

        # Create build record
        build = Build(
            project_id=project_path,
            spec_id=spec_id,
            status=BuildStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
        )

        # Create log file
        log_file = self.settings.logs_dir / f"{build.id}.log"
        build.log_file = str(log_file)

        # Build command
        # Note: --force bypasses review approval check for web UI workflow
        # since user is actively clicking "Start Task" - this is implicit approval
        cmd = [
            "python",
            str(self.settings.auto_claude_path / "run.py"),
            "--spec",
            spec_id,
            "--project-dir",
            project_path,
            "--auto-continue",
            "--force",  # Bypass review approval - web UI click is implicit approval
        ]

        # Start subprocess with project-specific environment
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=project_path,
            env=self._get_env(project_env),
        )

        active_build = ActiveBuild(
            build=build,
            process=process,
            log_file=log_file,
        )

        if log_callback:
            active_build.subscribers.append(log_callback)

        self.active_builds[build_key] = active_build
        logger.info(f"Build process started with PID: {process.pid}")

        # Start log streaming task (store reference to prevent GC collection)
        active_build._log_task = asyncio.create_task(self._stream_logs(build_key))

        return build

    async def _stream_logs(self, build_key: str) -> None:
        """Stream logs from subprocess to file and subscribers."""
        logger.info(f"Starting log streaming for: {build_key}")
        active_build = self.active_builds.get(build_key)
        if not active_build:
            logger.warning(f"No active build found for: {build_key}")
            return

        with open(active_build.log_file, "w") as log_file:
            async for line in active_build.process.stdout:
                decoded = line.decode("utf-8", errors="replace")
                log_file.write(decoded)
                log_file.flush()

                # Notify subscribers
                for callback in active_build.subscribers:
                    try:
                        callback(decoded)
                    except Exception:
                        pass

        # Wait for process to complete
        await active_build.process.wait()

        # Update build status
        if active_build.process.returncode == 0:
            active_build.build.status = BuildStatus.COMPLETED
            logger.info(f"Build completed successfully: {build_key}")
        else:
            active_build.build.status = BuildStatus.FAILED
            active_build.build.error_message = (
                f"Process exited with code {active_build.process.returncode}"
            )
            logger.error(f"Build failed with code {active_build.process.returncode}: {build_key}")

        active_build.build.completed_at = datetime.now(timezone.utc)

        # Remove from active builds using atomic pop() to avoid race condition with stop_build
        removed = self.active_builds.pop(build_key, None)
        if removed:
            logger.info(f"Removed from active builds: {build_key}")

    async def stop_build(self, project_path: str, spec_id: str) -> bool:
        """Stop a running build."""
        build_key = f"{project_path}:{spec_id}"
        active_build = self.active_builds.get(build_key)

        if not active_build:
            return False

        # Terminate the process
        active_build.process.terminate()
        try:
            await asyncio.wait_for(active_build.process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            active_build.process.kill()

        active_build.build.status = BuildStatus.CANCELLED
        active_build.build.completed_at = datetime.now(timezone.utc)

        # Use atomic pop() to avoid race condition with _stream_logs
        self.active_builds.pop(build_key, None)
        return True

    def subscribe(
        self,
        project_path: str,
        spec_id: str,
        callback: Callable[[str], None],
    ) -> bool:
        """Subscribe to build logs."""
        build_key = f"{project_path}:{spec_id}"
        active_build = self.active_builds.get(build_key)

        if not active_build:
            return False

        active_build.subscribers.append(callback)
        return True

    def unsubscribe(
        self,
        project_path: str,
        spec_id: str,
        callback: Callable[[str], None],
    ) -> bool:
        """Unsubscribe from build logs."""
        build_key = f"{project_path}:{spec_id}"
        active_build = self.active_builds.get(build_key)

        if not active_build:
            return False

        try:
            active_build.subscribers.remove(callback)
            return True
        except ValueError:
            return False

    def get_active_build(self, project_path: str, spec_id: str) -> Optional[Build]:
        """Get an active build if one exists."""
        build_key = f"{project_path}:{spec_id}"
        active_build = self.active_builds.get(build_key)
        return active_build.build if active_build else None

    def get_all_active_builds(self) -> list[Build]:
        """Get all active builds."""
        return [ab.build for ab in self.active_builds.values()]

    async def get_build_logs(self, build_id: str) -> Optional[str]:
        """Get logs for a completed build."""
        log_file = self.settings.logs_dir / f"{build_id}.log"
        if log_file.exists():
            return log_file.read_text()
        return None


# Global build runner instance
_build_runner: Optional[BuildRunner] = None


def get_build_runner(settings: Settings) -> BuildRunner:
    """Get or create the global build runner."""
    global _build_runner
    if _build_runner is None:
        _build_runner = BuildRunner(settings)
    return _build_runner
