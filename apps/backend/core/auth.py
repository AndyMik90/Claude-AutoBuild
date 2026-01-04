"""
Authentication helpers for Auto Claude.

Provides centralized authentication token resolution with fallback support
for multiple environment variables, and SDK environment variable passthrough
for custom API endpoints.

Also supports Google Cloud Vertex AI authentication as an alternative to
direct Anthropic API access.
"""

import json
import logging
import os
import platform
import subprocess

logger = logging.getLogger(__name__)

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


def is_vertex_ai_enabled() -> bool:
    """
    Check if Vertex AI mode is enabled.

    Checks both Auto-Claude and Claude Code environment variable patterns:
    - USE_VERTEX_AI=true|1 (Auto-Claude)
    - CLAUDE_CODE_USE_VERTEX=true|1 (Claude Code)

    Returns:
        True if Vertex AI is enabled, False otherwise
    """
    use_vertex = os.environ.get("USE_VERTEX_AI", "").lower()
    claude_code_vertex = os.environ.get("CLAUDE_CODE_USE_VERTEX", "").lower()

    return (
        use_vertex in ("true", "1")
        or claude_code_vertex in ("true", "1")
    )


def get_vertex_ai_config() -> dict[str, str]:
    """
    Get Vertex AI configuration from environment variables.

    Supports both Auto-Claude and Claude Code environment variable patterns:
    - VERTEX_PROJECT_ID / ANTHROPIC_VERTEX_PROJECT_ID (project ID)
    - VERTEX_LOCATION / CLOUD_ML_REGION (region)

    Returns:
        Dict with 'project_id' and 'location' keys

    Raises:
        ValueError: If Vertex AI is enabled but required config is missing
    """
    if not is_vertex_ai_enabled():
        return {}

    # Check both variable name patterns for project ID
    project_id = os.environ.get("VERTEX_PROJECT_ID") or os.environ.get(
        "ANTHROPIC_VERTEX_PROJECT_ID", ""
    )
    if not project_id:
        raise ValueError(
            "Project ID is required when Vertex AI is enabled.\n"
            "Set one of: VERTEX_PROJECT_ID or ANTHROPIC_VERTEX_PROJECT_ID"
        )

    # Check both variable name patterns for location/region
    location = (
        os.environ.get("VERTEX_LOCATION")
        or os.environ.get("CLOUD_ML_REGION")
        or "us-east5"
    )

    return {"project_id": project_id, "location": location}


