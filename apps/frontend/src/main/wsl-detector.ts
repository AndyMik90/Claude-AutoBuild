/**
 * WSL Detection Utilities
 *
 * Provides functions to detect WSL availability, installed distributions,
 * and the default distribution on Windows systems.
 */

import { execFileSync, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface WSLDistroInfo {
  name: string;
  isDefault: boolean;
  version: number; // WSL 1 or WSL 2
  state: 'Running' | 'Stopped' | 'Installing' | 'Unknown';
}

// Cache for WSL availability and default distro
let wslAvailableCache: boolean | null = null;
let defaultDistroCache: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Check if we're on Windows (WSL only applies to Windows)
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Clear the detection cache (useful after WSL state changes)
 */
export function clearWSLCache(): void {
  wslAvailableCache = null;
  defaultDistroCache = null;
  cacheTime = 0;
}

/**
 * Parse the output of wsl.exe -l -q to get distro names
 * The output can have BOM and uses UTF-16LE encoding on some systems
 */
function parseDistroList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/\0/g, '').trim()) // Remove null chars (UTF-16 artifacts)
    .filter((line) => line.length > 0);
}

/**
 * Check if WSL is available and functional on this system
 *
 * @returns true if WSL is available
 */
export function isWSLAvailable(): boolean {
  if (!isWindows()) return false;

  // Return cached value if fresh
  if (wslAvailableCache !== null && Date.now() - cacheTime < CACHE_TTL) {
    return wslAvailableCache;
  }

  try {
    // Try to get WSL status - this will fail if WSL is not installed
    execFileSync('wsl.exe', ['--status'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    wslAvailableCache = true;
    cacheTime = Date.now();
    return true;
  } catch {
    // WSL not available or not installed
    wslAvailableCache = false;
    cacheTime = Date.now();
    return false;
  }
}

/**
 * Check if WSL is available (async version)
 *
 * @returns Promise resolving to true if WSL is available
 */
export async function isWSLAvailableAsync(): Promise<boolean> {
  if (!isWindows()) return false;

  // Return cached value if fresh
  if (wslAvailableCache !== null && Date.now() - cacheTime < CACHE_TTL) {
    return wslAvailableCache;
  }

  try {
    await execFileAsync('wsl.exe', ['--status'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });

    wslAvailableCache = true;
    cacheTime = Date.now();
    return true;
  } catch {
    wslAvailableCache = false;
    cacheTime = Date.now();
    return false;
  }
}

/**
 * Get the default WSL distribution name (synchronous)
 *
 * @returns Default distro name or null if WSL is not available
 */
export function getDefaultWSLDistro(): string | null {
  if (!isWindows()) return null;

  // Return cached value if fresh
  if (defaultDistroCache !== null && Date.now() - cacheTime < CACHE_TTL) {
    return defaultDistroCache;
  }

  try {
    // wsl.exe -l -q outputs distro names, first one is the default
    const output = execFileSync('wsl.exe', ['-l', '-q'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const distros = parseDistroList(output);
    defaultDistroCache = distros.length > 0 ? distros[0] : null;
    cacheTime = Date.now();
    return defaultDistroCache;
  } catch {
    defaultDistroCache = null;
    cacheTime = Date.now();
    return null;
  }
}

/**
 * Get the default WSL distribution name (async version)
 *
 * @returns Promise resolving to default distro name or null
 */
export async function getDefaultWSLDistroAsync(): Promise<string | null> {
  if (!isWindows()) return null;

  // Return cached value if fresh
  if (defaultDistroCache !== null && Date.now() - cacheTime < CACHE_TTL) {
    return defaultDistroCache;
  }

  try {
    const { stdout } = await execFileAsync('wsl.exe', ['-l', '-q'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });

    const distros = parseDistroList(stdout);
    defaultDistroCache = distros.length > 0 ? distros[0] : null;
    cacheTime = Date.now();
    return defaultDistroCache;
  } catch {
    defaultDistroCache = null;
    cacheTime = Date.now();
    return null;
  }
}

/**
 * List all installed WSL distributions with their status
 *
 * @returns Array of WSL distribution info
 */
export async function listWSLDistros(): Promise<WSLDistroInfo[]> {
  if (!isWindows()) return [];

  try {
    // wsl.exe -l -v outputs verbose info with state and version
    const { stdout } = await execFileAsync('wsl.exe', ['-l', '-v'], {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });

    const distros: WSLDistroInfo[] = [];
    const lines = stdout.split(/\r?\n/);

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const cleanLine = lines[i].replace(/\0/g, '').trim();
      if (!cleanLine) continue;

      const isDefault = cleanLine.startsWith('*');
      // Parse: "* Ubuntu    Running    2" or "  Debian    Stopped    2"
      const parts = cleanLine
        .replace(/\*/g, '')
        .trim()
        .split(/\s+/);

      if (parts.length >= 3) {
        distros.push({
          name: parts[0],
          isDefault,
          state: parseState(parts[1]),
          version: parseInt(parts[2]) || 2,
        });
      }
    }

    return distros;
  } catch {
    return [];
  }
}

/**
 * Parse WSL state string
 */
function parseState(state: string): WSLDistroInfo['state'] {
  const normalized = state.toLowerCase();
  if (normalized === 'running') return 'Running';
  if (normalized === 'stopped') return 'Stopped';
  if (normalized === 'installing') return 'Installing';
  return 'Unknown';
}

/**
 * Run a command in WSL and get the output
 *
 * @param distro - WSL distribution to use (null for default)
 * @param command - Command to run
 * @param args - Command arguments
 * @param cwd - Working directory (Linux path)
 * @returns Command output
 */
export async function runInWSL(
  distro: string | null,
  command: string,
  args: string[] = [],
  cwd?: string
): Promise<{ stdout: string; stderr: string }> {
  if (!isWindows()) {
    throw new Error('WSL is only available on Windows');
  }

  const wslArgs: string[] = [];

  // Add distro if specified
  if (distro) {
    wslArgs.push('-d', distro);
  }

  // Add working directory if specified
  if (cwd) {
    wslArgs.push('--cd', cwd);
  }

  // Add the command and its arguments
  wslArgs.push(command, ...args);

  return execFileAsync('wsl.exe', wslArgs, {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
  });
}

/**
 * Run a command in WSL synchronously
 *
 * @param distro - WSL distribution to use (null for default)
 * @param command - Command to run
 * @param args - Command arguments
 * @param cwd - Working directory (Linux path)
 * @returns Command output
 */
export function runInWSLSync(
  distro: string | null,
  command: string,
  args: string[] = [],
  cwd?: string
): string {
  if (!isWindows()) {
    throw new Error('WSL is only available on Windows');
  }

  const wslArgs: string[] = [];

  // Add distro if specified
  if (distro) {
    wslArgs.push('-d', distro);
  }

  // Add working directory if specified
  if (cwd) {
    wslArgs.push('--cd', cwd);
  }

  // Add the command and its arguments
  wslArgs.push(command, ...args);

  return execFileSync('wsl.exe', wslArgs, {
    encoding: 'utf-8',
    timeout: 30000,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
