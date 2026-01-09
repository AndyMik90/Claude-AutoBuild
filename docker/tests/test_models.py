"""Tests for Pydantic models.

Validates that:
- Models serialize/deserialize correctly with ConfigDict
- Timestamps are timezone-aware (datetime.now(timezone.utc))
- Enum values are properly serialized
"""

import pytest
from datetime import datetime, timezone
from pydantic import ConfigDict

# Add app directory to path for imports
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from models import (
    Project,
    ProjectStatus,
    ProjectSettings,
    Spec,
    SpecStatus,
    Build,
    BuildStatus,
    ProjectCreate,
    SpecCreate,
    SystemHealth,
)


class TestPydanticV2ConfigDict:
    """Test that models use Pydantic v2 ConfigDict pattern."""

    def test_project_uses_config_dict(self):
        """Project model should use model_config = ConfigDict()."""
        assert hasattr(Project, "model_config")
        assert isinstance(Project.model_config, dict)
        assert Project.model_config.get("use_enum_values") is True

    def test_spec_uses_config_dict(self):
        """Spec model should use model_config = ConfigDict()."""
        assert hasattr(Spec, "model_config")
        assert isinstance(Spec.model_config, dict)
        assert Spec.model_config.get("use_enum_values") is True

    def test_build_uses_config_dict(self):
        """Build model should use model_config = ConfigDict()."""
        assert hasattr(Build, "model_config")
        assert isinstance(Build.model_config, dict)
        assert Build.model_config.get("use_enum_values") is True


class TestDatetimeTimezoneAware:
    """Test that model timestamps are timezone-aware."""

    def test_project_created_at_is_timezone_aware(self):
        """Project.created_at should be timezone-aware."""
        project = Project(
            name="test-project",
            repo_url="https://github.com/test/repo",
            path="/path/to/project",
        )

        # Check that created_at is timezone-aware
        assert project.created_at.tzinfo is not None
        assert project.created_at.tzinfo == timezone.utc

    def test_project_last_accessed_is_timezone_aware(self):
        """Project.last_accessed should be timezone-aware."""
        project = Project(
            name="test-project",
            repo_url="https://github.com/test/repo",
            path="/path/to/project",
        )

        # Check that last_accessed is timezone-aware
        assert project.last_accessed.tzinfo is not None
        assert project.last_accessed.tzinfo == timezone.utc

    def test_spec_created_at_is_timezone_aware(self):
        """Spec.created_at should be timezone-aware."""
        spec = Spec(
            id="test-spec-id",
            name="test-spec",
            project_id="test-project-id",
        )

        assert spec.created_at.tzinfo is not None
        assert spec.created_at.tzinfo == timezone.utc

    def test_spec_updated_at_is_timezone_aware(self):
        """Spec.updated_at should be timezone-aware."""
        spec = Spec(
            id="test-spec-id",
            name="test-spec",
            project_id="test-project-id",
        )

        assert spec.updated_at.tzinfo is not None
        assert spec.updated_at.tzinfo == timezone.utc


class TestModelSerialization:
    """Test model serialization/deserialization."""

    def test_project_serializes_with_enum_values(self):
        """Project should serialize enum as value, not Enum object."""
        project = Project(
            name="test-project",
            repo_url="https://github.com/test/repo",
            path="/path/to/project",
            status=ProjectStatus.BUILDING,
        )

        data = project.model_dump()

        # Enum should be serialized as string value
        assert data["status"] == "building"
        assert isinstance(data["status"], str)

    def test_spec_serializes_with_enum_values(self):
        """Spec should serialize enum as value, not Enum object."""
        spec = Spec(
            id="test-spec-id",
            name="test-spec",
            project_id="test-project-id",
            status=SpecStatus.COMPLETED,
        )

        data = spec.model_dump()

        assert data["status"] == "completed"
        assert isinstance(data["status"], str)

    def test_build_serializes_with_enum_values(self):
        """Build should serialize enum as value, not Enum object."""
        build = Build(
            project_id="test-project-id",
            spec_id="test-spec-id",
            status=BuildStatus.RUNNING,
        )

        data = build.model_dump()

        assert data["status"] == "running"
        assert isinstance(data["status"], str)

    def test_project_roundtrip_serialization(self):
        """Project should serialize and deserialize correctly."""
        original = Project(
            name="test-project",
            repo_url="https://github.com/test/repo",
            path="/path/to/project",
            status=ProjectStatus.ACTIVE,
        )

        # Serialize to dict and back
        data = original.model_dump()
        restored = Project.model_validate(data)

        assert restored.name == original.name
        assert restored.repo_url == original.repo_url
        assert restored.path == original.path
        assert restored.status == original.status


class TestProjectSettingsDefaults:
    """Test ProjectSettings has correct defaults."""

    def test_project_settings_default_branch(self):
        """ProjectSettings should default to main branch."""
        settings = ProjectSettings()
        assert settings.default_branch == "main"

    def test_project_settings_graphiti_disabled(self):
        """ProjectSettings should have graphiti disabled by default."""
        settings = ProjectSettings()
        assert settings.graphiti_enabled is False

    def test_project_settings_no_custom_model(self):
        """ProjectSettings should have no custom model by default."""
        settings = ProjectSettings()
        assert settings.custom_model is None
