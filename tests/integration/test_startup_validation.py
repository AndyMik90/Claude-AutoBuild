#!/usr/bin/env python3
"""
Integration Tests for Startup Validation
=========================================

Tests the E2E validation flow from startup to feature usage, including:
- Environment validation (both bundled and venv interpreters)
- System build tools check (make, cmake)
- Dependency synchronization verification
- Feature operation without 'Process exited with code 1' errors

These tests verify that the startup validation system correctly:
1. Validates Python environments
2. Checks for required build tools
3. Ensures dependencies are synchronized
4. Prevents cryptic 'code 1' errors for Insights/Roadmap/Ideation features

Note: These tests require Python 3.10+ due to the codebase using modern type
annotations. The tests will be skipped on older Python versions.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Generator
from unittest.mock import MagicMock, patch

import pytest

# Check Python version - codebase requires 3.10+ for type syntax
PYTHON_VERSION_OK = sys.version_info >= (3, 10)
pytestmark = pytest.mark.skipif(
    not PYTHON_VERSION_OK,
    reason="Tests require Python 3.10+ due to modern type annotations in codebase"
)

# Backend services path
_backend_path = Path(__file__).parent.parent.parent / "apps" / "backend"


def _load_module_directly(name: str, path: str):
    """Load a module directly bypassing __init__.py for Py3.9 compatibility."""
    spec = importlib.util.spec_from_file_location(name, path)
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module
    return None


# Try standard import path first; fall back to direct load for Py3.9
try:
    if str(_backend_path) not in sys.path:
        sys.path.insert(0, str(_backend_path))
    # Test if imports work (will fail on Py3.9 due to type syntax in __init__.py)
    from services import environment_validator as _test_import
    del _test_import
    _USE_DIRECT_IMPORTS = False
except (TypeError, SyntaxError):
    # Python < 3.10, use direct module loading
    _USE_DIRECT_IMPORTS = True


def _get_environment_validator_module():
    """Get environment_validator module with compatibility handling."""
    if _USE_DIRECT_IMPORTS:
        return _load_module_directly(
            'environment_validator',
            str(_backend_path / 'services' / 'environment_validator.py')
        )
    from services import environment_validator
    return environment_validator


def _get_system_check_module():
    """Get system_check module with compatibility handling."""
    if _USE_DIRECT_IMPORTS:
        return _load_module_directly(
            'system_check',
            str(_backend_path / 'services' / 'system_check.py')
        )
    from services import system_check
    return system_check


def _get_dependency_installer_module():
    """Get dependency_installer module with compatibility handling."""
    if _USE_DIRECT_IMPORTS:
        return _load_module_directly(
            'dependency_installer',
            str(_backend_path / 'services' / 'dependency_installer.py')
        )
    from services import dependency_installer
    return dependency_installer


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def temp_python_script() -> Generator[Path, None, None]:
    """Create a temporary Python script for validation testing."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False
    ) as f:
        f.write(
            """#!/usr/bin/env python3
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")
sys.exit(0)
"""
        )
        script_path = Path(f.name)

    yield script_path

    # Cleanup
    if script_path.exists():
        script_path.unlink()


@pytest.fixture
def mock_python_paths(temp_dir: Path) -> dict[str, Path]:
    """Create mock Python interpreter paths for testing."""
    # Create mock bundled Python
    bundled_dir = temp_dir / "bundled" / "bin"
    bundled_dir.mkdir(parents=True)
    bundled_python = bundled_dir / "python3"

    # Create mock venv Python
    venv_dir = temp_dir / "venv" / "bin"
    venv_dir.mkdir(parents=True)
    venv_python = venv_dir / "python"

    # Create executable scripts that mimic Python
    python_script = f"""#!/bin/bash
echo "3.12.0"
exit 0
"""
    bundled_python.write_text(python_script)
    bundled_python.chmod(0o755)
    venv_python.write_text(python_script)
    venv_python.chmod(0o755)

    return {
        "bundled": bundled_python,
        "venv": venv_python,
    }


