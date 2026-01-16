#!/usr/bin/env python3
"""
Tests for Model Resolution
===========================

Tests the model resolution functionality including:
- resolve_model_id() function from phase_config
- Environment variable overrides
- Model shorthand to full ID mapping
- Default model values in GitHub runner services

This ensures custom model configurations (e.g., ANTHROPIC_DEFAULT_SONNET_MODEL)
are properly respected instead of falling back to hardcoded values.

Note: Some tests use source code inspection to avoid complex import dependencies
while still verifying the critical implementation patterns that prevent regression
of the hardcoded fallback bug (ACS-294).
"""

import os
import sys
from collections.abc import Generator
from pathlib import Path
from unittest.mock import patch

import pytest

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from phase_config import MODEL_ID_MAP, resolve_model_id


@pytest.fixture
def clean_env() -> Generator[None, None, None]:
    """Fixture that provides a clean environment without model override variables.

    This fixture clears all ANTHROPIC_DEFAULT_*_MODEL environment variables
    before each test and restores them afterward. This ensures tests don't
    interfere with each other when the user has custom model mappings configured.

    Yields:
        None
    """
    # Clear any environment variables that might interfere
    env_vars = [
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    ]
    env_backup = {k: os.environ.pop(k, None) for k in env_vars}

    yield

    # Restore environment variables
    for k, v in env_backup.items():
        if v is not None:
            os.environ[k] = v


class TestResolveModelId:
    """Tests for resolve_model_id function - behavioral tests."""

    def test_resolves_sonnet_shorthand_to_full_id(self, clean_env):
        """Sonnet shorthand resolves to full model ID."""
        result = resolve_model_id("sonnet")
        assert result == MODEL_ID_MAP["sonnet"]

    def test_resolves_opus_shorthand_to_full_id(self, clean_env):
        """Opus shorthand resolves to full model ID."""
        result = resolve_model_id("opus")
        assert result == MODEL_ID_MAP["opus"]

    def test_resolves_haiku_shorthand_to_full_id(self, clean_env):
        """Haiku shorthand resolves to full model ID."""
        result = resolve_model_id("haiku")
        assert result == MODEL_ID_MAP["haiku"]

    def test_passes_through_full_model_id(self):
        """Full model IDs are passed through unchanged."""
        custom_model = "glm-4.7"
        result = resolve_model_id(custom_model)
        assert result == custom_model

    def test_passes_through_unknown_shorthand(self):
        """Unknown shorthands are passed through unchanged."""
        unknown = "unknown-model"
        result = resolve_model_id(unknown)
        assert result == unknown

    def test_environment_variable_override_sonnet(self):
        """ANTHROPIC_DEFAULT_SONNET_MODEL overrides sonnet shorthand."""
        custom_model = "glm-4.7"
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_SONNET_MODEL": custom_model}):
            result = resolve_model_id("sonnet")
            assert result == custom_model

    def test_environment_variable_override_opus(self):
        """ANTHROPIC_DEFAULT_OPUS_MODEL overrides opus shorthand."""
        custom_model = "glm-4.7"
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_OPUS_MODEL": custom_model}):
            result = resolve_model_id("opus")
            assert result == custom_model

    def test_environment_variable_override_haiku(self):
        """ANTHROPIC_DEFAULT_HAIKU_MODEL overrides haiku shorthand."""
        custom_model = "glm-4.7"
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_HAIKU_MODEL": custom_model}):
            result = resolve_model_id("haiku")
            assert result == custom_model

    def test_environment_variable_takes_precedence_over_hardcoded_map(self):
        """Environment variable overrides take precedence over MODEL_ID_MAP."""
        custom_model = "custom-sonnet-model"
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_SONNET_MODEL": custom_model}):
            result = resolve_model_id("sonnet")
            assert result == custom_model
            assert result != MODEL_ID_MAP["sonnet"]

    def test_empty_environment_variable_is_ignored(self):
        """Empty environment variable is ignored, falls back to MODEL_ID_MAP."""
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_SONNET_MODEL": ""}):
            result = resolve_model_id("sonnet")
            assert result == MODEL_ID_MAP["sonnet"]

    def test_full_model_id_not_affected_by_environment_variable(self):
        """Full model IDs are not affected by environment variables."""
        custom_model = "my-custom-model-123"
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.7"}):
            result = resolve_model_id(custom_model)
            assert result == custom_model


class TestGitHubRunnerConfigModelDefaults:
    """Tests for GitHubRunnerConfig default model values.

    Uses source inspection to avoid complex import dependencies while
    verifying the critical pattern: default is shorthand "sonnet", not a
    hardcoded full model ID.
    """

    def test_default_model_is_shorthand(self):
        """GitHubRunnerConfig default model uses shorthand 'sonnet'."""
        models_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "models.py"
        )
        content = models_file.read_text()
        # Verify the default is "sonnet" (shorthand), not a hardcoded full model ID
        assert 'model: str = "sonnet"' in content
        # Verify the old hardcoded fallback is NOT present
        assert 'model: str = "claude-sonnet-4-5-20250929"' not in content

    def test_load_settings_default_model_is_shorthand(self):
        """GitHubRunnerConfig.load_settings() uses shorthand 'sonnet' as default."""
        models_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "models.py"
        )
        content = models_file.read_text()
        # Verify load_settings uses "sonnet" (shorthand) as fallback
        assert 'model=settings.get("model", "sonnet")' in content


