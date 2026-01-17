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
import { createRequire } from 'module';
import { getSentryEnvForSubprocess } from './sentry';
import { isWindows, isUnix, getPathDelimiter } from './platform';

const execFileAsync = promisify(execFile);

/**
 * Check if a path exists asynchronously (non-blocking)
 *
 * Uses fs.promises.access which is non-blocking, unlike fs.existsSync.
 *
 * @param filePath - The path to check
 * @returns Promise resolving to true if path exists, false otherwise
 */
export async function existsAsync(filePath: string): Promise<boolean> {
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
    const npmCommand = isWindows() ? 'npm.cmd' : 'npm';

    // Use --location=global to bypass workspace context and avoid ENOWORKSPACES error
    const rawPrefix = execFileSync(npmCommand, ['config', 'get', 'prefix', '--location=global'], {
      encoding: 'utf-8',
      timeout: 3000,
      windowsHide: true,
      cwd: os.homedir(), // Run from home dir to avoid ENOWORKSPACES error in monorepos
      shell: isWindows(), // Enable shell on Windows for .cmd resolution
    }).trim();

    if (!rawPrefix) {
      return null;
    }

    // On non-Windows platforms, npm globals are installed in prefix/bin
    // On Windows, they're installed directly in the prefix directory
    const binPath = isWindows()
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
export const COMMON_BIN_PATHS: Record<string, string[]> = {
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
    // Node.js and npm paths - critical for packaged Electron apps that don't inherit full PATH
    'C:\\Program Files\\nodejs',                  // Standard Node.js installer (64-bit)
    'C:\\Program Files (x86)\\nodejs',            // 32-bit Node.js on 64-bit Windows
    '~\\AppData\\Local\\Programs\\nodejs',        // NVM for Windows / user install
    '~\\AppData\\Roaming\\npm',                   // npm global scripts (claude.cmd lives here)
    '~\\scoop\\apps\\nodejs\\current',            // Scoop package manager
    'C:\\ProgramData\\chocolatey\\bin',           // Chocolatey package manager
  ],
};

/**
 * Essential system directories that must always be in PATH
 * Required for core system functionality (e.g., /usr/bin/security for Keychain access)
 */
const ESSENTIAL_SYSTEM_PATHS: string[] = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/**
 * Get expanded platform paths for PATH augmentation
 *
 * Shared helper used by both sync and async getAugmentedEnv functions.
 * Expands home directory (~) in paths and returns the list of candidate paths.
 *
 * @param additionalPaths - Optional additional paths to include
 * @returns Array of expanded paths (without existence checking)
 */
function getExpandedPlatformPaths(additionalPaths?: string[]): string[] {
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const homeDir = os.homedir();

  // Get platform-specific paths and expand home directory
  const platformPaths = COMMON_BIN_PATHS[platform] || [];
  const expandedPaths = platformPaths.map(p =>
    p.startsWith('~') ? p.replace('~', homeDir) : p
  );

  // Add user-requested additional paths (expanded)
  if (additionalPaths) {
    for (const p of additionalPaths) {
      const expanded = p.startsWith('~') ? p.replace('~', homeDir) : p;
      expandedPaths.push(expanded);
    }
  }

  return expandedPaths;
}

/**
 * Build augmented PATH by filtering existing paths
 *
 * Shared helper that takes candidate paths and a set of current PATH entries,
 * returning only paths that should be added.
 *
 * @param candidatePaths - Array of paths to consider adding
 * @param currentPathSet - Set of paths already in PATH
 * @param existingPaths - Array of paths that actually exist on the filesystem
 * @param npmPrefix - npm global prefix path (or null if not found)
 * @returns Array of paths to prepend to PATH
 */
