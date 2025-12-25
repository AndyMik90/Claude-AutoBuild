"""
Response Parsers
================

JSON parsing utilities for AI responses.
"""

from __future__ import annotations

import json
import re

try:
    from ..models import (
        AICommentTriage,
        AICommentVerdict,
        PRReviewFinding,
        ReviewCategory,
        ReviewSeverity,
        StructuralIssue,
        TriageCategory,
        TriageResult,
    )
except (ImportError, ValueError, SystemError):
    from models import (
        AICommentTriage,
        AICommentVerdict,
        PRReviewFinding,
        ReviewCategory,
        ReviewSeverity,
        StructuralIssue,
        TriageCategory,
        TriageResult,
    )

# Confidence threshold for filtering findings (GitHub Copilot standard)
CONFIDENCE_THRESHOLD = 0.80


class ResponseParser:
    """Parses AI responses into structured data."""

    @staticmethod
    def parse_scan_result(response_text: str) -> dict:
        """Parse the quick scan result from AI response."""
        default_result = {
            "purpose": "Code changes",
            "risk_areas": [],
            "red_flags": [],
            "complexity": "medium",
        }

        try:
            json_match = re.search(
                r"```json\s*(\{.*?\})\s*```", response_text, re.DOTALL
            )
            if json_match:
                result = json.loads(json_match.group(1))
                print(f"[AI] Quick scan result: {result}", flush=True)
                return result
        except (json.JSONDecodeError, ValueError) as e:
            print(f"[AI] Failed to parse scan result: {e}", flush=True)

        return default_result

    @staticmethod
    def parse_review_findings(
        response_text: str, apply_confidence_filter: bool = True
    ) -> list[PRReviewFinding]:
        """Parse findings from AI response with optional confidence filtering."""
        findings = []

        try:
            json_match = re.search(
                r"```json\s*(\[.*?\])\s*```", response_text, re.DOTALL
            )
            if json_match:
                findings_data = json.loads(json_match.group(1))
                for i, f in enumerate(findings_data):
                    # Get confidence (default to 0.85 if not provided for backward compat)
                    confidence = float(f.get("confidence", 0.85))

                    # Apply confidence threshold filter
                    if apply_confidence_filter and confidence < CONFIDENCE_THRESHOLD:
                        print(
                            f"[AI] Dropped finding '{f.get('title', 'unknown')}': "
                            f"confidence {confidence:.2f} < {CONFIDENCE_THRESHOLD}",
                            flush=True,
                        )
                        continue

                    findings.append(
                        PRReviewFinding(
                            id=f.get("id", f"finding-{i + 1}"),
                            severity=ReviewSeverity(
                                f.get("severity", "medium").lower()
                            ),
                            category=ReviewCategory(
                                f.get("category", "quality").lower()
                            ),
                            title=f.get("title", "Finding"),
                            description=f.get("description", ""),
                            file=f.get("file", "unknown"),
                            line=f.get("line", 1),
                            end_line=f.get("end_line"),
                            suggested_fix=f.get("suggested_fix"),
                            fixable=f.get("fixable", False),
                            # NEW: Support verification and redundancy fields
                            confidence=confidence,
                            verification_note=f.get("verification_note"),
                            redundant_with=f.get("redundant_with"),
                        )
                    )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Failed to parse findings: {e}")

        return findings

    @staticmethod
    def parse_structural_issues(response_text: str) -> list[StructuralIssue]:
        """Parse structural issues from AI response."""
        issues = []

        try:
            json_match = re.search(
                r"```json\s*(\[.*?\])\s*```", response_text, re.DOTALL
            )
            if json_match:
                issues_data = json.loads(json_match.group(1))
                for i, issue in enumerate(issues_data):
                    issues.append(
                        StructuralIssue(
                            id=issue.get("id", f"struct-{i + 1}"),
                            issue_type=issue.get("issue_type", "scope_creep"),
                            severity=ReviewSeverity(
                                issue.get("severity", "medium").lower()
                            ),
                            title=issue.get("title", "Structural issue"),
                            description=issue.get("description", ""),
                            impact=issue.get("impact", ""),
                            suggestion=issue.get("suggestion", ""),
                        )
                    )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Failed to parse structural issues: {e}")

        return issues

    @staticmethod
    def parse_ai_comment_triages(response_text: str) -> list[AICommentTriage]:
        """Parse AI comment triages from AI response."""
        triages = []

        try:
            json_match = re.search(
                r"```json\s*(\[.*?\])\s*```", response_text, re.DOTALL
            )
            if json_match:
                triages_data = json.loads(json_match.group(1))
                for triage in triages_data:
                    verdict_str = triage.get("verdict", "trivial").lower()
                    try:
                        verdict = AICommentVerdict(verdict_str)
                    except ValueError:
                        verdict = AICommentVerdict.TRIVIAL

                    triages.append(
                        AICommentTriage(
                            comment_id=triage.get("comment_id", 0),
                            tool_name=triage.get("tool_name", "Unknown"),
                            original_comment=triage.get("original_summary", ""),
                            verdict=verdict,
                            reasoning=triage.get("reasoning", ""),
                            response_comment=triage.get("response_comment"),
                        )
                    )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Failed to parse AI comment triages: {e}")

        return triages

    @staticmethod
    def parse_triage_result(issue: dict, response_text: str, repo: str) -> TriageResult:
        """Parse triage result from AI response."""
        # Default result
        result = TriageResult(
            issue_number=issue["number"],
            repo=repo,
            category=TriageCategory.FEATURE,
            confidence=0.5,
        )

        try:
            json_match = re.search(
                r"```json\s*(\{.*?\})\s*```", response_text, re.DOTALL
            )
            if json_match:
                data = json.loads(json_match.group(1))

                category_str = data.get("category", "feature").lower()
                if category_str in [c.value for c in TriageCategory]:
                    result.category = TriageCategory(category_str)

                result.confidence = float(data.get("confidence", 0.5))
                result.labels_to_add = data.get("labels_to_add", [])
                result.labels_to_remove = data.get("labels_to_remove", [])
                result.is_duplicate = data.get("is_duplicate", False)
                result.duplicate_of = data.get("duplicate_of")
                result.is_spam = data.get("is_spam", False)
                result.is_feature_creep = data.get("is_feature_creep", False)
                result.suggested_breakdown = data.get("suggested_breakdown", [])
                result.priority = data.get("priority", "medium")
                result.comment = data.get("comment")

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            print(f"Failed to parse triage result: {e}")

        return result
