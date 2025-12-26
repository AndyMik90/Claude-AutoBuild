"""
Follow-up PR Reviewer
=====================

Focused review of changes since last review:
- Only analyzes new commits
- Checks if previous findings are resolved
- Reviews new comments from contributors and AI bots
- Determines if PR is ready to merge

Supports both:
- Heuristic-based review (fast, no AI cost)
- AI-powered review (thorough, uses Claude)
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..models import FollowupReviewContext, GitHubRunnerConfig

try:
    from ..models import (
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
    )
    from .prompt_manager import PromptManager
except (ImportError, ValueError, SystemError):
    from models import (
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
    )
    from services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)

# Category mapping for AI responses
_CATEGORY_MAPPING = {
    "security": ReviewCategory.SECURITY,
    "quality": ReviewCategory.QUALITY,
    "logic": ReviewCategory.QUALITY,
    "test": ReviewCategory.TEST,
    "docs": ReviewCategory.DOCS,
    "pattern": ReviewCategory.PATTERN,
    "performance": ReviewCategory.PERFORMANCE,
}

# Severity mapping for AI responses
_SEVERITY_MAPPING = {
    "critical": ReviewSeverity.CRITICAL,
    "high": ReviewSeverity.HIGH,
    "medium": ReviewSeverity.MEDIUM,
    "low": ReviewSeverity.LOW,
}


class FollowupReviewer:
    """
    Performs focused follow-up reviews of PRs.

    Key capabilities:
    1. Only reviews changes since last review (new commits)
    2. Checks if posted findings have been addressed
    3. Reviews new comments from contributors and AI bots
    4. Determines if PR is ready to merge

    Supports both heuristic and AI-powered review modes.
    """

    def __init__(
        self,
        project_dir: Path,
        github_dir: Path,
        config: GitHubRunnerConfig,
        progress_callback=None,
        use_ai: bool = True,
    ):
        self.project_dir = Path(project_dir)
        self.github_dir = Path(github_dir)
        self.config = config
        self.progress_callback = progress_callback
        self.use_ai = use_ai
        self.prompt_manager = PromptManager()

    def _report_progress(
        self, phase: str, progress: int, message: str, pr_number: int
    ) -> None:
        """Report progress to callback if available."""
        if self.progress_callback:
            self.progress_callback(
                {
                    "phase": phase,
                    "progress": progress,
                    "message": message,
                    "pr_number": pr_number,
                }
            )
        print(f"[Followup] [{phase}] {message}", flush=True)

    async def review_followup(
        self,
        context: FollowupReviewContext,
    ) -> PRReviewResult:
        """
        Perform a focused follow-up review.

        Returns:
            PRReviewResult with updated findings and resolution status
        """
        logger.info(f"[Followup] Starting follow-up review for PR #{context.pr_number}")
        logger.info(f"[Followup] Previous review at: {context.previous_commit_sha[:8]}")
        logger.info(f"[Followup] Current HEAD: {context.current_commit_sha[:8]}")
        logger.info(
            f"[Followup] {len(context.commits_since_review)} new commits, "
            f"{len(context.files_changed_since_review)} files changed"
        )

        self._report_progress(
            "analyzing", 20, "Checking finding resolution...", context.pr_number
        )

        # Phase 1: Check which previous findings are resolved
        previous_findings = context.previous_review.findings
        resolved, unresolved = self._check_finding_resolution(
            previous_findings,
            context.files_changed_since_review,
            context.diff_since_review,
        )

        self._report_progress(
            "analyzing",
            40,
            f"Resolved: {len(resolved)}, Unresolved: {len(unresolved)}",
            context.pr_number,
        )

        # Phase 2: Review new changes for new issues
        self._report_progress(
            "analyzing", 60, "Analyzing new changes...", context.pr_number
        )

        # Use AI-powered review if enabled and there are significant changes
        if self.use_ai and len(context.diff_since_review) > 100:
            try:
                ai_result = await self._run_ai_review(context, resolved, unresolved)
                if ai_result:
                    # AI review successful - use its findings
                    new_findings = ai_result.get("new_findings", [])
                    comment_findings = ai_result.get("comment_findings", [])
                    # AI may have more accurate resolution info
                    ai_resolutions = ai_result.get("finding_resolutions", [])
                    if ai_resolutions:
                        resolved, unresolved = self._apply_ai_resolutions(
                            previous_findings, ai_resolutions
                        )
                else:
                    # Fall back to heuristic
                    new_findings = self._check_new_changes_heuristic(
                        context.diff_since_review,
                        context.files_changed_since_review,
                    )
                    comment_findings = self._review_comments(
                        context.contributor_comments_since_review,
                        context.ai_bot_comments_since_review,
                    )
            except Exception as e:
                logger.warning(f"AI review failed, falling back to heuristic: {e}")
                new_findings = self._check_new_changes_heuristic(
                    context.diff_since_review,
                    context.files_changed_since_review,
                )
                comment_findings = self._review_comments(
                    context.contributor_comments_since_review,
                    context.ai_bot_comments_since_review,
                )
        else:
            # Heuristic-based review (fast, no AI cost)
            new_findings = self._check_new_changes_heuristic(
                context.diff_since_review,
                context.files_changed_since_review,
            )
            # Phase 3: Review contributor comments for questions/concerns
            self._report_progress(
                "analyzing", 80, "Reviewing comments...", context.pr_number
            )
            comment_findings = self._review_comments(
                context.contributor_comments_since_review,
                context.ai_bot_comments_since_review,
            )

        # Combine new findings
        all_new_findings = new_findings + comment_findings

        # Generate verdict
        verdict, verdict_reasoning, blockers = self._generate_followup_verdict(
            resolved_count=len(resolved),
            unresolved_findings=unresolved,
            new_findings=all_new_findings,
        )

        # Generate summary
        summary = self._generate_followup_summary(
            resolved_ids=[f.id for f in resolved],
            unresolved_ids=[f.id for f in unresolved],
            new_finding_ids=[f.id for f in all_new_findings],
            commits_count=len(context.commits_since_review),
            verdict=verdict,
            verdict_reasoning=verdict_reasoning,
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

        # Combine findings: unresolved from before + new ones
        all_findings = unresolved + all_new_findings

        self._report_progress(
            "complete", 100, "Follow-up review complete!", context.pr_number
        )

        return PRReviewResult(
            pr_number=context.pr_number,
            repo=self.config.repo,
            success=True,
            findings=all_findings,
            summary=summary,
            overall_status=overall_status,
            verdict=verdict,
            verdict_reasoning=verdict_reasoning,
            blockers=blockers,
            reviewed_at=datetime.now().isoformat(),
            # Follow-up specific fields
            reviewed_commit_sha=context.current_commit_sha,
            is_followup_review=True,
            previous_review_id=context.previous_review.review_id,
            resolved_findings=[f.id for f in resolved],
            unresolved_findings=[f.id for f in unresolved],
            new_findings_since_last_review=[f.id for f in all_new_findings],
        )

    def _check_finding_resolution(
        self,
        previous_findings: list[PRReviewFinding],
        changed_files: list[str],
        diff: str,
    ) -> tuple[list[PRReviewFinding], list[PRReviewFinding]]:
        """
        Check which previous findings have been addressed.

        A finding is considered resolved if:
        - The file was modified AND the specific line was changed
        - OR the code pattern mentioned was removed
        """
        resolved = []
        unresolved = []

        for finding in previous_findings:
            # If the file wasn't changed, finding is still open
            if finding.file not in changed_files:
                unresolved.append(finding)
                continue

            # Check if the line was modified
            if self._line_appears_changed(finding.file, finding.line, diff):
                resolved.append(finding)
            else:
                # File was modified but the specific line wasn't clearly changed
                # Consider it potentially resolved (benefit of the doubt)
                # Could be more sophisticated with AST analysis
                resolved.append(finding)

        return resolved, unresolved

    def _line_appears_changed(self, file: str, line: int, diff: str) -> bool:
        """Check if a specific line appears to have been changed in the diff."""
        if not diff:
            return False

        # Look for the file in the diff
        file_marker = f"--- a/{file}"
        if file_marker not in diff:
            return False

        # Find the file section in the diff
        file_start = diff.find(file_marker)
        next_file = diff.find("\n--- a/", file_start + 1)
        file_diff = diff[file_start:next_file] if next_file > 0 else diff[file_start:]

        # Parse hunk headers (@@...@@) to find if line was in a changed region
        hunk_pattern = r"@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@"
        for match in re.finditer(hunk_pattern, file_diff):
            start_line = int(match.group(1))
            count = int(match.group(2)) if match.group(2) else 1
            if start_line <= line <= start_line + count:
                return True

        return False

    def _check_new_changes_heuristic(
        self,
        diff: str,
        changed_files: list[str],
    ) -> list[PRReviewFinding]:
        """
        Do a quick heuristic check on new changes.

        This is a simplified check - full AI review would be more thorough.
        Looks for common issues in the diff.
        """
        findings = []

        if not diff:
            return findings

        # Check for common security issues in new code
        security_patterns = [
            (r"password\s*=\s*['\"][^'\"]+['\"]", "Hardcoded password detected"),
            (r"api[_-]?key\s*=\s*['\"][^'\"]+['\"]", "Hardcoded API key detected"),
            (r"secret\s*=\s*['\"][^'\"]+['\"]", "Hardcoded secret detected"),
            (r"eval\s*\(", "Use of eval() detected"),
            (r"dangerouslySetInnerHTML", "dangerouslySetInnerHTML usage detected"),
        ]

        for pattern, title in security_patterns:
            matches = re.finditer(pattern, diff, re.IGNORECASE)
            for match in matches:
                # Only flag if it's in a + line (added code)
                context = diff[max(0, match.start() - 50) : match.end() + 50]
                if "\n+" in context or context.startswith("+"):
                    findings.append(
                        PRReviewFinding(
                            id=hashlib.md5(
                                f"new-{pattern}-{match.start()}".encode(),
                                usedforsecurity=False,
                            ).hexdigest()[:12],
                            severity=ReviewSeverity.HIGH,
                            category=ReviewCategory.SECURITY,
                            title=title,
                            description=f"Potential security issue in new code: {title.lower()}",
                            file="(in diff)",
                            line=0,
                        )
                    )
                    break  # One finding per pattern is enough

        return findings

    def _review_comments(
        self,
        contributor_comments: list[dict],
        ai_bot_comments: list[dict],
    ) -> list[PRReviewFinding]:
        """
        Review new comments and generate findings if needed.

        - Check if contributor questions need attention
        - Flag unaddressed concerns
        """
        findings = []

        # Check contributor comments for questions/concerns
        for comment in contributor_comments:
            body = (comment.get("body") or "").lower()

            # Skip very short comments
            if len(body) < 20:
                continue

            # Look for question patterns
            is_question = "?" in body
            is_concern = any(
                word in body
                for word in [
                    "shouldn't",
                    "should not",
                    "concern",
                    "worried",
                    "instead of",
                    "why not",
                    "problem",
                    "issue",
                ]
            )

            if is_question or is_concern:
                author = ""
                if isinstance(comment.get("user"), dict):
                    author = comment["user"].get("login", "contributor")
                elif isinstance(comment.get("author"), dict):
                    author = comment["author"].get("login", "contributor")

                body_preview = (comment.get("body") or "")[:100]
                if len(comment.get("body", "")) > 100:
                    body_preview += "..."

                findings.append(
                    PRReviewFinding(
                        id=hashlib.md5(
                            f"comment-{comment.get('id', '')}".encode(),
                            usedforsecurity=False,
                        ).hexdigest()[:12],
                        severity=ReviewSeverity.MEDIUM,
                        category=ReviewCategory.QUALITY,
                        title="Contributor comment needs response",
                        description=f"Comment from {author}: {body_preview}",
                        file=comment.get("path", ""),
                        line=comment.get("line", 0) or 0,
                    )
                )

        return findings

    def _generate_followup_verdict(
        self,
        resolved_count: int,
        unresolved_findings: list[PRReviewFinding],
        new_findings: list[PRReviewFinding],
    ) -> tuple[MergeVerdict, str, list[str]]:
        """Generate verdict based on follow-up review results."""
        blockers = []

        # Count by severity
        critical_unresolved = sum(
            1 for f in unresolved_findings if f.severity == ReviewSeverity.CRITICAL
        )
        high_unresolved = sum(
            1 for f in unresolved_findings if f.severity == ReviewSeverity.HIGH
        )
        critical_new = sum(
            1 for f in new_findings if f.severity == ReviewSeverity.CRITICAL
        )
        high_new = sum(1 for f in new_findings if f.severity == ReviewSeverity.HIGH)

        for f in unresolved_findings:
            if f.severity in [ReviewSeverity.CRITICAL, ReviewSeverity.HIGH]:
                blockers.append(f"Unresolved: {f.title} ({f.file}:{f.line})")

        for f in new_findings:
            if f.severity in [ReviewSeverity.CRITICAL, ReviewSeverity.HIGH]:
                blockers.append(f"New issue: {f.title}")

        # Determine verdict
        if critical_unresolved > 0 or critical_new > 0:
            verdict = MergeVerdict.BLOCKED
            reasoning = (
                f"Still blocked by {critical_unresolved + critical_new} critical issues "
                f"({critical_unresolved} unresolved, {critical_new} new)"
            )
        elif high_unresolved > 0 or high_new > 0:
            verdict = MergeVerdict.NEEDS_REVISION
            reasoning = (
                f"{high_unresolved + high_new} high-priority issues "
                f"({high_unresolved} unresolved, {high_new} new)"
            )
        elif len(unresolved_findings) > 0 or len(new_findings) > 0:
            verdict = MergeVerdict.MERGE_WITH_CHANGES
            reasoning = (
                f"{resolved_count} issues resolved. "
                f"{len(unresolved_findings)} remaining, {len(new_findings)} new minor issues."
            )
        else:
            verdict = MergeVerdict.READY_TO_MERGE
            reasoning = f"All {resolved_count} previous findings have been addressed. No new issues."

        return verdict, reasoning, blockers

    def _generate_followup_summary(
        self,
        resolved_ids: list[str],
        unresolved_ids: list[str],
        new_finding_ids: list[str],
        commits_count: int,
        verdict: MergeVerdict,
        verdict_reasoning: str,
    ) -> str:
        """Generate summary for follow-up review."""
        verdict_emoji = {
            MergeVerdict.READY_TO_MERGE: ":white_check_mark:",
            MergeVerdict.MERGE_WITH_CHANGES: ":yellow_circle:",
            MergeVerdict.NEEDS_REVISION: ":orange_circle:",
            MergeVerdict.BLOCKED: ":red_circle:",
        }

        lines = [
            "## Follow-up Review",
            "",
            f"Reviewed {commits_count} new commit(s) since last review.",
            "",
            f"### Verdict: {verdict_emoji.get(verdict, '')} {verdict.value.upper().replace('_', ' ')}",
            "",
            verdict_reasoning,
            "",
            "### Progress Since Last Review",
            f"- **Resolved**: {len(resolved_ids)} finding(s) addressed",
            f"- **Still Open**: {len(unresolved_ids)} finding(s) remaining",
            f"- **New Issues**: {len(new_finding_ids)} new finding(s) in recent commits",
            "",
        ]

        if verdict == MergeVerdict.READY_TO_MERGE:
            lines.extend(
                [
                    "### :rocket: Ready to Merge",
                    "All previous findings have been addressed and no new blocking issues were found.",
                    "",
                ]
            )

        lines.append("---")
        lines.append("_Generated by Auto Claude Follow-up Review_")

        return "\n".join(lines)

    async def _run_ai_review(
        self,
        context: FollowupReviewContext,
        resolved: list[PRReviewFinding],
        unresolved: list[PRReviewFinding],
    ) -> dict[str, Any] | None:
        """
        Run AI-powered follow-up review using the prompt template.

        Returns parsed AI response with finding resolutions and new findings,
        or None if AI review fails.
        """
        self._report_progress(
            "analyzing", 65, "Running AI-powered review...", context.pr_number
        )

        # Build the context for the AI
        prompt = self.prompt_manager.get_followup_review_prompt()

        # Format previous findings for the prompt
        previous_findings_text = "\n".join(
            [
                f"- [{f.id}] {f.severity.value.upper()}: {f.title} ({f.file}:{f.line})"
                for f in context.previous_review.findings
            ]
        )

        # Format commits
        commits_text = "\n".join(
            [
                f"- {c.get('sha', '')[:8]}: {c.get('commit', {}).get('message', '').split(chr(10))[0]}"
                for c in context.commits_since_review
            ]
        )

        # Format comments
        contributor_comments_text = "\n".join(
            [
                f"- @{c.get('user', {}).get('login', 'unknown')}: {c.get('body', '')[:200]}"
                for c in context.contributor_comments_since_review
            ]
        )

        ai_comments_text = "\n".join(
            [
                f"- @{c.get('user', {}).get('login', 'unknown')}: {c.get('body', '')[:200]}"
                for c in context.ai_bot_comments_since_review
            ]
        )

        # Build the full message
        user_message = f"""
{prompt}