function buildPathsToAdd(
  candidatePaths: string[],
  currentPathSet: Set<string>,
  existingPaths: Set<string>,
  npmPrefix: string | null
): string[] {
  const pathsToAdd: string[] = [];

  // Add platform-specific paths that exist
  for (const p of candidatePaths) {
    if (!currentPathSet.has(p) && existingPaths.has(p)) {
      pathsToAdd.push(p);
    }
  }

  // Add npm global prefix if it exists
  if (npmPrefix && !currentPathSet.has(npmPrefix) && existingPaths.has(npmPrefix)) {
    pathsToAdd.push(npmPrefix);
  }

  return pathsToAdd;
}

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
  const pathSeparator = getPathDelimiter();

  // Get all candidate paths (platform + additional)
  const candidatePaths = getExpandedPlatformPaths(additionalPaths);

  // Ensure PATH has essential system directories when launched from Finder/Dock.
  // When Electron launches from GUI (not terminal), PATH might be empty or minimal.
  // The Claude Agent SDK needs /usr/bin/security to access macOS Keychain.
  let currentPath = env.PATH || '';

  // On macOS/Linux, ensure basic system paths are always present
  if (isUnix()) {
    const pathSetForEssentials = new Set(currentPath.split(pathSeparator).filter(Boolean));
    const missingEssentials = ESSENTIAL_SYSTEM_PATHS.filter(p => !pathSetForEssentials.has(p));

    if (missingEssentials.length > 0) {
      // Append essential paths if missing (append, not prepend, to respect user's PATH)
      currentPath = currentPath
        ? `${currentPath}${pathSeparator}${missingEssentials.join(pathSeparator)}`
        : missingEssentials.join(pathSeparator);
    }
  }

  // Collect paths to add (only if they exist and aren't already in PATH)
  const currentPathSet = new Set(currentPath.split(pathSeparator).filter(Boolean));

  // Check existence synchronously and build existing paths set
  const existingPaths = new Set(candidatePaths.filter(p => fs.existsSync(p)));

  // Get npm global prefix dynamically
  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix && fs.existsSync(npmPrefix)) {
    existingPaths.add(npmPrefix);
  }

  // Build final paths to add using shared helper
  const pathsToAdd = buildPathsToAdd(candidatePaths, currentPathSet, existingPaths, npmPrefix);

  // Prepend new paths to PATH (prepend so they take priority)
  env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);

  // Add Sentry environment variables for Python subprocesses
  // These are embedded at build time and need to be passed explicitly
  const sentryEnv = getSentryEnvForSubprocess();
  Object.assign(env, sentryEnv);

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
  const pathSeparator = getPathDelimiter();
  const pathDirs = (env.PATH || '').split(pathSeparator);

  // On Windows, check Windows-native extensions first (.exe, .cmd) before
  // extensionless files (which are typically bash/sh scripts for Git Bash/Cygwin)
  const extensions = isWindows()
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
      const npmCommand = isWindows() ? 'npm.cmd' : 'npm';

      const { stdout } = await execFileAsync(npmCommand, ['config', 'get', 'prefix', '--location=global'], {
        encoding: 'utf-8',
        timeout: 3000,
        windowsHide: true,
        cwd: os.homedir(), // Run from home dir to avoid ENOWORKSPACES error in monorepos
        shell: isWindows(),
      });

      const rawPrefix = stdout.trim();
      if (!rawPrefix) {
        npmGlobalPrefixCache = null;
        return null;
      }

      const binPath = isWindows()
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
  const pathSeparator = getPathDelimiter();

  // Get all candidate paths (platform + additional)
  const candidatePaths = getExpandedPlatformPaths(additionalPaths);

  // Ensure essential system paths are present (for macOS Keychain access)
  let currentPath = env.PATH || '';

  if (isUnix()) {
    const pathSetForEssentials = new Set(currentPath.split(pathSeparator).filter(Boolean));
    const missingEssentials = ESSENTIAL_SYSTEM_PATHS.filter(p => !pathSetForEssentials.has(p));

    if (missingEssentials.length > 0) {
      currentPath = currentPath
        ? `${currentPath}${pathSeparator}${missingEssentials.join(pathSeparator)}`
        : missingEssentials.join(pathSeparator);
    }
  }

  // Collect paths to add (only if they exist and aren't already in PATH)
  const currentPathSet = new Set(currentPath.split(pathSeparator).filter(Boolean));

  // Check existence asynchronously in parallel for performance
  const pathChecks = await Promise.all(
    candidatePaths.map(async (p) => ({ path: p, exists: await existsAsync(p) }))
  );
  const existingPaths = new Set(
    pathChecks.filter(({ exists }) => exists).map(({ path: p }) => p)
  );

  // Get npm global prefix dynamically (async - non-blocking)
  const npmPrefix = await getNpmGlobalPrefixAsync();
  if (npmPrefix && await existsAsync(npmPrefix)) {
    existingPaths.add(npmPrefix);
  }

  // Build final paths to add using shared helper
  const pathsToAdd = buildPathsToAdd(candidatePaths, currentPathSet, existingPaths, npmPrefix);

  // Prepend new paths to PATH (prepend so they take priority)
  env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);

  // Add Sentry environment variables for Python subprocesses
  // These are embedded at build time and need to be passed explicitly
  const sentryEnv = getSentryEnvForSubprocess();
  Object.assign(env, sentryEnv);

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
  const pathSeparator = getPathDelimiter();
  const pathDirs = (env.PATH || '').split(pathSeparator);

  const extensions = isWindows()
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

