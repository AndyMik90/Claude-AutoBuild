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

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { promises as fsPromises } from "fs";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";

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
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

    // Use --location=global to bypass workspace context and avoid ENOWORKSPACES error
    const rawPrefix = execFileSync(npmCommand, ["config", "get", "prefix", "--location=global"], {
      encoding: "utf-8",
      timeout: 3000,
      windowsHide: true,
      cwd: os.homedir(), // Run from home dir to avoid ENOWORKSPACES error in monorepos
      shell: process.platform === "win32", // Enable shell on Windows for .cmd resolution
    }).trim();

    if (!rawPrefix) {
      return null;
    }

    // On non-Windows platforms, npm globals are installed in prefix/bin
    // On Windows, they're installed directly in the prefix directory
    const binPath = process.platform === "win32" ? rawPrefix : path.join(rawPrefix, "bin");

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
    "/opt/homebrew/bin", // Apple Silicon Homebrew
    "/usr/local/bin", // Intel Homebrew / system
    "/usr/local/share/dotnet", // .NET SDK
    "/opt/homebrew/sbin", // Apple Silicon Homebrew sbin
    "/usr/local/sbin", // Intel Homebrew sbin
    "~/.local/bin", // User-local binaries (Claude CLI)
    "~/.dotnet/tools", // .NET global tools
  ],
  linux: [
    "/usr/local/bin",
    "/usr/bin", // System binaries (Python, etc.)
    "/snap/bin", // Snap packages
    "~/.local/bin", // User-local binaries
    "~/.dotnet/tools", // .NET global tools
    "/usr/sbin", // System admin binaries
  ],
  win32: [
    // Windows usually handles PATH better, but we can add common locations
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\GitHub CLI",
  ],
};

/**
 * Essential system directories that must always be in PATH
 * Required for core system functionality (e.g., /usr/bin/security for Keychain access)
 */
