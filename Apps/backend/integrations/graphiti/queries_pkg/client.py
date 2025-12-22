"""
FalkorDB client wrapper for Graphiti memory.

Handles database connection, initialization, and lifecycle management.
"""

import logging
from datetime import datetime, timezone

from graphiti_config import GraphitiConfig, GraphitiState

logger = logging.getLogger(__name__)


class GraphitiClient:
    """
    Manages the Graphiti client lifecycle and database connection.

    Handles lazy initialization, provider setup, and connection management.
    """

    def __init__(self, config: GraphitiConfig):
        """
        Initialize the client manager.

        Args:
            config: Graphiti configuration
        """
        self.config = config
        self._graphiti = None
        self._driver = None
        self._llm_client = None
        self._embedder = None
        self._initialized = False

    @property
    def graphiti(self):
        """Get the Graphiti instance (must be initialized first)."""
        return self._graphiti

    @property
    def is_initialized(self) -> bool:
        """Check if client is initialized."""
        return self._initialized

    async def initialize(self, state: GraphitiState | None = None) -> bool:
        """
        Initialize the Graphiti client with configured providers.

        Args:
            state: Optional GraphitiState for tracking initialization status

        Returns:
            True if initialization succeeded
        """
        if self._initialized:
            return True

        try:
            # Import Graphiti core
            from graphiti_core import Graphiti
            from graphiti_core.driver.falkordb_driver import FalkorDriver

            # Import our provider factory
            from graphiti_providers import (
                ProviderError,
                ProviderNotInstalled,
                create_embedder,
                create_llm_client,
            )

            # Create providers using factory pattern
            try:
                self._llm_client = create_llm_client(self.config)
                logger.info(
                    f"Created LLM client for provider: {self.config.llm_provider}"
                )
            except ProviderNotInstalled as e:
                logger.warning(f"LLM provider packages not installed: {e}")
                return False
            except ProviderError as e:
                logger.warning(f"LLM provider configuration error: {e}")
                return False

            try:
                self._embedder = create_embedder(self.config)
                logger.info(
                    f"Created embedder for provider: {self.config.embedder_provider}"
                )
            except ProviderNotInstalled as e:
                logger.warning(f"Embedder provider packages not installed: {e}")
                return False
            except ProviderError as e:
                logger.warning(f"Embedder provider configuration error: {e}")
                return False

            # Initialize FalkorDB driver
            self._driver = FalkorDriver(
                host=self.config.falkordb_host,
                port=self.config.falkordb_port,
                password=self.config.falkordb_password or None,
                database=self.config.database,
            )

            # Initialize Graphiti with the custom providers
            self._graphiti = Graphiti(
                graph_driver=self._driver,
                llm_client=self._llm_client,
                embedder=self._embedder,
            )

            # Build indices (first time only)
            if not state or not state.indices_built:
                logger.info("Building Graphiti indices and constraints...")
                await self._graphiti.build_indices_and_constraints()

                if state:
                    state.indices_built = True
                    state.initialized = True
                    state.database = self.config.database
                    state.created_at = datetime.now(timezone.utc).isoformat()
                    state.llm_provider = self.config.llm_provider
                    state.embedder_provider = self.config.embedder_provider

            self._initialized = True
            logger.info(
                f"Graphiti client initialized "
                f"(providers: {self.config.get_provider_summary()})"
            )
            return True

        except ImportError as e:
            logger.warning(
                f"Graphiti packages not installed: {e}. "
                "Install with: pip install graphiti-core[falkordb]"
            )
            return False

        except Exception as e:
            logger.warning(f"Failed to initialize Graphiti client: {e}")
            return False

    async def close(self) -> None:
        """
        Close the Graphiti client and clean up connections.
        """
        if self._graphiti:
            try:
                await self._graphiti.close()
                logger.info("Graphiti connection closed")
            except Exception as e:
                logger.warning(f"Error closing Graphiti: {e}")
            finally:
                self._graphiti = None
                self._driver = None
                self._llm_client = None
                self._embedder = None
                self._initialized = False
