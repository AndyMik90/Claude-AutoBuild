/**
 * CLI Tool Manager
 *
 * Centralized management for CLI tools (Python, Git, GitHub CLI, Claude CLI) used throughout
 * the application. Provides intelligent multi-level detection with user
 * configuration support.
 *
 * Detection Priority (for each tool):
 * 1. User configuration (from settings.json)
 * 2. Virtual environment (Python only - project-specific venv)
 * 3. Homebrew (macOS - architecture-aware for Apple Silicon vs Intel)
 * 4. System PATH (augmented with common binary locations)
 * 5. Platform-specific standard locations
 *
 * Features:
 * - Session-based caching (no TTL - cache persists until app restart or settings
 *   change)
 * - Version validation (Python 3.10+ required for claude-agent-sdk)
 * - Platform-aware detection (macOS, Windows, Linux)
 * - Graceful fallbacks when tools not found
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { findExecutable } from './env-utils';
import type { ToolDetectionResult } from '../shared/types';
import { findHomebrewPython as findHomebrewPythonUtil } from './utils/homebrew-python';

/**
 * Supported CLI tools managed by this system
 */
export type CLITool = 'python' | 'git' | 'gh' | 'claude';

/**
 * User configuration for CLI tool paths
 * Maps to settings stored in settings.json
 */
export interface ToolConfig {
  pythonPath?: string;
  gitPath?: string;
  githubCLIPath?: string;
  claudePath?: string;
}

/**
 * Internal validation result for a CLI tool
 */
interface ToolValidation {
  valid: boolean;
  version?: string;
  message: string;
}

/**
 * Cache entry for detected tool path
 * No timestamp - cache persists for entire app session
 */
interface CacheEntry {
  path: string;
  version?: string;
  source: string;
}

/**
 * Check if a path appears to be from a different platform.
 * Detects Windows paths on Unix and Unix paths on Windows.
 *
 * @param pathStr - The path to check
 * @returns true if the path is from a different platform
 */
function isWrongPlatformPath(pathStr: string | undefined): boolean {
  if (!pathStr) return false;

  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // On Windows, reject Unix-style absolute paths (starting with /)
    // but allow relative paths and Windows paths
    if (pathStr.startsWith('/') && !pathStr.startsWith('//')) {
      // Unix absolute path on Windows
      return true;
    }
  } else {
    // On Unix (macOS/Linux), reject Windows-style paths
    // Windows paths have: drive letter (C:), backslashes, or specific Windows paths
    if (/^[A-Za-z]:[/\\]/.test(pathStr)) {
      // Drive letter path (C:\, D:/, etc.)
      return true;
    }
    if (pathStr.includes('\\')) {
      // Contains backslashes (Windows path separators)
      return true;
    }
    if (pathStr.includes('AppData') || pathStr.includes('Program Files')) {
      // Contains Windows-specific directory names
      return true;
    }
  }

  return false;
}

/**
 * Centralized CLI Tool Manager
 *
 * Singleton class that manages detection, validation, and caching of CLI tool
 * paths. Supports user configuration overrides and intelligent auto-detection.
 *
 * Usage:
 *   import { getToolPath, configureTools } from './cli-tool-manager';
 *
 *   // Configure with user settings (optional)
 *   configureTools({ pythonPath: '/custom/python3', gitPath: '/custom/git' });
 *
 *   // Get tool path (auto-detects if not configured)
 *   const pythonPath = getToolPath('python');
 *   const gitPath = getToolPath('git');
 */
class CLIToolManager {
  private cache: Map<CLITool, CacheEntry> = new Map();
  private userConfig: ToolConfig = {};

  /**
   * Configure the tool manager with user settings
   *
   * Clears the cache to force re-detection with new configuration.
   * Call this when user changes CLI tool paths in Settings.
   *
   * @param config - User configuration for CLI tool paths
   */
  configure(config: ToolConfig): void {
    this.userConfig = config;
    this.cache.clear();
    console.warn('[CLI Tools] Configuration updated, cache cleared');
  }

