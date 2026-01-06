"""
Cross-Encoder / Reranker Provider
==================================

Optional cross-encoder/reranker for improved search quality.
Provides NoOpCrossEncoder for providers that don't have reranking.
"""

import logging
from typing import TYPE_CHECKING, Any

from graphiti_core.cross_encoder.client import CrossEncoderClient

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

logger = logging.getLogger(__name__)


class NoOpCrossEncoder(CrossEncoderClient):
    """
    A no-op cross-encoder that returns passages in their original order.

    This is used when:
    - The LLM provider doesn't have a reranker (Google, Anthropic)
    - OpenAI API key is not available

    It satisfies the graphiti-core CrossEncoderClient interface without
    requiring any API calls or external services.
    """

    async def rank(self, query: str, passages: list[str]) -> list[tuple[str, float]]:
        """
        Return passages in original order with descending scores.

        Args:
            query: The query string (ignored in no-op)
            passages: List of passages to "rank"

        Returns:
            List of (passage, score) tuples with scores from 1.0 descending
        """
        # Return passages in original order with descending scores
        # This maintains order stability while satisfying the interface
        if not passages:
            return []

        # Assign scores from 1.0 down to ensure stable ordering
        step = 1.0 / max(len(passages), 1)
        return [(p, 1.0 - i * step) for i, p in enumerate(passages)]

    def set_tracer(self, tracer: Any) -> None:
        """No-op tracer setter."""
        pass


def create_cross_encoder(
    config: "GraphitiConfig", llm_client: Any = None
) -> Any:
    """
    Create a cross-encoder/reranker for improved search quality.

    For Ollama, creates an OpenAI-compatible reranker.
    For other providers, returns a NoOpCrossEncoder to avoid
    requiring OPENAI_API_KEY.

    Args:
        config: GraphitiConfig with provider settings
        llm_client: Optional LLM client for reranking (Ollama only)

    Returns:
        Cross-encoder instance (never None - graphiti-core defaults to OpenAI if None)
    """
    # For Ollama, try to create an OpenAI-compatible reranker
    if config.llm_provider == "ollama" and llm_client is not None:
        try:
            from graphiti_core.cross_encoder.openai_reranker_client import (
                OpenAIRerankerClient,
            )
            from graphiti_core.llm_client.config import LLMConfig

            # Create LLM config for reranker
            base_url = config.ollama_base_url
            if not base_url.endswith("/v1"):
                base_url = base_url.rstrip("/") + "/v1"

            llm_config = LLMConfig(
                api_key="ollama",
                model=config.ollama_llm_model,
                base_url=base_url,
            )

            return OpenAIRerankerClient(client=llm_client, config=llm_config)
        except ImportError:
            logger.debug("OpenAI reranker not available, using NoOpCrossEncoder")
        except Exception as e:
            logger.warning(f"Could not create Ollama cross-encoder: {e}")

    # For all other providers (Google, Anthropic, etc.) or fallback,
    # use NoOpCrossEncoder to avoid requiring OPENAI_API_KEY
    logger.debug(
        f"Using NoOpCrossEncoder for provider: {config.llm_provider}"
    )
    return NoOpCrossEncoder()
