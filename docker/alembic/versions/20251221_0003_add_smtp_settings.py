"""Add SMTP settings.

Revision ID: 20251221_0003
Revises: 20251221_0002
Create Date: 2025-12-21

Adds SMTP configuration fields to system_settings for email delivery.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add SMTP configuration columns to system_settings
    op.add_column('system_settings', sa.Column('smtp_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('system_settings', sa.Column('smtp_host', sa.String(255), nullable=True))
    op.add_column('system_settings', sa.Column('smtp_port', sa.Integer(), nullable=False, server_default=sa.text('587')))
    op.add_column('system_settings', sa.Column('smtp_username', sa.String(255), nullable=True))
    op.add_column('system_settings', sa.Column('smtp_password_encrypted', sa.Text(), nullable=True))
    op.add_column('system_settings', sa.Column('smtp_use_tls', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('system_settings', sa.Column('smtp_use_ssl', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('system_settings', sa.Column('smtp_from_email', sa.String(255), nullable=True))
    op.add_column('system_settings', sa.Column('smtp_from_name', sa.String(255), nullable=False, server_default=sa.text("'Auto-Claude'")))


def downgrade() -> None:
    # Remove SMTP columns
    op.drop_column('system_settings', 'smtp_from_name')
    op.drop_column('system_settings', 'smtp_from_email')
    op.drop_column('system_settings', 'smtp_use_ssl')
    op.drop_column('system_settings', 'smtp_use_tls')
    op.drop_column('system_settings', 'smtp_password_encrypted')
    op.drop_column('system_settings', 'smtp_username')
    op.drop_column('system_settings', 'smtp_port')
    op.drop_column('system_settings', 'smtp_host')
    op.drop_column('system_settings', 'smtp_enabled')
