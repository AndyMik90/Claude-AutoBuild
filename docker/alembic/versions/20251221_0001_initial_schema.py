"""Initial schema for multi-user Auto-Claude.

Revision ID: 0001
Revises: None
Create Date: 2025-12-21

Creates all core tables:
- users: User accounts with roles
- refresh_tokens: JWT refresh tokens (revocable)
- invitations: Invite codes for registration
- projects: User-owned projects
- project_agent_profiles: Per-project agent configuration
- project_credentials: Encrypted API keys per project
- system_settings: Global system settings
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("admin", "user", name="userrole"), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(), nullable=True),
    )

    # Create refresh_tokens table
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
    )

    # Create index for finding valid tokens
    op.create_index(
        "ix_refresh_tokens_user_valid",
        "refresh_tokens",
        ["user_id", "revoked_at"],
    )

    # Create invitations table
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(64), unique=True, nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("role", sa.Enum("admin", "user", name="userrole"), nullable=False, server_default="user"),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
    )

    # Create index for finding valid invitations
    op.create_index(
        "ix_invitations_code_valid",
        "invitations",
        ["code", "used_at"],
    )

    # Create projects table
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("status", sa.Enum("active", "building", "error", "archived", name="projectstatus"), nullable=False, server_default="active"),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_accessed", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("description", sa.Text(), nullable=True),
    )

    # Create indexes for projects
    op.create_index(
        "ix_projects_owner_status",
        "projects",
        ["owner_id", "status"],
    )
    op.create_index(
        "ix_projects_owner_accessed",
        "projects",
        ["owner_id", sa.text("last_accessed DESC")],
    )

    # Create project_agent_profiles table
    op.create_table(
        "project_agent_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("default_model", sa.String(100), nullable=False, server_default="claude-sonnet-4-20250514"),
        sa.Column("thinking_level", sa.String(50), nullable=False, server_default="high"),
        sa.Column("phase_models", postgresql.JSON(), nullable=True),
        sa.Column("default_complexity", sa.String(20), nullable=False, server_default="standard"),
        sa.Column("auto_detect_complexity", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("memory_backend", sa.Enum("file", "graphiti", "both", name="memorybackend"), nullable=False, server_default="file"),
        sa.Column("graphiti_config", postgresql.JSON(), nullable=True),
        sa.Column("default_branch", sa.String(100), nullable=False, server_default="main"),
        sa.Column("auto_commit", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("auto_push", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("max_parallel_subtasks", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("qa_strict_mode", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("recovery_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("custom_prompts", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Create project_credentials table
    op.create_table(
        "project_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("claude_oauth_token_encrypted", sa.Text(), nullable=True),
        sa.Column("anthropic_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("openai_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("github_token_encrypted", sa.Text(), nullable=True),
        sa.Column("linear_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("has_claude_oauth", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_anthropic_key", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_openai_key", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_github_token", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("has_linear_key", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Create system_settings table
    op.create_table(
        "system_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("setup_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("setup_completed_at", sa.DateTime(), nullable=True),
        sa.Column("registration_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("require_email_verification", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("invitation_expiry_hours", sa.Integer(), nullable=False, server_default="168"),
        sa.Column("default_agent_profile", postgresql.JSON(), nullable=True),
        sa.Column("graphiti_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("graphiti_config", postgresql.JSON(), nullable=True),
        sa.Column("default_theme", sa.String(20), nullable=False, server_default="system"),
        sa.Column("smtp_config", postgresql.JSON(), nullable=True),
        sa.Column("oidc_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("oidc_config", postgresql.JSON(), nullable=True),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("maintenance_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign keys)
    op.drop_table("system_settings")
    op.drop_table("project_credentials")
    op.drop_table("project_agent_profiles")
    op.drop_index("ix_projects_owner_accessed", table_name="projects")
    op.drop_index("ix_projects_owner_status", table_name="projects")
    op.drop_table("projects")
    op.drop_index("ix_invitations_code_valid", table_name="invitations")
    op.drop_table("invitations")
    op.drop_index("ix_refresh_tokens_user_valid", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("users")

    # Drop enum types
    op.execute("DROP TYPE memorybackend")
    op.execute("DROP TYPE projectstatus")
    op.execute("DROP TYPE userrole")
