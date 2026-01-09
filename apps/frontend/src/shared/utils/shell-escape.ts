/**
 * Shell Escape Utilities
 *
 * Provides safe escaping for shell command arguments to prevent command injection.
 * IMPORTANT: Always use these utilities when interpolating user-controlled values into shell commands.
 *
 * Supports multiple shell types:
 * - POSIX shells (bash, zsh, fish): Single-quote escaping
 * - Windows cmd.exe: Caret escaping with double quotes
 * - PowerShell: Special escaping rules
 */

// Re-export ShellType for convenience
import type { ShellType as ShellType_ } from "../../main/terminal/types";
export type ShellType = ShellType_;

/**
 * Escape a string for safe use as a shell argument.
 *
 * Uses single quotes which prevent all shell expansion (variables, command substitution, etc.)
 * except for single quotes themselves, which are escaped as '\''
 *
 * Examples:
 * - "hello" → 'hello'
 * - "hello world" → 'hello world'
 * - "it's" → 'it'\''s'
 * - "$(rm -rf /)" → '$(rm -rf /)'
 * - 'test"; rm -rf / #' → 'test"; rm -rf / #'
 *
 * @param arg - The argument to escape
 * @returns The escaped argument wrapped in single quotes
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with: end quote, escaped quote, start quote
  // This is the standard POSIX-safe way to handle single quotes
  const escaped = arg.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

/**
 * Escape a path for use in a cd command.
 *
 * @param path - The path to escape
 * @returns The escaped path safe for use in shell commands
 */
export function escapeShellPath(path: string): string {
  return escapeShellArg(path);
}

/**
 * Build a safe cd command from a path.
 * Uses platform-appropriate quoting (double quotes on Windows, single quotes on Unix).
 *
 * @param path - The directory path
 * @returns A safe "cd '<path>' && " string, or empty string if path is undefined
 */
export function buildCdCommand(path: string | undefined): string {
  if (!path) {
    return "";
  }

  // Windows cmd.exe uses double quotes, Unix shells use single quotes
  if (process.platform === "win32") {
    // On Windows, escape cmd.exe metacharacters (& | < > ^) that could enable command injection,
    // then wrap in double quotes. Using escapeShellArgWindows for proper escaping.
    const escaped = escapeShellArgWindows(path);
    return `cd "${escaped}" && `;
  }

  return `cd ${escapeShellPath(path)} && `;
}

/**
 * Escape a string for safe use as a Windows cmd.exe argument.
 *
 * Windows cmd.exe uses different escaping rules than POSIX shells.
 * This function escapes special characters that could break out of strings
 * or execute additional commands.
 *
 * @param arg - The argument to escape
 * @returns The escaped argument safe for use in cmd.exe
 */
