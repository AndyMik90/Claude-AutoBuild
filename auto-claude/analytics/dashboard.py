"""
Metrics Dashboard
=================

CLI dashboard for viewing build analytics and metrics.
Provides formatted output for the terminal.
"""

from collections import defaultdict
from typing import Any

from analytics.collector import BuildMetrics, load_all_metrics


def format_duration(seconds: float) -> str:
    """Format duration in human-readable format."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}m"
    else:
        hours = seconds / 3600
        return f"{hours:.1f}h"


def format_tokens(tokens: int) -> str:
    """Format token count in human-readable format."""
    if tokens < 1000:
        return str(tokens)
    elif tokens < 1_000_000:
        return f"{tokens / 1000:.1f}K"
    else:
        return f"{tokens / 1_000_000:.2f}M"


def format_cost(cost: float) -> str:
    """Format cost in USD."""
    if cost < 0.01:
        return f"${cost:.4f}"
    elif cost < 1:
        return f"${cost:.2f}"
    else:
        return f"${cost:.2f}"


def display_metrics_dashboard(limit: int = 20) -> None:
    """
    Display a formatted metrics dashboard in the terminal.

    Args:
        limit: Maximum number of recent builds to show
    """
    metrics_list = load_all_metrics(limit=limit)

    if not metrics_list:
        print("\n  No build metrics found.\n")
        print("  Metrics are automatically collected during builds.")
        print("  Run a spec build to start collecting metrics.\n")
        return

    print("\n" + "=" * 70)
    print("  BUILD ANALYTICS DASHBOARD")
    print("=" * 70)

    # Summary stats
    _print_summary(metrics_list)

    # Recent builds
    _print_recent_builds(metrics_list[:10])

    # Complexity breakdown
    _print_complexity_breakdown(metrics_list)

    # Failure analysis
    _print_failure_analysis(metrics_list)

    # Cost analysis
    _print_cost_analysis(metrics_list)

    print()


def _print_summary(metrics_list: list[BuildMetrics]) -> None:
    """Print summary statistics."""
    total_builds = len(metrics_list)
    successful = sum(1 for m in metrics_list if m.success)
    failed = total_builds - successful

    total_time = sum(m.total_duration_seconds for m in metrics_list)
    total_tokens = sum(m.total_tokens for m in metrics_list)
    total_cost = sum(m.cost_estimate_usd for m in metrics_list)

    success_rate = (successful / total_builds * 100) if total_builds > 0 else 0

    print("\n  SUMMARY")
    print("  " + "-" * 40)
    print(f"  Total builds:     {total_builds}")
    print(f"  Successful:       {successful} ({success_rate:.0f}%)")
    print(f"  Failed:           {failed}")
    print(f"  Total time:       {format_duration(total_time)}")
    print(f"  Total tokens:     {format_tokens(total_tokens)}")
    print(f"  Total cost:       {format_cost(total_cost)}")


def _print_recent_builds(metrics_list: list[BuildMetrics]) -> None:
    """Print recent builds table."""
    if not metrics_list:
        return

    print("\n  RECENT BUILDS")
    print("  " + "-" * 40)
    print(f"  {'Spec':<25} {'Status':<8} {'Time':<8} {'Tokens':<10}")
    print("  " + "-" * 51)

    for m in metrics_list:
        status = "✓" if m.success else "✗"
        print(
            f"  {m.spec_name[:25]:<25} {status:<8} "
            f"{format_duration(m.total_duration_seconds):<8} "
            f"{format_tokens(m.total_tokens):<10}"
        )


def _print_complexity_breakdown(metrics_list: list[BuildMetrics]) -> None:
    """Print breakdown by complexity level."""
    by_complexity: dict[str, list[BuildMetrics]] = defaultdict(list)
    for m in metrics_list:
        by_complexity[m.complexity].append(m)

    if not by_complexity:
        return

    print("\n  BY COMPLEXITY")
    print("  " + "-" * 40)
    print(f"  {'Complexity':<12} {'Count':<8} {'Avg Time':<10} {'Success Rate':<12}")
    print("  " + "-" * 42)

    for complexity in ["simple", "standard", "complex"]:
        builds = by_complexity.get(complexity, [])
        if not builds:
            continue

        count = len(builds)
        avg_time = sum(b.total_duration_seconds for b in builds) / count
        success_rate = sum(1 for b in builds if b.success) / count * 100

        print(
            f"  {complexity.capitalize():<12} {count:<8} "
            f"{format_duration(avg_time):<10} {success_rate:.0f}%"
        )


def _print_failure_analysis(metrics_list: list[BuildMetrics]) -> None:
    """Print common failure points."""
    failed_phases: dict[str, int] = defaultdict(int)

    for m in metrics_list:
        for phase in m.phases:
            if not phase.success:
                failed_phases[phase.name] += 1

    if not failed_phases:
        return

    print("\n  COMMON FAILURE POINTS")
    print("  " + "-" * 40)

    sorted_failures = sorted(failed_phases.items(), key=lambda x: x[1], reverse=True)
    for phase, count in sorted_failures[:5]:
        print(f"  {phase}: {count} failures")


def _print_cost_analysis(metrics_list: list[BuildMetrics]) -> None:
    """Print cost analysis by provider."""
    by_provider: dict[str, list[BuildMetrics]] = defaultdict(list)
    for m in metrics_list:
        by_provider[m.provider].append(m)

    if not by_provider:
        return

    print("\n  COST BY PROVIDER")
    print("  " + "-" * 40)
    print(f"  {'Provider':<12} {'Builds':<8} {'Tokens':<12} {'Est. Cost':<10}")
    print("  " + "-" * 42)

    for provider, builds in sorted(by_provider.items()):
        count = len(builds)
        total_tokens = sum(b.total_tokens for b in builds)
        total_cost = sum(b.cost_estimate_usd for b in builds)

        print(
            f"  {provider.capitalize():<12} {count:<8} "
            f"{format_tokens(total_tokens):<12} {format_cost(total_cost):<10}"
        )


def format_metrics_summary(metrics: BuildMetrics) -> str:
    """
    Format a single build's metrics as a summary string.

    Args:
        metrics: BuildMetrics to format

    Returns:
        Formatted summary string
    """
    status = "SUCCESS" if metrics.success else "FAILED"
    lines = [
        f"Build: {metrics.spec_name}",
        f"Status: {status}",
        f"Duration: {format_duration(metrics.total_duration_seconds)}",
        f"Provider: {metrics.provider} ({metrics.model})",
        f"Tokens: {format_tokens(metrics.total_tokens)}",
        f"Cost: {format_cost(metrics.cost_estimate_usd)}",
        f"QA Iterations: {metrics.qa_iterations}",
        f"Files: {metrics.total_files_modified} modified, {metrics.total_files_created} created",
    ]

    if metrics.phases:
        lines.append("\nPhases:")
        for phase in metrics.phases:
            status_icon = "✓" if phase.success else "✗"
            lines.append(
                f"  {status_icon} {phase.name}: {format_duration(phase.duration_seconds)}"
            )

    return "\n".join(lines)


def get_analytics_report(limit: int = 100) -> dict[str, Any]:
    """
    Get analytics report as structured data.

    Args:
        limit: Maximum number of builds to analyze

    Returns:
        Dictionary with analytics data
    """
    metrics_list = load_all_metrics(limit=limit)

    if not metrics_list:
        return {
            "total_builds": 0,
            "success_rate": 0,
            "avg_duration": 0,
            "avg_tokens": 0,
            "total_cost": 0,
            "by_complexity": {},
            "by_provider": {},
            "recent_builds": [],
        }

    total = len(metrics_list)
    successful = sum(1 for m in metrics_list if m.success)

    by_complexity: dict[str, dict[str, Any]] = {}
    for complexity in ["simple", "standard", "complex"]:
        builds = [m for m in metrics_list if m.complexity == complexity]
        if builds:
            by_complexity[complexity] = {
                "count": len(builds),
                "avg_duration": sum(b.total_duration_seconds for b in builds)
                / len(builds),
                "success_rate": sum(1 for b in builds if b.success) / len(builds),
            }

    by_provider: dict[str, dict[str, Any]] = {}
    providers = set(m.provider for m in metrics_list)
    for provider in providers:
        builds = [m for m in metrics_list if m.provider == provider]
        by_provider[provider] = {
            "count": len(builds),
            "total_tokens": sum(b.total_tokens for b in builds),
            "total_cost": sum(b.cost_estimate_usd for b in builds),
        }

    return {
        "total_builds": total,
        "success_rate": successful / total if total > 0 else 0,
        "avg_duration": sum(m.total_duration_seconds for m in metrics_list) / total,
        "avg_tokens": sum(m.total_tokens for m in metrics_list) / total,
        "total_cost": sum(m.cost_estimate_usd for m in metrics_list),
        "by_complexity": by_complexity,
        "by_provider": by_provider,
        "recent_builds": [m.to_dict() for m in metrics_list[:10]],
    }
