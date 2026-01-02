"""
Morph Fast Apply Tools
=======================

Tools for AI-powered code editing using Morph Fast Apply API.

This module implements the edit_file tool pattern from Morph documentation:
https://docs.morphllm.com/guides/agent-tools

The tool uses a "lazy marker" format where unchanged code is represented
with `// ... existing code ...` comments, allowing efficient partial edits
without sending the entire file content in the code_edit parameter.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

try:
    from claude_agent_sdk import tool

    _sdk_tools_available = True
except ImportError:
    _sdk_tools_available = False
    tool = None

from services.morph_client import (  # noqa: E402  # type: ignore[reportImplicitRelativeImport]
    MorphAPIError,
    MorphClient,
    MorphConfig,
    MorphConnectionError,
    MorphTimeoutError,
)

logger = logging.getLogger(__name__)

# Maximum characters to include in error messages for transformed content
MAX_CONTENT_IN_ERROR = 500


def _truncate_content(content: str, max_chars: int = MAX_CONTENT_IN_ERROR) -> str:
    """
    Truncate content for inclusion in error messages.

    Args:
        content: The content to truncate
        max_chars: Maximum characters to include

    Returns:
        Truncated content with indicator if truncated
    """
    if len(content) <= max_chars:
        return content
    return content[:max_chars] + f"\n\n... [truncated, {len(content) - max_chars} more characters]"

# Tool description following Morph's edit_file pattern
# See: https://docs.morphllm.com/guides/agent-tools
MORPH_APPLY_DESCRIPTION = """Use this tool to make an edit to an existing file using Morph Fast Apply.

This will be processed by Morph's fast apply model, which quickly applies the edit at 10,500+ tokens/second with 98% accuracy. You should make it clear what the edit is, while minimizing the unchanged code you write.

When writing the code_edit, specify each edit in sequence using the special marker `... existing code ...` to represent unchanged code between edited sections. Use the appropriate comment syntax for the file's language:

- JavaScript/TypeScript/Java/C/C++/Go/Rust: `// ... existing code ...`
- Python/Ruby/Shell/YAML: `# ... existing code ...`
- HTML/XML: `<!-- ... existing code ... -->`
- CSS/SCSS: `/* ... existing code ... */`
- SQL: `-- ... existing code ...`

Example format (JavaScript):
```
// ... existing code ...
FIRST_EDIT
// ... existing code ...
SECOND_EDIT
// ... existing code ...
```

Example format (Python):
```
# ... existing code ...
FIRST_EDIT
# ... existing code ...
SECOND_EDIT
# ... existing code ...
```

Guidelines:
- Bias towards repeating as few lines of the original file as possible
- Each edit should contain sufficient context of unchanged lines to resolve ambiguity
- DO NOT omit code without using the appropriate `... existing code ...` marker or the model may delete those lines
- To delete a section, provide context before and after (e.g., `# ... existing code ...\nBlock1\nBlock3\n# ... existing code ...` removes Block2)
- Make all edits to a file in a single call - the model handles multiple distinct edits well
- Use first person in instructions (e.g., "I will add error handling")

