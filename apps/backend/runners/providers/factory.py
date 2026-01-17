"""
Provider Factory
================

Factory for creating git provider instances based on configuration.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..github.providers.github_provider import GitHubProvider
from ..github.providers.protocol import GitProvider, ProviderType
from ..gitlab.glab_client import GitLabConfig
from ..gitlab.providers.gitlab_provider import GitLabProvider


@dataclass
class ProviderConfig:
    """
    Configuration for creating a git provider.

    The provider type determines which implementation to use.
    Additional fields are provider-specific.
    """

    provider_type: ProviderType | str
    project_dir: Path | str | None = None

    # GitHub-specific
    github_repo: str | None = None
    # NOTE: github_token is a placeholder for future API-based auth.
    # Currently GitHubProvider uses gh CLI which handles its own authentication.
    github_token: str | None = None

    # GitLab-specific
    gitlab_project: str | None = None
    gitlab_token: str | None = None
    gitlab_instance_url: str = "https://gitlab.com"

    # Bitbucket-specific (future)
    bitbucket_workspace: str | None = None
    bitbucket_repo: str | None = None
    bitbucket_token: str | None = None

    # Generic options
    enable_rate_limiting: bool = True

    def __post_init__(self):
        """Normalize provider type to enum."""
        if isinstance(self.provider_type, str):
            self.provider_type = ProviderType(self.provider_type.lower())


def create_provider(config: ProviderConfig) -> GitProvider:
    """
    Factory function to create a git provider based on configuration.

    Args:
        config: Provider configuration specifying type and credentials

    Returns:
        Provider instance implementing GitProvider protocol

    Raises:
        ValueError: If provider type is unsupported or required config is missing

    Examples:
        # GitHub
        config = ProviderConfig(
            provider_type=ProviderType.GITHUB,
            github_repo="owner/repo",
            project_dir="/path/to/project"
        )
        provider = create_provider(config)

        # GitLab
        config = ProviderConfig(
            provider_type=ProviderType.GITLAB,
            gitlab_project="group/project",
            gitlab_token="glpat-xxx",
            gitlab_instance_url="https://gitlab.com"
        )
        provider = create_provider(config)
    """
    provider_type = config.provider_type

    if provider_type == ProviderType.GITHUB:
        return _create_github_provider(config)
    elif provider_type == ProviderType.GITLAB:
        return _create_gitlab_provider(config)
    elif provider_type == ProviderType.BITBUCKET:
        raise NotImplementedError("Bitbucket provider not yet implemented")
    elif provider_type == ProviderType.GITEA:
        raise NotImplementedError("Gitea provider not yet implemented")
    elif provider_type == ProviderType.AZURE_DEVOPS:
        raise NotImplementedError("Azure DevOps provider not yet implemented")
    else:
        raise ValueError(f"Unsupported provider type: {provider_type}")


def _create_github_provider(config: ProviderConfig) -> GitHubProvider:
    """Create a GitHub provider instance."""
    if not config.github_repo:
        raise ValueError("github_repo is required for GitHub provider")

    return GitHubProvider(
        _repo=config.github_repo,
        _project_dir=str(config.project_dir) if config.project_dir else None,
        enable_rate_limiting=config.enable_rate_limiting,
    )


def _create_gitlab_provider(config: ProviderConfig) -> GitLabProvider:
    """Create a GitLab provider instance."""
    if not config.gitlab_project:
        raise ValueError("gitlab_project is required for GitLab provider")
    if not config.gitlab_token:
        raise ValueError("gitlab_token is required for GitLab provider")

    gitlab_config = GitLabConfig(
        token=config.gitlab_token,
        project=config.gitlab_project,
        instance_url=config.gitlab_instance_url,
    )

    return GitLabProvider(
        _config=gitlab_config,
        _project_dir=str(config.project_dir) if config.project_dir else None,
    )


def create_provider_from_env(
    provider_type: str,
    project_dir: Path,
    env_config: dict[str, Any],
) -> GitProvider:
    """
    Convenience function to create a provider from environment config.

    This is useful when you have a project's env config dict and want to
    create the appropriate provider.

    Args:
        provider_type: "github" or "gitlab"
        project_dir: Project directory path
        env_config: Environment config dict from project settings

    Returns:
        Provider instance

    Example:
        # env_config from project .env file:
        env_config = {
            "githubRepo": "owner/repo",
            "githubToken": "ghp_xxx",
            # ... or ...
            "gitlabProject": "group/project",
            "gitlabToken": "glpat-xxx",
            "gitlabInstanceUrl": "https://gitlab.com"
        }

        provider = create_provider_from_env("github", project_dir, env_config)
    """
    config = ProviderConfig(
        provider_type=provider_type,
        project_dir=project_dir,
        # GitHub
        github_repo=env_config.get("githubRepo"),
        github_token=env_config.get("githubToken"),
        # GitLab
        gitlab_project=env_config.get("gitlabProject"),
        gitlab_token=env_config.get("gitlabToken"),
        gitlab_instance_url=env_config.get("gitlabInstanceUrl", "https://gitlab.com"),
    )

    return create_provider(config)
