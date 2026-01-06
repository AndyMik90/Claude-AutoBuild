"""
Dependency validators for roadmap features.
"""

from dataclasses import dataclass

# Import RoadmapFeature based on execution context
# When run as module: use relative import
# When run as script: use absolute import
if __package__:
    from .models import RoadmapFeature
else:
    from runners.roadmap.models import RoadmapFeature


@dataclass
class ValidationResult:
    """Result of dependency validation."""

    has_missing: bool
    has_circular: bool
    missing_ids: list[str]
    circular_paths: list[list[str]]
    reverse_deps_map: dict[str, list[str]]


class DependencyValidator:
    """Validates and enriches feature dependencies."""

    def validate_all(self, features: list[RoadmapFeature]) -> ValidationResult:
        """
        Validates all dependencies in the roadmap.

        Args:
            features: List of features to validate

        Returns:
            ValidationResult with validation metadata
        """
        # Find missing dependencies
        missing_ids = self._find_missing_deps(features)

        # Detect circular dependencies
        circular_paths = self._detect_circular_deps(features)

        # Calculate reverse dependencies
        reverse_deps_map = self._calculate_reverse_deps(features)

        return ValidationResult(
            has_missing=len(missing_ids) > 0,
            has_circular=len(circular_paths) > 0,
            missing_ids=missing_ids,
            circular_paths=circular_paths,
            reverse_deps_map=reverse_deps_map
        )

    def _find_missing_deps(self, features: list[RoadmapFeature]) -> list[str]:
        """Find dependencies that reference non-existent features."""
        valid_ids = {f.id for f in features}
        missing = set()

        for feature in features:
            for dep_id in feature.dependencies:
                if dep_id not in valid_ids:
                    missing.add(dep_id)

        return sorted(list(missing))

    def _detect_circular_deps(self, features: list[RoadmapFeature]) -> list[list[str]]:
        """
        Detect circular dependencies using three-color DFS.

        Uses WHITE (0), GRAY (1), BLACK (2) marking:
        - WHITE: Not yet visited
        - GRAY: Currently being processed (in current path)
        - BLACK: Fully processed

        Time complexity: O(V + E) where V = features, E = dependencies
        """
        graph = {f.id: f.dependencies for f in features}
        circular_paths = []
        seen_cycles = set()  # Track normalized cycles for deduplication

        # Three-color DFS: WHITE=0, GRAY=1, BLACK=2
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {f.id: WHITE for f in features}

        def normalize_cycle(cycle: list[str]) -> str:
            """Rotate cycle to start from smallest ID for deduplication."""
            if not cycle or len(cycle) < 2:
                return ""
            # Remove last element (duplicate of first)
            cycle_without_dup = cycle[:-1]
            min_idx = cycle_without_dup.index(min(cycle_without_dup))
            # Rotate to start from minimal element
            rotated = cycle_without_dup[min_idx:] + cycle_without_dup[:min_idx]
            return ",".join(rotated)

        def dfs(node: str, path: list[str]) -> None:
            """DFS with backtracking - O(V + E) complexity."""
            color[node] = GRAY
            path.append(node)

            for neighbor in graph.get(node, []):
                if neighbor not in graph:
                    continue  # Skip non-existent nodes

                if color[neighbor] == GRAY:
                    # Found a cycle - neighbor is in current path
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:] + [neighbor]
                    # Normalize and deduplicate
                    normalized = normalize_cycle(cycle)
                    if normalized not in seen_cycles:
                        seen_cycles.add(normalized)
                        circular_paths.append(cycle)
                elif color[neighbor] == WHITE:
                    # Recurse into unvisited nodes
                    dfs(neighbor, path)

            # Backtrack
            path.pop()
            color[node] = BLACK

        # Run DFS from each unvisited node
        for feature_id in graph:
            if color[feature_id] == WHITE:
                dfs(feature_id, [])

        return circular_paths

    def _calculate_reverse_deps(self, features: list[RoadmapFeature]) -> dict[str, list[str]]:
        """Calculate which features depend on each feature."""
        reverse_deps: dict[str, list[str]] = {}

        # Initialize all features with empty list
        for feature in features:
            reverse_deps[feature.id] = []

        # Build reverse dependency map
        for feature in features:
            for dep_id in feature.dependencies:
                if dep_id not in reverse_deps:
                    reverse_deps[dep_id] = []
                reverse_deps[dep_id].append(feature.id)

        return reverse_deps
