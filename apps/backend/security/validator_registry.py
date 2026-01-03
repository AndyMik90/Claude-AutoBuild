"""
Validator Registry
==================

Central registry mapping command names to their validation functions.

In strict security mode, additional validators are added for network
commands (curl, wget) to prevent data exfiltration.
"""

from project.command_registry.base import is_strict_mode

from .database_validators import (
    validate_dropdb_command,
    validate_dropuser_command,
    validate_mongosh_command,
    validate_mysql_command,
    validate_mysqladmin_command,
    validate_psql_command,
    validate_redis_cli_command,
)
from .filesystem_validators import (
    validate_chmod_command,
    validate_init_script,
    validate_rm_command,
)
from .git_validators import validate_git_commit
from .network_validators import (
    validate_curl_command,
    validate_wget_command,
)
from .process_validators import (
    validate_kill_command,
    validate_killall_command,
    validate_pkill_command,
)
from .validation_models import ValidatorFunction

# Base validators - always active
_BASE_VALIDATORS: dict[str, ValidatorFunction] = {
    # Process management
    "pkill": validate_pkill_command,
    "kill": validate_kill_command,
    "killall": validate_killall_command,
    # File system
    "chmod": validate_chmod_command,
    "rm": validate_rm_command,
    "init.sh": validate_init_script,
    # Git
    "git": validate_git_commit,
    # Database - PostgreSQL
    "dropdb": validate_dropdb_command,
    "dropuser": validate_dropuser_command,
    "psql": validate_psql_command,
    # Database - MySQL/MariaDB
    "mysql": validate_mysql_command,
    "mariadb": validate_mysql_command,  # Same syntax as mysql
    "mysqladmin": validate_mysqladmin_command,
    # Database - Redis
    "redis-cli": validate_redis_cli_command,
    # Database - MongoDB
    "mongosh": validate_mongosh_command,
    "mongo": validate_mongosh_command,  # Legacy mongo shell
}

# Strict mode validators - added when SECURITY_STRICT_MODE=true
_STRICT_VALIDATORS: dict[str, ValidatorFunction] = {
    "curl": validate_curl_command,
    "wget": validate_wget_command,
}

# For backward compatibility, VALIDATORS contains base validators only
# Use get_validators() for mode-aware behavior
VALIDATORS: dict[str, ValidatorFunction] = _BASE_VALIDATORS.copy()


def get_validators() -> dict[str, ValidatorFunction]:
    """
    Get all validators based on current security mode.

    In strict mode, includes network validators for curl/wget
    to prevent data exfiltration.

    Returns:
        Dict mapping command names to validator functions
    """
    if is_strict_mode():
        return {**_BASE_VALIDATORS, **_STRICT_VALIDATORS}
    return _BASE_VALIDATORS.copy()


def get_validator(command_name: str) -> ValidatorFunction | None:
    """
    Get the validator function for a given command name.

    This function is mode-aware - in strict mode, it will return
    validators for curl/wget that aren't active in normal mode.

    Args:
        command_name: The name of the command to validate

    Returns:
        The validator function, or None if no validator exists
    """
    validators = get_validators()
    return validators.get(command_name)
