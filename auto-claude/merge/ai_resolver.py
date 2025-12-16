"""
AI Resolver
===========

Handles conflicts that cannot be resolved by deterministic rules.

This component is called ONLY when the AutoMerger cannot handle a conflict.
It uses minimal context to reduce token usage:

1. Only the conflict region, not the entire file
2. Task intents (1 sentence each)
3. Semantic change descriptions
4. The baseline code for reference

The AI is given a focused task: merge these specific changes.
No file exploration, no open-ended questions.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .types import (
    ChangeType,
    ConflictRegion,
    ConflictSeverity,
    MergeDecision,
    MergeResult,
    MergeStrategy,
    SemanticChange,
    TaskSnapshot,
)

logger = logging.getLogger(__name__)


@dataclass
class ConflictContext:
    """
    Minimal context needed to resolve a conflict.

    This is what gets sent to the AI - optimized for minimal tokens.
    """

    file_path: str
    location: str
    baseline_code: str  # The code before any task modified it
    task_changes: list[tuple[str, str, list[SemanticChange]]]  # (task_id, intent, changes)
    conflict_description: str
    language: str = "unknown"

    def to_prompt_context(self) -> str:
        """Format as context for the AI prompt."""
        lines = [
            f"File: {self.file_path}",
            f"Location: {self.location}",
            f"Language: {self.language}",
            "",
            "--- BASELINE CODE (before any changes) ---",
            self.baseline_code,
            "--- END BASELINE ---",
            "",
            "CHANGES FROM EACH TASK:",
        ]

        for task_id, intent, changes in self.task_changes:
            lines.append(f"\n[Task: {task_id}]")
            lines.append(f"Intent: {intent}")
            lines.append("Changes:")
            for change in changes:
                lines.append(f"  - {change.change_type.value}: {change.target}")
                if change.content_after:
                    # Truncate long content
                    content = change.content_after
                    if len(content) > 500:
                        content = content[:500] + "... (truncated)"
                    lines.append(f"    Code: {content}")

        lines.extend([
            "",
            f"CONFLICT: {self.conflict_description}",
        ])

        return "\n".join(lines)

    @property
    def estimated_tokens(self) -> int:
        """Rough estimate of tokens in this context."""
        text = self.to_prompt_context()
        # Rough estimate: 4 chars per token for code
        return len(text) // 4


# Type for the AI call function
AICallFunction = Callable[[str, str], str]


class AIResolver:
    """
    Resolves conflicts using AI with minimal context.

    This class:
    1. Builds minimal conflict context
    2. Creates focused prompts
    3. Calls AI and parses response
    4. Returns MergeResult with merged code

    Usage:
        resolver = AIResolver(ai_call_fn)
        result = resolver.resolve_conflict(conflict, context)
    """

    # Maximum tokens to send to AI (keeps costs down)
    MAX_CONTEXT_TOKENS = 4000

    # Prompt template for merge resolution
    MERGE_PROMPT = '''You are a code merge assistant. Your task is to merge changes from multiple development tasks into a single coherent result.

CONTEXT:
{context}

INSTRUCTIONS:
1. Analyze what each task intended to accomplish
2. Merge the changes so that ALL task intents are preserved
3. Resolve any conflicts by understanding the semantic purpose
4. Output ONLY the merged code - no explanations

RULES:
- All imports from all tasks should be included
- All hook calls should be preserved (order matters: earlier tasks first)
- If tasks modify the same function, combine their changes logically
- If tasks wrap JSX differently, apply wrappings from outside-in (earlier task = outer)
- Preserve code style consistency

OUTPUT FORMAT:
Return only the merged code block, wrapped in triple backticks with the language:
```{language}
merged code here
```

Merge the code now:'''

    def __init__(
        self,
        ai_call_fn: Optional[AICallFunction] = None,
        max_context_tokens: int = MAX_CONTEXT_TOKENS,
    ):
        """
        Initialize the AI resolver.

        Args:
            ai_call_fn: Function that calls AI. Signature: (system_prompt, user_prompt) -> response
                        If None, uses a stub that requires explicit calls.
            max_context_tokens: Maximum tokens to include in context
        """
        self.ai_call_fn = ai_call_fn
        self.max_context_tokens = max_context_tokens
        self._call_count = 0
        self._total_tokens = 0

    def set_ai_function(self, ai_call_fn: AICallFunction) -> None:
        """Set the AI call function after initialization."""
        self.ai_call_fn = ai_call_fn

    @property
    def stats(self) -> dict[str, int]:
        """Get usage statistics."""
        return {
            "calls_made": self._call_count,
            "estimated_tokens_used": self._total_tokens,
        }

    def reset_stats(self) -> None:
        """Reset usage statistics."""
        self._call_count = 0
        self._total_tokens = 0

    def build_context(
        self,
        conflict: ConflictRegion,
        baseline_code: str,
        task_snapshots: list[TaskSnapshot],
    ) -> ConflictContext:
        """
        Build minimal context for a conflict.

        Args:
            conflict: The conflict to resolve
            baseline_code: Original code before any changes
            task_snapshots: Snapshots from each involved task

        Returns:
            ConflictContext with minimal data for AI
        """
        # Filter to only changes at the conflict location
        task_changes: list[tuple[str, str, list[SemanticChange]]] = []

        for snapshot in task_snapshots:
            if snapshot.task_id not in conflict.tasks_involved:
                continue

            relevant_changes = [
                c for c in snapshot.semantic_changes
                if c.location == conflict.location or self._locations_overlap(c.location, conflict.location)
            ]

            if relevant_changes:
                task_changes.append((
                    snapshot.task_id,
                    snapshot.task_intent or "No intent specified",
                    relevant_changes,
                ))

        # Determine language from file extension
        language = self._infer_language(conflict.file_path)

        # Build description
        change_types = [ct.value for ct in conflict.change_types]
        description = (
            f"Tasks {', '.join(conflict.tasks_involved)} made conflicting changes: "
            f"{', '.join(change_types)}. "
            f"Severity: {conflict.severity.value}. "
            f"{conflict.reason}"
        )

        return ConflictContext(
            file_path=conflict.file_path,
            location=conflict.location,
            baseline_code=baseline_code,
            task_changes=task_changes,
            conflict_description=description,
            language=language,
        )

    def _locations_overlap(self, loc1: str, loc2: str) -> bool:
        """Check if two locations might overlap."""
        # Simple heuristic: if one contains the other or they share a prefix
        if loc1 == loc2:
            return True
        if loc1.startswith(loc2) or loc2.startswith(loc1):
            return True
        # Check for function/class containment
        if loc1.startswith("function:") and loc2.startswith("function:"):
            return loc1.split(":")[1] == loc2.split(":")[1]
        return False

    def _infer_language(self, file_path: str) -> str:
        """Infer programming language from file path."""
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".tsx": "tsx",
            ".jsx": "jsx",
            ".go": "go",
            ".rs": "rust",
            ".java": "java",
            ".kt": "kotlin",
            ".swift": "swift",
            ".rb": "ruby",
            ".php": "php",
            ".css": "css",
            ".html": "html",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".md": "markdown",
        }

        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "text"

    def resolve_conflict(
        self,
        conflict: ConflictRegion,
        baseline_code: str,
        task_snapshots: list[TaskSnapshot],
    ) -> MergeResult:
        """
        Resolve a conflict using AI.

        Args:
            conflict: The conflict to resolve
            baseline_code: Original code at the conflict location
            task_snapshots: Snapshots from involved tasks

        Returns:
            MergeResult with the resolution
        """
        if not self.ai_call_fn:
            return MergeResult(
                decision=MergeDecision.NEEDS_HUMAN_REVIEW,
                file_path=conflict.file_path,
                explanation="No AI function configured",
                conflicts_remaining=[conflict],
            )

        # Build context
        context = self.build_context(conflict, baseline_code, task_snapshots)

        # Check token limit
        if context.estimated_tokens > self.max_context_tokens:
            logger.warning(
                f"Context too large ({context.estimated_tokens} tokens), "
                "flagging for human review"
            )
            return MergeResult(
                decision=MergeDecision.NEEDS_HUMAN_REVIEW,
                file_path=conflict.file_path,
                explanation=f"Context too large for AI ({context.estimated_tokens} tokens)",
                conflicts_remaining=[conflict],
            )

        # Build prompt
        prompt_context = context.to_prompt_context()
        prompt = self.MERGE_PROMPT.format(
            context=prompt_context,
            language=context.language,
        )

        # Call AI
        try:
            logger.info(f"Calling AI to resolve conflict in {conflict.file_path}")
            response = self.ai_call_fn(
                "You are an expert code merge assistant. Be concise and precise.",
                prompt,
            )
            self._call_count += 1
            self._total_tokens += context.estimated_tokens + len(response) // 4

            # Parse response
            merged_code = self._extract_code_block(response, context.language)

            if merged_code:
                return MergeResult(
                    decision=MergeDecision.AI_MERGED,
                    file_path=conflict.file_path,
                    merged_content=merged_code,
                    conflicts_resolved=[conflict],
                    ai_calls_made=1,
                    tokens_used=context.estimated_tokens,
                    explanation=f"AI resolved conflict at {conflict.location}",
                )
            else:
                logger.warning("Could not parse AI response")
                return MergeResult(
                    decision=MergeDecision.NEEDS_HUMAN_REVIEW,
                    file_path=conflict.file_path,
                    explanation="Could not parse AI merge response",
                    conflicts_remaining=[conflict],
                    ai_calls_made=1,
                    tokens_used=context.estimated_tokens,
                )

        except Exception as e:
            logger.error(f"AI call failed: {e}")
            return MergeResult(
                decision=MergeDecision.FAILED,
                file_path=conflict.file_path,
                error=str(e),
                conflicts_remaining=[conflict],
            )

    def _extract_code_block(self, response: str, language: str) -> Optional[str]:
        """Extract code block from AI response."""
        # Try to find fenced code block
        patterns = [
            rf"```{language}\n(.*?)```",
            rf"```{language.lower()}\n(.*?)```",
            r"```\n(.*?)```",
            r"```(.*?)```",
        ]

        for pattern in patterns:
            match = re.search(pattern, response, re.DOTALL)
            if match:
                return match.group(1).strip()

        # If no code block, check if the entire response looks like code
        lines = response.strip().split("\n")
        if lines and not lines[0].startswith("```"):
            # Assume entire response is code if it looks like it
            if self._looks_like_code(response, language):
                return response.strip()

        return None

    def _looks_like_code(self, text: str, language: str) -> bool:
        """Heuristic to check if text looks like code."""
        indicators = {
            "python": ["def ", "import ", "class ", "if ", "for "],
            "javascript": ["function", "const ", "let ", "var ", "import ", "export "],
            "typescript": ["function", "const ", "let ", "interface ", "type ", "import "],
            "tsx": ["function", "const ", "return ", "import ", "export ", "<"],
            "jsx": ["function", "const ", "return ", "import ", "export ", "<"],
        }

        lang_indicators = indicators.get(language.lower(), [])
        if lang_indicators:
            return any(ind in text for ind in lang_indicators)

        # Generic code indicators
        return any(ind in text for ind in ["=", "(", ")", "{", "}", "import", "def", "function"])

    def resolve_multiple_conflicts(
        self,
        conflicts: list[ConflictRegion],
        baseline_codes: dict[str, str],
        task_snapshots: list[TaskSnapshot],
        batch: bool = True,
    ) -> list[MergeResult]:
        """
        Resolve multiple conflicts.

        Args:
            conflicts: List of conflicts to resolve
            baseline_codes: Map of location -> baseline code
            task_snapshots: All task snapshots
            batch: Whether to batch conflicts (reduces API calls)

        Returns:
            List of MergeResults
        """
        results = []

        if batch and len(conflicts) > 1:
            # Try to batch conflicts from the same file
            by_file: dict[str, list[ConflictRegion]] = {}
            for conflict in conflicts:
                if conflict.file_path not in by_file:
                    by_file[conflict.file_path] = []
                by_file[conflict.file_path].append(conflict)

            for file_path, file_conflicts in by_file.items():
                if len(file_conflicts) == 1:
                    # Single conflict, resolve individually
                    baseline = baseline_codes.get(file_conflicts[0].location, "")
                    results.append(self.resolve_conflict(
                        file_conflicts[0], baseline, task_snapshots
                    ))
                else:
                    # Multiple conflicts in same file - batch resolve
                    result = self._resolve_file_batch(
                        file_path, file_conflicts, baseline_codes, task_snapshots
                    )
                    results.append(result)
        else:
            # Resolve each individually
            for conflict in conflicts:
                baseline = baseline_codes.get(conflict.location, "")
                results.append(self.resolve_conflict(
                    conflict, baseline, task_snapshots
                ))

        return results

    def _resolve_file_batch(
        self,
        file_path: str,
        conflicts: list[ConflictRegion],
        baseline_codes: dict[str, str],
        task_snapshots: list[TaskSnapshot],
    ) -> MergeResult:
        """
        Resolve multiple conflicts in the same file with a single AI call.

        This is more efficient but may be less precise.
        """
        if not self.ai_call_fn:
            return MergeResult(
                decision=MergeDecision.NEEDS_HUMAN_REVIEW,
                file_path=file_path,
                explanation="No AI function configured",
                conflicts_remaining=conflicts,
            )

        # Combine contexts
        all_contexts = []
        for conflict in conflicts:
            baseline = baseline_codes.get(conflict.location, "")
            ctx = self.build_context(conflict, baseline, task_snapshots)
            all_contexts.append(ctx)

        # Check combined token limit
        total_tokens = sum(ctx.estimated_tokens for ctx in all_contexts)
        if total_tokens > self.max_context_tokens:
            # Too big to batch, fall back to individual resolution
            results = []
            for conflict in conflicts:
                baseline = baseline_codes.get(conflict.location, "")
                results.append(self.resolve_conflict(conflict, baseline, task_snapshots))

            # Combine results
            merged = results[0]
            for r in results[1:]:
                merged.conflicts_resolved.extend(r.conflicts_resolved)
                merged.conflicts_remaining.extend(r.conflicts_remaining)
                merged.ai_calls_made += r.ai_calls_made
                merged.tokens_used += r.tokens_used
            return merged

        # Build combined prompt
        combined_context = "\n\n---\n\n".join(
            ctx.to_prompt_context() for ctx in all_contexts
        )

        language = all_contexts[0].language if all_contexts else "text"

        batch_prompt = f'''You are a code merge assistant. Your task is to merge changes from multiple development tasks.

There are {len(conflicts)} conflict regions in {file_path}. Resolve each one.

{combined_context}

For each conflict region, output the merged code in a separate code block labeled with the location:

## Location: <location>
```{language}
merged code
```

Resolve all conflicts now:'''

        try:
            response = self.ai_call_fn(
                "You are an expert code merge assistant. Be concise and precise.",
                batch_prompt,
            )
            self._call_count += 1
            self._total_tokens += total_tokens + len(response) // 4

            # Parse batch response
            # This is a simplified parser - production would be more robust
            resolved = []
            remaining = []

            for conflict in conflicts:
                # Try to find the resolution for this location
                pattern = rf"## Location: {re.escape(conflict.location)}.*?```{language}\n(.*?)```"
                match = re.search(pattern, response, re.DOTALL)

                if match:
                    resolved.append(conflict)
                else:
                    remaining.append(conflict)

            # Return combined result
            if resolved:
                return MergeResult(
                    decision=MergeDecision.AI_MERGED if not remaining else MergeDecision.NEEDS_HUMAN_REVIEW,
                    file_path=file_path,
                    merged_content=response,  # Full response for manual extraction
                    conflicts_resolved=resolved,
                    conflicts_remaining=remaining,
                    ai_calls_made=1,
                    tokens_used=total_tokens,
                    explanation=f"Batch resolved {len(resolved)}/{len(conflicts)} conflicts",
                )
            else:
                return MergeResult(
                    decision=MergeDecision.NEEDS_HUMAN_REVIEW,
                    file_path=file_path,
                    explanation="Could not parse batch AI response",
                    conflicts_remaining=conflicts,
                    ai_calls_made=1,
                    tokens_used=total_tokens,
                )

        except Exception as e:
            logger.error(f"Batch AI call failed: {e}")
            return MergeResult(
                decision=MergeDecision.FAILED,
                file_path=file_path,
                error=str(e),
                conflicts_remaining=conflicts,
            )

    def can_resolve(self, conflict: ConflictRegion) -> bool:
        """
        Check if this resolver should handle a conflict.

        Only handles conflicts that need AI resolution.
        """
        return (
            conflict.merge_strategy in {MergeStrategy.AI_REQUIRED, None}
            and conflict.severity in {ConflictSeverity.MEDIUM, ConflictSeverity.HIGH}
            and self.ai_call_fn is not None
        )


def create_claude_resolver() -> AIResolver:
    """
    Create an AIResolver configured to use Claude via the Agent SDK.

    Uses the same OAuth token pattern as the rest of the auto-claude framework.

    Returns:
        Configured AIResolver
    """
    import asyncio
    import os
    import sys

    oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if not oauth_token:
        logger.warning("CLAUDE_CODE_OAUTH_TOKEN not set, AI resolution unavailable")
        return AIResolver()

    try:
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
    except ImportError:
        logger.warning("claude_agent_sdk not installed, AI resolution unavailable")
        return AIResolver()

    def call_claude(system: str, user: str) -> str:
        """Call Claude using the Agent SDK for merge resolution."""

        async def _run_merge() -> str:
            # Create a minimal client for merge resolution
            client = ClaudeSDKClient(
                options=ClaudeAgentOptions(
                    model="sonnet",
                    system_prompt=system,
                    allowed_tools=[],  # No tools needed for merge
                    max_turns=1,
                )
            )

            try:
                # Use async context manager to handle connect/disconnect
                # This is the standard pattern used throughout the codebase
                async with client:
                    await client.query(user)

                    response_text = ""
                    async for msg in client.receive_response():
                        msg_type = type(msg).__name__
                        if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                            for block in msg.content:
                                if hasattr(block, "text"):
                                    response_text += block.text

                    logger.info(f"AI merge response: {len(response_text)} chars")
                    return response_text

            except Exception as e:
                logger.error(f"Claude SDK call failed: {e}")
                print(f"    [ERROR] Claude SDK error: {e}", file=sys.stderr)
                return ""

        try:
            return asyncio.run(_run_merge())
        except Exception as e:
            logger.error(f"asyncio.run failed: {e}")
            print(f"    [ERROR] asyncio error: {e}", file=sys.stderr)
            return ""

    logger.info("Using Claude Agent SDK for merge resolution")
    return AIResolver(ai_call_fn=call_claude)
