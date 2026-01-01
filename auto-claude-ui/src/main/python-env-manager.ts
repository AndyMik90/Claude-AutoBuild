import { execFileSync, execSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface PythonEnvStatus {
  ready: boolean
  pythonPath: string | null
  venvExists: boolean
  depsInstalled: boolean
  error?: string
}

/**
 * Manages the Python virtual environment for the auto-claude backend.
 * Automatically creates venv and installs dependencies if needed.
 *
 * On packaged apps (especially Linux AppImages), the bundled source is read-only,
 * so we create the venv in userData instead of inside the source directory.
 */
export class PythonEnvManager extends EventEmitter {
  private autoBuildSourcePath: string | null = null
  private pythonPath: string | null = null
  private isInitializing = false
  private isReady = false

  /**
   * Get the path where the venv should be created.
   * For packaged apps, this is in userData to avoid read-only filesystem issues.
   * For development, this is inside the source directory.
   */
  private getVenvBasePath(): string | null {
    if (!this.autoBuildSourcePath) return null

    // For packaged apps, put venv in userData (writable location)
    // This fixes Linux AppImage where resources are read-only
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'python-venv')
    }

    // Development mode - use source directory
    return path.join(this.autoBuildSourcePath, '.venv')
  }

  /**
   * Get the path to the venv Python executable
   */
  private getVenvPythonPath(): string | null {
    const venvPath = this.getVenvBasePath()
    if (!venvPath) return null

    const venvPython =
      process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python')

    return venvPython
  }

  /**
   * Get the path to pip in the venv
   * Returns null - we use python -m pip instead for better compatibility
   * @deprecated Use getVenvPythonPath() with -m pip instead
   */
  private getVenvPipPath(): string | null {
    return null // Not used - we use python -m pip
  }

  /**
   * Check if venv exists
   */
  private venvExists(): boolean {
    const venvPython = this.getVenvPythonPath()
    return venvPython ? existsSync(venvPython) : false
  }

  /**
   * Check if claude-agent-sdk is installed
   */
  private async checkDepsInstalled(): Promise<boolean> {
    const venvPython = this.getVenvPythonPath()
    if (!venvPython || !existsSync(venvPython)) return false

    try {
      // Check if claude_agent_sdk can be imported
      execSync(`"${venvPython}" -c "import claude_agent_sdk"`, {
        stdio: 'pipe',
        timeout: 10000,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Find system Python3
   */
  private findSystemPython(): string | null {
    const isWindows = process.platform === 'win32'

    // Windows candidates - py launcher is handled specially
    // Unix candidates - try python3 first, then python
    const candidates = isWindows ? ['python', 'python3'] : ['python3', 'python']

    // On Windows, try the py launcher first (most reliable)
    if (isWindows) {
      try {
        // py -3 runs Python 3, verify it works
        const version = execSync('py -3 --version', {
          stdio: 'pipe',
          timeout: 5000,
        }).toString()
        if (version.includes('Python 3')) {
          // Get the actual executable path
          const pythonPath = execSync('py -3 -c "import sys; print(sys.executable)"', {
            stdio: 'pipe',
            timeout: 5000,
          })
            .toString()
            .trim()
          return pythonPath
        }
      } catch {
        // py launcher not available, continue with other candidates
      }
    }

    for (const cmd of candidates) {
      try {
        const version = execSync(`${cmd} --version`, {
          stdio: 'pipe',
          timeout: 5000,
        }).toString()
        if (version.includes('Python 3')) {
          // Get the actual path
          // On Windows, use Python itself to get the path
          // On Unix, use 'which'
          const pathCmd = isWindows
            ? `${cmd} -c "import sys; print(sys.executable)"`
            : `which ${cmd}`
          const pythonPath = execSync(pathCmd, { stdio: 'pipe', timeout: 5000 }).toString().trim()
          return pythonPath
        }
      } catch {
        // Command not found or failed, try next candidate
      }
    }
    return null
  }

  /**
   * Create the virtual environment
   */
  private async createVenv(): Promise<boolean> {
    if (!this.autoBuildSourcePath) return false

    const systemPython = this.findSystemPython()
    if (!systemPython) {
      this.emit('error', 'Python 3 not found. Please install Python 3.9+')
      return false
    }

    this.emit('status', 'Creating Python virtual environment...')
    const venvPath = this.getVenvBasePath()!
    console.warn('[PythonEnvManager] Creating venv at:', venvPath, 'with:', systemPython)

    return new Promise((resolve) => {
      const proc = spawn(systemPython, ['-m', 'venv', venvPath], {
        cwd: this.autoBuildSourcePath!,
        stdio: 'pipe',
      })

      let stderr = ''
      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          console.warn('[PythonEnvManager] Venv created successfully')
          resolve(true)
        } else {
          console.error('[PythonEnvManager] Failed to create venv:', stderr)
          this.emit('error', `Failed to create virtual environment: ${stderr}`)
          resolve(false)
        }
      })

      proc.on('error', (err) => {
        console.error('[PythonEnvManager] Error creating venv:', err)
        this.emit('error', `Failed to create virtual environment: ${err.message}`)
        resolve(false)
      })
    })
  }

  /**
   * Bootstrap pip in the venv using ensurepip
   */
  private async bootstrapPip(): Promise<boolean> {
    const venvPython = this.getVenvPythonPath()
    if (!venvPython || !existsSync(venvPython)) {
      return false
    }

    console.warn('[PythonEnvManager] Bootstrapping pip...')
    return new Promise((resolve) => {
      const proc = spawn(venvPython, ['-m', 'ensurepip'], {
        cwd: this.autoBuildSourcePath!,
        stdio: 'pipe',
      })

      let stderr = ''
      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          console.warn('[PythonEnvManager] Pip bootstrapped successfully')
          resolve(true)
        } else {
          console.error('[PythonEnvManager] Failed to bootstrap pip:', stderr)
          resolve(false)
        }
      })

      proc.on('error', (err) => {
        console.error('[PythonEnvManager] Error bootstrapping pip:', err)
        resolve(false)
      })
    })
  }

  /**
   * Install dependencies from requirements.txt using python -m pip
   */
  private async installDeps(): Promise<boolean> {
    if (!this.autoBuildSourcePath) return false

    const venvPython = this.getVenvPythonPath()
    const requirementsPath = path.join(this.autoBuildSourcePath, 'requirements.txt')

    if (!venvPython || !existsSync(venvPython)) {
      this.emit('error', 'Python not found in virtual environment')
      return false
    }

    if (!existsSync(requirementsPath)) {
      this.emit('error', 'requirements.txt not found')
      return false
    }

    // Bootstrap pip first if needed
    await this.bootstrapPip()

    this.emit('status', 'Installing Python dependencies (this may take a minute)...')
    console.warn('[PythonEnvManager] Installing dependencies from:', requirementsPath)

    return new Promise((resolve) => {
      // Use python -m pip for better compatibility across Python versions
      const proc = spawn(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath], {
        cwd: this.autoBuildSourcePath!,
        stdio: 'pipe',
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
        // Emit progress updates for long-running installations
        const lines = data.toString().split('\n')
        for (const line of lines) {
          if (line.includes('Installing') || line.includes('Successfully')) {
            this.emit('status', line.trim())
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          console.warn('[PythonEnvManager] Dependencies installed successfully')
          this.emit('status', 'Dependencies installed successfully')
          resolve(true)
        } else {
          console.error('[PythonEnvManager] Failed to install deps:', stderr || stdout)
          this.emit('error', `Failed to install dependencies: ${stderr || stdout}`)
          resolve(false)
        }
      })

      proc.on('error', (err) => {
        console.error('[PythonEnvManager] Error installing deps:', err)
        this.emit('error', `Failed to install dependencies: ${err.message}`)
        resolve(false)
      })
    })
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
        error: 'Already initializing',
      }
    }

    this.isInitializing = true
    this.autoBuildSourcePath = autoBuildSourcePath

    console.warn('[PythonEnvManager] Initializing with path:', autoBuildSourcePath)

    try {
      // Check if venv exists
      if (!this.venvExists()) {
        console.warn('[PythonEnvManager] Venv not found, creating...')
        const created = await this.createVenv()
        if (!created) {
          this.isInitializing = false
          return {
            ready: false,
            pythonPath: null,
            venvExists: false,
            depsInstalled: false,
            error: 'Failed to create virtual environment',
          }
        }
      } else {
        console.warn('[PythonEnvManager] Venv already exists')
      }

      // Check if deps are installed
      const depsInstalled = await this.checkDepsInstalled()
      if (!depsInstalled) {
        console.warn('[PythonEnvManager] Dependencies not installed, installing...')
        const installed = await this.installDeps()
        if (!installed) {
          this.isInitializing = false
          return {
            ready: false,
            pythonPath: this.getVenvPythonPath(),
            venvExists: true,
            depsInstalled: false,
            error: 'Failed to install dependencies',
          }
        }
      } else {
        console.warn('[PythonEnvManager] Dependencies already installed')
      }

      this.pythonPath = this.getVenvPythonPath()
      this.isReady = true
      this.isInitializing = false

      this.emit('ready', this.pythonPath)
      console.warn('[PythonEnvManager] Ready with Python path:', this.pythonPath)

      return {
        ready: true,
        pythonPath: this.pythonPath,
        venvExists: true,
        depsInstalled: true,
      }
    } catch (error) {
      this.isInitializing = false
      const message = error instanceof Error ? error.message : String(error)
      return {
        ready: false,
        pythonPath: null,
        venvExists: this.venvExists(),
        depsInstalled: false,
        error: message,
      }
    }
  }

  /**
   * Get the Python path (only valid after initialization)
   */
  getPythonPath(): string | null {
    return this.pythonPath
  }

  /**
   * Check if the environment is ready
   */
  isEnvReady(): boolean {
    return this.isReady
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<PythonEnvStatus> {
    const venvExists = this.venvExists()
    const depsInstalled = venvExists ? await this.checkDepsInstalled() : false

    return {
      ready: this.isReady,
      pythonPath: this.pythonPath,
      venvExists,
      depsInstalled,
    }
  }

  /**
   * Check if claude-agent-sdk is installed for a given Python path
   * Used for validating custom Python paths configured by users
   */
  checkDepsForPathSync(pythonPath: string): { installed: boolean; missingDeps: string[] } {
    if (!pythonPath || !existsSync(pythonPath)) {
      return { installed: false, missingDeps: ['Python not found at path'] }
    }

    const requiredPackages = ['claude_agent_sdk']
    const missingDeps: string[] = []

    for (const pkg of requiredPackages) {
      try {
        // Use spawnSync for synchronous check - safe as pythonPath is validated
        const result = require('node:child_process').spawnSync(
          pythonPath,
          ['-c', `import ${pkg}`],
          {
            stdio: 'pipe',
            timeout: 10000,
          }
        )
        if (result.status !== 0) {
          missingDeps.push(pkg.replace('_', '-'))
        }
      } catch {
        missingDeps.push(pkg.replace('_', '-'))
      }
    }

    return {
      installed: missingDeps.length === 0,
      missingDeps,
    }
  }

  /**
   * Install claude-agent-sdk for a given Python path
   * Uses spawn with array args (safe from injection)
   */
  async installDepsForPath(
    pythonPath: string,
    onProgress?: (message: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (!pythonPath || !existsSync(pythonPath)) {
      return { success: false, error: 'Python not found at path' }
    }

    const packages = ['claude-agent-sdk']

    onProgress?.('Installing claude-agent-sdk...')

    return new Promise((resolve) => {
      // spawn with array args is safe from shell injection
      const proc = spawn(pythonPath, ['-m', 'pip', 'install', ...packages], {
        stdio: 'pipe',
      })

      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (
            trimmed &&
            (trimmed.includes('Installing') ||
              trimmed.includes('Collecting') ||
              trimmed.includes('Successfully'))
          ) {
            onProgress?.(trimmed)
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          onProgress?.('claude-agent-sdk installed successfully')
          resolve({ success: true })
        } else {
          const errorMsg = stderr || stdout || 'Unknown error'
          resolve({ success: false, error: errorMsg })
        }
      })

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  /**
   * Get the path to the Claude CLI executable.
   * Checks multiple locations in order:
   * 1. Inside the venv's site-packages (claude_agent_sdk/_bundled/)
   * 2. Common system locations
   * 3. System PATH
   *
   * This fixes Issue #529 where the SDK fails to find the bundled CLI
   * in packaged Electron apps.
   */
  getClaudeCliPath(): string | null {
    const isWindows = process.platform === 'win32'
    const cliName = isWindows ? 'claude.exe' : 'claude'

    // Build list of candidate locations
    const candidates: string[] = []

    // 1. Check inside venv's site-packages (where claude_agent_sdk is installed)
    const venvPath = this.getVenvBasePath()
    if (venvPath) {
      if (isWindows) {
        // Windows: venv/Lib/site-packages/claude_agent_sdk/_bundled/claude.exe
        candidates.push(
          path.join(venvPath, 'Lib', 'site-packages', 'claude_agent_sdk', '_bundled', cliName)
        )
      } else {
        // Unix: venv/lib/pythonX.Y/site-packages/claude_agent_sdk/_bundled/claude
        // Try common Python versions
        for (const pyVer of ['python3.12', 'python3.11', 'python3.10', 'python3.9', 'python3']) {
          candidates.push(
            path.join(
              venvPath,
              'lib',
              pyVer,
              'site-packages',
              'claude_agent_sdk',
              '_bundled',
              cliName
            )
          )
        }
      }
    }

    // 2. Check in app resources (for packaged apps)
    if (app.isPackaged && process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, 'auto-claude', 'bin', cliName))
    }

    // 3. Check common system locations
    const homeDir = app.getPath('home')
    candidates.push(
      path.join(homeDir, '.npm-global', 'bin', cliName),
      path.join(homeDir, '.local', 'bin', cliName),
      path.join(homeDir, 'node_modules', '.bin', cliName),
      path.join(homeDir, '.yarn', 'bin', cliName),
      path.join(homeDir, '.claude', 'local', cliName)
    )

    if (isWindows) {
      candidates.push(
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude', cliName),
        `C:\\Program Files\\Claude\\${cliName}`,
        `C:\\Program Files (x86)\\Claude\\${cliName}`
      )
    } else {
      candidates.push(`/usr/local/bin/${cliName}`, `/usr/bin/${cliName}`)
    }

    // Find first existing path
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        console.warn('[PythonEnvManager] Found Claude CLI at:', candidate)
        return candidate
      }
    }

    // 4. Try system PATH using which/where (using execFileSync for safety)
    try {
      const cmd = isWindows ? 'where' : 'which'
      const result = execFileSync(cmd, ['claude'], {
        stdio: 'pipe',
        timeout: 5000,
      })
        .toString()
        .trim()

      // 'where' on Windows may return multiple lines, take the first
      const firstLine = result.split('\n')[0].trim()
      if (firstLine && existsSync(firstLine)) {
        console.warn('[PythonEnvManager] Found Claude CLI in PATH:', firstLine)
        return firstLine
      }
    } catch {
      // Not in PATH
    }

    console.warn('[PythonEnvManager] Claude CLI not found in any known location')
    return null
  }

  /**
   * Get the venv base path (public accessor)
   */
  getVenvPath(): string | null {
    return this.getVenvBasePath()
  }
}

// Singleton instance
export const pythonEnvManager = new PythonEnvManager()
