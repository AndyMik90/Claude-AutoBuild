"""
Parallel Orchestrator PR Reviewer
==================================

PR reviewer using Claude Agent SDK subagents for parallel specialist analysis.

The orchestrator analyzes the PR and delegates to specialized agents (security,
quality, logic, codebase-fit, ai-triage) which run in parallel. Results are
synthesized into a final verdict.

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
from typing import Any

from claude_agent_sdk import AgentDefinition

try:
    from ...core.client import create_client
    from ...phase_config import get_thinking_budget
    from ..context_gatherer import PRContext
    from ..models import (
        GitHubRunnerConfig,
        MergeVerdict,
        PRReviewFinding,
        PRReviewResult,
        ReviewCategory,
        ReviewSeverity,
    )
    from .pydantic_models import ParallelOrchestratorResponse
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
    from phase_config import get_thinking_budget
    from services.pydantic_models import ParallelOrchestratorResponse


logger = logging.getLogger(__name__)

# Check if debug mode is enabled
DEBUG_MODE = os.environ.get("DEBUG", "").lower() in ("true", "1", "yes")

# Map AI-generated category names to valid ReviewCategory enum values
_CATEGORY_MAPPING = {
    # Direct matches
    "security": ReviewCategory.SECURITY,
    "quality": ReviewCategory.QUALITY,
    "logic": ReviewCategory.QUALITY,  # Logic maps to quality
    "codebase_fit": ReviewCategory.PATTERN,  # Codebase fit maps to pattern
    "style": ReviewCategory.STYLE,
    "test": ReviewCategory.TEST,
    "docs": ReviewCategory.DOCS,
    "pattern": ReviewCategory.PATTERN,
    "performance": ReviewCategory.PERFORMANCE,
    "redundancy": ReviewCategory.REDUNDANCY,
    # AI-generated alternatives
    "correctness": ReviewCategory.QUALITY,
    "consistency": ReviewCategory.PATTERN,
    "testing": ReviewCategory.TEST,
    "documentation": ReviewCategory.DOCS,
    "bug": ReviewCategory.QUALITY,
    "error_handling": ReviewCategory.QUALITY,
    "maintainability": ReviewCategory.QUALITY,
    "readability": ReviewCategory.STYLE,
    "best_practices": ReviewCategory.PATTERN,
    "architecture": ReviewCategory.PATTERN,
    "complexity": ReviewCategory.QUALITY,
    "dead_code": ReviewCategory.REDUNDANCY,
    "unused": ReviewCategory.REDUNDANCY,
}


def _map_category(category_str: str) -> ReviewCategory:
    """Map an AI-generated category string to a valid ReviewCategory enum."""
    normalized = category_str.lower().strip().replace("-", "_")
    return _CATEGORY_MAPPING.get(normalized, ReviewCategory.QUALITY)


class ParallelOrchestratorReviewer:
    """
    PR reviewer using SDK subagents for parallel specialist analysis.

    The orchestrator:
    1. Analyzes the PR (size, complexity, file types, risk areas)
    2. Delegates to appropriate specialist agents (SDK handles parallel execution)
    3. Synthesizes findings into a final verdict

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
        Define specialist agents for the SDK.

        Each agent has:
        - description: When the orchestrator should invoke this agent
        - prompt: System prompt for the agent
        - tools: Tools the agent can use (read-only for PR review)
        - model: "inherit" = use same model as orchestrator (user's choice)

        Returns AgentDefinition dataclass instances as required by the SDK.
        """
        # Load agent prompts from files
        security_prompt = self._load_prompt("pr_security_agent.md")
        quality_prompt = self._load_prompt("pr_quality_agent.md")
        logic_prompt = self._load_prompt("pr_logic_agent.md")
        codebase_fit_prompt = self._load_prompt("pr_codebase_fit_agent.md")
        ai_triage_prompt = self._load_prompt("pr_ai_triage.md")

        return {
            "security-reviewer": AgentDefinition(
                description=(
                    "Security specialist. Use for OWASP Top 10, authentication, "
                    "injection, cryptographic issues, and sensitive data exposure. "
                    "Invoke when PR touches auth, API endpoints, user input, database queries, "
                    "or file operations."
                ),
                prompt=security_prompt
                or "You are a security expert. Find vulnerabilities.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
            "quality-reviewer": AgentDefinition(
                description=(
                    "Code quality expert. Use for complexity, duplication, error handling, "
                    "maintainability, and pattern adherence. Invoke when PR has complex logic, "
                    "large functions, or significant business logic changes."
                ),
                prompt=quality_prompt
                or "You are a code quality expert. Find quality issues.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
            "logic-reviewer": AgentDefinition(
                description=(
                    "Logic and correctness specialist. Use for algorithm verification, "
                    "edge cases, state management, and race conditions. Invoke when PR has "
                    "algorithmic changes, data transformations, concurrent operations, or bug fixes."
                ),
                prompt=logic_prompt
                or "You are a logic expert. Find correctness issues.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
            "codebase-fit-reviewer": AgentDefinition(
                description=(
                    "Codebase consistency expert. Use for naming conventions, ecosystem fit, "
                    "architectural alignment, and avoiding reinvention. Invoke when PR introduces "
                    "new patterns, large additions, or code that might duplicate existing functionality."
                ),
                prompt=codebase_fit_prompt
                or "You are a codebase expert. Check for consistency.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
            "ai-triage-reviewer": AgentDefinition(
                description=(
                    "AI comment validator. Use for triaging comments from CodeRabbit, "
                    "Gemini Code Assist, Cursor, Greptile, and other AI reviewers. "
                    "Invoke when PR has existing AI review comments that need validation."
                ),
                prompt=ai_triage_prompt
                or "You are an AI triage expert. Validate AI comments.",
                tools=["Read", "Grep", "Glob"],
                model="inherit",
            ),
        }

    def _build_orchestrator_prompt(self, context: PRContext) -> str:
        """Build full prompt for orchestrator with PR context."""
        # Load orchestrator prompt
        base_prompt = self._load_prompt("pr_parallel_orchestrator.md")
        if not base_prompt:
            base_prompt = "You are a PR reviewer. Analyze and delegate to specialists."

        # Build file list
        files_list = []
        for file in context.changed_files:
            files_list.append(
                f"- `{file.path}` (+{file.additions}/-{file.deletions}) - {file.status}"
            )

        # Build composite diff
        patches = []
        MAX_DIFF_CHARS = 200_000

        for file in context.changed_files:
            if file.patch:
                patches.append(f"\n### File: {file.path}\n{file.patch}")

        diff_content = "\n".join(patches)

        if len(diff_content) > MAX_DIFF_CHARS:
            diff_content = diff_content[:MAX_DIFF_CHARS] + "\n\n... (diff truncated)"

        # Build AI comments context if present
        ai_comments_section = ""
        if context.ai_bot_comments:
            ai_comments_list = []
            for comment in context.ai_bot_comments[:20]:
                ai_comments_list.append(
                    f"- **{comment.tool_name}** on {comment.file or 'general'}: "
                    f"{comment.body[:200]}..."
                )
            ai_comments_section = f"""
### AI Review Comments (need triage)
Found {len(context.ai_bot_comments)} comments from AI tools:
{chr(10).join(ai_comments_list)}
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

### Description
{context.description}

### All Changed Files
{chr(10).join(files_list)}
{ai_comments_section}
### Code Changes
```diff
{diff_content}
```

---

Now analyze this PR and delegate to the appropriate specialist agents.
Remember: YOU decide which agents to invoke based on YOUR analysis.
The SDK will run invoked agents in parallel automatically.
"""

        return base_prompt + pr_context

    async def review(self, context: PRContext) -> PRReviewResult:
        """
        Main review entry point.

        Args:
            context: Full PR context with all files and patches

        Returns:
            PRReviewResult with findings and verdict
        """
        logger.info(
            f"[ParallelOrchestrator] Starting review for PR #{context.pr_number}"
        )

        try:
            self._report_progress(
                "orchestrating",
                35,
                "Parallel orchestrator analyzing PR...",
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
                f"[ParallelOrchestrator] Using model={model}, "
                f"thinking_level={thinking_level}, thinking_budget={thinking_budget}"
            )

            # Create client with subagents defined
            # SDK handles parallel execution when Claude invokes multiple Task tools
            client = create_client(
                project_dir=project_root,
                spec_dir=self.github_dir,
                model=model,
                agent_type="pr_orchestrator_parallel",
                max_thinking_tokens=thinking_budget,
                agents=self._define_specialist_agents(),
                output_format={
                    "type": "json_schema",
                    "schema": ParallelOrchestratorResponse.model_json_schema(),
                },
            )

            self._report_progress(
                "orchestrating",
                40,
                "Orchestrator delegating to specialist agents...",
                pr_number=context.pr_number,
            )

            # Run orchestrator session
            result_text = ""
            structured_output = None
            agents_invoked = []
            msg_count = 0
            # Track subagent tool IDs to log their results
            subagent_tool_ids: dict[str, str] = {}  # tool_id -> agent_name

            async with client:
                await client.query(prompt)

                print(
                    f"[ParallelOrchestrator] Running orchestrator ({model})...",
                    flush=True,
                )
                if DEBUG_MODE:
                    print(
                        "[DEBUG ParallelOrchestrator] Sent query, awaiting response stream...",
                        flush=True,
                    )

                async for msg in client.receive_response():
                    msg_type = type(msg).__name__
                    msg_count += 1

                    if DEBUG_MODE:
                        # Log every message type for visibility
                        msg_details = ""
                        if hasattr(msg, "type"):
                            msg_details = f" (type={msg.type})"
                        print(
                            f"[DEBUG ParallelOrchestrator] Message #{msg_count}: {msg_type}{msg_details}",
                            flush=True,
                        )

                    # Track thinking blocks
                    if msg_type == "ThinkingBlock" or (
                        hasattr(msg, "type") and msg.type == "thinking"
                    ):
                        thinking_text = getattr(msg, "thinking", "") or getattr(
                            msg, "text", ""
                        )
                        if thinking_text:
                            print(
                                f"[ParallelOrchestrator] AI thinking: {len(thinking_text)} chars",
                                flush=True,
                            )
                            if DEBUG_MODE:
                                # Show first 200 chars of thinking
                                preview = thinking_text[:200].replace("\n", " ")
                                print(
                                    f"[DEBUG ParallelOrchestrator] Thinking preview: {preview}...",
                                    flush=True,
                                )

                    # Track subagent invocations (Task tool calls)
                    if msg_type == "ToolUseBlock" or (
                        hasattr(msg, "type") and msg.type == "tool_use"
                    ):
                        tool_name = getattr(msg, "name", "")
                        if DEBUG_MODE:
                            tool_id = getattr(msg, "id", "unknown")
                            print(
                                f"[DEBUG ParallelOrchestrator] Tool call: {tool_name} (id={tool_id})",
                                flush=True,
                            )
                        if tool_name == "Task":
                            # Extract which agent was invoked
                            tool_input = getattr(msg, "input", {})
                            agent_name = tool_input.get("subagent_type", "unknown")
                            tool_id = getattr(msg, "id", "unknown")
                            agents_invoked.append(agent_name)
                            # Track this tool ID to log its result later
                            subagent_tool_ids[tool_id] = agent_name
                            print(
                                f"[ParallelOrchestrator] Invoked agent: {agent_name}",
                                flush=True,
                            )
                        elif tool_name == "StructuredOutput":
                            structured_data = getattr(msg, "input", None)
                            if structured_data:
                                structured_output = structured_data
                                print(
                                    "[ParallelOrchestrator] Received structured output",
                                    flush=True,
                                )
                        elif DEBUG_MODE:
                            # Log other tool calls in debug mode
                            print(
                                f"[DEBUG ParallelOrchestrator] Other tool: {tool_name}",
                                flush=True,
                            )

                    # Track tool results
                    if msg_type == "ToolResultBlock" or (
                        hasattr(msg, "type") and msg.type == "tool_result"
                    ):
                        tool_id = getattr(msg, "tool_use_id", "unknown")
                        is_error = getattr(msg, "is_error", False)

                        # Check if this is a subagent result
                        if tool_id in subagent_tool_ids:
                            agent_name = subagent_tool_ids[tool_id]
                            status = "ERROR" if is_error else "complete"
                            # Get the result content
                            result_content = getattr(msg, "content", "")
                            if isinstance(result_content, list):
                                # Handle list of content blocks
                                result_content = " ".join(
                                    str(getattr(c, "text", c)) for c in result_content
                                )
                            result_preview = (
                                str(result_content)[:600].replace("\n", " ").strip()
                            )
                            print(
                                f"[Agent:{agent_name}] {status}: {result_preview}{'...' if len(str(result_content)) > 600 else ''}",
                                flush=True,
                            )
                        elif DEBUG_MODE:
                            status = "ERROR" if is_error else "OK"
                            print(
                                f"[DEBUG ParallelOrchestrator] Tool result: {tool_id} [{status}]",
                                flush=True,
                            )

                    # Collect text output and check for tool uses in content blocks
                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__

                            # Check for tool use blocks within content
                            if (
                                block_type == "ToolUseBlock"
                                or getattr(block, "type", "") == "tool_use"
                            ):
                                tool_name = getattr(block, "name", "")
                                if tool_name == "Task":
                                    tool_input = getattr(block, "input", {})
                                    agent_name = tool_input.get(
                                        "subagent_type", "unknown"
                                    )
                                    tool_id = getattr(block, "id", "unknown")
                                    if agent_name not in agents_invoked:
                                        agents_invoked.append(agent_name)
                                        subagent_tool_ids[tool_id] = agent_name
                                        print(
                                            f"[ParallelOrchestrator] Invoking agent: {agent_name}",
                                            flush=True,
                                        )
                                elif tool_name == "StructuredOutput":
                                    structured_data = getattr(block, "input", None)
                                    if structured_data:
                                        structured_output = structured_data

                            if hasattr(block, "text"):
                                result_text += block.text
                                # Always print text content preview (not just in DEBUG_MODE)
                                text_preview = (
                                    block.text[:500].replace("\n", " ").strip()
                                )
                                if text_preview:
                                    print(
                                        f"[ParallelOrchestrator] AI response: {text_preview}{'...' if len(block.text) > 500 else ''}",
                                        flush=True,
                                    )
                            # Check for StructuredOutput in content (legacy check)
                            if getattr(block, "name", "") == "StructuredOutput":
                                structured_data = getattr(block, "input", None)
                                if structured_data:
                                    structured_output = structured_data

                    # Check for structured_output attribute
                    if hasattr(msg, "structured_output") and msg.structured_output:
                        structured_output = msg.structured_output

                    # Check for tool results in UserMessage (subagent results come back here)
                    if msg_type == "UserMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            # Check for tool result blocks
                            if (
                                block_type == "ToolResultBlock"
                                or getattr(block, "type", "") == "tool_result"
                            ):
                                tool_id = getattr(block, "tool_use_id", "unknown")
                                is_error = getattr(block, "is_error", False)

                                # Check if this is a subagent result
                                if tool_id in subagent_tool_ids:
                                    agent_name = subagent_tool_ids[tool_id]
                                    status = "ERROR" if is_error else "complete"
                                    # Get the result content
                                    result_content = getattr(block, "content", "")
                                    if isinstance(result_content, list):
                                        result_content = " ".join(
                                            str(getattr(c, "text", c))
                                            for c in result_content
                                        )
                                    result_preview = (
                                        str(result_content)[:600]
                                        .replace("\n", " ")
                                        .strip()
                                    )
                                    print(
                                        f"[Agent:{agent_name}] {status}: {result_preview}{'...' if len(str(result_content)) > 600 else ''}",
                                        flush=True,
                                    )

            if DEBUG_MODE:
                print(
                    f"[DEBUG ParallelOrchestrator] Session ended. Total messages: {msg_count}",
                    flush=True,
                )

            print(
                f"[ParallelOrchestrator] Session ended. Total messages: {msg_count}",
                flush=True,
            )

            self._report_progress(
                "finalizing",
                50,
                "Synthesizing findings...",
                pr_number=context.pr_number,
            )

            # Parse findings from output (structured output also returns agents)
            agents_from_structured: list[str] = []
            if structured_output:
                findings, agents_from_structured = self._parse_structured_output(
                    structured_output
                )
                if findings is None and result_text:
                    findings = self._parse_text_output(result_text)
                elif findings is None:
                    findings = []
            else:
                findings = self._parse_text_output(result_text)

            # Use agents from structured output (more reliable than streaming detection)
            final_agents = (
                agents_from_structured if agents_from_structured else agents_invoked
            )
            logger.info(
                f"[ParallelOrchestrator] Session complete. Agents invoked: {final_agents}"
            )
            print(
                f"[ParallelOrchestrator] Complete. Agents invoked: {final_agents}",
                flush=True,
            )

            # Deduplicate findings
            unique_findings = self._deduplicate_findings(findings)

            logger.info(
                f"[ParallelOrchestrator] Review complete: {len(unique_findings)} findings"
            )

            # Generate verdict
            verdict, verdict_reasoning, blockers = self._generate_verdict(
                unique_findings
            )

            # Generate summary
            summary = self._generate_summary(
                verdict=verdict,
                verdict_reasoning=verdict_reasoning,
                blockers=blockers,
                findings=unique_findings,
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

            # Extract HEAD SHA from commits for follow-up review tracking
            head_sha = None
            if context.commits:
                latest_commit = context.commits[-1]
                head_sha = latest_commit.get("oid") or latest_commit.get("sha")

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
                reviewed_commit_sha=head_sha,
            )

            self._report_progress(
                "analyzed",
                60,
                "Parallel analysis complete",
                pr_number=context.pr_number,
            )

            return result

        except Exception as e:
            logger.error(f"[ParallelOrchestrator] Review failed: {e}", exc_info=True)
            return PRReviewResult(
                pr_number=context.pr_number,
                repo=self.config.repo,
                success=False,
                error=str(e),
            )

    def _parse_structured_output(
        self, structured_output: dict[str, Any]
    ) -> tuple[list[PRReviewFinding] | None, list[str]]:
        """Parse findings and agents from SDK structured output.

        Returns:
            Tuple of (findings list or None if parsing failed, agents list)
        """
        findings = []
        agents_from_output: list[str] = []

        try:
            result = ParallelOrchestratorResponse.model_validate(structured_output)
            agents_from_output = result.agents_invoked or []

            logger.info(
                f"[ParallelOrchestrator] Structured output: verdict={result.verdict}, "
                f"{len(result.findings)} findings, agents={agents_from_output}"
            )

            # Log agents invoked with clear formatting
            if agents_from_output:
                print(
                    f"[ParallelOrchestrator] Specialist agents invoked: {', '.join(agents_from_output)}",
                    flush=True,
                )
                for agent in agents_from_output:
                    print(f"[Agent:{agent}] Analysis complete", flush=True)

            for f in result.findings:
                finding_id = hashlib.md5(
                    f"{f.file}:{f.line}:{f.title}".encode(),
                    usedforsecurity=False,
                ).hexdigest()[:12]

                category = _map_category(f.category)

                try:
                    severity = ReviewSeverity(f.severity.lower())
                except ValueError:
                    severity = ReviewSeverity.MEDIUM

                finding = PRReviewFinding(
                    id=finding_id,
                    file=f.file,
                    line=f.line,
                    title=f.title,
                    description=f.description,
                    category=category,
                    severity=severity,
                    suggested_fix=f.suggested_fix or "",
                    confidence=self._normalize_confidence(f.confidence),
                )
                findings.append(finding)

            print(
                f"[ParallelOrchestrator] Parsed {len(findings)} findings from structured output",
                flush=True,
            )

            # Log findings summary for verification
            if findings:
                print("[ParallelOrchestrator] Findings summary:", flush=True)
                for i, f in enumerate(findings, 1):
                    print(
                        f"  [{f.severity.value.upper()}] {i}. {f.title} ({f.file}:{f.line})",
                        flush=True,
                    )

        except Exception as e:
            logger.error(
                f"[ParallelOrchestrator] Structured output parsing failed: {e}"
            )
            return None, agents_from_output

        return findings, agents_from_output

    def _parse_text_output(self, output: str) -> list[PRReviewFinding]:
        """Parse findings from text output (fallback)."""
        import json
        import re

        findings = []

        try:
            # Try to find JSON in code blocks
            code_block_pattern = r"```(?:json)?\s*(\{[\s\S]*?\})\s*```"
            code_block_match = re.search(code_block_pattern, output)

            if code_block_match:
                json_str = code_block_match.group(1)
                data = json.loads(json_str)
                findings_data = data.get("findings", [])
            else:
                # Try to find raw JSON object
                start = output.find("{")
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
                    if end != -1:
                        json_str = output[start : end + 1]
                        data = json.loads(json_str)
                        findings_data = data.get("findings", [])
                    else:
                        return findings
                else:
                    return findings

            # Process findings
            for f_data in findings_data:
                finding_id = hashlib.md5(
                    f"{f_data.get('file', 'unknown')}:{f_data.get('line', 0)}:{f_data.get('title', 'Untitled')}".encode(),
                    usedforsecurity=False,
                ).hexdigest()[:12]

                category = _map_category(f_data.get("category", "quality"))

                try:
                    severity = ReviewSeverity(f_data.get("severity", "medium").lower())
                except ValueError:
                    severity = ReviewSeverity.MEDIUM

                finding = PRReviewFinding(
                    id=finding_id,
                    file=f_data.get("file", "unknown"),
                    line=f_data.get("line", 0),
                    title=f_data.get("title", "Untitled"),
                    description=f_data.get("description", ""),
                    category=category,
                    severity=severity,
                    suggested_fix=f_data.get("suggested_fix", ""),
                    confidence=self._normalize_confidence(f_data.get("confidence", 85)),
                )
                findings.append(finding)

        except Exception as e:
            logger.error(f"[ParallelOrchestrator] Text parsing failed: {e}")

        return findings

    def _normalize_confidence(self, value: int | float) -> float:
        """Normalize confidence to 0.0-1.0 range."""
        if value > 1:
            return value / 100.0
        return float(value)

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
        self, findings: list[PRReviewFinding]
    ) -> tuple[MergeVerdict, str, list[str]]:
        """Generate merge verdict based on findings."""
        blockers = []

        critical = [f for f in findings if f.severity == ReviewSeverity.CRITICAL]
        high = [f for f in findings if f.severity == ReviewSeverity.HIGH]
        medium = [f for f in findings if f.severity == ReviewSeverity.MEDIUM]
        low = [f for f in findings if f.severity == ReviewSeverity.LOW]

        for f in critical:
            blockers.append(f"Critical: {f.title} ({f.file}:{f.line})")

        if blockers:
            verdict = MergeVerdict.BLOCKED
            reasoning = f"Blocked by {len(blockers)} critical issue(s)"
        elif high or medium:
            # High and Medium severity findings block merge
            verdict = MergeVerdict.NEEDS_REVISION
            total = len(high) + len(medium)
            reasoning = f"{total} issue(s) must be addressed ({len(high)} required, {len(medium)} recommended)"
        elif low:
            # Only Low severity suggestions - can merge but consider addressing
            verdict = MergeVerdict.MERGE_WITH_CHANGES
            reasoning = f"{len(low)} suggestion(s) to consider"
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
        agents_invoked: list[str],
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

        # Agents used
        if agents_invoked:
            lines.append(f"**Specialist Agents Invoked:** {', '.join(agents_invoked)}")
            lines.append("")

        # Blockers
        if blockers:
            lines.append("### 🚨 Blocking Issues")
            for blocker in blockers:
                lines.append(f"- {blocker}")
            lines.append("")

        # Findings summary
        if findings:
            by_severity: dict[str, list] = {}
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
        lines.append("_Generated by Auto Claude Parallel Orchestrator (SDK Subagents)_")

        return "\n".join(lines)