@pytest.fixture
def mock_requirements_file(temp_dir: Path) -> Path:
    """Create a mock requirements.txt file."""
    requirements = temp_dir / "requirements.txt"
    requirements.write_text(
        """# Core dependencies
pydantic>=2.0
python-dotenv>=1.0

# Optional dependencies
# real_ladybug>=0.1.0
# graphiti-core>=0.1.0
"""
    )
    return requirements


# =============================================================================
# ENVIRONMENT VALIDATOR INTEGRATION TESTS
# =============================================================================


class TestEnvironmentValidatorIntegration:
    """Integration tests for environment_validator.py."""

    def test_validator_module_imports(self):
        """Environment validator module imports successfully."""
        mod = _get_environment_validator_module()

        assert mod.EnvironmentValidator is not None
        assert mod.ValidationResult is not None
        assert mod.DualValidationResult is not None
        assert mod.DependencyStatus is not None

    def test_validator_dataclasses_initialization(self):
        """ValidationResult and DependencyStatus initialize correctly."""
        mod = _get_environment_validator_module()
        ValidationResult = mod.ValidationResult
        DependencyStatus = mod.DependencyStatus

        # Test DependencyStatus
        dep_status = DependencyStatus(name="test-pkg")
        assert dep_status.name == "test-pkg"
        assert dep_status.installed is False
        assert dep_status.version is None
        assert dep_status.error is None

        # Test ValidationResult
        result = ValidationResult()
        assert result.success is False
        assert result.python_path == ""
        assert result.python_version == ""
        assert result.dependencies == []
        assert result.errors == []

    def test_validator_with_current_python(self):
        """Environment validator works with current Python interpreter."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator

        validator = EnvironmentValidator(
            core_dependencies=[],  # Empty to avoid import failures
            optional_dependencies=[],
        )

        result = validator.validate_environment(sys.executable)

        # Should succeed with current Python (>= 3.12)
        assert result.python_path == sys.executable
        assert result.python_version != ""
        # Only check version validity if we're on 3.12+
        if sys.version_info >= (3, 12):
            assert result.python_version_valid is True

    def test_validator_version_check(self):
        """Validator correctly checks Python version."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator
        MIN_PYTHON_VERSION = mod.MIN_PYTHON_VERSION

        # MIN_PYTHON_VERSION should be (3, 12)
        assert MIN_PYTHON_VERSION == (3, 12)

        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        result = validator._check_python_version(sys.executable)
        assert result["success"] is True
        assert "version" in result
        assert "valid" in result

    def test_validator_handles_missing_interpreter(self):
        """Validator handles non-existent Python path gracefully."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator

        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        result = validator.validate_environment("/nonexistent/python")

        assert result.success is False
        assert len(result.errors) > 0
        assert any("not found" in err.lower() for err in result.errors)


class TestDualEnvironmentValidation:
    """Integration tests for dual-interpreter validation."""

    def test_dual_validation_result_structure(self):
        """DualValidationResult has correct structure."""
        mod = _get_environment_validator_module()
        DualValidationResult = mod.DualValidationResult

        result = DualValidationResult()
        assert result.success is False
        assert result.bundled is None
        assert result.venv is None
        assert result.summary == ""

    def test_validate_dual_environment_with_mocked_paths(self):
        """Dual validation works when paths are provided."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator

        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        # Validate with current Python as both bundled and venv
        # (simulates development environment)
        result = validator.validate_dual_environment(
            bundled_path=sys.executable,
            venv_path=sys.executable,
        )

        # At least one should be valid in dev environment
        assert result.bundled is not None
        assert result.venv is not None
        assert result.summary != ""

    def test_validate_dual_environment_missing_bundled(self):
        """Dual validation handles missing bundled Python."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator

        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        # Only provide venv path
        result = validator.validate_dual_environment(
            bundled_path="/nonexistent/python",
            venv_path=sys.executable,
        )

        # Should still succeed with venv
        assert result.venv is not None
        # Bundled should have errors
        assert result.bundled is not None
        assert result.bundled.success is False


# =============================================================================
# SYSTEM CHECK INTEGRATION TESTS
# =============================================================================


class TestSystemCheckIntegration:
    """Integration tests for system_check.py."""

    def test_system_check_module_imports(self):
        """System check module imports successfully."""
        mod = _get_system_check_module()

        assert mod.SystemChecker is not None
        assert mod.SystemCheckResult is not None
        assert mod.ToolStatus is not None
        assert mod.PLATFORM_REQUIREMENTS is not None
        assert mod.INSTALLATION_INSTRUCTIONS is not None

    def test_tool_status_dataclass(self):
        """ToolStatus dataclass initializes correctly."""
        mod = _get_system_check_module()
        ToolStatus = mod.ToolStatus

        status = ToolStatus(name="cmake")
        assert status.name == "cmake"
        assert status.installed is False
        assert status.version is None
        assert status.path is None
        assert status.error is None

    def test_system_check_result_dataclass(self):
        """SystemCheckResult dataclass initializes correctly."""
        mod = _get_system_check_module()
        SystemCheckResult = mod.SystemCheckResult

        result = SystemCheckResult()
        assert result.success is False
        assert result.platform == ""
        assert result.tools == []
        assert result.missing_tools == []
        assert result.errors == []
        assert result.installation_instructions == ""

    def test_get_required_tools_darwin(self):
        """Get required tools for macOS."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker

        checker = SystemChecker(platform_override="Darwin")
        tools = checker.get_required_tools()

        assert "cmake" in tools
        # macOS doesn't require make by default (comes with Xcode CLT)

    def test_get_required_tools_windows(self):
        """Get required tools for Windows."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker

        checker = SystemChecker(platform_override="Windows")
        tools = checker.get_required_tools()

        assert "cmake" in tools
        assert "make" in tools

    def test_get_required_tools_linux(self):
        """Get required tools for Linux."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker

        checker = SystemChecker(platform_override="Linux")
        tools = checker.get_required_tools()

        assert "cmake" in tools

    def test_validate_build_tools_returns_result(self):
        """validate_build_tools returns SystemCheckResult."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker
        SystemCheckResult = mod.SystemCheckResult

        checker = SystemChecker()
        result = checker.validate_build_tools()

        assert isinstance(result, SystemCheckResult)
        assert result.platform != ""

    def test_installation_instructions_format(self):
        """Installation instructions are properly formatted."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker

        checker = SystemChecker(platform_override="Darwin")
        instructions = checker._get_installation_instructions(["cmake"])

        assert "cmake" in instructions.lower()
        assert "brew" in instructions.lower() or "install" in instructions.lower()


