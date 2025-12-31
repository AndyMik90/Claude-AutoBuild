"""
Pydantic Models for Structured AI Outputs
==========================================

These models define JSON schemas for Claude Agent SDK structured outputs.
Used to guarantee valid, validated JSON from AI responses in PR reviews.

Usage:
    from claude_agent_sdk import query
    from .pydantic_models import FollowupReviewResponse

    async for message in query(
        prompt="...",
        options={
            "output_format": {
                "type": "json_schema",
                "schema": FollowupReviewResponse.model_json_schema()
            }
        }
    ):
        if hasattr(message, 'structured_output'):
            result = FollowupReviewResponse.model_validate(message.structured_output)
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

# =============================================================================
# Common Finding Types
# =============================================================================


class BaseFinding(BaseModel):
    """Base class for all finding types."""

    id: str = Field(description="Unique identifier for this finding")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        description="Issue severity level"
    )
    title: str = Field(description="Brief issue title (max 80 chars)")
    description: str = Field(description="Detailed explanation of the issue")
    file: str = Field(description="File path where issue was found")
    line: int = Field(0, description="Line number of the issue")
    suggested_fix: str | None = Field(None, description="How to fix this issue")
    fixable: bool = Field(False, description="Whether this can be auto-fixed")


class SecurityFinding(BaseFinding):
    """A security vulnerability finding."""

    category: Literal["security"] = Field(
        default="security", description="Always 'security' for security findings"
    )


class QualityFinding(BaseFinding):
    """A code quality or redundancy finding."""

    category: Literal[
        "redundancy", "quality", "test", "performance", "pattern", "docs"
    ] = Field(description="Issue category")
    redundant_with: str | None = Field(
        None, description="Reference to duplicate code (file:line) if redundant"
    )


class DeepAnalysisFinding(BaseFinding):
    """A finding from deep analysis with verification info."""

    category: Literal[
        "verification_failed",
        "redundancy",
        "quality",
        "pattern",
        "performance",
        "logic",
    ] = Field(description="Issue category")
    confidence: float = Field(
        0.85, ge=0.0, le=1.0, description="AI's confidence in this finding (0.0-1.0)"
    )
    verification_note: str | None = Field(
        None, description="What evidence is missing or couldn't be verified"
    )


class StructuralIssue(BaseModel):
    """A structural issue with the PR."""

    id: str = Field(description="Unique identifier")
    issue_type: Literal[
        "feature_creep", "scope_creep", "architecture_violation", "poor_structure"
    ] = Field(description="Type of structural issue")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        description="Issue severity"
    )
    title: str = Field(description="Brief issue title")
    description: str = Field(description="Detailed explanation")
    impact: str = Field(description="Why this matters")
    suggestion: str = Field(description="How to fix")


class AICommentTriage(BaseModel):
    """Triage result for an AI tool comment."""

    comment_id: int = Field(description="GitHub comment ID")
    tool_name: str = Field(
        description="AI tool name (CodeRabbit, Cursor, Greptile, etc.)"
    )
    verdict: Literal[
        "critical", "important", "nice_to_have", "trivial", "false_positive"
    ] = Field(description="Verdict on the comment")
    reasoning: str = Field(description="Why this verdict was chosen")
    response_comment: str | None = Field(
        None, description="Optional comment to post in reply"
    )


# =============================================================================
# Follow-up Review Response
# =============================================================================


class FindingResolution(BaseModel):
    """Resolution status for a previous finding."""

    finding_id: str = Field(description="ID of the previous finding")
    status: Literal["resolved", "unresolved"] = Field(description="Resolution status")
    resolution_notes: str | None = Field(
        None, description="Notes on how it was resolved"
    )


class FollowupFinding(BaseModel):
    """A new finding from follow-up review (simpler than initial review)."""

    id: str = Field(description="Unique identifier for this finding")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        description="Issue severity level"
    )
    category: Literal["security", "quality", "logic", "test", "docs"] = Field(
        description="Issue category"
    )
    title: str = Field(description="Brief issue title")
    description: str = Field(description="Detailed explanation of the issue")
    file: str = Field(description="File path where issue was found")
    line: int = Field(0, description="Line number of the issue")
    suggested_fix: str | None = Field(None, description="How to fix this issue")
    fixable: bool = Field(False, description="Whether this can be auto-fixed")


class FollowupReviewResponse(BaseModel):
    """Complete response schema for follow-up PR review."""

    finding_resolutions: list[FindingResolution] = Field(
        default_factory=list, description="Status of each previous finding"
    )
    new_findings: list[FollowupFinding] = Field(
        default_factory=list,
        description="New issues found in changes since last review",
    )
    comment_findings: list[FollowupFinding] = Field(
        default_factory=list, description="Issues found in contributor comments"
    )
    verdict: Literal[
        "READY_TO_MERGE", "MERGE_WITH_CHANGES", "NEEDS_REVISION", "BLOCKED"
    ] = Field(description="Overall merge verdict")
    verdict_reasoning: str = Field(description="Explanation for the verdict")


# =============================================================================
# Initial Review Responses (Multi-Pass)
# =============================================================================


class QuickScanResult(BaseModel):
    """Result from the quick scan pass."""

    purpose: str = Field(description="Brief description of what the PR claims to do")
    actual_changes: str = Field(
        description="Brief description of what the code actually does"
    )
    purpose_match: bool = Field(
        description="Whether actual changes match the claimed purpose"
    )
    purpose_match_note: str | None = Field(
        None, description="Explanation if purpose doesn't match actual changes"
    )
    risk_areas: list[str] = Field(
        default_factory=list, description="Areas needing careful review"
    )
    red_flags: list[str] = Field(
        default_factory=list, description="Obvious issues or concerns"
    )
    requires_deep_verification: bool = Field(
        description="Whether deep verification is needed"
    )
    complexity: Literal["low", "medium", "high"] = Field(description="PR complexity")


class SecurityPassResult(BaseModel):
    """Result from the security pass - array of security findings."""

    findings: list[SecurityFinding] = Field(
        default_factory=list, description="Security vulnerabilities found"
    )


class QualityPassResult(BaseModel):
    """Result from the quality pass - array of quality findings."""

    findings: list[QualityFinding] = Field(
        default_factory=list, description="Quality and redundancy issues found"
    )


class DeepAnalysisResult(BaseModel):
    """Result from the deep analysis pass."""

    findings: list[DeepAnalysisFinding] = Field(
        default_factory=list,
        description="Deep analysis findings with verification info",
    )


class StructuralPassResult(BaseModel):
    """Result from the structural pass."""

    issues: list[StructuralIssue] = Field(
        default_factory=list, description="Structural issues found"
    )
    verdict: Literal[
        "READY_TO_MERGE", "MERGE_WITH_CHANGES", "NEEDS_REVISION", "BLOCKED"
    ] = Field(description="Structural verdict")
    verdict_reasoning: str = Field(description="Explanation for the verdict")


class AICommentTriageResult(BaseModel):
    """Result from AI comment triage pass."""

    triages: list[AICommentTriage] = Field(
        default_factory=list, description="Triage results for each AI comment"
    )


# =============================================================================
# Issue Triage Response
# =============================================================================


class IssueTriageResponse(BaseModel):
    """Response for issue triage."""

    category: Literal[
        "bug",
        "feature",
        "documentation",
        "question",
        "duplicate",
        "spam",
        "feature_creep",
    ] = Field(description="Issue category")
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence in the categorization (0.0-1.0)"
    )
    priority: Literal["high", "medium", "low"] = Field(description="Issue priority")
    labels_to_add: list[str] = Field(
        default_factory=list, description="Labels to add to the issue"
    )
    labels_to_remove: list[str] = Field(
        default_factory=list, description="Labels to remove from the issue"
    )
    is_duplicate: bool = Field(False, description="Whether this is a duplicate issue")
    duplicate_of: int | None = Field(
        None, description="Issue number this duplicates (if duplicate)"
    )
    is_spam: bool = Field(False, description="Whether this is spam")
    is_feature_creep: bool = Field(
        False, description="Whether this bundles multiple unrelated features"
    )
    suggested_breakdown: list[str] = Field(
        default_factory=list,
        description="Suggested breakdown if feature creep detected",
    )
    comment: str | None = Field(None, description="Optional bot comment to post")


# =============================================================================
# Orchestrator Review Response
# =============================================================================


class OrchestratorFinding(BaseModel):
    """A finding from the orchestrator review."""

    file: str = Field(description="File path where issue was found")
    line: int = Field(0, description="Line number of the issue")
    title: str = Field(description="Brief issue title")
    description: str = Field(description="Detailed explanation of the issue")
    category: Literal[
        "security",
        "quality",
        "style",
        "docs",
        "redundancy",
        "verification_failed",
        "pattern",
        "performance",
        "logic",
        "test",
    ] = Field(description="Issue category")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        description="Issue severity level"
    )
    suggestion: str | None = Field(None, description="How to fix this issue")
    confidence: float = Field(
        0.85,
        ge=0.0,
        le=1.0,
        description="Confidence (0.0-1.0 or 0-100, normalized to 0.0-1.0)",
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range (accepts 0-100 or 0.0-1.0)."""
        if v > 1:
            return v / 100.0
        return float(v)


