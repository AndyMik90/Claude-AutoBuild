#!/usr/bin/env python3
"""
Predictive Bug Prevention
==========================

Generates pre-implementation checklists to prevent common bugs BEFORE they happen.
Uses historical data from memory system and pattern analysis to predict likely issues.

The key insight: Most bugs are predictable based on:
1. Type of work (API, frontend, database, etc.)
2. Past failures in similar subtasks
3. Known gotchas in this codebase
4. Missing integration points

Usage:
    from prediction import BugPredictor

    predictor = BugPredictor(spec_dir)
    checklist = predictor.generate_checklist(subtask)
    markdown = predictor.format_checklist_markdown(checklist)
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class PredictedIssue:
    """A potential issue that might occur during implementation."""
    category: str  # "integration", "pattern", "edge_case", "security", "performance"
    description: str
    likelihood: str  # "high", "medium", "low"
    prevention: str  # How to avoid it

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "description": self.description,
            "likelihood": self.likelihood,
            "prevention": self.prevention,
        }


@dataclass
class PreImplementationChecklist:
    """Complete checklist for a subtask before implementation."""
    subtask_id: str
    subtask_description: str
    predicted_issues: list[PredictedIssue] = field(default_factory=list)
    patterns_to_follow: list[str] = field(default_factory=list)
    files_to_reference: list[str] = field(default_factory=list)
    common_mistakes: list[str] = field(default_factory=list)
    verification_reminders: list[str] = field(default_factory=list)


class BugPredictor:
    """Predicts likely bugs and generates pre-implementation checklists."""

    def __init__(self, spec_dir: Path):
        """
        Initialize the bug predictor.

        Args:
            spec_dir: Path to the spec directory (e.g., auto-claude/specs/001-feature/)
        """
        self.spec_dir = Path(spec_dir)
        self.memory_dir = self.spec_dir / "memory"
        self.gotchas_file = self.memory_dir / "gotchas.md"
        self.patterns_file = self.memory_dir / "patterns.md"
        self.history_file = self.memory_dir / "attempt_history.json"

        # Common issue patterns by work type
        self.COMMON_ISSUES = self._get_common_issues()

    def _get_common_issues(self) -> dict[str, list[PredictedIssue]]:
        """Get common issue patterns by work type."""
        return {
            "api_endpoint": [
                PredictedIssue(
                    "integration",
                    "CORS configuration missing or incorrect",
                    "high",
                    "Check existing CORS setup in similar endpoints and ensure new routes are included"
                ),
                PredictedIssue(
                    "security",
                    "Authentication middleware not applied",
                    "high",
                    "Verify auth decorator is applied if endpoint requires authentication"
                ),
                PredictedIssue(
                    "pattern",
                    "Response format doesn't match API conventions",
                    "medium",
                    "Check existing endpoints for response structure (e.g., {\"data\": ..., \"error\": ...})"
                ),
                PredictedIssue(
                    "edge_case",
                    "Missing input validation",
                    "high",
                    "Add validation for all user inputs to prevent invalid data and SQL injection"
                ),
                PredictedIssue(
                    "edge_case",
                    "Error handling not comprehensive",
                    "medium",
                    "Handle edge cases: missing fields, invalid types, database errors, etc."
                ),
            ],
            "database_model": [
                PredictedIssue(
                    "integration",
                    "Database migration not created or run",
                    "high",
                    "Create migration after model changes and run db upgrade before testing"
                ),
                PredictedIssue(
                    "pattern",
                    "Field naming doesn't match conventions",
                    "medium",
                    "Check existing models for naming style (snake_case, timestamps, etc.)"
                ),
                PredictedIssue(
                    "edge_case",
                    "Missing indexes on frequently queried fields",
                    "low",
                    "Add indexes for foreign keys and fields used in WHERE clauses"
                ),
                PredictedIssue(
                    "pattern",
                    "Relationship configuration incorrect",
                    "medium",
                    "Check existing relationships for backref and cascade patterns"
                ),
            ],
            "frontend_component": [
                PredictedIssue(
                    "integration",
                    "API client not used correctly",
                    "high",
                    "Use existing ApiClient or hook pattern, don't call fetch() directly"
                ),
                PredictedIssue(
                    "pattern",
                    "State management doesn't follow conventions",
                    "medium",
                    "Follow existing hook patterns (useState, useEffect, custom hooks)"
                ),
                PredictedIssue(
                    "edge_case",
                    "Loading and error states not handled",
                    "high",
                    "Show loading indicator during async operations and display errors to users"
                ),
                PredictedIssue(
                    "pattern",
                    "Styling doesn't match design system",
                    "low",
                    "Use existing CSS classes or styled components from the design system"
                ),
                PredictedIssue(
                    "edge_case",
                    "Form validation missing",
                    "medium",
                    "Add client-side validation before submission and show helpful error messages"
                ),
            ],
            "celery_task": [
                PredictedIssue(
                    "integration",
                    "Task not registered with Celery app",
                    "high",
                    "Import task in celery app initialization or __init__.py"
                ),
                PredictedIssue(
                    "pattern",
                    "Arguments not JSON-serializable",
                    "high",
                    "Use only JSON-serializable arguments (no objects, use IDs instead)"
                ),
                PredictedIssue(
                    "edge_case",
                    "Retry logic not implemented",
                    "medium",
                    "Add retry decorator for network/external service failures"
                ),
                PredictedIssue(
                    "integration",
                    "Task not called from correct location",
                    "medium",
                    "Call with .delay() or .apply_async() after database commit"
                ),
            ],
            "authentication": [
                PredictedIssue(
                    "security",
                    "Password not hashed",
                    "high",
                    "Use bcrypt or similar for password hashing, never store plaintext"
                ),
                PredictedIssue(
                    "security",
                    "Token not validated properly",
                    "high",
                    "Verify token signature and expiration on every request"
                ),
                PredictedIssue(
                    "security",
                    "Session not invalidated on logout",
                    "medium",
                    "Clear session/token on logout and after password changes"
                ),
            ],
            "database_query": [
                PredictedIssue(
                    "performance",
                    "N+1 query problem",
                    "medium",
                    "Use eager loading (joinedload/selectinload) for relationships"
                ),
                PredictedIssue(
                    "security",
                    "SQL injection vulnerability",
                    "high",
                    "Use parameterized queries, never concatenate user input into SQL"
                ),
                PredictedIssue(
                    "edge_case",
                    "Large result sets not paginated",
                    "medium",
                    "Add pagination for queries that could return many results"
                ),
            ],
            "file_upload": [
                PredictedIssue(
                    "security",
                    "File type not validated",
                    "high",
                    "Validate file extension and MIME type, don't trust user input"
                ),
                PredictedIssue(
                    "security",
                    "File size not limited",
                    "high",
                    "Set maximum file size to prevent DoS attacks"
                ),
                PredictedIssue(
                    "edge_case",
                    "Uploaded files not cleaned up on error",
                    "low",
                    "Use try/finally or context managers to ensure cleanup"
                ),
            ],
        }

    def load_known_gotchas(self) -> list[str]:
        """Load gotchas from previous sessions."""
        if not self.gotchas_file.exists():
            return []

        gotchas = []
        content = self.gotchas_file.read_text()

        # Parse markdown list items
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('-') or line.startswith('*'):
                gotcha = line.lstrip('-*').strip()
                if gotcha:
                    gotchas.append(gotcha)

        return gotchas

    def load_known_patterns(self) -> list[str]:
        """Load successful patterns from previous sessions."""
        if not self.patterns_file.exists():
            return []

        patterns = []
        content = self.patterns_file.read_text()

        # Parse markdown sections
        current_pattern = None
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('##'):
                # Pattern heading
                current_pattern = line.lstrip('#').strip()
            elif line and current_pattern:
                # Pattern detail
                if line.startswith('-') or line.startswith('*'):
                    detail = line.lstrip('-*').strip()
                    patterns.append(f"{current_pattern}: {detail}")

        return patterns

    def load_attempt_history(self) -> list[dict]:
        """Load historical subtask attempts."""
        if not self.history_file.exists():
            return []

        try:
            with open(self.history_file) as f:
                history = json.load(f)
                return history.get("attempts", [])
        except (json.JSONDecodeError, IOError):
            return []

    def _detect_work_type(self, subtask: dict) -> list[str]:
        """
        Detect what type of work this subtask involves.

        Returns a list of work types (e.g., ["api_endpoint", "database_model"])
        """
        work_types = []

        description = subtask.get("description", "").lower()
        files = subtask.get("files_to_modify", []) + subtask.get("files_to_create", [])
        service = subtask.get("service", "").lower()

        # API endpoint detection
        if any(kw in description for kw in ["endpoint", "api", "route", "request", "response"]):
            work_types.append("api_endpoint")
        if any("routes" in f or "api" in f for f in files):
            work_types.append("api_endpoint")

        # Database model detection
        if any(kw in description for kw in ["model", "database", "migration", "schema"]):
            work_types.append("database_model")
        if any("models" in f or "migration" in f for f in files):
            work_types.append("database_model")

        # Frontend component detection
        if service in ["frontend", "web", "ui"]:
            work_types.append("frontend_component")
        if any(f.endswith(('.tsx', '.jsx', '.vue', '.svelte')) for f in files):
            work_types.append("frontend_component")

        # Celery task detection
        if "celery" in description or "task" in description or "worker" in service:
            work_types.append("celery_task")
        if any("task" in f for f in files):
            work_types.append("celery_task")

        # Authentication detection
        if any(kw in description for kw in ["auth", "login", "password", "token", "session"]):
            work_types.append("authentication")

        # Database query detection
        if any(kw in description for kw in ["query", "search", "filter", "fetch"]):
            work_types.append("database_query")

        # File upload detection
        if any(kw in description for kw in ["upload", "file", "image", "attachment"]):
            work_types.append("file_upload")

        return work_types

    def analyze_subtask_risks(self, subtask: dict) -> list[PredictedIssue]:
        """
        Predict likely issues for a subtask based on work type and history.

        Args:
            subtask: Subtask dictionary with keys like description, files_to_modify, etc.

        Returns:
            List of predicted issues
        """
        issues = []

        # Get work types
        work_types = self._detect_work_type(subtask)

        # Add common issues for detected work types
        for work_type in work_types:
            if work_type in self.COMMON_ISSUES:
                issues.extend(self.COMMON_ISSUES[work_type])

        # Add issues from similar past failures
        similar_failures = self.get_similar_past_failures(subtask)
        for failure in similar_failures:
            failure_reason = failure.get("failure_reason", "")
            if failure_reason:
                issues.append(PredictedIssue(
                    "pattern",
                    f"Similar subtask failed: {failure_reason}",
                    "high",
                    f"Review the failed attempt in memory/attempt_history.json"
                ))

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

    def get_similar_past_failures(self, subtask: dict) -> list[dict]:
        """
        Find subtasks similar to this one that failed before.

        Args:
            subtask: Current subtask to analyze

        Returns:
            List of similar failed attempts from history
        """
        history = self.load_attempt_history()
        if not history:
            return []

        subtask_desc = subtask.get("description", "").lower()
        subtask_files = set(subtask.get("files_to_modify", []) + subtask.get("files_to_create", []))

        similar = []
        for attempt in history:
            # Only look at failures
            if attempt.get("status") != "failed":
                continue

            # Check similarity
            attempt_desc = attempt.get("subtask_description", "").lower()
            attempt_files = set(attempt.get("files_modified", []))

            # Calculate similarity score
            score = 0

            # Description keyword overlap
            subtask_keywords = set(re.findall(r'\w+', subtask_desc))
            attempt_keywords = set(re.findall(r'\w+', attempt_desc))
            common_keywords = subtask_keywords & attempt_keywords
            if common_keywords:
                score += len(common_keywords)

            # File overlap
            common_files = subtask_files & attempt_files
            if common_files:
                score += len(common_files) * 3  # Files are stronger signal

            if score > 2:  # Threshold for similarity
                similar.append({
                    "subtask_id": attempt.get("subtask_id"),
                    "description": attempt.get("subtask_description"),
                    "failure_reason": attempt.get("error_message", "Unknown error"),
                    "similarity_score": score,
                })

        # Sort by similarity
        similar.sort(key=lambda x: x["similarity_score"], reverse=True)
        return similar[:3]  # Top 3 similar failures

    def generate_checklist(self, subtask: dict) -> PreImplementationChecklist:
        """
        Generate a complete pre-implementation checklist for a subtask.

        Args:
            subtask: Subtask dictionary from implementation_plan.json

        Returns:
            PreImplementationChecklist ready for formatting
        """
        checklist = PreImplementationChecklist(
            subtask_id=subtask.get("id", "unknown"),
            subtask_description=subtask.get("description", ""),
        )

        # Predict issues
        checklist.predicted_issues = self.analyze_subtask_risks(subtask)

        # Load patterns to follow
        known_patterns = self.load_known_patterns()
        # Filter to most relevant patterns based on subtask
        work_types = self._detect_work_type(subtask)
        relevant_patterns = []
        for pattern in known_patterns:
            pattern_lower = pattern.lower()
            # Check if pattern mentions any work type
            if any(wt.replace("_", " ") in pattern_lower for wt in work_types):
                relevant_patterns.append(pattern)
            # Or if it mentions any file being modified
            elif any(f.split('/')[-1] in pattern_lower for f in subtask.get("files_to_modify", [])):
                relevant_patterns.append(pattern)

        checklist.patterns_to_follow = relevant_patterns[:5]  # Top 5

        # Files to reference (from subtask's patterns_from)
        checklist.files_to_reference = subtask.get("patterns_from", [])

        # Common mistakes (gotchas from memory)
        gotchas = self.load_known_gotchas()
        # Filter to relevant gotchas
        relevant_gotchas = []
        for gotcha in gotchas:
            gotcha_lower = gotcha.lower()
            # Check relevance to current subtask
            if any(kw in gotcha_lower for kw in subtask.get("description", "").lower().split()):
                relevant_gotchas.append(gotcha)
            elif any(wt.replace("_", " ") in gotcha_lower for wt in work_types):
                relevant_gotchas.append(gotcha)

        checklist.common_mistakes = relevant_gotchas[:5]  # Top 5

        # Verification reminders
        verification = subtask.get("verification", {})
        if verification:
            ver_type = verification.get("type")
            if ver_type == "api":
                checklist.verification_reminders.append(
                    f"Test API endpoint: {verification.get('method', 'GET')} {verification.get('url', '')}"
                )
            elif ver_type == "browser":
                checklist.verification_reminders.append(
                    f"Test in browser: {verification.get('scenario', 'Check functionality')}"
                )
            elif ver_type == "command":
                checklist.verification_reminders.append(
                    f"Run command: {verification.get('run', '')}"
                )

        return checklist

    def format_checklist_markdown(self, checklist: PreImplementationChecklist) -> str:
        """
        Format checklist as markdown for agent consumption.

        Args:
            checklist: PreImplementationChecklist to format

        Returns:
            Markdown-formatted checklist string
        """
        lines = []

        lines.append(f"## Pre-Implementation Checklist: {checklist.subtask_description}")
        lines.append("")

        # Predicted issues
        if checklist.predicted_issues:
            lines.append("### Predicted Issues (based on similar work)")
            lines.append("")
            lines.append("| Issue | Likelihood | Prevention |")
            lines.append("|-------|------------|------------|")

            for issue in checklist.predicted_issues:
                # Escape pipe characters in content
                desc = issue.description.replace("|", "\\|")
                prev = issue.prevention.replace("|", "\\|")
                lines.append(f"| {desc} | {issue.likelihood.capitalize()} | {prev} |")

            lines.append("")

        # Patterns to follow
        if checklist.patterns_to_follow:
            lines.append("### Patterns to Follow")
            lines.append("")
            lines.append("From previous sessions and codebase analysis:")
            for pattern in checklist.patterns_to_follow:
                lines.append(f"- {pattern}")
            lines.append("")

        # Known gotchas
        if checklist.common_mistakes:
            lines.append("### Known Gotchas in This Codebase")
            lines.append("")
            lines.append("From memory/gotchas.md:")
            for gotcha in checklist.common_mistakes:
                lines.append(f"- [ ] {gotcha}")
            lines.append("")

        # Files to reference
        if checklist.files_to_reference:
            lines.append("### Files to Reference")
            lines.append("")
            for file_path in checklist.files_to_reference:
                # Extract filename and suggest what to look for
                filename = file_path.split('/')[-1]
                lines.append(f"- `{file_path}` - Check for similar patterns and code style")
            lines.append("")

        # Verification reminders
        if checklist.verification_reminders:
            lines.append("### Verification Reminders")
            lines.append("")
            for reminder in checklist.verification_reminders:
                lines.append(f"- [ ] {reminder}")
            lines.append("")

        # Pre-implementation checklist
        lines.append("### Before You Start Implementing")
        lines.append("")
        lines.append("- [ ] I have read and understood all predicted issues above")
        lines.append("- [ ] I have reviewed the reference files to understand existing patterns")
        lines.append("- [ ] I know how to prevent the high-likelihood issues")
        lines.append("- [ ] I understand the verification requirements")
        lines.append("")

        return "\n".join(lines)


def generate_subtask_checklist(spec_dir: Path, subtask: dict) -> str:
    """
    Convenience function to generate and format a checklist for a subtask.

    Args:
        spec_dir: Path to spec directory
        subtask: Subtask dictionary

    Returns:
        Markdown-formatted checklist
    """
    predictor = BugPredictor(spec_dir)
    checklist = predictor.generate_checklist(subtask)
    return predictor.format_checklist_markdown(checklist)


# CLI for testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python prediction.py <spec-dir> [--demo]")
        print("       python prediction.py auto-claude/specs/001-feature/")
        sys.exit(1)

    spec_dir = Path(sys.argv[1])

    if "--demo" in sys.argv:
        # Demo with sample subtask
        demo_subtask = {
            "id": "avatar-endpoint",
            "description": "POST /api/users/avatar endpoint for uploading user avatars",
            "service": "backend",
            "files_to_modify": ["app/routes/users.py"],
            "files_to_create": [],
            "patterns_from": ["app/routes/profile.py"],
            "verification": {
                "type": "api",
                "method": "POST",
                "url": "/api/users/avatar",
                "expect_status": 200,
            }
        }

        checklist_md = generate_subtask_checklist(spec_dir, demo_subtask)
        print(checklist_md)
    else:
        # Load from implementation plan
        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            print(f"Error: No implementation_plan.json found in {spec_dir}")
            sys.exit(1)

        with open(plan_file) as f:
            plan = json.load(f)

        # Find first pending subtask
        subtask = None
        for phase in plan.get("phases", []):
            for c in phase.get("subtasks", []):
                if c.get("status") == "pending":
                    subtask = c
                    break
            if subtask:
                break

        if not subtask:
            print("No pending subtasks found")
            sys.exit(0)

        # Generate checklist
        checklist_md = generate_subtask_checklist(spec_dir, subtask)
        print(checklist_md)
