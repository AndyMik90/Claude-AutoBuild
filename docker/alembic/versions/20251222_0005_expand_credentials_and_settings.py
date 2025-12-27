"""Expand credentials and settings across all tiers.

Revision ID: 0005
Revises: 0004
Create Date: 2025-12-22

Adds:
- Additional API keys (Voyage, Google, Azure OpenAI) to all credential tables
- Graphiti configuration fields to system_settings
- Azure OpenAI, Ollama, Linear, and Electron MCP settings to system_settings
- User default settings (Graphiti providers, default branch) to user_credentials
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==========================================================================
    # SYSTEM_SETTINGS: Additional Global API Keys
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'global_voyage_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'global_google_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'global_azure_openai_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'has_global_voyage_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('system_settings', sa.Column(
        'has_global_google_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('system_settings', sa.Column(
        'has_global_azure_openai_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))

    # ==========================================================================
    # SYSTEM_SETTINGS: Graphiti Global Configuration
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'graphiti_llm_provider',
        sa.String(50),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'graphiti_embedder_provider',
        sa.String(50),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'graphiti_model_name',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'graphiti_embedding_model',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'graphiti_anthropic_model',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'graphiti_database',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'voyage_embedding_model',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'google_llm_model',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'google_embedding_model',
        sa.String(100),
        nullable=True
    ))

    # ==========================================================================
    # SYSTEM_SETTINGS: Azure OpenAI Configuration
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'azure_openai_base_url',
        sa.Text(),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'azure_openai_llm_deployment',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'azure_openai_embedding_deployment',
        sa.String(100),
        nullable=True
    ))

    # ==========================================================================
    # SYSTEM_SETTINGS: Ollama Configuration
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'ollama_base_url',
        sa.String(255),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'ollama_llm_model',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'ollama_embedding_model',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'ollama_embedding_dim',
        sa.Integer(),
        nullable=True
    ))

    # ==========================================================================
    # SYSTEM_SETTINGS: Linear Integration
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'linear_team_id',
        sa.String(100),
        nullable=True
    ))
    op.add_column('system_settings', sa.Column(
        'linear_project_id',
        sa.String(100),
        nullable=True
    ))

    # ==========================================================================
    # SYSTEM_SETTINGS: General Settings
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'default_branch',
        sa.String(100),
        nullable=False,
        server_default='main'
    ))
    op.add_column('system_settings', sa.Column(
        'debug_mode',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('system_settings', sa.Column(
        'auto_build_model',
        sa.String(100),
        nullable=True
    ))

    # ==========================================================================
    # SYSTEM_SETTINGS: Electron MCP Configuration
    # ==========================================================================
    op.add_column('system_settings', sa.Column(
        'electron_mcp_enabled',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('system_settings', sa.Column(
        'electron_debug_port',
        sa.Integer(),
        nullable=False,
        server_default='9222'
    ))

    # ==========================================================================
    # USER_CREDENTIALS: Additional API Keys
    # ==========================================================================
    op.add_column('user_credentials', sa.Column(
        'voyage_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('user_credentials', sa.Column(
        'google_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('user_credentials', sa.Column(
        'azure_openai_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('user_credentials', sa.Column(
        'has_voyage_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('user_credentials', sa.Column(
        'has_google_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('user_credentials', sa.Column(
        'has_azure_openai_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))

    # ==========================================================================
    # USER_CREDENTIALS: User Default Settings
    # ==========================================================================
    op.add_column('user_credentials', sa.Column(
        'default_graphiti_llm_provider',
        sa.String(50),
        nullable=True
    ))
    op.add_column('user_credentials', sa.Column(
        'default_graphiti_embedder_provider',
        sa.String(50),
        nullable=True
    ))
    op.add_column('user_credentials', sa.Column(
        'default_branch',
        sa.String(100),
        nullable=True
    ))

    # ==========================================================================
    # PROJECT_CREDENTIALS: Additional API Keys
    # ==========================================================================
    op.add_column('project_credentials', sa.Column(
        'voyage_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('project_credentials', sa.Column(
        'google_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('project_credentials', sa.Column(
        'azure_openai_key_encrypted',
        sa.Text(),
        nullable=True
    ))
    op.add_column('project_credentials', sa.Column(
        'has_voyage_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('project_credentials', sa.Column(
        'has_google_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))
    op.add_column('project_credentials', sa.Column(
        'has_azure_openai_key',
        sa.Boolean(),
        nullable=False,
        server_default='false'
    ))


def downgrade() -> None:
    # ==========================================================================
    # PROJECT_CREDENTIALS: Remove Additional API Keys
    # ==========================================================================
    op.drop_column('project_credentials', 'has_azure_openai_key')
    op.drop_column('project_credentials', 'has_google_key')
    op.drop_column('project_credentials', 'has_voyage_key')
    op.drop_column('project_credentials', 'azure_openai_key_encrypted')
    op.drop_column('project_credentials', 'google_key_encrypted')
    op.drop_column('project_credentials', 'voyage_key_encrypted')

    # ==========================================================================
    # USER_CREDENTIALS: Remove User Default Settings
    # ==========================================================================
    op.drop_column('user_credentials', 'default_branch')
    op.drop_column('user_credentials', 'default_graphiti_embedder_provider')
    op.drop_column('user_credentials', 'default_graphiti_llm_provider')

    # ==========================================================================
    # USER_CREDENTIALS: Remove Additional API Keys
    # ==========================================================================
    op.drop_column('user_credentials', 'has_azure_openai_key')
    op.drop_column('user_credentials', 'has_google_key')
    op.drop_column('user_credentials', 'has_voyage_key')
    op.drop_column('user_credentials', 'azure_openai_key_encrypted')
    op.drop_column('user_credentials', 'google_key_encrypted')
    op.drop_column('user_credentials', 'voyage_key_encrypted')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove Electron MCP Configuration
    # ==========================================================================
    op.drop_column('system_settings', 'electron_debug_port')
    op.drop_column('system_settings', 'electron_mcp_enabled')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove General Settings
    # ==========================================================================
    op.drop_column('system_settings', 'auto_build_model')
    op.drop_column('system_settings', 'debug_mode')
    op.drop_column('system_settings', 'default_branch')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove Linear Integration
    # ==========================================================================
    op.drop_column('system_settings', 'linear_project_id')
    op.drop_column('system_settings', 'linear_team_id')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove Ollama Configuration
    # ==========================================================================
    op.drop_column('system_settings', 'ollama_embedding_dim')
    op.drop_column('system_settings', 'ollama_embedding_model')
    op.drop_column('system_settings', 'ollama_llm_model')
    op.drop_column('system_settings', 'ollama_base_url')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove Azure OpenAI Configuration
    # ==========================================================================
    op.drop_column('system_settings', 'azure_openai_embedding_deployment')
    op.drop_column('system_settings', 'azure_openai_llm_deployment')
    op.drop_column('system_settings', 'azure_openai_base_url')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove Graphiti Configuration
    # ==========================================================================
    op.drop_column('system_settings', 'google_embedding_model')
    op.drop_column('system_settings', 'google_llm_model')
    op.drop_column('system_settings', 'voyage_embedding_model')
    op.drop_column('system_settings', 'graphiti_database')
    op.drop_column('system_settings', 'graphiti_anthropic_model')
    op.drop_column('system_settings', 'graphiti_embedding_model')
    op.drop_column('system_settings', 'graphiti_model_name')
    op.drop_column('system_settings', 'graphiti_embedder_provider')
    op.drop_column('system_settings', 'graphiti_llm_provider')

    # ==========================================================================
    # SYSTEM_SETTINGS: Remove Additional Global API Keys
    # ==========================================================================
    op.drop_column('system_settings', 'has_global_azure_openai_key')
    op.drop_column('system_settings', 'has_global_google_key')
    op.drop_column('system_settings', 'has_global_voyage_key')
    op.drop_column('system_settings', 'global_azure_openai_key_encrypted')
    op.drop_column('system_settings', 'global_google_key_encrypted')
    op.drop_column('system_settings', 'global_voyage_key_encrypted')