/**
 * Determine if a command requires shell execution on Windows
 *
 * Windows .cmd and .bat files MUST be executed through shell, while .exe files
 * can be executed directly. This function checks the file extension to determine
 * the correct execution method.
 *
 * @param command - The command path to check
 * @returns true if shell is required (Windows .cmd/.bat), false otherwise
 *
 * @example
 * ```typescript
 * shouldUseShell('D:\\nodejs\\claude.cmd')                // true
 * shouldUseShell('C:\\Program Files\\nodejs\\claude.cmd')  // true
 * shouldUseShell('C:\\Windows\\System32\\git.exe')         // false
 * shouldUseShell('/usr/local/bin/claude')                  // false (non-Windows)
 * ```
 */
export function shouldUseShell(command: string): boolean {
  // Only Windows needs special handling for .cmd/.bat files
  if (isUnix()) {
    return false;
  }

  const trimmed = command.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;

  // Check if command ends with .cmd or .bat (case-insensitive)
  return /\.(cmd|bat)$/i.test(unquoted);
}

/**
 * Get spawn options with correct shell setting for Windows compatibility
 *
 * Provides a consistent way to create spawn options that work across platforms.
 * Handles the shell requirement for Windows .cmd/.bat files automatically.
 *
 * For .cmd/.bat files on Windows, returns options that tell the caller to use
 * proper quoting for paths with spaces.
 *
 * @param command - The command path to execute
 * @param baseOptions - Base spawn options to merge with (optional)
 * @returns Spawn options with correct shell setting
 *
 * @example
 * ```typescript
 * const opts = getSpawnOptions(claudeCmd, { cwd: '/project', env: {...} });
 * spawn(getSpawnCommand(claudeCmd), ['--version'], opts);
 * ```
 */
export function getSpawnOptions(
  command: string,
  baseOptions?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    windowsHide?: boolean;
    stdio?: 'inherit' | 'pipe' | Array<'inherit' | 'pipe'>;
  }
): {
  cwd?: string;
  env?: Record<string, string>;
  shell: boolean;
  timeout?: number;
  windowsHide?: boolean;
  stdio?: 'inherit' | 'pipe' | Array<'inherit' | 'pipe'>;
} {
  return {
    ...baseOptions,
    shell: shouldUseShell(command),
  };
}

/**
 * Get the properly quoted command for use with spawn()
 *
 * For .cmd/.bat files on Windows with shell:true, the command path must be
 * quoted to handle paths containing spaces correctly (e.g., C:\Users\OXFAM MONS\...).
 *
 * @param command - The command path to execute
 * @returns The command (quoted if needed for .cmd/.bat files on Windows)
 *
 * @example
 * ```typescript
 * const cmd = getSpawnCommand(claudeCmd); // "C:\Users\OXFAM MONS\...\claude.cmd"
 * const opts = getSpawnOptions(claudeCmd, { cwd: '/project', env: {...} });
 * spawn(cmd, ['--version'], opts);
 * ```
 */
export function getSpawnCommand(command: string): string {
  // For .cmd/.bat files on Windows, quote the command to handle spaces
  // The shell will parse the quoted path correctly
  const trimmed = command.trim();
  if (shouldUseShell(trimmed)) {
    // Idempotent if already quoted
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed;
    }
    return `"${trimmed}"`;
  }
  // For non-.cmd/.bat files, strip quotes if present (defensive: no double quotes with shell:false)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Derive git-bash (bash.exe) path from git executable path on Windows.
 *
 * Git for Windows installs bash.exe in Git/bin/ directory. This function
 * handles various git.exe locations:
 * - .../Git/cmd/git.exe -> .../Git/bin/bash.exe
 * - .../Git/bin/git.exe -> .../Git/bin/bash.exe
 * - .../Git/mingw64/bin/git.exe -> .../Git/bin/bash.exe
 *
 * @param gitExePath - Path to git.exe (e.g., D:\Program Files\Git\mingw64\bin\git.exe)
 * @returns Path to bash.exe if found, null otherwise
 */
