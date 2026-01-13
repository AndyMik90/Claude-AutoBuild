"""Project-related database models."""

import enum
from datetime import datetime, timezone
from typing import Optional, Any
import uuid

from sqlalchemy import (
    String,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Text,
    Integer,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class ProjectStatus(str, enum.Enum):
    """Project status enum."""
    ACTIVE = "active"
    BUILDING = "building"
    ERROR = "error"
    ARCHIVED = "archived"


class MemoryBackend(str, enum.Enum):
    """Memory backend options."""
    FILE = "file"          # Default file-based memory
    GRAPHITI = "graphiti"  # Graph-based with FalkorDB
    BOTH = "both"          # Use both


class Project(Base):
    """Project model representing a cloned repository."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    repo_url: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="projectstatus", values_callable=lambda x: [e.value for e in x]),
        default=ProjectStatus.ACTIVE,
        nullable=False,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_accessed: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Relationships
    owner: Mapped["User"] = relationship(  # noqa: F821
        "User",
        back_populates="projects",
    )
    agent_profile: Mapped[Optional["ProjectAgentProfile"]] = relationship(
        "ProjectAgentProfile",
        back_populates="project",
        uselist=False,
        cascade="all, delete-orphan",
    )
    credentials: Mapped[Optional["ProjectCredentials"]] = relationship(
        "ProjectCredentials",
        back_populates="project",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Project {self.name} ({self.repo_url})>"


class ProjectAgentProfile(Base):
    """Per-project agent configuration.

    Defines how Auto-Claude agents behave for this project.
    """

    __tablename__ = "project_agent_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Agent model selection
    default_model: Mapped[str] = mapped_column(
        String(100),
        default="claude-sonnet-4-20250514",
        nullable=False,
    )
    thinking_level: Mapped[str] = mapped_column(
        String(50),
        default="high",
        nullable=False,
    )

    # Phase-specific models (JSON: {"planner": "model", "coder": "model", ...})
    phase_models: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # Complexity settings
    default_complexity: Mapped[str] = mapped_column(
        String(20),
        default="standard",
        nullable=False,
    )
    auto_detect_complexity: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # Memory backend
    memory_backend: Mapped[MemoryBackend] = mapped_column(
        Enum(MemoryBackend, name="memorybackend", values_callable=lambda x: [e.value for e in x]),
        default=MemoryBackend.FILE,
        nullable=False,
    )

    # Graphiti configuration (when memory_backend is GRAPHITI or BOTH)
    graphiti_config: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # Git settings
    default_branch: Mapped[str] = mapped_column(
        String(100),
        default="main",
        nullable=False,
    )
    auto_commit: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    auto_push: Mapped[bool] = mapped_column(
        Boolean,
        default=False,  # User controls when to push
        nullable=False,
    )

    # Agent behavior
    max_parallel_subtasks: Mapped[int] = mapped_column(
        Integer,
        default=3,
        nullable=False,
    )
    qa_strict_mode: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    recovery_attempts: Mapped[int] = mapped_column(
        Integer,
        default=3,
        nullable=False,
    )

    # Custom prompts (JSON: {"planner": "custom prompt", ...})
    custom_prompts: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="agent_profile",
    )

    def __repr__(self) -> str:
        return f"<ProjectAgentProfile project={self.project_id}>"


class ProjectCredentials(Base):
    """Encrypted credentials for a project.

    Stores API keys and tokens encrypted with Fernet.
    """

    __tablename__ = "project_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Encrypted credentials (stored as encrypted strings)
    claude_oauth_token_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    anthropic_api_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    openai_api_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    github_token_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    linear_api_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Additional API Keys (encrypted)
    voyage_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    google_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    azure_openai_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Flags to indicate if credentials are set (without exposing them)
    has_claude_oauth: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_anthropic_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_openai_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_github_token: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_linear_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_voyage_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_google_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_azure_openai_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="credentials",
    )

    def __repr__(self) -> str:
        return f"<ProjectCredentials project={self.project_id}>"


# Indexes
Index("ix_projects_owner_status", Project.owner_id, Project.status)
Index("ix_projects_owner_accessed", Project.owner_id, Project.last_accessed.desc())