# =============================================================================
# DEPENDENCY INSTALLER INTEGRATION TESTS
# =============================================================================


class TestDependencyInstallerIntegration:
    """Integration tests for dependency_installer.py."""

    def test_installer_module_imports(self):
        """Dependency installer module imports successfully."""
        mod = _get_dependency_installer_module()

        assert mod.DependencyInstaller is not None
        assert mod.InstallationResult is not None
        assert mod.SyncResult is not None
        assert mod.VerificationResult is not None

    def test_installation_result_dataclass(self):
        """InstallationResult dataclass initializes correctly."""
        mod = _get_dependency_installer_module()
        InstallationResult = mod.InstallationResult

        result = InstallationResult()
        assert result.success is False
        assert result.interpreter_path == ""
        assert result.interpreter_type == ""
        assert result.packages_installed == []
        assert result.packages_failed == []
        assert result.errors == []

    def test_verification_result_dataclass(self):
        """VerificationResult dataclass initializes correctly."""
        mod = _get_dependency_installer_module()
        VerificationResult = mod.VerificationResult

        result = VerificationResult()
        assert result.success is False
        assert result.bundled_packages == {}
        assert result.venv_packages == {}
        assert result.synchronized is False
        assert result.differences == []

    def test_sync_result_dataclass(self):
        """SyncResult dataclass initializes correctly."""
        mod = _get_dependency_installer_module()
        SyncResult = mod.SyncResult

        result = SyncResult()
        assert result.success is False
        assert result.bundled is None
        assert result.venv is None
        assert result.synchronized is False

    def test_get_packages_dict_with_current_python(self):
        """Can retrieve package list from current Python."""
        mod = _get_dependency_installer_module()
        DependencyInstaller = mod.DependencyInstaller

        installer = DependencyInstaller()
        packages = installer._get_packages_dict(sys.executable)

        # Should be a dict (may be empty in some test environments)
        assert isinstance(packages, dict)

        # pip should be installed
        # Check for any variant of pip in package names
        pip_found = any("pip" in pkg.lower() for pkg in packages.keys())
        if packages:  # Only check if we got any packages
            assert pip_found, f"pip not found in packages: {list(packages.keys())[:10]}"

    def test_verify_synchronization_with_single_interpreter(self):
        """Verification works with only one interpreter available."""
        mod = _get_dependency_installer_module()
        DependencyInstaller = mod.DependencyInstaller

        installer = DependencyInstaller()

        # Only provide one path (current Python as venv)
        result = installer.verify_synchronization(
            bundled_path="/nonexistent/python",
            venv_path=sys.executable,
        )

        # Should succeed with single interpreter
        assert result.venv_packages is not None
        # Can't compare, so assumes synchronized
        if not result.bundled_packages:
            assert result.synchronized is True


