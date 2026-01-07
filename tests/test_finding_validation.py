"""
Tests for Finding Validation System
====================================

Tests the finding-validator agent integration and FindingValidationResult models.
This system prevents false positives from persisting by re-investigating unresolved findings.

NOTE: The validation system has been updated to use EVIDENCE-BASED validation
instead of confidence scores. The key field is now `evidence_verified_in_file`
which is a boolean indicating whether the code evidence was found at the specified location.
"""

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

# Add the backend directory to path
_backend_dir = Path(__file__).parent.parent / "apps" / "backend"
_github_dir = _backend_dir / "runners" / "github"
_services_dir = _github_dir / "services"

if str(_services_dir) not in sys.path:
    sys.path.insert(0, str(_services_dir))
if str(_github_dir) not in sys.path:
    sys.path.insert(0, str(_github_dir))
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from pydantic_models import (
    FindingValidationResult,
    FindingValidationResponse,
    ParallelFollowupResponse,
    ResolutionVerification,
)
from models import (
    PRReviewFinding,
    ReviewSeverity,
    ReviewCategory,
)


# ============================================================================
# FindingValidationResult Model Tests
# ============================================================================


class TestFindingValidationResultModel:
    """Tests for the FindingValidationResult Pydantic model."""

    def test_valid_confirmed_valid(self):
        """Test creating a confirmed_valid validation result."""
        result = FindingValidationResult(
            finding_id="SEC-001",
            validation_status="confirmed_valid",
            code_evidence="const query = `SELECT * FROM users WHERE id = ${userId}`;",
            line_range=(45, 45),
            explanation="SQL injection is present - user input is concatenated directly into the query.",
            evidence_verified_in_file=True,
        )
        assert result.finding_id == "SEC-001"
        assert result.validation_status == "confirmed_valid"
        assert "SELECT" in result.code_evidence
        assert result.evidence_verified_in_file is True

    def test_valid_dismissed_false_positive(self):
        """Test creating a dismissed_false_positive validation result."""
        result = FindingValidationResult(
            finding_id="QUAL-002",
            validation_status="dismissed_false_positive",
            code_evidence="const sanitized = DOMPurify.sanitize(data);",
            line_range=(23, 26),
            explanation="Original finding claimed XSS but code uses DOMPurify.sanitize() for protection.",
            evidence_verified_in_file=True,
        )
        assert result.validation_status == "dismissed_false_positive"
        assert result.evidence_verified_in_file is True

    def test_valid_needs_human_review(self):
        """Test creating a needs_human_review validation result."""
        result = FindingValidationResult(
            finding_id="LOGIC-003",
            validation_status="needs_human_review",
            code_evidence="async function handleRequest(req) { ... }",
            line_range=(100, 150),
            explanation="Race condition claim requires runtime analysis to verify.",
            evidence_verified_in_file=True,
        )
        assert result.validation_status == "needs_human_review"
        assert result.evidence_verified_in_file is True

    def test_hallucinated_finding_not_verified(self):
        """Test creating a result where evidence was not verified (hallucinated finding)."""
        result = FindingValidationResult(
            finding_id="HALLUC-001",
            validation_status="dismissed_false_positive",
            code_evidence="// Line 710 does not exist - file only has 600 lines",
            line_range=(600, 600),
            explanation="Original finding cited line 710 but file only has 600 lines. Hallucinated finding.",
            evidence_verified_in_file=False,
        )
        assert result.validation_status == "dismissed_false_positive"
        assert result.evidence_verified_in_file is False

    def test_code_evidence_required(self):
        """Test that code_evidence cannot be empty."""
        with pytest.raises(ValidationError) as exc_info:
            FindingValidationResult(
                finding_id="SEC-001",
                validation_status="confirmed_valid",
                code_evidence="",  # Empty string should fail
                line_range=(45, 45),
                explanation="This is a detailed explanation of the issue.",
                evidence_verified_in_file=True,
            )
        errors = exc_info.value.errors()
        assert any("code_evidence" in str(e) for e in errors)

    def test_explanation_min_length(self):
        """Test that explanation must be at least 20 characters."""
        with pytest.raises(ValidationError) as exc_info:
            FindingValidationResult(
                finding_id="SEC-001",
                validation_status="confirmed_valid",
                code_evidence="const x = 1;",
                line_range=(45, 45),
                explanation="Too short",  # Less than 20 chars
                evidence_verified_in_file=True,
            )
        errors = exc_info.value.errors()
        assert any("explanation" in str(e) for e in errors)

    def test_evidence_verified_required(self):
        """Test that evidence_verified_in_file is required."""
        with pytest.raises(ValidationError) as exc_info:
            FindingValidationResult(
                finding_id="SEC-001",
                validation_status="confirmed_valid",
                code_evidence="const query = `SELECT * FROM users`;",
                line_range=(45, 45),
                explanation="SQL injection vulnerability found in the query construction.",
                # Missing evidence_verified_in_file
            )
        errors = exc_info.value.errors()
        assert any("evidence_verified_in_file" in str(e) for e in errors)

    def test_invalid_validation_status(self):
        """Test that invalid validation_status values are rejected."""
        with pytest.raises(ValidationError):
            FindingValidationResult(
                finding_id="SEC-001",
                validation_status="invalid_status",  # Not a valid status
                code_evidence="const x = 1;",
                line_range=(45, 45),
                explanation="This is a detailed explanation of the issue.",
                evidence_verified_in_file=True,
            )


