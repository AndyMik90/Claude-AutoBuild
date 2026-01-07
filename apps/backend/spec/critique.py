#!/usr/bin/env python3
"""
Self-Critique System
====================

Implements a self-critique loop that agents must run before marking subtasks complete.
This helps catch quality issues early, before verification stage.

The critique system ensures:
- Code follows patterns from reference files
- All required files were modified/created
- Error handling is present
- No debugging artifacts left behind
- Implementation matches subtask requirements
"""

import re
from dataclasses import dataclass, field


@dataclass
class CritiqueResult:
    """Result of a self-critique evaluation."""

    passes: bool
    issues: list[str] = field(default_factory=list)
    improvements_made: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "passes": self.passes,
            "issues": self.issues,
            "improvements_made": self.improvements_made,
            "recommendations": self.recommendations,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CritiqueResult":
        """Load from dictionary."""
        return cls(
            passes=data.get("passes", False),
            issues=data.get("issues", []),
            improvements_made=data.get("improvements_made", []),
            recommendations=data.get("recommendations", []),
        )


def generate_critique_prompt(
    subtask: dict, files_modified: list[str], patterns_from: list[str]
) -> str:
    """
    Generate a critique prompt for the agent to self-evaluate.

    Args:
        subtask: The subtask being implemented
        files_modified: List of files actually modified
        patterns_from: List of pattern files to compare against

    Returns:
        Formatted prompt for self-critique
    """
    subtask_id = subtask.get("id", "unknown")
    subtask_desc = subtask.get("description", "No description")
    service = subtask.get("service", "all services")
    files_to_modify = subtask.get("files_to_modify", [])
    files_to_create = subtask.get("files_to_create", [])

    prompt = f"""## MANDATORY Self-Critique: {subtask_id}

**Subtask Description:** {subtask_desc}
**Service:** {service}

Before marking this subtask as complete, you MUST perform a thorough self-critique.
This is NOT optional - it's a required quality gate.

### STEP 1: Code Quality Checklist

Review your implementation against these criteria:

**Pattern Adherence:**
- [ ] Follows patterns from reference files exactly: {", ".join(patterns_from) if patterns_from else "N/A"}
- [ ] Variable naming matches codebase conventions
- [ ] Imports organized correctly (grouped, sorted)
- [ ] Code style consistent with existing files

**Error Handling:**
- [ ] Try-catch blocks where operations can fail
- [ ] Meaningful error messages
- [ ] Proper error propagation
- [ ] Edge cases considered

**Code Cleanliness:**
- [ ] No console.log/print statements for debugging
- [ ] No commented-out code blocks
- [ ] No TODO comments without context
- [ ] No hardcoded values that should be configurable

**Best Practices:**
- [ ] Functions are focused and single-purpose
- [ ] No code duplication
- [ ] Appropriate use of constants
- [ ] Documentation/comments where needed

### STEP 2: Implementation Completeness

**Files Modified:**
Expected: {", ".join(files_to_modify) if files_to_modify else "None"}
Actual: {", ".join(files_modified) if files_modified else "None"}
- [ ] All files_to_modify were actually modified
- [ ] No unexpected files were modified

**Files Created:**
Expected: {", ".join(files_to_create) if files_to_create else "None"}
- [ ] All files_to_create were actually created
- [ ] Files follow naming conventions

**Requirements:**
- [ ] Subtask description requirements fully met
- [ ] All acceptance criteria from spec considered
- [ ] No scope creep - stayed within subtask boundaries

### STEP 3: Potential Issues Analysis

List any concerns, limitations, or potential problems with your implementation:

1. [Issue 1, or "None identified"]
2. [Issue 2, if any]
3. [Issue 3, if any]

Be honest. Finding issues now is better than discovering them during verification.

### STEP 4: Improvements Made

If you identified issues in your critique, list what you fixed:

1. [Improvement 1, or "No fixes needed"]
2. [Improvement 2, if applicable]
3. [Improvement 3, if applicable]

### STEP 5: Final Verdict

**PROCEED:** [YES/NO - Only YES if all critical items pass]

**REASON:** [Brief explanation of your decision]

**CONFIDENCE:** [High/Medium/Low - How confident are you in this implementation?]

---

## Instructions for Agent

1. Work through each section methodically
2. Check each box honestly - don't skip items
3. If you find issues, FIX THEM before continuing
4. Re-run this critique after fixes
5. Only mark the subtask complete when verdict is YES with High confidence
6. Document your critique results in your response

Remember: The next session has no context. Quality issues you miss now will be harder to fix later.
"""

    return prompt


