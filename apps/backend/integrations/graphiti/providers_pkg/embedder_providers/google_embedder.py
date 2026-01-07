"""
Google AI Embedder Provider
===========================

Google Gemini embedder implementation for Graphiti.
Uses the google-generativeai SDK for text embeddings.
"""

from typing import TYPE_CHECKING, Any

from ..exceptions import ProviderError, ProviderNotInstalled

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig


# Default embedding model for Google
DEFAULT_GOOGLE_EMBEDDING_MODEL = "text-embedding-004"


class GoogleEmbedder:
    """
    Google AI Embedder using the Gemini API.

    Implements the EmbedderClient interface expected by graphiti-core.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_GOOGLE_EMBEDDING_MODEL):
        """
        Initialize the Google embedder.

        Args:
            api_key: Google AI API key
            model: Embedding model name (default: text-embedding-004)
        """
        try:
            import google.generativeai as genai
        except ImportError as e:
            raise ProviderNotInstalled(
                f"Google embedder requires google-generativeai. "
                f"Install with: pip install google-generativeai\n"
                f"Error: {e}"
            )

        self.api_key = api_key
        self.model = model

        # Configure the Google AI client
        genai.configure(api_key=api_key)
        self._genai = genai

    async def create(self, input_data: str | list[str]) -> list[float]:
        """
        Create embeddings for the input data.

        Args:
            input_data: Text string or list of strings to embed

        Returns:
            List of floats representing the embedding vector
        """
        import asyncio

        # Handle single string input
        if isinstance(input_data, str):
            text = input_data
        elif isinstance(input_data, list) and len(input_data) > 0:
            # Join list items if it's a list of strings
            if isinstance(input_data[0], str):
                text = " ".join(input_data)
            else:
                # It might be token IDs, convert to string
                text = str(input_data)
        else:
            text = str(input_data)

        # Run the synchronous API call in a thread pool
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._genai.embed_content(
                model=f"models/{self.model}",
                content=text,
                task_type="retrieval_document",
            ),
        )

        return result["embedding"]

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        """
        Create embeddings for a batch of inputs.

        Args:
            input_data_list: List of text strings to embed

        Returns:
            List of embedding vectors
        """
        import asyncio

        # Google's API supports batch embedding
        loop = asyncio.get_running_loop()

        # Process in batches to avoid rate limits
        batch_size = 100
        all_embeddings = []

        for i in range(0, len(input_data_list), batch_size):
            batch = input_data_list[i : i + batch_size]

            result = await loop.run_in_executor(
                None,
                lambda b=batch: self._genai.embed_content(
                    model=f"models/{self.model}",
                    content=b,
                    task_type="retrieval_document",
                ),
            )

            # Handle single vs batch response
            if isinstance(result["embedding"][0], list):
                all_embeddings.extend(result["embedding"])
            else:
                all_embeddings.append(result["embedding"])

        return all_embeddings


def create_google_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Google AI embedder.

    Args:
        config: GraphitiConfig with Google settings

    Returns:
        Google embedder instance

    Raises:
        ProviderNotInstalled: If google-generativeai is not installed
        ProviderError: If API key is missing
    """
    if not config.google_api_key:
        raise ProviderError("Google embedder requires GOOGLE_API_KEY")

    model = config.google_embedding_model or DEFAULT_GOOGLE_EMBEDDING_MODEL

    return GoogleEmbedder(api_key=config.google_api_key, model=model)
