"""
Command Validators
==================

Specialized validation functions for sensitive commands.
Each validator performs deep inspection of command arguments to ensure safety.
"""

import re
import shlex

# =============================================================================
# PROCESS MANAGEMENT VALIDATORS
# =============================================================================


def validate_pkill_command(command_string: str) -> tuple[bool, str]:
    """
    Validate pkill commands - only allow killing dev-related processes.
    """
    allowed_process_names = {
        # Node.js ecosystem
        "node",
        "npm",
        "npx",
        "yarn",
        "pnpm",
        "bun",
        "deno",
        "vite",
        "next",
        "nuxt",
        "webpack",
        "esbuild",
        "rollup",
        "tsx",
        "ts-node",
        # Python ecosystem
        "python",
        "python3",
        "flask",
        "uvicorn",
        "gunicorn",
        "django",
        "celery",
        "streamlit",
        "gradio",
        "pytest",
        "mypy",
        "ruff",
        # Other languages
        "cargo",
        "rustc",
        "go",
        "ruby",
        "rails",
        "php",
        # Databases (local dev)
        "postgres",
        "mysql",
        "mongod",
        "redis-server",
    }

    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse pkill command"

    if not tokens:
        return False, "Empty pkill command"

    # Separate flags from arguments
    args = []
    for token in tokens[1:]:
        if not token.startswith("-"):
            args.append(token)

    if not args:
        return False, "pkill requires a process name"

    # The target is typically the last non-flag argument
    target = args[-1]

    # For -f flag (full command line match), extract the first word
    if " " in target:
        target = target.split()[0]

    if target in allowed_process_names:
        return True, ""
    return (
        False,
        f"pkill only allowed for dev processes: {sorted(allowed_process_names)[:10]}...",
    )


