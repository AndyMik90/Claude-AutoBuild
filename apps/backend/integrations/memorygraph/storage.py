"""
Storage Integration for MemoryGraph
====================================

Saves session insights to MemoryGraph after each session.
Async, non-blocking - doesn't slow down session completion.
"""

import logging
from pathlib import Path

from .client import MemoryGraphClient
from .extractor import InsightExtractor
from .relationships import infer_relationships

logger = logging.getLogger(__name__)


async def save_to_memorygraph(session_output: dict, project_dir: Path) -> None:
    """
    Extract and store insights from session output.

    Called asynchronously after session ends - doesn't block session completion.
    Gracefully handles errors - logs warnings but never crashes.

    Args:
        session_output: Session output dictionary with keys like:
            - what_failed: list of failure descriptions
            - what_worked: list of success descriptions
            - errors: list of error messages
            - qa_rejections: list of QA rejection reasons
            - fixes_applied: list of fixes that worked
            - patterns_found: list of patterns discovered
        project_dir: Project root directory path

    Returns:
        None - stores to MemoryGraph as side effect
    """
    try:
        # Initialize client and extractor
        client = MemoryGraphClient()
        extractor = InsightExtractor()

        # Add project context to all memories
        project_name = project_dir.name
        project_tags = [f"project:{project_name}"]

        # Extract insights
        logger.debug(f"Extracting insights from session for project: {project_name}")

        problems = extractor.extract_problems(session_output)
        solutions = extractor.extract_solutions(session_output)
        patterns = extractor.extract_patterns(session_output)

        if not (problems or solutions or patterns):
            logger.debug("No insights to store from session")
            return

        logger.debug(
            f"Extracted {len(problems)} problems, {len(solutions)} solutions, "
            f"{len(patterns)} patterns"
        )

        # Store problems
        stored_problems = []
        for problem in problems:
            try:
                # Add project tags
                problem["tags"] = list(set(problem["tags"] + project_tags))

                memory_id = await client.store(
                    memory_type=problem["type"],
                    title=problem["title"],
                    content=problem["content"],
                    tags=problem["tags"],
                    importance=problem.get("importance", 0.7),
                )

                if memory_id:
                    problem["id"] = memory_id
                    stored_problems.append(problem)
                    logger.debug(f"Stored problem: {problem['title']}")
            except Exception as e:
                logger.warning(f"Failed to store problem '{problem['title']}': {e}")
                continue

        # Store solutions
        stored_solutions = []
        for solution in solutions:
            try:
                # Add project tags
                solution["tags"] = list(set(solution["tags"] + project_tags))

                memory_id = await client.store(
                    memory_type=solution["type"],
                    title=solution["title"],
                    content=solution["content"],
                    tags=solution["tags"],
                    importance=solution.get("importance", 0.8),
                )

                if memory_id:
                    solution["id"] = memory_id
                    stored_solutions.append(solution)
                    logger.debug(f"Stored solution: {solution['title']}")
            except Exception as e:
                logger.warning(f"Failed to store solution '{solution['title']}': {e}")
                continue

        # Store patterns
        for pattern in patterns:
            try:
                # Add project tags
                pattern["tags"] = list(set(pattern.get("tags", []) + project_tags))

                memory_id = await client.store(
                    memory_type=pattern["type"],
                    title=pattern["title"],
                    content=pattern["content"],
                    tags=pattern["tags"],
                    importance=pattern.get("importance", 0.6),
                )

                if memory_id:
                    logger.debug(f"Stored pattern: {pattern['title']}")
            except Exception as e:
                logger.warning(f"Failed to store pattern '{pattern['title']}': {e}")
                continue

        # Create relationships between problems and solutions
        if stored_problems and stored_solutions:
            try:
                await infer_relationships(stored_problems, stored_solutions, client)
                logger.debug(
                    f"Created relationships between {len(stored_solutions)} solutions "
                    f"and {len(stored_problems)} problems"
                )
            except Exception as e:
                logger.warning(f"Failed to create relationships: {e}")

        logger.info(
            f"Successfully stored session insights: {len(stored_problems)} problems, "
            f"{len(stored_solutions)} solutions, {len(patterns)} patterns"
        )

    except Exception as e:
        # Never crash - just log the error
        logger.warning(f"Failed to save session to MemoryGraph: {e}")
