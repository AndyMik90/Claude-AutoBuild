"""
Ollama Provider
===============

Provider adapter for local LLM models via Ollama.
Implements the LLMProvider interface for Ollama's API.
"""

import os
from pathlib import Path
from typing import Any

from providers.base import AgentResponse, LLMProvider, ProviderConfig, ProviderType


class OllamaProvider(LLMProvider):
    """
    Ollama provider for running local LLM models.

    Supports any model available through Ollama (Llama, Mistral, CodeLlama, etc.)
    No API key required - uses local Ollama installation.
    """

    def __init__(self, config: ProviderConfig):
        """Initialize the Ollama provider."""
        super().__init__(config)
        self._client = None
        # Default to localhost if not specified
        if not self.config.base_url:
            self.config.base_url = os.environ.get(
                "OLLAMA_BASE_URL", "http://localhost:11434"
            )

    def _get_client(self):
        """Lazy initialization of Ollama client."""
        if self._client is None:
            try:
                from ollama import AsyncClient

                self._client = AsyncClient(host=self.config.base_url)
            except ImportError:
                raise ImportError(
                    "Ollama package not installed. Install with: pip install ollama"
                )
        return self._client

    @property
    def name(self) -> str:
        """Return the provider name."""
        return "ollama"

    @property
    def is_available(self) -> bool:
        """
        Check if Ollama is properly configured.

        Note: Ollama doesn't require an API key, but needs Ollama to be running.
        """
        # Check if Ollama server is reachable
        import urllib.error
        import urllib.request

        try:
            url = f"{self.config.base_url}/api/version"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=2) as response:
                return response.status == 200
        except (urllib.error.URLError, TimeoutError, OSError):
            return False

    async def run_agent_session(
        self,
        prompt: str,
        project_dir: Path,
        spec_dir: Path,
        agent_type: str = "coder",
        max_thinking_tokens: int | None = None,
    ) -> AgentResponse:
        """
        Run an Ollama completion session.

        Note: Ollama runs locally and may be slower than cloud providers.
        Response quality depends on the model used.
        """
        try:
            client = self._get_client()
            model = self.config.model or "llama3.2"

            # Build full prompt with system context
            system_prompt = self._build_system_prompt(project_dir, agent_type)

            # Generate using Ollama's chat API
            response = await client.chat(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                options={
                    "num_predict": self.config.max_tokens,
                    "temperature": self.config.temperature,
                },
            )

            # Extract response
            output = response.get("message", {}).get("content", "")
            tokens_used = 0

            # Try to get token counts
            if "eval_count" in response:
                tokens_used = response.get("prompt_eval_count", 0) + response.get(
                    "eval_count", 0
                )

            return AgentResponse(
                success=True,
                output=output,
                tokens_used=tokens_used,
                cost_usd=0.0,  # Local models are free
                metadata={
                    "model": model,
                    "agent_type": agent_type,
                    "local": True,
                },
            )

        except ImportError as e:
            return AgentResponse(
                success=False,
                output=f"Ollama package not installed: {e!s}",
                metadata={"error": str(e)},
            )
        except Exception as e:
            error_msg = str(e)
            if "connection refused" in error_msg.lower():
                error_msg = (
                    "Ollama server not running. Start it with: ollama serve\n"
                    f"Original error: {e}"
                )
            return AgentResponse(
                success=False,
                output=f"Ollama error: {error_msg}",
                metadata={"error": str(e)},
            )

    def _build_system_prompt(self, project_dir: Path, agent_type: str) -> str:
        """Build system prompt for agent type."""
        return f"""You are an expert full-stack developer working on: {project_dir}

You are operating as a {agent_type} agent. Your task is to:
- Follow existing code patterns
- Write clean, maintainable code
- Provide clear, actionable output

Note: You are running through the Auto Claude framework with Ollama as the provider.
You do not have access to file system tools directly. Provide code and instructions
that the framework can apply."""

    def get_model_info(self) -> dict[str, Any]:
        """Get Ollama model information."""
        model = self.config.model or "llama3.2"

        # Common Ollama model context windows
        context_windows = {
            "llama3.2": 128000,
            "llama3.1": 128000,
            "llama3": 8192,
            "codellama": 16384,
            "mistral": 32000,
            "mixtral": 32000,
            "deepseek-coder": 16384,
            "qwen2.5-coder": 32768,
        }

        # Find matching context window
        context_window = 8192  # Default
        for key, value in context_windows.items():
            if key in model.lower():
                context_window = value
                break

        return {
            "provider": "ollama",
            "model": model,
            "context_window": context_window,
            "max_output_tokens": 4096,
            "supports_tools": False,  # Basic Ollama doesn't support tools
            "supports_extended_thinking": False,
            "pricing_per_million": {"input": 0.0, "output": 0.0},  # Free (local)
            "local": True,
        }

    def validate_config(self) -> list[str]:
        """Validate Ollama configuration."""
        errors = []

        # Check if Ollama is running
        if not self.is_available:
            errors.append(
                f"Ollama server not reachable at {self.config.base_url}. "
                "Make sure Ollama is installed and running (ollama serve)"
            )

        return errors


def create_ollama_provider(config: ProviderConfig | None = None) -> OllamaProvider:
    """
    Create an Ollama provider instance.

    Args:
        config: Optional provider config. If not provided, loads from env.

    Returns:
        Configured OllamaProvider
    """
    if config is None:
        config = ProviderConfig.from_env(ProviderType.OLLAMA)
    return OllamaProvider(config)
