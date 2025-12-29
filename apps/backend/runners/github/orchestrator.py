"""
GitHub Automation Orchestrator
==============================

Main coordinator for all GitHub automation workflows:
- PR Review: AI-powered code review
- Issue Triage: Classification and labeling
- Issue Auto-Fix: Automatic spec creation and execution

This is a STANDALONE system - does not modify existing task execution pipeline.

REFACTORED: Service layer architecture - orchestrator delegates to specialized services.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

try:
    # When imported as part of package
    from .bot_detection import BotDetector
    from .context_gatherer import PRContext, PRContextGatherer
    from .gh_client import GHClient
    from .models import (
        AICommentTriage,
        AICommentVerdict,
        AutoFixState,
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
        StructuralIssue,
        TriageResult,
    )
    from .permissions import GitHubPermissionChecker
    from .rate_limiter import RateLimiter
    from .services import (
        AutoFixProcessor,
        BatchProcessor,
        PRReviewEngine,
        TriageEngine,
    )
except (ImportError, ValueError, SystemError):
    # When imported directly (runner.py adds github dir to path)
    from bot_detection import BotDetector
    from context_gatherer import PRContext, PRContextGatherer
    from gh_client import GHClient
    from models import (
        AICommentTriage,
        AICommentVerdict,
        AutoFixState,
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
        StructuralIssue,
        TriageResult,
    )
    from permissions import GitHubPermissionChecker
    from rate_limiter import RateLimiter
    from services import (
        AutoFixProcessor,
        BatchProcessor,
        PRReviewEngine,
        TriageEngine,
    )


@dataclass
class ProgressCallback:
    """Callback for progress updates."""

    phase: str
    progress: int  # 0-100
    message: str
    issue_number: int | None = None
    pr_number: int | None = None


class GitHubOrchestrator:
    """
    Orchestrates all GitHub automation workflows.

    This is a thin coordinator that delegates to specialized service classes:
    - PRReviewEngine: Multi-pass code review
    - TriageEngine: Issue classification
    - AutoFixProcessor: Automatic issue fixing
    - BatchProcessor: Batch issue processing

    Usage:
        orchestrator = GitHubOrchestrator(
            project_dir=Path("/path/to/project"),
            config=config,
        )

        # Review a PR
        result = await orchestrator.review_pr(pr_number=123)

        # Triage issues
        results = await orchestrator.triage_issues(issue_numbers=[1, 2, 3])

        # Auto-fix an issue
        state = await orchestrator.auto_fix_issue(issue_number=456)
    """

    def __init__(
        self,
        project_dir: Path,
        config: GitHubRunnerConfig,
        progress_callback: Callable[[ProgressCallback], None] | None = None,
    ):
        self.project_dir = Path(project_dir)
        self.config = config
        self.progress_callback = progress_callback

        # GitHub directory for storing state
        self.github_dir = self.project_dir / ".auto-claude" / "github"
        self.github_dir.mkdir(parents=True, exist_ok=True)

        # Initialize GH client with timeout protection
        self.gh_client = GHClient(
            project_dir=self.project_dir,
            default_timeout=30.0,
            max_retries=3,
            enable_rate_limiting=True,
            repo=config.repo,
        )

        # Initialize bot detector for preventing infinite loops
        self.bot_detector = BotDetector(
            state_dir=self.github_dir,
            bot_token=config.bot_token,
            review_own_prs=config.review_own_prs,
        )

        # Initialize permission checker for auto-fix authorization
        self.permission_checker = GitHubPermissionChecker(
            gh_client=self.gh_client,
            repo=config.repo,
            allowed_roles=config.auto_fix_allowed_roles,
            allow_external_contributors=config.allow_external_contributors,
        )

        # Initialize rate limiter singleton
        self.rate_limiter = RateLimiter.get_instance()

        # Initialize service layer
        self.pr_review_engine = PRReviewEngine(
            project_dir=self.project_dir,
            github_dir=self.github_dir,
            config=self.config,
            progress_callback=self.progress_callback,
        )

        self.triage_engine = TriageEngine(
            project_dir=self.project_dir,
            github_dir=self.github_dir,
            config=self.config,
            progress_callback=self.progress_callback,
        )

        self.autofix_processor = AutoFixProcessor(
            github_dir=self.github_dir,
            config=self.config,
            permission_checker=self.permission_checker,
            progress_callback=self.progress_callback,
        )

        self.batch_processor = BatchProcessor(
            project_dir=self.project_dir,
            github_dir=self.github_dir,
            config=self.config,
            progress_callback=self.progress_callback,
        )

    def _report_progress(
        self,
        phase: str,
        progress: int,
        message: str,
        issue_number: int | None = None,
        pr_number: int | None = None,
    ) -> None:
        """Report progress to callback if set."""
        if self.progress_callback:
            self.progress_callback(
                ProgressCallback(
                    phase=phase,
                    progress=progress,
                    message=message,
                    issue_number=issue_number,
                    pr_number=pr_number,
                )
            )

    # =========================================================================
    # GitHub API Helpers
    # =========================================================================

    async def _fetch_pr_data(self, pr_number: int) -> dict:
        """Fetch PR data from GitHub API via gh CLI."""
        return await self.gh_client.pr_get(pr_number)

    async def _fetch_pr_diff(self, pr_number: int) -> str:
        """Fetch PR diff from GitHub."""
        return await self.gh_client.pr_diff(pr_number)

    async def _fetch_issue_data(self, issue_number: int) -> dict:
        """Fetch issue data from GitHub API via gh CLI."""
        return await self.gh_client.issue_get(issue_number)

    async def _fetch_open_issues(self, limit: int = 200) -> list[dict]:
        """Fetch all open issues from the repository (up to 200)."""
        return await self.gh_client.issue_list(state="open", limit=limit)

    async def _post_pr_review(
        self,
        pr_number: int,
        body: str,
        event: str = "COMMENT",
    ) -> int:
        """Post a review to a PR."""
        return await self.gh_client.pr_review(
            pr_number=pr_number,
            body=body,
            event=event.lower(),
        )

    async def _post_issue_comment(self, issue_number: int, body: str) -> None:
        """Post a comment to an issue."""
        await self.gh_client.issue_comment(issue_number, body)

    async def _add_issue_labels(self, issue_number: int, labels: list[str]) -> None:
        """Add labels to an issue."""
        await self.gh_client.issue_add_labels(issue_number, labels)

    async def _remove_issue_labels(self, issue_number: int, labels: list[str]) -> None:
        """Remove labels from an issue."""
        await self.gh_client.issue_remove_labels(issue_number, labels)

    async def _post_ai_triage_replies(
        self, pr_number: int, triages: list[AICommentTriage]
    ) -> None:
        """Post replies to AI tool comments based on triage results."""
        for triage in triages:
            if not triage.response_comment:
                continue

            # Skip trivial verdicts
            if triage.verdict == AICommentVerdict.TRIVIAL:
                continue

            try:
                # Post as inline comment reply
                await self.gh_client.pr_comment_reply(
                    pr_number=pr_number,
                    comment_id=triage.comment_id,
                    body=triage.response_comment,
                )
                print(
                    f"[AI TRIAGE] Posted reply to {triage.tool_name} comment {triage.comment_id}",
                    flush=True,
                )
            except Exception as e:
                print(
                    f"[AI TRIAGE] Failed to post reply to comment {triage.comment_id}: {e}",
                    flush=True,
                )

    # =========================================================================
    # PR REVIEW WORKFLOW
    # =========================================================================

    async def review_pr(self, pr_number: int) -> PRReviewResult:
        """
        Perform AI-powered review of a pull request.

        Args:
            pr_number: The PR number to review

        Returns:
            PRReviewResult with findings and overall assessment
        """
        print(
            f"[DEBUG orchestrator] review_pr() called for PR #{pr_number}", flush=True
        )

        self._report_progress(
            "gathering_context",
            10,
            f"Gathering context for PR #{pr_number}...",
            pr_number=pr_number,
        )

        try:
            # Gather PR context
            print("[DEBUG orchestrator] Creating context gatherer...", flush=True)
            gatherer = PRContextGatherer(
                self.project_dir, pr_number, repo=self.config.repo
            )

            print("[DEBUG orchestrator] Gathering PR context...", flush=True)
            pr_context = await gatherer.gather()
            print(
                f"[DEBUG orchestrator] Context gathered: {pr_context.title} "
                f"({len(pr_context.changed_files)} files, {len(pr_context.related_files)} related)",
                flush=True,
            )

            # Bot detection check
            pr_data = {"author": {"login": pr_context.author}}
            should_skip, skip_reason = self.bot_detector.should_skip_pr_review(
                pr_number=pr_number,
                pr_data=pr_data,
                commits=pr_context.commits,
            )

            if should_skip:
                print(
                    f"[BOT DETECTION] Skipping PR #{pr_number}: {skip_reason}",
                    flush=True,
                )
                result = PRReviewResult(
                    pr_number=pr_number,
                    repo=self.config.repo,
                    success=True,
                    findings=[],
                    summary=f"Skipped review: {skip_reason}",
                    overall_status="comment",
                )
                await result.save(self.github_dir)
                return result

            self._report_progress(
                "analyzing", 30, "Running multi-pass review...", pr_number=pr_number
            )

            # Delegate to PR Review Engine
            print("[DEBUG orchestrator] Running multi-pass review...", flush=True)
            (
                findings,
                structural_issues,
                ai_triages,
                quick_scan,
            ) = await self.pr_review_engine.run_multi_pass_review(pr_context)
            print(
                f"[DEBUG orchestrator] Multi-pass review complete: "
                f"{len(findings)} findings, {len(structural_issues)} structural, {len(ai_triages)} AI triages",
                flush=True,
            )

            self._report_progress(
                "generating",
                70,
                "Generating verdict and summary...",
                pr_number=pr_number,
            )

            # Generate verdict
            verdict, verdict_reasoning, blockers = self._generate_verdict(
                findings, structural_issues, ai_triages
            )
            print(
                f"[DEBUG orchestrator] Verdict: {verdict.value} - {verdict_reasoning}",
                flush=True,
            )

            # Calculate risk assessment
            risk_assessment = self._calculate_risk_assessment(
                pr_context, findings, structural_issues
            )

            # Map verdict to overall_status for backward compatibility
            if verdict == MergeVerdict.BLOCKED:
                overall_status = "request_changes"
            elif verdict == MergeVerdict.NEEDS_REVISION:
                overall_status = "request_changes"
            elif verdict == MergeVerdict.MERGE_WITH_CHANGES:
                overall_status = "comment"
            else:
                overall_status = "approve"

            # Generate summary
            summary = self._generate_enhanced_summary(
                verdict=verdict,
                verdict_reasoning=verdict_reasoning,
                blockers=blockers,
                findings=findings,
                structural_issues=structural_issues,
                ai_triages=ai_triages,
                risk_assessment=risk_assessment,
            )

            # Get HEAD SHA for follow-up review tracking
            head_sha = self.bot_detector.get_last_commit_sha(pr_context.commits)

            # Create result
            result = PRReviewResult(
                pr_number=pr_number,
                repo=self.config.repo,
                success=True,
                findings=findings,
                summary=summary,
                overall_status=overall_status,
                verdict=verdict,
                verdict_reasoning=verdict_reasoning,
                blockers=blockers,
                risk_assessment=risk_assessment,
                structural_issues=structural_issues,
                ai_comment_triages=ai_triages,
                quick_scan_summary=quick_scan,
                # Track the commit SHA for follow-up reviews
                reviewed_commit_sha=head_sha,
            )

            # Post review if configured
            if self.config.auto_post_reviews:
                self._report_progress(
                    "posting", 90, "Posting review to GitHub...", pr_number=pr_number
                )
                review_id = await self._post_pr_review(
                    pr_number=pr_number,
                    body=self._format_review_body(result),
                    event=overall_status.upper(),
                )
                result.review_id = review_id

                # Post AI triage replies
                if ai_triages:
                    self._report_progress(
                        "posting",
                        95,
                        "Posting AI triage replies...",
                        pr_number=pr_number,
                    )
                    await self._post_ai_triage_replies(pr_number, ai_triages)

            # Save result
            await result.save(self.github_dir)

            # Mark as reviewed (head_sha already fetched above)
            if head_sha:
                self.bot_detector.mark_reviewed(pr_number, head_sha)

            self._report_progress(
                "complete", 100, "Review complete!", pr_number=pr_number
            )
            return result

        except Exception as e:
            import traceback

            # Log full exception details for debugging
            error_details = f"{type(e).__name__}: {e}"
            full_traceback = traceback.format_exc()
            print(
                f"[ERROR orchestrator] PR review failed for #{pr_number}: {error_details}",
                flush=True,
            )
            print(f"[ERROR orchestrator] Full traceback:\n{full_traceback}", flush=True)

            result = PRReviewResult(
                pr_number=pr_number,
                repo=self.config.repo,
                success=False,
                error=f"{error_details}\n\nTraceback:\n{full_traceback}",
            )
            await result.save(self.github_dir)
            return result

    async def followup_review_pr(self, pr_number: int) -> PRReviewResult:
        """
        Perform a focused follow-up review of a PR.

        Only reviews:
        - Changes since last review (new commits)
        - Whether previous findings are resolved
        - New comments from contributors and AI bots

        Args:
            pr_number: The PR number to review

        Returns:
            PRReviewResult with follow-up analysis

        Raises:
            ValueError: If no previous review exists for this PR
        """
        print(
            f"[DEBUG orchestrator] followup_review_pr() called for PR #{pr_number}",
            flush=True,
        )

        # Load previous review
        previous_review = PRReviewResult.load(self.github_dir, pr_number)

        if not previous_review:
            raise ValueError(
                f"No previous review found for PR #{pr_number}. Run initial review first."
            )

        if not previous_review.reviewed_commit_sha:
            raise ValueError(
                f"Previous review for PR #{pr_number} doesn't have commit SHA. "
                "Re-run initial review with the updated system."
            )

        self._report_progress(
            "gathering_context",
            10,
            f"Gathering follow-up context for PR #{pr_number}...",
            pr_number=pr_number,
        )

        try:
            # Import here to avoid circular imports at module level
            try:
                from .context_gatherer import FollowupContextGatherer
                from .services.followup_reviewer import FollowupReviewer
            except (ImportError, ValueError, SystemError):
                from context_gatherer import FollowupContextGatherer
                from services.followup_reviewer import FollowupReviewer

            # Gather follow-up context
            gatherer = FollowupContextGatherer(
                self.project_dir,
                pr_number,
                previous_review,
            )
            followup_context = await gatherer.gather()

            # Check if there are new commits
            if not followup_context.commits_since_review:
                print(
                    f"[Followup] No new commits since last review at {previous_review.reviewed_commit_sha[:8]}",
                    flush=True,
                )
                # Return a result indicating no changes
                result = PRReviewResult(
                    pr_number=pr_number,
                    repo=self.config.repo,
                    success=True,
                    findings=previous_review.findings,
                    summary="No new commits since last review. Previous findings still apply.",
                    overall_status=previous_review.overall_status,
                    verdict=previous_review.verdict,
                    verdict_reasoning="No changes since last review.",
                    reviewed_commit_sha=followup_context.current_commit_sha
                    or previous_review.reviewed_commit_sha,
                    is_followup_review=True,
                    unresolved_findings=[f.id for f in previous_review.findings],
                )
                await result.save(self.github_dir)
                return result

            self._report_progress(
                "analyzing",
                30,
                f"Analyzing {len(followup_context.commits_since_review)} new commits...",
                pr_number=pr_number,
            )

            # Run follow-up review
            reviewer = FollowupReviewer(
                project_dir=self.project_dir,
                github_dir=self.github_dir,
                config=self.config,
                progress_callback=lambda p: self._report_progress(
                    p.get("phase", "analyzing"),
                    p.get("progress", 50),
                    p.get("message", "Reviewing..."),
                    pr_number=pr_number,
                ),
            )

            result = await reviewer.review_followup(followup_context)

            # Save result
            await result.save(self.github_dir)

            # Mark as reviewed with new commit SHA
            if result.reviewed_commit_sha:
                self.bot_detector.mark_reviewed(pr_number, result.reviewed_commit_sha)

            self._report_progress(
                "complete", 100, "Follow-up review complete!", pr_number=pr_number
            )

            return result

        except Exception as e:
            result = PRReviewResult(
                pr_number=pr_number,
                repo=self.config.repo,
                success=False,
                error=str(e),
                is_followup_review=True,
            )
            await result.save(self.github_dir)
            return result

    def _generate_verdict(
        self,
        findings: list[PRReviewFinding],
        structural_issues: list[StructuralIssue],
        ai_triages: list[AICommentTriage],
    ) -> tuple[MergeVerdict, str, list[str]]:
        """
        Generate merge verdict based on all findings.

        NEW: Strengthened to block on verification failures and redundancy issues.
        """
        blockers = []

        # Count by severity
        critical = [f for f in findings if f.severity == ReviewSeverity.CRITICAL]
        high = [f for f in findings if f.severity == ReviewSeverity.HIGH]

        # NEW: Verification failures are ALWAYS blockers (even if not critical severity)
        verification_failures = [
            f for f in findings if f.category == ReviewCategory.VERIFICATION_FAILED
        ]

        # NEW: High severity redundancy issues are blockers
        redundancy_issues = [
            f
            for f in findings
            if f.category == ReviewCategory.REDUNDANCY
            and f.severity in (ReviewSeverity.CRITICAL, ReviewSeverity.HIGH)
        ]

        # Security findings are always blockers
        security_critical = [
            f for f in critical if f.category == ReviewCategory.SECURITY
        ]

        # Structural blockers
        structural_blockers = [
            s
            for s in structural_issues
            if s.severity in (ReviewSeverity.CRITICAL, ReviewSeverity.HIGH)
        ]

        # AI comments marked critical
        ai_critical = [t for t in ai_triages if t.verdict == AICommentVerdict.CRITICAL]

        # Build blockers list with NEW categories first
        # NEW: Verification failures block merging
        for f in verification_failures:
            note = f" - {f.verification_note}" if f.verification_note else ""
            blockers.append(f"Verification Failed: {f.title} ({f.file}:{f.line}){note}")

        # NEW: Redundancy issues block merging
        for f in redundancy_issues:
            redundant_ref = (
                f" (duplicates {f.redundant_with})" if f.redundant_with else ""
            )
            blockers.append(f"Redundancy: {f.title} ({f.file}:{f.line}){redundant_ref}")

        # Existing blocker categories
        for f in security_critical:
            blockers.append(f"Security: {f.title} ({f.file}:{f.line})")
        for f in critical:
            if (
                f not in security_critical
                and f not in verification_failures
                and f not in redundancy_issues
            ):
                blockers.append(f"Critical: {f.title} ({f.file}:{f.line})")
        for s in structural_blockers:
            blockers.append(f"Structure: {s.title}")
        for t in ai_critical:
            summary = (
                t.original_comment[:50] + "..."
                if len(t.original_comment) > 50
                else t.original_comment
            )
            blockers.append(f"{t.tool_name}: {summary}")

        # Determine verdict with NEW verification and redundancy checks
        if blockers:
            # NEW: Prioritize verification failures
            if verification_failures:
                verdict = MergeVerdict.BLOCKED
                reasoning = (
                    f"Blocked: Cannot verify {len(verification_failures)} claim(s) in PR. "
                    "Evidence required before merge."
                )
            elif security_critical:
                verdict = MergeVerdict.BLOCKED
                reasoning = (
                    f"Blocked by {len(security_critical)} security vulnerabilities"
                )
            elif redundancy_issues:
                verdict = MergeVerdict.BLOCKED
                reasoning = (
                    f"Blocked: {len(redundancy_issues)} redundant implementation(s) detected. "
                    "Remove duplicates before merge."
                )
            elif len(critical) > 0:
                verdict = MergeVerdict.BLOCKED
                reasoning = f"Blocked by {len(critical)} critical issues"
            else:
                verdict = MergeVerdict.NEEDS_REVISION
                reasoning = f"{len(blockers)} issues must be addressed"
        elif high:
            verdict = MergeVerdict.MERGE_WITH_CHANGES
            reasoning = f"{len(high)} high-priority issues to address"
        else:
            verdict = MergeVerdict.READY_TO_MERGE
            reasoning = "No blocking issues found"

        return verdict, reasoning, blockers

    def _calculate_risk_assessment(
        self,
        context: PRContext,
        findings: list[PRReviewFinding],
        structural_issues: list[StructuralIssue],
    ) -> dict:
        """Calculate risk assessment for the PR."""
        total_changes = context.total_additions + context.total_deletions

        # Complexity
        if total_changes > 500:
            complexity = "high"
        elif total_changes > 200:
            complexity = "medium"
        else:
            complexity = "low"

        # Security impact
        security_findings = [
            f for f in findings if f.category == ReviewCategory.SECURITY
        ]
        if any(f.severity == ReviewSeverity.CRITICAL for f in security_findings):
            security_impact = "critical"
        elif any(f.severity == ReviewSeverity.HIGH for f in security_findings):
            security_impact = "medium"
        elif security_findings:
            security_impact = "low"
        else:
            security_impact = "none"

        # Scope coherence
        scope_issues = [
            s
            for s in structural_issues
            if s.issue_type in ("feature_creep", "scope_creep")
        ]
        if any(
            s.severity in (ReviewSeverity.CRITICAL, ReviewSeverity.HIGH)
            for s in scope_issues
        ):
            scope_coherence = "poor"
        elif scope_issues:
            scope_coherence = "mixed"
        else:
            scope_coherence = "good"

        return {
            "complexity": complexity,
            "security_impact": security_impact,
            "scope_coherence": scope_coherence,
        }

    def _generate_enhanced_summary(
        self,
        verdict: MergeVerdict,
        verdict_reasoning: str,
        blockers: list[str],
        findings: list[PRReviewFinding],
        structural_issues: list[StructuralIssue],
        ai_triages: list[AICommentTriage],
        risk_assessment: dict,
    ) -> str:
        """Generate enhanced summary with verdict, risk, and actionable next steps."""
        verdict_emoji = {
            MergeVerdict.READY_TO_MERGE: "✅",
            MergeVerdict.MERGE_WITH_CHANGES: "🟡",
            MergeVerdict.NEEDS_REVISION: "🟠",
            MergeVerdict.BLOCKED: "🔴",
        }

        lines = [
            f"### Merge Verdict: {verdict_emoji.get(verdict, '⚪')} {verdict.value.upper().replace('_', ' ')}",
            verdict_reasoning,
            "",
            "### Risk Assessment",
            "| Factor | Level | Notes |",
            "|--------|-------|-------|",
            f"| Complexity | {risk_assessment['complexity'].capitalize()} | Based on lines changed |",
            f"| Security Impact | {risk_assessment['security_impact'].capitalize()} | Based on security findings |",
            f"| Scope Coherence | {risk_assessment['scope_coherence'].capitalize()} | Based on structural review |",
            "",
        ]

        # Blockers
        if blockers:
            lines.append("### 🚨 Blocking Issues (Must Fix)")
            for blocker in blockers:
                lines.append(f"- {blocker}")
            lines.append("")

        # Findings summary
        if findings:
            by_severity = {}
            for f in findings:
                severity = f.severity.value
                if severity not in by_severity:
                    by_severity[severity] = []
                by_severity[severity].append(f)

            lines.append("### Findings Summary")
            for severity in ["critical", "high", "medium", "low"]:
                if severity in by_severity:
                    count = len(by_severity[severity])
                    lines.append(f"- **{severity.capitalize()}**: {count} issue(s)")
            lines.append("")

        # Structural issues
        if structural_issues:
            lines.append("### 🏗️ Structural Issues")
            for issue in structural_issues[:5]:
                lines.append(f"- **{issue.title}**: {issue.description}")
            if len(structural_issues) > 5:
                lines.append(f"- ... and {len(structural_issues) - 5} more")
            lines.append("")

        # AI triages summary
        if ai_triages:
            critical_ai = [
                t for t in ai_triages if t.verdict == AICommentVerdict.CRITICAL
            ]
            important_ai = [
                t for t in ai_triages if t.verdict == AICommentVerdict.IMPORTANT
            ]
            if critical_ai or important_ai:
                lines.append("### 🤖 AI Tool Comments Review")
                if critical_ai:
                    lines.append(f"- **Critical**: {len(critical_ai)} validated issues")
                if important_ai:
                    lines.append(
                        f"- **Important**: {len(important_ai)} recommended fixes"
                    )
                lines.append("")

        lines.append("---")
        lines.append("_Generated by Auto Claude PR Review_")

        return "\n".join(lines)

    def _format_review_body(self, result: PRReviewResult) -> str:
        """Format the review body for posting to GitHub."""
        return result.summary

    # =========================================================================
    # ISSUE TRIAGE WORKFLOW
    # =========================================================================

    async def triage_issues(
        self,
        issue_numbers: list[int] | None = None,
        apply_labels: bool = False,
    ) -> list[TriageResult]:
        """
        Triage issues to detect duplicates, spam, and feature creep.

        Args:
            issue_numbers: Specific issues to triage, or None for all open issues
            apply_labels: Whether to apply suggested labels to GitHub

        Returns:
            List of TriageResult for each issue
        """
        self._report_progress("fetching", 10, "Fetching issues...")

        # Fetch issues
        if issue_numbers:
            issues = []
            for num in issue_numbers:
                issues.append(await self._fetch_issue_data(num))
        else:
            issues = await self._fetch_open_issues()

        if not issues:
            return []

        results = []
        total = len(issues)

        for i, issue in enumerate(issues):
            progress = 20 + int(60 * (i / total))
            self._report_progress(
                "analyzing",
                progress,
                f"Analyzing issue #{issue['number']}...",
                issue_number=issue["number"],
            )

            # Delegate to triage engine
            result = await self.triage_engine.triage_single_issue(issue, issues)
            results.append(result)

            # Apply labels if requested
            if apply_labels and (result.labels_to_add or result.labels_to_remove):
                try:
                    await self._add_issue_labels(issue["number"], result.labels_to_add)
                    await self._remove_issue_labels(
                        issue["number"], result.labels_to_remove
                    )
                except Exception as e:
                    print(f"Failed to apply labels to #{issue['number']}: {e}")

            # Save result
            await result.save(self.github_dir)

        self._report_progress("complete", 100, f"Triaged {len(results)} issues")
        return results

    # =========================================================================
    # AUTO-FIX WORKFLOW
    # =========================================================================

    async def auto_fix_issue(
        self,
        issue_number: int,
        trigger_label: str | None = None,
    ) -> AutoFixState:
        """
        Automatically fix an issue by creating a spec and running the build pipeline.

        Args:
            issue_number: The issue number to fix
            trigger_label: Label that triggered this auto-fix (for permission checks)

        Returns:
            AutoFixState tracking the fix progress

        Raises:
            PermissionError: If the user who added the trigger label isn't authorized
        """
        # Fetch issue data
        issue = await self._fetch_issue_data(issue_number)

        # Delegate to autofix processor
        return await self.autofix_processor.process_issue(
            issue_number=issue_number,
            issue=issue,
            trigger_label=trigger_label,
        )

    async def get_auto_fix_queue(self) -> list[AutoFixState]:
        """Get all issues in the auto-fix queue."""
        return await self.autofix_processor.get_queue()

    async def check_auto_fix_labels(
        self, verify_permissions: bool = True
    ) -> list[dict]:
        """
        Check for issues with auto-fix labels and return their details.

        Args:
            verify_permissions: Whether to verify who added the trigger label

        Returns:
            List of dicts with issue_number, trigger_label, and authorized status
        """
        issues = await self._fetch_open_issues()
        return await self.autofix_processor.check_labeled_issues(
            all_issues=issues,
            verify_permissions=verify_permissions,
        )

    async def check_new_issues(self) -> list[dict]:
        """
        Check for NEW issues that aren't already in the auto-fix queue.

        Returns:
            List of dicts with just the issue number: [{"number": 123}, ...]
        """
        # Get all open issues
        issues = await self._fetch_open_issues()

        # Get current queue to filter out issues already being processed
        queue = await self.get_auto_fix_queue()
        queued_issue_numbers = {state.issue_number for state in queue}

        # Return just the issue numbers (not full issue objects to avoid huge JSON)
        new_issues = [
            {"number": issue["number"]}
            for issue in issues
            if issue["number"] not in queued_issue_numbers
        ]

        return new_issues

    # =========================================================================
    # BATCH AUTO-FIX WORKFLOW
    # =========================================================================

    async def batch_and_fix_issues(
        self,
        issue_numbers: list[int] | None = None,
    ) -> list:
        """
        Batch similar issues and create combined specs for each batch.

        Args:
            issue_numbers: Specific issues to batch, or None for all open issues

        Returns:
            List of IssueBatch objects that were created
        """
        # Fetch issues
        if issue_numbers:
            issues = []
            for num in issue_numbers:
                issue = await self._fetch_issue_data(num)
                issues.append(issue)
        else:
            issues = await self._fetch_open_issues()

        # Delegate to batch processor
        return await self.batch_processor.batch_and_fix_issues(
            issues=issues,
            fetch_issue_callback=self._fetch_issue_data,
        )

    async def analyze_issues_preview(
        self,
        issue_numbers: list[int] | None = None,
        max_issues: int = 200,
    ) -> dict:
        """
        Analyze issues and return a PREVIEW of proposed batches without executing.

        Args:
            issue_numbers: Specific issues to analyze, or None for all open issues
            max_issues: Maximum number of issues to analyze (default 200)

        Returns:
            Dict with proposed batches and statistics for user review
        """
        # Fetch issues
        if issue_numbers:
            issues = []
            for num in issue_numbers[:max_issues]:
                issue = await self._fetch_issue_data(num)
                issues.append(issue)
        else:
            issues = await self._fetch_open_issues(limit=max_issues)

        # Delegate to batch processor
        return await self.batch_processor.analyze_issues_preview(
            issues=issues,
            max_issues=max_issues,
        )

    async def approve_and_execute_batches(
        self,
        approved_batches: list[dict],
    ) -> list:
        """
        Execute approved batches after user review.

        Args:
            approved_batches: List of batch dicts from analyze_issues_preview

        Returns:
            List of created IssueBatch objects
        """
        return await self.batch_processor.approve_and_execute_batches(
            approved_batches=approved_batches,
        )

    async def get_batch_status(self) -> dict:
        """Get status of all batches."""
        return await self.batch_processor.get_batch_status()

    async def process_pending_batches(self) -> int:
        """Process all pending batches."""
        return await self.batch_processor.process_pending_batches()