function formatPathForLogs(filePath: string): string {
  if (!filePath) {
    return '';
  }
  return path.win32.basename(filePath) || path.basename(filePath);
}

function formatErrorForLogs(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' || typeof code === 'number' ? String(code) : 'unknown';
  }
  if (error instanceof Error) {
    return error.name;
  }
  return 'unknown';
}

export function deriveGitBashPath(gitExePath: string): string | null {
  if (!isWindows()) {
    return null;
  }

  try {
    // Use win32 path ops to correctly parse Windows-style paths on non-Windows runners
    const winPath = path.win32;
    const gitDir = winPath.dirname(gitExePath);  // e.g., D:\...\Git\mingw64\bin
    const gitDirName = winPath.basename(gitDir).toLowerCase();

    // Find Git installation root
    let gitRoot: string;

    if (gitDirName === 'cmd') {
      // .../Git/cmd/git.exe -> .../Git
      gitRoot = winPath.dirname(gitDir);
    } else if (gitDirName === 'bin') {
      // Could be .../Git/bin/git.exe OR .../Git/mingw64/bin/git.exe
      const parent = winPath.dirname(gitDir);
      const parentName = winPath.basename(parent).toLowerCase();
      if (parentName === 'mingw64' || parentName === 'mingw32') {
        // .../Git/mingw64/bin/git.exe -> .../Git
        gitRoot = winPath.dirname(parent);
      } else {
        // .../Git/bin/git.exe -> .../Git
        gitRoot = parent;
      }
    } else {
      // Unknown structure - try to find 'bin' sibling
      gitRoot = winPath.dirname(gitDir);
    }

    // Bash.exe is in Git/bin/bash.exe
    const bashPath = winPath.join(gitRoot, 'bin', 'bash.exe');

    if (fs.existsSync(bashPath)) {
      return bashPath;
    }

    // Fallback: check one level up if gitRoot didn't work
    const altBashPath = winPath.join(winPath.dirname(gitRoot), 'bin', 'bash.exe');
    if (fs.existsSync(altBashPath)) {
      return altBashPath;
    }

    console.warn('[deriveGitBashPath] bash.exe not found in standard locations.');
    return null;
  } catch (error) {
    console.warn('[deriveGitBashPath] Error deriving git-bash path:', formatErrorForLogs(error));
    return null;
  }
}

// Lazy import to avoid circular dependency (cli-tool-manager imports env-utils)
const require = createRequire(import.meta.url);
let _getToolInfo: ((tool: string) => { found: boolean; path: string | null; source: string }) | null = null;
function getToolInfoLazy(tool: string): { found: boolean; path: string | null; source: string } {
  if (!_getToolInfo) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _getToolInfo = require('./cli-tool-manager').getToolInfo;
  }
  return _getToolInfo!(tool);
}

/**
 * Get Git Bash environment variables for Windows.
 *
 * On Windows, Claude Code CLI requires git-bash (bash.exe) to execute shell commands.
 * This function detects the git-bash path and returns it as an environment variable.
 *
 * This is a shared utility to avoid code duplication between AgentProcess and InsightsConfig.
 *
 * @param toolInfoFn - Optional function to get tool info (for testing/dependency injection)
 * @returns Record containing CLAUDE_CODE_GIT_BASH_PATH if detected, empty object otherwise
 */
export function getGitBashEnv(
  toolInfoFn?: (tool: string) => { found: boolean; path: string | null; source: string }
): Record<string, string> {
  const gitBashEnv: Record<string, string> = {};

  if (!isWindows() || process.env.CLAUDE_CODE_GIT_BASH_PATH) {
    return gitBashEnv;
  }

  try {
    const getToolInfoImpl = toolInfoFn ?? getToolInfoLazy;
    const gitInfo = getToolInfoImpl('git');
    if (gitInfo.found && gitInfo.path) {
      const bashPath = deriveGitBashPath(gitInfo.path);
      if (bashPath) {
        gitBashEnv['CLAUDE_CODE_GIT_BASH_PATH'] = bashPath;
        console.log('[env-utils] Setting CLAUDE_CODE_GIT_BASH_PATH:', formatPathForLogs(bashPath));
      }
    }
  } catch (error) {
    console.warn('[env-utils] Failed to detect git-bash path:', formatErrorForLogs(error));
  }

  return gitBashEnv;
}
