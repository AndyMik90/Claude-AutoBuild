/**
 * Environment Utilities Module
 *
 * Provides utilities for managing environment variables for child processes.
 * Particularly important for macOS where GUI apps don't inherit the full
 * shell environment, causing issues with tools installed via Homebrew.
 *
 * Common issue: `gh` CLI installed via Homebrew is in /opt/homebrew/bin
 * which isn't in PATH when the Electron app launches from Finder/Dock.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { execFileSync, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Check if a path exists asynchronously (non-blocking)
 *
 * Uses fs.promises.access which is non-blocking, unlike fs.existsSync.
 *
 * @param filePath - The path to check
 * @returns Promise resolving to true if path exists, false otherwise
 */
async function existsAsync(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Cache for npm global prefix to avoid repeated async calls
let npmGlobalPrefixCache: string | null | undefined = undefined;
let npmGlobalPrefixCachePromise: Promise<string | null> | null = null;

/**
 * Get npm global prefix directory dynamically
 *
 * Runs `npm config get prefix` to find where npm globals are installed.
 * Works with standard npm, nvm-windows, nvm, and custom installations.
 *
 * On Windows: returns the prefix directory (e.g., C:\Users\user\AppData\Roaming\npm)
 * On macOS/Linux: returns prefix/bin (e.g., /usr/local/bin)
 *
 * @returns npm global binaries directory, or null if npm not available or path doesn't exist
 */
function getNpmGlobalPrefix(): string | null {
  try {
    // On Windows, use npm.cmd for proper command resolution
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const rawPrefix = execFileSync(npmCommand, ['config', 'get', 'prefix'], {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
      cwd: os.homedir(), // Run from home dir to avoid ENOWORKSPACES error in monorepos
      shell: process.platform === 'win32', // Enable shell on Windows for .cmd resolution
    }).trim();

    if (!rawPrefix) {
      return null;
    }

    // On non-Windows platforms, npm globals are installed in prefix/bin
    // On Windows, they're installed directly in the prefix directory
    const binPath = process.platform === 'win32'
      ? rawPrefix
      : path.join(rawPrefix, 'bin');

    // Normalize and verify the path exists
    const normalizedPath = path.normalize(binPath);

    return fs.existsSync(normalizedPath) ? normalizedPath : null;
  } catch {
    return null;
  }
}

/**
 * Common binary directories that should be in PATH
 * These are locations where commonly used tools are installed
 */
const COMMON_BIN_PATHS: Record<string, string[]> = {
  darwin: [
    '/opt/homebrew/bin',      // Apple Silicon Homebrew
    '/usr/local/bin',         // Intel Homebrew / system
    '/usr/local/share/dotnet', // .NET SDK
    '/opt/homebrew/sbin',     // Apple Silicon Homebrew sbin
    '/usr/local/sbin',        // Intel Homebrew sbin
    '~/.local/bin',           // User-local binaries (Claude CLI)
    '~/.dotnet/tools',        // .NET global tools
  ],
  linux: [
    '/usr/local/bin',
    '/usr/bin',               // System binaries (Python, etc.)
    '/snap/bin',              // Snap packages
    '~/.local/bin',           // User-local binaries
    '~/.dotnet/tools',        // .NET global tools
    '/usr/sbin',              // System admin binaries
  ],
  win32: [
    // Windows usually handles PATH better, but we can add common locations
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\GitHub CLI',
  ],
};

/**
 * Get augmented environment with additional PATH entries
 *
 * This ensures that tools installed in common locations (like Homebrew)
 * are available to child processes even when the app is launched from
 * Finder/Dock which doesn't inherit the full shell environment.
 *
 * @param additionalPaths - Optional array of additional paths to include
 * @returns Environment object with augmented PATH
 */
export function getAugmentedEnv(additionalPaths?: string[]): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const pathSeparator = platform === 'win32' ? ';' : ':';

  // Get platform-specific paths
  const platformPaths = COMMON_BIN_PATHS[platform] || [];

  // Expand home directory in paths
  const homeDir = os.homedir();
  const expandedPaths = platformPaths.map(p =>
    p.startsWith('~') ? p.replace('~', homeDir) : p
  );

  // Collect paths to add (only if they exist and aren't already in PATH)
  const currentPath = env.PATH || '';
  const currentPathSet = new Set(currentPath.split(pathSeparator));

  const pathsToAdd: string[] = [];

  // Add platform-specific paths
  for (const p of expandedPaths) {
    if (!currentPathSet.has(p) && fs.existsSync(p)) {
      pathsToAdd.push(p);
    }
  }

  // Add npm global prefix dynamically (cross-platform: works with standard npm, nvm, nvm-windows)
  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix && !currentPathSet.has(npmPrefix) && fs.existsSync(npmPrefix)) {
    pathsToAdd.push(npmPrefix);
  }

  // Add user-requested additional paths
  if (additionalPaths) {
    for (const p of additionalPaths) {
      const expanded = p.startsWith('~') ? p.replace('~', homeDir) : p;
      if (!currentPathSet.has(expanded) && fs.existsSync(expanded)) {
        pathsToAdd.push(expanded);
      }
    }
  }

  // Prepend new paths to PATH (prepend so they take priority)
  if (pathsToAdd.length > 0) {
    env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);
  }

  return env;
}

/**
 * Find the full path to an executable
 *
 * Searches PATH (including augmented paths) for the given command.
 * Useful for finding tools like `gh`, `git`, `node`, etc.
 *
 * @param command - The command name to find (e.g., 'gh', 'git')
 * @returns The full path to the executable, or null if not found
 */
