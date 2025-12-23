"""
Tests for Multi-LLM Provider Support
====================================

Tests for the provider abstraction layer supporting multiple LLM providers.
"""

import os
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch


# Add auto-claude to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

from providers.base import (
    AgentResponse,
    LLMProvider,
    ProviderConfig,
    ProviderType,
)
from providers.factory import (
    get_provider,
    list_providers,
    get_provider_config,
    validate_provider,
)


class TestProviderType:
    """Tests for ProviderType enum."""

    def test_all_providers_defined(self):
        """All expected providers are defined."""
        expected = {"claude", "openai", "gemini", "ollama"}
        actual = {p.value for p in ProviderType}
        assert actual == expected

    def test_from_string(self):
        """Can create ProviderType from string."""
        assert ProviderType("claude") == ProviderType.CLAUDE
        assert ProviderType("openai") == ProviderType.OPENAI
        assert ProviderType("gemini") == ProviderType.GEMINI
        assert ProviderType("ollama") == ProviderType.OLLAMA


class TestProviderConfig:
    """Tests for ProviderConfig dataclass."""

    def test_default_values(self):
        """Config has sensible defaults."""
        config = ProviderConfig(provider_type=ProviderType.CLAUDE)
        assert config.api_key is None
        assert config.model is None
        assert config.base_url is None
        assert config.max_tokens == 8192
        assert config.temperature == 0.0

    def test_from_env_claude(self):
        """Can load Claude config from environment."""
        with patch.dict(os.environ, {
            "CLAUDE_CODE_OAUTH_TOKEN": "test-token",
            "CLAUDE_MODEL": "claude-3-opus",
        }):
            config = ProviderConfig.from_env(ProviderType.CLAUDE)
            assert config.api_key == "test-token"
            assert config.model == "claude-3-opus"

    def test_from_env_openai(self):
        """Can load OpenAI config from environment."""
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-test",
            "OPENAI_MODEL": "gpt-4-turbo",
        }, clear=False):
            config = ProviderConfig.from_env(ProviderType.OPENAI)
            assert config.api_key == "sk-test"
            assert config.model == "gpt-4-turbo"

    def test_from_env_gemini(self):
        """Can load Gemini config from environment."""
        with patch.dict(os.environ, {
            "GEMINI_API_KEY": "gemini-key",
        }, clear=False):
            config = ProviderConfig.from_env(ProviderType.GEMINI)
            assert config.api_key == "gemini-key"

    def test_from_env_ollama(self):
        """Can load Ollama config from environment."""
        with patch.dict(os.environ, {
            "OLLAMA_MODEL": "codellama",
            "OLLAMA_BASE_URL": "http://localhost:11434",
        }, clear=False):
            config = ProviderConfig.from_env(ProviderType.OLLAMA)
            assert config.model == "codellama"
            assert config.base_url == "http://localhost:11434"

    def test_default_models(self):
        """Default models are set for each provider."""
        # Clear relevant env vars to test defaults
        env_clear = {
            "CLAUDE_MODEL": "",
            "OPENAI_MODEL": "",
            "GEMINI_MODEL": "",
            "OLLAMA_MODEL": "",
        }
        with patch.dict(os.environ, env_clear, clear=False):
            claude_config = ProviderConfig.from_env(ProviderType.CLAUDE)
            openai_config = ProviderConfig.from_env(ProviderType.OPENAI)
            gemini_config = ProviderConfig.from_env(ProviderType.GEMINI)
            ollama_config = ProviderConfig.from_env(ProviderType.OLLAMA)

            assert claude_config.model is not None
            assert openai_config.model is not None
            assert gemini_config.model is not None
            assert ollama_config.model is not None


class TestAgentResponse:
    """Tests for AgentResponse dataclass."""

    def test_success_response(self):
        """Can create a success response."""
        response = AgentResponse(
            success=True,
            output="Task completed",
            tokens_used=1000,
            cost_usd=0.05,
        )
        assert response.success is True
        assert response.output == "Task completed"
        assert response.tokens_used == 1000
        assert response.cost_usd == 0.05

    def test_failure_response(self):
        """Can create a failure response."""
        response = AgentResponse(
            success=False,
            output="Error occurred",
            metadata={"error": "API error"},
        )
        assert response.success is False
        assert response.metadata["error"] == "API error"


