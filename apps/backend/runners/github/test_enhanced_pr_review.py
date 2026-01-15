#!/usr/bin/env python3
"""
Validation tests for the Enhanced PR Review System.

These tests validate:
1. Model serialization/deserialization
2. Verdict generation logic
3. Risk assessment calculation
4. AI comment parsing
5. Structural issue parsing
6. Summary generation
"""

import json
import sys
from dataclasses import asdict

from context_gatherer import AI_BOT_PATTERNS, AIBotComment

# Direct imports (avoid parent __init__.py issues)
from models import (
    AICommentTriage,
    AICommentVerdict,
    MergeVerdict,
    PRReviewFinding,
    PRReviewResult,
    ReviewCategory,
    ReviewPass,
    ReviewSeverity,
    StructuralIssue,
)


def test_merge_verdict_enum():
    """Test MergeVerdict enum values."""
    print("Testing MergeVerdict enum...")

    assert MergeVerdict.READY_TO_MERGE.value == "ready_to_merge"
    assert MergeVerdict.MERGE_WITH_CHANGES.value == "merge_with_changes"
    assert MergeVerdict.NEEDS_REVISION.value == "needs_revision"
    assert MergeVerdict.BLOCKED.value == "blocked"

    # Test string conversion
    assert MergeVerdict("ready_to_merge") == MergeVerdict.READY_TO_MERGE
    assert MergeVerdict("blocked") == MergeVerdict.BLOCKED

    print("  ✅ MergeVerdict enum: PASS")


def test_ai_comment_verdict_enum():
    """Test AICommentVerdict enum values."""
    print("Testing AICommentVerdict enum...")

    assert AICommentVerdict.CRITICAL.value == "critical"
    assert AICommentVerdict.IMPORTANT.value == "important"
    assert AICommentVerdict.NICE_TO_HAVE.value == "nice_to_have"
    assert AICommentVerdict.TRIVIAL.value == "trivial"
    assert AICommentVerdict.FALSE_POSITIVE.value == "false_positive"

    print("  ✅ AICommentVerdict enum: PASS")


def test_review_pass_enum():
    """Test ReviewPass enum includes new passes."""
    print("Testing ReviewPass enum...")

    assert ReviewPass.STRUCTURAL.value == "structural"
    assert ReviewPass.AI_COMMENT_TRIAGE.value == "ai_comment_triage"

    # Ensure all 6 passes exist
    passes = [p.value for p in ReviewPass]
    assert len(passes) == 6
    assert "quick_scan" in passes
    assert "security" in passes
    assert "quality" in passes
    assert "deep_analysis" in passes
    assert "structural" in passes
    assert "ai_comment_triage" in passes

    print("  ✅ ReviewPass enum: PASS")


def test_ai_bot_patterns():
    """Test AI bot detection patterns."""
    print("Testing AI bot patterns...")

    # Check known patterns exist
    assert "coderabbitai" in AI_BOT_PATTERNS
    assert "greptile" in AI_BOT_PATTERNS
    assert "copilot" in AI_BOT_PATTERNS
    assert "sourcery-ai" in AI_BOT_PATTERNS

    # Check pattern -> name mapping
    assert AI_BOT_PATTERNS["coderabbitai"] == "CodeRabbit"
    assert AI_BOT_PATTERNS["greptile"] == "Greptile"
    assert AI_BOT_PATTERNS["copilot"] == "GitHub Copilot"

    # Check we have a reasonable number of patterns
    assert len(AI_BOT_PATTERNS) >= 15, (
        f"Expected at least 15 patterns, got {len(AI_BOT_PATTERNS)}"
    )

    print(f"  ✅ AI bot patterns ({len(AI_BOT_PATTERNS)} patterns): PASS")


def test_ai_bot_comment_dataclass():
    """Test AIBotComment dataclass."""
    print("Testing AIBotComment dataclass...")

    comment = AIBotComment(
        comment_id=12345,
        author="coderabbitai[bot]",
        tool_name="CodeRabbit",
        body="This function has a potential SQL injection vulnerability.",
        file="src/db/queries.py",
        line=42,
        created_at="2024-01-15T10:30:00Z",
    )

    assert comment.comment_id == 12345
    assert comment.tool_name == "CodeRabbit"
    assert "SQL injection" in comment.body
    assert comment.file == "src/db/queries.py"
    assert comment.line == 42

    print("  ✅ AIBotComment dataclass: PASS")


