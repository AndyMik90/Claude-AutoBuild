"""
AI Merge Prompt Templates
=========================

Templates for providing rich context to the AI merge resolver,
using the FileTimelineTracker's complete file evolution data.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .file_timeline import MergeContext


def build_timeline_merge_prompt(context: MergeContext) -> str:
    """
    Build a complete merge prompt using FileTimelineTracker context.

    This provides the AI with full situational awareness:
    - Task's starting point (branch point)
    - Complete main branch evolution since branch
    - Task's intent and changes
    - Other pending tasks that will merge later

    Args:
        context: MergeContext from FileTimelineTracker.get_merge_context()

    Returns:
        Formatted prompt string for AI merge resolution
    """
    # Build main evolution section
    main_evolution_section = _build_main_evolution_section(context)

    # Build pending tasks section
    pending_tasks_section = _build_pending_tasks_section(context)

    prompt = f"""MERGING: {context.file_path}
TASK: {context.task_id} ({context.task_intent.title})

{"=" * 79}

TASK'S STARTING POINT
Branched from commit: {context.task_branch_point.commit_hash[:12]}
Branched at: {context.task_branch_point.timestamp}
{"─" * 79}
```
{context.task_branch_point.content}
```

{"=" * 79}

{main_evolution_section}

CURRENT MAIN CONTENT (commit {context.current_main_commit[:12]}):
{"─" * 79}
```
{context.current_main_content}
```

{"=" * 79}

TASK'S CHANGES
Intent: "{context.task_intent.description or context.task_intent.title}"
{"─" * 79}
```
{context.task_worktree_content}
```

{"=" * 79}

{pending_tasks_section}

YOUR TASK:

1. Merge {context.task_id}'s changes into the current main version

2. PRESERVE all changes from main branch commits listed above
   - Every human commit since the task branched must be retained
   - Every previously merged task's changes must be retained

3. APPLY {context.task_id}'s changes
   - Intent: {context.task_intent.description or context.task_intent.title}
   - The task's changes should achieve its stated intent

4. ENSURE COMPATIBILITY with pending tasks
   {_build_compatibility_instructions(context)}

5. OUTPUT only the complete merged file content

{"=" * 79}
"""

    return prompt


def _build_main_evolution_section(context: MergeContext) -> str:
    """Build the main branch evolution section of the prompt."""
    if not context.main_evolution:
        return f"""MAIN BRANCH EVOLUTION (0 commits since task branched)
{"─" * 79}
No changes have been made to main branch since this task started.
"""

    lines = [
        f"MAIN BRANCH EVOLUTION ({len(context.main_evolution)} commits since task branched)"
    ]
    lines.append("─" * 79)
    lines.append("")

    for event in context.main_evolution:
        source_label = event.source.upper()
        if event.source == "merged_task" and event.merged_from_task:
            source_label = f"MERGED FROM {event.merged_from_task}"

        lines.append(
            f'COMMIT {event.commit_hash[:12]} [{source_label}]: "{event.commit_message}"'
        )
        lines.append(f"Timestamp: {event.timestamp}")

        if event.diff_summary:
            lines.append(f"Changes: {event.diff_summary}")
        else:
            lines.append("Changes: See content evolution below")

        lines.append("")

    return "\n".join(lines)


def _build_pending_tasks_section(context: MergeContext) -> str:
    """Build the other pending tasks section."""
    separator = "─" * 79
    if not context.other_pending_tasks:
        return f"""OTHER TASKS MODIFYING THIS FILE
{separator}
No other tasks are pending for this file.
"""

    lines = ["OTHER TASKS ALSO MODIFYING THIS FILE (not yet merged)"]
    lines.append("─" * 79)
    lines.append("")

    for task in context.other_pending_tasks:
        task_id = task.get("task_id", "unknown")
        intent = task.get("intent", "No intent specified")
        branch_point = task.get("branch_point", "unknown")[:12]
        commits_behind = task.get("commits_behind", 0)

        lines.append(
            f"• {task_id} (branched at {branch_point}, {commits_behind} commits behind)"
        )
        lines.append(f'  Intent: "{intent}"')
        lines.append("")

    return "\n".join(lines)


def _build_compatibility_instructions(context: MergeContext) -> str:
    """Build compatibility instructions based on pending tasks."""
    if not context.other_pending_tasks:
        return "- No other tasks pending for this file"

    lines = [
        f"- {len(context.other_pending_tasks)} other task(s) will merge after this"
    ]
    lines.append("   - Structure your merge to accommodate their upcoming changes:")

    for task in context.other_pending_tasks:
        task_id = task.get("task_id", "unknown")
        intent = task.get("intent", "")
        if intent:
            lines.append(f"     - {task_id}: {intent[:80]}...")
        else:
            lines.append(f"     - {task_id}")

    return "\n".join(lines)


def build_simple_merge_prompt(
    file_path: str,
    main_content: str,
    worktree_content: str,
    base_content: str | None,
    spec_name: str,
    language: str,
    task_intent: dict | None = None,
) -> str:
    """
    Build a simple three-way merge prompt (fallback when timeline not available).

    This is the traditional merge prompt without full timeline context.
    """
    intent_section = ""
    if task_intent:
        intent_section = f"""