  /**
   * Get the path for a specific CLI tool
   *
   * Uses cached path if available, otherwise detects and caches.
   * Cache persists for entire app session (no expiration).
   *
   * @param tool - The CLI tool to get the path for
   * @returns The resolved path to the tool executable
   */
  getToolPath(tool: CLITool): string {
    // Check cache first
    const cached = this.cache.get(tool);
    if (cached) {
      console.warn(
        `[CLI Tools] Using cached ${tool}: ${cached.path} (${cached.source})`
      );
      return cached.path;
    }

    // Detect and cache
    const result = this.detectToolPath(tool);
    if (result.found && result.path) {
      this.cache.set(tool, {
        path: result.path,
        version: result.version,
        source: result.source,
      });
      console.warn(`[CLI Tools] Detected ${tool}: ${result.path} (${result.source})`);
      return result.path;
    }

    // Fallback to tool name (let system PATH resolve it)
    console.warn(`[CLI Tools] ${tool} not found, using fallback: "${tool}"`);
    return tool;
  }

  /**
   * Detect the path for a specific CLI tool
   *
   * Implements multi-level detection strategy based on tool type.
   *
   * @param tool - The tool to detect
   * @returns Detection result with path and metadata
   */
  private detectToolPath(tool: CLITool): ToolDetectionResult {
    switch (tool) {
      case 'python':
        return this.detectPython();
      case 'git':
        return this.detectGit();
      case 'gh':
        return this.detectGitHubCLI();
      case 'claude':
        return this.detectClaude();
      default:
        return {
          found: false,
          source: 'fallback',
          message: `Unknown tool: ${tool}`,
        };
    }
  }

  /**
   * Detect Python with multi-level priority
   *
   * Priority order:
   * 1. User configuration (if valid for current platform)
   * 2. Bundled Python (packaged apps only)
   * 3. Homebrew Python (macOS)
   * 4. System PATH (py -3, python3, python)
   *
   * Validates Python version >= 3.10.0 (required by claude-agent-sdk)
   *
   * @returns Detection result for Python
   */
  private detectPython(): ToolDetectionResult {
    const MINIMUM_VERSION = '3.10.0';

    // 1. User configuration
    if (this.userConfig.pythonPath) {
      // Check if path is from wrong platform (e.g., Windows path on macOS)
      if (isWrongPlatformPath(this.userConfig.pythonPath)) {
        console.warn(
          `[Python] User-configured path is from different platform, ignoring: ${this.userConfig.pythonPath}`
        );
      } else {
        const validation = this.validatePython(this.userConfig.pythonPath);
        if (validation.valid) {
          return {
            found: true,
            path: this.userConfig.pythonPath,
            version: validation.version,
            source: 'user-config',
            message: `Using user-configured Python: ${this.userConfig.pythonPath}`,
          };
        }
        console.warn(
          `[Python] User-configured path invalid: ${validation.message}`
        );
      }
    }

    // 2. Bundled Python (packaged apps only)
    if (app.isPackaged) {
      const bundledPath = this.getBundledPythonPath();
      if (bundledPath) {
        const validation = this.validatePython(bundledPath);
        if (validation.valid) {
          return {
            found: true,
            path: bundledPath,
            version: validation.version,
            source: 'bundled',
            message: `Using bundled Python: ${bundledPath}`,
          };
        }
      }
    }

    // 3. Homebrew Python (macOS)
    if (process.platform === 'darwin') {
      const homebrewPath = this.findHomebrewPython();
      if (homebrewPath) {
        const validation = this.validatePython(homebrewPath);
        if (validation.valid) {
          return {
            found: true,
            path: homebrewPath,
            version: validation.version,
            source: 'homebrew',
            message: `Using Homebrew Python: ${homebrewPath}`,
          };
        }
      }
    }

    // 4. System PATH (augmented)
    const candidates =
      process.platform === 'win32'
        ? ['py -3', 'python', 'python3', 'py']
        : ['python3', 'python'];

    for (const cmd of candidates) {
      // Special handling for Windows 'py -3' launcher
      if (cmd.startsWith('py ')) {
        const validation = this.validatePython(cmd);
        if (validation.valid) {
          return {
            found: true,
            path: cmd,
            version: validation.version,
            source: 'system-path',
            message: `Using system Python: ${cmd}`,
          };
        }
      } else {
        // For regular python/python3, find the actual path
        const pythonPath = findExecutable(cmd);
        if (pythonPath) {
          const validation = this.validatePython(pythonPath);
          if (validation.valid) {
            return {
              found: true,
              path: pythonPath,
              version: validation.version,
              source: 'system-path',
              message: `Using system Python: ${pythonPath}`,
            };
          }
        }
      }
    }

    // 5. Not found
    return {
      found: false,
      source: 'fallback',
      message:
        `Python ${MINIMUM_VERSION}+ not found. ` +
        'Please install Python or configure in Settings.',
    };
  }