class TestFindingValidationResponse:
    """Tests for the FindingValidationResponse container model."""

    def test_valid_response_with_multiple_validations(self):
        """Test creating a response with multiple validation results."""
        response = FindingValidationResponse(
            validations=[
                FindingValidationResult(
                    finding_id="SEC-001",
                    validation_status="confirmed_valid",
                    code_evidence="const query = `SELECT * FROM users`;",
                    line_range=(45, 45),
                    explanation="SQL injection confirmed in this query.",
                    evidence_verified_in_file=True,
                ),
                FindingValidationResult(
                    finding_id="QUAL-002",
                    validation_status="dismissed_false_positive",
                    code_evidence="const sanitized = DOMPurify.sanitize(data);",
                    line_range=(23, 26),
                    explanation="Code uses DOMPurify so XSS claim is false.",
                    evidence_verified_in_file=True,
                ),
            ],
            summary="1 finding confirmed valid, 1 dismissed as false positive",
        )
        assert len(response.validations) == 2
        assert "1 finding confirmed" in response.summary


class TestParallelFollowupResponseWithValidation:
    """Tests for ParallelFollowupResponse including finding_validations."""

    def test_response_includes_finding_validations(self):
        """Test that ParallelFollowupResponse accepts finding_validations."""
        response = ParallelFollowupResponse(
            analysis_summary="Follow-up review with validation",
            agents_invoked=["resolution-verifier", "finding-validator"],
            commits_analyzed=3,
            files_changed=5,
            resolution_verifications=[
                ResolutionVerification(
                    finding_id="SEC-001",
                    status="unresolved",
                    evidence="File was not modified",
                )
            ],
            finding_validations=[
                FindingValidationResult(
                    finding_id="SEC-001",
                    validation_status="confirmed_valid",
                    code_evidence="const query = `SELECT * FROM users`;",
                    line_range=(45, 45),
                    explanation="SQL injection confirmed in this query.",
                    evidence_verified_in_file=True,
                )
            ],
            new_findings=[],
            comment_analyses=[],
            comment_findings=[],
            verdict="NEEDS_REVISION",
            verdict_reasoning="1 confirmed valid security issue remains",
        )
        assert len(response.finding_validations) == 1
        assert response.finding_validations[0].validation_status == "confirmed_valid"

    def test_response_with_dismissed_findings(self):
        """Test response where findings are dismissed as false positives."""
        response = ParallelFollowupResponse(
            analysis_summary="All findings dismissed as false positives",
            agents_invoked=["resolution-verifier", "finding-validator"],
            commits_analyzed=3,
            files_changed=5,
            resolution_verifications=[
                ResolutionVerification(
                    finding_id="SEC-001",
                    status="unresolved",
                    evidence="Line wasn't changed but need to verify",
                )
            ],
            finding_validations=[
                FindingValidationResult(
                    finding_id="SEC-001",
                    validation_status="dismissed_false_positive",
                    code_evidence="const query = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);",
                    line_range=(45, 48),
                    explanation="Original review misread - using parameterized query.",
                    evidence_verified_in_file=True,
                )
            ],
            new_findings=[],
            comment_analyses=[],
            comment_findings=[],
            verdict="READY_TO_MERGE",
            verdict_reasoning="Previous finding was a false positive, now dismissed",
        )
        assert len(response.finding_validations) == 1
        assert response.finding_validations[0].validation_status == "dismissed_false_positive"


# ============================================================================
# PRReviewFinding Validation Fields Tests
# ============================================================================


