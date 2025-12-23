"""
Claude Provider
================

Wraps the existing Claude SDK client for use with the provider interface.
This is the default provider and maintains full compatibility with existing code.
"""

from pathlib import Path
from typing import Any

from providers.base import AgentResponse, LLMProvider, ProviderConfig, ProviderType


class ClaudeProvider(LLMProvider):
    """
    Claude provider using the Claude Agent SDK.

    This wraps the existing client.py functionality to provide
    backward compatibility while supporting the new provider interface.
    """

    @property
    def name(self) -> str:
        """Return the provider name."""
        return "claude"

    @property
    def is_available(self) -> bool:
        """Check if Claude is properly configured."""
        try:
            from core.auth import get_auth_token

            token = get_auth_token()
            return token is not None
        except Exception:
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
        Run a Claude agent session.

        This uses the existing create_client() function from core.client
        to maintain full backward compatibility with security hooks and
        MCP server configurations.
        """
        try:
            from core.client import create_client

            model = self.config.model or "claude-sonnet-4-20250514"

            # Create client with existing security and MCP configuration
            client = create_client(
                project_dir=project_dir,
                spec_dir=spec_dir,
                model=model,
                agent_type=agent_type,
                max_thinking_tokens=max_thinking_tokens,
            )

            # Run the agent session
            result = await client.run(prompt)

            # Extract response data
            output = ""
            tokens_used = 0

            # Process result based on SDK response format
            if hasattr(result, "text"):
                output = result.text
            elif hasattr(result, "content"):
                output = str(result.content)
            else:
                output = str(result)

            if hasattr(result, "usage"):
                usage = result.usage
                if hasattr(usage, "input_tokens") and hasattr(usage, "output_tokens"):
                    tokens_used = usage.input_tokens + usage.output_tokens

            return AgentResponse(
                success=True,
                output=output,
                tokens_used=tokens_used,
                cost_usd=self._estimate_cost(tokens_used),
                metadata={"model": model, "agent_type": agent_type},
            )

        except Exception as e:
            return AgentResponse(
                success=False,
                output=f"Claude agent error: {e!s}",
                metadata={"error": str(e)},
            )

    def get_model_info(self) -> dict[str, Any]:
        """Get Claude model information."""
        model = self.config.model or "claude-sonnet-4-20250514"

        # Model pricing (per million tokens, as of 2024)
        pricing = {
            "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
            "claude-3-5-sonnet-20241022": {"input": 3.0, "output": 15.0},
            "claude-3-opus-20240229": {"input": 15.0, "output": 75.0},
            "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
        }

        return {
            "provider": "claude",
            "model": model,
            "context_window": 200000,
            "max_output_tokens": 8192,
            "supports_tools": True,
            "supports_extended_thinking": True,
            "pricing_per_million": pricing.get(model, {"input": 3.0, "output": 15.0}),
        }

    def _estimate_cost(self, tokens: int) -> float:
        """Estimate cost based on token usage."""
        info = self.get_model_info()
        pricing = info.get("pricing_per_million", {"input": 3.0, "output": 15.0})
        # Assume 50/50 input/output split for estimation
        avg_price = (pricing["input"] + pricing["output"]) / 2
        return (tokens / 1_000_000) * avg_price


def create_claude_provider(config: ProviderConfig | None = None) -> ClaudeProvider:
    """
    Create a Claude provider instance.

    Args:
        config: Optional provider config. If not provided, loads from env.

    Returns:
        Configured ClaudeProvider
    """
    if config is None:
        config = ProviderConfig.from_env(ProviderType.CLAUDE)
    return ClaudeProvider(config)
