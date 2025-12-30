"""
BMAD Full Integration for Auto-Claude

This module provides complete integration between BMAD-METHOD v6 and Auto-Claude's
autonomous execution engine. It enables:

- **23 Agents** across 5 modules (Core, BMM, BMGD, CIS, BMB)
- **74 Workflows** with 204 step files
- **Token-efficient** loading (<50K per session)
- **JIT step loading** for minimal context usage
- **Disk + LRU cache** for instant access

## Modules

| Module | Agents | Workflows | Purpose |
|--------|--------|-----------|---------|
| Core   | 1      | 2         | bmad-master orchestrator |
| BMM    | 9      | 32        | Agile development |
| BMGD   | 6      | 29        | Game development |
| CIS    | 6      | 4         | Creative & innovation |
| BMB    | 1      | 7         | Agent/workflow builder |

## Quick Start

```python
from integrations.bmad import BMADIntegration

# Initialize
bmad = BMADIntegration()

# List available agents
agents = bmad.list_agents()

# Get a workflow
workflow = bmad.get_workflow('create-product-brief')

# Run a workflow
async for step_result in bmad.run_workflow('create-product-brief', output_path):
    print(f"Step {step_result.step_number}: {step_result.status}")
```

## Architecture

```
BMADIntegration
    ├── CoreModuleLoader    → bmad-master
    ├── BMMModuleLoader     → PM, Architect, Dev, etc.
    ├── BMGDModuleLoader    → Game dev agents
    ├── CISModuleLoader     → Creative agents
    ├── BMBModuleLoader     → Builder agent
    └── Shared Services
        ├── TokenBudget     → <50K per session
        ├── DiskLRUCache    → Fast access
        ├── StepFileLoader  → JIT loading
        └── WorkflowParser  → YAML/MD support
```

Based on BMAD Full Integration Product Brief (2025-12-28)
"""

import asyncio
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from .modules.bmb_loader import BMBAgent, BMBModuleLoader
from .modules.bmgd_loader import BMGDAgent, BMGDAgentRole, BMGDModuleLoader, BMGDPhase
from .modules.bmm_loader import BMMAgent, BMMAgentRole, BMMModuleLoader, BMMPhase
from .modules.cis_loader import CISAgent, CISAgentRole, CISModuleLoader, CISWorkflowType
from .modules.core_loader import AgentPersona as CoreAgent

# Module loaders
from .modules.core_loader import CoreModuleLoader
from .shared.cache import CacheEntry, DiskLRUCache
from .shared.step_loader import StepContent, StepFileLoader, StepReference

# Shared services
from .shared.token_budget import TokenAllocation, TokenBudget, TokenCategory
from .shared.workflow_parser import ParsedWorkflow, WorkflowFormat, WorkflowParser


class ModuleType(Enum):
    """BMAD module types."""

    CORE = "core"
    BMM = "bmm"
    BMGD = "bmgd"
    CIS = "cis"
    BMB = "bmb"


def _get_attr(obj, attr: str, default=None):
    """Get attribute from dataclass or dict."""
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return getattr(obj, attr, default)


class ExecutionStatus(Enum):
    """Workflow execution status."""

    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class AgentInfo:
    """Unified agent information across all modules."""

    id: str
    name: str
    title: str
    role: str
    module: ModuleType
    icon: str = ""
    token_count: int = 0


@dataclass
class WorkflowInfo:
    """Unified workflow information."""

    id: str
    name: str
    module: ModuleType
    phase: str
    total_steps: int
    path: Path


@dataclass
class StepResult:
    """Result of executing a workflow step."""

    step_number: int
    goal: str
    status: ExecutionStatus
    output: str | None = None
    error: str | None = None
    tokens_used: int = 0


@dataclass
class WorkflowSession:
    """Active workflow execution session."""

    session_id: str
    workflow_id: str
    current_step: int
    total_steps: int
    status: ExecutionStatus
    output_path: Path
    started_at: float = 0
    checkpoint_path: Path | None = None