def validate_kill_command(command_string: str) -> tuple[bool, str]:
    """
    Validate kill commands - allow killing by PID (user must know the PID).
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse kill command"

    # Allow kill with specific PIDs or signal + PID
    # Block kill -9 -1 (kill all processes) and similar
    for token in tokens[1:]:
        if token == "-1" or token == "0" or token == "-0":
            return False, "kill -1 and kill 0 are not allowed (affects all processes)"

    return True, ""


def validate_killall_command(command_string: str) -> tuple[bool, str]:
    """
    Validate killall commands - same rules as pkill.
    """
    return validate_pkill_command(command_string)


# =============================================================================
# FILE SYSTEM VALIDATORS
# =============================================================================


def validate_chmod_command(command_string: str) -> tuple[bool, str]:
    """
    Validate chmod commands - only allow making files executable with +x.
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
    safe_modes = {
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
    if mode not in safe_modes and not re.match(r"^[ugoa]*\+x$", mode):
        return (
            False,
            f"chmod only allowed with executable modes (+x, 755, etc.), got: {mode}",
        )

    return True, ""


def validate_rm_command(command_string: str) -> tuple[bool, str]:
    """
    Validate rm commands - prevent dangerous deletions.
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse rm command"

    if not tokens:
        return False, "Empty rm command"

    # Check for dangerous patterns
    dangerous_patterns = [
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

    for token in tokens[1:]:
        if token.startswith("-"):
            # Allow -r, -f, -rf, -fr, -v, -i
            continue
        for pattern in dangerous_patterns:
            if re.match(pattern, token):
                return False, f"rm target '{token}' is not allowed for safety"

    return True, ""


def validate_init_script(command_string: str) -> tuple[bool, str]:
    """
    Validate init.sh script execution - only allow ./init.sh.
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


# =============================================================================
# GIT VALIDATORS
# =============================================================================


def validate_git_commit(command_string: str) -> tuple[bool, str]:
    """
    Validate git commit commands - run secret scan before allowing commit.

    This provides autonomous feedback to the AI agent if secrets are detected,
    with actionable instructions on how to fix the issue.
    """
    from pathlib import Path

    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse git command"

    if not tokens or tokens[0] != "git":
        return True, ""

    # Only intercept 'git commit' commands (not git add, git push, etc.)
    if len(tokens) < 2 or tokens[1] != "commit":
        return True, ""

    # Import the secret scanner
    try:
        from scan_secrets import get_staged_files, mask_secret, scan_files
    except ImportError:
        # Scanner not available, allow commit (don't break the build)
        return True, ""

    # Get staged files and scan them
    staged_files = get_staged_files()
    if not staged_files:
        return True, ""  # No staged files, allow commit

    matches = scan_files(staged_files, Path.cwd())

    if not matches:
        return True, ""  # No secrets found, allow commit

    # Secrets found! Build detailed feedback for the AI agent
    # Group by file for clearer output
    files_with_secrets: dict[str, list] = {}
    for match in matches:
        if match.file_path not in files_with_secrets:
            files_with_secrets[match.file_path] = []
        files_with_secrets[match.file_path].append(match)

    # Build actionable error message
    error_lines = [
        "SECRETS DETECTED - COMMIT BLOCKED",
        "",
        "The following potential secrets were found in staged files:",
        "",
    ]

    for file_path, file_matches in files_with_secrets.items():
        error_lines.append(f"File: {file_path}")
        for match in file_matches:
            masked = mask_secret(match.matched_text, 12)
            error_lines.append(f"  Line {match.line_number}: {match.pattern_name}")
            error_lines.append(f"    Found: {masked}")
        error_lines.append("")

    error_lines.extend(
        [
            "ACTION REQUIRED:",
            "",
            "1. Move secrets to environment variables:",
            "   - Add the secret value to .env (create if needed)",
            "   - Update the code to use os.environ.get('VAR_NAME') or process.env.VAR_NAME",
            "   - Add the variable name (not value) to .env.example",
            "",
            "2. Example fix:",
            "   BEFORE: api_key = 'sk-abc123...'",
            "   AFTER:  api_key = os.environ.get('API_KEY')",
            "",
            "3. If this is a FALSE POSITIVE (test data, example, mock):",
            "   - Add the file pattern to .secretsignore",
            "   - Example: echo 'tests/fixtures/' >> .secretsignore",
            "",
            "After fixing, stage the changes with 'git add .' and retry the commit.",
        ]
    )

    return False, "\n".join(error_lines)


# =============================================================================
# DATABASE VALIDATORS
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
    """Check if a database name appears to be a safe test/dev database."""
    db_lower = db_name.lower()
    for pattern in SAFE_DATABASE_PATTERNS:
        if re.search(pattern, db_lower):
            return True
    return False


def _contains_destructive_sql(sql: str) -> tuple[bool, str]:
    """Check if SQL contains destructive operations."""
    sql_upper = sql.upper()
    for pattern in DESTRUCTIVE_SQL_PATTERNS:
        match = re.search(pattern, sql_upper, re.IGNORECASE)
        if match:
            return True, match.group(0)
    return False, ""


def validate_dropdb_command(command_string: str) -> tuple[bool, str]:
    """
    Validate dropdb commands - only allow dropping test/dev databases.

    Production databases should never be dropped autonomously.
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


def validate_dropuser_command(command_string: str) -> tuple[bool, str]:
    """
    Validate dropuser commands - only allow dropping test/dev users.
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


def validate_psql_command(command_string: str) -> tuple[bool, str]:
    """
    Validate psql commands - block destructive SQL operations.

    Allows: SELECT, INSERT, UPDATE (with WHERE), CREATE, ALTER, \\d commands
    Blocks: DROP DATABASE/TABLE, TRUNCATE, DELETE without WHERE
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


def validate_mysql_command(command_string: str) -> tuple[bool, str]:
    """
    Validate mysql commands - block destructive SQL operations.
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


def validate_redis_cli_command(command_string: str) -> tuple[bool, str]:
    """
    Validate redis-cli commands - block destructive operations.

    Blocks: FLUSHALL, FLUSHDB, DEBUG SEGFAULT, SHUTDOWN, CONFIG SET
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


def validate_mongosh_command(command_string: str) -> tuple[bool, str]:
    """
    Validate mongosh/mongo commands - block destructive operations.

    Blocks: dropDatabase(), drop(), deleteMany({}), remove({})
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


def validate_mysqladmin_command(command_string: str) -> tuple[bool, str]:
    """
    Validate mysqladmin commands - block destructive operations.
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
# VALIDATOR REGISTRY
# =============================================================================

# Map command names to their validation functions
VALIDATORS = {
    "pkill": validate_pkill_command,
    "kill": validate_kill_command,
    "killall": validate_killall_command,
    "chmod": validate_chmod_command,
    "rm": validate_rm_command,
    "init.sh": validate_init_script,
    "git": validate_git_commit,
    # Database validators
    "dropdb": validate_dropdb_command,
    "dropuser": validate_dropuser_command,
    "psql": validate_psql_command,
    "mysql": validate_mysql_command,
    "mariadb": validate_mysql_command,  # Same syntax as mysql
    "redis-cli": validate_redis_cli_command,
    "mongosh": validate_mongosh_command,
    "mongo": validate_mongosh_command,  # Legacy mongo shell
    "mysqladmin": validate_mysqladmin_command,
}