  /**
   * Detect Git with multi-level priority
   *
   * Priority order:
   * 1. User configuration (if valid for current platform)
   * 2. Homebrew Git (macOS)
   * 3. System PATH
   *
   * @returns Detection result for Git
   */
  private detectGit(): ToolDetectionResult {
    // 1. User configuration
    if (this.userConfig.gitPath) {
      // Check if path is from wrong platform (e.g., Windows path on macOS)
      if (isWrongPlatformPath(this.userConfig.gitPath)) {
        console.warn(
          `[Git] User-configured path is from different platform, ignoring: ${this.userConfig.gitPath}`
        );
      } else {
        const validation = this.validateGit(this.userConfig.gitPath);
        if (validation.valid) {
          return {
            found: true,
            path: this.userConfig.gitPath,
            version: validation.version,
            source: 'user-config',
            message: `Using user-configured Git: ${this.userConfig.gitPath}`,
          };
        }
        console.warn(`[Git] User-configured path invalid: ${validation.message}`);
      }
    }

    // 2. Homebrew (macOS)
    if (process.platform === 'darwin') {
      const homebrewPaths = [
        '/opt/homebrew/bin/git', // Apple Silicon
        '/usr/local/bin/git', // Intel Mac
      ];

      for (const gitPath of homebrewPaths) {
        if (existsSync(gitPath)) {
          const validation = this.validateGit(gitPath);
          if (validation.valid) {
            return {
              found: true,
              path: gitPath,
              version: validation.version,
              source: 'homebrew',
              message: `Using Homebrew Git: ${gitPath}`,
            };
          }
        }
      }
    }

    // 3. System PATH (augmented)
    const gitPath = findExecutable('git');
    if (gitPath) {
      const validation = this.validateGit(gitPath);
      if (validation.valid) {
        return {
          found: true,
          path: gitPath,
          version: validation.version,
          source: 'system-path',
          message: `Using system Git: ${gitPath}`,
        };
      }
    }

    // 4. Not found - fallback to 'git'
    return {
      found: false,
      source: 'fallback',
      message: 'Git not found in standard locations. Using fallback "git".',
    };
  }

  /**
   * Detect GitHub CLI with multi-level priority
   *
   * Priority order:
   * 1. User configuration (if valid for current platform)
   * 2. Homebrew gh (macOS)
   * 3. System PATH
   * 4. Windows Program Files
   *
   * @returns Detection result for GitHub CLI
   */
  private detectGitHubCLI(): ToolDetectionResult {
    // 1. User configuration
    if (this.userConfig.githubCLIPath) {
      // Check if path is from wrong platform (e.g., Windows path on macOS)
      if (isWrongPlatformPath(this.userConfig.githubCLIPath)) {
        console.warn(
          `[GitHub CLI] User-configured path is from different platform, ignoring: ${this.userConfig.githubCLIPath}`
        );
      } else {
        const validation = this.validateGitHubCLI(this.userConfig.githubCLIPath);
        if (validation.valid) {
          return {
            found: true,
            path: this.userConfig.githubCLIPath,
            version: validation.version,
            source: 'user-config',
            message: `Using user-configured GitHub CLI: ${this.userConfig.githubCLIPath}`,
          };
        }
        console.warn(
          `[GitHub CLI] User-configured path invalid: ${validation.message}`
        );
      }
    }

    // 2. Homebrew (macOS)
    if (process.platform === 'darwin') {
      const homebrewPaths = [
        '/opt/homebrew/bin/gh', // Apple Silicon
        '/usr/local/bin/gh', // Intel Mac
      ];

      for (const ghPath of homebrewPaths) {
        if (existsSync(ghPath)) {
          const validation = this.validateGitHubCLI(ghPath);
          if (validation.valid) {
            return {
              found: true,
              path: ghPath,
              version: validation.version,
              source: 'homebrew',
              message: `Using Homebrew GitHub CLI: ${ghPath}`,
            };
          }
        }
      }
    }

    // 3. System PATH (augmented)
    const ghPath = findExecutable('gh');
    if (ghPath) {
      const validation = this.validateGitHubCLI(ghPath);
      if (validation.valid) {
        return {
          found: true,
          path: ghPath,
          version: validation.version,
          source: 'system-path',
          message: `Using system GitHub CLI: ${ghPath}`,
        };
      }
    }

    // 4. Windows Program Files
    if (process.platform === 'win32') {
      const windowsPaths = [
        'C:\\Program Files\\GitHub CLI\\gh.exe',
        'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
      ];

      for (const ghPath of windowsPaths) {
        if (existsSync(ghPath)) {
          const validation = this.validateGitHubCLI(ghPath);
          if (validation.valid) {
            return {
              found: true,
              path: ghPath,
              version: validation.version,
              source: 'system-path',
              message: `Using Windows GitHub CLI: ${ghPath}`,
            };
          }
        }
      }
    }

    // 5. Not found
    return {
      found: false,
      source: 'fallback',
      message: 'GitHub CLI (gh) not found. Install from https://cli.github.com',
    };
  }

