"""Add OIDC/SSO support.

Revision ID: 0004
Revises: 0003
Create Date: 2025-12-21

Adds OIDC configuration fields to system_settings and
OIDC-related fields to users table.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add OIDC configuration columns to system_settings
    op.add_column('system_settings', sa.Column(
        'oidc_provider_name',
        sa.String(100),
        nullable=False,
        server_default='SSO'
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_discovery_url',
        sa.String(500),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_client_id',
        sa.String(255),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_client_secret_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_scopes',
        sa.String(255),
        nullable=False,
        server_default='openid email profile'
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_auto_provision',
        sa.Boolean(),
        nullable=False,
        server_default='true'
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_default_role',
        sa.String(20),
        nullable=False,
        server_default='user'
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_disable_password_auth',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_email_claim',
        sa.String(100),
        nullable=False,
        server_default='email'
    ))
    op.add_column('system_settings', sa.Column(
        'oidc_username_claim',
        sa.String(100),
        nullable=False,
        server_default='preferred_username'
    ))

    # Add OIDC fields to users table
    op.add_column('users', sa.Column(
        'oidc_subject',
        sa.String(255),
        nullable=True
    ))
    op.add_column('users', sa.Column(
        'oidc_provider',
        sa.String(100),
        nullable=True
    ))
    op.add_column('users', sa.Column(
        'auth_method',
        sa.String(20),
        nullable=False,
        server_default='password'
    ))

    # Create unique index on oidc_subject
    op.create_index(
        'ix_users_oidc_subject',
        'users',
        ['oidc_subject'],
        unique=True
    )

    # Make password_hash nullable for OIDC users
    op.alter_column(
        'users',
        'password_hash',
        existing_type=sa.String(255),
        nullable=True
    )


def downgrade() -> None:
    # Make password_hash non-nullable again
    # Note: This will fail if there are OIDC users without passwords
    op.alter_column(
        'users',
        'password_hash',
        existing_type=sa.String(255),
        nullable=False
    )

    # Drop index
    op.drop_index('ix_users_oidc_subject', table_name='users')

    # Remove user OIDC columns
    op.drop_column('users', 'auth_method')
    op.drop_column('users', 'oidc_provider')
    op.drop_column('users', 'oidc_subject')

    # Remove system_settings OIDC columns
    op.drop_column('system_settings', 'oidc_username_claim')
    op.drop_column('system_settings', 'oidc_email_claim')
    op.drop_column('system_settings', 'oidc_disable_password_auth')
    op.drop_column('system_settings', 'oidc_default_role')
    op.drop_column('system_settings', 'oidc_auto_provision')
    op.drop_column('system_settings', 'oidc_scopes')
    op.drop_column('system_settings', 'oidc_client_secret_encrypted')
    op.drop_column('system_settings', 'oidc_client_id')
    op.drop_column('system_settings', 'oidc_discovery_url')
    op.drop_column('system_settings', 'oidc_provider_name')
