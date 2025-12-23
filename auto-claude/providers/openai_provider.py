"""
OpenAI Provider
===============

Provider adapter for OpenAI GPT-4 and other OpenAI models.
Implements the LLMProvider interface for OpenAI's API.
"""

import os
from pathlib import Path
from typing import Any

from providers.base import AgentResponse, LLMProvider, ProviderConfig, ProviderType


class OpenAIProvider(LLMProvider):
    """
    OpenAI provider using the OpenAI Python SDK.

    Supports GPT-4, GPT-4o, and other OpenAI models.
    Note: OpenAI's API doesn't have native agent/tool support like Claude SDK,
    so this provider runs in a simpler completion mode.
    """

    def __init__(self, config: ProviderConfig):
        """Initialize the OpenAI provider."""
        super().__init__(config)
        self._client = None

    def _get_client(self):
        """Lazy initialization of OpenAI client."""
        if self._client is None:
            try:
                from openai import AsyncOpenAI

                self._client = AsyncOpenAI(
                    api_key=self.config.api_key,
                    base_url=self.config.base_url,
                )
            except ImportError:
                raise ImportError(
                    "OpenAI package not installed. Install with: pip install openai"
                )
        return self._client

    @property
    def name(self) -> str:
        """Return the provider name."""
        return "openai"

    @property
    def is_available(self) -> bool:
        """Check if OpenAI is properly configured."""
        return bool(self.config.api_key or os.environ.get("OPENAI_API_KEY"))

    async def run_agent_session(
        self,
        prompt: str,
        project_dir: Path,
        spec_dir: Path,
        agent_type: str = "coder",
        max_thinking_tokens: int | None = None,
    ) -> AgentResponse:
        """
        Run an OpenAI completion session.

        Note: OpenAI doesn't have native agent capabilities like Claude SDK.
        This runs a simpler chat completion without tool use.
        For full agent capabilities, use the Claude provider.
        """
        try:
            client = self._get_client()
            model = self.config.model or "gpt-4o"

            # Build system prompt with agent context
            system_prompt = self._build_system_prompt(project_dir, agent_type)

            # Create chat completion
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
            )

            # Extract response
            output = response.choices[0].message.content or ""
            tokens_used = 0

            if response.usage:
                tokens_used = response.usage.total_tokens

            return AgentResponse(
                success=True,
                output=output,
                tokens_used=tokens_used,
                cost_usd=self._estimate_cost(tokens_used, model),
                metadata={"model": model, "agent_type": agent_type},
            )

        except ImportError as e:
            return AgentResponse(
                success=False,
                output=f"OpenAI package not installed: {e!s}",
                metadata={"error": str(e)},
            )
        except Exception as e:
            return AgentResponse(
                success=False,
                output=f"OpenAI error: {e!s}",
                metadata={"error": str(e)},
            )

    def _build_system_prompt(self, project_dir: Path, agent_type: str) -> str:
        """Build system prompt for agent type."""
        base = f"""You are an expert full-stack developer working on: {project_dir}

You are operating as a {agent_type} agent. Your task is to:
- Follow existing code patterns
- Write clean, maintainable code
- Provide clear, actionable output

Note: You are running through the Auto Claude framework with OpenAI as the provider.
You do not have access to file system tools directly. Provide code and instructions
that the framework can apply."""

        return base

    def get_model_info(self) -> dict[str, Any]:
        """Get OpenAI model information."""
        model = self.config.model or "gpt-4o"

        # Model pricing (per million tokens, as of 2024)
        pricing = {
            "gpt-4o": {"input": 2.5, "output": 10.0},
            "gpt-4o-mini": {"input": 0.15, "output": 0.6},
            "gpt-4-turbo": {"input": 10.0, "output": 30.0},
            "gpt-4": {"input": 30.0, "output": 60.0},
            "o1-preview": {"input": 15.0, "output": 60.0},
            "o1-mini": {"input": 3.0, "output": 12.0},
        }

        context_windows = {
            "gpt-4o": 128000,
            "gpt-4o-mini": 128000,
            "gpt-4-turbo": 128000,
            "gpt-4": 8192,
            "o1-preview": 128000,
            "o1-mini": 128000,
        }

        return {
            "provider": "openai",
            "model": model,
            "context_window": context_windows.get(model, 128000),
            "max_output_tokens": 4096,
            # Note: OpenAI API supports tools, but this provider uses basic
            # chat completions for simplicity. Full tool support would require
            # implementing the function calling API.
            "supports_tools": False,
            "supports_extended_thinking": model.startswith("o1"),
            "pricing_per_million": pricing.get(model, {"input": 2.5, "output": 10.0}),
        }

    def _estimate_cost(self, tokens: int, model: str) -> float:
        """Estimate cost based on token usage."""
        info = self.get_model_info()
        pricing = info.get("pricing_per_million", {"input": 2.5, "output": 10.0})
        # Assume 50/50 input/output split for estimation
        avg_price = (pricing["input"] + pricing["output"]) / 2
        return (tokens / 1_000_000) * avg_price


def create_openai_provider(config: ProviderConfig | None = None) -> OpenAIProvider:
    """
    Create an OpenAI provider instance.

    Args:
        config: Optional provider config. If not provided, loads from env.

    Returns:
        Configured OpenAIProvider
    """
    if config is None:
        config = ProviderConfig.from_env(ProviderType.OPENAI)
    return OpenAIProvider(config)
