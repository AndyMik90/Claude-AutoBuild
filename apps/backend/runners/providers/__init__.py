"""
Git Provider Factory
====================

Factory for creating provider instances based on configuration.
Provides a unified interface for GitHub, GitLab, Bitbucket, etc.
"""

from .factory import ProviderConfig, create_provider

__all__ = ["ProviderConfig", "create_provider"]
