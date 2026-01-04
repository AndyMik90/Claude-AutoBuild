"""
Authentication helpers for Auto Claude.

Provides centralized authentication token resolution with fallback support
for multiple environment variables, and SDK environment variable passthrough
for custom API endpoints.
"""

import json
import os
import platform
import subprocess
from pathlib import Path

# Priority order for auth token resolution
# NOTE: We intentionally do NOT fall back to ANTHROPIC_API_KEY.
# Auto Claude is designed to use Claude Code OAuth tokens only.
# This prevents silent billing to user's API credits when OAuth fails.
AUTH_TOKEN_ENV_VARS = [
    "CLAUDE_CODE_OAUTH_TOKEN",  # OAuth token from Claude Code CLI
    "ANTHROPIC_AUTH_TOKEN",  # CCR/proxy token (for enterprise setups)
]

# Environment variables to pass through to SDK subprocess
# NOTE: ANTHROPIC_API_KEY is intentionally excluded to prevent silent API billing
SDK_ENV_VARS = [
    # API endpoint configuration
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    # Model overrides (from API Profile custom model mappings)
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    # SDK behavior configuration
    "NO_PROXY",
    "DISABLE_TELEMETRY",
    "DISABLE_COST_WARNINGS",
    "API_TIMEOUT_MS",
]


def get_token_from_keychain() -> str | None:
    """
    Get authentication token from system credential store.

    Reads Claude Code credentials from:
    - macOS: Keychain
    - Windows: Credential Manager
    - Linux: Not yet supported (use env var)

    Returns:
        Token string if found, None otherwise
    """
    system = platform.system()

    if system == "Darwin":
        return _get_token_from_macos_keychain()
    elif system == "Windows":
        return _get_token_from_windows_credential_files()
    else:
        # Linux: secret-service not yet implemented
        return None


