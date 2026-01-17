import { spawn, execSync, ChildProcess } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
import { EventEmitter } from 'events';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { app } from 'electron';
import { findPythonCommand, getBundledPythonPath } from './python-detector';
import { isLinux, isWindows } from './platform';
import { getVenvPythonPath as getVenvPythonPathUtil } from './python-path-utils';

export interface PythonEnvStatus {
  ready: boolean;
  pythonPath: string | null;
  sitePackagesPath: string | null;
  venvExists: boolean;
  depsInstalled: boolean;
  usingBundledPackages: boolean;
  error?: string;
}

/**
 * Manages the Python environment for the auto-claude backend.
 *
 * For packaged apps:
 *   - Uses bundled Python binary (resources/python/)
 *   - Uses bundled site-packages (resources/python-site-packages/)
 *   - No venv creation or pip install needed - everything is pre-bundled
 *
 * For development mode:
 *   - Creates venv in the source directory
 *   - Installs dependencies via pip
 *
 * On packaged apps (especially Linux AppImages), the bundled source is read-only,
 * so for dev mode fallback we create the venv in userData instead.
 */
export class PythonEnvManager extends EventEmitter {
  private autoBuildSourcePath: string | null = null;
  private pythonPath: string | null = null;
  private sitePackagesPath: string | null = null;
  private usingBundledPackages = false;
  private isInitializing = false;
  private isReady = false;
  private initializationPromise: Promise<PythonEnvStatus> | null = null;
  private activeProcesses: Set<ChildProcess> = new Set();
  private static readonly VENV_CREATION_TIMEOUT_MS = 120000; // 2 minutes timeout for venv creation