class BMADIntegration:
    """
    Main entry point for BMAD-METHOD integration.

    Provides unified access to all BMAD agents, workflows, and execution.
    """

    # Default BMAD-METHOD location
    DEFAULT_BMAD_PATH = Path.home() / "Desktop" / "BMAD-METHOD"

    # Default cache location
    DEFAULT_CACHE_DIR = Path.home() / ".bmad" / "cache"

    def __init__(
        self,
        bmad_path: Path | None = None,
        cache_dir: Path | None = None,
        token_budget: int = 50_000,
        enabled_modules: list[ModuleType] | None = None,
    ):
        """
        Initialize BMAD integration.

        Args:
            bmad_path: Path to BMAD-METHOD installation
            cache_dir: Path for cache storage
            token_budget: Maximum tokens per session (default 50K)
            enabled_modules: Which modules to load (default: all)
        """
        # Resolve paths
        self.bmad_path = Path(
            bmad_path or os.environ.get("BMAD_PATH", self.DEFAULT_BMAD_PATH)
        )
        self.cache_dir = Path(
            cache_dir or os.environ.get("BMAD_CACHE", self.DEFAULT_CACHE_DIR)
        )

        # Initialize token budget
        self.token_budget = TokenBudget(total_budget=token_budget)

        # Initialize cache
        self.cache = DiskLRUCache(
            cache_dir=self.cache_dir,
            default_ttl=3600,  # 1 hour
        )

        # Enabled modules (default: all)
        self.enabled_modules = set(enabled_modules or list(ModuleType))

        # Initialize module loaders
        self._loaders: dict[ModuleType, Any] = {}
        self._init_loaders()

        # Initialize shared services
        self.step_loader = StepFileLoader(
            bmad_root=self.bmad_path, cache=self.cache, token_budget=self.token_budget
        )

        self.workflow_parser = WorkflowParser(
            bmad_root=self.bmad_path, cache=self.cache, token_budget=self.token_budget
        )

        # Active sessions
        self._sessions: dict[str, WorkflowSession] = {}

    def _init_loaders(self) -> None:
        """Initialize module loaders."""
        if ModuleType.CORE in self.enabled_modules:
            self._loaders[ModuleType.CORE] = CoreModuleLoader(
                bmad_root=self.bmad_path,
                cache=self.cache,
                token_budget=self.token_budget,
            )

        if ModuleType.BMM in self.enabled_modules:
            self._loaders[ModuleType.BMM] = BMMModuleLoader(
                bmad_root=self.bmad_path,
                cache=self.cache,
                token_budget=self.token_budget,
            )

        if ModuleType.BMGD in self.enabled_modules:
            self._loaders[ModuleType.BMGD] = BMGDModuleLoader(
                bmad_root=self.bmad_path,
                cache=self.cache,
                token_budget=self.token_budget,
            )

        if ModuleType.CIS in self.enabled_modules:
            self._loaders[ModuleType.CIS] = CISModuleLoader(
                bmad_root=self.bmad_path,
                cache=self.cache,
                token_budget=self.token_budget,
            )

        if ModuleType.BMB in self.enabled_modules:
            self._loaders[ModuleType.BMB] = BMBModuleLoader(
                bmad_root=self.bmad_path,
                cache=self.cache,
                token_budget=self.token_budget,
            )

    def is_available(self) -> bool:
        """Check if BMAD-METHOD is available."""
        return self.bmad_path.exists()

    def get_status(self) -> dict[str, Any]:
        """Get integration status."""
        return {
            "available": self.is_available(),
            "bmad_path": str(self.bmad_path),
            "cache_dir": str(self.cache_dir),
            "token_budget": self.token_budget.get_status(),
            "cache_stats": self.cache.get_stats(),
            "enabled_modules": [m.value for m in self.enabled_modules],
            "modules_loaded": {
                m.value: loader.is_available()
                if hasattr(loader, "is_available")
                else False
                for m, loader in self._loaders.items()
            },
            "active_sessions": len(self._sessions),
        }

    # ==================== Agent Methods ====================

    def list_agents(self, module: ModuleType | None = None) -> list[AgentInfo]:
        """
        List all available agents.

        Args:
            module: Filter by module (optional)

        Returns:
            List of AgentInfo objects
        """
        agents = []

        if module is None or module == ModuleType.CORE:
            loader = self._loaders.get(ModuleType.CORE)
            if loader and loader.is_available():
                master = loader.get_master_agent()
                if master:
                    agents.append(
                        AgentInfo(
                            id=_get_attr(master, "id", "bmad-master"),
                            name=_get_attr(master, "name", "BMad Master"),
                            title=_get_attr(master, "title", ""),
                            role=_get_attr(master, "role", ""),
                            module=ModuleType.CORE,
                            icon=_get_attr(master, "icon", ""),
                            token_count=_get_attr(master, "token_count", 0),
                        )
                    )

        if module is None or module == ModuleType.BMM:
            loader = self._loaders.get(ModuleType.BMM)
            if loader and loader.is_available():
                for role in loader.list_agents():
                    agent = loader.get_agent(role)
                    if agent:
                        agents.append(
                            AgentInfo(
                                id=_get_attr(agent, "id", role.value),
                                name=_get_attr(agent, "name", ""),
                                title=_get_attr(agent, "title", ""),
                                role=role.value,
                                module=ModuleType.BMM,
                                icon=_get_attr(agent, "icon", ""),
                                token_count=_get_attr(agent, "token_count", 0),
                            )
                        )

        if module is None or module == ModuleType.BMGD:
            loader = self._loaders.get(ModuleType.BMGD)
            if loader and loader.is_available():
                for role in loader.list_agents():
                    agent = loader.get_agent(role)
                    if agent:
                        agents.append(
                            AgentInfo(
                                id=_get_attr(agent, "id", role.value),
                                name=_get_attr(agent, "name", ""),
                                title=_get_attr(agent, "title", ""),
                                role=role.value,
                                module=ModuleType.BMGD,
                                icon=_get_attr(agent, "icon", ""),
                                token_count=_get_attr(agent, "token_count", 0),
                            )
                        )

        if module is None or module == ModuleType.CIS:
            loader = self._loaders.get(ModuleType.CIS)
            if loader and loader.is_available():
                for role in loader.list_agents():
                    agent = loader.get_agent(role)
                    if agent:
                        agents.append(
                            AgentInfo(
                                id=_get_attr(agent, "id", role.value),
                                name=_get_attr(agent, "name", ""),
                                title=_get_attr(agent, "title", ""),
                                role=role.value,
                                module=ModuleType.CIS,
                                icon=_get_attr(agent, "icon", ""),
                                token_count=_get_attr(agent, "token_count", 0),
                            )
                        )

        if module is None or module == ModuleType.BMB:
            loader = self._loaders.get(ModuleType.BMB)
            if loader and loader.is_available():
                builder = loader.get_builder_agent()
                if builder:
                    agents.append(
                        AgentInfo(
                            id=_get_attr(builder, "id", "bmad-builder"),
                            name=_get_attr(builder, "name", "BMad Builder"),
                            title=_get_attr(builder, "title", ""),
                            role="bmad-builder",
                            module=ModuleType.BMB,
                            icon=_get_attr(builder, "icon", ""),
                            token_count=_get_attr(builder, "token_count", 0),
                        )
                    )

        return agents

    def get_agent_prompt(self, agent_id: str) -> str | None:
        """
        Get the system prompt for an agent.

        Args:
            agent_id: Agent identifier (e.g., 'pm', 'architect', 'game-designer')

        Returns:
            System prompt string or None
        """
        # Try each module
        for module_type, loader in self._loaders.items():
            if module_type == ModuleType.CORE:
                if agent_id in ("bmad-master", "master"):
                    return loader.get_master_prompt()
            elif module_type == ModuleType.BMM:
                try:
                    role = BMMAgentRole(agent_id)
                    return loader.get_agent_prompt(role)
                except ValueError:
                    pass
            elif module_type == ModuleType.BMGD:
                try:
                    role = BMGDAgentRole(agent_id)
                    agent = loader.get_agent(role)
                    if agent:
                        # Build prompt similar to BMM
                        principles_list = _get_attr(agent, "principles", [])
                        actions_list = _get_attr(agent, "critical_actions", [])
                        principles = "\n".join(f"- {p}" for p in principles_list)
                        actions = "\n".join(f"- {a}" for a in actions_list)
                        title = _get_attr(agent, "title", "")
                        identity = _get_attr(agent, "identity", "")
                        return f"# {title}\n\n{identity}\n\n## Principles\n{principles}\n\n## Actions\n{actions}"
                except ValueError:
                    pass
            elif module_type == ModuleType.CIS:
                try:
                    role = CISAgentRole(agent_id)
                    agent = loader.get_agent(role)
                    if agent:
                        principles_list = _get_attr(agent, "principles", [])
                        principles = "\n".join(f"- {p}" for p in principles_list)
                        title = _get_attr(agent, "title", "")
                        identity = _get_attr(agent, "identity", "")
                        return f"# {title}\n\n{identity}\n\n## Principles\n{principles}"
                except ValueError:
                    pass
            elif module_type == ModuleType.BMB:
                if agent_id in ("bmad-builder", "builder"):
                    builder = loader.get_builder_agent()
                    if builder:
                        principles_list = _get_attr(builder, "principles", [])
                        principles = "\n".join(f"- {p}" for p in principles_list)
                        title = _get_attr(builder, "title", "")
                        identity = _get_attr(builder, "identity", "")
                        return f"# {title}\n\n{identity}\n\n## Principles\n{principles}"

        return None

    # ==================== Workflow Methods ====================

    def list_workflows(self, module: ModuleType | None = None) -> list[WorkflowInfo]:
        """
        List all available workflows.

        Args:
            module: Filter by module (optional)

        Returns:
            List of WorkflowInfo objects
        """
        workflows = []

        for mod_type, loader in self._loaders.items():
            if module is not None and mod_type != module:
                continue

            if not loader.is_available():
                continue

            for wf_name in (
                loader.list_workflows() if hasattr(loader, "list_workflows") else []
            ):
                wf = (
                    loader.get_workflow(wf_name)
                    if hasattr(loader, "get_workflow")
                    else None
                )
                if wf:
                    workflows.append(
                        WorkflowInfo(
                            id=wf_name,
                            name=wf.name if hasattr(wf, "name") else wf_name,
                            module=mod_type,
                            phase=wf.phase.value
                            if hasattr(wf, "phase") and hasattr(wf.phase, "value")
                            else str(getattr(wf, "phase", "")),
                            total_steps=0,  # Would need to parse to get this
                            path=wf.path if hasattr(wf, "path") else Path(),
                        )
                    )

        return workflows

    def get_workflow(self, workflow_id: str) -> ParsedWorkflow | None:
        """
        Get a parsed workflow by ID.

        Args:
            workflow_id: Workflow identifier

        Returns:
            ParsedWorkflow or None
        """
        # Search all modules for the workflow
        for loader in self._loaders.values():
            if hasattr(loader, "get_workflow"):
                wf = loader.get_workflow(workflow_id)
                if wf and hasattr(wf, "path"):
                    return self.workflow_parser.parse(wf.path)

        # Try direct name search
        return self.workflow_parser.get_workflow_by_name(workflow_id)

    async def run_workflow(
        self,
        workflow_id: str,
        output_path: Path,
        resume_from: int | None = None,
        user_context: str | None = None,
    ) -> AsyncIterator[StepResult]:
        """
        Run a workflow with JIT step loading.

        Args:
            workflow_id: Workflow to execute
            output_path: Where to save outputs
            resume_from: Step number to resume from (optional)
            user_context: Additional context from user

        Yields:
            StepResult for each completed step
        """
        import time
        import uuid

        # Get workflow
        workflow = self.get_workflow(workflow_id)
        if not workflow:
            yield StepResult(
                step_number=0,
                goal="Load workflow",
                status=ExecutionStatus.FAILED,
                error=f"Workflow not found: {workflow_id}",
            )
            return

        # Create session
        session_id = str(uuid.uuid4())[:8]
        session = WorkflowSession(
            session_id=session_id,
            workflow_id=workflow_id,
            current_step=resume_from or 1,
            total_steps=workflow.total_steps,
            status=ExecutionStatus.RUNNING,
            output_path=Path(output_path),
            started_at=time.time(),
        )
        self._sessions[session_id] = session

        # Discover steps
        step_refs = self.step_loader.discover_steps(workflow.source_path)

        if not step_refs:
            yield StepResult(
                step_number=0,
                goal="Discover steps",
                status=ExecutionStatus.FAILED,
                error="No steps found in workflow",
            )
            return

        # Execute steps with JIT loading
        for step_ref in step_refs:
            if step_ref.step_number < session.current_step:
                continue  # Skip already completed steps

            # JIT load step content
            step_content = self.step_loader.load_step(step_ref)
            if not step_content:
                yield StepResult(
                    step_number=step_ref.step_number,
                    goal="Load step",
                    status=ExecutionStatus.FAILED,
                    error="Could not load step content (token budget exceeded?)",
                )
                session.status = ExecutionStatus.FAILED
                break

            # Execute step (in real implementation, this would run Claude)
            try:
                result = StepResult(
                    step_number=step_content.step_number,
                    goal=step_content.goal,
                    status=ExecutionStatus.COMPLETED,
                    output=f"Executed: {step_content.goal}",
                    tokens_used=step_content.token_count,
                )
                session.current_step = step_content.step_number + 1
                yield result

                # Unload step to free tokens
                self.step_loader.unload_step(step_ref)

            except Exception as e:
                yield StepResult(
                    step_number=step_content.step_number,
                    goal=step_content.goal,
                    status=ExecutionStatus.FAILED,
                    error=str(e),
                )
                session.status = ExecutionStatus.FAILED
                break

        # Mark complete if all steps done
        if session.current_step > session.total_steps:
            session.status = ExecutionStatus.COMPLETED

    def get_session(self, session_id: str) -> WorkflowSession | None:
        """Get an active session."""
        return self._sessions.get(session_id)

    def list_sessions(self) -> list[WorkflowSession]:
        """List all active sessions."""
        return list(self._sessions.values())

    # ==================== Cache Methods ====================

    def clear_cache(self) -> None:
        """Clear all cached content."""
        self.cache.clear()

    def cleanup_cache(self) -> int:
        """Remove expired cache entries."""
        return self.cache.cleanup_expired()

    # ==================== Token Methods ====================

    def get_token_status(self) -> dict:
        """Get current token budget status."""
        return self.token_budget.get_status()

    def reset_tokens(self) -> None:
        """Reset token usage counters."""
        self.token_budget.reset()


# Convenience exports
__all__ = [
    # Main class
    "BMADIntegration",
    # Enums
    "ModuleType",
    "ExecutionStatus",
    # Data classes
    "AgentInfo",
    "WorkflowInfo",
    "StepResult",
    "WorkflowSession",
    # Shared services
    "TokenBudget",
    "TokenCategory",
    "TokenAllocation",
    "DiskLRUCache",
    "CacheEntry",
    "StepFileLoader",
    "StepContent",
    "StepReference",
    "WorkflowParser",
    "ParsedWorkflow",
    "WorkflowFormat",
    # Module loaders
    "CoreModuleLoader",
    "BMMModuleLoader",
    "BMGDModuleLoader",
    "CISModuleLoader",
    "BMBModuleLoader",
    # Agent types
    "BMMAgentRole",
    "BMGDAgentRole",
    "CISAgentRole",
    # Phase types
    "BMMPhase",
    "BMGDPhase",
    "CISWorkflowType",
]
