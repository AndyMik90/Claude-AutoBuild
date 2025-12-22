"""
Database Validators
===================

Validators for database operations (postgres, mysql, redis, mongodb).
"""

import re
import shlex

from .validation_models import ValidationResult

# =============================================================================
# SQL PATTERNS AND UTILITIES
# =============================================================================

# Patterns that indicate destructive SQL operations
DESTRUCTIVE_SQL_PATTERNS = [
    r"\bDROP\s+(DATABASE|SCHEMA|TABLE|INDEX|VIEW|FUNCTION|PROCEDURE|TRIGGER)\b",
    r"\bTRUNCATE\s+(TABLE\s+)?\w+",
    r"\bDELETE\s+FROM\s+\w+\s*(;|$)",  # DELETE without WHERE clause
    r"\bDROP\s+ALL\b",
    r"\bDESTROY\b",
]

# Safe database names that can be dropped (test/dev databases)
SAFE_DATABASE_PATTERNS = [
    r"^test",
    r"_test$",
    r"^dev",
    r"_dev$",
    r"^local",
    r"_local$",
    r"^tmp",
    r"_tmp$",
    r"^temp",
    r"_temp$",
    r"^scratch",
    r"^sandbox",
    r"^mock",
    r"_mock$",
]


def _is_safe_database_name(db_name: str) -> bool:
    """
    Check if a database name appears to be a safe test/dev database.

    Args:
        db_name: The database name to check

    Returns:
        True if the name matches safe patterns, False otherwise
    """
    db_lower = db_name.lower()
    for pattern in SAFE_DATABASE_PATTERNS:
        if re.search(pattern, db_lower):
            return True
    return False


def _contains_destructive_sql(sql: str) -> tuple[bool, str]:
    """
    Check if SQL contains destructive operations.

    Args:
        sql: The SQL statement to check

    Returns:
        Tuple of (is_destructive, matched_pattern)
    """
    sql_upper = sql.upper()
    for pattern in DESTRUCTIVE_SQL_PATTERNS:
        match = re.search(pattern, sql_upper, re.IGNORECASE)
        if match:
            return True, match.group(0)
    return False, ""


# =============================================================================
# POSTGRESQL VALIDATORS
# =============================================================================


def validate_dropdb_command(command_string: str) -> ValidationResult:
    """
    Validate dropdb commands - only allow dropping test/dev databases.

    Production databases should never be dropped autonomously.

    Args:
        command_string: The full dropdb command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse dropdb command"

    if not tokens:
        return False, "Empty dropdb command"

    # Find the database name (last non-flag argument)
    db_name = None
    skip_next = False
    for token in tokens[1:]:
        if skip_next:
            skip_next = False
            continue
        # Flags that take arguments
        if token in (
            "-h",
            "--host",
            "-p",
            "--port",
            "-U",
            "--username",
            "-w",
            "--no-password",
            "-W",
            "--password",
            "--maintenance-db",
        ):
            skip_next = True
            continue
        if token.startswith("-"):
            continue
        db_name = token

    if not db_name:
        return False, "dropdb requires a database name"

    if _is_safe_database_name(db_name):
        return True, ""

    return False, (
        f"dropdb '{db_name}' blocked for safety. Only test/dev databases can be dropped autonomously. "
        f"Safe patterns: test*, *_test, dev*, *_dev, local*, tmp*, temp*, scratch*, sandbox*, mock*"
    )


def validate_dropuser_command(command_string: str) -> ValidationResult:
    """
    Validate dropuser commands - only allow dropping test/dev users.

    Args:
        command_string: The full dropuser command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse dropuser command"

    if not tokens:
        return False, "Empty dropuser command"

    # Find the username (last non-flag argument)
    username = None
    skip_next = False
    for token in tokens[1:]:
        if skip_next:
            skip_next = False
            continue
        if token in (
            "-h",
            "--host",
            "-p",
            "--port",
            "-U",
            "--username",
            "-w",
            "--no-password",
            "-W",
            "--password",
        ):
            skip_next = True
            continue
        if token.startswith("-"):
            continue
        username = token

    if not username:
        return False, "dropuser requires a username"

    # Only allow dropping test/dev users
    safe_user_patterns = [
        r"^test",
        r"_test$",
        r"^dev",
        r"_dev$",
        r"^tmp",
        r"^temp",
        r"^mock",
    ]
    username_lower = username.lower()
    for pattern in safe_user_patterns:
        if re.search(pattern, username_lower):
            return True, ""

    return False, (
        f"dropuser '{username}' blocked for safety. Only test/dev users can be dropped autonomously. "
        f"Safe patterns: test*, *_test, dev*, *_dev, tmp*, temp*, mock*"
    )


