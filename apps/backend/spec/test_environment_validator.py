#!/usr/bin/env python3
"""
Tests for Environment Validator
===============================

Tests the environment_validator.py module functionality including:
- Python version detection
- Dependency checks
- Data class behavior
- Path detection functions
- Dual environment validation
"""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add the services directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent / "services"))

from environment_validator import (
    MIN_PYTHON_VERSION,
    CORE_DEPENDENCIES,
    OPTIONAL_DEPENDENCIES,
    DependencyStatus,
    ValidationResult,
    DualValidationResult,
    EnvironmentValidator,
    get_bundled_python_path,
    get_venv_python_path,
)


# =============================================================================
# DATA CLASS TESTS
# =============================================================================


class TestDependencyStatus:
    """Tests for DependencyStatus dataclass."""

    def test_default_values(self):
        """Creates with correct default values."""
        status = DependencyStatus(name="test_package")
        assert status.name == "test_package"
        assert status.installed is False
        assert status.version is None
        assert status.error is None

    def test_installed_dependency(self):
        """Records installed dependency with version."""
        status = DependencyStatus(
            name="pydantic",
            installed=True,
            version="2.0.0",
        )
        assert status.installed is True
        assert status.version == "2.0.0"

    def test_missing_dependency_with_error(self):
        """Records missing dependency with error message."""
        status = DependencyStatus(
            name="missing_package",
            installed=False,
            error="No module named 'missing_package'",
        )
        assert status.installed is False
        assert "No module named" in status.error


class TestValidationResult:
    """Tests for ValidationResult dataclass."""

    def test_default_values(self):
        """Creates with correct default values."""
        result = ValidationResult()
        assert result.success is False
        assert result.python_path == ""
        assert result.python_version == ""
        assert result.python_version_valid is False
        assert result.dependencies == []
        assert result.missing_required == []
        assert result.missing_optional == []
        assert result.errors == []
        assert result.warnings == []

    def test_successful_validation(self):
        """Records successful validation."""
        result = ValidationResult(
            success=True,
            python_path="/usr/bin/python3",
            python_version="3.12.0",
            python_version_valid=True,
        )
        assert result.success is True
        assert result.python_version == "3.12.0"
        assert result.python_version_valid is True

    def test_failed_validation_with_errors(self):
        """Records failed validation with errors."""
        result = ValidationResult(
            success=False,
            python_path="/usr/bin/python3",
            python_version="3.10.0",
            python_version_valid=False,
            errors=["Python version 3.10.0 is below minimum required 3.12"],
        )
        assert result.success is False
        assert len(result.errors) == 1
        assert "below minimum" in result.errors[0]

    def test_missing_dependencies(self):
        """Tracks missing required and optional dependencies."""
        result = ValidationResult(
            missing_required=["claude_agent_sdk"],
            missing_optional=["real_ladybug"],
        )
        assert "claude_agent_sdk" in result.missing_required
        assert "real_ladybug" in result.missing_optional


class TestDualValidationResult:
    """Tests for DualValidationResult dataclass."""

    def test_default_values(self):
        """Creates with correct default values."""
        result = DualValidationResult()
        assert result.success is False
        assert result.bundled is None
        assert result.venv is None
        assert result.summary == ""

    def test_dual_success(self):
        """Records dual validation success."""
        bundled = ValidationResult(success=True, python_path="/bundled/python")
        venv = ValidationResult(success=True, python_path="/venv/python")

        result = DualValidationResult(
            success=True,
            bundled=bundled,
            venv=venv,
            summary="Both environments valid",
        )
        assert result.success is True
        assert result.bundled.success is True
        assert result.venv.success is True


# =============================================================================
# PATH DETECTION TESTS
# =============================================================================


