"""Pydantic models for Auto-Claude Docker Web UI."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
import uuid


class ProjectStatus(str, Enum):
    """Project status enum."""
    ACTIVE = "active"
    BUILDING = "building"
    ERROR = "error"


class SpecStatus(str, Enum):
    """Spec status enum."""
    DRAFT = "draft"
    READY = "ready"
    BUILDING = "building"
    COMPLETED = "completed"
    FAILED = "failed"
    MERGED = "merged"


class BuildStatus(str, Enum):
    """Build status enum."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProjectSettings(BaseModel):
    """Project-specific settings."""
    default_branch: str = "main"
    graphiti_enabled: bool = False
    custom_model: Optional[str] = None


class Project(BaseModel):
    """Project model representing a cloned repository."""
    model_config = ConfigDict(use_enum_values=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    repo_url: str
    path: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_accessed: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: ProjectStatus = ProjectStatus.ACTIVE
    settings: ProjectSettings = Field(default_factory=ProjectSettings)


class Spec(BaseModel):
    """Spec model representing a feature specification."""
    model_config = ConfigDict(use_enum_values=True)

    id: str
    name: str
    project_id: str
    status: SpecStatus = SpecStatus.DRAFT
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    description: Optional[str] = None
    has_implementation_plan: bool = False
    has_qa_report: bool = False


class Build(BaseModel):
    """Build model representing a spec build execution."""
    model_config = ConfigDict(use_enum_values=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    spec_id: str
    status: BuildStatus = BuildStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    log_file: Optional[str] = None


class ProjectCreate(BaseModel):
    """Request model for creating a project."""
    repo_url: str
    name: Optional[str] = None


class SpecCreate(BaseModel):
    """Request model for creating a spec."""
    task: str
    complexity: Optional[str] = None  # simple, standard, complex


class SystemHealth(BaseModel):
    """System health status."""
    status: str
    claude_auth: bool
    github_auth: bool
    graphiti_enabled: bool
    graphiti_connected: bool = False
    projects_count: int = 0
    active_builds: int = 0