def _get_token_from_macos_keychain() -> str | None:
    """Get token from macOS Keychain."""
    try:
        result = subprocess.run(
            [
                "/usr/bin/security",
                "find-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            return None

        credentials_json = result.stdout.strip()
        if not credentials_json:
            return None

        data = json.loads(credentials_json)
        token = data.get("claudeAiOauth", {}).get("accessToken")

        if not token:
            return None

        # Validate token format (Claude OAuth tokens start with sk-ant-oat01-)
        if not token.startswith("sk-ant-oat01-"):
            return None

        return token

    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError, Exception):
        return None


def _get_token_from_windows_credential_files() -> str | None:
    """Get token from Windows credential files.

    Claude Code on Windows stores credentials in ~/.claude/.credentials.json
    """
    try:
        # Claude Code stores credentials in ~/.claude/.credentials.json
        cred_paths = [
            os.path.expandvars(r"%USERPROFILE%\.claude\.credentials.json"),
            os.path.expandvars(r"%USERPROFILE%\.claude\credentials.json"),
            os.path.expandvars(r"%LOCALAPPDATA%\Claude\credentials.json"),
            os.path.expandvars(r"%APPDATA%\Claude\credentials.json"),
        ]

        for cred_path in cred_paths:
            if os.path.exists(cred_path):
                with open(cred_path, encoding="utf-8") as f:
                    data = json.load(f)
                    token = data.get("claudeAiOauth", {}).get("accessToken")
                    if token and token.startswith("sk-ant-oat01-"):
                        return token

        return None

    except (json.JSONDecodeError, KeyError, FileNotFoundError, Exception):
        return None


def get_auth_token() -> str | None:
    """
    Get authentication token from environment variables or system credential store.

    Checks multiple sources in priority order:
    1. CLAUDE_CODE_OAUTH_TOKEN (env var)
    2. ANTHROPIC_AUTH_TOKEN (CCR/proxy env var for enterprise setups)
    3. System credential store (macOS Keychain, Windows Credential Manager)

    NOTE: ANTHROPIC_API_KEY is intentionally NOT supported to prevent
    silent billing to user's API credits when OAuth is misconfigured.

    Returns:
        Token string if found, None otherwise
    """
    # First check environment variables
    for var in AUTH_TOKEN_ENV_VARS:
        token = os.environ.get(var)
        if token:
            return token

    # Fallback to system credential store
    return get_token_from_keychain()


def get_auth_token_source() -> str | None:
    """Get the name of the source that provided the auth token."""
    # Check environment variables first
    for var in AUTH_TOKEN_ENV_VARS:
        if os.environ.get(var):
            return var

    # Check if token came from system credential store
    if get_token_from_keychain():
        system = platform.system()
        if system == "Darwin":
            return "macOS Keychain"
        elif system == "Windows":
            return "Windows Credential Files"
        else:
            return "System Credential Store"

    return None


def require_auth_token() -> str:
    """
    Get authentication token or raise ValueError.

    Raises:
        ValueError: If no auth token is found in any supported source
    """
    token = get_auth_token()
    if not token:
        error_msg = (
            "No OAuth token found.\n\n"
            "Auto Claude requires Claude Code OAuth authentication.\n"
            "Direct API keys (ANTHROPIC_API_KEY) are not supported.\n\n"
        )
        # Provide platform-specific guidance
        system = platform.system()
        if system == "Darwin":
            error_msg += (
                "To authenticate:\n"
                "  1. Run: claude setup-token\n"
                "  2. The token will be saved to macOS Keychain automatically\n\n"
                "Or set CLAUDE_CODE_OAUTH_TOKEN in your .env file."
            )
        elif system == "Windows":
            error_msg += (
                "To authenticate:\n"
                "  1. Run: claude setup-token\n"
                "  2. The token should be saved to Windows Credential Manager\n\n"
                "If auto-detection fails, set CLAUDE_CODE_OAUTH_TOKEN in your .env file.\n"
                "Check: %LOCALAPPDATA%\\Claude\\credentials.json"
            )
        else:
            error_msg += (
                "To authenticate:\n"
                "  1. Run: claude setup-token\n"
                "  2. Set CLAUDE_CODE_OAUTH_TOKEN in your .env file"
            )
        raise ValueError(error_msg)
    return token


def get_enhanced_path() -> str:
    """
    Get an enhanced PATH that includes common Node.js/npm/npx locations.

    Electron apps launched from GUI don't inherit shell PATH modifications
    from .bashrc/.zshrc or Node version managers (nvm, fnm, volta, asdf).
    This function adds common locations to ensure npx/npm are found.

    Fixes Issue #523: Cannot add custom mcp servers using npx

    Returns:
        Enhanced PATH string with additional Node.js locations
    """
    current_path = os.environ.get("PATH", "")
    home = Path.home()
    additional_paths: list[str] = []

    if platform.system() == "Windows":
        # Windows common locations
        appdata = os.environ.get("APPDATA", "")
        programfiles = os.environ.get("PROGRAMFILES", "C:\\Program Files")
        programfiles_x86 = os.environ.get(
            "PROGRAMFILES(X86)", "C:\\Program Files (x86)"
        )
        nvm_home = os.environ.get("NVM_HOME", "")

        candidates = [
            Path(appdata) / "npm" if appdata else None,
            Path(programfiles) / "nodejs",
            Path(programfiles_x86) / "nodejs",
            home / "AppData" / "Roaming" / "npm",
            home / "AppData" / "Local" / "fnm_multishells",
            home / ".volta" / "bin",
        ]

        # Add nvm-windows paths
        if nvm_home:
            nvm_path = Path(nvm_home)
            if nvm_path.exists():
                # Find installed node versions
                for version_dir in nvm_path.iterdir():
                    if version_dir.is_dir() and version_dir.name.startswith("v"):
                        candidates.append(version_dir)

    else:
        # macOS / Linux common locations
        candidates = [
            Path("/usr/local/bin"),
            Path("/usr/bin"),
            Path("/opt/homebrew/bin"),  # Apple Silicon Homebrew
            home / ".local" / "bin",
            home / ".volta" / "bin",
            home / ".fnm" / "current" / "bin",
            home / ".asdf" / "shims",
            home / ".npm-global" / "bin",
            home / "node_modules" / ".bin",
        ]

        # Add nvm paths (find installed versions)
        nvm_dir = home / ".nvm" / "versions" / "node"
        if nvm_dir.exists():
            for version_dir in nvm_dir.iterdir():
                if version_dir.is_dir():
                    candidates.append(version_dir / "bin")

        # Add fnm paths
        fnm_dir = home / ".fnm" / "node-versions"
        if fnm_dir.exists():
            for version_dir in fnm_dir.iterdir():
                if version_dir.is_dir():
                    candidates.append(version_dir / "installation" / "bin")

    # Filter to existing directories not already in PATH
    path_entries = set(current_path.split(os.pathsep))
    for candidate in candidates:
        if candidate and candidate.exists() and str(candidate) not in path_entries:
            additional_paths.append(str(candidate))

    # Prepend additional paths (higher priority than existing)
    if additional_paths:
        return os.pathsep.join(additional_paths) + os.pathsep + current_path

    return current_path


def get_sdk_env_vars() -> dict[str, str]:
    """
    Get environment variables to pass to SDK.

    Collects relevant env vars (ANTHROPIC_BASE_URL, etc.) that should
    be passed through to the claude-agent-sdk subprocess.

    Also includes an enhanced PATH to ensure npx/npm are found when
    Electron apps are launched from GUI (Issue #523).

    Returns:
        Dict of env var name -> value for non-empty vars
    """
    env = {}
    for var in SDK_ENV_VARS:
        value = os.environ.get(var)
        if value:
            env[var] = value

    # Add enhanced PATH for MCP server spawning (npx, npm commands)
    env["PATH"] = get_enhanced_path()

    return env


def ensure_claude_code_oauth_token() -> None:
    """
    Ensure CLAUDE_CODE_OAUTH_TOKEN is set (for SDK compatibility).

    If not set but other auth tokens are available, copies the value
    to CLAUDE_CODE_OAUTH_TOKEN so the underlying SDK can use it.
    """
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return

    token = get_auth_token()
    if token:
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = token
