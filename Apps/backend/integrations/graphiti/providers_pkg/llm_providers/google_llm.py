"""
Google AI LLM Provider
======================

Google Gemini LLM client implementation for Graphiti.
Uses the google-generativeai SDK.
"""

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
    """

    def __init__(self, api_key: str, model: str = DEFAULT_GOOGLE_LLM_MODEL):
        """
        Initialize the Google LLM client.

        Args:
            api_key: Google AI API key
            model: Model name (default: gemini-2.0-flash)
        """
        try:
            import google.generativeai as genai
        except ImportError as e:
            raise ProviderNotInstalled(
                f"Google LLM requires google-generativeai. "
                f"Install with: pip install google-generativeai\n"
                f"Error: {e}"
            )

        self.api_key = api_key
        self.model = model

        # Configure the Google AI client
        genai.configure(api_key=api_key)
        self._genai = genai
        self._model = genai.GenerativeModel(model)

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
        import asyncio

        # Convert messages to Google format
        # Google uses 'user' and 'model' roles
        google_messages = []
        system_instruction = None

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                # Google handles system messages as system_instruction
                system_instruction = content
            elif role == "assistant":
                google_messages.append({"role": "model", "parts": [content]})
            else:
                google_messages.append({"role": "user", "parts": [content]})

        # Create model with system instruction if provided
        if system_instruction:
            model = self._genai.GenerativeModel(
                self.model, system_instruction=system_instruction
            )
        else:
            model = self._model

        # Generate response
        loop = asyncio.get_running_loop()

        if response_model:
            # For structured output, use JSON mode
            generation_config = self._genai.GenerationConfig(
                response_mime_type="application/json"
            )

            response = await loop.run_in_executor(
                None,
                lambda: model.generate_content(
                    google_messages, generation_config=generation_config
                ),
            )

            # Parse JSON response into the model
            import json

            try:
                data = json.loads(response.text)
                return response_model(**data)
            except json.JSONDecodeError:
                # If JSON parsing fails, return raw text
                logger.warning(
                    "Failed to parse JSON response from Google AI, returning raw text"
                )
                return response.text
        else:
            response = await loop.run_in_executor(
                None, lambda: model.generate_content(google_messages)
            )

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
        ProviderNotInstalled: If google-generativeai is not installed
        ProviderError: If API key is missing
    """
    if not config.google_api_key:
        raise ProviderError("Google LLM provider requires GOOGLE_API_KEY")

    model = config.google_llm_model or DEFAULT_GOOGLE_LLM_MODEL

    return GoogleLLMClient(api_key=config.google_api_key, model=model)