class TestGetBundledPythonPath:
    """Tests for bundled Python path detection."""

    @patch("environment_validator.platform.system")
    def test_macos_path_detection(self, mock_system):
        """Returns macOS bundled Python path when exists."""
        mock_system.return_value = "Darwin"

        with patch.object(Path, "exists", return_value=False):
            result = get_bundled_python_path()
            # Should return None when path doesn't exist
            assert result is None

    @patch("environment_validator.platform.system")
    def test_windows_path_detection(self, mock_system):
        """Returns Windows bundled Python path when exists."""
        mock_system.return_value = "Windows"

        with patch.object(Path, "exists", return_value=False):
            result = get_bundled_python_path()
            assert result is None

    @patch("environment_validator.platform.system")
    def test_linux_path_detection(self, mock_system):
        """Returns Linux bundled Python path when exists."""
        mock_system.return_value = "Linux"

        with patch.object(Path, "exists", return_value=False):
            result = get_bundled_python_path()
            assert result is None

    @patch("environment_validator.platform.system")
    def test_returns_none_when_not_found(self, mock_system):
        """Returns None when bundled Python not found."""
        mock_system.return_value = "Darwin"

        with patch.object(Path, "exists", return_value=False):
            result = get_bundled_python_path()
            assert result is None


class TestGetVenvPythonPath:
    """Tests for venv Python path detection."""

    @patch("environment_validator.platform.system")
    def test_macos_venv_path(self, mock_system):
        """Returns macOS venv Python path when exists."""
        mock_system.return_value = "Darwin"

        with patch.object(Path, "exists", return_value=False):
            result = get_venv_python_path()
            assert result is None

    @patch("environment_validator.platform.system")
    def test_windows_venv_path(self, mock_system):
        """Returns Windows venv Python path when exists."""
        mock_system.return_value = "Windows"

        with patch.object(Path, "exists", return_value=False):
            result = get_venv_python_path()
            assert result is None

    @patch("environment_validator.platform.system")
    def test_linux_venv_path(self, mock_system):
        """Returns Linux venv Python path when exists."""
        mock_system.return_value = "Linux"

        with patch.object(Path, "exists", return_value=False):
            result = get_venv_python_path()
            assert result is None


# =============================================================================
# ENVIRONMENT VALIDATOR TESTS
# =============================================================================


class TestEnvironmentValidatorInit:
    """Tests for EnvironmentValidator initialization."""

    def test_default_dependencies(self):
        """Uses default dependencies when not specified."""
        validator = EnvironmentValidator()
        assert validator.core_dependencies == CORE_DEPENDENCIES
        assert validator.optional_dependencies == OPTIONAL_DEPENDENCIES

    def test_custom_dependencies(self):
        """Uses custom dependencies when specified."""
        validator = EnvironmentValidator(
            core_dependencies=["custom_dep"],
            optional_dependencies=["optional_custom"],
        )
        assert validator.core_dependencies == ["custom_dep"]
        assert validator.optional_dependencies == ["optional_custom"]


