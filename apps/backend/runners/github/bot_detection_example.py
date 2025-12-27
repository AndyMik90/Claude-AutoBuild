"""
Bot Detection Integration Example
==================================

Demonstrates how to use the bot detection system to prevent infinite loops.
"""

from pathlib import Path

from models import GitHubRunnerConfig
from orchestrator import GitHubOrchestrator


async def example_with_bot_detection():
    """Example: Reviewing PRs with bot detection enabled."""

    # Create config with bot detection
    config = GitHubRunnerConfig(
        token="ghp_user_token",
        repo="owner/repo",
        bot_token="ghp_bot_token",  # Bot's token for self-identification
        pr_review_enabled=True,
        auto_post_reviews=False,  # Manual review posting for this example
        review_own_prs=False,  # CRITICAL: Prevent reviewing own PRs
    )

    # Initialize orchestrator (bot detector is auto-initialized)
    orchestrator = GitHubOrchestrator(
        project_dir=Path("/path/to/project"),
        config=config,
    )

    print(f"Bot username: {orchestrator.bot_detector.bot_username}")
    print(f"Review own PRs: {orchestrator.bot_detector.review_own_prs}")
    print(
        f"Cooling off period: {orchestrator.bot_detector.COOLING_OFF_MINUTES} minutes"
    )
    print()

    # Scenario 1: Review a human-authored PR
    print("=== Scenario 1: Human PR ===")
    result = await orchestrator.review_pr(pr_number=123)
    print(f"Result: {result.summary}")
    print(f"Findings: {len(result.findings)}")
    print()

    # Scenario 2: Try to review immediately again (cooling off)
    print("=== Scenario 2: Immediate re-review (should skip) ===")
    result = await orchestrator.review_pr(pr_number=123)
    print(f"Result: {result.summary}")
    print()

    # Scenario 3: Review bot-authored PR (should skip)
    print("=== Scenario 3: Bot-authored PR (should skip) ===")
    result = await orchestrator.review_pr(pr_number=456)  # Assume this is bot's PR
    print(f"Result: {result.summary}")
    print()

    # Check statistics
    stats = orchestrator.bot_detector.get_stats()
    print("=== Bot Detection Statistics ===")
    print(f"Bot username: {stats['bot_username']}")
    print(f"Total PRs tracked: {stats['total_prs_tracked']}")
    print(f"Total reviews: {stats['total_reviews_performed']}")


async def example_manual_state_management():
    """Example: Manually managing bot detection state."""

    config = GitHubRunnerConfig(
        token="ghp_user_token",
        repo="owner/repo",
        bot_token="ghp_bot_token",
        review_own_prs=False,
    )

    orchestrator = GitHubOrchestrator(
        project_dir=Path("/path/to/project"),
        config=config,
    )

    detector = orchestrator.bot_detector

    # Manually check if PR should be skipped
    pr_data = {"author": {"login": "alice"}}
    commits = [
        {"author": {"login": "alice"}, "oid": "abc123"},
        {"author": {"login": "alice"}, "oid": "def456"},
    ]

    should_skip, reason = detector.should_skip_pr_review(
        pr_number=789,
        pr_data=pr_data,
        commits=commits,
    )

    if should_skip:
        print(f"Skipping PR #789: {reason}")
    else:
        print("PR #789 is safe to review")
        # Proceed with review...
        # After review:
        detector.mark_reviewed(789, "abc123")

    # Clear state when PR is closed/merged
    detector.clear_pr_state(789)


def example_configuration_options():
    """Example: Different configuration scenarios."""

    # Option 1: Strict bot detection (recommended)
    strict_config = GitHubRunnerConfig(
        token="ghp_user_token",
        repo="owner/repo",
        bot_token="ghp_bot_token",
        review_own_prs=False,  # Bot cannot review own PRs
    )

    # Option 2: Allow bot self-review (testing only)
    permissive_config = GitHubRunnerConfig(
        token="ghp_user_token",
        repo="owner/repo",
        bot_token="ghp_bot_token",
        review_own_prs=True,  # Bot CAN review own PRs
    )

    # Option 3: No bot detection (no bot token)
    no_detection_config = GitHubRunnerConfig(
        token="ghp_user_token",
        repo="owner/repo",
        bot_token=None,  # No bot identification
        review_own_prs=False,
    )

    print("Strict config:", strict_config.review_own_prs)
    print("Permissive config:", permissive_config.review_own_prs)
    print("No detection config:", no_detection_config.bot_token)


if __name__ == "__main__":
    print("Bot Detection Integration Examples\n")

    print("\n1. Configuration Options")
    print("=" * 50)
    example_configuration_options()

    print("\n2. With Bot Detection (requires GitHub setup)")
    print("=" * 50)
    print("Run: asyncio.run(example_with_bot_detection())")

    print("\n3. Manual State Management")
    print("=" * 50)
    print("Run: asyncio.run(example_manual_state_management())")