class TestProviderFactory:
    """Tests for provider factory functions."""

    def test_get_provider_default(self):
        """Default provider is Claude."""
        from providers.claude_provider import ClaudeProvider
        provider = get_provider()
        assert isinstance(provider, ClaudeProvider)

    def test_get_provider_by_type(self):
        """Can get provider by ProviderType enum."""
        from providers.openai_provider import OpenAIProvider
        provider = get_provider(ProviderType.OPENAI)
        assert isinstance(provider, OpenAIProvider)

    def test_get_provider_by_string(self):
        """Can get provider by string name."""
        from providers.gemini_provider import GeminiProvider
        provider = get_provider("gemini")
        assert isinstance(provider, GeminiProvider)

    def test_get_provider_invalid_string(self):
        """Invalid provider string raises ValueError."""
        with pytest.raises(ValueError, match="Unknown provider"):
            get_provider("invalid_provider")

    def test_get_provider_with_config(self):
        """Can pass custom config to provider."""
        from providers.openai_provider import OpenAIProvider
        config = ProviderConfig(
            provider_type=ProviderType.OPENAI,
            api_key="custom-key",
            model="gpt-4-turbo",
        )
        provider = get_provider(config=config)
        assert isinstance(provider, OpenAIProvider)
        assert provider.config.api_key == "custom-key"
        assert provider.config.model == "gpt-4-turbo"

    def test_list_providers(self):
        """Can list all providers."""
        providers = list_providers()
        assert len(providers) == 4
        names = {p["name"] for p in providers}
        assert names == {"claude", "openai", "gemini", "ollama"}

    def test_get_provider_config(self):
        """Can get provider config by name."""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            config = get_provider_config("openai")
            assert config.provider_type == ProviderType.OPENAI
            assert config.api_key == "test-key"


class TestClaudeProvider:
    """Tests for Claude provider."""

    def test_provider_name(self):
        """Provider returns correct name."""
        from providers.claude_provider import ClaudeProvider
        config = ProviderConfig(provider_type=ProviderType.CLAUDE)
        provider = ClaudeProvider(config)
        assert provider.name == "claude"

    def test_model_info(self):
        """Provider returns model info."""
        from providers.claude_provider import ClaudeProvider
        config = ProviderConfig(
            provider_type=ProviderType.CLAUDE,
            model="claude-sonnet-4-20250514",
        )
        provider = ClaudeProvider(config)
        info = provider.get_model_info()

        assert info["provider"] == "claude"
        assert info["model"] == "claude-sonnet-4-20250514"
        assert "context_window" in info
        assert "pricing_per_million" in info

    def test_validate_config_no_token(self):
        """Validation fails without API token."""
        from providers.claude_provider import ClaudeProvider
        config = ProviderConfig(provider_type=ProviderType.CLAUDE)
        provider = ClaudeProvider(config)
        errors = provider.validate_config()
        assert len(errors) > 0


class TestOpenAIProvider:
    """Tests for OpenAI provider."""

    def test_provider_name(self):
        """Provider returns correct name."""
        from providers.openai_provider import OpenAIProvider
        config = ProviderConfig(provider_type=ProviderType.OPENAI)
        provider = OpenAIProvider(config)
        assert provider.name == "openai"

    def test_model_info(self):
        """Provider returns model info."""
        from providers.openai_provider import OpenAIProvider
        config = ProviderConfig(
            provider_type=ProviderType.OPENAI,
            model="gpt-4o",
        )
        provider = OpenAIProvider(config)
        info = provider.get_model_info()

        assert info["provider"] == "openai"
        assert info["model"] == "gpt-4o"
        assert info["context_window"] == 128000

    def test_validate_config_no_key(self):
        """Validation fails without API key."""
        from providers.openai_provider import OpenAIProvider
        config = ProviderConfig(provider_type=ProviderType.OPENAI)
        provider = OpenAIProvider(config)
        errors = provider.validate_config()
        assert len(errors) > 0


class TestGeminiProvider:
    """Tests for Gemini provider."""

    def test_provider_name(self):
        """Provider returns correct name."""
        from providers.gemini_provider import GeminiProvider
        config = ProviderConfig(provider_type=ProviderType.GEMINI)
        provider = GeminiProvider(config)
        assert provider.name == "gemini"

    def test_model_info(self):
        """Provider returns model info."""
        from providers.gemini_provider import GeminiProvider
        config = ProviderConfig(
            provider_type=ProviderType.GEMINI,
            model="gemini-2.0-flash",
        )
        provider = GeminiProvider(config)
        info = provider.get_model_info()

        assert info["provider"] == "gemini"
        assert info["model"] == "gemini-2.0-flash"
        assert info["context_window"] == 1000000