  /**
   * Get the path where the venv should be created.
   * For packaged apps, this is in userData to avoid read-only filesystem issues.
   * For development, this is inside the source directory.
   */
  private getVenvBasePath(): string | null {
    if (!this.autoBuildSourcePath) return null;

    // For packaged apps, put venv in userData (writable location)
    // This fixes Linux AppImage where resources are read-only
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'python-venv');
    }

    // Development mode - use source directory
    return path.join(this.autoBuildSourcePath, '.venv');
  }

  /**
   * Get the path to the venv Python executable
   */
  private getVenvPythonPath(): string | null {
    const venvPath = this.getVenvBasePath();
    if (!venvPath) return null;

    return getVenvPythonPathUtil(venvPath);
  }

  /**
   * Get the path to pip in the venv
   * Returns null - we use python -m pip instead for better compatibility
   * @deprecated Use getVenvPythonPath() with -m pip instead
   */
  private getVenvPipPath(): string | null {
    return null; // Not used - we use python -m pip
  }

  /**
   * Check if venv exists
   */
  private venvExists(): boolean {
    const venvPython = this.getVenvPythonPath();
    return venvPython ? existsSync(venvPython) : false;
  }

  /**
   * Get the path to bundled site-packages (for packaged apps).
   * These are pre-installed during the build process.
   */
  private getBundledSitePackagesPath(): string | null {
    if (!app.isPackaged) {
      return null;
    }

    const sitePackagesPath = path.join(process.resourcesPath, 'python-site-packages');

    if (existsSync(sitePackagesPath)) {
      console.warn(`[PythonEnvManager] Found bundled site-packages at: ${sitePackagesPath}`);
      return sitePackagesPath;
    }

    console.warn(`[PythonEnvManager] Bundled site-packages not found at: ${sitePackagesPath}`);
    return null;
  }

  /**
   * Check if bundled packages are available and valid.
   * For packaged apps, we check if the bundled site-packages directory exists
   * and contains the marker file indicating successful bundling.
   */
  private hasBundledPackages(): boolean {
    const sitePackagesPath = this.getBundledSitePackagesPath();
    if (!sitePackagesPath) {
      return false;
    }

    // Critical packages that must exist for proper functionality
    // This fixes GitHub issue #416 where marker exists but packages are missing
    // Note: Same list exists in download-python.cjs - keep them in sync
    // This validation assumes traditional Python packages with __init__.py (not PEP 420 namespace packages)
    // pywin32 is platform-critical for Windows (ACS-306) - required by MCP library
    const platformCriticalPackages: Record<string, string[]> = {
      win32: ['pywintypes'] // Check for 'pywintypes' instead of 'pywin32' (pywin32 installs top-level modules)
    };
    // secretstorage is optional for Linux (ACS-310) - nice to have for keyring integration
    // but app falls back to .env file storage if missing, so don't block bundled packages
    const platformOptionalPackages: Record<string, string[]> = {
      linux: ['secretstorage'] // Linux OAuth token storage via Freedesktop.org Secret Service
    };

    const criticalPackages = [
      'claude_agent_sdk',
      'dotenv',
      'pydantic_core',
      ...(isWindows() ? platformCriticalPackages.win32 : [])
    ];
    const optionalPackages = isLinux() ? platformOptionalPackages.linux : [];

    // Check each package exists with valid structure (directory + __init__.py or single-file module)
    const packageExists = (pkg: string): boolean => {
      const pkgPath = path.join(sitePackagesPath, pkg);
      const initPath = path.join(pkgPath, '__init__.py');
      // For single-file modules (like pywintypes.py), check for the file directly
      const moduleFile = path.join(sitePackagesPath, `${pkg}.py`);
      // Package is valid if directory+__init__.py exists OR single-file module exists
      return (existsSync(pkgPath) && existsSync(initPath)) || existsSync(moduleFile);
    };

    const missingPackages = criticalPackages.filter((pkg) => !packageExists(pkg));
    const missingOptional = optionalPackages.filter((pkg) => !packageExists(pkg));

    // Log missing packages for debugging
    for (const pkg of missingPackages) {
      console.warn(
        `[PythonEnvManager] Missing critical package: ${pkg} at ${path.join(sitePackagesPath, pkg)}`
      );
    }
    // Log warnings for missing optional packages (non-blocking)
    for (const pkg of missingOptional) {
      console.warn(
        `[PythonEnvManager] Optional package missing: ${pkg} at ${path.join(sitePackagesPath, pkg)}`
      );
    }

    // All critical packages must exist - don't rely solely on marker file
    if (missingPackages.length === 0) {
      // Also check marker for logging purposes
      const markerPath = path.join(sitePackagesPath, '.bundled');
      if (existsSync(markerPath)) {
        console.warn(`[PythonEnvManager] Found bundle marker and all critical packages`);
      } else {
        console.warn(`[PythonEnvManager] Found critical packages (marker missing)`);
      }
      return true;
    }

    return false;
  }

  /**
   * Check if required dependencies are installed.
   * Verifies all packages that must be present for the backend to work.
   * This ensures users don't encounter broken functionality when using features.
   */
  private async checkDepsInstalled(): Promise<boolean> {
    const venvPython = this.getVenvPythonPath();
    if (!venvPython || !existsSync(venvPython)) return false;

    try {
      // Check all dependencies - if any fail, we need to reinstall
      // This prevents issues where partial installs leave some packages missing
      // See: https://github.com/AndyMik90/Auto-Claude/issues/359
      //
      // Dependencies checked:
      // - claude_agent_sdk: Core agent SDK (required)
      // - dotenv: Environment variable loading (required)
      // - google.generativeai: Google AI/Gemini support (required for full functionality)
      // - real_ladybug + graphiti_core: Graphiti memory system (Python 3.12+ only)
      const checkScript = `
import sys
import claude_agent_sdk
import dotenv
import google.generativeai
# Graphiti dependencies only available on Python 3.12+
if sys.version_info >= (3, 12):
    import real_ladybug
    import graphiti_core
`;
      execSync(`"${venvPython}" -c "${checkScript.replace(/\n/g, '; ').replace(/; ; /g, '; ')}"`, {
        stdio: 'pipe',
        timeout: 15000
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find Python 3.10+ (bundled or system).
   * Uses the shared python-detector logic which validates version requirements.
   * Priority: bundled Python (packaged apps) > system Python
   */
  private findSystemPython(): string | null {
    const pythonCmd = findPythonCommand();
    if (!pythonCmd) {
      return null;
    }

    // If this is the bundled Python path, use it directly
    const bundledPath = getBundledPythonPath();
    if (bundledPath && pythonCmd === bundledPath) {
      console.warn(`[PythonEnvManager] Using bundled Python: ${bundledPath}`);
      return bundledPath;
    }

    try {
      // Get the actual executable path from the command
      // For commands like "py -3", we need to resolve to the actual executable
      const pythonPath = execSync(`${pythonCmd} -c "import sys; print(sys.executable)"`, {
        stdio: 'pipe',
        timeout: 5000
      }).toString().trim();

      console.warn(`[PythonEnvManager] Found Python at: ${pythonPath}`);
      return pythonPath;
    } catch (err) {
      console.error(`[PythonEnvManager] Failed to get Python path for ${pythonCmd}:`, err);
      return null;
    }
  }

  /**
   * Create the virtual environment
   */
  private async createVenv(): Promise<boolean> {
    if (!this.autoBuildSourcePath) return false;

    const systemPython = this.findSystemPython();
    if (!systemPython) {
      const isPackaged = app.isPackaged;
      const errorMsg = isPackaged
        ? 'Python not found. The bundled Python may be corrupted.\n\n' +
          'Please try reinstalling the application, or install Python 3.10+ manually:\n' +
          'https://www.python.org/downloads/'
        : 'Python 3.10+ not found. Please install Python 3.10 or higher.\n\n' +
          'This is required for development mode. Download from:\n' +
          'https://www.python.org/downloads/';
      this.emit('error', errorMsg);
      return false;
    }

    this.emit('status', 'Creating Python virtual environment...');
    const venvPath = this.getVenvBasePath()!;
    console.warn('[PythonEnvManager] Creating venv at:', venvPath, 'with:', systemPython);

    return new Promise((resolve) => {
      const proc = spawn(systemPython, ['-m', 'venv', venvPath], {
        cwd: this.autoBuildSourcePath!,
        stdio: 'pipe',
        ...(process.platform === 'win32' && { windowsHide: true })
      });

      // Track the process for cleanup on app exit
      this.activeProcesses.add(proc);

      let stderr = '';
      let resolved = false;

      // Set up timeout to kill hung venv creation
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error('[PythonEnvManager] Venv creation timed out after', PythonEnvManager.VENV_CREATION_TIMEOUT_MS, 'ms');
          this.emit('error', 'Virtual environment creation timed out. This may indicate a system issue.');
          try {
            proc.kill();
          } catch {
            // Process may already be dead
          }
          this.activeProcesses.delete(proc);
          resolve(false);
        }
      }, PythonEnvManager.VENV_CREATION_TIMEOUT_MS);

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (resolved) return; // Already handled by timeout
        resolved = true;
        clearTimeout(timeoutId);
        this.activeProcesses.delete(proc);

        if (code === 0) {
          console.warn('[PythonEnvManager] Venv created successfully');
          resolve(true);
        } else {
          console.error('[PythonEnvManager] Failed to create venv:', stderr);
          this.emit('error', `Failed to create virtual environment: ${stderr}`);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        if (resolved) return; // Already handled by timeout
        resolved = true;
        clearTimeout(timeoutId);
        this.activeProcesses.delete(proc);

        console.error('[PythonEnvManager] Error creating venv:', err);
        this.emit('error', `Failed to create virtual environment: ${err.message}`);
        resolve(false);
      });
    });
  }

  /**
   * Bootstrap pip in the venv using ensurepip
   */
  private async bootstrapPip(): Promise<boolean> {
    const venvPython = this.getVenvPythonPath();
    if (!venvPython || !existsSync(venvPython)) {
      return false;
    }

    console.warn('[PythonEnvManager] Bootstrapping pip...');
    return new Promise((resolve) => {
      const proc = spawn(venvPython, ['-m', 'ensurepip'], {
        cwd: this.autoBuildSourcePath!,
        stdio: 'pipe',
        ...(process.platform === 'win32' && { windowsHide: true })
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.warn('[PythonEnvManager] Pip bootstrapped successfully');
          resolve(true);
        } else {
          console.error('[PythonEnvManager] Failed to bootstrap pip:', stderr);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        console.error('[PythonEnvManager] Error bootstrapping pip:', err);
        resolve(false);
      });
    });
  }

  /**
   * Install dependencies from requirements.txt using python -m pip
   */
  private async installDeps(): Promise<boolean> {
    if (!this.autoBuildSourcePath) return false;

    const venvPython = this.getVenvPythonPath();
    const requirementsPath = path.join(this.autoBuildSourcePath, 'requirements.txt');

    if (!venvPython || !existsSync(venvPython)) {
      this.emit('error', 'Python not found in virtual environment');
      return false;
    }

    if (!existsSync(requirementsPath)) {
      this.emit('error', 'requirements.txt not found');
      return false;
    }

    // Bootstrap pip first if needed
    await this.bootstrapPip();

    this.emit('status', 'Installing Python dependencies (this may take a minute)...');
    console.warn('[PythonEnvManager] Installing dependencies from:', requirementsPath);

    return new Promise((resolve) => {
      // Use python -m pip for better compatibility across Python versions
      const proc = spawn(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath], {
        cwd: this.autoBuildSourcePath!,
        stdio: 'pipe',
        ...(process.platform === 'win32' && { windowsHide: true })
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        // Emit progress updates for long-running installations
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.includes('Installing') || line.includes('Successfully')) {
            this.emit('status', line.trim());
          }
        }
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.warn('[PythonEnvManager] Dependencies installed successfully');
          this.emit('status', 'Dependencies installed successfully');
          resolve(true);
        } else {
          console.error('[PythonEnvManager] Failed to install deps:', stderr || stdout);
          this.emit('error', `Failed to install dependencies: ${stderr || stdout}`);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        console.error('[PythonEnvManager] Error installing deps:', err);
        this.emit('error', `Failed to install dependencies: ${err.message}`);
        resolve(false);
      });
    });
  }

  /**
   * Initialize the Python environment.
   *
   * For packaged apps: Uses bundled Python + site-packages (no pip install needed)
   * For development: Creates venv and installs deps if needed.
   *
   * If initialization is already in progress, this will wait for and return
   * the existing initialization promise instead of starting a new one.
   */
  async initialize(autoBuildSourcePath: string): Promise<PythonEnvStatus> {
    // If there's already an initialization in progress, wait for it
    if (this.initializationPromise) {
      console.warn('[PythonEnvManager] Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    // If already ready and pointing to the same source, return cached status
    if (this.isReady && this.autoBuildSourcePath === autoBuildSourcePath) {
      return {
        ready: true,
        pythonPath: this.pythonPath,
        sitePackagesPath: this.sitePackagesPath,
        venvExists: true,
        depsInstalled: true,
        usingBundledPackages: this.usingBundledPackages
      };
    }

    // Start new initialization and store the promise
    this.initializationPromise = this._doInitialize(autoBuildSourcePath);

    try {
      return await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization method that performs the actual setup.
   * This is separated from initialize() to support the promise queue pattern.
   */
  private async _doInitialize(autoBuildSourcePath: string): Promise<PythonEnvStatus> {
    this.isInitializing = true;
    this.autoBuildSourcePath = autoBuildSourcePath;

    console.warn('[PythonEnvManager] Initializing with path:', autoBuildSourcePath);

    try {
      // For packaged apps, try to use bundled packages first (no pip install needed!)
      if (app.isPackaged && this.hasBundledPackages()) {
        console.warn('[PythonEnvManager] Using bundled Python packages (no pip install needed)');

        const bundledPython = getBundledPythonPath();
        const bundledSitePackages = this.getBundledSitePackagesPath();

        if (bundledPython && bundledSitePackages) {
          this.pythonPath = bundledPython;
          this.sitePackagesPath = bundledSitePackages;
          this.usingBundledPackages = true;
          this.isReady = true;
          this.isInitializing = false;

          this.emit('ready', this.pythonPath);
          console.warn('[PythonEnvManager] Ready with bundled Python:', this.pythonPath);
          console.warn('[PythonEnvManager] Using bundled site-packages:', this.sitePackagesPath);

          return {
            ready: true,
            pythonPath: this.pythonPath,
            sitePackagesPath: this.sitePackagesPath,
            venvExists: false, // Not using venv
            depsInstalled: true,
            usingBundledPackages: true
          };
        }
      }

      // Fallback to venv-based setup (for development or if bundled packages missing)
      console.warn('[PythonEnvManager] Using venv-based setup (development mode or bundled packages missing)');
      this.usingBundledPackages = false;

      // Check if venv exists
      if (!this.venvExists()) {
        console.warn('[PythonEnvManager] Venv not found, creating...');
        const created = await this.createVenv();
        if (!created) {
          this.isInitializing = false;
          return {
            ready: false,
            pythonPath: null,
            sitePackagesPath: null,
            venvExists: false,
            depsInstalled: false,
            usingBundledPackages: false,
            error: 'Failed to create virtual environment'
          };
        }
      } else {
        console.warn('[PythonEnvManager] Venv already exists');
      }

      // Check if deps are installed
      const depsInstalled = await this.checkDepsInstalled();
      if (!depsInstalled) {
        console.warn('[PythonEnvManager] Dependencies not installed, installing...');
        const installed = await this.installDeps();
        if (!installed) {
          this.isInitializing = false;
          return {
            ready: false,
            pythonPath: this.getVenvPythonPath(),
            sitePackagesPath: null,
            venvExists: true,
            depsInstalled: false,
            usingBundledPackages: false,
            error: 'Failed to install dependencies'
          };
        }
      } else {
        console.warn('[PythonEnvManager] Dependencies already installed');
      }

      this.pythonPath = this.getVenvPythonPath();
      // For venv, site-packages is inside the venv
      const venvBase = this.getVenvBasePath();
      if (venvBase) {
        if (isWindows()) {
          // Windows venv structure: Lib/site-packages (no python version subfolder)
          this.sitePackagesPath = path.join(venvBase, 'Lib', 'site-packages');
        } else {
          // Unix venv structure: lib/python3.x/site-packages
          // Dynamically detect Python version from venv lib directory
          const libDir = path.join(venvBase, 'lib');
          let pythonVersion = 'python3.12'; // Fallback to bundled version

          if (existsSync(libDir)) {
            try {
              const entries = readdirSync(libDir);
              const pythonDir = entries.find(e => e.startsWith('python3.'));
              if (pythonDir) {
                pythonVersion = pythonDir;
              }
            } catch {
              // Use fallback version
            }
          }

          this.sitePackagesPath = path.join(venvBase, 'lib', pythonVersion, 'site-packages');
        }
      }

      this.isReady = true;
      this.isInitializing = false;

      this.emit('ready', this.pythonPath);
      console.warn('[PythonEnvManager] Ready with Python path:', this.pythonPath);

      return {
        ready: true,
        pythonPath: this.pythonPath,
        sitePackagesPath: this.sitePackagesPath,
        venvExists: true,
        depsInstalled: true,
        usingBundledPackages: false
      };
    } catch (error) {
      this.isInitializing = false;
      const message = error instanceof Error ? error.message : String(error);
      return {
        ready: false,
        pythonPath: null,
        sitePackagesPath: null,
        venvExists: this.venvExists(),
        depsInstalled: false,
        usingBundledPackages: false,
        error: message
      };
    }
  }

  /**
   * Get the Python path (only valid after initialization)
   */
  getPythonPath(): string | null {
    return this.pythonPath;
  }

  /**
   * Get the site-packages path (only valid after initialization)
   */
  getSitePackagesPath(): string | null {
    return this.sitePackagesPath;
  }

  /**
   * Check if using bundled packages (vs venv)
   */
  isUsingBundledPackages(): boolean {
    return this.usingBundledPackages;
  }

  /**
   * Check if the environment is ready
   */
  isEnvReady(): boolean {
    return this.isReady;
  }

  /**
   * Get environment variables that should be set when spawning Python processes.
   * This ensures Python finds the bundled packages or venv packages.
   *
   * IMPORTANT: This returns a COMPLETE environment (based on process.env) with
   * problematic Python variables removed. This fixes the "Could not find platform
   * independent libraries <prefix>" error on Windows when PYTHONHOME is set.
   *
   * @see https://github.com/AndyMik90/Auto-Claude/issues/176
   */
  getPythonEnv(): Record<string, string> {
    // Start with process.env but explicitly remove problematic Python variables
    // PYTHONHOME causes "Could not find platform independent libraries" when set
    // to a different Python installation than the one we're spawning
    const baseEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      // Skip PYTHONHOME - it causes the "platform independent libraries" error
      // Use case-insensitive check for Windows compatibility (env vars are case-insensitive on Windows)
      // Skip undefined values (TypeScript type guard)
      if (key.toUpperCase() !== 'PYTHONHOME' && value !== undefined) {
        baseEnv[key] = value;
      }
    }

    // Apply our Python configuration on top
    return {
      ...baseEnv,
      // Don't write bytecode - not needed and avoids permission issues
      PYTHONDONTWRITEBYTECODE: '1',
      // Use UTF-8 encoding
      PYTHONIOENCODING: 'utf-8',
      // Disable user site-packages to avoid conflicts
      PYTHONNOUSERSITE: '1',
      // Override PYTHONPATH if we have bundled packages
      ...(this.sitePackagesPath ? { PYTHONPATH: this.sitePackagesPath } : {}),
    };
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<PythonEnvStatus> {
    // If using bundled packages, we're always ready
    if (this.usingBundledPackages && this.pythonPath && this.sitePackagesPath) {
      return {
        ready: true,
        pythonPath: this.pythonPath,
        sitePackagesPath: this.sitePackagesPath,
        venvExists: false,
        depsInstalled: true,
        usingBundledPackages: true
      };
    }

    const venvExists = this.venvExists();
    const depsInstalled = venvExists ? await this.checkDepsInstalled() : false;

    return {
      ready: this.isReady,
      pythonPath: this.pythonPath,
      sitePackagesPath: this.sitePackagesPath,
      venvExists,
      depsInstalled,
      usingBundledPackages: this.usingBundledPackages
    };
  }

  /**
   * Clean up any active processes on app exit.
   * Should be called when the application is about to quit.
   */
  cleanup(): void {
    if (this.activeProcesses.size > 0) {
      console.warn('[PythonEnvManager] Cleaning up', this.activeProcesses.size, 'active process(es)');
      for (const proc of this.activeProcesses) {
        try {
          proc.kill();
        } catch {
          // Process may already be dead
        }
      }
      this.activeProcesses.clear();
    }
  }
}

// Singleton instance
export const pythonEnvManager = new PythonEnvManager();

// Register cleanup on app exit (guard for test environments where app.on may not exist)
if (typeof app?.on === 'function') {
  app.on('will-quit', () => {
    pythonEnvManager.cleanup();
  });
}

/**
 * Get the configured venv Python path if ready, otherwise fall back to system Python.
 * This should be used by ALL services that need to spawn Python processes.
 *
 * Priority:
 * 1. If venv is ready -> return venv Python (has all dependencies installed)
 * 2. Fall back to findPythonCommand() -> bundled or system Python
 *
 * Note: For scripts that require dependencies (dotenv, claude-agent-sdk, etc.),
 * the venv Python MUST be used. Only use this fallback for scripts that
 * don't have external dependencies (like ollama_model_detector.py).
 */
export function getConfiguredPythonPath(): string {
  // If venv is ready, always prefer it (has dependencies installed)
  if (pythonEnvManager.isEnvReady()) {
    const venvPath = pythonEnvManager.getPythonPath();
    if (venvPath) {
      return venvPath;
    }
  }

  // Fall back to system/bundled Python
  return findPythonCommand() || 'python';
}

/**
 * Get requirements.txt path (bundled in packaged app, or dev mode)
 */
function getRequirementsTxtPath(): string | null {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'backend', 'requirements.txt');
    if (existsSync(bundled)) return bundled;
  }
  const dev = path.join(__dirname, '..', '..', '..', 'backend', 'requirements.txt');
  if (existsSync(dev)) return dev;
  return null;
}

/**
 * Build shell command that activates conda then runs Python
 */
function buildPythonCommandWithActivation(
  pythonPath: string,
  activationScript?: string
): string {
  if (!activationScript || !existsSync(activationScript)) {
    return pythonPath;
  }

  if (process.platform === 'win32') {
    // Check if it's a PowerShell script (.ps1)
    if (activationScript.toLowerCase().endsWith('.ps1')) {
      // PowerShell: & "script.ps1"; python
      return `powershell -NoProfile -Command "& '${activationScript}'; & '${pythonPath}'"`;
    } else {
      // Batch file: call activate.bat && python
      return `call "${activationScript}" && "${pythonPath}"`;
    }
  } else {
    return `source "${activationScript}" && "${pythonPath}"`;
  }
}

/**
 * Parse requirements.txt and extract package names
 * Filters out packages that have platform-specific markers that don't match the current platform
 */
function parseRequirementsTxt(requirementsPath: string): string[] {
  const content = readFileSync(requirementsPath, 'utf-8');
  const packages: string[] = [];
  const currentPlatform = process.platform; // 'win32', 'linux', 'darwin'

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip packages with environment markers that won't be installed
    // For example: tomli>=2.0.0; python_version < "3.11" won't be installed on Python 3.12
    if (trimmed.includes('python_version < "3.11"') || trimmed.includes("python_version < '3.11'")) {
      continue; // Skip packages only for Python < 3.11
    }

    // Skip packages with platform markers that don't match current platform
    // secretstorage>=3.3.3; sys_platform == "linux" should be skipped on Windows
    if (trimmed.includes('sys_platform')) {
      // Check for Linux-only packages on non-Linux
      if (trimmed.includes('sys_platform == "linux"') || trimmed.includes("sys_platform == 'linux'")) {
        if (currentPlatform !== 'linux') {
          continue; // Skip Linux-only packages on Windows/macOS
        }
      }
      // Check for Windows-only packages on non-Windows
      if (trimmed.includes('sys_platform == "win32"') || trimmed.includes("sys_platform == 'win32'")) {
        if (currentPlatform !== 'win32') {
          continue; // Skip Windows-only packages on Linux/macOS
        }
      }
      // Check for macOS-only packages on non-macOS
      if (trimmed.includes('sys_platform == "darwin"') || trimmed.includes("sys_platform == 'darwin'")) {
        if (currentPlatform !== 'darwin') {
          continue; // Skip macOS-only packages on Windows/Linux
        }
      }
    }

    // Extract package name (before version specifier or semicolon)
    const match = trimmed.match(/^([a-zA-Z0-9._-]+)/);
    if (match) {
      packages.push(match[1]);
    }
  }

  return packages;
}

