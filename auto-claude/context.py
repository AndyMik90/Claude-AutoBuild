#!/usr/bin/env python3
"""
Task Context Builder
====================

Builds focused context for a specific task by searching relevant services.
This is the "RAG-like" component that finds what files matter for THIS task.

Usage:
    # Find context for a task across specific services
    python auto-claude/context.py \
        --services backend,scraper \
        --keywords "retry,error,proxy" \
        --task "Add retry logic when proxies fail" \
        --output auto-claude/specs/001-retry/context.json

    # Use project index to auto-suggest services
    python auto-claude/context.py \
        --task "Add retry logic when proxies fail" \
        --output context.json

The context builder will:
1. Load project index (from analyzer)
2. Search specified services for relevant files
3. Find similar implementations to reference
4. Output focused context for AI agents
"""

import asyncio
import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Import graphiti providers for optional historical hints
try:
    from graphiti_providers import get_graph_hints, is_graphiti_enabled

    GRAPHITI_AVAILABLE = True
except ImportError:
    GRAPHITI_AVAILABLE = False

    def is_graphiti_enabled() -> bool:
        return False

    async def get_graph_hints(
        query: str, project_id: str, max_results: int = 10
    ) -> list:
        return []


# Directories to skip
SKIP_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "target",
    "vendor",
    ".idea",
    ".vscode",
    "auto-claude",
    ".pytest_cache",
    ".mypy_cache",
    "coverage",
    ".turbo",
    ".cache",
}

# File extensions to search
CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".svelte",
    ".go",
    ".rs",
    ".rb",
    ".php",
}


@dataclass
class FileMatch:
    """A file that matched the search criteria."""

    path: str
    service: str
    reason: str
    relevance_score: float = 0.0
    matching_lines: list[tuple[int, str]] = field(default_factory=list)


@dataclass
class TaskContext:
    """Complete context for a task."""

    task_description: str
    scoped_services: list[str]
    files_to_modify: list[dict]
    files_to_reference: list[dict]
    patterns_discovered: dict[str, str]
    service_contexts: dict[str, dict]
    graph_hints: list[dict] = field(
        default_factory=list
    )  # Historical hints from Graphiti


