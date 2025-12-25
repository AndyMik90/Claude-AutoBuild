"""
Orchestrating PR Reviewer
==========================

Strategic PR review system using a single Opus 4.5 orchestrating agent
that makes human-like decisions about where to focus review effort.

Replaces the fixed multi-pass system with adaptive, risk-based review.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

try:
    from ...core.client import create_client
    from ..context_gatherer import PRContext
    from ..models import (
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
    )
    from .review_tools import (
        check_coverage,
        get_file_content,
        run_tests,
        spawn_deep_analysis,
        spawn_quality_review,
        spawn_security_review,
        verify_path_exists,
    )
except (ImportError, ValueError, SystemError):
    from context_gatherer import PRContext
    from core.client import create_client
    from models import (
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
    )
    from services.review_tools import (
        check_coverage,
        get_file_content,
        run_tests,
        spawn_deep_analysis,
        spawn_quality_review,
        spawn_security_review,
        verify_path_exists,
    )

logger = logging.getLogger(__name__)


# Map AI-generated category names to valid ReviewCategory enum values
# The AI sometimes generates categories that aren't in our enum
_CATEGORY_MAPPING = {
    # Direct matches (already valid)
    "security": ReviewCategory.SECURITY,
    "quality": ReviewCategory.QUALITY,
    "style": ReviewCategory.STYLE,
    "test": ReviewCategory.TEST,
    "docs": ReviewCategory.DOCS,
    "pattern": ReviewCategory.PATTERN,
    "performance": ReviewCategory.PERFORMANCE,
    "verification_failed": ReviewCategory.VERIFICATION_FAILED,
    "redundancy": ReviewCategory.REDUNDANCY,
    # AI-generated alternatives that need mapping
    "correctness": ReviewCategory.QUALITY,  # Logic/code correctness → quality
    "consistency": ReviewCategory.PATTERN,  # Code consistency → pattern adherence
    "testing": ReviewCategory.TEST,  # Testing → test
    "documentation": ReviewCategory.DOCS,  # Documentation → docs
    "bug": ReviewCategory.QUALITY,  # Bug → quality
    "logic": ReviewCategory.QUALITY,  # Logic error → quality
    "error_handling": ReviewCategory.QUALITY,  # Error handling → quality
    "maintainability": ReviewCategory.QUALITY,  # Maintainability → quality
    "readability": ReviewCategory.STYLE,  # Readability → style
    "best_practices": ReviewCategory.PATTERN,  # Best practices → pattern
    "best-practices": ReviewCategory.PATTERN,  # With hyphen
    "architecture": ReviewCategory.PATTERN,  # Architecture → pattern
    "complexity": ReviewCategory.QUALITY,  # Complexity → quality
    "dead_code": ReviewCategory.REDUNDANCY,  # Dead code → redundancy
    "unused": ReviewCategory.REDUNDANCY,  # Unused → redundancy
}


def _map_category(category_str: str) -> ReviewCategory:
    """
    Map an AI-generated category string to a valid ReviewCategory enum.

    Falls back to QUALITY if the category is unknown.
    """
    normalized = category_str.lower().strip().replace("-", "_")
    return _CATEGORY_MAPPING.get(normalized, ReviewCategory.QUALITY)


class OrchestratorReviewer:
    """
    Strategic PR reviewer using Opus 4.5 for orchestration.

    Makes human-like decisions about:
    - Which files are high-risk and need deep review
    - When to spawn focused subagents vs quick scan
    - Whether to run tests/coverage checks
    - Final verdict based on aggregated findings
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

        # Token usage tracking
        self.total_tokens = 0
        self.MAX_TOTAL_BUDGET = 150_000

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

    async def review(self, context: PRContext) -> PRReviewResult:
        """
        Main review entry point.

        Args:
            context: Full PR context with all files and patches

        Returns:
            PRReviewResult with findings and verdict
        """
        logger.info(
            f"[Orchestrator] Starting strategic review for PR #{context.pr_number}"
        )

        try:
            self._report_progress(
                "orchestrating",
                20,
                "Orchestrator analyzing PR structure...",
                pr_number=context.pr_number,
            )

            # Build orchestrator prompt with tool definitions
            prompt = self._build_orchestrator_prompt(context)

            # Create Opus 4.5 client with extended thinking
            project_root = (
                self.project_dir.parent.parent
                if self.project_dir.name == "backend"
                else self.project_dir
            )

            client = create_client(
                project_dir=project_root,
                spec_dir=self.github_dir,
                model="claude-opus-4-5-20251101",  # Opus for strategic thinking
                agent_type="pr_reviewer",  # Read-only - no bash, no edits
                max_thinking_tokens=10000,  # High budget for strategy
            )

            self._report_progress(
                "orchestrating",
                30,
                "Orchestrator making strategic decisions...",
                pr_number=context.pr_number,
            )

            # Run orchestrator session with tool calling
            all_findings = []
            test_result = None
            result_text = ""
            tool_calls_made = []

            logger.info(f"[Orchestrator] Sending prompt (length: {len(prompt)} chars)")
            logger.debug(f"[Orchestrator] Prompt preview: {prompt[:500]}...")

            async with client:
                await client.query(prompt)

                async for msg in client.receive_response():
                    msg_type = type(msg).__name__
                    logger.debug(f"[Orchestrator] Received message type: {msg_type}")

                    # Handle tool calls from orchestrator
                    if msg_type == "ToolUseBlock" or (
                        hasattr(msg, "type") and msg.type == "tool_use"
                    ):
                        tool_name = (
                            msg.name
                            if hasattr(msg, "name")
                            else msg.tool_use.name
                            if hasattr(msg, "tool_use")
                            else "unknown"
                        )
                        tool_calls_made.append(tool_name)
                        logger.info(f"[Orchestrator] Tool call detected: {tool_name}")

                        tool_result = await self._handle_tool_call(msg, context)
                        # Tools already executed, agent will receive results

                        logger.debug(
                            f"[Orchestrator] Tool result: {str(tool_result)[:200]}..."
                        )

                        # Track findings from subagents
                        if isinstance(tool_result, dict):
                            if "findings" in tool_result:
                                findings_count = len(tool_result["findings"])
                                logger.info(
                                    f"[Orchestrator] Tool returned {findings_count} findings"
                                )
                                all_findings.extend(tool_result["findings"])
                            if "test_result" in tool_result:
                                test_result = tool_result["test_result"]
                                logger.info(
                                    f"[Orchestrator] Tool returned test result: {test_result.get('passed', 'unknown')}"
                                )

                    # Track token usage from response
                    if hasattr(msg, "usage"):
                        usage = msg.usage
                        tokens_used = getattr(usage, "input_tokens", 0) + getattr(
                            usage, "output_tokens", 0
                        )
                        self.total_tokens += tokens_used
                        logger.debug(
                            f"[Orchestrator] Token usage: +{tokens_used} (total: {self.total_tokens})"
                        )

                    # Collect final orchestrator output
                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            if hasattr(block, "text"):
                                result_text += block.text
                                logger.debug(
                                    f"[Orchestrator] Received text block (length: {len(block.text)})"
                                )

            logger.info(
                f"[Orchestrator] Session complete. Tool calls made: {tool_calls_made}"
            )
            logger.info(
                f"[Orchestrator] Final text response length: {len(result_text)}"
            )
            logger.debug(f"[Orchestrator] Final text preview: {result_text[:500]}...")

            # CRITICAL DEBUG: Print to ensure visibility
            print(
                f"[Orchestrator] Session complete. Tool calls: {tool_calls_made}",
                flush=True,
            )
            print(
                f"[Orchestrator] Final text length: {len(result_text)} chars",
                flush=True,
            )
            print("[Orchestrator] ===== FULL OUTPUT START =====", flush=True)
            print(result_text, flush=True)
            print("[Orchestrator] ===== FULL OUTPUT END =====", flush=True)

            self._report_progress(
                "finalizing",
                80,
                "Generating verdict...",
                pr_number=context.pr_number,
            )

            # Parse orchestrator's final output
            orchestrator_findings = self._parse_orchestrator_output(result_text)
            all_findings.extend(orchestrator_findings)

            # Deduplicate findings
            unique_findings = self._deduplicate_findings(all_findings)

            logger.info(
                f"[Orchestrator] Review complete: {len(unique_findings)} findings"
            )

            # Generate verdict
            verdict, verdict_reasoning, blockers = self._generate_verdict(
                unique_findings, test_result
            )

            # Generate summary
            summary = self._generate_summary(
                verdict=verdict,
                verdict_reasoning=verdict_reasoning,
                blockers=blockers,
                findings=unique_findings,
                test_result=test_result,
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
            )

            print(
                f"[Orchestrator] Returning PRReviewResult with {len(result.findings)} findings",
                flush=True,
            )
            print(
                f"[Orchestrator] Verdict: {result.verdict.value if result.verdict else 'None'}",
                flush=True,
            )

            self._report_progress(
                "complete", 100, "Review complete!", pr_number=context.pr_number
            )

            return result

        except Exception as e:
            logger.error(f"[Orchestrator] Review failed: {e}", exc_info=True)
            result = PRReviewResult(
                pr_number=context.pr_number,
                repo=self.config.repo,
                success=False,
                error=str(e),
            )
            return result

    async def _handle_tool_call(self, tool_msg, context: PRContext) -> dict[str, Any]:
        """
        Handle tool calls from orchestrator.

        The orchestrator can call tools to spawn subagents, run tests, etc.
        """
        # Extract tool name and arguments based on message type
        if hasattr(tool_msg, "name"):
            tool_name = tool_msg.name
            tool_args = tool_msg.input if hasattr(tool_msg, "input") else {}
        elif hasattr(tool_msg, "tool_use"):
            tool_name = tool_msg.tool_use.name
            tool_args = tool_msg.tool_use.input
        else:
            logger.warning("[Orchestrator] Unknown tool message format")
            return {}

        logger.info(f"[Orchestrator] Tool call: {tool_name}")

        # Check token budget
        if self.total_tokens > self.MAX_TOTAL_BUDGET:
            logger.warning("[Orchestrator] Token budget exceeded, skipping tool")
            return {"error": "Token budget exceeded"}

        try:
            # Dispatch to appropriate tool
            if tool_name == "spawn_security_review":
                findings = await spawn_security_review(
                    files=tool_args.get("files", []),
                    focus_areas=tool_args.get("focus_areas", []),
                    pr_context=context,
                    project_dir=self.project_dir,
                    github_dir=self.github_dir,
                )
                return {"findings": [f.__dict__ for f in findings]}

            elif tool_name == "spawn_quality_review":
                findings = await spawn_quality_review(
                    files=tool_args.get("files", []),
                    focus_areas=tool_args.get("focus_areas", []),
                    pr_context=context,
                    project_dir=self.project_dir,
                    github_dir=self.github_dir,
                )
                return {"findings": [f.__dict__ for f in findings]}

            elif tool_name == "spawn_deep_analysis":
                findings = await spawn_deep_analysis(
                    files=tool_args.get("files", []),
                    focus_question=tool_args.get("focus_question", ""),
                    pr_context=context,
                    project_dir=self.project_dir,
                    github_dir=self.github_dir,
                )
                return {"findings": [f.__dict__ for f in findings]}

            elif tool_name == "run_tests":
                test_result = await run_tests(
                    project_dir=self.project_dir,
                    test_paths=tool_args.get("test_paths"),
                )
                return {"test_result": test_result.__dict__}

            elif tool_name == "check_coverage":
                coverage = await check_coverage(
                    project_dir=self.project_dir,
                    changed_files=[f.path for f in context.changed_files],
                )
                return (
                    {"coverage": coverage.__dict__} if coverage else {"coverage": None}
                )

            elif tool_name == "verify_path_exists":
                path_result = await verify_path_exists(
                    project_dir=self.project_dir,
                    path=tool_args.get("path", ""),
                )
                return {"path_check": path_result.__dict__}

            elif tool_name == "get_file_content":
                content = await get_file_content(
                    project_dir=self.project_dir,
                    file_path=tool_args.get("file_path", ""),
                )
                return {"content": content}

            else:
                logger.warning(f"[Orchestrator] Unknown tool: {tool_name}")
                return {"error": f"Unknown tool: {tool_name}"}

        except Exception as e:
            logger.error(f"[Orchestrator] Tool {tool_name} failed: {e}")
            return {"error": str(e)}

    def _build_orchestrator_prompt(self, context: PRContext) -> str:
        """Build full prompt for orchestrator with PR context and tool definitions."""
        # Load orchestrator prompt
        prompt_file = (
            Path(__file__).parent.parent.parent.parent
            / "prompts"
            / "github"
            / "pr_orchestrator.md"
        )

        if prompt_file.exists():
            base_prompt = prompt_file.read_text()
        else:
            logger.warning("Orchestrator prompt not found!")
            base_prompt = "You are a PR reviewer. Review the provided PR."

        # Build PR context
        files_list = []
        for file in context.changed_files:  # Show ALL files
            files_list.append(
                f"- `{file.path}` (+{file.additions}/-{file.deletions}) - {file.status}"
            )

        # Build composite diff from patches (use individual file patches when diff_truncated)
        patches = []
        files_with_patches = 0
        MAX_DIFF_CHARS = 200_000  # Increase limit to 200K chars for large PRs

        for file in context.changed_files:  # Process ALL files, not just first 50
            if file.patch:
                patches.append(f"\n### File: {file.path}\n{file.patch}")
                files_with_patches += 1

        diff_content = "\n".join(patches)

        # Check if diff needs truncation
        if len(diff_content) > MAX_DIFF_CHARS:
            logger.warning(
                f"[Orchestrator] Diff truncated from {len(diff_content)} to {MAX_DIFF_CHARS} chars"
            )
            diff_content = (
                diff_content[:MAX_DIFF_CHARS] + "\n\n... (diff truncated due to size)"
            )

        logger.info(
            f"[Orchestrator] Built context: {len(context.changed_files)} files total, {files_with_patches} with patches, {len(diff_content)} chars diff"
        )

        # Add truncation warning if needed
        truncation_note = ""
        if len(diff_content) >= MAX_DIFF_CHARS or context.diff_truncated:
            truncation_note = f"""

**⚠️ IMPORTANT:** This PR is very large. The diff shown below may be truncated.
- Files with patches: {files_with_patches}/{len(context.changed_files)}
- Use `get_file_content(file_path)` tool to fetch full content of specific files you want to review in depth.
"""

        pr_context = f"""
---

## PR Context for Review

**PR Number:** {context.pr_number}
**Title:** {context.title}
**Author:** {context.author}
**Base:** {context.base_branch} ← **Head:** {context.head_branch}
**Files Changed:** {len(context.changed_files)} files
**Total Changes:** +{context.total_additions}/-{context.total_deletions} lines
{truncation_note}

### Description
{context.description}

### All Changed Files
{chr(10).join(files_list)}

### Code Changes ({files_with_patches} files with patches)
```diff
{diff_content}
```

---

Now perform your strategic review and use the available tools to spawn subagents, run tests, etc. as needed.
"""

        return base_prompt + pr_context

    def _parse_orchestrator_output(self, output: str) -> list[PRReviewFinding]:
        """Parse findings from orchestrator's final output."""
        findings = []

        logger.debug(f"[Orchestrator] Parsing output (length: {len(output)})")
        print(
            f"[Orchestrator] PARSING OUTPUT - Length: {len(output)} chars", flush=True
        )

        try:
            # Strip markdown code blocks if present
            # AI often wraps JSON in ```json ... ```
            import re

            # Find JSON in code blocks first
            code_block_pattern = r"```(?:json)?\s*(\{[\s\S]*?\})\s*```"
            code_block_match = re.search(code_block_pattern, output)
            if code_block_match:
                # Extract JSON from inside code block
                json_candidate = code_block_match.group(1)
                logger.debug(
                    f"[Orchestrator] Found JSON in code block (length: {len(json_candidate)})"
                )
                try:
                    response_data = json.loads(json_candidate)
                    findings_data = response_data.get("findings", [])
                    logger.info(
                        f"[Orchestrator] Parsed {len(findings_data)} findings from code block"
                    )
                    print(
                        f"[Orchestrator] Parsed JSON from code block - Verdict: {response_data.get('verdict', 'unknown')}",
                        flush=True,
                    )
                    return self._extract_findings_from_data(findings_data)
                except json.JSONDecodeError:
                    logger.debug(
                        "[Orchestrator] Code block JSON parse failed, trying raw extraction"
                    )

            # Look for JSON object in output (orchestrator outputs full object, not just array)
            start = output.find("{")

            # Find matching closing brace by counting braces
            if start != -1:
                brace_count = 0
                end = -1
                for i in range(start, len(output)):
                    if output[i] == "{":
                        brace_count += 1
                    elif output[i] == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            end = i
                            break

                logger.debug(
                    f"[Orchestrator] JSON object positions: start={start}, end={end}"
                )

                if end != -1:
                    json_str = output[start : end + 1]
                    logger.debug(
                        f"[Orchestrator] Extracted JSON string (length: {len(json_str)})"
                    )
                    logger.debug(f"[Orchestrator] JSON preview: {json_str[:200]}...")

                    # Parse full orchestrator response
                    response_data = json.loads(json_str)
                    logger.info(
                        f"[Orchestrator] Parsed orchestrator response: {response_data.get('verdict', 'unknown')}"
                    )
                    print(
                        f"[Orchestrator] Parsed JSON object - Verdict: {response_data.get('verdict', 'unknown')}",
                        flush=True,
                    )

                    # Extract findings array from response
                    findings_data = response_data.get("findings", [])
                    logger.info(
                        f"[Orchestrator] Found {len(findings_data)} finding(s) in response"
                    )
                    print(
                        f"[Orchestrator] Extracted {len(findings_data)} findings from response",
                        flush=True,
                    )

                    # Process findings from JSON object
                    for idx, data in enumerate(findings_data):
                        # Generate unique ID for this finding
                        import hashlib

                        finding_id = hashlib.md5(
                            f"{data.get('file', 'unknown')}:{data.get('line', 0)}:{data.get('title', 'Untitled')}".encode(),
                            usedforsecurity=False,
                        ).hexdigest()[:12]

                        # Map category using flexible mapping (handles AI-generated values)
                        category = _map_category(data.get("category", "quality"))

                        # Map severity with fallback
                        try:
                            severity = ReviewSeverity(
                                data.get("severity", "medium").lower()
                            )
                        except ValueError:
                            severity = ReviewSeverity.MEDIUM

                        finding = PRReviewFinding(
                            id=finding_id,
                            file=data.get("file", "unknown"),
                            line=data.get("line", 0),
                            title=data.get("title", "Untitled"),
                            description=data.get("description", ""),
                            category=category,
                            severity=severity,
                            suggested_fix=data.get(
                                "suggestion", data.get("suggested_fix", "")
                            ),
                            confidence=data.get("confidence", 85) / 100.0
                            if data.get("confidence", 85) > 1
                            else data.get("confidence", 0.85),
                        )
                        findings.append(finding)
                        logger.debug(
                            f"[Orchestrator] Added finding: {finding.title} ({finding.severity.value})"
                        )

                    print(
                        f"[Orchestrator] Processed {len(findings)} findings from JSON object",
                        flush=True,
                    )
                else:
                    logger.warning(
                        "[Orchestrator] Could not find matching closing brace"
                    )
                    return findings
            elif output.find("[") != -1:
                # Fallback: Try to parse as array (old format)
                start = output.find("[")
                end = output.rfind("]")
                logger.debug(
                    f"[Orchestrator] Fallback to array parsing: start={start}, end={end}"
                )

                if start != -1 and end != -1:
                    json_str = output[start : end + 1]
                    logger.debug(
                        f"[Orchestrator] Extracted JSON array (length: {len(json_str)})"
                    )
                    findings_data = json.loads(json_str)
                    logger.info(
                        f"[Orchestrator] Parsed {len(findings_data)} finding(s) from array"
                    )

                    for idx, data in enumerate(findings_data):
                        # Generate unique ID for this finding
                        import hashlib

                        finding_id = hashlib.md5(
                            f"{data.get('file', 'unknown')}:{data.get('line', 0)}:{data.get('title', 'Untitled')}".encode(),
                            usedforsecurity=False,
                        ).hexdigest()[:12]

                        # Map category using flexible mapping (handles AI-generated values)
                        category = _map_category(data.get("category", "quality"))

                        # Map severity with fallback
                        try:
                            severity = ReviewSeverity(
                                data.get("severity", "medium").lower()
                            )
                        except ValueError:
                            severity = ReviewSeverity.MEDIUM

                        finding = PRReviewFinding(
                            id=finding_id,
                            file=data.get("file", "unknown"),
                            line=data.get("line", 0),
                            title=data.get("title", "Untitled"),
                            description=data.get("description", ""),
                            category=category,
                            severity=severity,
                            suggested_fix=data.get(
                                "suggestion", data.get("suggested_fix", "")
                            ),
                            confidence=data.get("confidence", 85) / 100.0
                            if data.get("confidence", 85) > 1
                            else data.get("confidence", 0.85),
                        )
                        findings.append(finding)
                        logger.debug(
                            f"[Orchestrator] Added finding: {finding.title} ({finding.severity.value})"
                        )

            else:
                logger.warning("[Orchestrator] No JSON array found in output")

        except Exception as e:
            logger.error(f"[Orchestrator] Failed to parse output: {e}", exc_info=True)

        logger.info(f"[Orchestrator] Parsed {len(findings)} total findings from output")
        return findings

    def _extract_findings_from_data(
        self, findings_data: list[dict]
    ) -> list[PRReviewFinding]:
        """
        Extract PRReviewFinding objects from parsed JSON findings data.

        Args:
            findings_data: List of finding dictionaries from JSON

        Returns:
            List of PRReviewFinding objects
        """
        import hashlib

        findings = []
        for data in findings_data:
            # Generate unique ID for this finding
            finding_id = hashlib.md5(
                f"{data.get('file', 'unknown')}:{data.get('line', 0)}:{data.get('title', 'Untitled')}".encode(),
                usedforsecurity=False,
            ).hexdigest()[:12]

            # Map category using flexible mapping (handles AI-generated values)
            category = _map_category(data.get("category", "quality"))

            # Map severity with fallback
            try:
                severity = ReviewSeverity(data.get("severity", "medium").lower())
            except ValueError:
                severity = ReviewSeverity.MEDIUM

            finding = PRReviewFinding(
                id=finding_id,
                file=data.get("file", "unknown"),
                line=data.get("line", 0),
                title=data.get("title", "Untitled"),
                description=data.get("description", ""),
                category=category,
                severity=severity,
                suggested_fix=data.get("suggestion", data.get("suggested_fix", "")),
                confidence=data.get("confidence", 85) / 100.0
                if data.get("confidence", 85) > 1
                else data.get("confidence", 0.85),
            )
            findings.append(finding)
            logger.debug(
                f"[Orchestrator] Added finding: {finding.title} ({finding.severity.value})"
            )

        return findings

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

    def _generate_verdict(
        self, findings: list[PRReviewFinding], test_result
    ) -> tuple[MergeVerdict, str, list[str]]:
        """Generate merge verdict based on findings and test results."""
        blockers = []

        # Count by severity
        critical = [f for f in findings if f.severity == ReviewSeverity.CRITICAL]
        high = [f for f in findings if f.severity == ReviewSeverity.HIGH]

        # Tests failing is always a blocker
        if test_result and not test_result.passed:
            blockers.append(f"Tests failing: {test_result.error or 'Unknown error'}")

        # Critical findings are blockers
        for f in critical:
            blockers.append(f"Critical: {f.title} ({f.file}:{f.line})")

        # Determine verdict
        if blockers or (test_result and not test_result.passed):
            verdict = MergeVerdict.BLOCKED
            reasoning = f"Blocked by {len(blockers)} critical issue(s)"
        elif high:
            verdict = MergeVerdict.NEEDS_REVISION
            reasoning = f"{len(high)} high-priority issues must be addressed"
        elif len(findings) > 0:
            verdict = MergeVerdict.MERGE_WITH_CHANGES
            reasoning = f"{len(findings)} issues to address"
        else:
            verdict = MergeVerdict.READY_TO_MERGE
            reasoning = "No blocking issues found"

        return verdict, reasoning, blockers

    def _generate_summary(
        self,
        verdict: MergeVerdict,
        verdict_reasoning: str,
        blockers: list[str],
        findings: list[PRReviewFinding],
        test_result,
    ) -> str:
        """Generate PR review summary."""
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
        ]

        # Test results
        if test_result:
            if test_result.passed:
                lines.append("✅ **Tests**: All tests passing")
            else:
                lines.append(
                    f"❌ **Tests**: Failed - {test_result.error or 'See logs'}"
                )
            lines.append("")

        # Blockers
        if blockers:
            lines.append("### 🚨 Blocking Issues")
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

        lines.append("---")
        lines.append("_Generated by Auto Claude Orchestrating PR Reviewer (Opus 4.5)_")

        return "\n".join(lines)
