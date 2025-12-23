import { execSync } from 'child_process';
import { existsSync } from 'fs';

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
 * Handles space-separated commands like "py -3" and file paths with spaces.
 *
 * @param pythonPath - The Python command string (e.g., "python3", "py -3", "/path/with spaces/python")
 * @returns Tuple of [command, baseArgs] ready for use with spawn()
 */
export function parsePythonCommand(pythonPath: string): [string, string[]] {
  // Remove any surrounding quotes first
  let cleanPath = pythonPath.trim();
  if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
      (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
    cleanPath = cleanPath.slice(1, -1);
  }

  // If the path points to an actual file, use it directly (handles paths with spaces)
  if (existsSync(cleanPath)) {
    return [cleanPath, []];
  }

  // Check if it's a path (contains path separators but not just at the start)
  // Paths with spaces should be treated as a single command, not split
  const hasPathSeparators = cleanPath.includes('/') || cleanPath.includes('\\');
  const isLikelyPath = hasPathSeparators && !cleanPath.startsWith('-');

  if (isLikelyPath) {
    // This looks like a file path, don't split it
    // Even if the file doesn't exist (yet), treat the whole thing as the command
    return [cleanPath, []];
  }

  // Otherwise, split on spaces for commands like "py -3"
  const parts = cleanPath.split(' ').filter(p => p.length > 0);
  if (parts.length === 0) {
    // Return empty string for empty input, not the original uncleaned path
    return [cleanPath, []];
  }
  const command = parts[0];
  const baseArgs = parts.slice(1);
  return [command, baseArgs];
}
