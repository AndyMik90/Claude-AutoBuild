/**
 * Conda Detector
 *
 * Detects Conda installations (Miniconda, Anaconda, Mambaforge) across operating systems.
 * Provides caching to avoid repeated filesystem scans during a session.
 *
 * Detection Strategy:
 * 1. Check OS-specific common installation paths
 * 2. Validate each path by checking for conda executable
 * 3. Get version by running `conda --version`
 * 4. Determine type from installation path
 * 5. Cache results with timestamp for session reuse
 */

import { execFileSync, execFile } from 'child_process';
import { existsSync, promises as fsPromises } from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import type {
  CondaInstallation,
  CondaDetectionResult,
  CondaDistributionType,
} from '../shared/types/conda';
import { isWindows } from './python-path-utils';

const execFileAsync = promisify(execFile);

/**
 * OS-specific search paths for Conda installations
 *
 * These are the common locations where Conda is typically installed
 * on each operating system.
 */
const CONDA_SEARCH_PATHS: Record<string, string[]> = {
  win32: [
    path.join(os.homedir(), 'miniconda3'),
    path.join(os.homedir(), 'Miniconda3'),
    'C:\\miniconda3',
    'C:\\Miniconda3',
    path.join(os.homedir(), 'anaconda3'),
    path.join(os.homedir(), 'Anaconda3'),
    'C:\\anaconda3',
    'C:\\Anaconda3',
    'C:\\ProgramData\\miniconda3',
    'C:\\ProgramData\\Anaconda3',
    path.join(os.homedir(), 'mambaforge'),
    path.join(os.homedir(), 'miniforge3'),
    // Only include LOCALAPPDATA path if the env var is defined (prevents relative path search)
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'miniconda3')] : []),
  ],
  darwin: [
    path.join(os.homedir(), 'miniconda3'),
    path.join(os.homedir(), 'anaconda3'),
    path.join(os.homedir(), 'mambaforge'),
    path.join(os.homedir(), 'miniforge3'),
    '/opt/miniconda3',
    '/opt/anaconda3',
    '/opt/homebrew/Caskroom/miniconda/base',
    '/usr/local/Caskroom/miniconda/base',
  ],
  linux: [
    path.join(os.homedir(), 'miniconda3'),
    path.join(os.homedir(), 'anaconda3'),
    path.join(os.homedir(), 'mambaforge'),
    path.join(os.homedir(), 'miniforge3'),
    '/opt/conda',
    '/opt/miniconda3',
    '/opt/anaconda3',
  ],
};

/**
 * Cache for detection results
 * Includes timestamp for potential TTL-based invalidation
 */
let detectionCache: CondaDetectionResult | null = null;

/**
 * Get the path to the Conda executable within an installation directory
 *
 * @param condaPath - Base path of Conda installation
 * @returns Full path to conda executable
 */
function getCondaExecutablePath(condaPath: string): string {
  if (isWindows()) {
    return path.join(condaPath, 'Scripts', 'conda.exe');
  }
  return path.join(condaPath, 'bin', 'conda');
}

/**
 * Determine the type of Conda installation from its path
 *
 * Analyzes the installation path to identify whether it's
 * Miniconda, Anaconda, or Mambaforge.
 *
 * @param condaPath - Path to the Conda installation
 * @returns The type of Conda installation
 */
export function determineCondaType(condaPath: string): CondaDistributionType {
  const lowerPath = condaPath.toLowerCase();

  if (lowerPath.includes('mambaforge')) {
    return 'mambaforge';
  }
  if (lowerPath.includes('miniforge')) {
    return 'miniforge';
  }
  if (lowerPath.includes('miniconda')) {
    return 'miniconda';
  }
  if (lowerPath.includes('anaconda')) {
    return 'anaconda';
  }

  return 'unknown';
}

/**
 * Get the version of a Conda executable
 *
 * Runs `conda --version` and parses the output.
 *
 * @param condaExe - Path to the conda executable
 * @returns Version string (e.g., "24.1.2") or null if unable to determine
 */