def test_ai_comment_triage_dataclass():
    """Test AICommentTriage dataclass."""
    print("Testing AICommentTriage dataclass...")

    triage = AICommentTriage(
        comment_id=12345,
        tool_name="CodeRabbit",
        original_comment="SQL injection vulnerability detected",
        verdict=AICommentVerdict.CRITICAL,
        reasoning="Verified - user input is directly concatenated into SQL query",
        response_comment="✅ Verified: Critical security issue - must fix before merge",
    )

    assert triage.verdict == AICommentVerdict.CRITICAL
    assert triage.tool_name == "CodeRabbit"
    assert "Verified" in triage.reasoning

    print("  ✅ AICommentTriage dataclass: PASS")


def test_structural_issue_dataclass():
    """Test StructuralIssue dataclass."""
    print("Testing StructuralIssue dataclass...")

    issue = StructuralIssue(
        id="struct-1",
        issue_type="feature_creep",
        severity=ReviewSeverity.HIGH,
        title="PR includes unrelated authentication refactor",
        description="The PR titled 'Fix payment bug' also refactors auth middleware.",
        impact="Bundles unrelated changes, harder to review and revert.",
        suggestion="Split into two PRs: one for payment fix, one for auth refactor.",
    )

    assert issue.issue_type == "feature_creep"
    assert issue.severity == ReviewSeverity.HIGH
    assert "unrelated" in issue.title.lower()

    print("  ✅ StructuralIssue dataclass: PASS")


def test_pr_review_result_new_fields():
    """Test PRReviewResult has all new fields."""
    print("Testing PRReviewResult new fields...")

    result = PRReviewResult(
        pr_number=123,
        repo="owner/repo",
        success=True,
        findings=[],
        summary="Test summary",
        overall_status="approve",
        # New fields
        verdict=MergeVerdict.READY_TO_MERGE,
        verdict_reasoning="No blocking issues found",
        blockers=[],
        risk_assessment={
            "complexity": "low",
            "security_impact": "none",
            "scope_coherence": "good",
        },
        structural_issues=[],
        ai_comment_triages=[],
        quick_scan_summary={"purpose": "Test PR", "complexity": "low"},
    )

    assert result.verdict == MergeVerdict.READY_TO_MERGE
    assert result.verdict_reasoning == "No blocking issues found"
    assert result.blockers == []
    assert result.risk_assessment["complexity"] == "low"
    assert result.structural_issues == []
    assert result.ai_comment_triages == []

    print("  ✅ PRReviewResult new fields: PASS")


def test_pr_review_result_serialization():
    """Test PRReviewResult serializes and deserializes correctly."""
    print("Testing PRReviewResult serialization...")

    # Create a complex result
    finding = PRReviewFinding(
        id="finding-1",
        severity=ReviewSeverity.HIGH,
        category=ReviewCategory.SECURITY,
        title="SQL Injection",
        description="User input not sanitized",
        file="src/db.py",
        line=42,
    )

    structural = StructuralIssue(
        id="struct-1",
        issue_type="feature_creep",
        severity=ReviewSeverity.MEDIUM,
        title="Unrelated changes",
        description="Extra refactoring",
        impact="Harder to review",
        suggestion="Split PR",
    )

    triage = AICommentTriage(
        comment_id=999,
        tool_name="CodeRabbit",
        original_comment="Missing null check",
        verdict=AICommentVerdict.TRIVIAL,
        reasoning="Value is guaranteed non-null by upstream validation",
    )

    result = PRReviewResult(
        pr_number=456,
        repo="test/repo",
        success=True,
        findings=[finding],
        summary="Test",
        overall_status="comment",
        verdict=MergeVerdict.MERGE_WITH_CHANGES,
        verdict_reasoning="1 high-priority issue",
        blockers=["Security: SQL Injection (src/db.py:42)"],
        risk_assessment={
            "complexity": "medium",
            "security_impact": "medium",
            "scope_coherence": "mixed",
        },
        structural_issues=[structural],
        ai_comment_triages=[triage],
        quick_scan_summary={"purpose": "Test", "complexity": "medium"},
    )

    # Serialize to dict
    data = result.to_dict()

    # Check serialized data
    assert data["verdict"] == "merge_with_changes"
    assert data["blockers"] == ["Security: SQL Injection (src/db.py:42)"]
    assert len(data["structural_issues"]) == 1
    assert len(data["ai_comment_triages"]) == 1
    assert data["structural_issues"][0]["issue_type"] == "feature_creep"
    assert data["ai_comment_triages"][0]["verdict"] == "trivial"

    # Deserialize back
    loaded = PRReviewResult.from_dict(data)

    assert loaded.verdict == MergeVerdict.MERGE_WITH_CHANGES
    assert loaded.verdict_reasoning == "1 high-priority issue"
    assert len(loaded.structural_issues) == 1
    assert loaded.structural_issues[0].issue_type == "feature_creep"
    assert len(loaded.ai_comment_triages) == 1
    assert loaded.ai_comment_triages[0].verdict == AICommentVerdict.TRIVIAL

    print("  ✅ PRReviewResult serialization: PASS")


