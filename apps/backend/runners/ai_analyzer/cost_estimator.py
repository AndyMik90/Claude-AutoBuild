"""
Cost estimation for AI analysis operations.
"""

from pathlib import Path
from typing import Any

from .models import CostEstimate


class CostEstimator:
    """Estimates API costs before running analysis."""

    # Claude Sonnet pricing per 1M tokens (input)
    COST_PER_1M_TOKENS = 9.00

    # Token estimation factors
    TOKENS_PER_ROUTE = 500
    TOKENS_PER_MODEL = 300
    TOKENS_PER_FILE = 200

    def __init__(self, project_dir: Path, project_index: dict[str, Any]):
        """
        Initialize cost estimator.

        Args:
            project_dir: Root directory of project
            project_index: Output from programmatic analyzer
        """
        self.project_dir = project_dir
        self.project_index = project_index

    def estimate_cost(self) -> CostEstimate:
        """
        Estimate API cost before running analysis.

        Returns:
            Cost estimation data
        """
        services = self.project_index.get("services", {})
        if not services:
            return CostEstimate(
                estimated_tokens=0,
                estimated_cost_usd=0.0,
                files_to_analyze=0,
                routes_count=0,
                models_count=0,
            )

        # Count items from programmatic analysis
        total_routes = 0
        total_models = 0

        for service_data in services.values():
            total_routes += service_data.get("api", {}).get("total_routes", 0)
            total_models += service_data.get("database", {}).get("total_models", 0)

        # Count Python files in project (excluding virtual environments)
        total_files = self._count_python_files()

        # Calculate estimated tokens
        estimated_tokens = (
            (total_routes * self.TOKENS_PER_ROUTE)
            + (total_models * self.TOKENS_PER_MODEL)
            + (total_files * self.TOKENS_PER_FILE)
        )

        # Calculate estimated cost
        estimated_cost = (estimated_tokens / 1_000_000) * self.COST_PER_1M_TOKENS

        return CostEstimate(
            estimated_tokens=estimated_tokens,
            estimated_cost_usd=estimated_cost,
            files_to_analyze=total_files,
            routes_count=total_routes,
            models_count=total_models,
        )

    def _count_python_files(self) -> int:
        """
        Count Python files in project, excluding common ignored directories.

        Returns:
            Number of Python files to analyze
        """
        python_files = list(self.project_dir.glob("**/*.py"))
        excluded_dirs = {".venv", "venv", "node_modules", "__pycache__", ".git"}

        return len(
            [
                f
                for f in python_files
                if not any(excluded in f.parts for excluded in excluded_dirs)
            ]
        )
