import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { getProfileEnv } from '../rate-limit-detector';
import { getAPIProfileEnv } from '../services/profile';
import { getOAuthModeClearVars } from '../agent/env-utils';
import { pythonEnvManager, getConfiguredPythonPath } from '../python-env-manager';
import { getValidatedPythonPath } from '../python-detector';
import { getAugmentedEnv } from '../env-utils';
import { getEffectiveSourcePath } from '../updater/path-resolver';
import { getToolInfo } from '../cli-tool-manager';

/**
 * Derive the path to bash.exe from the git.exe path on Windows.
 * Git for Windows installs bash.exe in the Git/bin directory.
 */
function deriveGitBashPath(gitExePath: string): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const gitDir = path.dirname(gitExePath);  // e.g., D:\...\Git\mingw64\bin
    const gitDirName = path.basename(gitDir).toLowerCase();

    // Find Git installation root
    let gitRoot: string;

    if (gitDirName === 'cmd') {
      // .../Git/cmd/git.exe -> .../Git
      gitRoot = path.dirname(gitDir);
    } else if (gitDirName === 'bin') {
      // Could be .../Git/bin/git.exe OR .../Git/mingw64/bin/git.exe
      const parent = path.dirname(gitDir);
      const parentName = path.basename(parent).toLowerCase();
      if (parentName === 'mingw64' || parentName === 'mingw32') {
        // .../Git/mingw64/bin/git.exe -> .../Git
        gitRoot = path.dirname(parent);
      } else {
        // .../Git/bin/git.exe -> .../Git
        gitRoot = parent;
      }
    } else {
      // Unknown structure - try to find 'bin' sibling
      gitRoot = path.dirname(gitDir);
    }

    // Bash.exe is in Git/bin/bash.exe
    const bashPath = path.join(gitRoot, 'bin', 'bash.exe');

    if (existsSync(bashPath)) {
      console.log('[InsightsConfig] Derived git-bash path:', bashPath);
      return bashPath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Configuration manager for insights service
 * Handles path detection and environment variable loading
 */
export class InsightsConfig {
  // Python path will be configured by pythonEnvManager after venv is ready
  // Use getter to always get current configured path
  private _pythonPath: string | null = null;
  private autoBuildSourcePath: string = '';

  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      this._pythonPath = getValidatedPythonPath(pythonPath, 'InsightsConfig');
    }
    if (autoBuildSourcePath) {
      this.autoBuildSourcePath = autoBuildSourcePath;
    }
  }

  /**
   * Get configured Python path.
   * Returns explicitly configured path, or falls back to getConfiguredPythonPath()
   * which uses the venv Python if ready.
   */
  getPythonPath(): string {
    // If explicitly configured (by pythonEnvManager), use that
    if (this._pythonPath) {
      return this._pythonPath;
    }
    // Otherwise use the global configured path (venv if ready, else bundled/system)
    return getConfiguredPythonPath();
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   * Uses getEffectiveSourcePath() which handles userData override for user-updated backend
   */
  getAutoBuildSourcePath(): string | null {
    if (this.autoBuildSourcePath && existsSync(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    // Use shared path resolver which handles:
    // 1. User settings (autoBuildPath)
    // 2. userData override (backend-source) for user-updated backend
    // 3. Bundled backend (process.resourcesPath/backend)
    // 4. Development paths
    const effectivePath = getEffectiveSourcePath();
    if (existsSync(effectivePath) && existsSync(path.join(effectivePath, 'runners', 'spec_runner.py'))) {
      return effectivePath;
    }

    return null;
  }

  /**
   * Load environment variables from auto-claude .env file
   */
  loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) return {};

    const envPath = path.join(autoBuildSource, '.env');
    if (!existsSync(envPath)) return {};

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Get complete environment for process execution
   * Includes system env, auto-claude env, and active Claude profile
   */
  async getProcessEnv(): Promise<Record<string, string>> {
    const autoBuildEnv = this.loadAutoBuildEnv();
    const profileEnv = getProfileEnv();
    const apiProfileEnv = await getAPIProfileEnv();
    const oauthModeClearVars = getOAuthModeClearVars(apiProfileEnv);
    const pythonEnv = pythonEnvManager.getPythonEnv();
    const autoBuildSource = this.getAutoBuildSourcePath();
    const pythonPathParts = (pythonEnv.PYTHONPATH ?? '')
      .split(path.delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.resolve(entry));

    if (autoBuildSource) {
      const normalizedAutoBuildSource = path.resolve(autoBuildSource);
      const autoBuildComparator = process.platform === 'win32'
        ? normalizedAutoBuildSource.toLowerCase()
        : normalizedAutoBuildSource;
      const hasAutoBuildSource = pythonPathParts.some((entry) => {
        const candidate = process.platform === 'win32' ? entry.toLowerCase() : entry;
        return candidate === autoBuildComparator;
      });

      if (!hasAutoBuildSource) {
        pythonPathParts.push(normalizedAutoBuildSource);
      }
    }

    const combinedPythonPath = pythonPathParts.join(path.delimiter);

    // Use getAugmentedEnv() to ensure common tool paths (claude, dotnet, etc.)
    // are available even when app is launched from Finder/Dock.
    const augmentedEnv = getAugmentedEnv();

    // On Windows, detect and pass git-bash path for Claude Code CLI
    // Claude Code on Windows requires git-bash for proper shell operations
    const gitBashEnv: Record<string, string> = {};
    if (process.platform === 'win32' && !process.env.CLAUDE_CODE_GIT_BASH_PATH) {
      try {
        const gitInfo = getToolInfo('git');
        if (gitInfo.found && gitInfo.path) {
          const bashPath = deriveGitBashPath(gitInfo.path);
          if (bashPath) {
            gitBashEnv['CLAUDE_CODE_GIT_BASH_PATH'] = bashPath;
            console.log('[InsightsConfig] Setting CLAUDE_CODE_GIT_BASH_PATH:', bashPath);
          }
        }
      } catch (error) {
        console.warn('[InsightsConfig] Failed to detect git-bash path:', error);
      }
    }

    return {
      ...augmentedEnv,
      ...gitBashEnv,
      ...pythonEnv, // Include PYTHONPATH for bundled site-packages
      ...autoBuildEnv,
      ...oauthModeClearVars,
      ...profileEnv,
      ...apiProfileEnv,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      ...(combinedPythonPath ? { PYTHONPATH: combinedPythonPath } : {})
    };
  }
}
