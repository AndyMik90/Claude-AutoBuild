"""
Agent backend abstraction and factory.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from agents.session import run_agent_session
from core.client import create_client
from task_logger import LogPhase


class AgentBackend(Protocol):
    """Protocol for agent backends (Claude SDK or other providers)."""

    async def __aenter__(self) -> "AgentBackend":
        ...

    async def __aexit__(
        self,
        exc_type,
        exc,
        tb,
    ) -> None:
        ...

    async def run(
        self,
        prompt: str,
        spec_dir: Path,
        verbose: bool,
        phase: str,
    ) -> tuple[str, str]:
        """Run a single agent session and return (status, response_text)."""
        ...


def _resolve_phase(phase: str | LogPhase | None) -> LogPhase:
    if isinstance(phase, LogPhase):
        return phase
    if isinstance(phase, str):
        try:
            return LogPhase(phase)
        except ValueError:
            return LogPhase.CODING
    return LogPhase.CODING


class ClaudeBackend:
    """Adapter that exposes Claude SDK sessions via the AgentBackend protocol."""

    def __init__(
        self,
        project_dir: Path,
        spec_dir: Path,
        model: str,
        agent_type: str = "coder",
        max_thinking_tokens: int | None = None,
        output_format: dict | None = None,
        agents: dict | None = None,
    ) -> None:
        self._client = create_client(
            project_dir=project_dir,
            spec_dir=spec_dir,
            model=model,
            agent_type=agent_type,
            max_thinking_tokens=max_thinking_tokens,
            output_format=output_format,
            agents=agents,
        )

    async def __aenter__(self) -> "ClaudeBackend":
        await self._client.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type,
        exc,
        tb,
    ) -> None:
        await self._client.__aexit__(exc_type, exc, tb)

    async def run(
        self,
        prompt: str,
        spec_dir: Path,
        verbose: bool,
        phase: str,
    ) -> tuple[str, str]:
        phase_enum = _resolve_phase(phase)
        return await run_agent_session(self._client, prompt, spec_dir, verbose, phase=phase_enum)


def create_agent_backend(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    agent_type: str = "coder",
    max_thinking_tokens: int | None = None,
    output_format: dict | None = None,
    agents: dict | None = None,
) -> AgentBackend:
    """
    Create an agent backend based on AUTO_BUILD_PROVIDER.

    Currently uses the Claude SDK client for execution.
    """
    return ClaudeBackend(
        project_dir=project_dir,
        spec_dir=spec_dir,
        model=model,
        agent_type=agent_type,
        max_thinking_tokens=max_thinking_tokens,
        output_format=output_format,
        agents=agents,
    )