def validate_psql_command(command_string: str) -> ValidationResult:
    """
    Validate psql commands - block destructive SQL operations.

    Allows: SELECT, INSERT, UPDATE (with WHERE), CREATE, ALTER, \\d commands
    Blocks: DROP DATABASE/TABLE, TRUNCATE, DELETE without WHERE

    Args:
        command_string: The full psql command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse psql command"

    if not tokens:
        return False, "Empty psql command"

    # Look for -c flag (command to execute)
    sql_command = None
    for i, token in enumerate(tokens):
        if token == "-c" and i + 1 < len(tokens):
            sql_command = tokens[i + 1]
            break
        if token.startswith("-c"):
            # Handle -c"SQL" format
            sql_command = token[2:]
            break

    if sql_command:
        is_destructive, matched = _contains_destructive_sql(sql_command)
        if is_destructive:
            return False, (
                f"psql command contains destructive SQL: '{matched}'. "
                f"DROP/TRUNCATE/DELETE operations require manual confirmation."
            )

    return True, ""


# =============================================================================
# MYSQL VALIDATORS
# =============================================================================


def validate_mysql_command(command_string: str) -> ValidationResult:
    """
    Validate mysql commands - block destructive SQL operations.

    Args:
        command_string: The full mysql command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse mysql command"

    if not tokens:
        return False, "Empty mysql command"

    # Look for -e flag (execute command)
    sql_command = None
    for i, token in enumerate(tokens):
        if token == "-e" and i + 1 < len(tokens):
            sql_command = tokens[i + 1]
            break
        if token.startswith("-e"):
            sql_command = token[2:]
            break
        if token == "--execute" and i + 1 < len(tokens):
            sql_command = tokens[i + 1]
            break

    if sql_command:
        is_destructive, matched = _contains_destructive_sql(sql_command)
        if is_destructive:
            return False, (
                f"mysql command contains destructive SQL: '{matched}'. "
                f"DROP/TRUNCATE/DELETE operations require manual confirmation."
            )

    return True, ""


def validate_mysqladmin_command(command_string: str) -> ValidationResult:
    """
    Validate mysqladmin commands - block destructive operations.

    Args:
        command_string: The full mysqladmin command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    dangerous_mysqladmin_ops = {"drop", "shutdown", "kill"}

    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse mysqladmin command"

    if not tokens:
        return False, "Empty mysqladmin command"

    # Check for dangerous operations
    for token in tokens[1:]:
        if token.lower() in dangerous_mysqladmin_ops:
            return False, (
                f"mysqladmin '{token}' is blocked for safety. "
                f"Destructive operations require manual confirmation."
            )

    return True, ""


# =============================================================================
# REDIS VALIDATORS
# =============================================================================


def validate_redis_cli_command(command_string: str) -> ValidationResult:
    """
    Validate redis-cli commands - block destructive operations.

    Blocks: FLUSHALL, FLUSHDB, DEBUG SEGFAULT, SHUTDOWN, CONFIG SET

    Args:
        command_string: The full redis-cli command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    dangerous_redis_commands = {
        "FLUSHALL",  # Deletes ALL data from ALL databases
        "FLUSHDB",  # Deletes all data from current database
        "DEBUG",  # Can crash the server
        "SHUTDOWN",  # Shuts down the server
        "SLAVEOF",  # Can change replication
        "REPLICAOF",  # Can change replication
        "CONFIG",  # Can modify server config
        "BGSAVE",  # Can cause disk issues
        "BGREWRITEAOF",  # Can cause disk issues
        "CLUSTER",  # Can modify cluster topology
    }

    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse redis-cli command"

    if not tokens:
        return False, "Empty redis-cli command"

    # Find the Redis command (skip flags and their arguments)
    skip_next = False
    for token in tokens[1:]:
        if skip_next:
            skip_next = False
            continue
        # Flags that take arguments
        if token in ("-h", "-p", "-a", "-n", "--pass", "--user", "-u"):
            skip_next = True
            continue
        if token.startswith("-"):
            continue

        # This should be the Redis command
        redis_cmd = token.upper()
        if redis_cmd in dangerous_redis_commands:
            return False, (
                f"redis-cli command '{redis_cmd}' is blocked for safety. "
                f"Destructive Redis operations require manual confirmation."
            )
        break  # Only check the first non-flag token

    return True, ""


# =============================================================================
# MONGODB VALIDATORS
# =============================================================================


def validate_mongosh_command(command_string: str) -> ValidationResult:
    """
    Validate mongosh/mongo commands - block destructive operations.

    Blocks: dropDatabase(), drop(), deleteMany({}), remove({})

    Args:
        command_string: The full mongosh command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    dangerous_mongo_patterns = [
        r"\.dropDatabase\s*\(",
        r"\.drop\s*\(",
        r"\.deleteMany\s*\(\s*\{\s*\}\s*\)",  # deleteMany({}) - deletes all
        r"\.remove\s*\(\s*\{\s*\}\s*\)",  # remove({}) - deletes all (deprecated)
        r"db\.dropAllUsers\s*\(",
        r"db\.dropAllRoles\s*\(",
    ]

    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse mongosh command"

    if not tokens:
        return False, "Empty mongosh command"

    # Look for --eval flag
    eval_script = None
    for i, token in enumerate(tokens):
        if token == "--eval" and i + 1 < len(tokens):
            eval_script = tokens[i + 1]
            break

    if eval_script:
        for pattern in dangerous_mongo_patterns:
            if re.search(pattern, eval_script, re.IGNORECASE):
                return False, (
                    f"mongosh command contains destructive operation matching '{pattern}'. "
                    f"Database drop/delete operations require manual confirmation."
                )

    return True, ""