class TestPRReviewFindingValidationFields:
    """Tests for validation fields on PRReviewFinding model."""

    def test_finding_with_validation_fields(self):
        """Test creating a finding with validation fields populated."""
        finding = PRReviewFinding(
            id="SEC-001",
            severity=ReviewSeverity.HIGH,
            category=ReviewCategory.SECURITY,
            title="SQL Injection",
            description="User input not sanitized",
            file="src/db.py",
            line=42,
            validation_status="confirmed_valid",
            validation_evidence="const query = `SELECT * FROM users`;",
            validation_explanation="SQL injection confirmed in the query.",
        )
        assert finding.validation_status == "confirmed_valid"
        assert finding.validation_evidence is not None

    def test_finding_without_validation_fields(self):
        """Test that validation fields are optional."""
        finding = PRReviewFinding(
            id="SEC-001",
            severity=ReviewSeverity.HIGH,
            category=ReviewCategory.SECURITY,
            title="SQL Injection",
            description="User input not sanitized",
            file="src/db.py",
            line=42,
        )
        assert finding.validation_status is None
        assert finding.validation_evidence is None
        assert finding.validation_explanation is None

    def test_finding_to_dict_includes_validation(self):
        """Test that to_dict includes validation fields."""
        finding = PRReviewFinding(
            id="SEC-001",
            severity=ReviewSeverity.HIGH,
            category=ReviewCategory.SECURITY,
            title="SQL Injection",
            description="User input not sanitized",
            file="src/db.py",
            line=42,
            validation_status="confirmed_valid",
            validation_evidence="const query = ...;",
            validation_explanation="Issue confirmed.",
        )
        data = finding.to_dict()
        assert data["validation_status"] == "confirmed_valid"
        assert data["validation_evidence"] == "const query = ...;"
        assert data["validation_explanation"] == "Issue confirmed."

    def test_finding_from_dict_with_validation(self):
        """Test that from_dict loads validation fields."""
        data = {
            "id": "SEC-001",
            "severity": "high",
            "category": "security",
            "title": "SQL Injection",
            "description": "User input not sanitized",
            "file": "src/db.py",
            "line": 42,
            "validation_status": "dismissed_false_positive",
            "validation_evidence": "parameterized query used",
            "validation_explanation": "False positive - using prepared statements.",
        }
        finding = PRReviewFinding.from_dict(data)
        assert finding.validation_status == "dismissed_false_positive"


# ============================================================================
# Integration Tests
# ============================================================================


class TestValidationIntegration:
    """Integration tests for the validation flow."""

    def test_validation_summary_format(self):
        """Test that validation summary format is correct when validation results exist."""
        # Test the expected summary format when validation results are present
        # We can't directly import ParallelFollowupReviewer due to complex imports,
        # so we verify the Pydantic models work correctly instead

        response = ParallelFollowupResponse(
            analysis_summary="Follow-up with validation",
            agents_invoked=["resolution-verifier", "finding-validator"],
            commits_analyzed=3,
            files_changed=5,
            resolution_verifications=[],
            finding_validations=[
                FindingValidationResult(
                    finding_id="SEC-001",
                    validation_status="confirmed_valid",
                    code_evidence="const query = `SELECT * FROM users`;",
                    line_range=(45, 45),
                    explanation="SQL injection confirmed in this query construction.",
                    evidence_verified_in_file=True,
                ),
                FindingValidationResult(
                    finding_id="QUAL-002",
                    validation_status="dismissed_false_positive",
                    code_evidence="const sanitized = DOMPurify.sanitize(data);",
                    line_range=(23, 26),
                    explanation="Original XSS claim was incorrect - uses DOMPurify.",
                    evidence_verified_in_file=True,
                ),
            ],
            new_findings=[],
            comment_analyses=[],
            comment_findings=[],
            verdict="READY_TO_MERGE",
            verdict_reasoning="1 dismissed as false positive, 1 confirmed valid but low severity",
        )

        # Verify validation counts can be computed from the response
        confirmed_count = sum(
            1 for fv in response.finding_validations
            if fv.validation_status == "confirmed_valid"
        )
        dismissed_count = sum(
            1 for fv in response.finding_validations
            if fv.validation_status == "dismissed_false_positive"
        )

        assert confirmed_count == 1
        assert dismissed_count == 1
        assert len(response.finding_validations) == 2
        assert "finding-validator" in response.agents_invoked

    def test_validation_status_enum_values(self):
        """Test all valid validation status values."""
        valid_statuses = ["confirmed_valid", "dismissed_false_positive", "needs_human_review"]

        for status in valid_statuses:
            result = FindingValidationResult(
                finding_id="TEST-001",
                validation_status=status,
                code_evidence="const x = 1;",
                line_range=(1, 1),
                explanation="This is a valid explanation for the finding status.",
                evidence_verified_in_file=True,
            )
            assert result.validation_status == status
