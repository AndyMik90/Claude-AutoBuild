"""
Build Analytics and Metrics
============================

Provides tracking and visualization of build metrics for identifying
bottlenecks and measuring success rates.

Usage:
    from analytics import BuildMetrics, display_metrics_dashboard

    # Track a build
    metrics = BuildMetrics(spec_name="001-feature")
    metrics.start_build()
    metrics.record_phase("planning", duration=120.5, tokens=5000)
    metrics.end_build(success=True)

    # Display dashboard
    display_metrics_dashboard()
"""

from analytics.collector import (
    BuildMetrics,
    PhaseMetrics,
    load_all_metrics,
    load_metrics,
    save_metrics,
)
from analytics.dashboard import (
    display_metrics_dashboard,
    format_metrics_summary,
    get_analytics_report,
)

__all__ = [
    "BuildMetrics",
    "PhaseMetrics",
    "save_metrics",
    "load_metrics",
    "load_all_metrics",
    "display_metrics_dashboard",
    "format_metrics_summary",
    "get_analytics_report",
]
