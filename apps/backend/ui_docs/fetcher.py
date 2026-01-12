"""
UI Framework Documentation Fetcher
===================================

Automatically fetches UI framework documentation from multiple sources and caches it locally.
Enables autonomous agents to learn about UI components without asking users.

Priority order:
1. Context7 (LLM-optimized documentation)
2. Firecrawl (fallback scraping)
"""

import json
import os
from pathlib import Path
from typing import Optional

import requests


# UI Framework documentation URLs
FRAMEWORK_DOCS = {
    "Untitled UI": {
        "url": "https://www.untitledui.com/components",
        "context7_url": "https://context7.com/websites/untitledui_react/llms.txt?tokens=50000",
        "name": "untitled-ui",
        "description": "Premium design system with Figma components",
    },
    "shadcn/ui": {
        "url": "https://ui.shadcn.com/docs/components",
        "name": "shadcn-ui",
        "description": "Re-usable components built with Radix UI and Tailwind CSS",
    },
    "Material UI": {
        "url": "https://mui.com/material-ui/getting-started/",
        "name": "material-ui",
        "description": "React components for faster and easier web development",
    },
    "Chakra UI": {
        "url": "https://chakra-ui.com/docs/components",
        "name": "chakra-ui",
        "description": "Simple, modular and accessible component library",
    },
    "Ant Design": {
        "url": "https://ant.design/components/overview/",
        "name": "ant-design",
        "description": "Enterprise-class UI design language and React components",
    },
}


def get_cached_docs_path(framework_name: str, project_dir: Path) -> Optional[Path]:
    """
    Get path to cached UI framework documentation.

    Args:
        framework_name: Name of the UI framework (e.g., "Untitled UI", "shadcn/ui")
        project_dir: Project root directory

    Returns:
        Path to cached docs if they exist, None otherwise
    """
    if framework_name not in FRAMEWORK_DOCS:
        return None

    framework_slug = FRAMEWORK_DOCS[framework_name]["name"]
    docs_dir = project_dir / ".auto-claude" / "ui-framework-docs" / framework_slug
    docs_file = docs_dir / "components.md"

    if docs_file.exists():
        return docs_file

    return None


def fetch_from_context7(
    framework_info: dict, docs_dir: Path, framework_name: str
) -> tuple[bool, str]:
    """
    Fetch documentation from Context7 (LLM-optimized documentation).

    Args:
        framework_info: Framework configuration dict
        docs_dir: Directory to save documentation
        framework_name: Name of the framework

    Returns:
        Tuple of (success: bool, message: str)
    """
    context7_url = framework_info.get("context7_url")
    if not context7_url:
        return False, "No Context7 URL configured for this framework"

    try:
        print(f"Fetching {framework_name} documentation from Context7...")

        response = requests.get(context7_url, timeout=30)

        if response.status_code != 200:
            return (
                False,
                f"Context7 error: {response.status_code} - {response.text[:200]}",
            )

        markdown_content = response.text

        if not markdown_content or len(markdown_content) < 100:
            return False, "No valid content returned from Context7"

        # Save to file
        docs_file = docs_dir / "components.md"
        docs_file.write_text(markdown_content, encoding="utf-8")

        # Save metadata
        metadata = {
            "framework": framework_name,
            "source": "Context7",
            "url": context7_url,
            "description": framework_info["description"],
            "fetched_at": __import__("datetime").datetime.now().isoformat(),
        }
        metadata_file = docs_dir / "metadata.json"
        metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        print(
            f"✓ Successfully fetched {framework_name} documentation from Context7 ({len(markdown_content)} chars)"
        )
        return True, f"Documentation cached at {docs_file} (source: Context7)"

    except requests.exceptions.RequestException as e:
        return False, f"Network error fetching from Context7: {e}"
    except Exception as e:
        return False, f"Error fetching from Context7: {e}"


