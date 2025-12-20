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
 *
 * @param path - The directory path
 * @returns A safe "cd '<path>' && " string, or empty string if path is undefined
 */
export function buildCdCommand(path: string | undefined): string {
  if (!path) {
    return '';
  }
  return `cd ${escapeShellPath(path)} && `;
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
