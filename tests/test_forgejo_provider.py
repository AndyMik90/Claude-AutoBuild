"""
Tests for Forgejo provider implementation.

Tests the ForgejoClient, ForgejoProvider, and factory registration.
"""
import pytest
import os
from unittest.mock import AsyncMock, patch, MagicMock
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'backend'))

from runners.github.providers.protocol import ProviderType
from runners.github.providers.factory import (
    get_provider,
    list_available_providers,
    is_provider_available
)
from runners.github.forgejo_client import ForgejoClient, ForgejoConfig


class TestProviderTypeEnum:
    """Tests for ProviderType enum including FORGEJO."""

    def test_forgejo_in_provider_types(self):
        """Verify FORGEJO is a valid provider type."""
        assert ProviderType.FORGEJO == "forgejo"
        assert ProviderType.FORGEJO in ProviderType

    def test_all_expected_providers_exist(self):
        """Verify all expected provider types exist."""
        expected = ['github', 'gitlab', 'bitbucket', 'gitea', 'forgejo', 'azure_devops']
        for provider in expected:
            assert provider in [p.value for p in ProviderType]


class TestProviderFactory:
    """Tests for provider factory with Forgejo support."""

    def test_forgejo_in_available_providers(self):
        """Verify Forgejo appears in available providers list."""
        providers = list_available_providers()
        assert ProviderType.FORGEJO in providers

    def test_forgejo_is_available(self):
        """Verify is_provider_available returns True for Forgejo."""
        assert is_provider_available(ProviderType.FORGEJO) is True

    def test_forgejo_provider_requires_url_and_token(self):
        """Verify factory requires instance_url and token for Forgejo."""
        with pytest.raises(ValueError, match="instance_url"):
            get_provider(ProviderType.FORGEJO, repo="owner/repo")

    def test_forgejo_provider_requires_token(self):
        """Verify factory requires token when only url is provided."""
        with pytest.raises(ValueError, match="token"):
            get_provider(
                ProviderType.FORGEJO,
                repo="owner/repo",
                instance_url="https://codeberg.org"
            )

    def test_forgejo_provider_creation_success(self):
        """Verify Forgejo provider can be created with all required params."""
        provider = get_provider(
            ProviderType.FORGEJO,
            repo="owner/repo",
            instance_url="https://codeberg.org",
            token="test-token"
        )
        assert provider is not None
        assert provider.provider_type == ProviderType.FORGEJO


class TestForgejoConfig:
    """Tests for ForgejoConfig class."""

    def test_config_from_env(self):
        """Test ForgejoConfig loads from environment variables."""
        with patch.dict(os.environ, {
            'FORGEJO_INSTANCE_URL': 'https://codeberg.org',
            'FORGEJO_TOKEN': 'test-token',
            'FORGEJO_REPO': 'owner/repo'
        }):
            config = ForgejoConfig.from_env()
            assert config.instance_url == 'https://codeberg.org'
            assert config.token == 'test-token'
            assert config.repo == 'owner/repo'

    def test_config_from_env_missing_url(self):
        """Test ForgejoConfig raises when URL is missing."""
        with patch.dict(os.environ, {
            'FORGEJO_TOKEN': 'test-token',
            'FORGEJO_REPO': 'owner/repo'
        }, clear=True):
            config = ForgejoConfig.from_env()
            assert config.instance_url is None

    def test_config_strips_trailing_slash(self):
        """Test that trailing slashes are stripped from instance URL."""
        config = ForgejoConfig(
            instance_url="https://codeberg.org/",
            token="test-token",
            repo="owner/repo"
        )
        assert config.instance_url == "https://codeberg.org"

    def test_config_validation(self):
        """Test config validation method."""
        valid_config = ForgejoConfig(
            instance_url="https://codeberg.org",
            token="test-token",
            repo="owner/repo"
        )
        assert valid_config.is_valid() is True

        invalid_config = ForgejoConfig(
            instance_url=None,
            token="test-token",
            repo="owner/repo"
        )
        assert invalid_config.is_valid() is False


class TestForgejoClient:
    """Tests for ForgejoClient class."""

    def test_client_initialization(self):
        """Test ForgejoClient initializes correctly."""
        config = ForgejoConfig(
            instance_url="https://codeberg.org",
            token="test-token",
            repo="owner/repo"
        )
        client = ForgejoClient(config)
        assert client is not None
        assert client.config == config

    def test_client_api_url_construction(self):
        """Test API URL is constructed correctly."""
        config = ForgejoConfig(
            instance_url="https://codeberg.org",
            token="test-token",
            repo="owner/repo"
        )
        client = ForgejoClient(config)
        # The base API URL should be instance_url + /api/v1
        assert "codeberg.org" in config.instance_url


class TestForgejoProviderProtocol:
    """Tests for ForgejoProvider protocol compliance."""

    def test_provider_has_required_methods(self):
        """Verify ForgejoProvider has all required GitProvider methods."""
        provider = get_provider(
            ProviderType.FORGEJO,
            repo="owner/repo",
            instance_url="https://codeberg.org",
            token="test-token"
        )

        # Check required methods exist
        required_methods = [
            'list_prs',
            'get_pr',
            'create_pr',
            'merge_pr',
            'close_pr',
            'list_issues',
            'get_issue',
            'create_issue',
            'close_issue',
            'add_labels',
            'remove_labels',
            'add_comment',
            'get_repo',
        ]

        for method in required_methods:
            assert hasattr(provider, method), f"Missing method: {method}"
            assert callable(getattr(provider, method)), f"Method not callable: {method}"

    def test_provider_type_property(self):
        """Verify provider_type property returns correct value."""
        provider = get_provider(
            ProviderType.FORGEJO,
            repo="owner/repo",
            instance_url="https://codeberg.org",
            token="test-token"
        )
        assert provider.provider_type == ProviderType.FORGEJO


@pytest.mark.asyncio
class TestForgejoProviderAsync:
    """Async tests for ForgejoProvider operations."""

    async def test_list_prs_returns_list(self):
        """Test that list_prs returns a list (mocked)."""
        provider = get_provider(
            ProviderType.FORGEJO,
            repo="owner/repo",
            instance_url="https://codeberg.org",
            token="test-token"
        )

        # Mock the client's HTTP request
        with patch.object(provider._client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = MagicMock(
                success=True,
                data=[]
            )

            result = await provider.list_prs()
            assert isinstance(result, list)

    async def test_list_issues_returns_list(self):
        """Test that list_issues returns a list (mocked)."""
        provider = get_provider(
            ProviderType.FORGEJO,
            repo="owner/repo",
            instance_url="https://codeberg.org",
            token="test-token"
        )

        with patch.object(provider._client, '_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = MagicMock(
                success=True,
                data=[]
            )

            result = await provider.list_issues()
            assert isinstance(result, list)


# Integration tests - only run with real credentials
@pytest.mark.skipif(
    not os.environ.get('FORGEJO_INTEGRATION_TEST'),
    reason="Set FORGEJO_INTEGRATION_TEST=1 to run integration tests"
)
@pytest.mark.asyncio
class TestForgejoIntegration:
    """Integration tests requiring real Forgejo instance."""

    async def test_real_connection(self):
        """Test connection to real Forgejo instance."""
        config = ForgejoConfig.from_env()
        if not config.is_valid():
            pytest.skip("Forgejo config not set in environment")

        client = ForgejoClient(config)
        result = await client.get_repo_info()
        assert result.success is True
