"""
Authentication helpers for Auto Claude.

Provides centralized authentication token resolution with fallback support
for multiple environment variables, and SDK environment variable passthrough
for custom API endpoints.

Includes automatic OAuth token refresh when tokens expire.
"""

import json
import logging
import os
import platform
import subprocess
import time

import requests

logger = logging.getLogger(__name__)

# OAuth configuration for token refresh
# See: https://github.com/anthropics/claude-code/issues/12447
# Endpoint verified via: https://github.com/RavenStorm-bit/claude-token-refresh
OAUTH_TOKEN_URL = os.environ.get(
    "CLAUDE_OAUTH_TOKEN_URL",
    "https://console.anthropic.com/v1/oauth/token",
)
OAUTH_CLIENT_ID = os.environ.get(
    "CLAUDE_OAUTH_CLIENT_ID",
    "9d1c250a-e61b-44d9-88ed-5944d1962f5e",  # Claude Code CLI default
)


def _parse_buffer_seconds() -> int:
    """Parse TOKEN_REFRESH_BUFFER_SECONDS with graceful fallback."""
    raw_value = os.environ.get("CLAUDE_TOKEN_REFRESH_BUFFER_SECONDS", "300")
    try:
        return int(raw_value)
    except ValueError:
        logger.warning(
            f"Invalid CLAUDE_TOKEN_REFRESH_BUFFER_SECONDS='{raw_value}', using default 300 seconds"
        )
        return 300  # Default 5 minutes if invalid value


TOKEN_REFRESH_BUFFER_SECONDS = _parse_buffer_seconds()

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


# =============================================================================
# Full Credentials (with refresh token and expiry)
# =============================================================================


def get_full_credentials() -> dict | None:
    """
    Get full OAuth credentials including refresh token and expiry.

    Priority for accessToken:
    1. ANTHROPIC_AUTH_TOKEN (enterprise/CCR) - no refresh capability
    2. CLAUDE_CODE_OAUTH_TOKEN env var - overrides store's access token
    3. System credential store - default source

    The refreshToken is always sourced from system credential store (when available).
    CLAUDE_CODE_OAUTH_TOKEN overrides the access token but preserves refresh capability.

    Returns dict with accessToken, refreshToken, expiresAt or None.
    """
    # ANTHROPIC_AUTH_TOKEN is for enterprise/CCR and has top priority, no refresh
    enterprise_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    if enterprise_token:
        return {"accessToken": enterprise_token, "refreshToken": None, "expiresAt": None}

    # For OAuth, prefer store to get refresh token
    creds = _get_full_credentials_from_store()

    # CLAUDE_CODE_OAUTH_TOKEN can override access token (but keep refresh from store)
    env_oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if env_oauth_token:
        if creds:
            # Use env token but keep refresh capability from store
            creds["accessToken"] = env_oauth_token
            return creds
        else:
            # No store creds, use env token without refresh
            return {"accessToken": env_oauth_token, "refreshToken": None, "expiresAt": None}

    return creds


def _get_full_credentials_from_store() -> dict | None:
    """Get full credentials from platform-specific store."""
    system = platform.system()

    if system == "Darwin":
        return _get_full_credentials_macos()
    elif system == "Windows":
        return _get_full_credentials_windows()
    else:  # Linux
        return _get_full_credentials_linux()


def _get_full_credentials_from_file(cred_path: str) -> dict | None:
    """
    Read and parse credentials from a single file path.

    Args:
        cred_path: Path to the credentials JSON file

    Returns:
        Dict with accessToken, refreshToken, expiresAt or None if invalid
    """
    if not os.path.exists(cred_path):
        return None

    try:
        with open(cred_path, encoding="utf-8") as f:
            data = json.load(f)
            oauth = data.get("claudeAiOauth", {})
            access_token = oauth.get("accessToken")
            if access_token and access_token.startswith("sk-ant-oat01-"):
                return {
                    "accessToken": access_token,
                    "refreshToken": oauth.get("refreshToken"),
                    "expiresAt": oauth.get("expiresAt"),
                }
            # File exists but has no valid OAuth token
            logger.debug(f"No valid OAuth token in {cred_path}")
            return None
    except (OSError, IOError) as e:
        logger.warning(f"Failed to read credentials file {cred_path}: {e}")
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse credentials from {cred_path}: {e}")
    return None


