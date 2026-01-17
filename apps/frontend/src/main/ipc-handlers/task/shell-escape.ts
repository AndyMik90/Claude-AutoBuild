/**
 * Shell path escaping utilities for secure command execution.
 *
 * These functions prevent command injection by properly escaping
 * or rejecting dangerous characters in file paths.
 */

/**
 * Escape a path for use in shell commands.
 * Prevents command injection by escaping or rejecting dangerous characters.
 *
 * @param filePath - The path to escape
 * @param platform - Target platform ('win32', 'darwin', 'linux')
 * @returns Escaped path string safe for shell use, or null if path is invalid
 */
export function escapePathForShell(filePath: string, platform: NodeJS.Platform): string | null {
  // Reject paths with null bytes (always dangerous)
  if (filePath.includes('\0')) {
    return null;
  }

  // Reject paths with newlines (can break command structure)
  if (filePath.includes('\n') || filePath.includes('\r')) {
    return null;
  }

  if (platform === 'win32') {
    // Windows: Reject paths with characters that could escape cmd.exe quoting
    // These characters can break out of double-quoted strings in cmd
    const dangerousWinChars = /[<>|&^%!`]/;
    if (dangerousWinChars.test(filePath)) {
      return null;
    }
    // Double-quote the path (already done in caller, but escape any internal quotes)
    return filePath.replace(/"/g, '""');
  } else {
    // Unix (macOS/Linux): Use single quotes and escape any internal single quotes
    // Single-quoted strings in bash treat everything literally except single quotes
    // Escape ' as '\'' (end quote, escaped quote, start quote)
    return filePath.replace(/'/g, "'\\''");
  }
}

/**
 * Escape a path for use in AppleScript double-quoted strings.
 * AppleScript uses different escaping rules than POSIX shells.
 *
 * @param filePath - The path to escape (should already be validated)
 * @returns Escaped path string safe for AppleScript double-quoted context
 */
export function escapePathForAppleScript(filePath: string): string | null {
  // Reject paths with null bytes (always dangerous)
  if (filePath.includes('\0')) {
    return null;
  }

  // Reject paths with newlines (can break command structure)
  if (filePath.includes('\n') || filePath.includes('\r')) {
    return null;
  }

  // AppleScript double-quoted strings require escaping:
  // 1. Backslashes must be escaped as \\
  // 2. Double quotes must be escaped as \"
  return filePath
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"');   // Then escape double quotes
}