/**
 * Get Python installation location (where packages will be installed)
 */
export async function getPythonInstallLocation(
  pythonPath: string,
  activationScript?: string
): Promise<string> {
  // Use Python directly without activation for location detection
  const pythonCmd = pythonPath;

  try {
    const { stdout, stderr } = await execAsync(`"${pythonCmd}" -c "import sys; print(sys.prefix)"`, {
      timeout: 5000
    });
    return (stdout || stderr).trim();
  } catch (error) {
    throw new Error(`Failed to get Python installation location: ${error}`);
  }
}

/**
 * Validate if Python packages are installed
 * Uses pip list to check all packages from requirements.txt efficiently
 */
export async function validatePythonPackages(
  pythonPath: string,
  activationScript?: string,
  onProgress?: (current: number, total: number, packageName: string) => void
): Promise<{ allInstalled: boolean; missingPackages: string[]; installLocation: string }> {
  const requirementsPath = getRequirementsTxtPath();
  if (!requirementsPath) {
    throw new Error('requirements.txt not found');
  }

  // For validation/installation, use the Python executable directly
  // without activation script. If pointing to a conda env's python.exe,
  // it already knows its packages. Activation scripts are only needed
  // for interactive terminals.
  const pythonCmd = pythonPath;

  // Get installation location
  let installLocation = '';
  try {
    installLocation = await getPythonInstallLocation(pythonPath, activationScript);
    console.warn('[validatePythonPackages] Install location:', installLocation);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[validatePythonPackages] Failed to get install location:', errorMsg);
    installLocation = `Unknown location (${errorMsg})`;
  }

  // Get list of installed packages
  onProgress?.(1, 2, 'Getting installed packages');
  let installedPackages: Set<string>;
  try {
    const { stdout } = await execAsync(`"${pythonCmd}" -m pip list --format=freeze`, {
      timeout: 30000
    });
    const pipList = stdout;

    // Parse pip list output (format: package-name==version)
    installedPackages = new Set(
      pipList
        .split('\n')
        .map(line => line.split('==')[0].toLowerCase().trim())
        .filter(Boolean)
    );
  } catch (error) {
    throw new Error(`Failed to get installed packages: ${error}`);
  }

  // Parse requirements.txt to get required packages
  onProgress?.(2, 2, 'Checking requirements');
  const requiredPackages = parseRequirementsTxt(requirementsPath);
  const missingPackages: string[] = [];

  for (const pkg of requiredPackages) {
    const normalizedPkg = pkg.toLowerCase();
    if (!installedPackages.has(normalizedPkg)) {
      missingPackages.push(pkg);
    }
  }

  return {
    allInstalled: missingPackages.length === 0,
    missingPackages,
    installLocation
  };
}