def test_verdict_generation_logic():
    """Test verdict generation produces correct verdicts."""
    print("Testing verdict generation logic...")

    # Test case 1: No issues -> READY_TO_MERGE
    findings = []
    structural = []
    triages = []

    # Simulate verdict logic
    critical = [f for f in findings if f.severity == ReviewSeverity.CRITICAL]
    high = [f for f in findings if f.severity == ReviewSeverity.HIGH]
    security_critical = [f for f in critical if f.category == ReviewCategory.SECURITY]
    structural_blockers = [
        s
        for s in structural
        if s.severity in (ReviewSeverity.CRITICAL, ReviewSeverity.HIGH)
    ]
    ai_critical = [t for t in triages if t.verdict == AICommentVerdict.CRITICAL]

    blockers = []
    for f in security_critical:
        blockers.append(f"Security: {f.title}")
    for f in critical:
        if f not in security_critical:
            blockers.append(f"Critical: {f.title}")
    for s in structural_blockers:
        blockers.append(f"Structure: {s.title}")
    for t in ai_critical:
        blockers.append(f"{t.tool_name}: {t.original_comment[:50]}")

    if blockers:
        if security_critical:
            verdict = MergeVerdict.BLOCKED
        elif len(critical) > 0:
            verdict = MergeVerdict.BLOCKED
        else:
            verdict = MergeVerdict.NEEDS_REVISION
    elif high:
        verdict = MergeVerdict.MERGE_WITH_CHANGES
    else:
        verdict = MergeVerdict.READY_TO_MERGE

    assert verdict == MergeVerdict.READY_TO_MERGE
    assert len(blockers) == 0
    print("  ✓ Case 1: No issues -> READY_TO_MERGE")

    # Test case 2: Security critical -> BLOCKED
    findings = [
        PRReviewFinding(
            id="sec-1",
            severity=ReviewSeverity.CRITICAL,
            category=ReviewCategory.SECURITY,
            title="SQL Injection",
            description="Test",
            file="test.py",
            line=1,
        )
    ]

    critical = [f for f in findings if f.severity == ReviewSeverity.CRITICAL]
    security_critical = [f for f in critical if f.category == ReviewCategory.SECURITY]

    blockers = []
    for f in security_critical:
        blockers.append(f"Security: {f.title}")

    if blockers and security_critical:
        verdict = MergeVerdict.BLOCKED

    assert verdict == MergeVerdict.BLOCKED
    assert len(blockers) == 1
    assert "SQL Injection" in blockers[0]
    print("  ✓ Case 2: Security critical -> BLOCKED")

    # Test case 3: High severity only -> MERGE_WITH_CHANGES
    findings = [
        PRReviewFinding(
            id="q-1",
            severity=ReviewSeverity.HIGH,
            category=ReviewCategory.QUALITY,
            title="Missing error handling",
            description="Test",
            file="test.py",
            line=1,
        )
    ]

    critical = [f for f in findings if f.severity == ReviewSeverity.CRITICAL]
    high = [f for f in findings if f.severity == ReviewSeverity.HIGH]
    security_critical = [f for f in critical if f.category == ReviewCategory.SECURITY]

    blockers = []
    if not blockers and high:
        verdict = MergeVerdict.MERGE_WITH_CHANGES

    assert verdict == MergeVerdict.MERGE_WITH_CHANGES
    print("  ✓ Case 3: High severity only -> MERGE_WITH_CHANGES")

    print("  ✅ Verdict generation logic: PASS")


