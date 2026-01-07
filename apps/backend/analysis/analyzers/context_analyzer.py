"""
Context Analyzer Module
=======================

Orchestrates comprehensive project context analysis including:
- Environment variables and configuration
- External service integrations
- Authentication patterns
- Database migrations
- Background jobs/task queues
- API documentation
- Monitoring and observability

This module delegates to specialized detectors for clean separation of concerns.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .base import BaseAnalyzer
from .context import (
    ApiDocsDetector,
    AuthDetector,
    EnvironmentDetector,
    JobsDetector,
    MigrationsDetector,
    MonitoringDetector,
    ServicesDetector,
)


class ContextAnalyzer(BaseAnalyzer):
    """Orchestrates project context and configuration analysis."""

    def __init__(self, path: Path, analysis: dict[str, Any]):
        super().__init__(path)
        self.analysis = analysis

    def detect_environment_variables(self) -> None:
        """
        Discover all environment variables from multiple sources.

        Delegates to EnvironmentDetector for actual detection logic.
        """
        detector = EnvironmentDetector(self.path, self.analysis)
        detector.detect()

    def detect_external_services(self) -> None:
        """
        Detect external service integrations.

        Delegates to ServicesDetector for actual detection logic.
        """
        detector = ServicesDetector(self.path, self.analysis)
        detector.detect()

    def detect_auth_patterns(self) -> None:
        """
        Detect authentication and authorization patterns.

        Delegates to AuthDetector for actual detection logic.
        """
        detector = AuthDetector(self.path, self.analysis)
        detector.detect()

    def detect_migrations(self) -> None:
        """
        Detect database migration setup.

        Delegates to MigrationsDetector for actual detection logic.
        """
        detector = MigrationsDetector(self.path, self.analysis)
        detector.detect()

    def detect_background_jobs(self) -> None:
        """
        Detect background job/task queue systems.

        Delegates to JobsDetector for actual detection logic.
        """
        detector = JobsDetector(self.path, self.analysis)
        detector.detect()

    def detect_api_documentation(self) -> None:
        """
        Detect API documentation setup.

        Delegates to ApiDocsDetector for actual detection logic.
        """
        detector = ApiDocsDetector(self.path, self.analysis)
        detector.detect()

    def detect_monitoring(self) -> None:
        """
        Detect monitoring and observability setup.

        Delegates to MonitoringDetector for actual detection logic.
        """
        detector = MonitoringDetector(self.path, self.analysis)
        detector.detect()
