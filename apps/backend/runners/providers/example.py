"""
Provider Factory Examples
=========================

Examples showing how to use the provider factory for different git hosts.
"""

from pathlib import Path

from ..github.providers.protocol import ProviderType
from .factory import ProviderConfig, create_provider


async def example_github():
    """Example: Using GitHub provider."""
    config = ProviderConfig(
        provider_type=ProviderType.GITHUB,
        github_repo="owner/repo",
        project_dir=Path.cwd(),
    )

    provider = create_provider(config)

    # Fetch a pull request
    pr = await provider.fetch_pr(123)
    print(f"GitHub PR #{pr.number}: {pr.title}")
    print(f"Author: {pr.author}")
    print(f"State: {pr.state}")
    print(f"Changed files: {pr.changed_files}")

    # Post a review
    from ..github.providers.protocol import ReviewData, ReviewFinding

    review = ReviewData(
        pr_number=123,
        event="comment",
        body="Great work! Just a few suggestions:",
        findings=[
            ReviewFinding(
                id="1",
                severity="medium",
                category="style",
                title="Consider using const",
                description="Variables that don't change should use const instead of let",
                file="src/index.js",
                line=10,
                suggested_fix="const API_URL = 'https://api.example.com';",
            )
        ],
    )

    await provider.post_review(123, review)
    print("Review posted!")


async def example_gitlab():
    """Example: Using GitLab provider."""
    config = ProviderConfig(
        provider_type=ProviderType.GITLAB,
        gitlab_project="group/project",
        gitlab_token="glpat-xxxxxxxxxxxxxxxxxxxx",
        gitlab_instance_url="https://gitlab.com",
        project_dir=Path.cwd(),
    )

    provider = create_provider(config)

    # Fetch a merge request (GitLab's term for PR)
    mr = await provider.fetch_pr(456)
    print(f"GitLab MR !{mr.number}: {mr.title}")
    print(f"Author: {mr.author}")
    print(f"State: {mr.state}")
    print(f"Changed files: {mr.changed_files}")

    # Same review interface works!
    from ..github.providers.protocol import ReviewData

    review = ReviewData(
        pr_number=456,
        event="approve",
        body="LGTM! Approving.",
        findings=[],
    )

    await provider.post_review(456, review)
    print("Review posted and MR approved!")


async def example_provider_agnostic(provider_type: str, pr_number: int):
    """
    Example: Provider-agnostic code that works with ANY provider.

    This demonstrates the power of the factory pattern - the same code
    works regardless of which git host you're using.
    """
    # Configuration would come from project settings
    if provider_type == "github":
        config = ProviderConfig(
            provider_type=ProviderType.GITHUB,
            github_repo="owner/repo",
        )
    elif provider_type == "gitlab":
        config = ProviderConfig(
            provider_type=ProviderType.GITLAB,
            gitlab_project="group/project",
            gitlab_token="glpat-xxx",
        )
    else:
        raise ValueError(f"Unknown provider: {provider_type}")

    # Create provider using factory
    provider = create_provider(config)

    # This code works for BOTH GitHub and GitLab!
    pr = await provider.fetch_pr(pr_number)
    diff = await provider.fetch_pr_diff(pr_number)

    print(f"Analyzing {provider.provider_type.value.upper()} PR #{pr.number}")
    print(f"Title: {pr.title}")
    print(f"Author: {pr.author}")
    print(f"Files changed: {pr.changed_files}")
    print(f"Lines: +{pr.additions} -{pr.deletions}")
    print(f"\nDiff preview: {diff[:200]}...")

    # Perform automated review (same for both providers!)
    from ..github.providers.protocol import ReviewData, ReviewFinding

    findings = []

    # Check for large PRs
    if pr.changed_files > 10:
        findings.append(
            ReviewFinding(
                id="large-pr",
                severity="info",
                category="process",
                title="Large PR",
                description=f"This PR changes {pr.changed_files} files. "
                "Consider breaking it into smaller PRs for easier review.",
            )
        )

    # Check for missing description
    if not pr.body or len(pr.body) < 50:
        findings.append(
            ReviewFinding(
                id="missing-description",
                severity="low",
                category="documentation",
                title="PR description is too short",
                description="Please add a detailed description explaining what this PR does and why.",
            )
        )

    if findings:
        review = ReviewData(
            pr_number=pr_number,
            event="comment",
            body="Automated review completed. Please address the findings below:",
            findings=findings,
        )
        await provider.post_review(pr_number, review)
        print(f"\nPosted automated review with {len(findings)} findings")
    else:
        print("\nNo issues found!")


async def example_from_env_config():
    """Example: Creating provider from project env config."""
    from .factory import create_provider_from_env

    # This would typically come from reading project/.env
    env_config = {
        "githubRepo": "owner/repo",
        "githubToken": "ghp_xxx",
        # OR for GitLab:
        # "gitlabProject": "group/project",
        # "gitlabToken": "glpat-xxx",
        # "gitlabInstanceUrl": "https://gitlab.com"
    }

    provider = create_provider_from_env(
        provider_type="github",  # or "gitlab"
        project_dir=Path.cwd(),
        env_config=env_config,
    )

    pr = await provider.fetch_pr(789)
    print(f"Fetched PR: {pr.title}")


if __name__ == "__main__":
    # Run examples
    print("=" * 60)
    print("GitHub Example")
    print("=" * 60)
    # asyncio.run(example_github())

    print("\n" + "=" * 60)
    print("GitLab Example")
    print("=" * 60)
    # asyncio.run(example_gitlab())

    print("\n" + "=" * 60)
    print("Provider-Agnostic Example")
    print("=" * 60)
    # asyncio.run(example_provider_agnostic("github", 123))

    print("\nExamples ready to run - uncomment the asyncio.run() calls above")