=== FEATURE BRANCH INTENT ({spec_name}) ===
Task: {task_intent.get("title", spec_name)}
Description: {task_intent.get("description", "No description")}
"""
        if task_intent.get("spec_summary"):
            intent_section += f"Summary: {task_intent['spec_summary']}\n"

    base_section = (
        base_content if base_content else "(File did not exist in common ancestor)"
    )

    prompt = f"""You are a code merge expert. Merge the following conflicting versions of a file.

FILE: {file_path}

The file was modified in both the main branch and in the "{spec_name}" feature branch.
Your task is to produce a merged version that incorporates ALL changes from both branches.
{intent_section}
=== COMMON ANCESTOR (base) ===
{base_section}

=== MAIN BRANCH VERSION ===
{main_content}

=== FEATURE BRANCH VERSION ({spec_name}) ===
{worktree_content}

MERGE RULES:
1. Keep ALL imports from both versions
2. Keep ALL new functions/components from both versions
3. If the same function was modified differently, combine the changes logically
4. Preserve the intent of BOTH branches - main's changes are important too
5. If there's a genuine semantic conflict (same thing done differently), prefer the feature branch version but include main's additions
6. The merged code MUST be syntactically valid {language}

Output ONLY the merged code, wrapped in triple backticks:
```{language}
merged code here
```
"""
    return prompt


def build_conflict_only_prompt(
    file_path: str,
    conflicts: list[dict],
    spec_name: str,
    language: str,
    task_intent: dict | None = None,
) -> str:
    """
    Build a focused prompt that only asks AI to resolve specific conflict regions.

    This is MUCH more efficient than sending entire files - the AI only needs
    to resolve the actual conflicting lines, not regenerate thousands of lines.

    Args:
        file_path: Path to the file being merged
        conflicts: List of conflict dicts with keys:
            - id: Unique conflict identifier (e.g., "CONFLICT_1")
            - main_lines: Lines from main branch (the <<<<<<< section)
            - worktree_lines: Lines from feature branch (the >>>>>>> section)
            - context_before: Few lines before the conflict for context
            - context_after: Few lines after the conflict for context
        spec_name: Name of the feature branch/spec
        language: Programming language
        task_intent: Optional dict with title, description, spec_summary

    Returns:
        Focused prompt asking AI to resolve only the conflict regions
    """
    intent_section = ""
    if task_intent:
        intent_section = f"""
FEATURE INTENT: {task_intent.get("title", spec_name)}
{task_intent.get("description", "")}
"""

    conflict_sections = []
    for i, conflict in enumerate(conflicts, 1):
        context_before = conflict.get("context_before", "")
        context_after = conflict.get("context_after", "")
        main_lines = conflict.get("main_lines", "")
        worktree_lines = conflict.get("worktree_lines", "")
        conflict_id = conflict.get("id", f"CONFLICT_{i}")

        section = f"""