def fetch_from_firecrawl(
    framework_info: dict,
    docs_dir: Path,
    framework_name: str,
    firecrawl_api_key: str,
) -> tuple[bool, str]:
    """
    Fetch documentation using Firecrawl (fallback scraping).

    Args:
        framework_info: Framework configuration dict
        docs_dir: Directory to save documentation
        framework_name: Name of the framework
        firecrawl_api_key: Firecrawl API key

    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        print(
            f"Fetching {framework_name} documentation from {framework_info['url']} via Firecrawl..."
        )

        # Use Firecrawl scrape endpoint for single page
        response = requests.post(
            "https://api.firecrawl.dev/v1/scrape",
            headers={
                "Authorization": f"Bearer {firecrawl_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "url": framework_info["url"],
                "formats": ["markdown"],
                "onlyMainContent": True,
            },
            timeout=30,
        )

        if response.status_code != 200:
            return (
                False,
                f"Firecrawl API error: {response.status_code} - {response.text}",
            )

        data = response.json()

        if not data.get("success"):
            return False, f"Firecrawl failed: {data.get('error', 'Unknown error')}"

        markdown_content = data.get("data", {}).get("markdown", "")

        if not markdown_content:
            return False, "No markdown content returned from Firecrawl"

        # Save to file
        docs_file = docs_dir / "components.md"
        docs_file.write_text(markdown_content, encoding="utf-8")

        # Save metadata
        metadata = {
            "framework": framework_name,
            "source": "Firecrawl",
            "url": framework_info["url"],
            "description": framework_info["description"],
            "fetched_at": __import__("datetime").datetime.now().isoformat(),
        }
        metadata_file = docs_dir / "metadata.json"
        metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        print(
            f"✓ Successfully fetched {framework_name} documentation via Firecrawl ({len(markdown_content)} chars)"
        )
        return True, f"Documentation cached at {docs_file} (source: Firecrawl)"

    except requests.exceptions.RequestException as e:
        return False, f"Network error with Firecrawl: {e}"
    except Exception as e:
        return False, f"Error with Firecrawl: {e}"


def fetch_ui_framework_docs(
    framework_name: str, project_dir: Path, firecrawl_api_key: Optional[str] = None
) -> tuple[bool, str]:
    """
    Fetch UI framework documentation and cache it locally.

    Priority order:
    1. Context7 (if context7_url configured)
    2. Firecrawl (if FIRECRAWL_API_KEY available)

    Args:
        framework_name: Name of the UI framework (e.g., "Untitled UI")
        project_dir: Project root directory
        firecrawl_api_key: Firecrawl API key (optional, reads from env if not provided)

    Returns:
        Tuple of (success: bool, message: str)
    """
    # Check if framework is supported
    if framework_name not in FRAMEWORK_DOCS:
        return False, f"Framework '{framework_name}' is not supported for auto-fetch"

    framework_info = FRAMEWORK_DOCS[framework_name]
    framework_slug = framework_info["name"]

    # Check if docs already cached
    cached_path = get_cached_docs_path(framework_name, project_dir)
    if cached_path:
        return True, f"Documentation already cached at {cached_path}"

    # Create docs directory
    docs_dir = project_dir / ".auto-claude" / "ui-framework-docs" / framework_slug
    docs_dir.mkdir(parents=True, exist_ok=True)

    errors = []

    # Try Context7 first (priority source for LLM-optimized docs)
    if framework_info.get("context7_url"):
        success, message = fetch_from_context7(framework_info, docs_dir, framework_name)
        if success:
            return True, message
        errors.append(f"Context7: {message}")

    # Fall back to Firecrawl
    api_key = firecrawl_api_key or os.environ.get("FIRECRAWL_API_KEY")
    if api_key:
        success, message = fetch_from_firecrawl(
            framework_info, docs_dir, framework_name, api_key
        )
        if success:
            return True, message
        errors.append(f"Firecrawl: {message}")
    else:
        errors.append(
            "Firecrawl: FIRECRAWL_API_KEY not set (set in .env to enable fallback)"
        )

    # All methods failed
    error_summary = "\n".join(f"  - {e}" for e in errors)
    return (
        False,
        f"Failed to fetch {framework_name} documentation:\n{error_summary}",
    )


def ensure_ui_docs_available(
    framework_name: str, project_dir: Path
) -> tuple[bool, Optional[Path], str]:
    """
    Ensure UI framework documentation is available, fetching if necessary.

    This is the main entry point for agents - call this before planning/coding
    to ensure docs are ready.

    Args:
        framework_name: Name of the UI framework
        project_dir: Project root directory

    Returns:
        Tuple of (success: bool, docs_path: Optional[Path], message: str)
    """
    # Check if already cached
    cached_path = get_cached_docs_path(framework_name, project_dir)
    if cached_path:
        return True, cached_path, f"Using cached documentation at {cached_path}"

    # Try to fetch
    success, message = fetch_ui_framework_docs(framework_name, project_dir)
    if success:
        docs_path = get_cached_docs_path(framework_name, project_dir)
        return True, docs_path, message

    return False, None, message
