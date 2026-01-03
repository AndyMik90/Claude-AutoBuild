"""
Authentication helpers for Auto Claude.

Provides centralized authentication token resolution with fallback support
for multiple environment variables, and SDK environment variable passthrough
for custom API endpoints.

Extended to support reading env configuration from active profile's settings.json
for third-party API providers (e.g., Minimax, OpenRouter).
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
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "NO_PROXY",
    "DISABLE_TELEMETRY",
    "DISABLE_COST_WARNINGS",
    "API_TIMEOUT_MS",
]

# Additional env vars that can be loaded from profile settings.json
PROFILE_ENV_VARS = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "API_TIMEOUT_MS",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
]


def _get_auto_claude_ui_config_dir() -> Path | None:
    """Get the Auto Claude UI config directory based on platform."""
    system = platform.system()
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / "auto-claude-ui" / "config"
    elif system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            return Path(appdata) / "auto-claude-ui" / "config"
    elif system == "Linux":
        xdg_config = os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))
        return Path(xdg_config) / "auto-claude-ui" / "config"
    return None


def _get_active_profile() -> dict | None:
    """
    Get the active profile from claude-profiles.json.

    Returns:
        Active profile dict with id, name, configDir, etc., or None if not found
    """
    config_dir = _get_auto_claude_ui_config_dir()
    if not config_dir:
        return None

    profiles_file = config_dir / "claude-profiles.json"
    if not profiles_file.exists():
        return None

    try:
        with open(profiles_file, encoding="utf-8") as f:
            data = json.load(f)

        active_id = data.get("activeProfileId", "default")
        profiles = data.get("profiles", [])

        for profile in profiles:
            if profile.get("id") == active_id:
                return profile

        # Fallback to first profile if active not found
        if profiles:
            return profiles[0]

    except (json.JSONDecodeError, KeyError, Exception):
        pass

    return None


def _get_profile_env_vars() -> dict[str, str]:
    """
    Get environment variables from the active profile's settings.json.

    Reads the 'env' section from the profile's configDir/settings.json file.
    This enables support for third-party API providers like Minimax.

    Returns:
        Dict of env var name -> value from profile settings
    """
    profile = _get_active_profile()
    if not profile:
        return {}

    config_dir = profile.get("configDir")
    if not config_dir:
        return {}

    settings_file = Path(config_dir) / "settings.json"
    if not settings_file.exists():
        return {}

    try:
        with open(settings_file, encoding="utf-8") as f:
            settings = json.load(f)

        env_section = settings.get("env", {})
        if not isinstance(env_section, dict):
            return {}

        # Only include allowed env vars for security
        result = {}
        for var in PROFILE_ENV_VARS:
            if var in env_section:
                value = env_section[var]
                # Convert non-string values to string
                if isinstance(value, bool):
                    result[var] = "1" if value else "0"
                elif value is not None:
                    result[var] = str(value)

        return result

    except (json.JSONDecodeError, KeyError, Exception):
        return {}


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
    3. Profile settings.json env section (for third-party providers)
    4. System credential store (macOS Keychain, Windows Credential Manager)

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

    # Check profile settings for ANTHROPIC_AUTH_TOKEN (for third-party providers)
    profile_env = _get_profile_env_vars()
    if "ANTHROPIC_AUTH_TOKEN" in profile_env:
        return profile_env["ANTHROPIC_AUTH_TOKEN"]

    # Fallback to system credential store
    return get_token_from_keychain()


def get_auth_token_source() -> str | None:
    """Get the name of the source that provided the auth token."""
    # Check environment variables first
    for var in AUTH_TOKEN_ENV_VARS:
        if os.environ.get(var):
            return var

    # Check profile settings
    profile_env = _get_profile_env_vars()
    if "ANTHROPIC_AUTH_TOKEN" in profile_env:
        profile = _get_active_profile()
        if profile:
            return f"Profile: {profile.get('name', profile.get('id', 'unknown'))}"

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


def get_sdk_env_vars() -> dict[str, str]:
    """
    Get environment variables to pass to SDK.

    Collects relevant env vars (ANTHROPIC_BASE_URL, etc.) that should
    be passed through to the claude-agent-sdk subprocess.

    Priority order:
    1. System environment variables (os.environ)
    2. Active profile's settings.json env section

    This allows using third-party API providers (Minimax, OpenRouter, etc.)
    by configuring them in the profile's settings.json.

    Returns:
        Dict of env var name -> value for non-empty vars
    """
    env = {}

    # First, load from active profile settings (lower priority)
    profile_env = _get_profile_env_vars()
    for var, value in profile_env.items():
        if value:
            env[var] = value

    # Then, override with system environment variables (higher priority)
    for var in SDK_ENV_VARS:
        value = os.environ.get(var)
        if value:
            env[var] = value

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


def get_active_profile_info() -> dict | None:
    """
    Get information about the currently active profile.

    Returns:
        Dict with profile info (id, name, configDir, isThirdParty) or None
    """
    profile = _get_active_profile()
    if not profile:
        return None

    profile_env = _get_profile_env_vars()
    is_third_party = bool(profile_env.get("ANTHROPIC_BASE_URL"))

    return {
        "id": profile.get("id"),
        "name": profile.get("name"),
        "configDir": profile.get("configDir"),
        "isThirdParty": is_third_party,
        "baseUrl": profile_env.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
    }
