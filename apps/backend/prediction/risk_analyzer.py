"""
Risk analysis and similarity detection for subtasks.
Analyzes subtasks to predict issues based on work type and historical failures.
"""

import re

from .models import PredictedIssue
from .patterns import detect_work_type, get_common_issues


class RiskAnalyzer:
    """Analyzes subtask risks and finds similar past failures."""

    def __init__(self, common_issues: dict[str, list[PredictedIssue]] | None = None):
        """
        Initialize the risk analyzer.

        Args:
            common_issues: Optional custom issue patterns. If None, uses default patterns.
        """
        self.common_issues = common_issues or get_common_issues()

    def analyze_subtask_risks(
        self,
        subtask: dict,
        attempt_history: list[dict] | None = None,
    ) -> list[PredictedIssue]:
        """
        Predict likely issues for a subtask based on work type and history.

        Args:
            subtask: Subtask dictionary with keys like description, files_to_modify, etc.
            attempt_history: Optional list of historical attempts

        Returns:
            List of predicted issues, sorted by likelihood (high first)
        """
        issues = []

        # Get work types
        work_types = detect_work_type(subtask)

        # Add common issues for detected work types
        for work_type in work_types:
            if work_type in self.common_issues:
                issues.extend(self.common_issues[work_type])

        # Add issues from similar past failures
        if attempt_history:
            similar_failures = self.find_similar_failures(subtask, attempt_history)
            for failure in similar_failures:
                failure_reason = failure.get("failure_reason", "")
                if failure_reason:
                    issues.append(
                        PredictedIssue(
                            "pattern",
                            f"Similar subtask failed: {failure_reason}",
                            "high",
                            "Review the failed attempt in memory/attempt_history.json",
                        )
                    )

        # Deduplicate by description
        seen = set()
        unique_issues = []
        for issue in issues:
            if issue.description not in seen:
                seen.add(issue.description)
                unique_issues.append(issue)

        # Sort by likelihood (high first)
        likelihood_order = {"high": 0, "medium": 1, "low": 2}
        unique_issues.sort(key=lambda i: likelihood_order.get(i.likelihood, 3))

        # Return top 7 most relevant
        return unique_issues[:7]

    def find_similar_failures(
        self,
        subtask: dict,
        attempt_history: list[dict],
    ) -> list[dict]:
        """
        Find subtasks similar to this one that failed before.

        Args:
            subtask: Current subtask to analyze
            attempt_history: List of historical attempts

        Returns:
            List of similar failed attempts with similarity scores
        """
        if not attempt_history:
            return []

        subtask_desc = subtask.get("description", "").lower()
        subtask_files = set(
            subtask.get("files_to_modify", []) + subtask.get("files_to_create", [])
        )

        similar = []
        for attempt in attempt_history:
            # Only look at failures
            if attempt.get("status") != "failed":
                continue

            # Check similarity
            attempt_desc = attempt.get("subtask_description", "").lower()
            attempt_files = set(attempt.get("files_modified", []))

            # Calculate similarity score
            score = 0

            # Description keyword overlap
            subtask_keywords = set(re.findall(r"\w+", subtask_desc))
            attempt_keywords = set(re.findall(r"\w+", attempt_desc))
            common_keywords = subtask_keywords & attempt_keywords
            if common_keywords:
                score += len(common_keywords)

            # File overlap
            common_files = subtask_files & attempt_files
            if common_files:
                score += len(common_files) * 3  # Files are stronger signal

            if score > 2:  # Threshold for similarity
                similar.append(
                    {
                        "subtask_id": attempt.get("subtask_id"),
                        "description": attempt.get("subtask_description"),
                        "failure_reason": attempt.get("error_message", "Unknown error"),
                        "similarity_score": score,
                    }
                )

        # Sort by similarity
        similar.sort(key=lambda x: x["similarity_score"], reverse=True)
        return similar[:3]  # Top 3 similar failures
