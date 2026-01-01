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
from pathlib import Path
from typing import Any

try:
    from claude_agent_sdk import tool

    SDK_TOOLS_AVAILABLE = True
except ImportError:
    SDK_TOOLS_AVAILABLE = False
    tool = None

from services.morph_client import (
    MorphAPIError,
    MorphClient,
    MorphConfig,
    MorphConnectionError,
    MorphTimeoutError,
)

logger = logging.getLogger(__name__)

# Tool description following Morph's edit_file pattern
# See: https://docs.morphllm.com/guides/agent-tools
MORPH_APPLY_DESCRIPTION = """Use this tool to make an edit to an existing file using Morph Fast Apply.

This will be processed by Morph's fast apply model, which quickly applies the edit at 10,500+ tokens/second with 98% accuracy. You should make it clear what the edit is, while minimizing the unchanged code you write.

When writing the code_edit, specify each edit in sequence using the special comment `// ... existing code ...` to represent unchanged code between edited sections.

Example format:
```
// ... existing code ...
FIRST_EDIT
// ... existing code ...
SECOND_EDIT
// ... existing code ...
```

Guidelines:
- Bias towards repeating as few lines of the original file as possible
- Each edit should contain sufficient context of unchanged lines to resolve ambiguity
- DO NOT omit code without using `// ... existing code ...` or the model may delete those lines
- To delete a section, provide context before and after (e.g., `// ... existing code ...\nBlock1\nBlock3\n// ... existing code ...` removes Block2)
- Make all edits to a file in a single call - the model handles multiple distinct edits well
- Use first person in instructions (e.g., "I will add error handling")

The tool reads the file, applies your edit via Morph API, and writes the result back."""


def create_morph_tools(spec_dir: Path, project_dir: Path) -> list:
    """
    Create Morph Fast Apply tools.

    Args:
        spec_dir: Path to the spec directory
        project_dir: Path to the project root

    Returns:
        List of Morph tool functions
    """
    if not SDK_TOOLS_AVAILABLE:
        return []

    tools = []

    # -------------------------------------------------------------------------
    # Tool: MorphApply (edit_file)
    # Follows the Morph edit_file tool pattern from:
    # https://docs.morphllm.com/guides/agent-tools
    # -------------------------------------------------------------------------
    @tool(
        "MorphApply",
        MORPH_APPLY_DESCRIPTION,
        {
            "target_file": str,
            "instruction": str,
            "code_edit": str,
        },
    )
    async def morph_apply(args: dict[str, Any]) -> dict[str, Any]:
        """Apply code edits using Morph Fast Apply."""
        target_file = args.get("target_file", "")
        instruction = args.get("instruction", "")
        code_edit = args.get("code_edit", "")

        # Validate required arguments
        if not target_file:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": "Error: target_file is required",
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

            with MorphClient(config) as client:
                # Apply the edit using the proper Morph API format:
                # <instruction> + <code> (original) + <update> (code_edit with lazy markers)
                result = client.apply(
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
                        return {
                            "content": [
                                {
                                    "type": "text",
                                    "text": f"Error: Permission denied writing to file: {target_file}. "
                                    f"Edit was computed but could not be saved.\n\n"
                                    f"Transformed content:\n\n{result.new_content}",
                                }
                            ]
                        }
                    except Exception as e:
                        return {
                            "content": [
                                {
                                    "type": "text",
                                    "text": f"Error: Failed to write file {target_file}: {str(e)}. "
                                    f"Edit was computed but could not be saved.\n\n"
                                    f"Transformed content:\n\n{result.new_content}",
                                }
                            ]
                        }

                    return {
                        "content": [
                            {
                                "type": "text",
                                "text": f"Successfully applied edits to {target_file}",
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