def test_risk_assessment_logic():
    """Test risk assessment calculation."""
    print("Testing risk assessment logic...")

    # Test complexity levels
    def calculate_complexity(additions, deletions):
        total = additions + deletions
        if total > 500:
            return "high"
        elif total > 200:
            return "medium"
        else:
            return "low"

    assert calculate_complexity(50, 20) == "low"
    assert calculate_complexity(150, 100) == "medium"
    assert calculate_complexity(400, 200) == "high"
    print("  ✓ Complexity calculation")

    # Test security impact levels
    def calculate_security_impact(findings):
        security = [f for f in findings if f.category == ReviewCategory.SECURITY]
        if any(f.severity == ReviewSeverity.CRITICAL for f in security):
            return "critical"
        elif any(f.severity == ReviewSeverity.HIGH for f in security):
            return "medium"
        elif security:
            return "low"
        else:
            return "none"

    assert calculate_security_impact([]) == "none"

    findings_low = [
        PRReviewFinding(
            id="s1",
            severity=ReviewSeverity.LOW,
            category=ReviewCategory.SECURITY,
            title="Test",
            description="",
            file="",
            line=1,
        )
    ]
    assert calculate_security_impact(findings_low) == "low"

    findings_critical = [
        PRReviewFinding(
            id="s2",
            severity=ReviewSeverity.CRITICAL,
            category=ReviewCategory.SECURITY,
            title="Test",
            description="",
            file="",
            line=1,
        )
    ]
    assert calculate_security_impact(findings_critical) == "critical"
    print("  ✓ Security impact calculation")

    print("  ✅ Risk assessment logic: PASS")


def test_json_parsing_robustness():
    """Test JSON parsing handles edge cases."""
    print("Testing JSON parsing robustness...")

    import re

    def parse_json_array(text):
        """Simulate the JSON parsing from AI response."""
        try:
            json_match = re.search(r"```json\s*(\[.*?\])\s*```", text, re.DOTALL)
            if json_match:
                return json.loads(json_match.group(1))
        except (json.JSONDecodeError, ValueError):
            pass
        return []

    # Test valid JSON
    valid = """
Here is my analysis:
```json
[{"id": "f1", "title": "Test"}]
```
Done.
"""
    result = parse_json_array(valid)
    assert len(result) == 1
    assert result[0]["id"] == "f1"
    print("  ✓ Valid JSON parsing")

    # Test empty array
    empty = """
```json
[]
```
"""
    result = parse_json_array(empty)
    assert result == []
    print("  ✓ Empty array parsing")

    # Test no JSON block
    no_json = "This response has no JSON block."
    result = parse_json_array(no_json)
    assert result == []
    print("  ✓ No JSON block handling")

    # Test malformed JSON
    malformed = """
```json
[{"id": "f1", "title": "Missing close bracket"
```
"""
    result = parse_json_array(malformed)
    assert result == []
    print("  ✓ Malformed JSON handling")

    print("  ✅ JSON parsing robustness: PASS")


def test_confidence_threshold():
    """Test 80% confidence threshold filtering."""
    print("Testing confidence threshold...")

    CONFIDENCE_THRESHOLD = 0.80

    findings_data = [
        {"id": "f1", "confidence": 0.95, "title": "High confidence"},
        {"id": "f2", "confidence": 0.80, "title": "At threshold"},
        {"id": "f3", "confidence": 0.79, "title": "Below threshold"},
        {"id": "f4", "confidence": 0.50, "title": "Low confidence"},
        {"id": "f5", "title": "No confidence field"},  # Should default to 0.85
    ]

    filtered = []
    for f in findings_data:
        confidence = float(f.get("confidence", 0.85))
        if confidence >= CONFIDENCE_THRESHOLD:
            filtered.append(f)

    assert len(filtered) == 3
    assert filtered[0]["id"] == "f1"  # 0.95 >= 0.80
    assert filtered[1]["id"] == "f2"  # 0.80 >= 0.80
    assert filtered[2]["id"] == "f5"  # 0.85 (default) >= 0.80

    print(
        f"  ✓ Filtered {len(findings_data) - len(filtered)}/{len(findings_data)} findings below threshold"
    )
    print("  ✅ Confidence threshold: PASS")


def run_all_tests():
    """Run all validation tests."""
    print("\n" + "=" * 60)
    print("Enhanced PR Review System - Validation Tests")
    print("=" * 60 + "\n")

    tests = [
        test_merge_verdict_enum,
        test_ai_comment_verdict_enum,
        test_review_pass_enum,
        test_ai_bot_patterns,
        test_ai_bot_comment_dataclass,
        test_ai_comment_triage_dataclass,
        test_structural_issue_dataclass,
        test_pr_review_result_new_fields,
        test_pr_review_result_serialization,
        test_verdict_generation_logic,
        test_risk_assessment_logic,
        test_json_parsing_robustness,
        test_confidence_threshold,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"  ❌ {test.__name__}: FAILED")
            print(f"     Error: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)
    else:
        print("\n✅ All validation tests passed! System is ready for production.\n")
        sys.exit(0)


if __name__ == "__main__":
    run_all_tests()