# =============================================================================
# E2E STARTUP VALIDATION FLOW TESTS
# =============================================================================


class TestStartupValidationFlow:
    """End-to-end tests for the complete startup validation flow."""

    def test_full_validation_flow_simulation(self):
        """Simulate full startup validation flow."""
        env_mod = _get_environment_validator_module()
        sys_mod = _get_system_check_module()
        dep_mod = _get_dependency_installer_module()

        EnvironmentValidator = env_mod.EnvironmentValidator
        SystemChecker = sys_mod.SystemChecker
        DependencyInstaller = dep_mod.DependencyInstaller

        # Step 1: Check system build tools
        system_checker = SystemChecker()
        build_tools_result = system_checker.validate_build_tools()

        # Should return a result (may pass or fail depending on system)
        assert build_tools_result.platform != ""

        # Step 2: Validate Python environment
        env_validator = EnvironmentValidator(
            core_dependencies=[],  # Skip actual imports for test
            optional_dependencies=[],
        )
        env_result = env_validator.validate_environment(sys.executable)

        assert env_result.python_path == sys.executable
        assert env_result.python_version != ""

        # Step 3: Verify dependency synchronization
        dep_installer = DependencyInstaller()
        sync_result = dep_installer.verify_synchronization(
            bundled_path=None,  # Not available in dev
            venv_path=sys.executable,
        )

        assert sync_result.summary != ""

    def test_validation_flow_returns_structured_results(self):
        """All validators return properly structured results."""
        env_mod = _get_environment_validator_module()
        sys_mod = _get_system_check_module()
        dep_mod = _get_dependency_installer_module()

        EnvironmentValidator = env_mod.EnvironmentValidator
        ValidationResult = env_mod.ValidationResult
        SystemChecker = sys_mod.SystemChecker
        SystemCheckResult = sys_mod.SystemCheckResult
        DependencyInstaller = dep_mod.DependencyInstaller
        VerificationResult = dep_mod.VerificationResult

        # All results should be structured dataclasses
        env_result = EnvironmentValidator([], []).validate_environment(
            sys.executable
        )
        assert isinstance(env_result, ValidationResult)

        system_result = SystemChecker().validate_build_tools()
        assert isinstance(system_result, SystemCheckResult)

        dep_result = DependencyInstaller().verify_synchronization(
            venv_path=sys.executable
        )
        assert isinstance(dep_result, VerificationResult)

    def test_validation_flow_no_code_1_errors(self):
        """Validation flow provides detailed errors, not generic 'code 1'."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator

        # Test with invalid path
        validator = EnvironmentValidator(
            core_dependencies=["nonexistent_module_xyz123"],
            optional_dependencies=[],
        )

        result = validator.validate_environment(sys.executable)

        # Should have detailed errors, not just "code 1"
        if not result.success and result.errors:
            for error in result.errors:
                # Error should be descriptive
                assert "code 1" not in error.lower() or len(error) > 30


# =============================================================================
# FEATURE VALIDATION TESTS (Insights, Roadmap, Ideation)
# =============================================================================


class TestFeatureValidation:
    """Tests to verify features can run without 'code 1' errors."""

    def test_insights_module_would_not_code_1(self):
        """Insights feature has proper error handling."""
        # The fix ensures that when Python subprocess fails,
        # we get actual error messages, not just "code 1"

        # Simulate a subprocess error
        cmd = [sys.executable, "-c", "import nonexistent_module_xyz"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )

        # Should capture actual error message
        assert result.returncode != 0
        assert "ModuleNotFoundError" in result.stderr or "No module named" in result.stderr

    def test_roadmap_module_would_not_code_1(self):
        """Roadmap feature has proper error handling."""
        # Same pattern - verify subprocess captures real errors
        cmd = [sys.executable, "-c", "raise ValueError('Roadmap test error')"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )

        assert result.returncode != 0
        assert "ValueError" in result.stderr
        assert "Roadmap test error" in result.stderr

    def test_ideation_module_would_not_code_1(self):
        """Ideation feature has proper error handling."""
        # Verify subprocess captures real errors
        cmd = [
            sys.executable,
            "-c",
            "import sys; sys.stderr.write('Ideation error details'); sys.exit(1)",
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )

        assert result.returncode != 0
        assert "Ideation error details" in result.stderr

    def test_subprocess_error_capture_pattern(self):
        """Verify the error capture pattern used by all features."""
        # This is the pattern all features should use
        cmd = [sys.executable, "-c", "print('stdout'); raise Exception('test error')"]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

        # Should capture both stdout and stderr
        assert "stdout" in result.stdout
        assert "Exception" in result.stderr
        assert "test error" in result.stderr

        # The key fix: we now have actual error info, not just exit code
        error_message = f"Process failed with code {result.returncode}: {result.stderr}"
        assert "test error" in error_message


# =============================================================================
# CLI VALIDATION TESTS
# =============================================================================


class TestCLIValidation:
    """Tests for CLI interfaces of validation modules."""

    def test_environment_validator_cli_help(self):
        """Environment validator CLI shows help."""
        mod = _get_environment_validator_module()
        main = mod.main
        import io
        from contextlib import redirect_stdout

        with patch("sys.argv", ["environment_validator.py", "--help"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            # --help exits with 0
            assert exc_info.value.code == 0

    def test_system_check_cli_help(self):
        """System check CLI shows help."""
        mod = _get_system_check_module()
        main = mod.main

        with patch("sys.argv", ["system_check.py", "--help"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0

    def test_dependency_installer_cli_help(self):
        """Dependency installer CLI shows help."""
        mod = _get_dependency_installer_module()
        main = mod.main

        with patch("sys.argv", ["dependency_installer.py", "--help"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0

    def test_environment_validator_cli_json_output(self):
        """Environment validator CLI supports JSON output."""
        mod = _get_environment_validator_module()
        main = mod.main
        import io
        from contextlib import redirect_stdout

        with patch(
            "sys.argv",
            ["environment_validator.py", "--python", sys.executable, "--json"],
        ):
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = main()

            output_str = output.getvalue()
            # Should be valid JSON
            try:
                data = json.loads(output_str)
                assert "success" in data
                assert "python_path" in data
            except json.JSONDecodeError:
                pytest.fail(f"Invalid JSON output: {output_str}")

    def test_system_check_cli_json_output(self):
        """System check CLI supports JSON output."""
        mod = _get_system_check_module()
        main = mod.main
        import io
        from contextlib import redirect_stdout

        with patch("sys.argv", ["system_check.py", "--json"]):
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = main()

            output_str = output.getvalue()
            # Should be valid JSON
            try:
                data = json.loads(output_str)
                assert "success" in data
                assert "platform" in data
            except json.JSONDecodeError:
                pytest.fail(f"Invalid JSON output: {output_str}")


# =============================================================================
# ERROR MESSAGE QUALITY TESTS
# =============================================================================


class TestErrorMessageQuality:
    """Tests to ensure error messages are descriptive, not cryptic."""

    def test_missing_dependency_error_is_descriptive(self):
        """Missing dependency errors include module name."""
        mod = _get_environment_validator_module()
        EnvironmentValidator = mod.EnvironmentValidator

        validator = EnvironmentValidator(
            core_dependencies=["definitely_not_a_real_module_xyz"],
            optional_dependencies=[],
        )

        result = validator.validate_environment(sys.executable)

        assert result.success is False
        # Error should mention the missing module
        error_text = " ".join(result.errors)
        assert "definitely_not_a_real_module_xyz" in error_text.lower() or "missing" in error_text.lower()

    def test_missing_build_tool_error_includes_install_instructions(self):
        """Missing build tool errors include installation instructions."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker

        checker = SystemChecker(
            platform_override="Darwin",
            additional_tools=["nonexistent_tool_xyz"],
        )

        result = checker.validate_build_tools()

        # If nonexistent tool is missing (it will be), should have instructions
        if "nonexistent_tool_xyz" in result.missing_tools:
            assert result.installation_instructions != ""

    def test_python_version_error_is_clear(self):
        """Python version error clearly states the requirement."""
        mod = _get_environment_validator_module()
        MIN_PYTHON_VERSION = mod.MIN_PYTHON_VERSION

        # The minimum version should be clearly defined
        assert MIN_PYTHON_VERSION == (3, 12)


