"""
Tests for roadmap dependency validator.

Tests for DependencyValidator in apps/backend/runners/roadmap/validators.py
"""

import sys
from pathlib import Path

# Add apps/backend directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from runners.roadmap.validators import DependencyValidator
from runners.roadmap.models import RoadmapFeature


def test_missing_dependency_detection():
    """Test detecting dependencies that reference non-existent features."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2", "feat-3"],  # feat-3 doesn't exist
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == True
    assert "feat-3" in result.missing_ids
    assert len(result.missing_ids) == 1


def test_no_missing_dependencies():
    """Test when all dependencies exist."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == False
    assert len(result.missing_ids) == 0


def test_circular_dependency_detection():
    """Test detecting circular dependencies."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=["feat-3"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-3",
            title="Feature 3",
            description="Test feature 3",
            dependencies=["feat-1"],  # Circular!
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_circular == True
    assert len(result.circular_paths) > 0
    # Check that the circular path is detected
    assert any("feat-1" in path and "feat-2" in path and "feat-3" in path
               for path in result.circular_paths)


def test_no_circular_dependencies():
    """Test when there are no circular dependencies."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_circular == False
    assert len(result.circular_paths) == 0


def test_reverse_dependencies_calculation():
    """Test calculating reverse dependencies."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=["feat-2", "feat-3"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-2",
            title="Feature 2",
            description="Test feature 2",
            dependencies=["feat-3"],
            status="planned"
        ),
        RoadmapFeature(
            id="feat-3",
            title="Feature 3",
            description="Test feature 3",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    # feat-3 is depended upon by feat-1 and feat-2
    assert set(result.reverse_deps_map["feat-3"]) == {"feat-1", "feat-2"}
    # feat-2 is depended upon by feat-1
    assert result.reverse_deps_map["feat-2"] == ["feat-1"]
    # feat-1 is not depended upon by anyone
    assert result.reverse_deps_map["feat-1"] == []


def test_empty_feature_list():
    """Test validator with empty feature list."""
    features = []

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == False
    assert result.has_circular == False
    assert len(result.missing_ids) == 0
    assert len(result.circular_paths) == 0
    assert len(result.reverse_deps_map) == 0


def test_feature_with_no_dependencies():
    """Test feature with no dependencies."""
    features = [
        RoadmapFeature(
            id="feat-1",
            title="Feature 1",
            description="Test feature 1",
            dependencies=[],
            status="planned"
        )
    ]

    validator = DependencyValidator()
    result = validator.validate_all(features)

    assert result.has_missing == False
    assert result.has_circular == False
    assert result.reverse_deps_map["feat-1"] == []