class TestPythonVersionDetection:
    """Tests for Python version detection."""

    def test_detects_valid_python_version(self):
        """Detects valid Python 3.12+ version."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.12.0\n"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            version_result = validator._check_python_version("/usr/bin/python3")

        assert version_result["success"] is True
        assert version_result["version"] == "3.12.0"
        assert version_result["valid"] is True

    def test_detects_old_python_version(self):
        """Detects Python below 3.12 as invalid."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.10.0\n"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            version_result = validator._check_python_version("/usr/bin/python3")

        assert version_result["success"] is True
        assert version_result["version"] == "3.10.0"
        assert version_result["valid"] is False

    def test_detects_python_311_as_invalid(self):
        """Python 3.11 is below minimum 3.12."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.11.5\n"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            version_result = validator._check_python_version("/usr/bin/python3")

        assert version_result["valid"] is False

    def test_detects_python_313_as_valid(self):
        """Python 3.13 is valid (above 3.12)."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.13.0\n"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            version_result = validator._check_python_version("/usr/bin/python3")

        assert version_result["valid"] is True

    def test_handles_subprocess_failure(self):
        """Handles subprocess failures gracefully."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "python not found"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            version_result = validator._check_python_version("/invalid/python")

        assert version_result["success"] is False
        assert "error" in version_result

    def test_handles_timeout(self):
        """Handles subprocess timeout."""
        validator = EnvironmentValidator()

        import subprocess

        with patch(
            "environment_validator.subprocess.run",
            side_effect=subprocess.TimeoutExpired("cmd", 30),
        ):
            version_result = validator._check_python_version("/usr/bin/python3")

        assert version_result["success"] is False
        assert "Timeout" in version_result["error"]

    def test_handles_file_not_found(self):
        """Handles missing Python interpreter."""
        validator = EnvironmentValidator()

        with patch(
            "environment_validator.subprocess.run",
            side_effect=FileNotFoundError("No such file"),
        ):
            version_result = validator._check_python_version("/nonexistent/python")

        assert version_result["success"] is False
        assert "not found" in version_result["error"]


class TestDependencyCheck:
    """Tests for dependency checking."""

    def test_detects_installed_dependency(self):
        """Detects installed dependency with version."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = json.dumps({"installed": True, "version": "2.0.0"})

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            status = validator._check_dependency("/usr/bin/python3", "pydantic")

        assert status.name == "pydantic"
        assert status.installed is True
        assert status.version == "2.0.0"

    def test_detects_missing_dependency(self):
        """Detects missing dependency with error."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = json.dumps({
            "installed": False,
            "error": "No module named 'missing'",
        })

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            status = validator._check_dependency("/usr/bin/python3", "missing")

        assert status.name == "missing"
        assert status.installed is False
        assert "No module named" in status.error

    def test_handles_dotted_module_names(self):
        """Handles dotted module names like google.generativeai."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = json.dumps({"installed": True, "version": "1.0.0"})

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            status = validator._check_dependency(
                "/usr/bin/python3",
                "google.generativeai",
            )

        assert status.name == "google.generativeai"
        assert status.installed is True

    def test_handles_subprocess_timeout(self):
        """Handles timeout during dependency check."""
        validator = EnvironmentValidator()

        import subprocess

        with patch(
            "environment_validator.subprocess.run",
            side_effect=subprocess.TimeoutExpired("cmd", 30),
        ):
            status = validator._check_dependency("/usr/bin/python3", "slow_module")

        assert status.installed is False
        assert "Timeout" in status.error

    def test_handles_invalid_json_output(self):
        """Handles invalid JSON output from dependency check."""
        validator = EnvironmentValidator()

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "not valid json"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            status = validator._check_dependency("/usr/bin/python3", "broken_module")

        assert status.installed is False
        assert "Failed to parse output" in status.error