def _get_full_credentials_from_paths(cred_paths: list[str]) -> dict | None:
    """
    Try to read credentials from a list of file paths.

    Args:
        cred_paths: List of paths to try in order

    Returns:
        Credentials from first valid file, or None if none found
    """
    for cred_path in cred_paths:
        result = _get_full_credentials_from_file(cred_path)
        if result:
            return result
    return None


def _get_full_credentials_linux() -> dict | None:
    """Get full credentials from Linux file store."""
    return _get_full_credentials_from_paths([
        os.path.expanduser("~/.claude/credentials.json"),
        os.path.expanduser("~/.claude/.credentials.json"),
    ])


def _get_full_credentials_macos() -> dict | None:
    """Get full credentials from macOS Keychain."""
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

        data = json.loads(result.stdout.strip())
        oauth = data.get("claudeAiOauth", {})
        access_token = oauth.get("accessToken")
        if access_token and access_token.startswith("sk-ant-oat01-"):
            return {
                "accessToken": access_token,
                "refreshToken": oauth.get("refreshToken"),
                "expiresAt": oauth.get("expiresAt"),
            }
        return None
    except subprocess.TimeoutExpired:
        logger.warning("macOS Keychain read timed out")
        return None
    except (subprocess.SubprocessError, OSError) as e:
        logger.warning(f"macOS Keychain subprocess error: {e}")
        return None
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to parse macOS Keychain data: {e}")
        return None


def _get_full_credentials_windows() -> dict | None:
    """Get full credentials from Windows credential files."""
    return _get_full_credentials_from_paths([
        os.path.expandvars(r"%USERPROFILE%\.claude\.credentials.json"),
        os.path.expandvars(r"%USERPROFILE%\.claude\credentials.json"),
        os.path.expandvars(r"%LOCALAPPDATA%\Claude\credentials.json"),
        os.path.expandvars(r"%APPDATA%\Claude\credentials.json"),
    ])


# =============================================================================
# Token Expiration and Refresh
# =============================================================================


def is_token_expired(credentials: dict) -> bool:
    """
    Check if token is expired or will expire within buffer period.

    Args:
        credentials: Dict with expiresAt field (milliseconds timestamp)

    Returns:
        True if token is expired or expiring soon
    """
    expires_at = credentials.get("expiresAt")
    if not expires_at or expires_at == 0:
        return False  # Can't determine, assume valid

    # expiresAt may be in milliseconds or seconds depending on source
    # Heuristic: timestamps > 1e12 are in milliseconds (1e12 ms = Sep 2001)
    # Values <= 1e12 are assumed to be in seconds (1e12 sec = year 33658)
    expires_at_sec = expires_at / 1000 if expires_at > 1e12 else expires_at
    return time.time() > (expires_at_sec - TOKEN_REFRESH_BUFFER_SECONDS)