class OrchestratorReviewResponse(BaseModel):
    """Complete response schema for orchestrator PR review."""

    verdict: Literal[
        "READY_TO_MERGE", "MERGE_WITH_CHANGES", "NEEDS_REVISION", "BLOCKED"
    ] = Field(description="Overall merge verdict")
    verdict_reasoning: str = Field(description="Explanation for the verdict")
    findings: list[OrchestratorFinding] = Field(
        default_factory=list, description="Issues found during review"
    )
    summary: str = Field(description="Brief summary of the review")


# =============================================================================
# Parallel Orchestrator Review Response (SDK Subagents)
# =============================================================================


class LogicFinding(BaseFinding):
    """A logic/correctness finding from the logic review agent."""

    category: Literal["logic"] = Field(
        default="logic", description="Always 'logic' for logic findings"
    )
    confidence: float = Field(
        0.85, ge=0.0, le=1.0, description="Confidence in this finding (0.0-1.0)"
    )
    example_input: str | None = Field(
        None, description="Concrete input that triggers the bug"
    )
    actual_output: str | None = Field(None, description="What the buggy code produces")
    expected_output: str | None = Field(
        None, description="What the code should produce"
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range."""
        if v > 1:
            return v / 100.0
        return float(v)


class CodebaseFitFinding(BaseFinding):
    """A codebase fit finding from the codebase fit review agent."""

    category: Literal["codebase_fit"] = Field(
        default="codebase_fit", description="Always 'codebase_fit' for fit findings"
    )
    confidence: float = Field(
        0.85, ge=0.0, le=1.0, description="Confidence in this finding (0.0-1.0)"
    )
    existing_code: str | None = Field(
        None, description="Reference to existing code that should be used instead"
    )
    codebase_pattern: str | None = Field(
        None, description="Description of the established pattern being violated"
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range."""
        if v > 1:
            return v / 100.0
        return float(v)


class ParallelOrchestratorFinding(BaseModel):
    """A finding from the parallel orchestrator with source agent tracking."""

    id: str = Field(description="Unique identifier for this finding")
    file: str = Field(description="File path where issue was found")
    line: int = Field(0, description="Line number of the issue")
    end_line: int | None = Field(None, description="End line for multi-line issues")
    title: str = Field(description="Brief issue title (max 80 chars)")
    description: str = Field(description="Detailed explanation of the issue")
    category: Literal[
        "security",
        "quality",
        "logic",
        "codebase_fit",
        "test",
        "docs",
        "redundancy",
        "pattern",
        "performance",
    ] = Field(description="Issue category")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        description="Issue severity level"
    )
    confidence: float = Field(
        0.85, ge=0.0, le=1.0, description="Confidence in this finding (0.0-1.0)"
    )
    suggested_fix: str | None = Field(None, description="How to fix this issue")
    fixable: bool = Field(False, description="Whether this can be auto-fixed")
    source_agents: list[str] = Field(
        default_factory=list,
        description="Which agents reported this finding",
    )
    cross_validated: bool = Field(
        False, description="Whether multiple agents agreed on this finding"
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range."""
        if v > 1:
            return v / 100.0
        return float(v)


class AgentAgreement(BaseModel):
    """Tracks agreement between agents on findings."""

    agreed_findings: list[str] = Field(
        default_factory=list,
        description="Finding IDs that multiple agents agreed on",
    )
    conflicting_findings: list[str] = Field(
        default_factory=list,
        description="Finding IDs where agents disagreed",
    )
    resolution_notes: str | None = Field(
        None, description="Notes on how conflicts were resolved"
    )


class ParallelOrchestratorResponse(BaseModel):
    """Complete response schema for parallel orchestrator PR review."""

    analysis_summary: str = Field(
        description="Brief summary of what was analyzed and why agents were chosen"
    )
    agents_invoked: list[str] = Field(
        default_factory=list,
        description="List of agent names that were invoked",
    )
    findings: list[ParallelOrchestratorFinding] = Field(
        default_factory=list, description="All findings from synthesis"
    )
    agent_agreement: AgentAgreement = Field(
        default_factory=AgentAgreement,
        description="Information about agent agreement on findings",
    )
    verdict: Literal["APPROVE", "COMMENT", "NEEDS_REVISION", "BLOCKED"] = Field(
        description="Overall PR verdict"
    )
    verdict_reasoning: str = Field(description="Explanation for the verdict")


# =============================================================================
# Parallel Follow-up Review Response (SDK Subagents for Follow-up)
# =============================================================================


class ResolutionVerification(BaseModel):
    """AI-verified resolution status for a previous finding."""

    finding_id: str = Field(description="ID of the previous finding")
    status: Literal["resolved", "partially_resolved", "unresolved", "cant_verify"] = (
        Field(description="Resolution status after AI verification")
    )
    confidence: float = Field(
        0.85, ge=0.0, le=1.0, description="Confidence in the resolution status"
    )
    evidence: str = Field(description="What evidence supports this resolution status")
    resolution_notes: str | None = Field(
        None, description="Detailed notes on how the issue was addressed"
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range."""
        if v > 1:
            return v / 100.0
        return float(v)


class ParallelFollowupFinding(BaseModel):
    """A finding from parallel follow-up review with source agent tracking."""

    id: str = Field(description="Unique identifier for this finding")
    file: str = Field(description="File path where issue was found")
    line: int = Field(0, description="Line number of the issue")
    end_line: int | None = Field(None, description="End line for multi-line issues")
    title: str = Field(description="Brief issue title (max 80 chars)")
    description: str = Field(description="Detailed explanation of the issue")
    category: Literal[
        "security",
        "quality",
        "logic",
        "test",
        "docs",
        "regression",
        "incomplete_fix",
    ] = Field(description="Issue category")
    severity: Literal["critical", "high", "medium", "low"] = Field(
        description="Issue severity level"
    )
    confidence: float = Field(
        0.85, ge=0.0, le=1.0, description="Confidence in this finding (0.0-1.0)"
    )
    suggested_fix: str | None = Field(None, description="How to fix this issue")
    fixable: bool = Field(False, description="Whether this can be auto-fixed")
    source_agent: str = Field(
        description="Which agent reported this finding (resolution/newcode/comment)"
    )
    related_to_previous: str | None = Field(
        None, description="ID of related previous finding if this is a regression"
    )

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range."""
        if v > 1:
            return v / 100.0
        return float(v)


class CommentAnalysis(BaseModel):
    """Analysis of a contributor or AI comment."""

    comment_id: str = Field(description="Identifier for the comment")
    author: str = Field(description="Comment author")
    is_ai_bot: bool = Field(description="Whether this is from an AI tool")
    requires_response: bool = Field(description="Whether this comment needs a response")
    sentiment: Literal["question", "concern", "suggestion", "praise", "neutral"] = (
        Field(description="Comment sentiment/type")
    )
    summary: str = Field(description="Brief summary of the comment")
    action_needed: str | None = Field(None, description="What action is needed if any")


class ParallelFollowupResponse(BaseModel):
    """Complete response schema for parallel follow-up PR review."""

    # Analysis metadata
    analysis_summary: str = Field(
        description="Brief summary of what was analyzed in this follow-up"
    )
    agents_invoked: list[str] = Field(
        default_factory=list,
        description="List of agent names that were invoked",
    )
    commits_analyzed: int = Field(0, description="Number of new commits analyzed")
    files_changed: int = Field(
        0, description="Number of files changed since last review"
    )

    # Resolution verification (from resolution-verifier agent)
    resolution_verifications: list[ResolutionVerification] = Field(
        default_factory=list,
        description="AI-verified resolution status for each previous finding",
    )

    # New findings (from new-code-reviewer agent)
    new_findings: list[ParallelFollowupFinding] = Field(
        default_factory=list,
        description="New issues found in changes since last review",
    )

    # Comment analysis (from comment-analyzer agent)
    comment_analyses: list[CommentAnalysis] = Field(
        default_factory=list,
        description="Analysis of contributor and AI comments",
    )
    comment_findings: list[ParallelFollowupFinding] = Field(
        default_factory=list,
        description="Issues identified from comment analysis",
    )

    # Agent agreement tracking
    agent_agreement: AgentAgreement = Field(
        default_factory=AgentAgreement,
        description="Information about agent agreement on findings",
    )

    # Verdict
    verdict: Literal[
        "READY_TO_MERGE", "MERGE_WITH_CHANGES", "NEEDS_REVISION", "BLOCKED"
    ] = Field(description="Overall merge verdict")
    verdict_reasoning: str = Field(description="Explanation for the verdict")
