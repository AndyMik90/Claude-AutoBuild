"""
Command Validators
==================

Entry point for command validation. This module provides a unified interface
to all specialized validators.

The validation logic is organized into separate modules:
- validation_models.py: Type definitions and common types
- process_validators.py: Process management (pkill, kill, killall)
- filesystem_validators.py: File system operations (chmod, rm, init.sh)
- git_validators.py: Git operations (commit with secret scanning)
- database_validators.py: Database operations (postgres, mysql, redis, mongo)
- validator_registry.py: Central registry of all validators

For backwards compatibility, all validators and the VALIDATORS registry
are re-exported from this module.
"""

# Re-export validation models
# Re-export all validators for backwards compatibility
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
from .git_validators import (
    validate_git_command,
    validate_git_commit,
    validate_git_config,
)
from .process_validators import (
    validate_kill_command,
    validate_killall_command,
    validate_pkill_command,
)
from .validation_models import ValidationResult, ValidatorFunction
from .validator_registry import VALIDATORS, get_validator

# Define __all__ for explicit exports
__all__ = [
    # Types
    "ValidationResult",
    "ValidatorFunction",
    # Registry
    "VALIDATORS",
    "get_validator",
    # Process validators
    "validate_pkill_command",
    "validate_kill_command",
    "validate_killall_command",
    # Filesystem validators
    "validate_chmod_command",
    "validate_rm_command",
    "validate_init_script",
    # Git validators
    "validate_git_commit",
    "validate_git_command",
    "validate_git_config",
    # Database validators
    "validate_dropdb_command",
    "validate_dropuser_command",
    "validate_psql_command",
    "validate_mysql_command",
    "validate_mysqladmin_command",
    "validate_redis_cli_command",
    "validate_mongosh_command",
]
