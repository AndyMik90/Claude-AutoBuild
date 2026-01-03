/**
 * Shell Escape Utilities
 *
 * Provides safe escaping for shell command arguments to prevent command injection.
 * IMPORTANT: Always use these utilities when interpolating user-controlled values into shell commands.
 */

/**
 * Supported shell types for command generation.
 * Used to generate shell-appropriate command syntax.
 */
export type ShellType = 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish' | 'sh';

/**
 * Detect the shell type from a shell path or name.
 *
 * Analyzes the shell path to determine which shell type it represents.
 * This is used to generate shell-appropriate command syntax.
 *
 * Examples:
 * - '/usr/bin/bash' → 'bash'
 * - '/bin/zsh' → 'zsh'
 * - 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' → 'powershell'
 * - 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' → 'powershell'
 * - 'C:\\Windows\\System32\\cmd.exe' → 'cmd'
 * - 'C:\\Program Files\\Git\\bin\\bash.exe' → 'bash' (Git Bash)
 * - '/usr/local/bin/fish' → 'fish'
 * - unknown path → 'bash' (default fallback)
 *
 * @param shellPath - The path to the shell executable or shell name
 * @returns The detected shell type
 */
export function detectShellType(shellPath: string): ShellType {
  const normalized = shellPath.toLowerCase();

  // PowerShell (both Windows PowerShell 5.1 and PowerShell Core 7+)
  if (normalized.includes('powershell') || normalized.includes('pwsh')) {
    return 'powershell';
  }

  // Windows Command Prompt
  if (normalized.includes('cmd.exe') || normalized.endsWith('cmd')) {
    return 'cmd';
  }

  // Bash (including Git Bash on Windows, WSL bash)
  if (normalized.includes('bash')) {
    return 'bash';
  }

  // Zsh
  if (normalized.includes('zsh')) {
    return 'zsh';
  }

  // Fish shell
  if (normalized.includes('fish')) {
    return 'fish';
  }

  // Bourne shell
  if (normalized.endsWith('/sh') || normalized.endsWith('\\sh') || normalized === 'sh') {
    return 'sh';
  }

  // Default to bash for unknown shells (POSIX-compatible fallback)
  return 'bash';
}

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
  // Remove newlines and carriage returns to prevent command injection
  // Then replace single quotes with: end quote, escaped quote, start quote
  // This is the standard POSIX-safe way to handle single quotes
  const sanitized = arg.replace(/[\r\n]/g, '');
  const escaped = sanitized.replace(/'/g, "'\\''");
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
 * Build a safe cd command from a path, using shell-appropriate syntax.
 *
 * Generates the correct command format for different shell types:
 * - PowerShell: Set-Location 'path'; (uses single quotes with '' escaping, semicolon separator)
 * - cmd.exe: cd /d "path" & (uses double quotes with ^ escaping, /d for drive changes, & separator)
 * - bash/zsh/fish/sh: cd 'path' && (uses single quotes with '\'' escaping, && separator)
 *
 * Examples:
 * - buildCdCommandForShell('/home/user', 'bash') → "cd '/home/user' && "
 * - buildCdCommandForShell('C:\\Users\\test', 'powershell') → "Set-Location 'C:\\Users\\test'; "
 * - buildCdCommandForShell('C:\\My Docs', 'cmd') → 'cd /d "C:\\My Docs" & '
 * - buildCdCommandForShell("C:\\It's here", 'powershell') → "Set-Location 'C:\\It''s here'; "
 * - buildCdCommandForShell(undefined, 'bash') → ""
 *
 * @param path - The directory path to change to
 * @param shell - The shell type to generate the command for
 * @returns A safe shell-appropriate cd command string, or empty string if path is undefined
 */
export function buildCdCommandForShell(path: string | undefined, shell: ShellType): string {
  if (!path) {
    return '';
  }

  switch (shell) {
    case 'powershell':
      // PowerShell uses Set-Location with single quotes and ; as command separator
      return `Set-Location ${escapeShellArgPowerShell(path)}; `;

    case 'cmd':
      // cmd.exe uses cd /d (for drive changes) with double quotes and & as command separator
      // Note: We wrap in double quotes but escape special chars with ^
      return `cd /d "${escapeShellArgWindows(path)}" & `;

    case 'bash':
    case 'zsh':
    case 'fish':
    case 'sh':
    default:
      // POSIX shells use cd with single quotes and && as command separator
      return `cd ${escapeShellArg(path)} && `;
  }
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
  // \n \r could allow command injection via newlines
  const escaped = arg
    .replace(/\^/g, '^^')     // Escape carets first (escape char itself)
    .replace(/"/g, '^"')      // Escape double quotes
    .replace(/&/g, '^&')      // Escape ampersand (command separator)
    .replace(/\|/g, '^|')     // Escape pipe
    .replace(/</g, '^<')      // Escape less than
    .replace(/>/g, '^>')      // Escape greater than
    .replace(/%/g, '%%')      // Escape percent (variable expansion)
    .replace(/\r/g, '')       // Remove carriage returns (prevent injection)
    .replace(/\n/g, '');      // Remove newlines (prevent injection)

  return escaped;
}

/**
 * Escape a string for safe use as a PowerShell argument.
 *
 * PowerShell uses single quotes for literal strings where no variable expansion occurs.
 * Inside single-quoted strings, the only escape is doubling single quotes: ' → ''
 *
 * Examples:
 * - "hello" → 'hello'
 * - "hello world" → 'hello world'
 * - "it's" → 'it''s'
 * - "$env:PATH" → '$env:PATH' (no expansion in single quotes)
 * - "$(Get-Date)" → '$(Get-Date)' (no expansion in single quotes)
 * - 'test"; rm -rf / #' → 'test"; rm -rf / #'
 *
 * @param arg - The argument to escape
 * @returns The escaped argument wrapped in single quotes for PowerShell
 */
export function escapeShellArgPowerShell(arg: string): string {
  // Remove newlines and carriage returns to prevent command injection
  // In PowerShell single-quoted strings, only single quotes need escaping
  // They are escaped by doubling them: ' → ''
  const sanitized = arg.replace(/[\r\n]/g, '');
  const escaped = sanitized.replace(/'/g, "''");
  return `'${escaped}'`;
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
