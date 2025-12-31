"""
Parallel Follow-up PR Reviewer
===============================

PR follow-up reviewer using Claude Agent SDK subagents for parallel specialist analysis.

The orchestrator analyzes incremental changes and delegates to specialized agents:
- resolution-verifier: Verifies previous findings are addressed
- new-code-reviewer: Reviews new code for issues
- comment-analyzer: Processes contributor and AI feedback

Key Design:
- AI decides which agents to invoke (NOT programmatic rules)
- Subagents defined via SDK `agents={}` parameter
- SDK handles parallel execution automatically
- User-configured model from frontend settings (no hardcoding)
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import FollowupReviewContext

from claude_agent_sdk import AgentDefinition

try:
    from ...core.client import create_client
    from ...phase_config import get_thinking_budget
    from ..models import (
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewSeverity,
    )
    from .category_utils import map_category
    from .pydantic_models import ParallelFollowupResponse
    from .sdk_utils import process_sdk_stream
except (ImportError, ValueError, SystemError):
    from core.client import create_client
    from models import (
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewSeverity,
    )
    from phase_config import get_thinking_budget
    from services.category_utils import map_category
    from services.pydantic_models import ParallelFollowupResponse
    from services.sdk_utils import process_sdk_stream


logger = logging.getLogger(__name__)

# Check if debug mode is enabled
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("true", "1", "yes")

# Severity mapping for AI responses
_SEVERITY_MAPPING = {
    "critical": ReviewSeverity.CRITICAL,
    "high": ReviewSeverity.HIGH,
    "medium": ReviewSeverity.MEDIUM,
    "low": ReviewSeverity.LOW,
}


def _map_severity(severity_str: str) -> ReviewSeverity:
    """Map severity string to ReviewSeverity enum."""
    return _SEVERITY_MAPPING.get(severity_str.lower(), ReviewSeverity.MEDIUM)


class ParallelFollowupReviewer:
    """
    Follow-up PR reviewer using SDK subagents for parallel specialist analysis.

    The orchestrator:
    1. Analyzes incremental changes since last review
    2. Delegates to appropriate specialist agents (SDK handles parallel execution)
    3. Synthesizes findings into a final merge verdict

    Specialist Agents:
    - resolution-verifier: Verifies previous findings are addressed
    - new-code-reviewer: Reviews new code for issues
    - comment-analyzer: Processes contributor and AI feedback

    Model Configuration:
    - Orchestrator uses user-configured model from frontend settings
    - Specialist agents use model="inherit" (same as orchestrator)
    """

    def __init__(
        self,
        project_dir: Path,
        github_dir: Path,
        config: GitHubRunnerConfig,
        progress_callback=None,
    ):
        self.project_dir = Path(project_dir)
        self.github_dir = Path(github_dir)
        self.config = config
        self.progress_callback = progress_callback

    def _report_progress(self, phase: str, progress: int, message: str, **kwargs):
        """Report progress if callback is set."""
        if self.progress_callback:
            import sys

            if "orchestrator" in sys.modules:
                ProgressCallback = sys.modules["orchestrator"].ProgressCallback
            else:
                try:
                    from ..orchestrator import ProgressCallback
                except ImportError:
                    from orchestrator import ProgressCallback

            self.progress_callback(
                ProgressCallback(
                    phase=phase, progress=progress, message=message, **kwargs
                )
            )

    def _load_prompt(self, filename: str) -> str:
        """Load a prompt file from the prompts/github directory."""
        prompt_file = (
            Path(__file__).parent.parent.parent.parent / "prompts" / "github" / filename
        )
        if prompt_file.exists():
            return prompt_file.read_text(encoding="utf-8")
        logger.warning(f"Prompt file not found: {prompt_file}")
        return ""

    def _define_specialist_agents(self) -> dict[str, AgentDefinition]:
        """
        Define specialist agents for follow-up review.

        Each agent has:
        - description: When the orchestrator should invoke this agent
        - prompt: System prompt for the agent
        - tools: Tools the agent can use (read-only for PR review)
        - model: "inherit" = use same model as orchestrator (user's choice)
        """
        # Load agent prompts from files
        resolution_prompt = self._load_prompt("pr_followup_resolution_agent.md")
        newcode_prompt = self._load_prompt("pr_followup_newcode_agent.md")
        comment_prompt = self._load_prompt("pr_followup_comment_agent.md")

        return {
            "resolution-verifier": AgentDefinition(
                description=(
                    "Resolution verification specialist. Use to verify whether previous "
                    "findings have been addressed. Analyzes diffs to determine if issues "
                    "are truly fixed, partially fixed, or still unresolved. "
                    "Invoke when: There are previous findings to verify."
                ),
                prompt=resolution_prompt
                or "You verify whether previous findings are resolved.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
            "new-code-reviewer": AgentDefinition(
                description=(
                    "New code analysis specialist. Reviews code added since last review "
                    "for security, logic, quality issues, and regressions. "
                    "Invoke when: There are substantial code changes (>50 lines diff) or "
                    "changes to security-sensitive areas."
                ),
                prompt=newcode_prompt or "You review new code for issues.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
            "comment-analyzer": AgentDefinition(
                description=(
                    "Comment and feedback analyst. Processes contributor comments and "
                    "AI tool reviews (CodeRabbit, Cursor, Gemini, etc.) to identify "
                    "unanswered questions and valid concerns. "
                    "Invoke when: There are comments or formal reviews since last review."
                ),
                prompt=comment_prompt or "You analyze comments and feedback.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
        }

    def _format_previous_findings(self, context: FollowupReviewContext) -> str:
        """Format previous findings for the prompt."""
        previous_findings = context.previous_review.findings
        if not previous_findings:
            return "No previous findings to verify."

        lines = []
        for f in previous_findings:
            lines.append(
                f"- **{f.id}** [{f.severity.value}] {f.title}\n"
                f"  File: {f.file}:{f.line}\n"
                f"  {f.description[:200]}..."
            )
        return "\n".join(lines)

    def _format_commits(self, context: FollowupReviewContext) -> str:
        """Format new commits for the prompt."""
        if not context.commits_since_review:
            return "No new commits."

        lines = []
        for commit in context.commits_since_review[:20]:  # Limit to 20 commits
            sha = commit.get("sha", "")[:7]
            message = commit.get("commit", {}).get("message", "").split("\n")[0]
            author = commit.get("commit", {}).get("author", {}).get("name", "unknown")
            lines.append(f"- `{sha}` by {author}: {message}")
        return "\n".join(lines)

    def _format_comments(self, context: FollowupReviewContext) -> str:
        """Format contributor comments for the prompt."""
        if not context.contributor_comments_since_review:
            return "No contributor comments since last review."

        lines = []
        for comment in context.contributor_comments_since_review[:15]:
            author = comment.get("user", {}).get("login", "unknown")
            body = comment.get("body", "")[:300]
            lines.append(f"**@{author}**: {body}")
        return "\n\n".join(lines)

    def _format_ai_reviews(self, context: FollowupReviewContext) -> str:
        """Format AI bot reviews and comments for the prompt."""
        ai_content = []

        # AI bot comments
        for comment in context.ai_bot_comments_since_review[:10]:
            author = comment.get("user", {}).get("login", "unknown")
            body = comment.get("body", "")[:500]
            ai_content.append(f"**{author}** (comment):\n{body}")

        # Formal PR reviews from AI tools
        for review in context.pr_reviews_since_review[:5]:
            author = review.get("user", {}).get("login", "unknown")
            body = review.get("body", "")[:1000]
            state = review.get("state", "unknown")
            ai_content.append(f"**{author}** ({state}):\n{body}")

        if not ai_content:
            return "No AI tool feedback since last review."

        return "\n\n---\n\n".join(ai_content)

    def _build_orchestrator_prompt(self, context: FollowupReviewContext) -> str:
        """Build full prompt for orchestrator with follow-up context."""
        # Load orchestrator prompt
        base_prompt = self._load_prompt("pr_followup_orchestrator.md")
        if not base_prompt:
            base_prompt = "You are a follow-up PR reviewer. Verify resolutions and find new issues."

        # Build context sections
        previous_findings = self._format_previous_findings(context)
        commits = self._format_commits(context)
        contributor_comments = self._format_comments(context)
        ai_reviews = self._format_ai_reviews(context)

        # Truncate diff if too long
        MAX_DIFF_CHARS = 100_000
        diff_content = context.diff_since_review
        if len(diff_content) > MAX_DIFF_CHARS:
            diff_content = diff_content[:MAX_DIFF_CHARS] + "\n\n... (diff truncated)"

        followup_context = f"""
---

## Follow-up Review Context

**PR Number:** {context.pr_number}
**Previous Review Commit:** {context.previous_commit_sha[:8]}
**Current HEAD:** {context.current_commit_sha[:8]}
**New Commits:** {len(context.commits_since_review)}
**Files Changed:** {len(context.files_changed_since_review)}

### Previous Review Summary
{context.previous_review.summary[:500] if context.previous_review.summary else "No summary available."}

### Previous Findings to Verify
{previous_findings}

### New Commits Since Last Review
{commits}

### Files Changed Since Last Review
{chr(10).join(f"- {f}" for f in context.files_changed_since_review[:30])}

### Contributor Comments Since Last Review
{contributor_comments}

### AI Tool Feedback Since Last Review
{ai_reviews}

### Diff Since Last Review
```diff
{diff_content}
```

---

Now analyze this follow-up and delegate to the appropriate specialist agents.
Remember: YOU decide which agents to invoke based on YOUR analysis.
The SDK will run invoked agents in parallel automatically.
"""

        return base_prompt + followup_context

    async def review(self, context: FollowupReviewContext) -> PRReviewResult:
        """
        Main follow-up review entry point.

        Args:
            context: Follow-up context with incremental changes

        Returns:
            PRReviewResult with findings and verdict
        """
        logger.info(
            f"[ParallelFollowup] Starting follow-up review for PR #{context.pr_number}"
        )

        try:
            self._report_progress(
                "orchestrating",
                35,
                "Parallel orchestrator analyzing follow-up...",
                pr_number=context.pr_number,
            )

            # Build orchestrator prompt
            prompt = self._build_orchestrator_prompt(context)

            # Get project root
            project_root = (
                self.project_dir.parent.parent
                if self.project_dir.name == "backend"
                else self.project_dir
            )

            # Use model and thinking level from config (user settings)
            model = self.config.model or "claude-sonnet-4-5-20250929"
            thinking_level = self.config.thinking_level or "medium"
            thinking_budget = get_thinking_budget(thinking_level)

            logger.info(
                f"[ParallelFollowup] Using model={model}, "
                f"thinking_level={thinking_level}, thinking_budget={thinking_budget}"
            )

            # Create client with subagents defined
            client = create_client(
                project_dir=project_root,
                spec_dir=self.github_dir,
                model=model,
                agent_type="pr_followup_parallel",
                max_thinking_tokens=thinking_budget,
                agents=self._define_specialist_agents(),
                output_format={
                    "type": "json_schema",
                    "schema": ParallelFollowupResponse.model_json_schema(),
                },
            )

            self._report_progress(
                "orchestrating",
                40,
                "Orchestrator delegating to specialist agents...",
                pr_number=context.pr_number,
            )

            # Run orchestrator session using shared SDK stream processor
            async with client:
                await client.query(prompt)

                print(
                    f"[ParallelFollowup] Running orchestrator ({model})...",
                    flush=True,
                )

                # Process SDK stream with shared utility
                stream_result = await process_sdk_stream(
                    client=client,
                    context_name="ParallelFollowup",
                )

                # Check for stream processing errors
                if stream_result.get("error"):
                    logger.error(
                        f"[ParallelFollowup] SDK stream failed: {stream_result['error']}"
                    )
                    raise RuntimeError(
                        f"SDK stream processing failed: {stream_result['error']}"
                    )

                result_text = stream_result["result_text"]
                structured_output = stream_result["structured_output"]
                agents_invoked = stream_result["agents_invoked"]
                msg_count = stream_result["msg_count"]

            self._report_progress(
                "finalizing",
                50,
                "Synthesizing follow-up findings...",
                pr_number=context.pr_number,
            )

            # Parse findings from output
            if structured_output:
                result_data = self._parse_structured_output(structured_output, context)
            else:
                result_data = self._parse_text_output(result_text, context)

            # Extract data
            findings = result_data.get("findings", [])
            resolved_ids = result_data.get("resolved_ids", [])
            unresolved_ids = result_data.get("unresolved_ids", [])
            new_finding_ids = result_data.get("new_finding_ids", [])
            verdict = result_data.get("verdict", MergeVerdict.NEEDS_REVISION)
            verdict_reasoning = result_data.get("verdict_reasoning", "")

            # Use agents from structured output (more reliable than streaming detection)
            agents_from_result = result_data.get("agents_invoked", [])
            final_agents = agents_from_result if agents_from_result else agents_invoked
            logger.info(
                f"[ParallelFollowup] Session complete. Agents invoked: {final_agents}"
            )
            print(
                f"[ParallelFollowup] Complete. Agents invoked: {final_agents}",
                flush=True,
            )

            # Deduplicate findings
            unique_findings = self._deduplicate_findings(findings)

            logger.info(
                f"[ParallelFollowup] Review complete: {len(unique_findings)} findings, "
                f"{len(resolved_ids)} resolved, {len(unresolved_ids)} unresolved"
            )

            # Generate summary
            summary = self._generate_summary(
                verdict=verdict,
                verdict_reasoning=verdict_reasoning,
                resolved_count=len(resolved_ids),
                unresolved_count=len(unresolved_ids),
                new_count=len(new_finding_ids),
                agents_invoked=final_agents,
            )

            # Map verdict to overall_status
            if verdict == MergeVerdict.BLOCKED:
                overall_status = "request_changes"
            elif verdict == MergeVerdict.NEEDS_REVISION:
                overall_status = "request_changes"
            elif verdict == MergeVerdict.MERGE_WITH_CHANGES:
                overall_status = "comment"
            else:
                overall_status = "approve"

            # Generate blockers from critical/high/medium severity findings
            # (Medium also blocks merge in our strict quality gates approach)
            blockers = []
            for finding in unique_findings:
                if finding.severity in (
                    ReviewSeverity.CRITICAL,
                    ReviewSeverity.HIGH,
                    ReviewSeverity.MEDIUM,
                ):
                    blockers.append(f"{finding.category.value}: {finding.title}")

            result = PRReviewResult(
                pr_number=context.pr_number,
                repo=self.config.repo,
                success=True,
                findings=unique_findings,
                summary=summary,
                overall_status=overall_status,
                verdict=verdict,
                verdict_reasoning=verdict_reasoning,
                blockers=blockers,
                reviewed_commit_sha=context.current_commit_sha,
                is_followup_review=True,
                previous_review_id=context.previous_review.review_id
                or context.previous_review.pr_number,
                resolved_findings=resolved_ids,
                unresolved_findings=unresolved_ids,
                new_findings_since_last_review=new_finding_ids,
            )

            self._report_progress(
                "analyzed",
                60,
                "Follow-up analysis complete",
                pr_number=context.pr_number,
            )

            return result

        except Exception as e:
            logger.error(f"[ParallelFollowup] Review failed: {e}", exc_info=True)
            print(f"[ParallelFollowup] Error: {e}", flush=True)

            return PRReviewResult(
                pr_number=context.pr_number,
                repo=self.config.repo,
                success=False,
                findings=[],
                summary=f"Follow-up review failed: {e}",
                overall_status="comment",
                verdict=MergeVerdict.NEEDS_REVISION,
                verdict_reasoning=f"Review failed: {e}",
                blockers=[str(e)],
                is_followup_review=True,
                reviewed_commit_sha=context.current_commit_sha,
            )

    def _parse_structured_output(
        self, data: dict, context: FollowupReviewContext
    ) -> dict:
        """Parse structured output from ParallelFollowupResponse."""
        try:
            # Validate with Pydantic
            response = ParallelFollowupResponse.model_validate(data)

            # Log agents from structured output
            agents_from_output = response.agents_invoked or []
            if agents_from_output:
                print(
                    f"[ParallelFollowup] Specialist agents invoked: {', '.join(agents_from_output)}",
                    flush=True,
                )
                for agent in agents_from_output:
                    print(f"[Agent:{agent}] Analysis complete", flush=True)

            findings = []
            resolved_ids = []
            unresolved_ids = []
            new_finding_ids = []

            # Process resolution verifications
            for rv in response.resolution_verifications:
                if rv.status == "resolved":
                    resolved_ids.append(rv.finding_id)
                elif rv.status in ("unresolved", "partially_resolved", "cant_verify"):
                    # Include "cant_verify" as unresolved - if we can't verify, assume not fixed
                    unresolved_ids.append(rv.finding_id)
                    # Add unresolved as a finding
                    if rv.status in ("unresolved", "cant_verify"):
                        # Find original finding
                        original = next(
                            (
                                f
                                for f in context.previous_review.findings
                                if f.id == rv.finding_id
                            ),
                            None,
                        )
                        if original:
                            findings.append(
                                PRReviewFinding(
                                    id=rv.finding_id,
                                    severity=original.severity,
                                    category=original.category,
                                    title=f"[UNRESOLVED] {original.title}",
                                    description=f"{original.description}\n\nResolution note: {rv.evidence}",
                                    file=original.file,
                                    line=original.line,
                                    suggested_fix=original.suggested_fix,
                                    fixable=original.fixable,
                                )
                            )

            # Process new findings
            for nf in response.new_findings:
                finding_id = nf.id or self._generate_finding_id(
                    nf.file, nf.line, nf.title
                )
                new_finding_ids.append(finding_id)
                findings.append(
                    PRReviewFinding(
                        id=finding_id,
                        severity=_map_severity(nf.severity),
                        category=map_category(nf.category),
                        title=nf.title,
                        description=nf.description,
                        file=nf.file,
                        line=nf.line,
                        suggested_fix=nf.suggested_fix,
                        fixable=nf.fixable,
                    )
                )

            # Process comment findings
            for cf in response.comment_findings:
                finding_id = cf.id or self._generate_finding_id(
                    cf.file, cf.line, cf.title
                )
                new_finding_ids.append(finding_id)
                findings.append(
                    PRReviewFinding(
                        id=finding_id,
                        severity=_map_severity(cf.severity),
                        category=map_category(cf.category),
                        title=f"[FROM COMMENTS] {cf.title}",
                        description=cf.description,
                        file=cf.file,
                        line=cf.line,
                        suggested_fix=cf.suggested_fix,
                        fixable=cf.fixable,
                    )
                )

            # Map verdict
            verdict_map = {
                "READY_TO_MERGE": MergeVerdict.READY_TO_MERGE,
                "MERGE_WITH_CHANGES": MergeVerdict.MERGE_WITH_CHANGES,
                "NEEDS_REVISION": MergeVerdict.NEEDS_REVISION,
                "BLOCKED": MergeVerdict.BLOCKED,
            }
            verdict = verdict_map.get(response.verdict, MergeVerdict.NEEDS_REVISION)

            # Log findings summary for verification
            print(
                f"[ParallelFollowup] Parsed {len(findings)} findings, "
                f"{len(resolved_ids)} resolved, {len(unresolved_ids)} unresolved, "
                f"{len(new_finding_ids)} new",
                flush=True,
            )
            if findings:
                print("[ParallelFollowup] Findings summary:", flush=True)
                for i, f in enumerate(findings, 1):
                    print(
                        f"  [{f.severity.value.upper()}] {i}. {f.title} ({f.file}:{f.line})",
                        flush=True,
                    )

            return {
                "findings": findings,
                "resolved_ids": resolved_ids,
                "unresolved_ids": unresolved_ids,
                "new_finding_ids": new_finding_ids,
                "verdict": verdict,
                "verdict_reasoning": response.verdict_reasoning,
                "agents_invoked": agents_from_output,
            }

        except Exception as e:
            logger.warning(f"[ParallelFollowup] Failed to parse structured output: {e}")
            return self._create_empty_result()

    def _parse_text_output(self, text: str, context: FollowupReviewContext) -> dict:
        """Parse text output when structured output fails."""
        logger.warning("[ParallelFollowup] Falling back to text parsing")

        # Simple heuristic parsing
        findings = []

        # Look for verdict keywords
        text_lower = text.lower()
        if "ready to merge" in text_lower or "approve" in text_lower:
            verdict = MergeVerdict.READY_TO_MERGE
        elif "blocked" in text_lower or "critical" in text_lower:
            verdict = MergeVerdict.BLOCKED
        elif "needs revision" in text_lower or "request changes" in text_lower:
            verdict = MergeVerdict.NEEDS_REVISION
        else:
            verdict = MergeVerdict.MERGE_WITH_CHANGES

        return {
            "findings": findings,
            "resolved_ids": [],
            "unresolved_ids": [],
            "new_finding_ids": [],
            "verdict": verdict,
            "verdict_reasoning": text[:500] if text else "Unable to parse response",
        }

    def _create_empty_result(self) -> dict:
        """Create empty result structure."""
        return {
            "findings": [],
            "resolved_ids": [],
            "unresolved_ids": [],
            "new_finding_ids": [],
            "verdict": MergeVerdict.NEEDS_REVISION,
            "verdict_reasoning": "Unable to parse review results",
        }

    def _generate_finding_id(self, file: str, line: int, title: str) -> str:
        """Generate a unique finding ID."""
        content = f"{file}:{line}:{title}"
        return f"FU-{hashlib.md5(content.encode(), usedforsecurity=False).hexdigest()[:8].upper()}"

    def _deduplicate_findings(
        self, findings: list[PRReviewFinding]
    ) -> list[PRReviewFinding]:
        """Remove duplicate findings."""
        seen = set()
        unique = []
        for f in findings:
            key = (f.file, f.line, f.title.lower().strip())
            if key not in seen:
                seen.add(key)
                unique.append(f)
        return unique

    def _generate_summary(
        self,
        verdict: MergeVerdict,
        verdict_reasoning: str,
        resolved_count: int,
        unresolved_count: int,
        new_count: int,
        agents_invoked: list[str],
    ) -> str:
        """Generate a human-readable summary of the follow-up review."""
        status_emoji = {
            MergeVerdict.READY_TO_MERGE: "✅",
            MergeVerdict.MERGE_WITH_CHANGES: "⚠️",
            MergeVerdict.NEEDS_REVISION: "🔄",
            MergeVerdict.BLOCKED: "🚫",
        }

        emoji = status_emoji.get(verdict, "📝")
        agents_str = (
            ", ".join(agents_invoked) if agents_invoked else "orchestrator only"
        )

        summary = f"""## {emoji} Follow-up Review: {verdict.value.replace("_", " ").title()}

### Resolution Status
- ✅ **Resolved**: {resolved_count} previous findings addressed
- ❌ **Unresolved**: {unresolved_count} previous findings remain
- 🆕 **New Issues**: {new_count} new findings in recent changes

### Verdict
{verdict_reasoning}

### Review Process
Agents invoked: {agents_str}

---
*This is an AI-generated follow-up review using parallel specialist analysis.*
"""
        return summary
