#!/usr/bin/env python3
"""
Tests for dependency_validator module.

Tests cover:
- Platform-specific dependency validation
- pywin32 validation on Windows Python 3.12+
- Helpful error messages for missing dependencies
- No validation on non-Windows platforms
- No validation on Python < 3.12
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add apps/backend directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from core.dependency_validator import validate_platform_dependencies, _exit_with_pywin32_error


# =============================================================================
# TESTS FOR validate_platform_dependencies
# =============================================================================


class TestValidatePlatformDependencies:
    """Tests for validate_platform_dependencies function."""

    def test_windows_python_312_with_pywin32_missing_exits(self):
        """
        Windows + Python 3.12+ without pywin32 should exit with helpful message.

        This is the primary fix for ACS-253: ensure users get a clear error
        message instead of a cryptic pywintypes import error.
        """
        import builtins

        with patch("sys.platform", "win32"), \
             patch("sys.version_info", (3, 12, 0)), \
             patch("core.dependency_validator._exit_with_pywin32_error") as mock_exit:

            # Mock pywintypes import to raise ImportError
            original_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "pywintypes":
                    raise ImportError("No module named 'pywintypes'")
                return original_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                validate_platform_dependencies()

            # Should have called the error exit function
            mock_exit.assert_called_once()

    def test_windows_python_312_with_pywin32_installed_continues(self):
        """Windows + Python 3.12+ with pywin32 installed should continue."""
        import builtins

        # Capture the original __import__ before any patching
        original_import = builtins.__import__

        def selective_mock(name, *args, **kwargs):
            """Return mock for pywintypes, delegate everything else to original."""
            if name == "pywintypes":
                return MagicMock()
            return original_import(name, *args, **kwargs)

        with patch("sys.platform", "win32"), \
             patch("sys.version_info", (3, 12, 0)), \
             patch("builtins.__import__", side_effect=selective_mock):
            # Should not raise SystemExit
            validate_platform_dependencies()

    def test_windows_python_311_skips_validation(self):
        """Windows + Python < 3.12 should skip pywin32 validation."""
        with patch("sys.platform", "win32"), \
             patch("sys.version_info", (3, 11, 0)), \
             patch("builtins.__import__") as mock_import:
            # Even if pywintypes is not available, should not exit
            mock_import.side_effect = ImportError("No module named 'pywintypes'")

            # Should not raise SystemExit
            validate_platform_dependencies()

    def test_linux_skips_validation(self):
        """Non-Windows platforms should skip pywin32 validation."""
        with patch("sys.platform", "linux"), \
             patch("sys.version_info", (3, 12, 0)), \
             patch("builtins.__import__") as mock_import:
            # Even if pywintypes is not available, should not exit
            mock_import.side_effect = ImportError("No module named 'pywintypes'")

            # Should not raise SystemExit
            validate_platform_dependencies()

    def test_macos_skips_validation(self):
        """macOS should skip pywin32 validation."""
        with patch("sys.platform", "darwin"), \
             patch("sys.version_info", (3, 12, 0)), \
             patch("builtins.__import__") as mock_import:
            # Even if pywintypes is not available, should not exit
            mock_import.side_effect = ImportError("No module named 'pywintypes'")

            # Should not raise SystemExit
            validate_platform_dependencies()

    def test_windows_python_313_validates(self):
        """Windows + Python 3.13+ should validate pywin32."""
        import builtins

        with patch("sys.platform", "win32"), \
             patch("sys.version_info", (3, 13, 0)), \
             patch("core.dependency_validator._exit_with_pywin32_error") as mock_exit:

            original_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "pywintypes":
                    raise ImportError("No module named 'pywintypes'")
                return original_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                validate_platform_dependencies()

            # Should have called the error exit function
            mock_exit.assert_called_once()

    def test_windows_python_310_skips_validation(self):
        """Windows + Python 3.10 should skip pywin32 validation."""
        with patch("sys.platform", "win32"), \
             patch("sys.version_info", (3, 10, 0)), \
             patch("builtins.__import__") as mock_import:
            mock_import.side_effect = ImportError("No module named 'pywintypes'")

            # Should not raise SystemExit
            validate_platform_dependencies()


# =============================================================================
# TESTS FOR _exit_with_pywin32_error
# =============================================================================


class TestExitWithPywin32Error:
    """Tests for _exit_with_pywin32_error function."""

    def test_exit_message_contains_helpful_instructions(self):
        """Error message should include installation instructions."""
        with patch("sys.exit") as mock_exit:
            _exit_with_pywin32_error()

            # Get the message passed to sys.exit
            call_args = mock_exit.call_args[0][0]
            message = str(call_args)

            # Verify helpful content
            assert "pywin32" in message.lower()
            assert "pip install" in message.lower()
            assert "windows" in message.lower()
            assert "python" in message.lower()

    def test_exit_message_contains_venv_path(self):
        """Error message should include the virtual environment path."""
        with patch("sys.exit") as mock_exit, \
             patch("sys.prefix", "/path/to/venv"):

            _exit_with_pywin32_error()

            # Get the message passed to sys.exit
            call_args = mock_exit.call_args[0][0]
            message = str(call_args)

            # Should reference the full venv Scripts/activate path
            # Path separators differ by platform: / on Unix, \ on Windows
            # pathlib normalizes /path/to/venv to \path\to\venv on Windows
            expected_path = str(Path("/path/to/venv"))
            assert expected_path in message or "/path/to/venv" in message
            assert "Scripts" in message

    def test_exit_message_contains_python_executable(self):
        """Error message should include the current Python executable."""
        with patch("sys.exit") as mock_exit, \
             patch("sys.executable", "/usr/bin/python3.12"):

            _exit_with_pywin32_error()

            # Get the message passed to sys.exit
            call_args = mock_exit.call_args[0][0]
            message = str(call_args)

            # Should reference the current Python executable
            assert "python" in message.lower()


# =============================================================================
# TESTS FOR IMPORT ORDER (ACS-253 FIX)
# =============================================================================


class TestImportOrderPreventsEarlyFailure:
    """
    Tests that validate the ACS-253 fix: dependency validation happens
    BEFORE graphiti imports that trigger pywintypes.
    """

    def test_validate_platform_dependencies_does_not_import_graphiti(self):
        """
        validate_platform_dependencies should not trigger graphiti imports.

        This test ensures the fix for ACS-253 is working: the dependency
        validator runs early and doesn't import modules that would trigger
        the graphiti_core -> real_ladybug -> pywintypes import chain.
        """
        import builtins

        # Track imports made during validation
        imported_modules = set()
        original_import = builtins.__import__

        def tracking_import(name, *args, **kwargs):
            imported_modules.add(name)
            return original_import(name, *args, **kwargs)

        # Use non-Windows to avoid import issues
        with patch("builtins.__import__", side_effect=tracking_import), \
             patch("sys.platform", "linux"), \
             patch("sys.version_info", (3, 11, 0)):

            validate_platform_dependencies()

        # Verify graphiti-related modules were NOT imported
        assert "graphiti_core" not in imported_modules
        assert "real_ladybug" not in imported_modules
        assert "graphiti_config" not in imported_modules

    def test_cli_utils_lazy_import_of_graphiti_config(self):
        """
        cli/utils.py directly imports graphiti_config lazily in validate_environment().

        The fix ensures that graphiti_config is NOT imported at the module level
        in cli/utils.py (line 59). Instead, it's imported lazily inside the
        validate_environment() function where it's actually used.

        Note: graphiti_config may still be imported transitively through other
        modules imported by cli.utils (e.g., linear_integration, spec.pipeline).
        The key fix is that the DIRECT import from cli/utils.py is lazy.
        """
        import ast

        # Read cli/utils.py to verify the import is NOT at module level
        backend_dir = Path(__file__).parent.parent / "apps" / "backend"
        utils_py = backend_dir / "cli" / "utils.py"
        utils_content = utils_py.read_text()

        # Parse the file with AST to find the first function definition
        tree = ast.parse(utils_content)

        # Find the line number of the first top-level function
        first_function_lineno = None
        for node in tree.body:
            if isinstance(node, ast.FunctionDef):
                first_function_lineno = node.lineno
                break
            elif isinstance(node, (ast.AsyncFunctionDef, ast.ClassDef)):
                # Skip async functions and classes, find first regular function
                continue

        assert first_function_lineno is not None, "Could not find first function in cli/utils.py"

        # Check module-level imports (before the first function)
        lines = utils_content.split("\n")
        module_level_imports = "\n".join(lines[:first_function_lineno])

        assert "from graphiti_config import" not in module_level_imports, \
            "graphiti_config should not be imported at module level in cli/utils.py"

        # Verify that graphiti_config IS imported inside validate_environment()
        validate_env_lineno = None
        validate_env_end_lineno = len(lines)  # Initialize to end of file
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == "validate_environment":
                validate_env_lineno = node.lineno
                # Find the end of the function (next top-level node or end of file)
                node_index = tree.body.index(node)
                if node_index + 1 < len(tree.body):
                    next_node = tree.body[node_index + 1]
                    validate_env_end_lineno = next_node.lineno
                break

        assert validate_env_lineno is not None, "Could not find validate_environment function"

        # Look for the import within the function's body
        validate_env_block = "\n".join(lines[validate_env_lineno - 1:validate_env_end_lineno])
        assert "from graphiti_config import get_graphiti_status" in validate_env_block, \
            "graphiti_config should be imported inside validate_environment()"

    def test_entry_points_validate_before_cli_imports(self):
        """
        Entry points (run.py, spec_runner.py) should validate dependencies
        BEFORE importing cli modules that might trigger graphiti imports.
        """
        # Read entry point files and verify the order
        backend_dir = Path(__file__).parent.parent / "apps" / "backend"

        # Check run.py
        run_py = backend_dir / "run.py"
        run_content = run_py.read_text()

        # Verify validate_platform_dependencies is imported and called
        assert "validate_platform_dependencies" in run_content, \
            "run.py should import validate_platform_dependencies"

        # Find the position of validation call and cli import
        validation_pos = run_content.find("validate_platform_dependencies()")
        cli_import_pos = run_content.find("from cli import main")

        assert validation_pos > 0, "run.py should call validate_platform_dependencies"
        assert cli_import_pos > 0, "run.py should import cli.main"
        assert validation_pos < cli_import_pos, \
            "run.py should validate dependencies BEFORE importing cli.main"

        # Check spec_runner.py
        spec_runner_py = backend_dir / "runners" / "spec_runner.py"
        spec_runner_content = spec_runner_py.read_text()

        assert "validate_platform_dependencies" in spec_runner_content, \
            "spec_runner.py should import validate_platform_dependencies"

        # Find positions
        validation_pos_spec = spec_runner_content.find("validate_platform_dependencies()")
        cli_utils_import_pos = spec_runner_content.find("from cli.utils import")

        assert validation_pos_spec > 0, "spec_runner.py should call validate_platform_dependencies"
        assert cli_utils_import_pos > 0, "spec_runner.py should import cli.utils"
        assert validation_pos_spec < cli_utils_import_pos, \
            "spec_runner.py should validate dependencies BEFORE importing cli.utils"


# =============================================================================
# TESTS FOR CLI UTILS FUNCTIONS
# =============================================================================


class TestCliUtilsFindSpec:
    """Tests for find_spec function in cli/utils.py."""

    def test_find_spec_by_number(self, temp_dir):
        """Find spec by number prefix."""
        from cli.utils import find_spec

        # Create spec directory
        specs_dir = temp_dir / ".auto-claude" / "specs"
        specs_dir.mkdir(parents=True)
        spec_dir = specs_dir / "001-test-feature"
        spec_dir.mkdir()
        (spec_dir / "spec.md").write_text("# Test Spec")

        result = find_spec(temp_dir, "001")
        assert result == spec_dir

    def test_find_spec_by_full_name(self, temp_dir):
        """Find spec by full directory name."""
        from cli.utils import find_spec

        specs_dir = temp_dir / ".auto-claude" / "specs"
        specs_dir.mkdir(parents=True)
        spec_dir = specs_dir / "001-test-feature"
        spec_dir.mkdir()
        (spec_dir / "spec.md").write_text("# Test Spec")

        result = find_spec(temp_dir, "001-test-feature")
        assert result == spec_dir

    def test_find_spec_returns_none_when_not_found(self, temp_dir):
        """Return None when spec doesn't exist."""
        from cli.utils import find_spec

        result = find_spec(temp_dir, "999")
        assert result is None

    def test_find_spec_requires_spec_md(self, temp_dir):
        """Require spec.md to exist in the directory."""
        from cli.utils import find_spec

        specs_dir = temp_dir / ".auto-claude" / "specs"
        specs_dir.mkdir(parents=True)
        spec_dir = specs_dir / "001-test-feature"
        spec_dir.mkdir()
        # Don't create spec.md

        result = find_spec(temp_dir, "001")
        assert result is None