export function findExecutable(command: string): string | null {
  const env = getAugmentedEnv();
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const pathDirs = (env.PATH || '').split(pathSeparator);

  // On Windows, check Windows-native extensions first (.exe, .cmd) before
  // extensionless files (which are typically bash/sh scripts for Git Bash/Cygwin)
  const extensions = process.platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '.ps1', '']
    : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Check if a command is available (in PATH or common locations)
 *
 * @param command - The command name to check
 * @returns true if the command is available
 */
export function isCommandAvailable(command: string): boolean {
  return findExecutable(command) !== null;
}

// ============================================================================
// ASYNC VERSIONS - Non-blocking alternatives for Electron main process
// ============================================================================

/**
 * Get npm global prefix directory asynchronously (non-blocking)
 *
 * Uses caching to avoid repeated subprocess calls. Safe to call from
 * Electron main process without blocking the event loop.
 *
 * @returns Promise resolving to npm global binaries directory, or null
 */
async function getNpmGlobalPrefixAsync(): Promise<string | null> {
  // Return cached value if available
  if (npmGlobalPrefixCache !== undefined) {
    return npmGlobalPrefixCache;
  }

  // If a fetch is already in progress, wait for it
  if (npmGlobalPrefixCachePromise) {
    return npmGlobalPrefixCachePromise;
  }

  // Start the async fetch
  npmGlobalPrefixCachePromise = (async () => {
    try {
      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

      const { stdout } = await execFileAsync(npmCommand, ['config', 'get', 'prefix'], {
        encoding: 'utf-8',
        timeout: 3000,
        windowsHide: true,
        cwd: os.homedir(), // Run from home dir to avoid ENOWORKSPACES error in monorepos
        shell: process.platform === 'win32',
      });

      const rawPrefix = stdout.trim();
      if (!rawPrefix) {
        npmGlobalPrefixCache = null;
        return null;
      }

      const binPath = process.platform === 'win32'
        ? rawPrefix
        : path.join(rawPrefix, 'bin');

      const normalizedPath = path.normalize(binPath);
      npmGlobalPrefixCache = await existsAsync(normalizedPath) ? normalizedPath : null;
      return npmGlobalPrefixCache;
    } catch (error) {
      console.warn(`[env-utils] Failed to get npm global prefix: ${error}`);
      npmGlobalPrefixCache = null;
      return null;
    } finally {
      npmGlobalPrefixCachePromise = null;
    }
  })();

  return npmGlobalPrefixCachePromise;
}

/**
 * Get augmented environment asynchronously (non-blocking)
 *
 * Same as getAugmentedEnv but uses async npm prefix detection.
 * Safe to call from Electron main process without blocking.
 *
 * @param additionalPaths - Optional array of additional paths to include
 * @returns Promise resolving to environment object with augmented PATH
 */
export async function getAugmentedEnvAsync(additionalPaths?: string[]): Promise<Record<string, string>> {
  const env = { ...process.env } as Record<string, string>;
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const pathSeparator = platform === 'win32' ? ';' : ':';

  // Get platform-specific paths
  const platformPaths = COMMON_BIN_PATHS[platform] || [];

  // Expand home directory in paths
  const homeDir = os.homedir();
  const expandedPaths = platformPaths.map(p =>
    p.startsWith('~') ? p.replace('~', homeDir) : p
  );

  // Collect paths to add (only if they exist and aren't already in PATH)
  const currentPath = env.PATH || '';
  const currentPathSet = new Set(currentPath.split(pathSeparator));

  const pathsToAdd: string[] = [];

  // Add platform-specific paths (check existence in parallel for performance)
  const platformPathChecks = await Promise.all(
    expandedPaths.map(async (p) => ({ path: p, exists: await existsAsync(p) }))
  );
  for (const { path: p, exists } of platformPathChecks) {
    if (!currentPathSet.has(p) && exists) {
      pathsToAdd.push(p);
    }
  }

  // Add npm global prefix dynamically (async - non-blocking)
  const npmPrefix = await getNpmGlobalPrefixAsync();
  if (npmPrefix && !currentPathSet.has(npmPrefix) && await existsAsync(npmPrefix)) {
    pathsToAdd.push(npmPrefix);
  }

  // Add user-requested additional paths
  if (additionalPaths) {
    for (const p of additionalPaths) {
      const expanded = p.startsWith('~') ? p.replace('~', homeDir) : p;
      if (!currentPathSet.has(expanded) && await existsAsync(expanded)) {
        pathsToAdd.push(expanded);
      }
    }
  }

  // Prepend new paths to PATH (prepend so they take priority)
  if (pathsToAdd.length > 0) {
    env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);
  }

  return env;
}

/**
 * Find the full path to an executable asynchronously (non-blocking)
 *
 * Same as findExecutable but uses async environment augmentation.
 *
 * @param command - The command name to find (e.g., 'gh', 'git')
 * @returns Promise resolving to the full path to the executable, or null
 */
export async function findExecutableAsync(command: string): Promise<string | null> {
  const env = await getAugmentedEnvAsync();
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const pathDirs = (env.PATH || '').split(pathSeparator);

  const extensions = process.platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '.ps1', '']
    : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext);
      if (await existsAsync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Clear the npm global prefix cache
 *
 * Call this if npm configuration changes and you need fresh detection.
 */
export function clearNpmPrefixCache(): void {
  npmGlobalPrefixCache = undefined;
  npmGlobalPrefixCachePromise = null;
}