--- {conflict_id} ---
{f"CONTEXT BEFORE:{chr(10)}{context_before}{chr(10)}" if context_before else ""}
MAIN BRANCH VERSION:
```{language}
{main_lines}
```

FEATURE BRANCH VERSION ({spec_name}):
```{language}
{worktree_lines}
```
{f"{chr(10)}CONTEXT AFTER:{chr(10)}{context_after}" if context_after else ""}
"""
        conflict_sections.append(section)

    all_conflicts = "\n".join(conflict_sections)

    prompt = f"""You are a code merge expert. Resolve the following {len(conflicts)} conflict(s) in {file_path}.
{intent_section}
FILE: {file_path}
LANGUAGE: {language}

{all_conflicts}

MERGE RULES:
1. Keep ALL necessary code from both versions
2. Combine changes logically - don't lose functionality from either branch
3. If both branches add different things, include both
4. If both branches modify the same thing differently, prefer the feature branch but include main's additions
5. Output MUST be syntactically valid {language}

For EACH conflict, output the resolved code in this exact format:

--- {conflicts[0].get("id", "CONFLICT_1")} RESOLVED ---
```{language}
resolved code here
```

{"--- CONFLICT_2 RESOLVED ---" if len(conflicts) > 1 else ""}
{f"```{language}" if len(conflicts) > 1 else ""}
{"resolved code here" if len(conflicts) > 1 else ""}
{"```" if len(conflicts) > 1 else ""}