class TestValidateEnvironment:
    """Tests for full environment validation."""

    def test_validates_good_environment(self):
        """Validates environment with valid Python and all deps."""
        validator = EnvironmentValidator(
            core_dependencies=["dep1"],
            optional_dependencies=["opt1"],
        )

        def mock_subprocess_run(cmd, **kwargs):
            result = MagicMock()
            result.returncode = 0

            # Python version check
            if "version_info" in cmd[2]:
                result.stdout = "3.12.0"
            # Dependency check
            else:
                result.stdout = json.dumps({"installed": True, "version": "1.0.0"})

            return result

        with patch("environment_validator.subprocess.run", side_effect=mock_subprocess_run):
            result = validator.validate_environment("/usr/bin/python3")

        assert result.success is True
        assert result.python_version == "3.12.0"
        assert result.python_version_valid is True
        assert len(result.missing_required) == 0

    def test_fails_with_old_python(self):
        """Fails validation with old Python version."""
        validator = EnvironmentValidator(core_dependencies=[])

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.10.0"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            result = validator.validate_environment("/usr/bin/python3")

        assert result.success is False
        assert result.python_version_valid is False
        assert any("below minimum" in e for e in result.errors)

    def test_fails_with_missing_core_dependency(self):
        """Fails validation when core dependency is missing."""
        validator = EnvironmentValidator(
            core_dependencies=["missing_core"],
            optional_dependencies=[],
        )

        call_count = 0

        def mock_subprocess_run(cmd, **kwargs):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            result.returncode = 0

            if call_count == 1:  # Version check
                result.stdout = "3.12.0"
            else:  # Dependency check
                result.stdout = json.dumps({
                    "installed": False,
                    "error": "No module named 'missing_core'",
                })

            return result

        with patch("environment_validator.subprocess.run", side_effect=mock_subprocess_run):
            result = validator.validate_environment("/usr/bin/python3")

        assert result.success is False
        assert "missing_core" in result.missing_required
        assert any("Missing required" in e for e in result.errors)

    def test_warns_on_missing_optional_dependency(self):
        """Warns but succeeds when optional dependency is missing."""
        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=["optional_dep"],
        )

        call_count = 0

        def mock_subprocess_run(cmd, **kwargs):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            result.returncode = 0

            if call_count == 1:  # Version check
                result.stdout = "3.12.0"
            else:  # Dependency check
                result.stdout = json.dumps({
                    "installed": False,
                    "error": "No module named 'optional_dep'",
                })

            return result

        with patch("environment_validator.subprocess.run", side_effect=mock_subprocess_run):
            result = validator.validate_environment("/usr/bin/python3")

        assert result.success is True  # Still succeeds
        assert "optional_dep" in result.missing_optional
        assert len(result.warnings) > 0


class TestDualEnvironmentValidation:
    """Tests for dual environment validation."""

    def test_succeeds_when_both_valid(self):
        """Succeeds when both bundled and venv are valid."""
        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.12.0"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            result = validator.validate_dual_environment(
                bundled_path="/bundled/python",
                venv_path="/venv/python",
            )

        assert result.success is True
        assert result.bundled is not None
        assert result.venv is not None

    def test_succeeds_when_only_venv_valid(self):
        """Succeeds when only venv is valid (dev mode)."""
        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "3.12.0"

        with patch("environment_validator.subprocess.run", return_value=mock_result):
            result = validator.validate_dual_environment(
                bundled_path=None,  # No bundled Python
                venv_path="/venv/python",
            )

        assert result.success is True
        assert result.bundled is None
        assert result.venv is not None

    def test_fails_when_neither_valid(self):
        """Fails when neither environment is valid."""
        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        result = validator.validate_dual_environment(
            bundled_path=None,
            venv_path=None,
        )

        assert result.success is False
        assert result.bundled is None
        assert result.venv is None

    def test_auto_detects_paths_when_not_specified(self):
        """Uses auto-detection when paths not specified."""
        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        with patch("environment_validator.get_bundled_python_path", return_value=None):
            with patch("environment_validator.get_venv_python_path", return_value=None):
                result = validator.validate_dual_environment()

        # Should fail since no paths found
        assert result.success is False


# =============================================================================
# CONSTANTS TESTS
# =============================================================================


class TestConstants:
    """Tests for module constants."""

    def test_min_python_version(self):
        """Minimum Python version is 3.12."""
        assert MIN_PYTHON_VERSION == (3, 12)

    def test_core_dependencies_defined(self):
        """Core dependencies list is not empty."""
        assert len(CORE_DEPENDENCIES) > 0
        assert "claude_agent_sdk" in CORE_DEPENDENCIES

    def test_optional_dependencies_defined(self):
        """Optional dependencies list is defined."""
        assert isinstance(OPTIONAL_DEPENDENCIES, list)


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def mock_valid_python():
    """Fixture that mocks a valid Python 3.12 environment."""
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "3.12.0"

    with patch("environment_validator.subprocess.run", return_value=mock_result):
        yield


@pytest.fixture
def mock_old_python():
    """Fixture that mocks an old Python 3.10 environment."""
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "3.10.0"

    with patch("environment_validator.subprocess.run", return_value=mock_result):
        yield
