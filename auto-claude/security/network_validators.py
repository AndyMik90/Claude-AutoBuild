"""
Network Command Validators
==========================

Validators for network commands (curl, wget) in strict security mode.

These validators prevent data exfiltration by:
1. Blocking POST/PUT requests to external URLs
2. Allowing GET requests (read-only)
3. Allowing all requests to localhost/127.0.0.1 (local development)
4. Blocking file upload patterns
"""

import re
import shlex
from urllib.parse import urlparse

from .validation_models import ValidationResult

# Allowed hosts for unrestricted access (local development)
ALLOWED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
}

# curl flags that indicate data upload (potential exfiltration)
CURL_UPLOAD_FLAGS = {
    "-d", "--data",
    "--data-raw", "--data-binary", "--data-urlencode", "--data-ascii",
    "-F", "--form",
    "-T", "--upload-file",
    "--json",
}

# curl flags that change method to upload
CURL_METHOD_FLAGS = {
    "-X": {"POST", "PUT", "PATCH"},
    "--request": {"POST", "PUT", "PATCH"},
}

# wget flags that indicate upload (rare but possible)
WGET_UPLOAD_FLAGS = {
    "--post-data", "--post-file",
    "--body-data", "--body-file",
    "--method",  # When used with POST/PUT
}


def _extract_url_from_tokens(tokens: list[str], skip_flags: set[str]) -> str | None:
    """
    Extract the URL from command tokens.

    Args:
        tokens: Parsed command tokens
        skip_flags: Flags that take an argument (skip next token)

    Returns:
        URL string or None if not found
    """
    skip_next = False
    for token in tokens[1:]:  # Skip command name
        if skip_next:
            skip_next = False
            continue

        # Check if this is a flag that takes an argument
        if token.startswith("-"):
            # Check for flags that take an argument
            for flag in skip_flags:
                if token == flag or token.startswith(f"{flag}="):
                    if "=" not in token:
                        skip_next = True
                    break
            continue

        # This looks like a URL
        if token.startswith(("http://", "https://", "ftp://")):
            return token
        # Bare hostname (curl allows this)
        elif "." in token or token in ALLOWED_HOSTS:
            return f"http://{token}"

    return None


def _is_localhost(url: str) -> bool:
    """Check if URL points to localhost."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname or ""
        return hostname.lower() in ALLOWED_HOSTS
    except Exception:
        return False


def validate_curl_command(command_string: str) -> ValidationResult:
    """
    Validate curl commands to prevent data exfiltration.

    In strict mode:
    - GET requests are allowed to any host
    - POST/PUT/PATCH with data only allowed to localhost
    - File uploads blocked to external hosts

    Args:
        command_string: The full curl command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse curl command"

    if not tokens or tokens[0] != "curl":
        return False, "Not a curl command"

    # Track what we find
    has_upload_data = False
    explicit_method = None
    upload_flag_found = None

    # Flags that take arguments (we need to skip their values)
    skip_flags = {
        "-o", "--output", "-O",
        "-H", "--header",
        "-A", "--user-agent",
        "-e", "--referer",
        "-u", "--user",
        "-x", "--proxy",
        "-b", "--cookie",
        "-c", "--cookie-jar",
        "--connect-timeout", "--max-time",
        "-w", "--write-out",
        "--retry", "--retry-delay",
    }
    skip_flags.update(CURL_UPLOAD_FLAGS)

    i = 1
    while i < len(tokens):
        token = tokens[i]

        # Check for upload data flags
        for flag in CURL_UPLOAD_FLAGS:
            if token == flag:
                has_upload_data = True
                upload_flag_found = flag
                break
            elif token.startswith(f"{flag}="):
                has_upload_data = True
                upload_flag_found = flag
                break

        # Check for explicit method
        if token in ("-X", "--request"):
            if i + 1 < len(tokens):
                explicit_method = tokens[i + 1].upper()
                i += 1

        # Skip flag arguments
        if token.startswith("-"):
            for flag in skip_flags:
                if token == flag:
                    i += 1  # Skip next token (the argument)
                    break

        i += 1

    # Extract URL
    url = _extract_url_from_tokens(tokens, skip_flags)

    # If localhost, allow everything
    if url and _is_localhost(url):
        return True, ""

    # Determine if this is an upload operation
    is_upload = has_upload_data or (explicit_method in {"POST", "PUT", "PATCH"})

    if is_upload:
        if upload_flag_found:
            return (
                False,
                f"curl with '{upload_flag_found}' blocked in strict mode (potential data exfiltration). "
                f"Only GET requests allowed to external hosts. "
                f"Localhost requests are unrestricted.",
            )
        else:
            return (
                False,
                f"curl {explicit_method} blocked in strict mode (potential data exfiltration). "
                f"Only GET requests allowed to external hosts. "
                f"Localhost requests are unrestricted.",
            )

    return True, ""


def validate_wget_command(command_string: str) -> ValidationResult:
    """
    Validate wget commands to prevent data exfiltration.

    In strict mode:
    - GET requests are allowed to any host
    - POST with data only allowed to localhost

    Args:
        command_string: The full wget command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse wget command"

    if not tokens or tokens[0] != "wget":
        return False, "Not a wget command"

    # Track what we find
    has_upload_data = False
    upload_flag_found = None
    explicit_method = None

    # Flags that take arguments
    skip_flags = {
        "-O", "--output-document",
        "-o", "--output-file",
        "-a", "--append-output",
        "--header",
        "--user-agent", "-U",
        "--referer",
        "--user", "--password",
        "--proxy-user", "--proxy-password",
        "-e", "--execute",
        "-t", "--tries",
        "-T", "--timeout",
        "-w", "--wait",
        "--limit-rate",
        "-P", "--directory-prefix",
    }
    skip_flags.update(WGET_UPLOAD_FLAGS)

    i = 1
    while i < len(tokens):
        token = tokens[i]

        # Check for upload data flags
        for flag in WGET_UPLOAD_FLAGS:
            if token == flag:
                has_upload_data = True
                upload_flag_found = flag
                break
            elif token.startswith(f"{flag}="):
                has_upload_data = True
                upload_flag_found = flag
                break

        # Check for explicit method
        if token == "--method":
            if i + 1 < len(tokens):
                explicit_method = tokens[i + 1].upper()
                i += 1
        elif token.startswith("--method="):
            explicit_method = token.split("=", 1)[1].upper()

        # Skip flag arguments
        if token.startswith("-"):
            for flag in skip_flags:
                if token == flag:
                    i += 1
                    break

        i += 1

    # Extract URL (wget usually has URL as last argument)
    url = None
    for token in reversed(tokens[1:]):
        if not token.startswith("-"):
            if token.startswith(("http://", "https://", "ftp://")):
                url = token
                break

    # If localhost, allow everything
    if url and _is_localhost(url):
        return True, ""

    # Determine if this is an upload operation
    is_upload = has_upload_data or (explicit_method in {"POST", "PUT", "PATCH"})

    if is_upload:
        if upload_flag_found:
            return (
                False,
                f"wget with '{upload_flag_found}' blocked in strict mode (potential data exfiltration). "
                f"Only GET requests allowed to external hosts. "
                f"Localhost requests are unrestricted.",
            )
        else:
            return (
                False,
                f"wget --method={explicit_method} blocked in strict mode (potential data exfiltration). "
                f"Only GET requests allowed to external hosts. "
                f"Localhost requests are unrestricted.",
            )

    return True, ""
