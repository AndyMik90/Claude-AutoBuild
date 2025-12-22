"""
File Categorization
===================

Categorizes files into those to modify vs those to reference.
"""

from .models import FileMatch


class FileCategorizer:
    """Categorizes matched files based on task context."""

    # Keywords that suggest modification
    MODIFY_KEYWORDS = [
        "add",
        "create",
        "implement",
        "fix",
        "update",
        "change",
        "modify",
        "new",
    ]

    def categorize_matches(
        self,
        matches: list[FileMatch],
        task: str,
        max_modify: int = 10,
        max_reference: int = 15,
    ) -> tuple[list[FileMatch], list[FileMatch]]:
        """
        Categorize matches into files to modify vs reference.

        Args:
            matches: List of FileMatch objects to categorize
            task: Task description string
            max_modify: Maximum files to modify
            max_reference: Maximum reference files

        Returns:
            Tuple of (files_to_modify, files_to_reference)
        """
        to_modify = []
        to_reference = []

        task_lower = task.lower()
        is_modification = any(kw in task_lower for kw in self.MODIFY_KEYWORDS)

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
        return to_modify[:max_modify], to_reference[:max_reference]
