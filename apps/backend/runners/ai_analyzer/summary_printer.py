"""
Summary printing and output formatting for analysis results.
"""

from typing import Any


class SummaryPrinter:
    """Prints formatted summaries of AI analysis results."""

    ANALYZER_NAMES = [
        "code_relationships",
        "business_logic",
        "architecture",
        "security",
        "performance",
        "code_quality",
    ]

    @staticmethod
    def print_summary(insights: dict[str, Any]) -> None:
        """
        Print a summary of the AI insights.

        Args:
            insights: Analysis results dictionary
        """
        print("\n" + "=" * 60)
        print("  AI ANALYSIS SUMMARY")
        print("=" * 60)

        if "error" in insights:
            print(f"\n✗ Error: {insights['error']}")
            return

        SummaryPrinter._print_scores(insights)
        SummaryPrinter._print_security_issues(insights)
        SummaryPrinter._print_performance_issues(insights)

    @staticmethod
    def _print_scores(insights: dict[str, Any]) -> None:
        """Print overall and individual analyzer scores."""
        print(f"\n📊 Overall Score: {insights.get('overall_score', 0)}/100")
        print(f"⏰ Analysis Time: {insights.get('analysis_timestamp', 'unknown')}")

        print("\n🤖 Analyzer Scores:")
        for name in SummaryPrinter.ANALYZER_NAMES:
            if name in insights and "error" not in insights[name]:
                score = insights[name].get("score", 0)
                display_name = name.replace("_", " ").title()
                print(f"   {display_name:<25} {score}/100")

    @staticmethod
    def _print_security_issues(insights: dict[str, Any]) -> None:
        """Print security vulnerabilities summary."""
        if "security" not in insights:
            return

        vulnerabilities = insights["security"].get("vulnerabilities", [])
        if not vulnerabilities:
            return

        print(f"\n🔒 Security: Found {len(vulnerabilities)} vulnerabilities")
        for vuln in vulnerabilities[:3]:
            severity = vuln.get("severity", "unknown")
            vuln_type = vuln.get("type", "Unknown")
            print(f"   - [{severity}] {vuln_type}")

    @staticmethod
    def _print_performance_issues(insights: dict[str, Any]) -> None:
        """Print performance bottlenecks summary."""
        if "performance" not in insights:
            return

        bottlenecks = insights["performance"].get("bottlenecks", [])
        if not bottlenecks:
            return

        print(f"\n⚡ Performance: Found {len(bottlenecks)} bottlenecks")
        for bn in bottlenecks[:3]:
            bn_type = bn.get("type", "Unknown")
            location = bn.get("location", "unknown")
            print(f"   - {bn_type} in {location}")

    @staticmethod
    def print_cost_estimate(cost_estimate: dict[str, Any]) -> None:
        """
        Print cost estimation information.

        Args:
            cost_estimate: Cost estimation data
        """
        print("\n📊 Cost Estimate:")
        print(f"   Tokens: ~{cost_estimate['estimated_tokens']:,}")
        print(f"   Cost: ~${cost_estimate['estimated_cost_usd']:.4f} USD")
        print(f"   Files: {cost_estimate['files_to_analyze']}")
        print()