class ContextBuilder:
    """Builds task-specific context by searching the codebase."""

    def __init__(self, project_dir: Path, project_index: dict | None = None):
        self.project_dir = project_dir.resolve()
        self.project_index = project_index or self._load_project_index()

    async def _get_graph_hints(self, task: str) -> list[dict]:
        """Get historical hints from Graphiti knowledge graph.

        This provides context from past sessions and similar tasks.
        """
        if not is_graphiti_enabled():
            return []

        try:
            hints = await get_graph_hints(
                query=task,
                project_id=str(self.project_dir),
                max_results=5,
            )
            return hints
        except Exception:
            # Graphiti is optional - fail gracefully
            return []

    def _load_project_index(self) -> dict:
        """Load project index from file or create new one (.auto-claude is the installed instance)."""
        index_file = self.project_dir / ".auto-claude" / "project_index.json"
        if index_file.exists():
            with open(index_file) as f:
                return json.load(f)

        # Try to create one
        from analyzer import analyze_project

        return analyze_project(self.project_dir)

    def build_context(
        self,
        task: str,
        services: list[str] | None = None,
        keywords: list[str] | None = None,
        include_graph_hints: bool = True,
    ) -> TaskContext:
        """
        Build context for a specific task.

        Args:
            task: Description of the task
            services: List of service names to search (None = auto-detect)
            keywords: Additional keywords to search for
            include_graph_hints: Whether to include historical hints from Graphiti

        Returns:
            TaskContext with relevant files and patterns
        """
        # Auto-detect services if not specified
        if not services:
            services = self._suggest_services(task)

        # Extract keywords from task if not provided
        if not keywords:
            keywords = self._extract_keywords(task)

        # Search each service
        all_matches: list[FileMatch] = []
        service_contexts = {}

        for service_name in services:
            service_info = self.project_index.get("services", {}).get(service_name)
            if not service_info:
                continue

            service_path = Path(service_info.get("path", service_name))
            if not service_path.is_absolute():
                service_path = self.project_dir / service_path

            # Search this service
            matches = self._search_service(service_path, service_name, keywords)
            all_matches.extend(matches)

            # Load or generate service context
            service_contexts[service_name] = self._get_service_context(
                service_path, service_name, service_info
            )

        # Categorize matches
        files_to_modify, files_to_reference = self._categorize_matches(
            all_matches, task
        )

        # Discover patterns from reference files
        patterns = self._discover_patterns(files_to_reference, keywords)

        # Get graph hints (synchronously wrap async call)
        graph_hints = []
        if include_graph_hints and is_graphiti_enabled():
            try:
                # Run the async function in a new event loop if necessary
                try:
                    loop = asyncio.get_running_loop()
                    # We're already in an async context - this shouldn't happen in CLI
                    # but handle it gracefully
                    graph_hints = []
                except RuntimeError:
                    # No event loop running - create one
                    graph_hints = asyncio.run(self._get_graph_hints(task))
            except Exception:
                # Graphiti is optional - fail gracefully
                graph_hints = []

        return TaskContext(
            task_description=task,
            scoped_services=services,
            files_to_modify=[
                asdict(f) if isinstance(f, FileMatch) else f for f in files_to_modify
            ],
            files_to_reference=[
                asdict(f) if isinstance(f, FileMatch) else f for f in files_to_reference
            ],
            patterns_discovered=patterns,
            service_contexts=service_contexts,
            graph_hints=graph_hints,
        )

    async def build_context_async(
        self,
        task: str,
        services: list[str] | None = None,
        keywords: list[str] | None = None,
        include_graph_hints: bool = True,
    ) -> TaskContext:
        """
        Build context for a specific task (async version).

        This version is preferred when called from async code as it can
        properly await the graph hints retrieval.

        Args:
            task: Description of the task
            services: List of service names to search (None = auto-detect)
            keywords: Additional keywords to search for
            include_graph_hints: Whether to include historical hints from Graphiti

        Returns:
            TaskContext with relevant files and patterns
        """
        # Auto-detect services if not specified
        if not services:
            services = self._suggest_services(task)

        # Extract keywords from task if not provided
        if not keywords:
            keywords = self._extract_keywords(task)

        # Search each service
        all_matches: list[FileMatch] = []
        service_contexts = {}

        for service_name in services:
            service_info = self.project_index.get("services", {}).get(service_name)
            if not service_info:
                continue

            service_path = Path(service_info.get("path", service_name))
            if not service_path.is_absolute():
                service_path = self.project_dir / service_path

            # Search this service
            matches = self._search_service(service_path, service_name, keywords)
            all_matches.extend(matches)

            # Load or generate service context
            service_contexts[service_name] = self._get_service_context(
                service_path, service_name, service_info
            )

        # Categorize matches
        files_to_modify, files_to_reference = self._categorize_matches(
            all_matches, task
        )

        # Discover patterns from reference files
        patterns = self._discover_patterns(files_to_reference, keywords)

        # Get graph hints asynchronously
        graph_hints = []
        if include_graph_hints:
            graph_hints = await self._get_graph_hints(task)

        return TaskContext(
            task_description=task,
            scoped_services=services,
            files_to_modify=[
                asdict(f) if isinstance(f, FileMatch) else f for f in files_to_modify
            ],
            files_to_reference=[
                asdict(f) if isinstance(f, FileMatch) else f for f in files_to_reference
            ],
            patterns_discovered=patterns,
            service_contexts=service_contexts,
            graph_hints=graph_hints,
        )

    def _suggest_services(self, task: str) -> list[str]:
        """Suggest which services are relevant for a task."""
        task_lower = task.lower()
        services = self.project_index.get("services", {})
        suggested = []

        for service_name, service_info in services.items():
            score = 0
            name_lower = service_name.lower()

            # Check if service name is mentioned
            if name_lower in task_lower:
                score += 10

            # Check service type relevance
            service_type = service_info.get("type", "")
            if service_type == "backend" and any(
                kw in task_lower
                for kw in ["api", "endpoint", "route", "database", "model"]
            ):
                score += 5
            if service_type == "frontend" and any(
                kw in task_lower for kw in ["ui", "component", "page", "button", "form"]
            ):
                score += 5
            if service_type == "worker" and any(
                kw in task_lower
                for kw in ["job", "task", "queue", "background", "async"]
            ):
                score += 5
            if service_type == "scraper" and any(
                kw in task_lower for kw in ["scrape", "crawl", "fetch", "parse"]
            ):
                score += 5

            # Check framework relevance
            framework = service_info.get("framework", "").lower()
            if framework and framework in task_lower:
                score += 3

            if score > 0:
                suggested.append((service_name, score))

        # Sort by score and return top services
        suggested.sort(key=lambda x: x[1], reverse=True)

        if suggested:
            return [s[0] for s in suggested[:3]]  # Top 3

        # Default: return first backend and first frontend
        default = []
        for name, info in services.items():
            if info.get("type") == "backend" and "backend" not in [s for s in default]:
                default.append(name)
            elif info.get("type") == "frontend" and "frontend" not in [
                s for s in default
            ]:
                default.append(name)
        return default[:2] if default else list(services.keys())[:2]

    def _extract_keywords(self, task: str) -> list[str]:
        """Extract search keywords from task description."""
        # Remove common words
        stopwords = {
            "a",
            "an",
            "the",
            "to",
            "for",
            "of",
            "in",
            "on",
            "at",
            "by",
            "with",
            "and",
            "or",
            "but",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "being",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
            "must",
            "can",
            "this",
            "that",
            "these",
            "those",
            "i",
            "you",
            "we",
            "they",
            "it",
            "add",
            "create",
            "make",
            "implement",
            "build",
            "fix",
            "update",
            "change",
            "modify",
            "when",
            "if",
            "then",
            "else",
            "new",
            "existing",
        }

        # Tokenize and filter
        words = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", task.lower())
        keywords = [w for w in words if w not in stopwords and len(w) > 2]

        # Deduplicate while preserving order
        seen = set()
        unique_keywords = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique_keywords.append(kw)

        return unique_keywords[:10]  # Top 10 keywords

    def _search_service(
        self,
        service_path: Path,
        service_name: str,
        keywords: list[str],
    ) -> list[FileMatch]:
        """Search a service for files matching keywords."""
        matches = []

        if not service_path.exists():
            return matches

        for file_path in self._iter_code_files(service_path):
            try:
                content = file_path.read_text(errors="ignore")
                content_lower = content.lower()

                # Score this file
                score = 0
                matching_keywords = []
                matching_lines = []

                for keyword in keywords:
                    if keyword in content_lower:
                        # Count occurrences
                        count = content_lower.count(keyword)
                        score += min(count, 10)  # Cap at 10 per keyword
                        matching_keywords.append(keyword)

                        # Find matching lines (first 3 per keyword)
                        lines = content.split("\n")
                        found = 0
                        for i, line in enumerate(lines, 1):
                            if keyword in line.lower() and found < 3:
                                matching_lines.append((i, line.strip()[:100]))
                                found += 1

                if score > 0:
                    rel_path = str(file_path.relative_to(self.project_dir))
                    matches.append(
                        FileMatch(
                            path=rel_path,
                            service=service_name,
                            reason=f"Contains: {', '.join(matching_keywords)}",
                            relevance_score=score,
                            matching_lines=matching_lines[:5],  # Top 5 lines
                        )
                    )

            except (OSError, UnicodeDecodeError):
                continue

        # Sort by relevance
        matches.sort(key=lambda m: m.relevance_score, reverse=True)
        return matches[:20]  # Top 20 per service

    def _iter_code_files(self, directory: Path):
        """Iterate over code files in a directory."""
        for item in directory.rglob("*"):
            if item.is_file() and item.suffix in CODE_EXTENSIONS:
                # Check if in skip directory
                parts = item.relative_to(directory).parts
                if not any(part in SKIP_DIRS for part in parts):
                    yield item

    def _categorize_matches(
        self,
        matches: list[FileMatch],
        task: str,
    ) -> tuple[list[FileMatch], list[FileMatch]]:
        """Categorize matches into files to modify vs reference."""
        to_modify = []
        to_reference = []

        # Keywords that suggest modification
        modify_keywords = [
            "add",
            "create",
            "implement",
            "fix",
            "update",
            "change",
            "modify",
            "new",
        ]
        task_lower = task.lower()
        is_modification = any(kw in task_lower for kw in modify_keywords)

        for match in matches:
            # High relevance files in the "right" location are likely to be modified
            path_lower = match.path.lower()

            is_test = "test" in path_lower or "spec" in path_lower
            is_example = "example" in path_lower or "sample" in path_lower
            is_config = "config" in path_lower and match.relevance_score < 5

            if is_test or is_example or is_config:
                # Tests/examples are references
                match.reason = f"Reference pattern: {match.reason}"
                to_reference.append(match)
            elif match.relevance_score >= 5 and is_modification:
                # High relevance + modification task = likely to modify
                match.reason = f"Likely to modify: {match.reason}"
                to_modify.append(match)
            else:
                # Everything else is a reference
                match.reason = f"Related: {match.reason}"
                to_reference.append(match)

        # Limit results
        return to_modify[:10], to_reference[:15]

    def _discover_patterns(
        self,
        reference_files: list[FileMatch],
        keywords: list[str],
    ) -> dict[str, str]:
        """Discover code patterns from reference files."""
        patterns = {}

        for match in reference_files[:5]:  # Analyze top 5 reference files
            try:
                file_path = self.project_dir / match.path
                content = file_path.read_text(errors="ignore")

                # Look for common patterns
                for keyword in keywords:
                    if keyword in content.lower():
                        # Extract a snippet around the keyword
                        lines = content.split("\n")
                        for i, line in enumerate(lines):
                            if keyword in line.lower():
                                # Get context (3 lines before and after)
                                start = max(0, i - 3)
                                end = min(len(lines), i + 4)
                                snippet = "\n".join(lines[start:end])

                                pattern_key = f"{keyword}_pattern"
                                if pattern_key not in patterns:
                                    patterns[pattern_key] = (
                                        f"From {match.path}:\n{snippet[:300]}"
                                    )
                                break

            except (OSError, UnicodeDecodeError):
                continue

        return patterns

    def _get_service_context(
        self,
        service_path: Path,
        service_name: str,
        service_info: dict,
    ) -> dict:
        """Get or generate context for a service."""
        # Check for SERVICE_CONTEXT.md
        context_file = service_path / "SERVICE_CONTEXT.md"
        if context_file.exists():
            return {
                "source": "SERVICE_CONTEXT.md",
                "content": context_file.read_text()[:2000],  # First 2000 chars
            }

        # Generate basic context from service info
        return {
            "source": "generated",
            "language": service_info.get("language"),
            "framework": service_info.get("framework"),
            "type": service_info.get("type"),
            "entry_point": service_info.get("entry_point"),
            "key_directories": service_info.get("key_directories", {}),
        }