/**
 * Install Python requirements from requirements.txt
 */
export async function installPythonRequirements(
  pythonPath: string,
  activationScript?: string,
  onProgress?: (message: string) => void
): Promise<void> {
  const requirementsPath = getRequirementsTxtPath();
  if (!requirementsPath) {
    throw new Error('requirements.txt not found');
  }

  onProgress?.('Installing Python dependencies...');

  return new Promise((resolve, reject) => {
    // Use Python directly without shell to avoid quote issues
    const proc = spawn(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath], {
      stdio: 'pipe'
    });

    proc.stdout?.on('data', (data) => onProgress?.(data.toString()));
    proc.stderr?.on('data', (data) => onProgress?.(data.toString()));

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.('Installation complete');
        resolve();
      } else {
        reject(new Error(`pip install failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Validate Python environment (version, existence)
 */
export async function validatePythonEnvironment(
  activationScript: string
): Promise<{
  valid: boolean;
  pythonPath: string | null;
  version: string | null;
  error: string | null;
  status: 'valid' | 'missing' | 'wrong_version' | 'error';
}> {
  try {
    // Extract environment path from activation script
    const envPath = getEnvironmentPathFromScript(activationScript);
    if (!envPath) {
      return {
        valid: false,
        pythonPath: null,
        version: null,
        error: 'Could not extract environment path from activation script',
        status: 'error'
      };
    }

    // Determine Python executable name based on platform
    const pythonExeName = process.platform === 'win32' ? 'python.exe' : 'python';
    const pythonPath = path.join(envPath, process.platform === 'win32' ? '' : 'bin', pythonExeName);

    // Check if Python executable exists
    if (!existsSync(pythonPath)) {
      return {
        valid: false,
        pythonPath,
        version: null,
        error: `Python executable not found: ${pythonPath}`,
        status: 'missing'
      };
    }

    // Get Python version (async to avoid blocking)
    try {
      const { stdout, stderr } = await execAsync(`"${pythonPath}" --version`, {
        timeout: 5000
      });
      const versionOutput = (stdout || stderr).trim();

      // Parse version "Python 3.12.1" -> (3, 12)
      const versionMatch = versionOutput.match(/Python (\d+)\.(\d+)/);
      if (!versionMatch) {
        return {
          valid: false,
          pythonPath,
          version: versionOutput,
          error: 'Could not parse Python version',
          status: 'error'
        };
      }

      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);

      // Check version requirement (3.12+)
      if (major < 3 || (major === 3 && minor < 12)) {
        return {
          valid: false,
          pythonPath,
          version: versionOutput,
          error: `Python version ${versionOutput} is below required 3.12`,
          status: 'wrong_version'
        };
      }

      // All checks passed
      return {
        valid: true,
        pythonPath,
        version: versionOutput,
        error: null,
        status: 'valid'
      };
    } catch (error) {
      return {
        valid: false,
        pythonPath,
        version: null,
        error: `Failed to get Python version: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error'
      };
    }
  } catch (error) {
    return {
      valid: false,
      pythonPath: null,
      version: null,
      error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error'
    };
  }
}