(continue for each conflict)
"""
    return prompt


def parse_conflict_markers(content: str) -> tuple[list[dict], list[str]]:
    """
    Parse a file with git conflict markers and extract conflict regions.

    Args:
        content: File content with git conflict markers

    Returns:
        Tuple of (conflicts, clean_sections) where:
        - conflicts: List of conflict dicts with main_lines, worktree_lines, etc.
        - clean_sections: List of non-conflicting parts of the file (for reassembly)
    """
    import re

    conflicts = []
    clean_sections = []

    # Pattern to match git conflict markers
    # <<<<<<< HEAD or <<<<<<< branch_name
    # content from current branch
    # =======
    # content from incoming branch
    # >>>>>>> branch_name or commit_hash
    conflict_pattern = re.compile(
        r"<<<<<<<[^\n]*\n"  # Start marker
        r"(.*?)"  # Main/HEAD content (group 1)
        r"=======\n"  # Separator
        r"(.*?)"  # Incoming/feature content (group 2)
        r">>>>>>>[^\n]*\n?",  # End marker
        re.DOTALL,
    )

    last_end = 0
    for i, match in enumerate(conflict_pattern.finditer(content), 1):
        # Get the clean section before this conflict
        clean_before = content[last_end : match.start()]
        clean_sections.append(clean_before)

        # Extract context (last 3 lines before conflict)
        before_lines = clean_before.rstrip().split("\n")
        context_before = (
            "\n".join(before_lines[-3:])
            if len(before_lines) >= 3
            else clean_before.rstrip()
        )

        # Extract the conflict content
        main_lines = match.group(1).rstrip("\n")
        worktree_lines = match.group(2).rstrip("\n")

        # Get context after (first 3 lines after conflict)
        after_start = match.end()
        after_content = content[after_start : after_start + 500]  # Look ahead 500 chars
        after_lines = after_content.split("\n")[:3]
        context_after = "\n".join(after_lines)

        conflicts.append(
            {
                "id": f"CONFLICT_{i}",
                "start": match.start(),
                "end": match.end(),
                "main_lines": main_lines,
                "worktree_lines": worktree_lines,
                "context_before": context_before,
                "context_after": context_after,
            }
        )

        last_end = match.end()

    # Add the final clean section after last conflict
    if last_end < len(content):
        clean_sections.append(content[last_end:])

    return conflicts, clean_sections


def reassemble_with_resolutions(
    original_content: str,
    conflicts: list[dict],
    resolutions: dict[str, str],
) -> str:
    """
    Reassemble a file by replacing conflict regions with AI resolutions.

    Args:
        original_content: File content with conflict markers
        conflicts: List of conflict dicts from parse_conflict_markers
        resolutions: Dict mapping conflict_id to resolved code

    Returns:
        Clean file with conflicts resolved
    """
    # Sort conflicts by start position (should already be sorted, but ensure it)
    sorted_conflicts = sorted(conflicts, key=lambda c: c["start"])

    result_parts = []
    last_end = 0

    for conflict in sorted_conflicts:
        # Add clean content before this conflict
        result_parts.append(original_content[last_end : conflict["start"]])

        # Add the resolution (or keep conflict if no resolution)
        conflict_id = conflict["id"]
        if conflict_id in resolutions:
            result_parts.append(resolutions[conflict_id])
        else:
            # Fallback: prefer feature branch version if no resolution
            result_parts.append(conflict["worktree_lines"])

        last_end = conflict["end"]

    # Add remaining content after last conflict
    result_parts.append(original_content[last_end:])

    return "".join(result_parts)


def extract_conflict_resolutions(
    response: str, conflicts: list[dict], language: str
) -> dict[str, str]:
    """
    Extract resolved code for each conflict from AI response.

    Args:
        response: AI response with resolved code blocks
        conflicts: List of conflict dicts (to get the IDs)
        language: Programming language for code block detection

    Returns:
        Dict mapping conflict_id to resolved code
    """
    import re

    resolutions = {}

    # Pattern to match resolution blocks
    # --- CONFLICT_1 RESOLVED --- or similar variations
    resolution_pattern = re.compile(
        r"---\s*(CONFLICT_\d+)\s*RESOLVED\s*---\s*\n" r"```(?:\w+)?\n" r"(.*?)" r"```",
        re.DOTALL | re.IGNORECASE,
    )

    for match in resolution_pattern.finditer(response):
        conflict_id = match.group(1).upper()
        resolved_code = match.group(2).rstrip("\n")
        resolutions[conflict_id] = resolved_code

    # Fallback: if only one conflict and we can find a single code block
    if len(conflicts) == 1 and not resolutions:
        code_block_pattern = re.compile(r"```(?:\w+)?\n(.*?)```", re.DOTALL)
        matches = list(code_block_pattern.finditer(response))
        if matches:
            # Use the first (or only) code block
            resolutions[conflicts[0]["id"]] = matches[0].group(1).rstrip("\n")

    return resolutions


def optimize_prompt_for_length(
    context: MergeContext,
    max_content_chars: int = 50000,
    max_evolution_events: int = 10,
) -> MergeContext:
    """
    Optimize a MergeContext for prompt length by trimming large content.

    For very long files or many commits, this summarizes the middle
    parts to keep the prompt within reasonable bounds.

    Args:
        context: Original MergeContext
        max_content_chars: Maximum characters for file content
        max_evolution_events: Maximum main branch events to include

    Returns:
        Modified MergeContext with trimmed content
    """
    # Trim main evolution to first N and last N events if too long
    if len(context.main_evolution) > max_evolution_events:
        half = max_evolution_events // 2
        first_events = context.main_evolution[:half]
        last_events = context.main_evolution[-half:]

        # Create a placeholder event for the middle
        from datetime import datetime

        from .file_timeline import MainBranchEvent

        omitted_count = len(context.main_evolution) - max_evolution_events
        placeholder = MainBranchEvent(
            commit_hash="...",
            timestamp=datetime.now(),
            content="[Content omitted for brevity]",
            source="human",
            commit_message=f"({omitted_count} commits omitted for brevity)",
        )

        context.main_evolution = first_events + [placeholder] + last_events

    # Trim content if too long
    def _trim_content(content: str, label: str) -> str:
        if len(content) > max_content_chars:
            half = max_content_chars // 2
            return (
                content[:half]
                + f"\n\n... [{label}: {len(content) - max_content_chars} chars omitted] ...\n\n"
                + content[-half:]
            )
        return content

    context.task_branch_point.content = _trim_content(
        context.task_branch_point.content, "branch point"
    )
    context.task_worktree_content = _trim_content(
        context.task_worktree_content, "worktree"
    )
    context.current_main_content = _trim_content(context.current_main_content, "main")

    return context