def refresh_oauth_token(refresh_token: str) -> dict | None:
    """
    Refresh OAuth token using Anthropic's token endpoint.

    Args:
        refresh_token: The refresh token (sk-ant-ort01-...)

    Returns:
        Dict with new accessToken, refreshToken, expiresAt or None on failure
    """
    if not refresh_token:
        return None

    try:
        response = requests.post(
            OAUTH_TOKEN_URL,
            json={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": OAUTH_CLIENT_ID,
            },
            headers={"Content-Type": "application/json"},
            timeout=30,
        )

        if response.status_code == 200:
            data = response.json()
            access_token = data.get("access_token")
            if not access_token:
                logger.warning("OAuth response missing access_token")
                return None
            expires_in = data.get("expires_in", 28800)  # Default 8 hours
            return {
                "accessToken": access_token,
                "refreshToken": data.get("refresh_token"),
                "expiresAt": int((time.time() + expires_in) * 1000),
            }
        else:
            logger.warning(f"Token refresh failed: {response.status_code} {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        logger.warning(f"Token refresh error: {e}")
        return None


# =============================================================================
# Credential Saving
# =============================================================================


def save_credentials(credentials: dict) -> bool:
    """
    Save refreshed credentials back to credential store.

    Args:
        credentials: Dict with accessToken, refreshToken, expiresAt

    Returns:
        True if saved successfully
    """
    system = platform.system()

    if system == "Darwin":
        return _save_credentials_macos(credentials)
    elif system == "Windows":
        return _save_credentials_windows(credentials)
    else:  # Linux
        return _save_credentials_linux(credentials)


def _save_credentials_to_file(
    cred_path: str, credentials: dict, set_permissions: bool = False
) -> bool:
    """
    Save credentials to a JSON file.

    Args:
        cred_path: Path to the credentials file
        credentials: Dict with accessToken, refreshToken, expiresAt
        set_permissions: If True, set file permissions to 0o600 (Linux)

    Returns:
        True if saved successfully

    Design note:
        If the existing file is malformed JSON, this returns False rather than
        force-overwriting. This is the safest approach as it prevents data loss
        and guides users to run `claude setup-token` which properly recreates
        the credential store. A backup strategy was considered but adds complexity
        without significant benefit since setup-token is the canonical recovery path.
    """
    try:
        # Read existing file to preserve other data
        existing = {}
        if os.path.exists(cred_path):
            with open(cred_path, encoding="utf-8") as f:
                existing = json.load(f)

        # Update OAuth section
        existing["claudeAiOauth"] = {
            "accessToken": credentials["accessToken"],
            "refreshToken": credentials["refreshToken"],
            "expiresAt": credentials["expiresAt"],
        }

        # Create directory and write file
        os.makedirs(os.path.dirname(cred_path), exist_ok=True)
        with open(cred_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2)

        # Set restrictive permissions on Linux/Unix
        if set_permissions:
            os.chmod(cred_path, 0o600)

        return True
    except (OSError, IOError) as e:
        logger.warning(f"Failed to save credentials to {cred_path}: {e}")
        return False
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse existing credentials at {cred_path}: {e}")
        return False
    except KeyError as e:
        logger.warning(f"Missing required credential field: {e}")
        return False


def _save_credentials_linux(credentials: dict) -> bool:
    """Save credentials to Linux file store."""
    cred_path = os.path.expanduser("~/.claude/credentials.json")

    # Use umask to create file with restrictive permissions atomically
    # This prevents TOCTOU race condition where file is briefly world-readable
    old_umask = os.umask(0o077)
    try:
        return _save_credentials_to_file(cred_path, credentials, set_permissions=True)
    finally:
        os.umask(old_umask)


def _save_credentials_windows(credentials: dict) -> bool:
    """Save credentials to Windows file store."""
    # Use .credentials.json (with leading dot) to match Claude Code's primary path
    cred_path = os.path.expandvars(r"%USERPROFILE%\.claude\.credentials.json")
    return _save_credentials_to_file(cred_path, credentials)


def _save_credentials_macos(credentials: dict) -> bool:
    """Save credentials to macOS Keychain."""
    try:
        # Read existing keychain data
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

        existing = {}
        if result.returncode == 0:
            existing = json.loads(result.stdout.strip())

        # Update OAuth section
        existing["claudeAiOauth"] = {
            "accessToken": credentials["accessToken"],
            "refreshToken": credentials["refreshToken"],
            "expiresAt": credentials["expiresAt"],
        }

        # Add/update entry (-U flag updates if exists, no need to delete first)
        new_json = json.dumps(existing)
        result = subprocess.run(
            [
                "/usr/bin/security",
                "add-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
                new_json,
                "-U",
            ],
            capture_output=True,
            timeout=5,
        )

        if result.returncode != 0:
            logger.warning(f"Keychain add-generic-password failed: {result.stderr}")
            return False

        return True
    except subprocess.TimeoutExpired:
        logger.warning("macOS Keychain save timed out")
        return False
    except (subprocess.SubprocessError, OSError) as e:
        logger.warning(f"macOS Keychain subprocess error: {e}")
        return False
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to handle Keychain data: {e}")
        return False


# =============================================================================
# Main Token Retrieval (with automatic refresh)
# =============================================================================


def get_auth_token(verbose: bool = False) -> str | None:
    """
    Get valid authentication token, refreshing if necessary.

    Checks multiple sources in priority order:
    1. CLAUDE_CODE_OAUTH_TOKEN (env var)
    2. ANTHROPIC_AUTH_TOKEN (CCR/proxy env var for enterprise setups)
    3. System credential store (macOS Keychain, Windows Credential Manager)

    If the token from credential store is expired, attempts to refresh it
    automatically using the refresh token.

    NOTE: ANTHROPIC_API_KEY is intentionally NOT supported to prevent
    silent billing to user's API credits when OAuth is misconfigured.

    Side effects:
        - If token is refreshed, updates CLAUDE_CODE_OAUTH_TOKEN env var
          (process-level only, not persisted to system environment)
        - If token is refreshed, updates credential store via save_credentials()

    Args:
        verbose: If True, print user-facing messages during refresh

    Returns:
        Valid token string if found, None otherwise
    """
    # Get full credentials (handles env vars and store with proper priority)
    creds = get_full_credentials()
    if not creds or not creds.get("accessToken"):
        return None

    # Check if token is expired or expiring soon
    if is_token_expired(creds):
        refresh_token = creds.get("refreshToken")
        if refresh_token:
            logger.info("Access token expired, attempting refresh...")
            if verbose:
                print("🔄 OAuth token expiring soon, refreshing...")
            new_creds = refresh_oauth_token(refresh_token)
            if new_creds and new_creds.get("accessToken"):
                if save_credentials(new_creds):
                    logger.info("Token refreshed successfully")
                    if verbose:
                        print("✓ Token refreshed successfully")
                else:
                    logger.warning("Token refreshed but failed to save to credential store")
                    if verbose:
                        print("⚠ Token refreshed but couldn't save to credential store")
                # Update env var so subsequent calls use the new token
                os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = new_creds["accessToken"]
                return new_creds["accessToken"]
            else:
                if verbose:
                    print("⚠ Failed to refresh token, trying original...")

        # Graceful degradation: return original token as fallback
        # It might still work briefly (clock skew, network latency)
        # If it truly fails, session.py 401 handler will catch it
        logger.warning("Token refresh failed, returning original token as fallback")
        return creds["accessToken"]

    return creds["accessToken"]


def get_auth_token_source() -> str | None:
    """
    Get the name of the source that provided the auth token.

    Priority matches get_auth_token():
    1. ANTHROPIC_AUTH_TOKEN (enterprise/CCR)
    2. System credential store (for refresh token capability)
    3. CLAUDE_CODE_OAUTH_TOKEN (env var override)
    """
    # Enterprise token has top priority
    if os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "ANTHROPIC_AUTH_TOKEN"

    # Check credential store (matches get_full_credentials priority)
    creds = _get_full_credentials_from_store()
    if creds and creds.get("accessToken"):
        system = platform.system()
        if system == "Darwin":
            return "macOS Keychain"
        elif system == "Windows":
            return "Windows Credential Files"
        else:
            return "System Credential Store"

    # CLAUDE_CODE_OAUTH_TOKEN as fallback
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return "CLAUDE_CODE_OAUTH_TOKEN"

    return None


def require_auth_token(verbose: bool = False) -> str:
    """
    Get authentication token or raise ValueError.

    Args:
        verbose: If True, print user-facing messages during refresh

    Raises:
        ValueError: If no auth token is found in any supported source
    """
    token = get_auth_token(verbose=verbose)
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

    Returns:
        Dict of env var name -> value for non-empty vars
    """
    env = {}
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