class TestBatchValidatorModelResolution:
    """Tests for BatchValidator model resolution.

    Tests verify the new importlib.util pattern instead of absolute imports,
    and that the shorthand "sonnet" is used as default.
    """

    def test_default_model_is_shorthand(self):
        """BatchValidator DEFAULT_MODEL uses shorthand 'sonnet'."""
        batch_validator_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "batch_validator.py"
        )
        content = batch_validator_file.read_text()
        # Verify DEFAULT_MODEL is "sonnet" (shorthand)
        assert 'DEFAULT_MODEL = "sonnet"' in content

    def test_uses_importlib_for_import(self):
        """BatchValidator uses importlib.util.find_spec for robust imports."""
        batch_validator_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "batch_validator.py"
        )
        content = batch_validator_file.read_text()
        # Verify the new importlib pattern is used
        assert "importlib.util.find_spec" in content
        # Verify the old absolute import pattern is NOT present
        assert "from phase_config import resolve_model_id" not in content

    def test_has_resolve_model_method(self):
        """BatchValidator has _resolve_model method that resolves models."""
        batch_validator_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "batch_validator.py"
        )
        content = batch_validator_file.read_text()
        # Verify _resolve_model method exists
        assert "def _resolve_model(self, model: str)" in content
        # Verify it calls resolve_model_id on the imported module
        assert "return phase_config.resolve_model_id(model)" in content

    def test_init_calls_resolve_model(self):
        """BatchValidator.__init__ calls _resolve_model to resolve the model."""
        batch_validator_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "batch_validator.py"
        )
        content = batch_validator_file.read_text()
        # Verify __init__ resolves the model
        assert "self.model = self._resolve_model(model)" in content


class TestBatchIssuesModelResolution:
    """Tests for batch_issues.py validation_model default.

    Uses source inspection to verify shorthand "sonnet" is used as default.
    """

    def test_validation_model_default_is_shorthand(self):
        """IssueBatcher validation_model default uses shorthand 'sonnet'."""
        batch_issues_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "batch_issues.py"
        )
        content = batch_issues_file.read_text()
        # Verify validation_model default is "sonnet" (shorthand)
        assert 'validation_model: str = "sonnet"' in content


class TestParallelReviewerImportResolution:
    """Tests that parallel reviewers use proper model resolution patterns.

    Includes both behavioral tests (simulating the pattern) and source
    inspection tests (to verify hardcoded fallbacks are not present).
    """

    def test_parallel_reviewers_resolve_models(self, clean_env):
        """Parallel reviewers correctly resolve model shorthands using resolve_model_id pattern."""
        # Simulate the pattern used in parallel reviewers
        config_model = None
        model_shorthand = config_model or "sonnet"
        model = resolve_model_id(model_shorthand)

        # Should resolve to the full model ID
        assert model == MODEL_ID_MAP["sonnet"]

    def test_parallel_reviewers_respect_environment_variables(self):
        """Parallel reviewers respect environment variable overrides."""
        custom_model = "glm-4.7"
        with patch.dict(os.environ, {"ANTHROPIC_DEFAULT_SONNET_MODEL": custom_model}):
            config_model = None
            model_shorthand = config_model or "sonnet"
            model = resolve_model_id(model_shorthand)

            assert model == custom_model

    def test_parallel_reviewers_use_sonnet_fallback(self):
        """Parallel reviewers use 'sonnet' shorthand as fallback, not hardcoded model IDs."""
        orchestrator_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "services"
            / "parallel_orchestrator_reviewer.py"
        )
        followup_file = (
            Path(__file__).parent.parent
            / "apps"
            / "backend"
            / "runners"
            / "github"
            / "services"
            / "parallel_followup_reviewer.py"
        )

        orchestrator_content = orchestrator_file.read_text()
        followup_content = followup_file.read_text()

        # Verify the old hardcoded fallback is NOT present (negative assertion)
        assert 'or "claude-sonnet-4-5-20250929"' not in orchestrator_content
        assert 'or "claude-sonnet-4-5-20250929"' not in followup_content

        # Verify the new pattern IS present (shorthand fallback)
        assert 'model_shorthand = self.config.model or "sonnet"' in orchestrator_content
        assert 'model_shorthand = self.config.model or "sonnet"' in followup_content

        # Verify resolve_model_id is imported and used
        assert "resolve_model_id" in orchestrator_content
        assert "resolve_model_id" in followup_content
