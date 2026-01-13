/**
 * Shell Escape Utilities
 *
 * Provides safe escaping for shell command arguments to prevent command injection.
 * IMPORTANT: Always use these utilities when interpolating user-controlled values into shell commands.
 */

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
    .replace(/\^/g, '^^')     // Escape carets first (escape char itself)
    .replace(/"/g, '^"')      // Escape double quotes
    .replace(/&/g, '^&')      // Escape ampersand (command separator)
    .replace(/\|/g, '^|')     // Escape pipe
    .replace(/</g, '^<')      // Escape less than
    .replace(/>/g, '^>')      // Escape greater than
    .replace(/%/g, '%%');     // Escape percent (variable expansion)

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
