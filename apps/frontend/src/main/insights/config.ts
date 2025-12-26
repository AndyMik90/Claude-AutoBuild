import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { app } from 'electron';
import { getProfileEnv } from '../rate-limit-detector';
import { getConfiguredPythonPath } from '../python-env-manager';

/**
 * Configuration manager for insights service
 * Handles path detection and environment variable loading
 */
export class InsightsConfig {
  // Python path will be configured by pythonEnvManager after venv is ready
  // Use getter to always get current configured path
  private _pythonPath: string | null = null;
  private autoBuildSourcePath: string = '';

  /**
   * Configure paths for Python and auto-claude source
   */
  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      this._pythonPath = pythonPath;
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
   */
  getAutoBuildSourcePath(): string | null {
    if (this.autoBuildSourcePath && existsSync(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    const possiblePaths = [
      // Apps structure: from out/main -> apps/backend
      path.resolve(__dirname, '..', '..', '..', 'backend'),
      path.resolve(app.getAppPath(), '..', 'backend'),
      path.resolve(process.cwd(), 'apps', 'backend')
    ];

    for (const p of possiblePaths) {
      if (existsSync(p) && existsSync(path.join(p, 'runners', 'spec_runner.py'))) {
        return p;
      }
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
  getProcessEnv(): Record<string, string> {
    const autoBuildEnv = this.loadAutoBuildEnv();
    const profileEnv = getProfileEnv();

    return {
      ...process.env as Record<string, string>,
      ...autoBuildEnv,
      ...profileEnv,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    };
  }
}
