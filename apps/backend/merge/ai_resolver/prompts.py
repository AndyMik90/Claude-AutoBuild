"""
Prompt Templates
================

Prompt templates for AI-based conflict resolution.

This module contains the prompt templates used to guide the AI
in merging conflicting code changes.
"""

from __future__ import annotations

# System prompt for the AI
SYSTEM_PROMPT = "You are an expert code merge assistant. Be concise and precise."

# Main merge prompt template
MERGE_PROMPT_TEMPLATE = """You are a code merge assistant. Your task is to merge changes from multiple development tasks into a single coherent result.

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

Merge the code now:"""

# Batch merge prompt template for multiple conflicts in the same file
BATCH_MERGE_PROMPT_TEMPLATE = """You are a code merge assistant. Your task is to merge changes from multiple development tasks.

There are {num_conflicts} conflict regions in {file_path}. Resolve each one.

{combined_context}

For each conflict region, output the merged code in a separate code block labeled with the location:

## Location: <location>
```{language}
merged code
```

Resolve all conflicts now:"""


def format_merge_prompt(context: str, language: str) -> str:
    """
    Format the main merge prompt.

    Args:
        context: The conflict context to include
        language: Programming language for code block formatting

    Returns:
        Formatted prompt string
    """
    return MERGE_PROMPT_TEMPLATE.format(context=context, language=language)


def format_batch_merge_prompt(
    file_path: str,
    num_conflicts: int,
    combined_context: str,
    language: str,
) -> str:
    """
    Format the batch merge prompt for multiple conflicts.

    Args:
        file_path: Path to the file with conflicts
        num_conflicts: Number of conflicts to resolve
        combined_context: Combined context from all conflicts
        language: Programming language for code block formatting

    Returns:
        Formatted batch prompt string
    """
    return BATCH_MERGE_PROMPT_TEMPLATE.format(
        file_path=file_path,
        num_conflicts=num_conflicts,
        combined_context=combined_context,
        language=language,
    )