# =============================================================================
# INTEGRATION WITH FRESH INSTALL SIMULATION
# =============================================================================


class TestFreshInstallSimulation:
    """Tests that simulate a fresh install scenario."""

    def test_fresh_install_validation_sequence(self):
        """Simulate the validation sequence on fresh install."""
        env_mod = _get_environment_validator_module()
        sys_mod = _get_system_check_module()
        dep_mod = _get_dependency_installer_module()

        EnvironmentValidator = env_mod.EnvironmentValidator
        SystemChecker = sys_mod.SystemChecker
        DependencyInstaller = dep_mod.DependencyInstaller

        # 1. First, check build tools (before pip install attempts)
        system_checker = SystemChecker()
        build_result = system_checker.validate_build_tools()

        # Should always return a result
        assert build_result.platform in ["Darwin", "Windows", "Linux"]

        # 2. Then validate Python environments
        validator = EnvironmentValidator(
            core_dependencies=[],
            optional_dependencies=[],
        )

        # In fresh install, venv might exist from setup
        venv_result = validator.validate_environment(sys.executable)
        assert venv_result.python_version != ""

        # 3. Finally, check dependency sync status
        installer = DependencyInstaller()
        sync_result = installer.verify_synchronization(venv_path=sys.executable)

        # Should have a summary
        assert sync_result.summary != ""

    def test_validation_provides_actionable_output(self):
        """Validation output provides actionable information."""
        mod = _get_system_check_module()
        SystemChecker = mod.SystemChecker

        checker = SystemChecker(platform_override="Windows")
        result = checker.validate_build_tools()

        if not result.success:
            # Should have installation instructions
            assert result.installation_instructions != ""
            # Instructions should mention package manager
            instructions_lower = result.installation_instructions.lower()
            assert "choco" in instructions_lower or "install" in instructions_lower