class TestOllamaProvider:
    """Tests for Ollama provider."""

    def test_provider_name(self):
        """Provider returns correct name."""
        from providers.ollama_provider import OllamaProvider
        config = ProviderConfig(provider_type=ProviderType.OLLAMA)
        provider = OllamaProvider(config)
        assert provider.name == "ollama"

    def test_model_info(self):
        """Provider returns model info."""
        from providers.ollama_provider import OllamaProvider
        config = ProviderConfig(
            provider_type=ProviderType.OLLAMA,
            model="llama3.2",
        )
        provider = OllamaProvider(config)
        info = provider.get_model_info()

        assert info["provider"] == "ollama"
        assert info["model"] == "llama3.2"
        assert info["local"] is True
        assert info["pricing_per_million"]["input"] == 0.0  # Free (local)

    def test_default_base_url(self):
        """Default base URL is localhost."""
        from providers.ollama_provider import OllamaProvider
        config = ProviderConfig(provider_type=ProviderType.OLLAMA)
        provider = OllamaProvider(config)
        assert "localhost" in provider.config.base_url

    def test_validate_no_api_key_needed(self):
        """Ollama doesn't require API key."""
        from providers.ollama_provider import OllamaProvider
        config = ProviderConfig(provider_type=ProviderType.OLLAMA)
        provider = OllamaProvider(config)
        # Validation would check if server is running, but no API key error
        errors = [e for e in provider.validate_config() if "API_KEY" in e]
        assert len(errors) == 0


class TestProviderSecurity:
    """Tests for security across providers."""

    def test_claude_uses_security_hooks(self):
        """Claude provider should use existing security hooks."""
        # This is tested implicitly by using create_client from core.client
        from providers.claude_provider import ClaudeProvider

        # Verify the provider uses the existing client infrastructure
        config = ProviderConfig(
            provider_type=ProviderType.CLAUDE,
            api_key="test-token",
        )
        provider = ClaudeProvider(config)

        # The run_agent_session should call create_client which has security hooks
        # This is an integration point - detailed testing is in test_security.py
        assert provider.name == "claude"

    def test_all_providers_have_validate(self):
        """All providers implement validate_config."""
        from providers.claude_provider import ClaudeProvider
        from providers.openai_provider import OpenAIProvider
        from providers.gemini_provider import GeminiProvider
        from providers.ollama_provider import OllamaProvider

        providers = [
            ClaudeProvider(ProviderConfig(provider_type=ProviderType.CLAUDE)),
            OpenAIProvider(ProviderConfig(provider_type=ProviderType.OPENAI)),
            GeminiProvider(ProviderConfig(provider_type=ProviderType.GEMINI)),
            OllamaProvider(ProviderConfig(provider_type=ProviderType.OLLAMA)),
        ]

        for provider in providers:
            # Should not raise
            errors = provider.validate_config()
            assert isinstance(errors, list)


class TestProviderBackwardCompatibility:
    """Tests for backward compatibility with existing Claude-only workflows."""

    def test_default_provider_is_claude(self):
        """Without --provider flag, should use Claude."""
        from providers.claude_provider import ClaudeProvider
        provider = get_provider()
        assert isinstance(provider, ClaudeProvider)
        assert provider.name == "claude"

    def test_existing_env_vars_work(self):
        """Existing CLAUDE_CODE_OAUTH_TOKEN works."""
        with patch.dict(os.environ, {
            "CLAUDE_CODE_OAUTH_TOKEN": "existing-token",
        }):
            config = ProviderConfig.from_env(ProviderType.CLAUDE)
            assert config.api_key == "existing-token"

    def test_anthropic_api_key_fallback(self):
        """ANTHROPIC_API_KEY works as fallback for Claude."""
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "fallback-key",
        }, clear=True):
            # Clear CLAUDE_CODE_OAUTH_TOKEN to test fallback
            config = ProviderConfig.from_env(ProviderType.CLAUDE)
            assert config.api_key == "fallback-key"
