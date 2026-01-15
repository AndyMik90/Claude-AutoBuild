"""
System Health Check
===================

Comprehensive health checks for Auto Claude system components.
Validates .env configuration vs application settings vs actual runtime state.
"""

import os
import sys
from pathlib import Path
from typing import Dict, List, Any

# Ensure parent directory is in path for imports
_PARENT_DIR = Path(__file__).parent
if str(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_DIR))

# Import with fallback for missing dependencies
try:
    from core.auth import get_auth_token, get_auth_token_source
except Exception as e:
    print(f"Warning: Failed to import auth: {e}", file=sys.stderr)
    def get_auth_token(): return None
    def get_auth_token_source(): return None

try:
    from integrations.graphiti.config import check_graphiti_health
except Exception as e:
    print(f"Warning: Failed to import graphiti: {e}", file=sys.stderr)
    def check_graphiti_health():
        return {"healthy": False, "checks": {}, "message": "Graphiti not available", "details": {}}

try:
    from linear_updater import is_linear_enabled
except Exception as e:
    print(f"Warning: Failed to import linear: {e}", file=sys.stderr)
    def is_linear_enabled(): return False


def check_python_environment() -> Dict[str, Any]:
    """Check Python environment is properly configured."""
    checks = {
        "python_version_ok": False,
        "venv_active": False,
        "dependencies_installed": False,
    }
    details = {}

    # Check Python version (3.12+)
    version = sys.version_info
    checks["python_version_ok"] = version >= (3, 12)
    details["python_version"] = f"{version.major}.{version.minor}.{version.micro}"

    # Check if virtual environment is active
    checks["venv_active"] = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
    details["venv_path"] = sys.prefix if checks["venv_active"] else None

    # Check key dependencies
    try:
        import anthropic
        checks["dependencies_installed"] = True
        details["anthropic_version"] = getattr(anthropic, '__version__', 'unknown')
    except ImportError as e:
        checks["dependencies_installed"] = False
        details["import_error"] = str(e)

    healthy = all(checks.values())
    message = "Python environment OK" if healthy else "Python environment issues detected"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_git_configuration() -> Dict[str, Any]:
    """Check Git is available and configured."""
    checks = {
        "git_available": False,
        "git_user_configured": False,
    }
    details = {}

    try:
        import subprocess

        # Check git is available
        result = subprocess.run(['git', '--version'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            checks["git_available"] = True
            details["git_version"] = result.stdout.strip()

        # Check git user is configured
        result = subprocess.run(['git', 'config', 'user.name'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            checks["git_user_configured"] = True
            details["git_user"] = result.stdout.strip()
    except Exception as e:
        details["error"] = str(e)

    healthy = all(checks.values())
    message = "Git configured" if healthy else "Git configuration issues"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_claude_authentication() -> Dict[str, Any]:
    """Check Claude OAuth token is available."""
    checks = {
        "oauth_token_present": False,
        "token_source_identified": False,
    }
    details = {}

    token = get_auth_token()
    checks["oauth_token_present"] = bool(token)

    if token:
        source = get_auth_token_source()
        checks["token_source_identified"] = bool(source)
        details["token_source"] = source

    healthy = all(checks.values())
    message = "Claude authentication OK" if healthy else "Claude authentication missing"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_integrations() -> Dict[str, Any]:
    """Check optional integrations (Graphiti, Linear, GitHub)."""
    checks = {}
    details = {}

    # Graphiti memory system
    graphiti_health = check_graphiti_health()
    checks["graphiti_enabled"] = graphiti_health["checks"].get("config_valid", False)
    checks["graphiti_healthy"] = graphiti_health["healthy"]
    details["graphiti"] = graphiti_health

    # Linear integration
    linear_enabled = is_linear_enabled()
    checks["linear_enabled"] = linear_enabled
    if linear_enabled:
        details["linear_api_key"] = "***" if os.getenv("LINEAR_API_KEY") else None

    # GitHub integration
    github_token = os.getenv("GITHUB_TOKEN")
    checks["github_enabled"] = bool(github_token)
    if github_token:
        details["github_token"] = "***"

    # GitLab integration
    gitlab_token = os.getenv("GITLAB_TOKEN")
    checks["gitlab_enabled"] = bool(gitlab_token)
    if gitlab_token:
        details["gitlab_token"] = "***"

    # Electron MCP (for E2E testing)
    electron_mcp_enabled = os.getenv("ELECTRON_MCP_ENABLED", "").lower() == "true"
    checks["electron_mcp_enabled"] = electron_mcp_enabled
    if electron_mcp_enabled:
        details["electron_debug_port"] = os.getenv("ELECTRON_DEBUG_PORT", "9222")

    healthy = True  # Integrations are optional
    message = "Integrations configured"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def check_environment_consistency() -> Dict[str, Any]:
    """
    Check consistency between .env file, environment variables, and runtime configuration.

    This validates that what's in .env matches what the application actually sees.
    """
    checks = {
        "env_file_readable": False,
        "critical_vars_consistent": True,
    }
    details = {
        "inconsistencies": [],
    }

    # Find .env file
    backend_dir = Path(__file__).parent
    env_file = backend_dir / ".env"

    if env_file.exists():
        checks["env_file_readable"] = True
        details["env_file_path"] = str(env_file)

        # Parse .env file and compare with os.environ
        try:
            from dotenv import dotenv_values
            env_values = dotenv_values(env_file)

            # Check critical environment variables
            critical_vars = [
                "CLAUDE_CODE_OAUTH_TOKEN",
                "ANTHROPIC_API_KEY",
                "GRAPHITI_ENABLED",
                "LINEAR_API_KEY",
                "GITHUB_TOKEN",
                "GITLAB_TOKEN",
            ]

            for var in critical_vars:
                env_file_value = env_values.get(var)
                runtime_value = os.getenv(var)

                # Only check if variable exists in .env
                if env_file_value is not None:
                    if env_file_value != runtime_value:
                        checks["critical_vars_consistent"] = False
                        details["inconsistencies"].append({
                            "variable": var,
                            "env_file": "***" if env_file_value else None,
                            "runtime": "***" if runtime_value else None,
                            "issue": "Value mismatch"
                        })
        except Exception as e:
            details["parse_error"] = str(e)
    else:
        details["env_file_path"] = "Not found"

    healthy = all(checks.values())
    message = "Environment consistent" if healthy else f"{len(details['inconsistencies'])} inconsistencies found"

    return {
        "healthy": healthy,
        "checks": checks,
        "details": details,
        "message": message,
    }


def run_system_health_check() -> Dict[str, Any]:
    """
    Run comprehensive system health check.

    Returns:
        Dict with overall health status and individual component results:
        {
            "healthy": bool,
            "timestamp": str,
            "checks": {
                "python": {...},
                "git": {...},
                "claude_auth": {...},
                "integrations": {...},
                "environment": {...},
            },
            "summary": {
                "total_checks": int,
                "passed": int,
                "failed": int,
            }
        }
    """
    from datetime import datetime

    # Run all checks
    results = {
        "python": check_python_environment(),
        "git": check_git_configuration(),
        "claude_auth": check_claude_authentication(),
        "integrations": check_integrations(),
        "environment": check_environment_consistency(),
    }

    # Calculate summary
    total_checks = len(results)
    passed = sum(1 for r in results.values() if r["healthy"])
    failed = total_checks - passed

    overall_healthy = all(r["healthy"] for r in results.values())

    return {
        "healthy": overall_healthy,
        "timestamp": datetime.now().isoformat(),
        "checks": results,
        "summary": {
            "total_checks": total_checks,
            "passed": passed,
            "failed": failed,
        }
    }
