/**
 * Shell Escape Utilities
 *
 * Provides safe escaping for shell command arguments to prevent command injection.
 * IMPORTANT: Always use these utilities when interpolating user-controlled values into shell commands.
 */

import type { ShellType } from '../../main/terminal/types';

/**
 * Escape a string for safe use as a shell argument (POSIX/bash).
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
 * Escape a string for safe use in PowerShell.
 *
 * PowerShell uses single quotes for literal strings (no variable expansion).
 * Single quotes inside are escaped by doubling them.
 *
 * Examples:
 * - "hello" → 'hello'
 * - "it's" → 'it''s'
 * - "C:\Program Files" → 'C:\Program Files'
 *
 * @param arg - The argument to escape
 * @returns The escaped argument wrapped in single quotes
 */
export function escapeShellArgPowerShell(arg: string): string {
  // In PowerShell, single quotes are literal strings
  // Single quotes inside are escaped by doubling them
  const escaped = arg.replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Escape a string for use inside a double-quoted cmd.exe argument.
 *
 * Inside double quotes in cmd.exe:
 * - Special chars &|<>^ are treated as literals (no escaping needed)
 * - % must be escaped as %% to prevent variable expansion
 * - " cannot be reliably escaped inside double quotes in cmd.exe
 *
 * @param arg - The argument to escape
 * @returns The escaped argument safe for use inside double quotes in cmd.exe
 * @throws Error if the argument contains double quotes (cannot be safely escaped in cmd.exe)
 */
export function escapeShellArgWindows(arg: string): string {
  // Double quotes cannot be reliably escaped inside double-quoted strings in cmd.exe.
  // Reject arguments containing double quotes to prevent command injection.
  // This is extremely rare in practice (paths almost never contain double quotes),
  // but we must be defensive.
  if (arg.includes('"')) {
    throw new Error('Path contains double quote character which cannot be safely escaped for cmd.exe');
  }

  // Only % needs escaping inside double quotes - it prevents variable expansion
  // Characters like &|<>^ are treated as literals inside double quotes
  return arg.replace(/%/g, '%%');
}

/**
 * Escape a shell argument based on shell type.
 *
 * @param arg - The argument to escape
 * @param shellType - The target shell type
 * @returns The escaped argument appropriate for the shell
 */
export function escapeShellArgForShell(arg: string, shellType: ShellType): string {
  switch (shellType) {
    case 'powershell':
    case 'pwsh':
      return escapeShellArgPowerShell(arg);
    case 'cmd':
      return `"${escapeShellArgWindows(arg)}"`;
    case 'bash':
    case 'zsh':
    default:
      return escapeShellArg(arg);
  }
}

/**
 * Escape a command for execution based on shell type.
 *
 * This differs from escapeShellArgForShell in that PowerShell requires
 * the & (call) operator to execute a quoted command path.
 *
 * @param cmd - The command/executable path to escape
 * @param shellType - The target shell type
 * @returns The escaped command ready for execution
 */
export function escapeCommandForShell(cmd: string, shellType: ShellType): string {
  switch (shellType) {
    case 'powershell':
    case 'pwsh':
      // PowerShell requires & (call) operator to execute a quoted string
      return `& ${escapeShellArgPowerShell(cmd)}`;
    case 'cmd':
      return `"${escapeShellArgWindows(cmd)}"`;
    case 'bash':
    case 'zsh':
    default:
      return escapeShellArg(cmd);
  }
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
 * @deprecated Use buildCdCommandForShell for shell-aware command building
 */
export function buildCdCommand(path: string | undefined): string {
  if (!path) {
    return '';
  }

  // Windows cmd.exe uses double quotes, Unix shells use single quotes
  if (process.platform === 'win32') {
    // On Windows, escape cmd.exe metacharacters (& | < > ^) that could enable command injection,
    // then wrap in double quotes. Using escapeShellArgWindows for proper escaping.
    const escaped = escapeShellArgWindows(path);
    return `cd "${escaped}" && `;
  }

  return `cd ${escapeShellPath(path)} && `;
}

/**
 * Build a shell-aware cd command.
 *
 * @param path - The directory path
 * @param shellType - The target shell type
 * @returns A shell-appropriate cd command string, or empty string if path is undefined
 */
export function buildCdCommandForShell(path: string | undefined, shellType: ShellType): string {
  if (!path) {
    return '';
  }

  switch (shellType) {
    case 'powershell':
    case 'pwsh':
      // PowerShell: Set-Location with single-quoted path, semicolon separator
      return `Set-Location ${escapeShellArgPowerShell(path)}; `;

    case 'cmd':
      // cmd.exe: cd /d with double-quoted path, && separator
      return `cd /d "${escapeShellArgWindows(path)}" && `;

    case 'bash':
    case 'zsh':
    default:
      // Bash/Zsh: cd with single-quoted path, && separator
      return `cd ${escapeShellArg(path)} && `;
  }
}

/**
 * Build a shell-aware PATH prefix for command execution.
 *
 * @param envPath - The PATH value to set
 * @param shellType - The target shell type
 * @returns A shell-appropriate PATH assignment string, or empty string if envPath is undefined
 */
export function buildPathPrefixForShell(envPath: string | undefined, shellType: ShellType): string {
  if (!envPath) {
    return '';
  }

  switch (shellType) {
    case 'powershell':
    case 'pwsh':
      // PowerShell: $env:PATH = 'value'; (keep Windows semicolons in path)
      return `$env:PATH=${escapeShellArgPowerShell(envPath)}; `;

    case 'cmd':
      // cmd.exe: set "PATH=value" && (keep Windows semicolons in path)
      // Escape % to prevent variable expansion
      return `set "PATH=${escapeShellArgWindows(envPath)}" && `;

    case 'bash':
    case 'zsh':
    default: {
      // Bash/Zsh: PATH='value' (convert Windows semicolons to Unix colons)
      const unixPath = envPath.replace(/;/g, ':');
      return `PATH=${escapeShellArg(unixPath)} `;
    }
  }
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
    /`/,   // Backtick command substitution
    /\|/,  // Pipe
    /;/,   // Command separator
    /&&/,  // AND operator
    /\|\|/, // OR operator
    />/,   // Output redirection
    /</,   // Input redirection
    /\n/,  // Newlines
    /\r/,  // Carriage returns
  ];

  return !suspiciousPatterns.some(pattern => pattern.test(path));
}
