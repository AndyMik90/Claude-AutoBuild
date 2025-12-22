"""
Validator Registry
==================

Central registry mapping command names to their validation functions.
"""

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
from .process_validators import (
    validate_kill_command,
    validate_killall_command,
    validate_pkill_command,
)
from .validation_models import ValidatorFunction

# Map command names to their validation functions
VALIDATORS: dict[str, ValidatorFunction] = {
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


def get_validator(command_name: str) -> ValidatorFunction | None:
    """
    Get the validator function for a given command name.

    Args:
        command_name: The name of the command to validate

    Returns:
        The validator function, or None if no validator exists
    """
    return VALIDATORS.get(command_name)