class TestCliUtilsGetProjectDir:
    """Tests for get_project_dir function."""

    def test_get_project_dir_returns_provided_dir(self, temp_dir):
        """Return provided directory when given."""
        from cli.utils import get_project_dir

        result = get_project_dir(temp_dir)
        # Resolve symlinks for comparison (macOS /var -> /private/var)
        assert result.resolve() == temp_dir.resolve()

    def test_get_project_dir_auto_detects_backend(self, temp_dir):
        """Auto-detect when running from apps/backend directory."""
        from cli.utils import get_project_dir

        # Create apps/backend structure
        backend_dir = temp_dir / "apps" / "backend"
        backend_dir.mkdir(parents=True)
        (backend_dir / "run.py").write_text("# run.py")

        # Change to backend directory
        import os
        original_cwd = os.getcwd()
        try:
            os.chdir(backend_dir)
            result = get_project_dir(None)
            # Should go up 2 levels from backend to project root
            # Resolve symlinks for comparison (macOS /var -> /private/var)
            assert result.resolve() == temp_dir.resolve()
        finally:
            os.chdir(original_cwd)


class TestCliUtilsSetupEnvironment:
    """Tests for setup_environment function."""

    def test_setup_environment_returns_backend_dir(self):
        """
        setup_environment returns the script directory (apps/backend).

        Note: The function uses Path(__file__).parent.parent.resolve() which
        always points to the actual cli/utils.py location (apps/backend),
        not a temporary directory. This test verifies the expected behavior.
        """
        from cli.utils import setup_environment

        # Setup environment
        script_dir = setup_environment()

        # Verify script_dir is the apps/backend directory
        # Use case-insensitive comparison for macOS filesystem compatibility
        assert script_dir.name.lower() == "backend"
        assert script_dir.parent.name.lower() == "apps"

    def test_setup_environment_adds_to_path(self):
        """Add script directory to sys.path."""
        from cli.utils import setup_environment

        script_dir = setup_environment()

        # Verify script_dir is in sys.path
        assert str(script_dir) in sys.path
