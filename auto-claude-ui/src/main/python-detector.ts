import { execSync } from 'child_process';

/**
 * Detect and return the best available Python command.
 * Tries multiple candidates and returns the first one that works with Python 3.
 *
 * @returns The Python command to use, or null if none found
 */
export function findPythonCommand(): string | null {
  const isWindows = process.platform === 'win32';

  // On Windows, try py launcher first (most reliable), then python, then python3
  // On Unix, try python3 first, then python
  const candidates = isWindows
    ? ['py -3', 'python', 'python3', 'py']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const version = execSync(`${cmd} --version`, {
        stdio: 'pipe',
        timeout: 5000,
        windowsHide: true
      }).toString();

      if (version.includes('Python 3')) {
        return cmd;
      }
    } catch {
      // Command not found or errored, try next
      continue;
    }
  }

  // Fallback to platform-specific default
  return isWindows ? 'python' : 'python3';
}

/**
 * Get the default Python command for the current platform.
 * This is a synchronous fallback that doesn't test if Python actually exists.
 *
 * @returns The default Python command for this platform
 */
export function getDefaultPythonCommand(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Parse a Python command string into command and base arguments.
 * Handles space-separated commands like "py -3" while preserving
 * file paths that may contain spaces (e.g., macOS Application Support).
 *
 * @param pythonPath - The Python command string (e.g., "python3", "py -3")
 *                     or a full file path (e.g., "/Users/.../Application Support/.../python")
 * @returns Tuple of [command, baseArgs] ready for use with spawn()
 */
export function parsePythonCommand(pythonPath: string): [string, string[]] {
  // Check if this looks like a file path rather than a command
  // File paths:
  // - Unix: start with /, ~, or .
  // - Windows: start with drive letter (C:\, D:/, etc.) or contain backslashes
  const isFilePath = pythonPath.startsWith('/') ||
                     pythonPath.startsWith('~') ||
                     pythonPath.startsWith('.') ||
                     /^[a-zA-Z]:[\\/]/.test(pythonPath) ||
                     pythonPath.includes('\\');

  if (isFilePath) {
    // It's a file path - don't split on spaces
    // The entire path is the command, no base args
    return [pythonPath, []];
  }

  // It's a command like "py -3" or "python3" - safe to split on spaces
  const parts = pythonPath.split(' ').filter(part => part.length > 0);
  const command = parts[0] || '';
  const baseArgs = parts.slice(1);
  return [command, baseArgs];
}
