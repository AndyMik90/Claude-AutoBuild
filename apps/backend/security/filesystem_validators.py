"""
File System Validators
=======================

Validators for file system operations (chmod, rm, init scripts).
"""

import re
import shlex

from .validation_models import ValidationResult

# Safe chmod modes
SAFE_CHMOD_MODES = {
    "+x",
    "a+x",
    "u+x",
    "g+x",
    "o+x",
    "ug+x",
    "755",
    "644",
    "700",
    "600",
    "775",
    "664",
}

# Dangerous rm patterns
DANGEROUS_RM_PATTERNS = [
    r"^/$",  # Root
    r"^\.\.$",  # Parent directory
    r"^~$",  # Home directory
    r"^\*$",  # Wildcard only
    r"^/\*$",  # Root wildcard
    r"^\.\./",  # Escaping current directory
    r"^/home$",  # /home
    r"^/usr$",  # /usr
    r"^/etc$",  # /etc
    r"^/var$",  # /var
    r"^/bin$",  # /bin
    r"^/lib$",  # /lib
    r"^/opt$",  # /opt
]


def validate_chmod_command(command_string: str) -> ValidationResult:
    """
    Validate chmod commands - only allow making files executable with +x.

    Args:
        command_string: The full chmod command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse chmod command"

    if not tokens or tokens[0] != "chmod":
        return False, "Not a chmod command"

    mode = None
    files = []
    skip_next = False

    for token in tokens[1:]:
        if skip_next:
            skip_next = False
            continue

        if token in ("-R", "--recursive"):
            # Allow recursive for +x
            continue
        elif token.startswith("-"):
            return False, f"chmod flag '{token}' is not allowed"
        elif mode is None:
            mode = token
        else:
            files.append(token)

    if mode is None:
        return False, "chmod requires a mode"

    if not files:
        return False, "chmod requires at least one file"

    # Only allow +x variants (making files executable)
    # Also allow common safe modes like 755, 644
    if mode not in SAFE_CHMOD_MODES and not re.match(r"^[ugoa]*\+x$", mode):
        return (
            False,
            f"chmod only allowed with executable modes (+x, 755, etc.), got: {mode}",
        )

    return True, ""


def validate_rm_command(command_string: str) -> ValidationResult:
    """
    Validate rm commands - prevent dangerous deletions.

    Args:
        command_string: The full rm command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse rm command"

    if not tokens:
        return False, "Empty rm command"

    # Check for dangerous patterns
    for token in tokens[1:]:
        if token.startswith("-"):
            # Allow -r, -f, -rf, -fr, -v, -i
            continue
        for pattern in DANGEROUS_RM_PATTERNS:
            if re.match(pattern, token):
                return False, f"rm target '{token}' is not allowed for safety"

    return True, ""


def validate_init_script(command_string: str) -> ValidationResult:
    """
    Validate init.sh script execution - only allow ./init.sh.

    Args:
        command_string: The full init script command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse init script command"

    if not tokens:
        return False, "Empty command"

    script = tokens[0]

    # Allow ./init.sh or paths ending in /init.sh
    if script == "./init.sh" or script.endswith("/init.sh"):
        return True, ""

    return False, f"Only ./init.sh is allowed, got: {script}"
