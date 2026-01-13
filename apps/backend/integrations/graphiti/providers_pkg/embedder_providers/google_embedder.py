"""
Google AI Embedder Provider
===========================

Google Gemini embedder implementation for Graphiti.
Uses the new unified Google GenAI SDK (google-genai).

Migration note: The legacy google-generativeai package was deprecated Nov 30, 2025.
This implementation uses the new google-genai SDK with client-based API.
"""

from typing import TYPE_CHECKING, Any

from ..exceptions import ProviderError, ProviderNotInstalled

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig


# Default embedding model for Google (3072 dimensions natively)
# gemini-embedding-001 replaced text-embedding-004 (deprecated Jan 2026)
DEFAULT_GOOGLE_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_GOOGLE_EMBEDDING_DIM = 3072


class GoogleEmbedder:
    """
    Google AI Embedder using the Gemini API.

    Implements the EmbedderClient interface expected by graphiti-core.
    Uses the new unified Google GenAI SDK with native async support.
    """

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_GOOGLE_EMBEDDING_MODEL,
        output_dimensionality: int | None = None,
    ):
        """
        Initialize the Google embedder.

        Args:
            api_key: Google AI API key
            model: Embedding model name (default: gemini-embedding-001)
            output_dimensionality: Output dimension (default: None = model's native dim)
                For gemini-embedding-001: 3072 (native), 1536, or 768
        """
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise ProviderNotInstalled(
                f"Google embedder requires google-genai. "
                f"Install with: pip install google-genai\n"
                f"Error: {e}"
            )

        self.api_key = api_key
        self.model = model
        self.output_dimensionality = output_dimensionality

        # Create the Google GenAI client
        self._client = genai.Client(api_key=api_key)
        self._types = types

    def _build_embed_config(self) -> Any:
        """Build EmbedContentConfig with current settings."""
        if self.output_dimensionality:
            return self._types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=self.output_dimensionality,
            )
        return self._types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT",
        )

    async def create(self, input_data: str | list[str]) -> list[float]:
        """
        Create embeddings for the input data.

        Args:
            input_data: Text string or list of strings to embed

        Returns:
            List of floats representing the embedding vector
        """
        # Handle single string input
        if isinstance(input_data, str):
            contents = input_data
        elif isinstance(input_data, list) and len(input_data) > 0:
            # Join list items if it's a list of strings
            if isinstance(input_data[0], str):
                contents = " ".join(input_data)
            else:
                # It might be token IDs, convert to string
                contents = str(input_data)
        elif isinstance(input_data, list) and len(input_data) == 0:
            raise ValueError("Cannot create embedding for empty input list")
        else:
            contents = str(input_data)

        # Build config with optional output_dimensionality
        config = self._build_embed_config()

        # Use async API for better performance
        response = await self._client.aio.models.embed_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        # Response has embeddings list with ContentEmbedding objects
        if not response.embeddings:
            raise ProviderError("Google AI returned empty embeddings response")
        return list(response.embeddings[0].values)

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        """
        Create embeddings for a batch of inputs.

        Args:
            input_data_list: List of text strings to embed

        Returns:
            List of embedding vectors
        """
        # Build config with optional output_dimensionality
        config = self._build_embed_config()

        # Process in batches to avoid rate limits
        batch_size = 100
        all_embeddings = []

        for i in range(0, len(input_data_list), batch_size):
            batch = input_data_list[i : i + batch_size]

            # Use async API for better performance
            response = await self._client.aio.models.embed_content(
                model=self.model,
                contents=batch,
                config=config,
            )

            # Extract embedding values from response
            for embedding in response.embeddings:
                all_embeddings.append(list(embedding.values))

        return all_embeddings


def create_google_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Google AI embedder.

    Args:
        config: GraphitiConfig with Google settings

    Returns:
        Google embedder instance

    Raises:
        ProviderNotInstalled: If google-genai is not installed
        ProviderError: If API key is missing
    """
    if not config.google_api_key:
        raise ProviderError("Google embedder requires GOOGLE_API_KEY")

    model = config.google_embedding_model or DEFAULT_GOOGLE_EMBEDDING_MODEL
    output_dim = getattr(config, "google_embedding_dim", None)

    return GoogleEmbedder(
        api_key=config.google_api_key,
        model=model,
        output_dimensionality=output_dim if output_dim and output_dim > 0 else None,
    )