def get_vertex_ai_access_token() -> str:
    """
    Get Google Cloud access token for Vertex AI authentication.

    Uses Application Default Credentials (ADC) if available, otherwise
    falls back to gcloud CLI.

    Returns:
        Access token string

    Raises:
        ValueError: If unable to obtain access token
    """
    # Try importing Google Cloud auth library
    try:
        from google.auth import default
        from google.auth.transport.requests import Request

        credentials, _ = default()
        credentials.refresh(Request())
        return credentials.token
    except ImportError:
        logger.debug(
            "google-auth not available, falling back to gcloud CLI for access token"
        )
    except Exception as e:
        logger.debug(f"Failed to get credentials via google-auth: {e}")

    # Fallback to gcloud CLI
    try:
        result = subprocess.run(
            ["gcloud", "auth", "application-default", "print-access-token"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            raise ValueError(
                "Failed to get Vertex AI access token via gcloud CLI.\n\n"
                "Please authenticate with one of these methods:\n"
                "  1. Run: gcloud auth application-default login\n"
                "  2. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json\n\n"
                f"Error: {result.stderr}"
            )

        token = result.stdout.strip()
        if not token:
            raise ValueError("gcloud returned empty access token")

        return token

    except FileNotFoundError:
        raise ValueError(
            "gcloud CLI not found.\n\n"
            "To use Vertex AI, install the gcloud CLI:\n"
            "  https://cloud.google.com/sdk/docs/install\n\n"
            "Or install google-auth library:\n"
            "  pip install google-auth"
        )
    except subprocess.TimeoutExpired:
        raise ValueError("Timeout waiting for gcloud auth token")


def get_vertex_ai_base_url() -> str:
    """
    Construct the Vertex AI base URL for Anthropic Claude API.

    Format: https://{location}-aiplatform.googleapis.com/v1

    Returns:
        Vertex AI base URL

    Raises:
        ValueError: If Vertex AI config is invalid
    """
    config = get_vertex_ai_config()
    location = config["location"]
    return f"https://{location}-aiplatform.googleapis.com/v1"


def convert_model_for_vertex(model_id: str) -> str:
    """
    Convert Anthropic API model name to Vertex AI format.

    Anthropic API uses:  claude-sonnet-4-5-20250929
    Vertex AI uses:      claude-sonnet-4-5@20250929

    This function converts the last dash before a date (8 digits) to @ symbol.
    If already in Vertex format or Vertex AI is disabled, returns unchanged.

    Args:
        model_id: Model ID in Anthropic format

    Returns:
        Model ID in appropriate format (Vertex AI if enabled, otherwise unchanged)
    """
    if not is_vertex_ai_enabled():
        return model_id

    # If already has @ symbol, assume it's already in Vertex format
    if "@" in model_id:
        return model_id

    # Convert last dash before 8-digit date to @ symbol
    # Pattern: claude-sonnet-4-5-20250929 -> claude-sonnet-4-5@20250929
    import re

    # Match the last dash followed by 8 digits (YYYYMMDD)
    # Only convert if it matches the Claude model pattern
    pattern = r"^(claude-[a-z]+-[\d]+-[\d]+)-(\d{8})$"
    match = re.match(pattern, model_id)

    if match:
        base, date = match.groups()
        return f"{base}@{date}"

    # If pattern doesn't match, return unchanged
    # (might be a custom model or different format)
    return model_id


def require_auth_token() -> str:
    """
    Get authentication token or raise ValueError.

    If Vertex AI mode is enabled, returns a Vertex AI access token.
    Otherwise, returns a Claude Code OAuth token.

    Raises:
        ValueError: If no auth token is found in any supported source
    """
    # Check if Vertex AI mode is enabled
    if is_vertex_ai_enabled():
        logger.info("Vertex AI mode enabled, using Google Cloud credentials")
        return get_vertex_ai_access_token()

    # Standard OAuth token flow
    token = get_auth_token()
    if not token:
        error_msg = (
            "No OAuth token found.\n\n"
            "Auto Claude requires Claude Code OAuth authentication.\n"
            "Direct API keys (ANTHROPIC_API_KEY) are not supported.\n\n"
            "Alternatively, you can use Vertex AI (Google Cloud):\n"
            "  1. Set USE_VERTEX_AI=true in your .env file\n"
            "  2. Set VERTEX_PROJECT_ID=your-gcp-project\n"
            "  3. Authenticate: gcloud auth application-default login\n\n"
        )
        # Provide platform-specific guidance
        system = platform.system()
        if system == "Darwin":
            error_msg += (
                "To authenticate with Claude Code:\n"
                "  1. Run: claude setup-token\n"
                "  2. The token will be saved to macOS Keychain automatically\n\n"
                "Or set CLAUDE_CODE_OAUTH_TOKEN in your .env file."
            )
        elif system == "Windows":
            error_msg += (
                "To authenticate with Claude Code:\n"
                "  1. Run: claude setup-token\n"
                "  2. The token should be saved to Windows Credential Manager\n\n"
                "If auto-detection fails, set CLAUDE_CODE_OAUTH_TOKEN in your .env file.\n"
                "Check: %LOCALAPPDATA%\\Claude\\credentials.json"
            )
        else:
            error_msg += (
                "To authenticate with Claude Code:\n"
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

    If Vertex AI is enabled, configures the SDK to use Vertex AI endpoints.

    Returns:
        Dict of env var name -> value for non-empty vars
    """
    env = {}

    # Check if Vertex AI is enabled
    if is_vertex_ai_enabled():
        # Configure SDK for Vertex AI
        vertex_config = get_vertex_ai_config()
        env["ANTHROPIC_BASE_URL"] = get_vertex_ai_base_url()

        # Pass through Google Cloud credentials if set
        if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            env["GOOGLE_APPLICATION_CREDENTIALS"] = os.environ[
                "GOOGLE_APPLICATION_CREDENTIALS"
            ]

        logger.info(
            f"Vertex AI configured: project={vertex_config['project_id']}, "
            f"location={vertex_config['location']}"
        )

    # Always pass through standard SDK env vars (even with Vertex AI)
    # This allows overriding timeouts, proxy settings, etc.
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