const ESSENTIAL_SYSTEM_PATHS: string[] = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

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
  const platform = process.platform as "darwin" | "linux" | "win32";
  const homeDir = os.homedir();

  // Get platform-specific paths and expand home directory
  const platformPaths = COMMON_BIN_PATHS[platform] || [];
  const expandedPaths = platformPaths.map((p) => (p.startsWith("~") ? p.replace("~", homeDir) : p));

  // Add user-requested additional paths (expanded)
  if (additionalPaths) {
    for (const p of additionalPaths) {
      const expanded = p.startsWith("~") ? p.replace("~", homeDir) : p;
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
  const platform = process.platform as "darwin" | "linux" | "win32";
  const pathSeparator = platform === "win32" ? ";" : ":";

  // Get all candidate paths (platform + additional)
  const candidatePaths = getExpandedPlatformPaths(additionalPaths);

  // Ensure PATH has essential system directories when launched from Finder/Dock.
  // When Electron launches from GUI (not terminal), PATH might be empty or minimal.
  // The Claude Agent SDK needs /usr/bin/security to access macOS Keychain.
  let currentPath = env.PATH || "";

  // On macOS/Linux, ensure basic system paths are always present
  if (platform !== "win32") {
    const pathSetForEssentials = new Set(currentPath.split(pathSeparator).filter(Boolean));
    const missingEssentials = ESSENTIAL_SYSTEM_PATHS.filter((p) => !pathSetForEssentials.has(p));

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
  const existingPaths = new Set(candidatePaths.filter((p) => fs.existsSync(p)));

  // Get npm global prefix dynamically
  const npmPrefix = getNpmGlobalPrefix();
  if (npmPrefix && fs.existsSync(npmPrefix)) {
    existingPaths.add(npmPrefix);
  }

  // Build final paths to add using shared helper
  const pathsToAdd = buildPathsToAdd(candidatePaths, currentPathSet, existingPaths, npmPrefix);

  // Prepend new paths to PATH (prepend so they take priority)
  env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);

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
  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const pathDirs = (env.PATH || "").split(pathSeparator);

  // On Windows, check Windows-native extensions first (.exe, .cmd) before
  // extensionless files (which are typically bash/sh scripts for Git Bash/Cygwin)
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ".ps1", ""] : [""];

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
      const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

      const { stdout } = await execFileAsync(
        npmCommand,
        ["config", "get", "prefix", "--location=global"],
        {
          encoding: "utf-8",
          timeout: 3000,
          windowsHide: true,
          cwd: os.homedir(), // Run from home dir to avoid ENOWORKSPACES error in monorepos
          shell: process.platform === "win32",
        }
      );

      const rawPrefix = stdout.trim();
      if (!rawPrefix) {
        npmGlobalPrefixCache = null;
        return null;
      }

      const binPath = process.platform === "win32" ? rawPrefix : path.join(rawPrefix, "bin");

      const normalizedPath = path.normalize(binPath);
      npmGlobalPrefixCache = (await existsAsync(normalizedPath)) ? normalizedPath : null;
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
export async function getAugmentedEnvAsync(
  additionalPaths?: string[]
): Promise<Record<string, string>> {
  const env = { ...process.env } as Record<string, string>;
  const platform = process.platform as "darwin" | "linux" | "win32";
  const pathSeparator = platform === "win32" ? ";" : ":";

  // Get all candidate paths (platform + additional)
  const candidatePaths = getExpandedPlatformPaths(additionalPaths);

  // Ensure essential system paths are present (for macOS Keychain access)
  let currentPath = env.PATH || "";

  if (platform !== "win32") {
    const pathSetForEssentials = new Set(currentPath.split(pathSeparator).filter(Boolean));
    const missingEssentials = ESSENTIAL_SYSTEM_PATHS.filter((p) => !pathSetForEssentials.has(p));

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
  const existingPaths = new Set(pathChecks.filter(({ exists }) => exists).map(({ path: p }) => p));

  // Get npm global prefix dynamically (async - non-blocking)
  const npmPrefix = await getNpmGlobalPrefixAsync();
  if (npmPrefix && (await existsAsync(npmPrefix))) {
    existingPaths.add(npmPrefix);
  }

  // Build final paths to add using shared helper
  const pathsToAdd = buildPathsToAdd(candidatePaths, currentPathSet, existingPaths, npmPrefix);

  // Prepend new paths to PATH (prepend so they take priority)
  env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);

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
  const pathSeparator = process.platform === "win32" ? ";" : ":";
  const pathDirs = (env.PATH || "").split(pathSeparator);

  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ".ps1", ""] : [""];

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

// ============================================================================
// PYTHON SUBPROCESS UTILITIES
// ============================================================================

/**
 * Result of analyzing path quoting requirements
 *
 * @internal Shared helper for preparePythonSubprocessCommand and prepareShellCommand
 */
interface QuotingDecision {
  /** Whether shell mode is required (only true for .cmd/.bat files on Windows) */
  needsShell: boolean;
  /** Whether the path needs to be quoted (only when needsShell=true and path has spaces/metacharacters) */
  needsQuoting: boolean;
  /** Whether the path is already wrapped in quotes */
  isAlreadyQuoted: boolean;
}

/**
 * Analyze a path to determine quoting requirements for shell execution
 *
 * This is a shared helper that detects:
 * - Windows batch files (.cmd/.bat) that require shell mode
 * - Paths already wrapped in quotes
 * - Shell metacharacters (& | < > ^ % ()) and spaces that require quoting
 *
 * @param executablePath - The path to analyze
 * @returns Quoting decision object
 * @internal
 */
function analyzePathQuoting(executablePath: string): QuotingDecision {
  // On Windows, .cmd and .bat files need shell mode for proper execution
  // Use case-insensitive check since Windows file extensions are case-insensitive
  const lowerPath = executablePath.toLowerCase();
  const isWindowsBatchFile =
    process.platform === "win32" && (lowerPath.endsWith(".cmd") || lowerPath.endsWith(".bat"));
  const needsShell = isWindowsBatchFile;

  // Check if path is already wrapped in quotes
  const isAlreadyQuoted = executablePath.startsWith('"') && executablePath.endsWith('"');

  // Detect shell metacharacters that require quoting in shell mode
  // Windows cmd.exe interprets: & | < > ^ % ( ) as special characters
  const hasShellMetacharacters = /[&|<>^%()]/.test(executablePath);
  const hasSpaces = executablePath.includes(" ");

  // Add quotes if: shell mode AND (has spaces OR shell metacharacters) AND not already quoted
  const needsQuoting = needsShell && (hasSpaces || hasShellMetacharacters) && !isAlreadyQuoted;

  return { needsShell, needsQuoting, isAlreadyQuoted };
}

/**
 * Result of preparing a path for Python subprocess execution
 */
export interface PythonSubprocessCommand {
  /** The escaped path to use in the subprocess command (with proper quotes if needed) */
  commandPath: string;
  /** Whether shell=True should be used for subprocess.run() */
  needsShell: boolean;
}

/**
 * Prepare a Windows executable path for Python subprocess execution
 *
 * Handles the complex quoting rules for Windows paths:
 * - .cmd and .bat files require shell=True
 * - Paths with spaces need quotes, but only if not already quoted
 * - Backslashes and quotes need escaping for Python string representation
 *
 * This is used when generating Python scripts that will execute Windows commands
 * via subprocess.run() with shell=True.
 *
 * @param executablePath - The path to the executable (e.g., "C:\\Users\\Jane Smith\\...\\claude.cmd")
 * @returns Object containing commandPath (escaped for Python) and needsShell flag
 *
 * @example
 * ```typescript
 * const { commandPath, needsShell } = preparePythonSubprocessCommand("C:\\Users\\Jane Smith\\AppData\\Roaming\\npm\\claude.cmd");
 * // commandPath = "\\"C:\\\\Users\\\\Jane\\\\Smith\\\\AppData\\\\Roaming\\\\npm\\\\claude.cmd\\""
 * // needsShell = true
 *
 * // In generated Python script:
 * // command = ${commandPath} + ' chat --model haiku --prompt "' + prompt + '"'
 * // result = subprocess.run(command, shell=True)
 * ```
 */
export function preparePythonSubprocessCommand(executablePath: string): PythonSubprocessCommand {
  // Validate input
  if (!executablePath || typeof executablePath !== "string") {
    throw new Error(
      "preparePythonSubprocessCommand: executablePath is required and must be a string"
    );
  }

  // Analyze path to determine quoting requirements
  const { needsShell, needsQuoting } = analyzePathQuoting(executablePath);
  const quotedPath = needsQuoting ? `"${executablePath}"` : executablePath;

  // For shell mode, the path must be quoted in the command string.
  // We escape the quoted path for Python string representation.
  // For list mode (no shell), just escape backslashes and quotes.
  const commandPath = needsShell
    ? `"${quotedPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : quotedPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  return { commandPath, needsShell };
}

/**
 * Result of preparing a path for Node.js shell execution
 */
export interface ShellCommandResult {
  /** The command to use (with quotes if needed) */
  command: string;
  /**
   * Whether shell mode is required for Windows batch files (.cmd/.bat)
   *
   * This is true ONLY when the path ends with .cmd/.bat on Windows.
   * The returned {command} will be quoted ONLY when needsShell is true and the
   * path contains spaces or shell metacharacters.
   *
   * IMPORTANT: If you set shell: true for other reasons (e.g., custom shell
   * scripts, environment variable expansion), you MUST perform your own quoting
   * and escaping of executablePath before calling this function.
   */
  needsShell: boolean;
}

/**
 * Prepare a Windows executable path for Node.js shell execution
 *
 * This function prepares paths for use with Node.js child_process functions
 * (execFileSync, execFile) when shell: true is required.
 *
 * Behavior:
 * - Sets needsShell=true ONLY for Windows .cmd/.bat files
 * - Quotes the path ONLY when needsShell=true AND path contains spaces or
 *   shell metacharacters (& | < > ^ % ())
 * - Does NOT quote .exe or other files even if they contain spaces
 *
 * @param executablePath - The path to the executable
 * @returns {ShellCommandResult} Object containing:
 *   - command: The path to use (quoted if needsShell=true and quoting is needed)
 *   - needsShell: true ONLY for .cmd/.bat files on Windows
 *
 * @example
 * ```typescript
 * const { command, needsShell } = prepareShellCommand('C:\\npm\\claude.cmd');
 * // command: 'C:\\npm\\claude.cmd' (no spaces, not quoted)
 * // needsShell: true
 *
 * execFileSync(command, ['--version'], { shell: needsShell });
 * ```
 *
 * @example
 * ```typescript
 * const { command, needsShell } = prepareShellCommand('C:\\Jane Smith\\npm\\claude.cmd');
 * // command: '"C:\\Jane Smith\\npm\\claude.cmd"' (quoted due to spaces)
 * // needsShell: true
 *
 * execFileSync(command, ['--version'], { shell: needsShell });
 * ```
 *
 * @example
 * ```typescript
 * const { command, needsShell } = prepareShellCommand('C:\\Program Files\\app.exe');
 * // command: 'C:\\Program Files\\app.exe' (NOT quoted - needsShell is false for .exe)
 * // needsShell: false
 *
 * // Caller must quote if using shell: true for other reasons:
 * const quotedCmd = command.includes(' ') ? `"${command}"` : command;
 * execFileSync(quotedCmd, ['--version'], { shell: true });
 * ```
 */
export function prepareShellCommand(executablePath: string): ShellCommandResult {
  // Validate input
  if (!executablePath || typeof executablePath !== "string") {
    throw new Error("prepareShellCommand: executablePath is required and must be a string");
  }

  // Analyze path to determine quoting requirements
  const { needsShell, needsQuoting } = analyzePathQuoting(executablePath);

  // Add quotes if: shell mode AND quoting is needed
  const command = needsQuoting ? `"${executablePath}"` : executablePath;

  return { command, needsShell };
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
  const { needsShell } = prepareShellCommand(command);
  return needsShell;
}

/**
 * Get spawn options for executing a command
 *
 * Returns appropriate spawn options for Node.js child_process functions,
 * including the correct shell setting for Windows batch files.
 *
 * @param command - The command path being executed
 * @param options - Base spawn options to merge with (optional)
 * @returns Spawn options with correct shell setting
 *
 * @example
 * ```typescript
 * const opts = getSpawnOptions(claudeCmd, { cwd: '/project', env: {...} });
 * spawn(claudeCmd, ['--version'], opts);
 * ```
 */
export function getSpawnOptions(
  command: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    windowsHide?: boolean;
    stdio?: "inherit" | "pipe" | Array<"inherit" | "pipe">;
  }
): {
  cwd?: string;
  env?: Record<string, string>;
  shell: boolean | string;
  timeout?: number;
  windowsHide?: boolean;
  stdio?: "inherit" | "pipe" | Array<"inherit" | "pipe">;
} {
  const { needsShell } = prepareShellCommand(command);
  return {
    ...options,
    shell: needsShell,
  };
}