/**
 * Reinstall Python environment by nuking and recreating with conda
 */
export async function reinstallPythonEnvironment(
  environmentPath: string,
  pythonVersion: string = '3.12',
  onProgress?: (step: string, completed: number, total: number) => void
): Promise<{
  success: boolean;
  environmentPath: string | null;
  pythonVersion: string | null;
  error: string | null;
  stepsCompleted: string[];
}> {
  const stepsCompleted: string[] = [];

  try {
    // Step 1: Remove existing environment
    onProgress?.('Removing existing environment', 0, 3);
    if (existsSync(environmentPath)) {
      try {
        const fs = await import('fs/promises');
        await fs.rm(environmentPath, { recursive: true, force: true });
        stepsCompleted.push(`Removed existing environment: ${environmentPath}`);
      } catch (error) {
        return {
          success: false,
          environmentPath,
          pythonVersion: null,
          error: `Failed to remove existing environment: ${error instanceof Error ? error.message : String(error)}`,
          stepsCompleted
        };
      }
    }

    // Step 2: Find conda executable (cross-platform)
    onProgress?.('Finding conda executable', 1, 3);

    let condaPaths: string[];
    if (process.platform === 'win32') {
      // Windows: look for conda.bat in common locations
      condaPaths = [
        path.join(process.env.USERPROFILE || '', 'miniconda3', 'condabin', 'conda.bat'),
        path.join(process.env.USERPROFILE || '', 'anaconda3', 'condabin', 'conda.bat'),
        path.join(process.env.LOCALAPPDATA || '', 'miniconda3', 'condabin', 'conda.bat'),
        path.join(process.env.LOCALAPPDATA || '', 'anaconda3', 'condabin', 'conda.bat'),
        process.env.CONDA_EXE || ''
      ];
    } else {
      // Linux/macOS: look for conda in common locations
      const homeDir = process.env.HOME || '';
      condaPaths = [
        path.join(homeDir, 'miniconda3', 'bin', 'conda'),
        path.join(homeDir, 'anaconda3', 'bin', 'conda'),
        path.join('/opt', 'miniconda3', 'bin', 'conda'),
        path.join('/opt', 'anaconda3', 'bin', 'conda'),
        path.join('/usr', 'local', 'miniconda3', 'bin', 'conda'),
        path.join('/usr', 'local', 'anaconda3', 'bin', 'conda'),
        process.env.CONDA_EXE || ''
      ];
    }

    let condaExe: string | null = null;
    for (const condaPath of condaPaths) {
      if (condaPath && existsSync(condaPath)) {
        condaExe = condaPath;
        break;
      }
    }

    // If not found in specific paths, try PATH
    if (!condaExe) {
      try {
        const { stdout } = await execAsync(process.platform === 'win32' ? 'where conda' : 'which conda', {
          timeout: 5000
        });
        const foundPath = stdout.trim().split('\n')[0];
        if (foundPath && existsSync(foundPath)) {
          condaExe = foundPath;
        }
      } catch (error) {
        // conda not in PATH
      }
    }

    if (!condaExe) {
      return {
        success: false,
        environmentPath,
        pythonVersion: null,
        error: 'Could not find conda executable. Please ensure conda is installed and in PATH.',
        stepsCompleted
      };
    }

    stepsCompleted.push(`Found conda: ${condaExe}`);

    // Step 3: Create new conda environment (async via spawn)
    onProgress?.('Creating new conda environment', 2, 3);
    return new Promise((resolve) => {
      const proc = spawn(condaExe!, [
        'create',
        '-p',
        environmentPath,
        `python=${pythonVersion}`,
        '-y'
      ], {
        stdio: 'pipe',
        shell: true  // Required for .bat/.cmd files on Windows
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            environmentPath,
            pythonVersion: null,
            error: `Conda create failed with code ${code}: ${stderr}`,
            stepsCompleted
          });
          return;
        }

        stepsCompleted.push(`Created conda environment with Python ${pythonVersion}`);

        // Step 4: Verify Python installation (cross-platform)
        const pythonExeName = process.platform === 'win32' ? 'python.exe' : 'python';
        const pythonExe = path.join(environmentPath, process.platform === 'win32' ? '' : 'bin', pythonExeName);
        if (!existsSync(pythonExe)) {
          resolve({
            success: false,
            environmentPath,
            pythonVersion: null,
            error: `Python executable not found after installation: ${pythonExe}`,
            stepsCompleted
          });
          return;
        }

        // Get installed Python version
        try {
          const { stdout, stderr } = await execAsync(`"${pythonExe}" --version`, {
            timeout: 5000
          });
          const installedVersion = (stdout || stderr).trim();
          stepsCompleted.push(`Verified Python installation: ${installedVersion}`);

          resolve({
            success: true,
            environmentPath,
            pythonVersion: installedVersion,
            error: null,
            stepsCompleted
          });
        } catch (error) {
          resolve({
            success: false,
            environmentPath,
            pythonVersion: null,
            error: `Failed to verify Python installation: ${error instanceof Error ? error.message : String(error)}`,
            stepsCompleted
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          environmentPath,
          pythonVersion: null,
          error: `Failed to start conda: ${error.message}`,
          stepsCompleted
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      environmentPath,
      pythonVersion: null,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      stepsCompleted
    };
  }
}

/**
 * Expand environment variables in a path (cross-platform)
 * Handles both Windows (%VAR%) and Unix ($VAR or ${VAR}) syntax
 */
function expandEnvironmentVariables(pathStr: string): string {
  // Windows: Replace %VARIABLE% with the actual environment variable value
  let expanded = pathStr.replace(/%([^%]+)%/g, (_, varName) => {
    return process.env[varName] || `%${varName}%`;
  });

  // Unix: Replace $VARIABLE or ${VARIABLE} with the actual environment variable value
  expanded = expanded.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || `\${${varName}}`;
  });

  expanded = expanded.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, varName) => {
    return process.env[varName] || `$${varName}`;
  });

  return expanded;
}

