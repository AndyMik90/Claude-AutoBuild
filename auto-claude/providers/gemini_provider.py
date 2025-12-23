"""
Google Gemini Provider
======================

Provider adapter for Google's Gemini models.
Implements the LLMProvider interface for the Gemini API.
"""

import os
from pathlib import Path
from typing import Any

from providers.base import AgentResponse, LLMProvider, ProviderConfig, ProviderType


class GeminiProvider(LLMProvider):
    """
    Gemini provider using the Google Generative AI SDK.

    Supports Gemini Pro, Gemini 2.0 Flash, and other Gemini models.
    """

    def __init__(self, config: ProviderConfig):
        """Initialize the Gemini provider."""
        super().__init__(config)
        self._model = None

    def _get_model(self):
        """Lazy initialization of Gemini model."""
        if self._model is None:
            try:
                import google.generativeai as genai

                genai.configure(api_key=self.config.api_key)
                model_name = self.config.model or "gemini-2.0-flash"
                self._model = genai.GenerativeModel(model_name)
            except ImportError:
                raise ImportError(
                    "Google Generative AI package not installed. "
                    "Install with: pip install google-generativeai"
                )
        return self._model

    @property
    def name(self) -> str:
        """Return the provider name."""
        return "gemini"

    @property
    def is_available(self) -> bool:
        """Check if Gemini is properly configured."""
        return bool(self.config.api_key or os.environ.get("GEMINI_API_KEY"))

    async def run_agent_session(
        self,
        prompt: str,
        project_dir: Path,
        spec_dir: Path,
        agent_type: str = "coder",
        max_thinking_tokens: int | None = None,
    ) -> AgentResponse:
        """
        Run a Gemini completion session.

        Note: Gemini doesn't have native agent capabilities like Claude SDK.
        This runs a simpler completion without tool use.
        """
        try:
            model = self._get_model()

            # Build full prompt with system context
            system_prompt = self._build_system_prompt(project_dir, agent_type)
            full_prompt = f"{system_prompt}\n\n---\n\nUser Request:\n{prompt}"

            # Generate content (async)
            response = await model.generate_content_async(
                full_prompt,
                generation_config={
                    "max_output_tokens": self.config.max_tokens,
                    "temperature": self.config.temperature,
                },
            )

            # Extract response
            output = response.text if hasattr(response, "text") else str(response)
            tokens_used = 0

            # Try to get token count from usage metadata
            if hasattr(response, "usage_metadata"):
                usage = response.usage_metadata
                if hasattr(usage, "total_token_count"):
                    tokens_used = usage.total_token_count

            return AgentResponse(
                success=True,
                output=output,
                tokens_used=tokens_used,
                cost_usd=self._estimate_cost(tokens_used),
                metadata={
                    "model": self.config.model or "gemini-2.0-flash",
                    "agent_type": agent_type,
                },
            )

        except ImportError as e:
            return AgentResponse(
                success=False,
                output=f"Google Generative AI package not installed: {e!s}",
                metadata={"error": str(e)},
            )
        except Exception as e:
            return AgentResponse(
                success=False,
                output=f"Gemini error: {e!s}",
                metadata={"error": str(e)},
            )

    def _build_system_prompt(self, project_dir: Path, agent_type: str) -> str:
        """Build system prompt for agent type."""
        return f"""You are an expert full-stack developer working on: {project_dir}

You are operating as a {agent_type} agent. Your task is to:
- Follow existing code patterns
- Write clean, maintainable code
- Provide clear, actionable output

Note: You are running through the Auto Claude framework with Gemini as the provider.
You do not have access to file system tools directly. Provide code and instructions
that the framework can apply."""

    def get_model_info(self) -> dict[str, Any]:
        """Get Gemini model information."""
        model = self.config.model or "gemini-2.0-flash"

        # Model pricing (per million tokens, as of 2024)
        # Gemini has competitive pricing
        pricing = {
            "gemini-2.0-flash": {"input": 0.075, "output": 0.30},
            "gemini-1.5-pro": {"input": 1.25, "output": 5.0},
            "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
            "gemini-pro": {"input": 0.5, "output": 1.5},
        }

        context_windows = {
            "gemini-2.0-flash": 1000000,
            "gemini-1.5-pro": 2000000,
            "gemini-1.5-flash": 1000000,
            "gemini-pro": 32000,
        }

        return {
            "provider": "gemini",
            "model": model,
            "context_window": context_windows.get(model, 1000000),
            "max_output_tokens": 8192,
            "supports_tools": True,
            "supports_extended_thinking": False,
            "pricing_per_million": pricing.get(model, {"input": 0.075, "output": 0.30}),
        }

    def _estimate_cost(self, tokens: int) -> float:
        """Estimate cost based on token usage."""
        info = self.get_model_info()
        pricing = info.get("pricing_per_million", {"input": 0.075, "output": 0.30})
        # Assume 50/50 input/output split for estimation
        avg_price = (pricing["input"] + pricing["output"]) / 2
        return (tokens / 1_000_000) * avg_price


def create_gemini_provider(config: ProviderConfig | None = None) -> GeminiProvider:
    """
    Create a Gemini provider instance.

    Args:
        config: Optional provider config. If not provided, loads from env.

    Returns:
        Configured GeminiProvider
    """
    if config is None:
        config = ProviderConfig.from_env(ProviderType.GEMINI)
    return GeminiProvider(config)
