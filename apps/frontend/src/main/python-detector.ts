import { execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * Find the first existing Homebrew Python installation.
 * Checks common Homebrew paths for Python 3.
 *
 * @returns The path to Homebrew Python, or null if not found
 */
function findHomebrewPython(): string | null {
  const homebrewPaths = [
    '/opt/homebrew/bin/python3',  // Apple Silicon (M1/M2/M3)
    '/usr/local/bin/python3'      // Intel Mac
  ];

  for (const path of homebrewPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Detect and return the best available Python command.
 * Tries multiple candidates and returns the first one that works with Python 3.
 *
 * @returns The Python command to use, or null if none found
 */
export function findPythonCommand(): string | null {
  const isWindows = process.platform === 'win32';

  // Build candidate list prioritizing Homebrew Python on macOS
  let candidates: string[];
  if (isWindows) {
    candidates = ['py -3', 'python', 'python3', 'py'];
  } else {
    const homebrewPython = findHomebrewPython();
    candidates = homebrewPython
      ? [homebrewPython, 'python3', 'python']
      : ['python3', 'python'];
  }

  for (const cmd of candidates) {
    try {
      // Validate version meets minimum requirement (Python 3.10+)
      const validation = validatePythonVersion(cmd);
      if (validation.valid) {
        console.log(`[Python] Found valid Python: ${cmd} (${validation.version})`);
        return cmd;
      } else {
        console.warn(`[Python] ${cmd} version too old: ${validation.message}`);
        continue;
      }
    } catch {
      // Command not found or errored, try next
      console.warn(`[Python] Command not found or errored: ${cmd}`);
      continue;
    }
  }

  // Fallback to platform-specific default
  if (isWindows) {
    return 'python';
  }
  return findHomebrewPython() || 'python3';
}

/**
 * Extract Python version from a command.
 *
 * @param pythonCmd - The Python command to check (e.g., "python3", "py -3")
 * @returns The version string (e.g., "3.10.5") or null if unable to detect
 */
function getPythonVersion(pythonCmd: string): string | null {
  try {
    const version = execSync(`${pythonCmd} --version`, {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true
    }).toString().trim();

    // Extract version number from "Python 3.10.5" format
    const match = version.match(/Python (\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Validate that a Python command meets minimum version requirements.
 *
 * @param pythonCmd - The Python command to validate
 * @returns Validation result with status, version, and message
 */
function validatePythonVersion(pythonCmd: string): {
  valid: boolean;
  version?: string;
  message: string;
} {
  const MINIMUM_VERSION = '3.10.0';

  const versionStr = getPythonVersion(pythonCmd);
  if (!versionStr) {
    return {
      valid: false,
      message: 'Unable to detect Python version'
    };
  }

  // Parse version numbers for comparison
  const [major, minor] = versionStr.split('.').map(Number);
  const [reqMajor, reqMinor] = MINIMUM_VERSION.split('.').map(Number);

  const meetsRequirement =
    major > reqMajor || (major === reqMajor && minor >= reqMinor);

  if (!meetsRequirement) {
    return {
      valid: false,
      version: versionStr,
      message: `Python ${versionStr} is too old. Requires Python ${MINIMUM_VERSION}+ (claude-agent-sdk requirement)`
    };
  }

  return {
    valid: true,
    version: versionStr,
    message: `Python ${versionStr} meets requirements`
  };
}

/**
 * Get the default Python command for the current platform.
 * This is a synchronous fallback that doesn't test if Python actually exists.
 *
 * @returns The default Python command for this platform
 */
export function getDefaultPythonCommand(): string {
  if (process.platform === 'win32') {
    return 'python';
  }
  return findHomebrewPython() || 'python3';
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