def build_task_context(
    project_dir: Path,
    task: str,
    services: list[str] | None = None,
    keywords: list[str] | None = None,
    output_file: Path | None = None,
) -> dict:
    """
    Build context for a task and optionally save to file.

    Args:
        project_dir: Path to project root
        task: Task description
        services: Services to search (None = auto-detect)
        keywords: Keywords to search for (None = extract from task)
        output_file: Optional path to save JSON output

    Returns:
        Context as a dictionary
    """
    builder = ContextBuilder(project_dir)
    context = builder.build_context(task, services, keywords)

    result = {
        "task_description": context.task_description,
        "scoped_services": context.scoped_services,
        "files_to_modify": context.files_to_modify,
        "files_to_reference": context.files_to_reference,
        "patterns": context.patterns_discovered,
        "service_contexts": context.service_contexts,
        "graph_hints": context.graph_hints,
    }

    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Task context saved to: {output_file}")

    return result


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Build task-specific context by searching the codebase"
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--task",
        type=str,
        required=True,
        help="Description of the task",
    )
    parser.add_argument(
        "--services",
        type=str,
        default=None,
        help="Comma-separated list of services to search",
    )
    parser.add_argument(
        "--keywords",
        type=str,
        default=None,
        help="Comma-separated list of keywords to search for",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output file for JSON results",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only output JSON, no status messages",
    )

    args = parser.parse_args()

    # Parse comma-separated args
    services = args.services.split(",") if args.services else None
    keywords = args.keywords.split(",") if args.keywords else None

    result = build_task_context(
        args.project_dir,
        args.task,
        services,
        keywords,
        args.output,
    )

    if not args.quiet or not args.output:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
