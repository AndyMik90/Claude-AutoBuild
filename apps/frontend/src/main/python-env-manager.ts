import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { app } from 'electron';
import { findPythonCommand, getBundledPythonPath } from './python-detector';

export interface PythonEnvStatus {
  ready: boolean;
  pythonPath: string | null;
  venvExists: boolean;
  depsInstalled: boolean;
  error?: string;
}

/**
 * Manages the Python virtual environment for the auto-claude backend.
 * Automatically creates venv and installs dependencies if needed.
 *
 * On packaged apps (especially Linux AppImages), the bundled source is read-only,
 * so we create the venv in userData instead of inside the source directory.
 */
export class PythonEnvManager extends EventEmitter {
  private autoBuildSourcePath: string | null = null;
  private pythonPath: string | null = null;
  private isInitializing = false;
  private isReady = false;
  private initializationPromise: Promise<PythonEnvStatus> | null = null;

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

    const venvPython =
      process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');

    return venvPython;
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
   * Check if claude-agent-sdk is installed
   */
  private async checkDepsInstalled(): Promise<boolean> {
    const venvPython = this.getVenvPythonPath();
    if (!venvPython || !existsSync(venvPython)) return false;

    try {
      // Check if claude_agent_sdk can be imported
      execSync(`"${venvPython}" -c "import claude_agent_sdk"`, {
        stdio: 'pipe',
        timeout: 10000
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
      console.log(`[PythonEnvManager] Using bundled Python: ${bundledPath}`);
      return bundledPath;
    }

    try {
      // Get the actual executable path from the command
      // For commands like "py -3", we need to resolve to the actual executable
      const pythonPath = execSync(`${pythonCmd} -c "import sys; print(sys.executable)"`, {
        stdio: 'pipe',
        timeout: 5000
      }).toString().trim();

      console.log(`[PythonEnvManager] Found Python at: ${pythonPath}`);
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
        stdio: 'pipe'
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
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
        stdio: 'pipe'
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
        stdio: 'pipe'
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
   * Creates venv and installs deps if needed.
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
        venvExists: true,
        depsInstalled: true
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
      // Check if venv exists
      if (!this.venvExists()) {
        console.warn('[PythonEnvManager] Venv not found, creating...');
        const created = await this.createVenv();
        if (!created) {
          this.isInitializing = false;
          return {
            ready: false,
            pythonPath: null,
            venvExists: false,
            depsInstalled: false,
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
            venvExists: true,
            depsInstalled: false,
            error: 'Failed to install dependencies'
          };
        }
      } else {
        console.warn('[PythonEnvManager] Dependencies already installed');
      }

      this.pythonPath = this.getVenvPythonPath();
      this.isReady = true;
      this.isInitializing = false;

      this.emit('ready', this.pythonPath);
      console.warn('[PythonEnvManager] Ready with Python path:', this.pythonPath);

      return {
        ready: true,
        pythonPath: this.pythonPath,
        venvExists: true,
        depsInstalled: true
      };
    } catch (error) {
      this.isInitializing = false;
      const message = error instanceof Error ? error.message : String(error);
      return {
        ready: false,
        pythonPath: null,
        venvExists: this.venvExists(),
        depsInstalled: false,
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
   * Check if the environment is ready
   */
  isEnvReady(): boolean {
    return this.isReady;
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<PythonEnvStatus> {
    const venvExists = this.venvExists();
    const depsInstalled = venvExists ? await this.checkDepsInstalled() : false;

    return {
      ready: this.isReady,
      pythonPath: this.pythonPath,
      venvExists,
      depsInstalled
    };
  }
}

// Singleton instance
export const pythonEnvManager = new PythonEnvManager();

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
