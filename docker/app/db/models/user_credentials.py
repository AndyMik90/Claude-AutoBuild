"""User credentials database model.

Stores encrypted API credentials at the user level for credential hierarchy:
Global → User → Project
"""

from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class UserCredentials(Base):
    """Encrypted credentials for a user.

    User-level credentials that apply to all of the user's projects
    unless overridden at the project level.

    Credential hierarchy (lowest to highest priority):
    1. Global (SystemSettings) - Admin-set, applies to all users
    2. User (UserCredentials) - User's default for all their projects
    3. Project (ProjectCredentials) - Project-specific overrides
    """

    __tablename__ = "user_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Encrypted credentials (stored as encrypted strings via Fernet)
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

    # ==========================================================================
    # Additional API Keys (Encrypted)
    # ==========================================================================

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

    # ==========================================================================
    # User Default Settings (Non-Secret)
    # ==========================================================================

    # Default Graphiti provider preferences
    default_graphiti_llm_provider: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )  # openai, anthropic, azure_openai, ollama, google
    default_graphiti_embedder_provider: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )  # openai, voyage, azure_openai, ollama, google

    # Git settings
    default_branch: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # User's preferred default branch

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
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        back_populates="credentials",
    )

    def __repr__(self) -> str:
        return f"<UserCredentials user={self.user_id}>"
