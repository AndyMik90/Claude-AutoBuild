#!/usr/bin/env python3
"""
System Check Module
===================

Validates system build tools (make, cmake) availability for package compilation.
Some Python packages (like real_ladybug) require native compilation tools.

The system check is used by:
- Startup sequence: To verify build tools before pip installation
- Dependency installation: To pre-validate before attempting to compile packages
- Troubleshooting: To diagnose build failures with clear installation instructions

Usage:
    # Check tools for current platform (auto-detected)
    python services/system_check.py

    # Check tools for specific platform
    python services/system_check.py --platform macos
    python services/system_check.py --platform windows

    # Validate from code
    from system_check import SystemChecker

    checker = SystemChecker()
    result = checker.validate_build_tools()
    if not result.success:
        print(result.installation_instructions)
"""

from __future__ import annotations

import json
import platform
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Any


# =============================================================================
# CONSTANTS
# =============================================================================

# Build tools required by platform
# macOS: cmake is primary requirement (make is usually pre-installed with Xcode CLT)
# Windows: Both make and cmake are typically needed
# Linux: cmake is primary requirement (make is usually available)
PLATFORM_REQUIREMENTS = {
    "Darwin": ["cmake"],  # macOS - make comes with Xcode Command Line Tools
    "Windows": ["make", "cmake"],  # Windows needs both
    "Linux": ["cmake"],  # Linux - make usually pre-installed
}

# Installation instructions by platform and tool
INSTALLATION_INSTRUCTIONS = {
    "Darwin": {
        "cmake": "Install cmake using Homebrew: brew install cmake",
        "make": "Install Xcode Command Line Tools: xcode-select --install",
    },
    "Windows": {
        "cmake": "Install cmake using Chocolatey: choco install cmake -y\n"
        "Or download from: https://cmake.org/download/",
        "make": "Install make using Chocolatey: choco install make -y\n"
        "Or install MinGW/MSYS2 which includes make",
    },
    "Linux": {
        "cmake": "Install cmake using package manager:\n"
        "  Ubuntu/Debian: sudo apt-get install cmake\n"
        "  Fedora: sudo dnf install cmake\n"
        "  Arch: sudo pacman -S cmake",
        "make": "Install build-essential:\n"
        "  Ubuntu/Debian: sudo apt-get install build-essential\n"
        "  Fedora: sudo dnf groupinstall 'Development Tools'\n"
        "  Arch: sudo pacman -S base-devel",
    },
}


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class ToolStatus:
    """
    Status of a single build tool.

    Attributes:
        name: Name of the tool (e.g., "cmake", "make")
        installed: Whether the tool is available on PATH
        version: Version string if available
        path: Path to the tool executable
        error: Error message if check failed
    """

    name: str
    installed: bool = False
    version: str | None = None
    path: str | None = None
    error: str | None = None


@dataclass
class SystemCheckResult:
    """
    Result of system build tools validation.

    Attributes:
        success: Whether all required tools are available
        platform: Platform name (Darwin, Windows, Linux)
        tools: List of tool statuses
        missing_tools: List of missing tool names
        errors: List of error messages
        installation_instructions: Instructions to install missing tools
    """

    success: bool = False
    platform: str = ""
    tools: list[ToolStatus] = field(default_factory=list)
    missing_tools: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    installation_instructions: str = ""


# =============================================================================
# SYSTEM CHECKER
# =============================================================================


