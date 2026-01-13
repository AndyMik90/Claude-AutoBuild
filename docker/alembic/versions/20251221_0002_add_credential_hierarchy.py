"""Add credential hierarchy support.

Revision ID: 20251221_0002
Revises: 20251221_0001
Create Date: 2025-12-21

Adds:
- user_credentials table for user-level credentials
- Global credential columns to system_settings
- Control flags for credential hierarchy
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_credentials table
    op.create_table(
        'user_credentials',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False, index=True),
        sa.Column('claude_oauth_token_encrypted', sa.Text(), nullable=True),
        sa.Column('anthropic_api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('openai_api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('github_token_encrypted', sa.Text(), nullable=True),
        sa.Column('linear_api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('has_claude_oauth', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_anthropic_key', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_openai_key', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_github_token', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_linear_key', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Add global credential columns to system_settings
    op.add_column('system_settings', sa.Column('global_claude_oauth_encrypted', sa.Text(), nullable=True))
    op.add_column('system_settings', sa.Column('global_anthropic_key_encrypted', sa.Text(), nullable=True))
    op.add_column('system_settings', sa.Column('global_openai_key_encrypted', sa.Text(), nullable=True))
    op.add_column('system_settings', sa.Column('global_github_token_encrypted', sa.Text(), nullable=True))
    op.add_column('system_settings', sa.Column('global_linear_key_encrypted', sa.Text(), nullable=True))

    # Add global credential status flags
    op.add_column('system_settings', sa.Column('has_global_claude_oauth', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('has_global_anthropic_key', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('has_global_openai_key', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('has_global_github_token', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('has_global_linear_key', sa.Boolean(), nullable=False, server_default='false'))

    # Add control flags for credential hierarchy
    op.add_column('system_settings', sa.Column('credentials_locked', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('allow_user_credentials', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    # Remove control flags
    op.drop_column('system_settings', 'allow_user_credentials')
    op.drop_column('system_settings', 'credentials_locked')

    # Remove global credential status flags
    op.drop_column('system_settings', 'has_global_linear_key')
    op.drop_column('system_settings', 'has_global_github_token')
    op.drop_column('system_settings', 'has_global_openai_key')
    op.drop_column('system_settings', 'has_global_anthropic_key')
    op.drop_column('system_settings', 'has_global_claude_oauth')

    # Remove global credential columns
    op.drop_column('system_settings', 'global_linear_key_encrypted')
    op.drop_column('system_settings', 'global_github_token_encrypted')
    op.drop_column('system_settings', 'global_openai_key_encrypted')
    op.drop_column('system_settings', 'global_anthropic_key_encrypted')
    op.drop_column('system_settings', 'global_claude_oauth_encrypted')

    # Drop user_credentials table
    op.drop_table('user_credentials')
