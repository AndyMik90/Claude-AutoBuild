"""
AI Merge Prompt Templates
=========================

Templates for providing rich context to the AI merge resolver,
using the FileTimelineTracker's complete file evolution data.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .file_timeline import MergeContext, MainBranchEvent


def build_timeline_merge_prompt(context: "MergeContext") -> str:
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

    prompt = f'''MERGING: {context.file_path}
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
'''

    return prompt


def _build_main_evolution_section(context: "MergeContext") -> str:
    """Build the main branch evolution section of the prompt."""
    if not context.main_evolution:
        return f"""MAIN BRANCH EVOLUTION (0 commits since task branched)
{"─" * 79}
No changes have been made to main branch since this task started.
"""

    lines = [f"MAIN BRANCH EVOLUTION ({len(context.main_evolution)} commits since task branched)"]
    lines.append("─" * 79)
    lines.append("")

    for event in context.main_evolution:
        source_label = event.source.upper()
        if event.source == 'merged_task' and event.merged_from_task:
            source_label = f"MERGED FROM {event.merged_from_task}"

        lines.append(f'COMMIT {event.commit_hash[:12]} [{source_label}]: "{event.commit_message}"')
        lines.append(f"Timestamp: {event.timestamp}")

        if event.diff_summary:
            lines.append(f"Changes: {event.diff_summary}")
        else:
            lines.append("Changes: See content evolution below")

        lines.append("")

    return "\n".join(lines)


def _build_pending_tasks_section(context: "MergeContext") -> str:
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

        lines.append(f"• {task_id} (branched at {branch_point}, {commits_behind} commits behind)")
        lines.append(f'  Intent: "{intent}"')
        lines.append("")

    return "\n".join(lines)


def _build_compatibility_instructions(context: "MergeContext") -> str:
    """Build compatibility instructions based on pending tasks."""
    if not context.other_pending_tasks:
        return "- No other tasks pending for this file"

    lines = [f"- {len(context.other_pending_tasks)} other task(s) will merge after this"]
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
Task: {task_intent.get('title', spec_name)}
Description: {task_intent.get('description', 'No description')}
"""
        if task_intent.get('spec_summary'):
            intent_section += f"Summary: {task_intent['spec_summary']}\n"

    base_section = base_content if base_content else "(File did not exist in common ancestor)"

    prompt = f'''You are a code merge expert. Merge the following conflicting versions of a file.

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
'''
    return prompt


def optimize_prompt_for_length(
    context: "MergeContext",
    max_content_chars: int = 50000,
    max_evolution_events: int = 10,
) -> "MergeContext":
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
    context.current_main_content = _trim_content(
        context.current_main_content, "main"
    )

    return context