/**
 * Extract environment path from activation script (cross-platform)
 * Supports both Windows (.bat/.cmd) and Unix (.sh) activation scripts
 */
export function getEnvironmentPathFromScript(activationScript: string): string | null {
  try {
    if (!existsSync(activationScript)) {
      return null;
    }

    const scriptContent = readFileSync(activationScript, 'utf-8');

    // Detect script type
    const isWindowsScript = activationScript.endsWith('.bat') || activationScript.endsWith('.cmd') || activationScript.endsWith('.ps1');
    const isPowerShellScript = activationScript.endsWith('.ps1');

    for (const line of scriptContent.split('\n')) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine) {
        continue;
      }

      // Skip Windows batch comments (:: or REM)
      if (isWindowsScript && !isPowerShellScript && (trimmedLine.startsWith('::') || trimmedLine.startsWith('REM'))) {
        continue;
      }

      // Skip Unix and PowerShell comments (#)
      if ((!isWindowsScript || isPowerShellScript) && trimmedLine.startsWith('#')) {
        continue;
      }

      // Pattern 1: conda activate <path> (works on all platforms)
      if (trimmedLine.includes('conda activate')) {
        const match = trimmedLine.match(/conda\s+activate\s+(.+)/i);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 2 (Windows): call "path\to\activate.bat" <env_path>
      if (isWindowsScript && trimmedLine.includes('activate.bat')) {
        const match = trimmedLine.match(/activate\.bat["']?\s+(.+)/i);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 3 (Unix): source activate <path> or . activate <path>
      if (!isWindowsScript && (trimmedLine.includes('source activate') || /^\.\s+activate/.test(trimmedLine))) {
        const match = trimmedLine.match(/(?:source|\.)\s+activate\s+(.+)/i);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 4 (Windows): SET CONDA_PREFIX=<path>
      if (isWindowsScript && (trimmedLine.startsWith('SET CONDA_PREFIX=') || trimmedLine.startsWith('set CONDA_PREFIX='))) {
        const match = trimmedLine.match(/SET\s+CONDA_PREFIX=(.+)/i);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 5 (Unix): export CONDA_PREFIX=<path> or CONDA_PREFIX=<path>
      if (!isWindowsScript && trimmedLine.includes('CONDA_PREFIX=')) {
        const match = trimmedLine.match(/(?:export\s+)?CONDA_PREFIX=(.+)/);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 6 (PowerShell): $env:CONDA_PREFIX = "<path>"
      if (isPowerShellScript && trimmedLine.includes('$env:CONDA_PREFIX')) {
        const match = trimmedLine.match(/\$env:CONDA_PREFIX\s*=\s*(.+)/i);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 7 (PowerShell): & conda.exe activate "<path>" or & "<path>\conda.exe" activate "<env>"
      if (isPowerShellScript && trimmedLine.includes('conda') && trimmedLine.includes('activate')) {
        // Match: & "path\conda.exe" activate "envpath"
        const match = trimmedLine.match(/&\s*["']?[^"']*conda(?:\.exe)?["']?\s+activate\s+["']?([^"']+)["']?/i);
        if (match) {
          let envPath = match[1].trim().replace(/['"]/g, '').replace(/\s+$/, '');
          if (envPath) {
            envPath = expandEnvironmentVariables(envPath);
            return envPath;
          }
        }
      }

      // Pattern 8: Extract path from script location (if script is in envs\<name>\Scripts\)
      // This handles cases where the script itself indicates the environment location
      if (isPowerShellScript || isWindowsScript) {
        // Check if we can derive env path from the activation script path itself
        // e.g., C:\Users\Jason\miniconda3\envs\auto-claude\Scripts\auto-claude-init.ps1
        //       -> C:\Users\Jason\miniconda3\envs\auto-claude
        const scriptDir = path.dirname(activationScript);
        if (scriptDir.toLowerCase().endsWith('scripts')) {
          const potentialEnvPath = path.dirname(scriptDir);
          // Verify it looks like a conda env (has conda-meta folder or python.exe)
          const condaMetaPath = path.join(potentialEnvPath, 'conda-meta');
          const pythonPath = path.join(potentialEnvPath, 'python.exe');
          if (existsSync(condaMetaPath) || existsSync(pythonPath)) {
            return potentialEnvPath;
          }
        }
      }
    }

    // Fallback: Try to derive from script path for Windows conda environments
    if (isWindowsScript) {
      const scriptDir = path.dirname(activationScript);
      if (scriptDir.toLowerCase().endsWith('scripts')) {
        const potentialEnvPath = path.dirname(scriptDir);
        const condaMetaPath = path.join(potentialEnvPath, 'conda-meta');
        const pythonPath = path.join(potentialEnvPath, 'python.exe');
        if (existsSync(condaMetaPath) || existsSync(pythonPath)) {
          return potentialEnvPath;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}
