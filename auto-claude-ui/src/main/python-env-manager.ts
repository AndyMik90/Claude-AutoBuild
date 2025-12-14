import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

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
 */
export class PythonEnvManager extends EventEmitter {
  private autoBuildSourcePath: string | null = null;
  private pythonPath: string | null = null;
  private isInitializing = false;
  private isReady = false;

  /**
   * Get the path to the venv Python executable
   */
  private getVenvPythonPath(): string | null {
    if (!this.autoBuildSourcePath) return null;

    const venvPython =
      process.platform === 'win32'
        ? path.join(this.autoBuildSourcePath, '.venv', 'Scripts', 'python.exe')
        : path.join(this.autoBuildSourcePath, '.venv', 'bin', 'python');

    return venvPython;
  }

  /**
   * Get the path to pip in the venv
   */
  private getVenvPipPath(): string | null {
    if (!this.autoBuildSourcePath) return null;

    const venvPip =
      process.platform === 'win32'
        ? path.join(this.autoBuildSourcePath, '.venv', 'Scripts', 'pip.exe')
        : path.join(this.autoBuildSourcePath, '.venv', 'bin', 'pip');

    return venvPip;
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
   * Find system Python3
   */
  private findSystemPython(): string | null {
    const isWindows = process.platform === 'win32';

    // Windows candidates - py launcher is handled specially
    // Unix candidates - try python3 first, then python
    const candidates = isWindows
      ? ['python', 'python3']
      : ['python3', 'python'];

    // On Windows, try the py launcher first (most reliable)
    if (isWindows) {
      try {
        // py -3 runs Python 3, verify it works
        const version = execSync('py -3 --version', {
          stdio: 'pipe',
          timeout: 5000
        }).toString();
        if (version.includes('Python 3')) {
          // Get the actual executable path
          const pythonPath = execSync('py -3 -c "import sys; print(sys.executable)"', {
            stdio: 'pipe',
            timeout: 5000
          }).toString().trim();
          return pythonPath;
        }
      } catch {
        // py launcher not available, continue with other candidates
      }
    }

    for (const cmd of candidates) {
      try {
        const version = execSync(`${cmd} --version`, {
          stdio: 'pipe',
          timeout: 5000
        }).toString();
        if (version.includes('Python 3')) {
          // Get the actual path
          // On Windows, use Python itself to get the path
          // On Unix, use 'which'
          const pathCmd = isWindows
            ? `${cmd} -c "import sys; print(sys.executable)"`
            : `which ${cmd}`;
          const pythonPath = execSync(pathCmd, { stdio: 'pipe', timeout: 5000 })
            .toString()
            .trim();
          return pythonPath;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Create the virtual environment
   */
  private async createVenv(): Promise<boolean> {
    if (!this.autoBuildSourcePath) return false;

    const systemPython = this.findSystemPython();
    if (!systemPython) {
      this.emit('error', 'Python 3 not found. Please install Python 3.9+');
      return false;
    }

    this.emit('status', 'Creating Python virtual environment...');
    console.log('[PythonEnvManager] Creating venv with:', systemPython);

    return new Promise((resolve) => {
      const venvPath = path.join(this.autoBuildSourcePath!, '.venv');
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
          console.log('[PythonEnvManager] Venv created successfully');
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
   * Install dependencies from requirements.txt
   */
  private async installDeps(): Promise<boolean> {
    if (!this.autoBuildSourcePath) return false;

    const venvPip = this.getVenvPipPath();
    const requirementsPath = path.join(this.autoBuildSourcePath, 'requirements.txt');

    if (!venvPip || !existsSync(venvPip)) {
      this.emit('error', 'Pip not found in virtual environment');
      return false;
    }

    if (!existsSync(requirementsPath)) {
      this.emit('error', 'requirements.txt not found');
      return false;
    }

    this.emit('status', 'Installing Python dependencies (this may take a minute)...');
    console.log('[PythonEnvManager] Installing dependencies from:', requirementsPath);

    return new Promise((resolve) => {
      const proc = spawn(venvPip, ['install', '-r', requirementsPath], {
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
          console.log('[PythonEnvManager] Dependencies installed successfully');
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
   */
  async initialize(autoBuildSourcePath: string): Promise<PythonEnvStatus> {
    if (this.isInitializing) {
      return {
        ready: false,
        pythonPath: null,
        venvExists: false,
        depsInstalled: false,
        error: 'Already initializing'
      };
    }

    this.isInitializing = true;
    this.autoBuildSourcePath = autoBuildSourcePath;

    console.log('[PythonEnvManager] Initializing with path:', autoBuildSourcePath);

    try {
      // Check if venv exists
      if (!this.venvExists()) {
        console.log('[PythonEnvManager] Venv not found, creating...');
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
        console.log('[PythonEnvManager] Venv already exists');
      }

      // Check if deps are installed
      const depsInstalled = await this.checkDepsInstalled();
      if (!depsInstalled) {
        console.log('[PythonEnvManager] Dependencies not installed, installing...');
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
        console.log('[PythonEnvManager] Dependencies already installed');
      }

      this.pythonPath = this.getVenvPythonPath();
      this.isReady = true;
      this.isInitializing = false;

      this.emit('ready', this.pythonPath);
      console.log('[PythonEnvManager] Ready with Python path:', this.pythonPath);

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