export function escapeShellArgWindows(arg: string): string {
  // Escape characters that have special meaning in cmd.exe:
  // ^ is the escape character in cmd.exe
  // " & | < > ^ need to be escaped
  // % is used for variable expansion
  const escaped = arg
    .replace(/\^/g, "^^") // Escape carets first (escape char itself)
    .replace(/"/g, '^"') // Escape double quotes
    .replace(/&/g, "^&") // Escape ampersand (command separator)
    .replace(/\|/g, "^|") // Escape pipe
    .replace(/</g, "^<") // Escape less than
    .replace(/>/g, "^>") // Escape greater than
    .replace(/%/g, "%%"); // Escape percent (variable expansion)

  return escaped;
}

/**
 * Validate that a path doesn't contain obviously malicious patterns.
 * This is a defense-in-depth measure - escaping should handle all cases,
 * but this can catch obvious attack attempts early.
 *
 * @param path - The path to validate
 * @returns true if the path appears safe, false if it contains suspicious patterns
 */
export function isPathSafe(path: string): boolean {
  // Check for obvious shell metacharacters that shouldn't appear in paths
  // Note: This is defense-in-depth; escaping handles these, but we can log/reject
  const suspiciousPatterns = [
    /\$\(/, // Command substitution $(...)
    /`/, // Backtick command substitution
    /\|/, // Pipe
    /;/, // Command separator
    /&&/, // AND operator
    /\|\|/, // OR operator
    />/, // Output redirection
    /</, // Input redirection
    /\n/, // Newlines
    /\r/, // Carriage returns
  ];

  return !suspiciousPatterns.some((pattern) => pattern.test(path));
}

// ============================================================================
// POWERSHELL-SPECIFIC UTILITIES
// ============================================================================

/**
 * Escape a string for safe use as a PowerShell command argument.
 *
 * PowerShell uses different escaping rules than bash and cmd.exe:
 * - Double quotes are used for strings with variable expansion
 * - Single quotes are for literal strings (no expansion)
 * - Backticks are the escape character inside double quotes
 * - Special characters like `$` and ``` ` ``` need escaping inside double quotes
 *
 * For maximum safety and to avoid variable expansion, we use single-quoted strings.
 *
 * @param arg - The argument to escape
 * @returns The escaped argument wrapped in single quotes for PowerShell
 *
 * @example
 * ```typescript
 * escapePowerShellArg("hello");              // 'hello'
 * escapePowerShellArg("hello world");        // 'hello world'
 * escapePowerShellArg("it's");               // 'it''s'
 * escapePowerShellArg("C:\\Program Files");  // 'C:\\Program Files'
 * ```
 */
export function escapePowerShellArg(arg: string): string {
  // In PowerShell, single quotes are literal strings - no variable expansion
  // To include a single quote in a single-quoted string, double it: ''
  const escaped = arg.replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Build a PATH environment variable assignment for the specified shell type.
 *
 * Different shells use different syntax:
 * - PowerShell: `$env:PATH = 'value'`
 * - cmd.exe: `PATH=value` (or `set "PATH=value"`)
 * - bash/zsh/fish: `PATH='value'` or `export PATH='value'`
 *
 * @param pathValue - The PATH value to set
 * @param shellType - The shell type (powershell, cmd, bash, etc.)
 * @returns The appropriate PATH assignment command for the shell
 *
 * @example
 * ```typescript
 * buildPathAssignment('C:\\Git\\cmd;C:\\npm', 'powershell');
 * // Returns: `$env:PATH = 'C:\\Git\\cmd;C:\\npm'`
 *
 * buildPathAssignment('/usr/bin:/usr/local/bin', 'bash');
 * // Returns: `PATH='/usr/bin:/usr/local/bin'`
 * ```
 */
export function buildPathAssignment(pathValue: string, shellType: ShellType): string {
  switch (shellType) {
    case "powershell":
      return `$env:PATH = ${escapePowerShellArg(pathValue)}`;

    case "cmd": {
      // cmd.exe uses: PATH=value (no quotes needed for value, but we escape special chars)
      // For safety with special characters, we use set "VAR=value"
      const escapedCmd = escapeShellArgWindows(pathValue);
      return `set "PATH=${escapedCmd}"`;
    }

    case "bash":
    case "zsh":
    case "fish":
      return `PATH=${escapeShellArg(pathValue)}`;

    default:
      // Fallback to bash-style syntax
      return `PATH=${escapeShellArg(pathValue)}`;
  }
}

/**
 * Build an environment variable assignment for the specified shell type.
 *
 * Different shells use different syntax:
 * - PowerShell: `$env:VARNAME = 'value'`
 * - cmd.exe: `set "VARNAME=value"` (variables accessed as %VARNAME%)
 * - bash/zsh/fish: `VARNAME='value'` or `export VARNAME='value'` (accessed as $VARNAME)
 *
 * @param varName - The environment variable name
 * @param value - The value to assign
 * @param shellType - The shell type (powershell, cmd, bash, etc.)
 * @returns The appropriate environment variable assignment for the shell
 *
 * @example
 * ```typescript
 * buildEnvVarAssignment('CLAUDE_CONFIG_DIR', 'C:\\Users\\Jane\\Config', 'powershell');
 * // Returns: `$env:CLAUDE_CONFIG_DIR = 'C:\\Users\\Jane\\Config'`
 *
 * buildEnvVarAssignment('CLAUDE_CONFIG_DIR', '/home/jane/config', 'bash');
 * // Returns: `CLAUDE_CONFIG_DIR='/home/jane/config'`
 * ```
 */
export function buildEnvVarAssignment(
  varName: string,
  value: string,
  shellType: ShellType
): string {
  switch (shellType) {
    case "powershell":
      return `$env:${varName} = ${escapePowerShellArg(value)}`;

    case "cmd": {
      const escapedCmd = escapeShellArgWindows(value);
      return `set "${varName}=${escapedCmd}"`;
    }

    case "bash":
    case "zsh":
    case "fish":
      return `${varName}=${escapeShellArg(value)}`;

    default:
      // Fallback to bash-style syntax
      return `${varName}=${escapeShellArg(value)}`;
  }
}

/**
 * Build an environment variable reference for the specified shell type.
 *
 * Different shells use different syntax to reference environment variables:
 * - PowerShell: `$env:VARNAME`
 * - cmd.exe: `%VARNAME%`
 * - bash/zsh/fish: `$VARNAME`
 *
 * @param varName - The environment variable name
 * @param shellType - The shell type (powershell, cmd, bash, etc.)
 * @returns The appropriate environment variable reference for the shell
 *
 * @example
 * ```typescript
 * buildEnvVarReference('CLAUDE_CONFIG_DIR', 'powershell');
 * // Returns: `$env:CLAUDE_CONFIG_DIR`
 *
 * buildEnvVarReference('CLAUDE_CONFIG_DIR', 'cmd');
 * // Returns: `%CLAUDE_CONFIG_DIR%`
 *
 * buildEnvVarReference('CLAUDE_CONFIG_DIR', 'bash');
 * // Returns: `$CLAUDE_CONFIG_DIR`
 * ```
 */
export function buildEnvVarReference(varName: string, shellType: ShellType): string {
  switch (shellType) {
    case "powershell":
      return `$env:${varName}`;
    case "cmd":
      return `%${varName}%`;
    case "bash":
    case "zsh":
    case "fish":
      return `$${varName}`;
    default:
      // Fallback to bash-style syntax
      return `$${varName}`;
  }
}

/**
 * Build a command invocation for the specified shell type.
 *
 * On Windows, .cmd and .bat files require special handling:
 * - PowerShell: Must use call operator `&` before quoted paths with spaces
 * - cmd.exe: Can execute directly, quotes are fine
 * - bash: Can execute directly, quotes are fine
 *
 * @param commandPath - The path to the command/executable
 * @param args - Command arguments (optional)
 * @param shellType - The shell type (powershell, cmd, bash, etc.)
 * @returns The properly formatted command invocation for the shell
 *
 * @example
 * ```typescript
 * buildCommandInvocation('C:\\Users\\Jane Smith\\claude.cmd', ['setup-token'], 'powershell');
 * // Returns: `& 'C:\\Users\\Jane Smith\\claude.cmd' setup-token`
 *
 * buildCommandInvocation('C:\\Users\\Jane Smith\\claude.cmd', ['setup-token'], 'cmd');
 * // Returns: `"C:\\Users\\Jane Smith\\claude.cmd" setup-token`
 *
 * buildCommandInvocation('/usr/local/bin/claude', ['--version'], 'bash');
 * // Returns: `'/usr/local/bin/claude' --version`
 * ```
 */
export function buildCommandInvocation(
  commandPath: string,
  args: string[] = [],
  shellType: ShellType
): string {
  const hasArgs = args.length > 0;
  const argsStr = hasArgs ? " " + args.join(" ") : "";

  // Check if this is a Windows batch file that needs special handling
  const isWindowsBatchFile =
    process.platform === "win32" &&
    (commandPath.toLowerCase().endsWith(".cmd") || commandPath.toLowerCase().endsWith(".bat"));

  switch (shellType) {
    case "powershell":
      if (isWindowsBatchFile) {
        // PowerShell requires & operator to execute .cmd/.bat files, especially with spaces
        // The path must be quoted if it contains spaces
        return `& ${escapePowerShellArg(commandPath)}${argsStr}`;
      }
      // For other executables (.exe, etc.), no call operator needed
      return `${escapePowerShellArg(commandPath)}${argsStr}`;

    case "cmd": {
      // cmd.exe doesn't need a call operator, just quote paths with spaces
      const escapedCmd = escapeShellArgWindows(commandPath);
      return `"${escapedCmd}"${argsStr}`;
    }

    case "bash":
    case "zsh":
    case "fish":
      return `${escapeShellArg(commandPath)}${argsStr}`;

    default:
      // Fallback to bash-style syntax
      return `${escapeShellArg(commandPath)}${argsStr}`;
  }
}

/**
 * Build a cd command for the specified shell type.
 *
 * Different shells have different syntax:
 * - PowerShell: `Set-Location` or `cd` (works the same)
 * - cmd.exe: `cd /d "path"` (/d to also change drive)
 * - bash/zsh/fish: `cd 'path'`
 *
 * @param path - The directory path
 * @param shellType - The shell type (powershell, cmd, bash, etc.)
 * @returns The appropriate cd command for the shell, or empty string if path is undefined
 *
 * @example
 * ```typescript
 * buildCdCommandForShell('C:\\Users\\Jane\\Projects', 'powershell');
 * // Returns: `cd 'C:\\Users\\Jane\\Projects' && `
 *
 * buildCdCommandForShell('C:\\Users\\Jane\\Projects', 'cmd');
 * // Returns: `cd /d "C:\\Users\\Jane\\Projects" && `
 *
 * buildCdCommandForShell('/home/jane/projects', 'bash');
 * // Returns: `cd '/home/jane/projects' && `
 * ```
 */
export function buildCdCommandForShell(path: string | undefined, shellType: ShellType): string {
  if (!path) {
    return "";
  }

  switch (shellType) {
    case "powershell":
      return `cd ${escapePowerShellArg(path)} && `;

    case "cmd": {
      // /d flag also changes drive letter (e.g., from C: to D:)
      const escapedCmd = escapeShellArgWindows(path);
      return `cd /d "${escapedCmd}" && `;
    }

    case "bash":
    case "zsh":
    case "fish":
      return `cd ${escapeShellArg(path)} && `;

    default:
      // Fallback to bash-style syntax
      return `cd ${escapeShellArg(path)} && `;
  }
}

/**
 * Normalize PATH entries for the specified shell type.
 *
 * PATH separators differ between platforms and shells:
 * - Windows (cmd.exe, PowerShell): Use semicolon (;)
 * - Unix (bash, zsh, fish): Use colon (:)
 *
 * @param paths - Array of path entries to join
 * @param shellType - The shell type (powershell, cmd, bash, etc.)
 * @returns The properly joined PATH string
 *
 * @example
 * ```typescript
 * buildPathString(['C:\\Git\\cmd', 'C:\\npm'], 'powershell');
 * // Returns: `C:\\Git\\cmd;C:\\npm`
 *
 * buildPathString(['/usr/bin', '/usr/local/bin'], 'bash');
 * // Returns: `/usr/bin:/usr/local/bin`
 * ```
 */
export function buildPathString(paths: string[], shellType: ShellType): string {
  // Windows shells use semicolon, Unix shells use colon
  const separator = shellType === "powershell" || shellType === "cmd" ? ";" : ":";

  return paths.filter(Boolean).join(separator);
}