---

## Context for This Review

### PREVIOUS REVIEW SUMMARY:
{context.previous_review.summary}

### PREVIOUS FINDINGS:
{previous_findings_text if previous_findings_text else "No previous findings."}

### NEW COMMITS SINCE LAST REVIEW:
{commits_text if commits_text else "No new commits."}

### DIFF SINCE LAST REVIEW:
```diff
{context.diff_since_review[:15000]}
```
{f"... (truncated, {len(context.diff_since_review)} total chars)" if len(context.diff_since_review) > 15000 else ""}

### FILES CHANGED SINCE LAST REVIEW:
{chr(10).join(f"- {f}" for f in context.files_changed_since_review) if context.files_changed_since_review else "No files changed."}

### CONTRIBUTOR COMMENTS SINCE LAST REVIEW:
{contributor_comments_text if contributor_comments_text else "No contributor comments."}

### AI BOT COMMENTS SINCE LAST REVIEW:
{ai_comments_text if ai_comments_text else "No AI bot comments."}

---

Please analyze this follow-up review context and provide your response in the JSON format specified in the prompt.
"""

        try:
            # Use ClaudeSDKClient directly for simple message calls
            # (no agent tools needed, just a single query/response)
            from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

            model = self.config.model or "claude-sonnet-4-5-20250929"

            client = ClaudeSDKClient(
                options=ClaudeAgentOptions(
                    model=model,
                    system_prompt="You are a code review assistant. Analyze the provided context and respond with valid JSON.",
                    allowed_tools=[],
                    max_turns=1,
                    max_thinking_tokens=2048,
                )
            )

            response_text = ""
            async with client:
                await client.query(user_message)

                async for msg in client.receive_response():
                    msg_type = type(msg).__name__
                    logger.debug(f"AI response message type: {msg_type}")
                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            logger.debug(f"  Content block type: {block_type}")
                            if hasattr(block, "text"):
                                response_text += block.text
                            elif hasattr(block, "thinking"):
                                # Skip thinking blocks - we only want the final text
                                logger.debug("  (skipping thinking block)")

            if not response_text:
                logger.warning("AI returned empty response (no text blocks found)")
                return None

            logger.debug(f"AI response text (first 500 chars): {response_text[:500]}")
            return self._parse_ai_response(response_text)

        except ValueError as e:
            # OAuth token not found
            logger.warning(f"No OAuth token available for AI review: {e}")
            print("AI review failed: No OAuth token found", flush=True)
            return None
        except Exception as e:
            logger.error(f"AI review failed: {e}")
            return None

    def _parse_ai_response(self, response_text: str) -> dict[str, Any] | None:
        """Parse the AI response JSON."""
        # Extract JSON from response (may be wrapped in markdown code blocks)
        json_match = re.search(r"```json\s*(.*?)\s*```", response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Try to find raw JSON
            json_match = re.search(r"\{[\s\S]*\}", response_text)
            if json_match:
                json_str = json_match.group(0)
            else:
                logger.warning("No JSON found in AI response")
                return None

        try:
            data = json.loads(json_str)

            # Convert new_findings to PRReviewFinding objects
            new_findings = []
            for f in data.get("new_findings", []):
                try:
                    new_findings.append(
                        PRReviewFinding(
                            id=f.get(
                                "id",
                                hashlib.md5(
                                    f.get("title", "").encode(), usedforsecurity=False
                                ).hexdigest()[:12],
                            ),
                            severity=_SEVERITY_MAPPING.get(
                                f.get("severity", "medium").lower(),
                                ReviewSeverity.MEDIUM,
                            ),
                            category=_CATEGORY_MAPPING.get(
                                f.get("category", "quality").lower(),
                                ReviewCategory.QUALITY,
                            ),
                            title=f.get("title", "Untitled finding"),
                            description=f.get("description", ""),
                            file=f.get("file", ""),
                            line=f.get("line", 0),
                            suggested_fix=f.get("suggested_fix"),
                        )
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse finding: {e}")

            # Convert comment_findings similarly
            comment_findings = []
            for f in data.get("comment_findings", []):
                try:
                    comment_findings.append(
                        PRReviewFinding(
                            id=f.get(
                                "id",
                                hashlib.md5(
                                    f.get("title", "").encode(), usedforsecurity=False
                                ).hexdigest()[:12],
                            ),
                            severity=_SEVERITY_MAPPING.get(
                                f.get("severity", "low").lower(), ReviewSeverity.LOW
                            ),
                            category=_CATEGORY_MAPPING.get(
                                f.get("category", "quality").lower(),
                                ReviewCategory.QUALITY,
                            ),
                            title=f.get("title", "Comment needs attention"),
                            description=f.get("description", ""),
                            file=f.get("file", ""),
                            line=f.get("line", 0),
                        )
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse comment finding: {e}")

            return {
                "finding_resolutions": data.get("finding_resolutions", []),
                "new_findings": new_findings,
                "comment_findings": comment_findings,
                "verdict": data.get("verdict"),
                "verdict_reasoning": data.get("verdict_reasoning"),
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response JSON: {e}")
            return None

    def _apply_ai_resolutions(
        self,
        previous_findings: list[PRReviewFinding],
        ai_resolutions: list[dict],
    ) -> tuple[list[PRReviewFinding], list[PRReviewFinding]]:
        """
        Apply AI-determined resolution status to previous findings.

        Returns (resolved, unresolved) tuple.
        """
        # Build a map of finding_id -> status
        resolution_map = {
            r.get("finding_id"): r.get("status", "unresolved").lower()
            for r in ai_resolutions
        }

        resolved = []
        unresolved = []

        for finding in previous_findings:
            status = resolution_map.get(finding.id, "unresolved")
            if status == "resolved":
                resolved.append(finding)
            else:
                unresolved.append(finding)

        return resolved, unresolved
