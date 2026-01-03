import { execFileSync } from 'child_process';
import { existsSync, accessSync, constants } from 'fs';
import path from 'path';
import { app } from 'electron';
import { findHomebrewPython as findHomebrewPythonUtil } from './utils/homebrew-python';

/**
 * Get the path to the bundled Python executable.
 * For packaged apps, Python is bundled in the resources directory.
 *
 * @returns The path to bundled Python, or null if not found/not packaged
 */
export function getBundledPythonPath(): string | null {
  // Only check for bundled Python in packaged apps
  if (!app.isPackaged) {
    return null;
  }

  const resourcesPath = process.resourcesPath;
  const isWindows = process.platform === 'win32';

  // Bundled Python location in packaged app
  const pythonPath = isWindows
    ? path.join(resourcesPath, 'python', 'python.exe')
    : path.join(resourcesPath, 'python', 'bin', 'python3');

  if (existsSync(pythonPath)) {
    console.log(`[Python] Found bundled Python at: ${pythonPath}`);
    return pythonPath;
  }

  console.log(`[Python] Bundled Python not found at: ${pythonPath}`);
  return null;
}

/**
 * Find the first existing Homebrew Python installation.
 * Delegates to shared utility function.
 *
 * @returns The path to Homebrew Python, or null if not found
 */
function findHomebrewPython(): string | null {
  return findHomebrewPythonUtil(validatePythonVersion, '[Python]');
}

/**
 * Detect and return the best available Python command.
 * Priority order:
 *   1. Bundled Python (for packaged apps)
 *   2. System Python (Homebrew on macOS, standard paths on other platforms)
 *
 * @returns The Python command to use, or null if none found
 */