def parse_critique_response(response: str) -> CritiqueResult:
    """
    Parse the agent's critique response into structured data.

    Args:
        response: The agent's response to the critique prompt

    Returns:
        CritiqueResult with parsed information
    """
    issues = []
    improvements = []
    recommendations = []
    passes = False

    # Extract PROCEED verdict
    proceed_match = re.search(
        r"\*\*PROCEED:\*\*\s*\[?\s*(YES|NO)", response, re.IGNORECASE
    )
    if proceed_match:
        passes = proceed_match.group(1).upper() == "YES"

    # Extract issues from Step 3
    issues_section = re.search(
        r"### STEP 3:.*?Potential Issues.*?\n\n(.*?)(?=###|\Z)",
        response,
        re.DOTALL | re.IGNORECASE,
    )
    if issues_section:
        issue_lines = issues_section.group(1).strip().split("\n")
        for line in issue_lines:
            line = line.strip()
            if not line or line.startswith("---"):
                continue
            # Remove list markers
            issue = re.sub(r"^\d+\.\s*|\*\s*|-\s*", "", line).strip()
            # Skip if it's a placeholder or indicates no issues
            if (
                issue
                and issue.lower()
                not in ["none", "none identified", "no issues", "no concerns"]
                and issue
                not in [
                    '[Issue 1, or "None identified"]',
                    "[Issue 2, if any]",
                    "[Issue 3, if any]",
                ]
            ):
                issues.append(issue)

    # Extract improvements from Step 4
    improvements_section = re.search(
        r"### STEP 4:.*?Improvements Made.*?\n\n(.*?)(?=###|\Z)",
        response,
        re.DOTALL | re.IGNORECASE,
    )
    if improvements_section:
        improvement_lines = improvements_section.group(1).strip().split("\n")
        for line in improvement_lines:
            line = line.strip()
            if not line or line.startswith("---"):
                continue
            # Remove list markers
            improvement = re.sub(r"^\d+\.\s*|\*\s*|-\s*", "", line).strip()
            # Skip if it's a placeholder or indicates no improvements
            if (
                improvement
                and improvement.lower()
                not in ["none", "no fixes needed", "no improvements", "n/a"]
                and improvement
                not in [
                    '[Improvement 1, or "No fixes needed"]',
                    "[Improvement 2, if applicable]",
                    "[Improvement 3, if applicable]",
                ]
            ):
                improvements.append(improvement)

    # Extract confidence level as recommendation
    confidence_match = re.search(
        r"\*\*CONFIDENCE:\*\*\s*\[?\s*(High|Medium|Low)", response, re.IGNORECASE
    )
    if confidence_match:
        confidence = confidence_match.group(1)
        if confidence.lower() != "high":
            recommendations.append(
                f"Confidence level: {confidence} - consider additional review"
            )

    return CritiqueResult(
        passes=passes,
        issues=issues,
        improvements_made=improvements,
        recommendations=recommendations,
    )


def should_proceed(result: CritiqueResult) -> bool:
    """
    Determine if the subtask should be marked complete based on critique.

    Args:
        result: The critique result

    Returns:
        True if subtask can be marked complete, False otherwise
    """
    # Must pass the critique
    if not result.passes:
        return False

    # If there are unresolved issues, don't proceed
    if result.issues:
        return False

    return True


def format_critique_summary(result: CritiqueResult) -> str:
    """
    Format a critique result as a human-readable summary.

    Args:
        result: The critique result

    Returns:
        Formatted summary string
    """
    lines = ["## Critique Summary"]
    lines.append("")
    lines.append(f"**Status:** {'PASSED ✓' if result.passes else 'FAILED ✗'}")
    lines.append("")

    if result.issues:
        lines.append("**Issues Identified:**")
        for i, issue in enumerate(result.issues, 1):
            lines.append(f"{i}. {issue}")
        lines.append("")

    if result.improvements_made:
        lines.append("**Improvements Made:**")
        for i, improvement in enumerate(result.improvements_made, 1):
            lines.append(f"{i}. {improvement}")
        lines.append("")

    if result.recommendations:
        lines.append("**Recommendations:**")
        for i, rec in enumerate(result.recommendations, 1):
            lines.append(f"{i}. {rec}")
        lines.append("")

    if should_proceed(result):
        lines.append("**Decision:** Subtask is ready to be marked complete.")
    else:
        lines.append("**Decision:** Subtask needs more work before completion.")

    return "\n".join(lines)


# Example usage for testing
if __name__ == "__main__":
    # Demo subtask
    subtask = {
        "id": "auth-middleware",
        "description": "Add JWT authentication middleware",
        "service": "backend",
        "files_to_modify": ["app/middleware/auth.py"],
        "patterns_from": ["app/middleware/cors.py"],
    }

    files_modified = ["app/middleware/auth.py"]

    # Generate prompt
    prompt = generate_critique_prompt(subtask, files_modified, subtask["patterns_from"])
    print(prompt)
    print("\n" + "=" * 80 + "\n")

    # Simulate a critique response
    sample_response = """
### STEP 3: Potential Issues Analysis

1. Token expiration edge case not fully tested
2. None

### STEP 4: Improvements Made

1. Added comprehensive error handling for invalid tokens
2. Improved logging for debugging
3. Added input validation for JWT format

### STEP 5: Final Verdict

**PROCEED:** YES

**REASON:** All critical items verified, patterns followed, error handling complete

**CONFIDENCE:** High
"""

    # Parse response
    result = parse_critique_response(sample_response)
    print(format_critique_summary(result))
    print(f"\nShould proceed: {should_proceed(result)}")
