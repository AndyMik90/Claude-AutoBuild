"""
Google AI LLM Provider
======================

Google Gemini LLM client implementation for Graphiti.
Uses the new unified Google GenAI SDK (google-genai).

Migration note: The legacy google-generativeai package was deprecated Nov 30, 2025.
This implementation uses the new google-genai SDK with client-based API.
"""

import json
import logging
from typing import TYPE_CHECKING, Any

from ..exceptions import ProviderError, ProviderNotInstalled

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig


# Default model for Google LLM
DEFAULT_GOOGLE_LLM_MODEL = "gemini-2.0-flash"


class GoogleLLMClient:
    """
    Google AI LLM Client using the Gemini API.

    Implements the LLMClient interface expected by graphiti-core.
    Uses the new unified Google GenAI SDK with native async support.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_GOOGLE_LLM_MODEL):
        """
        Initialize the Google LLM client.

        Args:
            api_key: Google AI API key
            model: Model name (default: gemini-2.0-flash)
        """
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise ProviderNotInstalled(
                f"Google LLM requires google-genai. "
                f"Install with: pip install google-genai\n"
                f"Error: {e}"
            )

        self.api_key = api_key
        self.model = model

        # Create the Google GenAI client
        self._client = genai.Client(api_key=api_key)
        self._types = types

    async def generate_response(
        self,
        messages: list[dict[str, Any]],
        response_model: Any = None,
        **kwargs: Any,
    ) -> Any:
        """
        Generate a response from the LLM.

        Args:
            messages: List of message dicts with 'role' and 'content'
            response_model: Optional Pydantic model for structured output
            **kwargs: Additional arguments

        Returns:
            Generated response (string or structured object)
        """
        # Extract system instruction and build contents
        system_instruction = None
        contents = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                # Google handles system messages as system_instruction in config
                system_instruction = content
            elif role == "assistant":
                # Google uses 'model' role for assistant messages
                contents.append(
                    self._types.Content(
                        role="model",
                        parts=[self._types.Part.from_text(text=content)],
                    )
                )
            else:
                contents.append(
                    self._types.Content(
                        role="user",
                        parts=[self._types.Part.from_text(text=content)],
                    )
                )

        # Build generation config
        config_kwargs = {}
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        if not contents:
            raise ProviderError("No user or assistant messages provided for generation")

        if response_model:
            # For structured output, use JSON mode
            config_kwargs["response_mime_type"] = "application/json"

        config = (
            self._types.GenerateContentConfig(**config_kwargs)
            if config_kwargs
            else None
        )

        # Use async API for better performance
        response = await self._client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        if response_model:
            # Parse JSON response into the model
            try:
                data = json.loads(response.text)
            except json.JSONDecodeError as e:
                raise ProviderError(
                    f"Failed to parse structured response from Google AI. "
                    f"Expected JSON for {response_model.__name__}, got: {response.text[:100]}..."
                ) from e
            try:
                return response_model(**data)
            except Exception as e:
                raise ProviderError(
                    f"Failed to validate structured response from Google AI. "
                    f"Model {response_model.__name__} validation failed: {e}"
                ) from e
        else:
            return response.text

    async def generate_response_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[Any],
        **kwargs: Any,
    ) -> Any:
        """
        Generate a response with tool calling support.

        Note: Tool calling is not yet implemented for Google AI provider.
        This method will log a warning and fall back to regular generation.

        Args:
            messages: List of message dicts
            tools: List of tool definitions
            **kwargs: Additional arguments

        Returns:
            Generated response (without tool calls)
        """
        if tools:
            logger.warning(
                "Google AI provider does not yet support tool calling. "
                "Tools will be ignored and regular generation will be used."
            )
        return await self.generate_response(messages, **kwargs)


def create_google_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create Google AI LLM client.

    Args:
        config: GraphitiConfig with Google settings

    Returns:
        Google LLM client instance

    Raises:
        ProviderNotInstalled: If google-genai is not installed
        ProviderError: If API key is missing
    """
    if not config.google_api_key:
        raise ProviderError("Google LLM provider requires GOOGLE_API_KEY")

    model = config.google_llm_model or DEFAULT_GOOGLE_LLM_MODEL

    return GoogleLLMClient(api_key=config.google_api_key, model=model)