  /**
   * Detect Claude CLI with multi-level priority
   *
   * Priority order:
   * 1. User configuration (if valid for current platform)
   * 2. Homebrew claude (macOS)
   * 3. System PATH
   * 4. Windows/macOS/Linux standard locations
   *
   * @returns Detection result for Claude CLI
   */
  private detectClaude(): ToolDetectionResult {
    // 1. User configuration
    if (this.userConfig.claudePath) {
      // Check if path is from wrong platform (e.g., Windows path on macOS)
      if (isWrongPlatformPath(this.userConfig.claudePath)) {
        console.warn(
          `[Claude CLI] User-configured path is from different platform, ignoring: ${this.userConfig.claudePath}`
        );
      } else {
        const validation = this.validateClaude(this.userConfig.claudePath);
        if (validation.valid) {
          return {
            found: true,
            path: this.userConfig.claudePath,
            version: validation.version,
            source: 'user-config',
            message: `Using user-configured Claude CLI: ${this.userConfig.claudePath}`,
          };
        }
        console.warn(
          `[Claude CLI] User-configured path invalid: ${validation.message}`
        );
      }
    }

    // 2. Homebrew (macOS)
    if (process.platform === 'darwin') {
      const homebrewPaths = [
        '/opt/homebrew/bin/claude', // Apple Silicon
        '/usr/local/bin/claude', // Intel Mac
      ];

      for (const claudePath of homebrewPaths) {
        if (existsSync(claudePath)) {
          const validation = this.validateClaude(claudePath);
          if (validation.valid) {
            return {
              found: true,
              path: claudePath,
              version: validation.version,
              source: 'homebrew',
              message: `Using Homebrew Claude CLI: ${claudePath}`,
            };
          }
        }
      }
    }

    // 3. System PATH (augmented)
    const claudePath = findExecutable('claude');
    if (claudePath) {
      const validation = this.validateClaude(claudePath);
      if (validation.valid) {
        return {
          found: true,
          path: claudePath,
          version: validation.version,
          source: 'system-path',
          message: `Using system Claude CLI: ${claudePath}`,
        };
      }
    }

    // 4. Platform-specific standard locations
    const homeDir = os.homedir();
    const platformPaths = process.platform === 'win32'
      ? [
          path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
          path.join(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
          path.join(homeDir, '.local', 'bin', 'claude.exe'),
          'C:\\Program Files\\Claude\\claude.exe',
          'C:\\Program Files (x86)\\Claude\\claude.exe',
        ]
      : [
          path.join(homeDir, '.local', 'bin', 'claude'),
          path.join(homeDir, 'bin', 'claude'),
        ];

    for (const claudePath of platformPaths) {
      if (existsSync(claudePath)) {
        const validation = this.validateClaude(claudePath);
        if (validation.valid) {
          return {
            found: true,
            path: claudePath,
            version: validation.version,
            source: 'system-path',
            message: `Using Claude CLI: ${claudePath}`,
          };
        }
      }
    }

    // 5. Not found
    return {
      found: false,
      source: 'fallback',
      message: 'Claude CLI not found. Install from https://claude.ai/download',
    };
  }

  /**
   * Validate Python version and availability
   *
   * Checks that Python executable exists and meets minimum version requirement
   * (3.10.0+) for claude-agent-sdk compatibility.
   *
   * @param pythonCmd - The Python command to validate
   * @returns Validation result with version information
   */
  private validatePython(pythonCmd: string): ToolValidation {
    const MINIMUM_VERSION = '3.10.0';

    try {
      // Parse command to handle cases like 'py -3' on Windows
      // This avoids command injection by using execFileSync instead of execSync
      const parts = pythonCmd.split(' ');
      const cmd = parts[0];
      const args = [...parts.slice(1), '--version'];

      const version = execFileSync(cmd, args, {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).trim();

      const match = version.match(/Python (\d+\.\d+\.\d+)/);
      if (!match) {
        return {
          valid: false,
          message: 'Unable to detect Python version',
        };
      }

      const versionStr = match[1];
      const [major, minor] = versionStr.split('.').map(Number);
      const [reqMajor, reqMinor] = MINIMUM_VERSION.split('.').map(Number);

      const meetsRequirement =
        major > reqMajor || (major === reqMajor && minor >= reqMinor);

      if (!meetsRequirement) {
        return {
          valid: false,
          version: versionStr,
          message: `Python ${versionStr} is too old. Requires ${MINIMUM_VERSION}+`,
        };
      }

      return {
        valid: true,
        version: versionStr,
        message: `Python ${versionStr} meets requirements`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Python: ${error}`,
      };
    }
  }

  /**
   * Validate Git availability and version
   *
   * @param gitCmd - The Git command to validate
   * @returns Validation result with version information
   */
  private validateGit(gitCmd: string): ToolValidation {
    try {
      const version = execFileSync(gitCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).trim();

      const match = version.match(/git version (\d+\.\d+\.\d+)/);
      const versionStr = match ? match[1] : version;

      return {
        valid: true,
        version: versionStr,
        message: `Git ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Git: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Validate GitHub CLI availability and version
   *
   * @param ghCmd - The GitHub CLI command to validate
   * @returns Validation result with version information
   */
  private validateGitHubCLI(ghCmd: string): ToolValidation {
    try {
      const version = execFileSync(ghCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).trim();

      const match = version.match(/gh version (\d+\.\d+\.\d+)/);
      const versionStr = match ? match[1] : version.split('\n')[0];

      return {
        valid: true,
        version: versionStr,
        message: `GitHub CLI ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate GitHub CLI: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Validate Claude CLI availability and version
   *
   * @param claudeCmd - The Claude CLI command to validate
   * @returns Validation result with version information
   */
  private validateClaude(claudeCmd: string): ToolValidation {
    try {
      // On Windows, .cmd files need shell: true to execute properly.
      // SECURITY NOTE: shell: true is safe here because:
      // 1. claudeCmd comes from internal path detection (user config or known system paths)
      // 2. Only '--version' is passed as an argument (no user input)
      // If claudeCmd origin ever changes to accept user input, use escapeShellArgWindows.
      const needsShell = process.platform === 'win32' &&
        (claudeCmd.endsWith('.cmd') || claudeCmd.endsWith('.bat'));

      const version = execFileSync(claudeCmd, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        shell: needsShell,
      }).trim();

      // Claude CLI version output format: "claude-code version X.Y.Z" or similar
      const match = version.match(/(\d+\.\d+\.\d+)/);
      const versionStr = match ? match[1] : version.split('\n')[0];

      return {
        valid: true,
        version: versionStr,
        message: `Claude CLI ${versionStr} is available`,
      };
    } catch (error) {
      return {
        valid: false,
        message: `Failed to validate Claude CLI: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get bundled Python path for packaged apps
   *
   * Only available in packaged Electron apps where Python is bundled
   * in the resources directory.
   *
   * @returns Path to bundled Python or null if not found
   */
  private getBundledPythonPath(): string | null {
    if (!app.isPackaged) {
      return null;
    }

    const resourcesPath = process.resourcesPath;
    const isWindows = process.platform === 'win32';

    const pythonPath = isWindows
      ? path.join(resourcesPath, 'python', 'python.exe')
      : path.join(resourcesPath, 'python', 'bin', 'python3');

    return existsSync(pythonPath) ? pythonPath : null;
  }

  /**
   * Find Homebrew Python on macOS
   * Delegates to shared utility function.
   *
   * @returns Path to Homebrew Python or null if not found
   */
  private findHomebrewPython(): string | null {
    return findHomebrewPythonUtil(
      (pythonPath) => this.validatePython(pythonPath),
      '[CLI Tools]'
    );
  }

  /**
   * Clear cache manually
   *
   * Useful for testing or forcing re-detection.
   * Normally not needed as cache is cleared automatically on settings change.
   */
  clearCache(): void {
    this.cache.clear();
    console.warn('[CLI Tools] Cache cleared');
  }

  /**
   * Get tool detection info for diagnostics
   *
   * Performs fresh detection without using cache.
   * Useful for Settings UI to show current detection status.
   *
   * @param tool - The tool to get detection info for
   * @returns Detection result with full metadata
   */
  getToolInfo(tool: CLITool): ToolDetectionResult {
    return this.detectToolPath(tool);
  }
}

// Singleton instance
const cliToolManager = new CLIToolManager();

/**
 * Get the path for a CLI tool
 *
 * Convenience function for accessing the tool manager singleton.
 * Uses cached path if available, otherwise auto-detects.
 *
 * @param tool - The CLI tool to get the path for
 * @returns The resolved path to the tool executable
 *
 * @example
 * ```typescript
 * import { getToolPath } from './cli-tool-manager';
 *
 * const pythonPath = getToolPath('python');
 * const gitPath = getToolPath('git');
 * const ghPath = getToolPath('gh');
 *
 * execSync(`${gitPath} status`, { cwd: projectPath });
 * ```
 */
export function getToolPath(tool: CLITool): string {
  return cliToolManager.getToolPath(tool);
}

/**
 * Configure CLI tools with user settings
 *
 * Call this when user updates CLI tool paths in Settings.
 * Clears cache to force re-detection with new configuration.
 *
 * @param config - User configuration for CLI tool paths
 *
 * @example
 * ```typescript
 * import { configureTools } from './cli-tool-manager';
 *
 * // When settings are loaded or updated
 * configureTools({
 *   pythonPath: settings.pythonPath,
 *   gitPath: settings.gitPath,
 *   githubCLIPath: settings.githubCLIPath,
 * });
 * ```
 */
export function configureTools(config: ToolConfig): void {
  cliToolManager.configure(config);
}

/**
 * Get tool detection info for diagnostics
 *
 * Performs fresh detection and returns full metadata.
 * Useful for Settings UI to show detection status and version.
 *
 * @param tool - The tool to get detection info for
 * @returns Detection result with path, version, and source
 *
 * @example
 * ```typescript
 * import { getToolInfo } from './cli-tool-manager';
 *
 * const pythonInfo = getToolInfo('python');
 * console.log(`Found: ${pythonInfo.found}`);
 * console.log(`Path: ${pythonInfo.path}`);
 * console.log(`Version: ${pythonInfo.version}`);
 * console.log(`Source: ${pythonInfo.source}`);
 * ```
 */
export function getToolInfo(tool: CLITool): ToolDetectionResult {
  return cliToolManager.getToolInfo(tool);
}

/**
 * Clear tool path cache manually
 *
 * Forces re-detection on next getToolPath() call.
 * Normally not needed as cache is cleared automatically on settings change.
 *
 * @example
 * ```typescript
 * import { clearToolCache } from './cli-tool-manager';
 *
 * // Force re-detection (e.g., after installing new tools)
 * clearToolCache();
 * ```
 */
export function clearToolCache(): void {
  cliToolManager.clearCache();
}

/**
 * Check if a path appears to be from a different platform.
 * Useful for detecting cross-platform path issues in settings.
 *
 * @param pathStr - The path to check
 * @returns true if the path is from a different platform
 *
 * @example
 * ```typescript
 * import { isPathFromWrongPlatform } from './cli-tool-manager';
 *
 * // On macOS, this returns true for Windows paths
 * isPathFromWrongPlatform('C:\\Program Files\\claude.exe'); // true
 * isPathFromWrongPlatform('/usr/local/bin/claude'); // false
 * ```
 */
export function isPathFromWrongPlatform(pathStr: string | undefined): boolean {
  return isWrongPlatformPath(pathStr);
}