The tool reads the file, applies your edit via Morph API, and writes the result back."""


def create_morph_tools(spec_dir: Path, project_dir: Path) -> list[Any]:
    """
    Create Morph Fast Apply tools.

    Args:
        spec_dir: Path to the spec directory (unused, kept for API consistency
                  with other tool creators like create_progress_tools, etc.)
        project_dir: Path to the project root

    Returns:
        List of Morph tool functions
    """
    # spec_dir is intentionally unused - kept for API consistency with other tool creators
    _ = spec_dir

    if not _sdk_tools_available or tool is None:
        return []

    tools: list[Any] = []

    # -------------------------------------------------------------------------
    # Tool: MorphApply (edit_file)
    # Follows the Morph edit_file tool pattern from:
    # https://docs.morphllm.com/guides/agent-tools
    # -------------------------------------------------------------------------
    @tool(
        "MorphApply",
        MORPH_APPLY_DESCRIPTION,
        {
            "target_filepath": str,
            "instruction": str,
            "code_edit": str,
        },
    )
    async def morph_apply(args: dict[str, Any]) -> dict[str, Any]:
        """Apply code edits using Morph Fast Apply."""
        target_file = args.get("target_filepath", "")
        instruction = args.get("instruction", "")
        code_edit = args.get("code_edit", "")

        # Validate required arguments
        if not target_file:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: target_filepath is required",
                    }
                ]
            }

        if not instruction:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: instruction is required (describe what changes to make in first person, e.g., 'I will add error handling')",
                    }
                ]
            }

        if not code_edit:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: code_edit is required (the code changes with `// ... existing code ...` markers for unchanged sections)",
                    }
                ]
            }

        # Resolve file path relative to project directory
        file_path = Path(target_file)
        if not file_path.is_absolute():
            file_path = project_dir / target_file

        # Security: Prevent path traversal attacks
        # Resolve to absolute path and verify it's within project directory
        try:
            resolved_path = file_path.resolve()
            project_resolved = project_dir.resolve()

            # Check that the resolved path is within the project directory
            if not str(resolved_path).startswith(str(project_resolved) + os.sep) and resolved_path != project_resolved:
                logger.warning(
                    f"Path traversal attempt blocked: {target_file} resolves to {resolved_path} "
                    + f"which is outside project directory {project_resolved}"
                )
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                f"Error: Path '{target_file}' is outside the project directory. "
                                f"File operations are restricted to the project folder for security."
                            ),
                        }
                    ]
                }
            file_path = resolved_path
        except (OSError, ValueError) as e:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Invalid file path '{target_file}': {str(e)}",
                    }
                ]
            }

        # Read the original file content
        try:
            original_content = file_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: File not found: {target_file}",
                    }
                ]
            }
        except PermissionError:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Permission denied reading file: {target_file}",
                    }
                ]
            }
        except Exception as e:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Failed to read file {target_file}: {str(e)}",
                    }
                ]
            }

        # Detect language from file extension
        language = _detect_language(file_path)

        # Create Morph client and apply the edit
        try:
            config = MorphConfig.from_env()
            if not config.has_api_key():
                return {
                    "content": [
                        {
                            "type": "text",
                            "text": "Error: MORPH_API_KEY not configured. Cannot use Morph Fast Apply.",
                        }
                    ]
                }

            async with MorphClient(config) as client:
                # Apply the edit using the proper Morph API format:
                # <instruction> + <code> (original) + <update> (code_edit with lazy markers)
                result = await client.apply(
                    file_path=str(target_file),
                    original_content=original_content,
                    instruction=instruction,
                    code_edit=code_edit,
                    language=language,
                )

                if result.success:
                    # Write the transformed content back to the file
                    try:
                        file_path.write_text(result.new_content, encoding="utf-8")
                    except PermissionError:
                        # Truncate content to avoid bloating error messages
                        truncated = _truncate_content(result.new_content)
                        return {
                            "content": [
                                {
                                    "type": "text",
                                    "text": (
                                        f"Error: Permission denied writing to file: {target_file}. "
                                        f"Edit was computed but could not be saved.\n\n"
                                        f"Transformed content (preview):\n\n{truncated}"
                                    ),
                                }
                            ]
                        }
                    except Exception as e:
                        # Truncate content to avoid bloating error messages
                        truncated = _truncate_content(result.new_content)
                        return {
                            "content": [
                                {
                                    "type": "text",
                                    "text": (
                                        f"Error: Failed to write file {target_file}: {str(e)}. "
                                        f"Edit was computed but could not be saved.\n\n"
                                        f"Transformed content (preview):\n\n{truncated}"
                                    ),
                                }
                            ]
                        }

                    # Build success message with change summary
                    change_summary = f"+{result.lines_added}/-{result.lines_removed} lines"
                    usage_info = ""
                    if result.usage.total_tokens > 0:
                        usage_info = f" ({result.usage.total_tokens} tokens)"

                    return {
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    f"Successfully applied edits to {target_file}\n"
                                    f"Changes: {change_summary}{usage_info}"
                                ),
                            }
                        ]
                    }
                else:
                    return {
                        "content": [
                            {
                                "type": "text",
                                "text": f"Error: Morph apply failed for {target_file}",
                            }
                        ]
                    }

        except MorphAPIError as e:
            logger.error(f"Morph API error: {e}")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Morph API error - {e.message} (code: {e.code})",
                    }
                ]
            }
        except MorphConnectionError as e:
            logger.error(f"Morph connection error: {e}")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Cannot connect to Morph API - {str(e)}",
                    }
                ]
            }
        except MorphTimeoutError as e:
            logger.error(f"Morph timeout error: {e}")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Morph API request timed out - {str(e)}",
                    }
                ]
            }
        except Exception as e:
            logger.error(f"Unexpected error in MorphApply: {e}")
            return {
                "content": [
                    {
                        "type": "text",
                        "text": f"Error: Unexpected error - {str(e)}",
                    }
                ]
            }

    tools.append(morph_apply)

    return tools


def _detect_language(file_path: Path) -> str | None:
    """
    Detect programming language from file extension.

    Args:
        file_path: Path to the file

    Returns:
        Language identifier string or None if unknown
    """
    extension_map = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".java": "java",
        ".kt": "kotlin",
        ".kts": "kotlin",
        ".go": "go",
        ".rs": "rust",
        ".rb": "ruby",
        ".php": "php",
        ".cs": "csharp",
        ".cpp": "cpp",
        ".cc": "cpp",
        ".cxx": "cpp",
        ".c": "c",
        ".h": "c",
        ".hpp": "cpp",
        ".swift": "swift",
        ".scala": "scala",
        ".r": "r",
        ".R": "r",
        ".sql": "sql",
        ".sh": "bash",
        ".bash": "bash",
        ".zsh": "zsh",
        ".ps1": "powershell",
        ".html": "html",
        ".htm": "html",
        ".css": "css",
        ".scss": "scss",
        ".sass": "sass",
        ".less": "less",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".xml": "xml",
        ".md": "markdown",
        ".markdown": "markdown",
        ".vue": "vue",
        ".svelte": "svelte",
    }
    return extension_map.get(file_path.suffix.lower())
