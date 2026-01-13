"""
Backend Framework Documentation Fetcher
========================================

Automatically fetches backend framework documentation from multiple sources and caches it locally.
Enables autonomous agents to learn about WordPress, Laravel, Django APIs without asking users.

Priority order:
1. Context7 (LLM-optimized documentation)
2. Firecrawl (fallback scraping)
"""

import json
import os
from pathlib import Path
from typing import Optional

import requests


# Backend Framework documentation URLs
BACKEND_FRAMEWORK_DOCS = {
    "WordPress": {
        "url": "https://developer.wordpress.org/",
        "context7_url": None,  # TODO: Check if Context7 has WordPress docs
        "name": "wordpress",
        "description": "PHP CMS framework - WP-CLI, hooks, filters, database abstraction",
        "sections": [
            "https://developer.wordpress.org/plugins/",
            "https://developer.wordpress.org/themes/",
            "https://developer.wordpress.org/rest-api/",
            "https://make.wordpress.com/cli/handbook/",
        ],
    },
    "Laravel": {
        "url": "https://laravel.com/docs/11.x",
        "context7_url": None,  # TODO: Check if Context7 has Laravel docs
        "name": "laravel",
        "description": "PHP web framework - Eloquent ORM, Artisan CLI, Blade templates",
    },
    "Django": {
        "url": "https://docs.djangoproject.com/en/stable/",
        "context7_url": None,  # TODO: Check if Context7 has Django docs
        "name": "django",
        "description": "Python web framework - Django ORM, admin panel, migrations",
    },
    "FastAPI": {
        "url": "https://fastapi.tiangolo.com/",
        "context7_url": None,
        "name": "fastapi",
        "description": "Modern Python web framework - async, type hints, automatic OpenAPI",
    },
    "Symfony": {
        "url": "https://symfony.com/doc/current/index.html",
        "context7_url": None,
        "name": "symfony",
        "description": "PHP web framework - components, Doctrine ORM, Twig templates",
    },
}


def get_cached_docs_path(framework_name: str, project_dir: Path) -> Optional[Path]:
    """
    Get path to cached backend framework documentation.

    Args:
        framework_name: Name of the backend framework (e.g., "WordPress", "Laravel")
        project_dir: Project root directory

    Returns:
        Path to cached docs if they exist, None otherwise
    """
    if framework_name not in BACKEND_FRAMEWORK_DOCS:
        return None

    framework_slug = BACKEND_FRAMEWORK_DOCS[framework_name]["name"]
    docs_dir = project_dir / ".auto-claude" / "backend-framework-docs" / framework_slug
    docs_file = docs_dir / "docs.md"

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
        docs_file = docs_dir / "docs.md"
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

    For WordPress, fetches multiple sections (plugins, themes, REST API, WP-CLI).

    Args:
        framework_info: Framework configuration dict
        docs_dir: Directory to save documentation
        framework_name: Name of the framework
        firecrawl_api_key: Firecrawl API key

    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        # Get URLs to fetch - main URL + additional sections if configured
        urls_to_fetch = [framework_info["url"]]
        if "sections" in framework_info:
            urls_to_fetch.extend(framework_info["sections"])

        all_content = []
        total_chars = 0

        for url in urls_to_fetch:
            print(f"Fetching {framework_name} documentation from {url} via Firecrawl...")

            # Use Firecrawl scrape endpoint for single page
            response = requests.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers={
                    "Authorization": f"Bearer {firecrawl_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": url,
                    "formats": ["markdown"],
                    "onlyMainContent": True,
                },
                timeout=30,
            )

            if response.status_code != 200:
                print(f"  ⚠ Failed to fetch {url}: {response.status_code}")
                continue

            data = response.json()

            if not data.get("success"):
                print(f"  ⚠ Firecrawl failed for {url}: {data.get('error')}")
                continue

            markdown_content = data.get("data", {}).get("markdown", "")

            if markdown_content:
                all_content.append(f"# Documentation from {url}\n\n{markdown_content}")
                total_chars += len(markdown_content)
                print(f"  ✓ Fetched {len(markdown_content)} chars from {url}")

        if not all_content:
            return False, "No markdown content returned from Firecrawl for any URL"

        # Combine all content
        combined_content = "\n\n---\n\n".join(all_content)

        # Save to file
        docs_file = docs_dir / "docs.md"
        docs_file.write_text(combined_content, encoding="utf-8")

        # Save metadata
        metadata = {
            "framework": framework_name,
            "source": "Firecrawl",
            "urls": urls_to_fetch,
            "description": framework_info["description"],
            "fetched_at": __import__("datetime").datetime.now().isoformat(),
            "sections_fetched": len(all_content),
        }
        metadata_file = docs_dir / "metadata.json"
        metadata_file.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

        print(
            f"✓ Successfully fetched {framework_name} documentation via Firecrawl ({total_chars} chars from {len(all_content)} sections)"
        )
        return True, f"Documentation cached at {docs_file} (source: Firecrawl, {len(all_content)} sections)"

    except requests.exceptions.RequestException as e:
        return False, f"Network error with Firecrawl: {e}"
    except Exception as e:
        return False, f"Error with Firecrawl: {e}"


def fetch_backend_framework_docs(
    framework_name: str, project_dir: Path, firecrawl_api_key: Optional[str] = None
) -> tuple[bool, str]:
    """
    Fetch backend framework documentation and cache it locally.

    Priority order:
    1. Context7 (if context7_url configured)
    2. Firecrawl (if FIRECRAWL_API_KEY available)

    Args:
        framework_name: Name of the backend framework (e.g., "WordPress", "Laravel")
        project_dir: Project root directory
        firecrawl_api_key: Firecrawl API key (optional, reads from env if not provided)

    Returns:
        Tuple of (success: bool, message: str)
    """
    # Check if framework is supported
    if framework_name not in BACKEND_FRAMEWORK_DOCS:
        return False, f"Framework '{framework_name}' is not supported for auto-fetch"

    framework_info = BACKEND_FRAMEWORK_DOCS[framework_name]
    framework_slug = framework_info["name"]

    # Check if docs already cached
    cached_path = get_cached_docs_path(framework_name, project_dir)
    if cached_path:
        return True, f"Documentation already cached at {cached_path}"

    # Create docs directory
    docs_dir = project_dir / ".auto-claude" / "backend-framework-docs" / framework_slug
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


def ensure_backend_docs_available(
    framework_name: str, project_dir: Path
) -> tuple[bool, Optional[Path], str]:
    """
    Ensure backend framework documentation is available, fetching if necessary.

    This is the main entry point for agents - call this before planning/coding
    to ensure docs are ready.

    Args:
        framework_name: Name of the backend framework
        project_dir: Project root directory

    Returns:
        Tuple of (success: bool, docs_path: Optional[Path], message: str)
    """
    # Check if already cached
    cached_path = get_cached_docs_path(framework_name, project_dir)
    if cached_path:
        return True, cached_path, f"Using cached documentation at {cached_path}"

    # Try to fetch
    success, message = fetch_backend_framework_docs(framework_name, project_dir)
    if success:
        docs_path = get_cached_docs_path(framework_name, project_dir)
        return True, docs_path, message

    return False, None, message