class SystemChecker:
    """
    Validates system build tools for Auto-Claude.

    Checks:
    - cmake availability (required for compiling native packages)
    - make availability (required on Windows, usually pre-installed on Unix)
    - Version information when available
    """

    def __init__(
        self,
        platform_override: str | None = None,
        additional_tools: list[str] | None = None,
    ) -> None:
        """
        Initialize the system checker.

        Args:
            platform_override: Override platform detection (Darwin, Windows, Linux)
            additional_tools: Additional tools to check beyond platform defaults
        """
        self.platform_name = platform_override or platform.system()
        self.additional_tools = additional_tools or []

    def get_required_tools(self) -> list[str]:
        """
        Get list of required tools for the current platform.

        Returns:
            List of tool names required for this platform
        """
        tools = PLATFORM_REQUIREMENTS.get(self.platform_name, ["cmake"])
        return list(tools) + self.additional_tools

    def validate_build_tools(self) -> SystemCheckResult:
        """
        Validate all required build tools are available.

        Returns:
            SystemCheckResult with detailed status
        """
        result = SystemCheckResult(platform=self.platform_name)
        required_tools = self.get_required_tools()

        for tool in required_tools:
            status = self._check_tool(tool)
            result.tools.append(status)

            if not status.installed:
                result.missing_tools.append(tool)
                result.errors.append(f"Build tool '{tool}' not found")

        # Build installation instructions for missing tools
        if result.missing_tools:
            instructions = self._get_installation_instructions(result.missing_tools)
            result.installation_instructions = instructions

        result.success = len(result.missing_tools) == 0

        return result

    def _check_tool(self, tool_name: str) -> ToolStatus:
        """
        Check if a build tool is installed.

        Args:
            tool_name: Name of the tool to check

        Returns:
            ToolStatus with installation result
        """
        status = ToolStatus(name=tool_name)

        try:
            # Try to get version using --version flag
            result = subprocess.run(
                [tool_name, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode == 0:
                status.installed = True
                # Parse version from first line of output
                output = result.stdout.strip() or result.stderr.strip()
                if output:
                    # Take first line and extract version info
                    first_line = output.split("\n")[0]
                    status.version = self._extract_version(first_line, tool_name)

                # Try to get full path using 'which' or 'where'
                status.path = self._get_tool_path(tool_name)
            else:
                status.installed = False
                status.error = f"Tool returned non-zero exit code: {result.returncode}"

        except FileNotFoundError:
            status.installed = False
            status.error = f"'{tool_name}' not found in PATH"
        except subprocess.TimeoutExpired:
            status.installed = False
            status.error = f"Timeout while checking '{tool_name}'"
        except Exception as e:
            status.installed = False
            status.error = str(e)

        return status

    def _extract_version(self, output: str, tool_name: str) -> str:
        """
        Extract version string from tool output.

        Args:
            output: Raw output from --version command
            tool_name: Name of the tool for context

        Returns:
            Extracted or cleaned version string
        """
        # Common patterns for version extraction
        import re

        # Try to find version pattern like "X.Y.Z" or "X.Y"
        version_pattern = re.search(r"(\d+\.\d+(?:\.\d+)?)", output)
        if version_pattern:
            return version_pattern.group(1)

        # If no version found, return first 50 chars of output
        return output[:50] if len(output) > 50 else output

    def _get_tool_path(self, tool_name: str) -> str | None:
        """
        Get the full path to a tool executable.

        Args:
            tool_name: Name of the tool

        Returns:
            Full path or None if not found
        """
        try:
            # Use 'where' on Windows, 'which' on Unix
            cmd = "where" if self.platform_name == "Windows" else "which"

            result = subprocess.run(
                [cmd, tool_name],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode == 0:
                # Return first path if multiple found
                return result.stdout.strip().split("\n")[0]

        except Exception:
            pass

        return None

    def _get_installation_instructions(self, missing_tools: list[str]) -> str:
        """
        Get installation instructions for missing tools.

        Args:
            missing_tools: List of tool names that are missing

        Returns:
            Formatted installation instructions
        """
        instructions = []
        platform_instructions = INSTALLATION_INSTRUCTIONS.get(self.platform_name, {})

        for tool in missing_tools:
            if tool in platform_instructions:
                instructions.append(f"  {tool}: {platform_instructions[tool]}")
            else:
                instructions.append(f"  {tool}: Install using your system package manager")

        if instructions:
            header = f"Missing build tools on {self.platform_name}:\n"
            return header + "\n".join(instructions)

        return ""


# =============================================================================
# CLI
# =============================================================================


def main() -> int:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Validate system build tools for Auto-Claude",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Check tools for current platform
    python services/system_check.py

    # Check tools for specific platform
    python services/system_check.py --platform macos
    python services/system_check.py --platform windows

    # Check additional custom tools
    python services/system_check.py --tools gcc g++
        """,
    )
    parser.add_argument(
        "--platform",
        type=str,
        choices=["macos", "windows", "linux"],
        default=None,
        help="Platform to check (defaults to auto-detect)",
    )
    parser.add_argument(
        "--tools",
        nargs="*",
        default=[],
        help="Additional tools to check",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show detailed tool information",
    )

    args = parser.parse_args()

    # Map CLI platform names to platform.system() values
    platform_map = {
        "macos": "Darwin",
        "windows": "Windows",
        "linux": "Linux",
    }

    platform_override = None
    if args.platform:
        platform_override = platform_map.get(args.platform.lower())

    checker = SystemChecker(
        platform_override=platform_override,
        additional_tools=args.tools,
    )

    result = checker.validate_build_tools()
    return _output_result(result, args.json, args.verbose)


def _output_result(result: SystemCheckResult, as_json: bool, verbose: bool) -> int:
    """Output validation result."""
    if as_json:
        output: dict[str, Any] = {
            "success": result.success,
            "platform": result.platform,
            "missing_tools": result.missing_tools,
            "errors": result.errors,
        }
        if verbose:
            output["tools"] = [
                {
                    "name": t.name,
                    "installed": t.installed,
                    "version": t.version,
                    "path": t.path,
                    "error": t.error,
                }
                for t in result.tools
            ]
        if result.installation_instructions:
            output["installation_instructions"] = result.installation_instructions

        print(json.dumps(output, indent=2))
    else:
        status = "OK" if result.success else "FAILED"
        print(f"Build Tools Validation: {status}")
        print(f"  Platform: {result.platform}")

        if verbose or result.missing_tools:
            print("\nTools:")
            for tool in result.tools:
                status_str = "OK" if tool.installed else "MISSING"
                version_str = f" (v{tool.version})" if tool.version else ""
                path_str = f" at {tool.path}" if tool.path and verbose else ""
                error_str = f" - {tool.error}" if tool.error else ""
                print(f"  {tool.name}: {status_str}{version_str}{path_str}{error_str}")

        if result.errors and not verbose:
            print("\nErrors:")
            for error in result.errors:
                print(f"  - {error}")

        if result.installation_instructions:
            print(f"\n{result.installation_instructions}")

    if result.success:
        print("\nBuild tools validation completed")

    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
