"""
Example: Using the Output Validator in PR Review Workflow
=========================================================

This example demonstrates how to integrate the FindingValidator
into a PR review system to improve finding quality.
"""

from pathlib import Path

from models import PRReviewFinding, ReviewCategory, ReviewSeverity
from output_validator import FindingValidator


def example_pr_review_with_validation():
    """Example PR review workflow with validation."""

    # Simulate changed files from a PR
    changed_files = {
        "src/auth.py": """import hashlib

def authenticate(username, password):
    # Security issue: MD5 is broken
    hashed = hashlib.md5(password.encode()).hexdigest()
    return check_password(username, hashed)

def check_password(username, password_hash):
    # Security issue: SQL injection
    query = f"SELECT * FROM users WHERE name='{username}' AND pass='{password_hash}'"
    return execute_query(query)
""",
        "src/utils.py": """def process_items(items):
    result = []
    for item in items:
        result.append(item * 2)
    return result
""",
    }

    # Simulate AI-generated findings (including some false positives)
    raw_findings = [
        # Valid critical security finding
        PRReviewFinding(
            id="SEC001",
            severity=ReviewSeverity.CRITICAL,
            category=ReviewCategory.SECURITY,
            title="SQL Injection Vulnerability in Authentication",
            description="The check_password function constructs SQL queries using f-strings with unsanitized user input. This allows attackers to inject malicious SQL code through the username parameter, potentially compromising the entire database.",
            file="src/auth.py",
            line=10,
            suggested_fix="Use parameterized queries: cursor.execute('SELECT * FROM users WHERE name=? AND pass=?', (username, password_hash))",
            fixable=True,
        ),
        # Valid high severity security finding
        PRReviewFinding(
            id="SEC002",
            severity=ReviewSeverity.HIGH,
            category=ReviewCategory.SECURITY,
            title="Weak Cryptographic Hash Function",
            description="MD5 is cryptographically broken and unsuitable for password hashing. It's vulnerable to collision attacks and rainbow tables.",
            file="src/auth.py",
            line=5,
            suggested_fix="Use bcrypt: import bcrypt; hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())",
            fixable=True,
        ),
        # False positive: Vague low severity
        PRReviewFinding(
            id="QUAL001",
            severity=ReviewSeverity.LOW,
            category=ReviewCategory.QUALITY,
            title="Code Could Be Better",
            description="This code could be improved by considering better practices.",
            file="src/utils.py",
            line=1,
            suggested_fix="Improve it",  # Too vague
        ),
        # False positive: Non-existent file
        PRReviewFinding(
            id="TEST001",
            severity=ReviewSeverity.MEDIUM,
            category=ReviewCategory.TEST,
            title="Missing Test Coverage",
            description="This file needs comprehensive test coverage for all functions.",
            file="tests/test_nonexistent.py",  # Doesn't exist
            line=1,
        ),
        # Valid but needs line correction
        PRReviewFinding(
            id="PERF001",
            severity=ReviewSeverity.MEDIUM,
            category=ReviewCategory.PERFORMANCE,
            title="List Comprehension Opportunity",
            description="The process_items function uses a loop with append which is less efficient than a list comprehension for this simple transformation.",
            file="src/utils.py",
            line=5,  # Wrong line, should be around 2-3
            suggested_fix="Use list comprehension: return [item * 2 for item in items]",
            fixable=True,
        ),
        # False positive: Style without good suggestion
        PRReviewFinding(
            id="STYLE001",
            severity=ReviewSeverity.LOW,
            category=ReviewCategory.STYLE,
            title="Formatting Style Issue",
            description="The code formatting doesn't follow best practices.",
            file="src/utils.py",
            line=1,
            suggested_fix="",  # No suggestion
        ),
    ]

    print(f"🔍 Raw findings from AI: {len(raw_findings)}")
    print()

    # Initialize validator
    project_root = Path("/path/to/project")
    validator = FindingValidator(project_root, changed_files)

    # Validate findings
    validated_findings = validator.validate_findings(raw_findings)

    print(f"✅ Validated findings: {len(validated_findings)}")
    print()

    # Display validated findings
    for finding in validated_findings:
        confidence = getattr(finding, "confidence", 0.0)
        print(f"[{finding.severity.value.upper()}] {finding.title}")
        print(f"  File: {finding.file}:{finding.line}")
        print(f"  Confidence: {confidence:.2f}")
        print(f"  Fixable: {finding.fixable}")
        print()

    # Get validation statistics
    stats = validator.get_validation_stats(raw_findings, validated_findings)

    print("📊 Validation Statistics:")
    print(f"  Total findings: {stats['total_findings']}")
    print(f"  Kept: {stats['kept_findings']}")
    print(f"  Filtered: {stats['filtered_findings']}")
    print(f"  Filter rate: {stats['filter_rate']:.1%}")
    print(f"  Average actionability: {stats['average_actionability']:.2f}")
    print(f"  Fixable count: {stats['fixable_count']}")
    print()

    print("🎯 Severity Distribution:")
    for severity, count in stats["severity_distribution"].items():
        if count > 0:
            print(f"  {severity}: {count}")
    print()

    print("📂 Category Distribution:")
    for category, count in stats["category_distribution"].items():
        if count > 0:
            print(f"  {category}: {count}")
    print()

    # Return results for further processing (e.g., posting to GitHub)
    return {
        "validated_findings": validated_findings,
        "stats": stats,
        "ready_for_posting": len(validated_findings) > 0,
    }


def example_integration_with_github_api():
    """Example of using validated findings with GitHub API."""

    # Run validation
    result = example_pr_review_with_validation()

    if not result["ready_for_posting"]:
        print("⚠️  No high-quality findings to post to GitHub")
        return

    # Simulate posting to GitHub (you would use actual GitHub API here)
    print("📤 Posting to GitHub PR...")
    for finding in result["validated_findings"]:
        # Format as GitHub review comment
        comment = {
            "path": finding.file,
            "line": finding.line,
            "body": f"**{finding.title}**\n\n{finding.description}",
        }
        if finding.suggested_fix:
            comment["body"] += (
                f"\n\n**Suggested fix:**\n```\n{finding.suggested_fix}\n```"
            )

        print(f"  ✓ Posted comment on {finding.file}:{finding.line}")

    print(f"✅ Posted {len(result['validated_findings'])} high-quality findings to PR")


if __name__ == "__main__":
    print("=" * 70)
    print("Output Validator Example")
    print("=" * 70)
    print()

    # Run the example
    example_integration_with_github_api()

    print()
    print("=" * 70)
    print("Key Takeaways:")
    print("=" * 70)
    print("✓ Critical security issues preserved (SQL injection, weak crypto)")
    print("✓ Valid performance suggestions kept")
    print("✓ Vague/generic findings filtered out")
    print("✓ Non-existent files filtered out")
    print("✓ Line numbers auto-corrected when possible")
    print("✓ Only actionable findings posted to PR")
    print()