export function findPythonCommand(): string | null {
  const isWindows = process.platform === 'win32';

  // 1. Check for bundled Python first (packaged apps only)
  const bundledPython = getBundledPythonPath();
  if (bundledPython) {
    try {
      const validation = validatePythonVersion(bundledPython);
      if (validation.valid) {
        console.log(`[Python] Using bundled Python: ${bundledPython} (${validation.version})`);
        return bundledPython;
      } else {
        console.warn(`[Python] Bundled Python version issue: ${validation.message}`);
      }
    } catch (err) {
      console.warn(`[Python] Bundled Python error: ${err}`);
    }
  }

  // 2. Fall back to system Python
  console.log(`[Python] Searching for system Python...`);

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
        console.log(`[Python] Found valid system Python: ${cmd} (${validation.version})`);
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
 * Uses execFileSync to safely handle paths with spaces and prevent shell injection.
 *
 * @param pythonCmd - The Python command to check (e.g., "python3", "py -3", "/path/with spaces/python")
 * @returns The version string (e.g., "3.10.5") or null if unable to detect
 */
function getPythonVersion(pythonCmd: string): string | null {
  try {
    const [cmd, args] = parsePythonCommand(pythonCmd);
    const version = execFileSync(cmd, [...args, '--version'], {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true,
      shell: false
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
 * Prioritizes bundled Python in packaged apps, then falls back to system Python.
 *
 * @returns The default Python command for this platform
 */
export function getDefaultPythonCommand(): string {
  // Check for bundled Python first
  const bundledPython = getBundledPythonPath();
  if (bundledPython) {
    return bundledPython;
  }

  // Fall back to system Python
  if (process.platform === 'win32') {
    return 'python';
  }
  return findHomebrewPython() || 'python3';
}

/**
 * Parse a Python command string into command and base arguments.
 * Handles space-separated commands like "py -3" and file paths with spaces.
 *
 * IMPORTANT: This function must correctly handle paths with spaces (e.g., macOS
 * Application Support paths). It should NEVER split a path at spaces if it looks
 * like a file path rather than a command with arguments.
 *
 * @param pythonPath - The Python command string (e.g., "python3", "py -3", "/path/with spaces/python")
 * @returns Tuple of [command, baseArgs] ready for use with spawn()
 * @throws Error if pythonPath is empty or only whitespace
 */
export function parsePythonCommand(pythonPath: string): [string, string[]] {
  // Remove any surrounding quotes first
  let cleanPath = pythonPath.trim();

  // Validate input is not empty
  if (cleanPath === '') {
    throw new Error('Python command cannot be empty');
  }

  if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
      (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
    cleanPath = cleanPath.slice(1, -1);
    // Validate again after quote removal
    if (cleanPath === '') {
      throw new Error('Python command cannot be empty');
    }
  }

  // Check if it's a path (contains path separators)
  // This MUST be checked FIRST because paths may contain spaces that we should NOT split on
  // Examples of paths with spaces:
  // - /Users/user/Library/Application Support/AppName/python-venv/bin/python
  // - C:\Users\user\Program Files\Python\python.exe
  const hasPathSeparators = cleanPath.includes('/') || cleanPath.includes('\\');

  // A path is any string with path separators that doesn't start with a dash
  // We check path separators BEFORE checking file existence to handle:
  // 1. Paths that exist
  // 2. Paths that don't exist yet (during setup)
  // 3. Paths that might not be accessible
  const isLikelyPath = hasPathSeparators && !cleanPath.startsWith('-');

  if (isLikelyPath) {
    // This looks like a file path - NEVER split it on spaces
    // Return as-is even if the file doesn't exist yet
    return [cleanPath, []];
  }

  // If the path points to an actual file (without path separators, e.g., in PATH)
  if (existsSync(cleanPath)) {
    return [cleanPath, []];
  }

  // Only split on spaces for simple commands like "py -3"
  // At this point we know it's NOT a path (no path separators) and NOT an existing file
  // EDGE CASE: If someone has a file literally named "py -3" (with a space), the existsSync
  // check above will catch it and return it as a single command. Only if no such file exists
  // do we treat it as "py" command with "-3" argument.
  const parts = cleanPath.split(' ').filter(p => p.length > 0);
  if (parts.length === 0) {
    // This shouldn't happen after earlier validation, but guard anyway
    throw new Error('Python command cannot be empty');
  }
  const command = parts[0];
  const baseArgs = parts.slice(1);
  return [command, baseArgs];
}

/**
 * Result of Python path validation.
 */
export interface PythonPathValidation {
  valid: boolean;
  reason?: string;
  sanitizedPath?: string;
}

/**
 * Shell metacharacters that could be used for command injection.
 * These are dangerous in spawn() context and must be rejected.
 */
const DANGEROUS_SHELL_CHARS = /[;|`$()&<>{}[\]!#*?~\n\r]/;

/**
 * Allowlist patterns for valid Python paths.
 * Matches common system Python locations and virtual environments.
 */
const ALLOWED_PATH_PATTERNS: RegExp[] = [
  // System Python (Unix)
  /^\/usr\/bin\/python\d*(\.\d+)?$/,
  /^\/usr\/local\/bin\/python\d*(\.\d+)?$/,
  // Homebrew Python (macOS)
  /^\/opt\/homebrew\/bin\/python\d*(\.\d+)?$/,
  /^\/opt\/homebrew\/opt\/python@[\d.]+\/bin\/python\d*(\.\d+)?$/,
  // pyenv - only allow paths under user home directories (stricter than .*)
  /^\/(?:Users|home)\/[^/]+\/\.pyenv\/versions\/[\d.]+\/bin\/python\d*(\.\d+)?$/,
  // pyenv for root user on Linux (no username directory)
  /^\/root\/\.pyenv\/versions\/[\d.]+\/bin\/python\d*(\.\d+)?$/,
  // Virtual environments (various naming conventions)
  // Only allow alphanumeric, dash, underscore, dot, and space in directory names
  /^(?:\/[a-zA-Z0-9._\- ]+)+\/\.?venv\/bin\/python\d*(\.\d+)?$/,
  /^(?:\/[a-zA-Z0-9._\- ]+)+\/\.?virtualenv\/bin\/python\d*(\.\d+)?$/,
  /^(?:\/[a-zA-Z0-9._\- ]+)+\/env\/bin\/python\d*(\.\d+)?$/,
  // macOS Application Support paths (Electron userData with spaces)
  // Matches: /Users/<user>/Library/Application Support/<app>/(python-venv|.venv|venv)/bin/python
  /^\/Users\/[^/]+\/Library\/Application Support\/[^/]+\/(python-venv|\.?venv)\/bin\/python\d*(\.\d+)?$/,
  // Windows virtual environments
  /^.*\\\.?venv\\Scripts\\python\.exe$/i,
  /^.*\\\.?virtualenv\\Scripts\\python\.exe$/i,
  /^.*\\env\\Scripts\\python\.exe$/i,
  // Windows system Python
  /^[A-Za-z]:\\Python\d+\\python\.exe$/i,
  /^[A-Za-z]:\\Program Files\\Python\d+\\python\.exe$/i,
  /^[A-Za-z]:\\Program Files \(x86\)\\Python\d+\\python\.exe$/i,
  /^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local\\Programs\\Python\\Python\d+\\python\.exe$/i,
  // Windows Application Data paths (Electron userData)
  // Matches: C:\Users\<user>\AppData\Roaming\<app>\(python-venv|.venv|venv)\Scripts\python.exe
  /^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Roaming\\[^\\]+\\(python-venv|\.?venv)\\Scripts\\python\.exe$/i,
  // Conda environments - only allow paths under user home directories
  /^\/(?:Users|home)\/[^/]+\/anaconda\d*\/bin\/python\d*(\.\d+)?$/,
  /^\/(?:Users|home)\/[^/]+\/miniconda\d*\/bin\/python\d*(\.\d+)?$/,
  /^\/(?:Users|home)\/[^/]+\/anaconda\d*\/envs\/[^/]+\/bin\/python\d*(\.\d+)?$/,
  /^\/(?:Users|home)\/[^/]+\/miniconda\d*\/envs\/[^/]+\/bin\/python\d*(\.\d+)?$/,
  // System-wide conda installations
  /^\/opt\/(?:anaconda|miniconda)\d*\/bin\/python\d*(\.\d+)?$/,
  /^\/opt\/(?:anaconda|miniconda)\d*\/envs\/[^/]+\/bin\/python\d*(\.\d+)?$/,
];

/**
 * Known safe Python commands (not full paths).
 * These are resolved by the shell/OS and are safe.
 * Note: Update this list when new Python versions are released.
 */
const SAFE_PYTHON_COMMANDS = new Set([
  'python',
  'python3',
  'python3.10',
  'python3.11',
  'python3.12',
  'python3.13',
  'python3.14',
  'py',
  'py -3',
]);

function isSafePythonCommand(cmd: string): boolean {
  const normalized = cmd.replace(/\s+/g, ' ').trim().toLowerCase();
  return SAFE_PYTHON_COMMANDS.has(normalized);
}

/**
 * Check if a path matches any allowed pattern.
 */
function matchesAllowedPattern(pythonPath: string): boolean {
  // Normalize path separators for consistent matching
  const normalizedPath = pythonPath.replace(/\\/g, '/');
  return ALLOWED_PATH_PATTERNS.some(pattern => pattern.test(pythonPath) || pattern.test(normalizedPath));
}

/**
 * Check if a file is executable.
 */
function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify that a command/path actually runs Python by checking --version output.
 * Uses execFileSync to avoid shell injection risks with paths containing spaces.
 */
function verifyIsPython(pythonCmd: string): boolean {
  try {
    const [cmd, args] = parsePythonCommand(pythonCmd);
    const output = execFileSync(cmd, [...args, '--version'], {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true,
      shell: false
    }).toString().trim();

    // Must output "Python X.Y.Z"
    return /^Python \d+\.\d+/.test(output);
  } catch {
    return false;
  }
}

/**
 * Validate a Python path for security before use in spawn().
 *
 * Security checks:
 * 1. No shell metacharacters that could enable command injection
 * 2. Path must match allowlist of known Python locations OR be a safe command
 * 3. If a file path, must exist and be executable
 * 4. Must actually be Python (verified via --version)
 *
 * @param pythonPath - The Python path or command to validate
 * @returns Validation result with success status and reason
 */
export function validatePythonPath(pythonPath: string): PythonPathValidation {
  if (!pythonPath || typeof pythonPath !== 'string') {
    return { valid: false, reason: 'Python path is empty or invalid' };
  }

  const trimmedPath = pythonPath.trim();

  // Strip surrounding quotes for validation
  let cleanPath = trimmedPath;
  if ((cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
      (cleanPath.startsWith("'") && cleanPath.endsWith("'"))) {
    cleanPath = cleanPath.slice(1, -1);
  }

  // Security check 1: No shell metacharacters
  if (DANGEROUS_SHELL_CHARS.test(cleanPath)) {
    return {
      valid: false,
      reason: 'Path contains dangerous shell metacharacters'
    };
  }

  // Check if it's a known safe command (not a path)
  if (isSafePythonCommand(cleanPath)) {
    // Verify it actually runs Python
    if (verifyIsPython(cleanPath)) {
      return { valid: true, sanitizedPath: cleanPath };
    }
    return {
      valid: false,
      reason: `Command '${cleanPath}' does not appear to be Python`
    };
  }

  // It's a file path - apply stricter validation
  const isFilePath = cleanPath.includes('/') || cleanPath.includes('\\');

  if (isFilePath) {
    // Normalize the path to prevent directory traversal tricks
    const normalizedPath = path.normalize(cleanPath);

    // Check for path traversal attempts
    if (normalizedPath.includes('..')) {
      return {
        valid: false,
        reason: 'Path contains directory traversal sequences'
      };
    }

    // Security check 2: Must match allowlist
    if (!matchesAllowedPattern(normalizedPath)) {
      return {
        valid: false,
        reason: 'Path does not match allowed Python locations. Expected: system Python, Homebrew, pyenv, or virtual environment paths'
      };
    }

    // Security check 3: File must exist
    if (!existsSync(normalizedPath)) {
      return {
        valid: false,
        reason: 'Python executable does not exist at specified path'
      };
    }

    // Security check 4: Must be executable (Unix) or .exe (Windows)
    if (process.platform !== 'win32' && !isExecutable(normalizedPath)) {
      return {
        valid: false,
        reason: 'File exists but is not executable'
      };
    }

    // Security check 5: Verify it's actually Python
    if (!verifyIsPython(normalizedPath)) {
      return {
        valid: false,
        reason: 'File exists but does not appear to be a Python interpreter'
      };
    }

    return { valid: true, sanitizedPath: normalizedPath };
  }

  // Unknown format - reject
  return {
    valid: false,
    reason: 'Unrecognized Python path format'
  };
}

export function getValidatedPythonPath(providedPath: string | undefined, serviceName: string): string {
  if (!providedPath) {
    return findPythonCommand() || 'python';
  }

  const validation = validatePythonPath(providedPath);
  if (validation.valid) {
    return validation.sanitizedPath || providedPath;
  }

  console.error(`[${serviceName}] Invalid Python path rejected: ${validation.reason}`);
  return findPythonCommand() || 'python';
}