export function getCondaVersion(condaExe: string): string | null {
  try {
    const output = execFileSync(condaExe, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim();

    // Output format: "conda 24.1.2"
    const match = output.match(/conda\s+(\d+\.\d+\.\d+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get the version of a Conda executable asynchronously
 *
 * Non-blocking version of getCondaVersion for use in async contexts.
 *
 * @param condaExe - Path to the conda executable
 * @returns Promise resolving to version string or null
 */
async function getCondaVersionAsync(condaExe: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(condaExe, ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });

    const output = stdout.trim();
    const match = output.match(/conda\s+(\d+\.\d+\.\d+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Validate a specific Conda path and return installation info (sync)
 *
 * Checks if the path exists, has a valid conda executable,
 * and can report its version. Blocking version for contexts where
 * async is not available.
 *
 * @param condaPath - Path to potential Conda installation
 * @returns CondaInstallation object if valid, null otherwise
 */
function validateCondaPathSync(condaPath: string): CondaInstallation | null {
  if (!existsSync(condaPath)) {
    return null;
  }

  const executablePath = getCondaExecutablePath(condaPath);
  if (!existsSync(executablePath)) {
    return null;
  }

  const version = getCondaVersion(executablePath);
  if (!version) {
    return null;
  }

  return {
    path: condaPath,
    condaExe: executablePath,
    executablePath,
    version,
    type: determineCondaType(condaPath),
  };
}

/**
 * Validate a specific Conda path and return installation info
 *
 * Checks if the path exists, has a valid conda executable,
 * and can report its version.
 *
 * @param condaPath - Path to potential Conda installation
 * @returns Promise resolving to CondaInstallation or null
 */
export async function validateCondaPath(
  condaPath: string
): Promise<CondaInstallation | null> {
  try {
    await fsPromises.access(condaPath);
  } catch {
    return null;
  }

  const executablePath = getCondaExecutablePath(condaPath);
  try {
    await fsPromises.access(executablePath);
  } catch {
    return null;
  }

  const version = await getCondaVersionAsync(executablePath);
  if (!version) {
    return null;
  }

  return {
    path: condaPath,
    condaExe: executablePath,
    executablePath,
    version,
    type: determineCondaType(condaPath),
  };
}

/**
 * Get the platform key for CONDA_SEARCH_PATHS lookup.
 * Uses platform abstraction instead of direct process.platform access.
 */
function getPlatformKey(): string {
  if (isWindows()) {
    return 'win32';
  }
  // For non-Windows, use process.platform directly (darwin, linux, etc.)
  return process.platform;
}

/**
 * Get the search paths for Conda installations, filtering out empty paths
 */
function getValidSearchPaths(): string[] {
  const searchPaths = CONDA_SEARCH_PATHS[getPlatformKey()] || [];
  return searchPaths.filter((p) => p && p.length > 0);
}

/**
 * Build the detection result and update cache
 */
function buildDetectionResult(installations: CondaInstallation[]): CondaDetectionResult {
  const result: CondaDetectionResult = {
    found: installations.length > 0,
    installations,
    preferred: installations.length > 0 ? installations[0] : null,
    timestamp: Date.now(),
  };

  detectionCache = result;

  if (result.found) {
    console.warn(
      `[Conda] Detection complete: ${installations.length} installation(s) found`
    );
  } else {
    console.warn('[Conda] Detection complete: No Conda installations found');
  }

  return result;
}

/**
 * Log a found installation
 */
function logFoundInstallation(installation: CondaInstallation): void {
  console.warn(
    `[Conda] Found ${installation.type} at ${installation.path} (v${installation.version})`
  );
}

/**
 * Detect all Conda installations on the system
 *
 * Searches OS-specific paths for Conda installations and validates each one.
 * Results are cached for the session to avoid repeated filesystem scans.
 *
 * @param forceRefresh - If true, bypasses cache and performs fresh detection
 * @returns Promise resolving to CondaDetectionResult
 */
export async function detectCondaInstallations(
  forceRefresh = false
): Promise<CondaDetectionResult> {
  if (!forceRefresh && detectionCache) {
    console.warn(
      `[Conda] Using cached detection result (${detectionCache.installations.length} installations)`
    );
    return detectionCache;
  }

  console.warn('[Conda] Detecting Conda installations...');

  const installations: CondaInstallation[] = [];

  for (const condaPath of getValidSearchPaths()) {
    const installation = await validateCondaPath(condaPath);
    if (installation) {
      logFoundInstallation(installation);
      installations.push(installation);
    }
  }

  return buildDetectionResult(installations);
}

/**
 * Detect Conda installations synchronously
 *
 * Synchronous version of detectCondaInstallations for use in contexts
 * where async is not available. Uses cache if available.
 *
 * @param forceRefresh - If true, bypasses cache and performs fresh detection
 * @returns CondaDetectionResult
 */
export function detectCondaInstallationsSync(
  forceRefresh = false
): CondaDetectionResult {
  if (!forceRefresh && detectionCache) {
    console.warn(
      `[Conda] Using cached detection result (${detectionCache.installations.length} installations)`
    );
    return detectionCache;
  }

  console.warn('[Conda] Detecting Conda installations (sync)...');

  const installations: CondaInstallation[] = [];

  for (const condaPath of getValidSearchPaths()) {
    const installation = validateCondaPathSync(condaPath);
    if (installation) {
      logFoundInstallation(installation);
      installations.push(installation);
    }
  }

  return buildDetectionResult(installations);
}

/**
 * Clear the Conda detection cache
 *
 * Call this if Conda installations may have changed (e.g., after user
 * installs or removes Conda).
 */
export function clearCondaCache(): void {
  detectionCache = null;
  console.warn('[Conda] Cache cleared');
}

/**
 * Get the current cached detection result without triggering detection
 *
 * @returns Cached CondaDetectionResult or null if no cache exists
 */
export function getCachedCondaResult(): CondaDetectionResult | null {
  return detectionCache;
}
