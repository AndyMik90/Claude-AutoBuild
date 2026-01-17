/**
 * Conda Environment Manager
 *
 * Manages Conda environments for Python projects:
 * - Creating environments with specific Python versions
 * - Installing dependencies from requirements files
 * - Verifying existing environments
 * - Generating activation scripts for different shells
 * - Deleting environments
 *
 * Uses async generators for progress reporting during long-running operations.
 */

import { execFile, spawn } from 'child_process';
import { existsSync, promises as fsPromises } from 'fs';
import path from 'path';
import { promisify } from 'util';
import type {
  PythonVersionResult,
  PythonVersionConstraint,
  CondaEnvConfig,
  CondaEnvValidation,
  SetupProgress,
  ActivationScripts,
} from '../shared/types/conda';
import { detectCondaInstallations } from './conda-detector';
import { getCondaPythonPath, getCondaPipPath } from './python-path-utils';

const execFileAsync = promisify(execFile);

// Default Python version when no version is specified in project files
const DEFAULT_PYTHON_VERSION = '3.12';

// Alias for backward compatibility within this module
const getPythonPath = getCondaPythonPath;

/**
 * Parse Python version from environment.yml file
 *
 * Looks for patterns like:
 * - python=3.12
 * - python>=3.12
 * - python=3.12.*
 */
async function parseEnvironmentYml(
  filePath: string
): Promise<PythonVersionResult | null> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Match python version in dependencies section
      // Patterns: python=3.12, python>=3.12, python=3.12.*, python==3.12
      const match = trimmed.match(
        /^-?\s*python\s*([=><!]+)?\s*(\d+\.\d+(?:\.\d+)?|\d+\.\d+\.\*)/i
      );

      if (match) {
        const operator = match[1] || '=';
        const versionRaw = match[2];
        // Normalize version (remove wildcard, keep major.minor)
        const version = versionRaw.replace(/\.\*$/, '');

        let constraint: PythonVersionConstraint = 'exact';
        if (operator.includes('>')) {
          constraint = 'minimum';
        } else if (operator.includes('<')) {
          constraint = 'range';
        }

        return {
          version,
          source: 'environment.yml',
          constraint,
          raw: trimmed,
        };
      }
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Parse Python version from pyproject.toml file
 *
 * Looks for patterns like:
 * - requires-python = ">=3.12"
 * - requires-python = ">=3.12,<4.0"
 * - python = "^3.12"
 */
async function parsePyprojectToml(
  filePath: string
): Promise<PythonVersionResult | null> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');

    // Match requires-python in [project] section
    const requiresPythonMatch = content.match(
      /requires-python\s*=\s*["']([^"']+)["']/
    );

    if (requiresPythonMatch) {
      const raw = requiresPythonMatch[1];
      // Extract version number from constraint
      const versionMatch = raw.match(/(\d+\.\d+(?:\.\d+)?)/);

      if (versionMatch) {
        let constraint: PythonVersionConstraint = 'exact';
        if (raw.includes('>=') || raw.includes('>')) {
          constraint = 'minimum';
        } else if (raw.includes(',') || raw.includes('<')) {
          constraint = 'range';
        }

        return {
          version: versionMatch[1],
          source: 'pyproject.toml',
          constraint,
          raw,
        };
      }
    }

    // Also check Poetry's python field: python = "^3.12"
    // Use [\s\S] instead of . with s flag for cross-line matching
    const poetryPythonMatch = content.match(
      /\[tool\.poetry\.dependencies\][\s\S]*?python\s*=\s*["']([^"']+)["']/
    );

    if (poetryPythonMatch) {
      const raw = poetryPythonMatch[1];
      const versionMatch = raw.match(/(\d+\.\d+(?:\.\d+)?)/);

      if (versionMatch) {
        return {
          version: versionMatch[1],
          source: 'pyproject.toml',
          constraint: raw.startsWith('^') || raw.startsWith('~') ? 'minimum' : 'exact',
          raw,
        };
      }
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Parse Python version from requirements.txt file
 *
 * Looks for patterns like:
 * - # python>=3.12 (comment at top)
 * - # python 3.12
 * - PEP 508 markers (not common but supported)
 */
async function parseRequirementsTxt(
  filePath: string
): Promise<PythonVersionResult | null> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Only check first 10 lines for version comment
    const headerLines = lines.slice(0, 10);

    for (const line of headerLines) {
      const trimmed = line.trim();

      // Match comment patterns: # python>=3.12, # python 3.12, # Python version: 3.12
      const match = trimmed.match(
        /^#\s*python\s*(?:version\s*:?\s*)?([=><!]+)?\s*(\d+\.\d+(?:\.\d+)?)/i
      );

      if (match) {
        const operator = match[1] || '';
        const version = match[2];

        let constraint: PythonVersionConstraint = 'exact';
        if (operator.includes('>')) {
          constraint = 'minimum';
        } else if (operator.includes('<')) {
          constraint = 'range';
        }

        return {
          version,
          source: 'comment',
          constraint,
          raw: trimmed,
        };
      }
    }

    // Check for python_requires marker in any line (PEP 508)
    for (const line of lines) {
      if (line.includes('python_version')) {
        const match = line.match(/python_version\s*([=><!]+)\s*["'](\d+\.\d+)["']/);
        if (match) {
          return {
            version: match[2],
            source: 'marker',
            constraint: match[1].includes('>') ? 'minimum' : 'exact',
            raw: line.trim(),
          };
        }
      }
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Parse Python version from .python-version file (pyenv)
 */
async function parsePythonVersionFile(
  filePath: string
): Promise<PythonVersionResult | null> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const version = content.trim();

    // Extract major.minor from version string (e.g., "3.12.1" -> "3.12")
    const match = version.match(/^(\d+\.\d+)/);
    if (match) {
      return {
        version: match[1],
        source: '.python-version',
        constraint: 'exact',
        raw: version,
      };
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Parse Python version from runtime.txt (Heroku)
 */
async function parseRuntimeTxt(
  filePath: string
): Promise<PythonVersionResult | null> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const line = content.trim();

    // Match pattern: python-3.12.1
    const match = line.match(/^python-(\d+\.\d+)/i);
    if (match) {
      return {
        version: match[1],
        source: 'runtime.txt',
        constraint: 'exact',
        raw: line,
      };
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return null;
}

/**
 * Parse Python version from project files
 *
 * Checks files in order of priority:
 * 1. environment.yml (conda environment file)
 * 2. pyproject.toml (modern Python projects)
 * 3. requirements.txt (comments or markers)
 * 4. .python-version (pyenv)
 * 5. runtime.txt (Heroku)
 * 6. Default: 3.12
 *
 * @param projectPath - Path to the project directory
 * @returns Promise resolving to PythonVersionResult with detected or default version
 */
export async function parseRequiredPythonVersionAsync(
  projectPath: string
): Promise<PythonVersionResult> {
  // Check files in priority order

  // 1. environment.yml
  const environmentYmlPath = path.join(projectPath, 'environment.yml');
  if (existsSync(environmentYmlPath)) {
    const result = await parseEnvironmentYml(environmentYmlPath);
    if (result) return result;
  }

  // 2. pyproject.toml
  const pyprojectTomlPath = path.join(projectPath, 'pyproject.toml');
  if (existsSync(pyprojectTomlPath)) {
    const result = await parsePyprojectToml(pyprojectTomlPath);
    if (result) return result;
  }

  // 3. requirements.txt
  const requirementsTxtPath = path.join(projectPath, 'requirements.txt');
  if (existsSync(requirementsTxtPath)) {
    const result = await parseRequirementsTxt(requirementsTxtPath);
    if (result) return result;
  }

  // 4. .python-version (pyenv)
  const pythonVersionPath = path.join(projectPath, '.python-version');
  if (existsSync(pythonVersionPath)) {
    const result = await parsePythonVersionFile(pythonVersionPath);
    if (result) return result;
  }

  // 5. runtime.txt (Heroku)
  const runtimeTxtPath = path.join(projectPath, 'runtime.txt');
  if (existsSync(runtimeTxtPath)) {
    const result = await parseRuntimeTxt(runtimeTxtPath);
    if (result) return result;
  }

  // Default fallback
  return {
    version: DEFAULT_PYTHON_VERSION,
    source: 'default',
    constraint: 'minimum',
    raw: `Default Python ${DEFAULT_PYTHON_VERSION}`,
  };
}

/**
 * Run a command and capture output
 */
async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, {
    encoding: 'utf-8',
    timeout: options.timeout || 300000, // 5 minutes default
    cwd: options.cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });
}

/**
 * Run a command as a spawned process with streaming output
 */
function spawnCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Don't use shell: true - it adds overhead and can cause issues
    // conda.exe can be called directly without a shell wrapper
    const proc = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Create a new Conda environment
 *
 * Creates a prefix-based environment at the specified path with the
 * requested Python version. Yields progress updates throughout the process.
 *
 * @param config - Environment configuration
 * @yields SetupProgress updates during creation
 */
export async function* createEnvironment(
  config: CondaEnvConfig
): AsyncGenerator<SetupProgress> {
  const { envPath, pythonVersion, condaInstallation } = config;

  // Step 1: Detect Conda
  yield {
    step: 'detecting',
    message: 'Detecting conda installation...',
    timestamp: new Date().toISOString(),
  };

  let condaExe: string;
  let condaBase: string;

  if (condaInstallation) {
    condaExe = condaInstallation.condaExe;
    condaBase = condaInstallation.path;
  } else {
    const detection = await detectCondaInstallations();
    if (!detection.found || !detection.preferred) {
      yield {
        step: 'error',
        message: 'No Conda installation found',
        detail: 'Please install Miniconda or Anaconda first',
        timestamp: new Date().toISOString(),
      };
      return;
    }
    condaExe = detection.preferred.condaExe;
    condaBase = detection.preferred.path;
  }

  // Step 2: Create environment
  yield {
    step: 'creating',
    message: `Creating environment at ${envPath}...`,
    progress: 10,
    timestamp: new Date().toISOString(),
  };

  // Check if environment already exists and delete it (for reinstall)
  if (existsSync(envPath)) {
    yield {
      step: 'creating',
      message: 'Removing existing environment...',
      detail: envPath,
      progress: 15,
      timestamp: new Date().toISOString(),
    };

    try {
      await fsPromises.rm(envPath, { recursive: true, force: true });
    } catch (err) {
      const errorMsg = String(err);
      console.error('[CondaEnvManager] Failed to remove environment:', errorMsg);
      // Provide helpful error message based on error type
      let userMessage = 'Failed to remove existing environment';
      if (errorMsg.includes('EBUSY') || errorMsg.includes('EPERM') || errorMsg.includes('in use')) {
        userMessage = 'Environment is in use. Close VS Code and any terminals using this environment, then try again.';
      }
      yield {
        step: 'error',
        message: userMessage,
        detail: errorMsg,
        timestamp: new Date().toISOString(),
      };
      return;
    }
  }

  // Ensure parent directory exists
  const envParentDir = path.dirname(envPath);
  try {
    await fsPromises.mkdir(envParentDir, { recursive: true });
  } catch (err) {
    yield {
      step: 'error',
      message: `Failed to create directory: ${envParentDir}`,
      detail: String(err),
      timestamp: new Date().toISOString(),
    };
    return;
  }

  // Step 3: Run conda create
  yield {
    step: 'installing-python',
    message: `Installing Python ${pythonVersion}...`,
    progress: 30,
    timestamp: new Date().toISOString(),
  };

  try {
    const { code, stdout, stderr } = await spawnCommand(condaExe, [
      'create',
      '-p',
      envPath,
      `python=${pythonVersion}`,
      '-y',
      '--no-default-packages',
    ]);

    if (code !== 0) {
      yield {
        step: 'error',
        message: 'Failed to create Conda environment',
        detail: stderr || stdout,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    yield {
      step: 'installing-python',
      message: 'Python installation complete',
      detail: stdout,
      progress: 60,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    yield {
      step: 'error',
      message: 'Failed to run conda create',
      detail: String(err),
      timestamp: new Date().toISOString(),
    };
    return;
  }

  // Step 4: Verify Python installation
  yield {
    step: 'verifying-python',
    message: 'Verifying Python installation...',
    progress: 70,
    timestamp: new Date().toISOString(),
  };

  const pythonExe = getPythonPath(envPath);

  try {
    const { stdout } = await runCommand(pythonExe, ['--version']);
    yield {
      step: 'verifying-python',
      message: `Python verified: ${stdout.trim()}`,
      progress: 80,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    yield {
      step: 'error',
      message: 'Failed to verify Python installation',
      detail: String(err),
      timestamp: new Date().toISOString(),
    };
    return;
  }

  // Step 5: Generate activation scripts
  yield {
    step: 'generating-scripts',
    message: 'Generating activation scripts...',
    progress: 90,
    timestamp: new Date().toISOString(),
  };

  try {
    const scripts = await generateActivationScripts(envPath, condaBase);
    yield {
      step: 'generating-scripts',
      message: 'Activation scripts generated',
      detail: `Scripts at: ${path.dirname(scripts.bat)}`,
      progress: 95,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    // Non-fatal - environment is still usable
    yield {
      step: 'generating-scripts',
      message: 'Warning: Could not generate activation scripts',
      detail: String(err),
      progress: 95,
      timestamp: new Date().toISOString(),
    };
  }

  // Step 6: Finalizing (warn about Windows indexing delay)
  yield {
    step: 'finalizing',
    message: 'Finalizing environment...',
    detail: 'This may take up to a minute while Windows indexes the new files',
    progress: 97,
    timestamp: new Date().toISOString(),
  };

  // Brief pause to allow system to settle before marking complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 7: Complete
  yield {
    step: 'complete',
    message: 'Environment ready',
    detail: `Environment created at ${envPath}`,
    progress: 100,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Verify an existing Conda environment
 *
 * Checks that the environment exists, has a working Python installation,
 * and reports the installed Python version.
 *
 * @param envPath - Path to the environment to verify
 * @returns Validation result
 */
export async function verifyEnvironment(
  envPath: string
): Promise<CondaEnvValidation> {
  // Check environment directory exists
  try {
    await fsPromises.access(envPath);
  } catch {
    return {
      valid: false,
      error: 'env_not_found',
      message: `Environment not found at ${envPath}`,
      envPath,
    };
  }

  // Check Python executable exists
  const pythonExe = getPythonPath(envPath);
  try {
    await fsPromises.access(pythonExe);
  } catch {
    return {
      valid: false,
      error: 'python_missing',
      message: 'Python executable not found in environment',
      envPath,
    };
  }

  // Get Python version
  let pythonVersion: string | undefined;
  try {
    const { stdout } = await runCommand(pythonExe, ['--version']);
    const match = stdout.match(/Python\s+(\d+\.\d+\.\d+)/i);
    pythonVersion = match ? match[1] : undefined;
  } catch {
    return {
      valid: false,
      error: 'env_broken',
      message: 'Failed to run Python - environment may be corrupted',
      envPath,
    };
  }

  // Get package count (with short timeout to avoid blocking)
  // This is informational only - don't block verification on it
  let packageCount: number | undefined;
  const pipExe = getCondaPipPath(envPath);
  try {
    // Short 5-second timeout for pip list - if it takes longer, skip it
    const { stdout } = await runCommand(pipExe, ['list', '--format=json'], { timeout: 5000 });
    const packages = JSON.parse(stdout);
    packageCount = Array.isArray(packages) ? packages.length : undefined;
  } catch {
    // Non-fatal - pip might not be available or timed out
    // Skip package count rather than blocking
  }

  return {
    valid: true,
    pythonVersion,
    packageCount,
    message: `Python ${pythonVersion}${packageCount !== undefined ? ` with ${packageCount} packages` : ''}`,
    envPath,
    depsInstalled: (packageCount ?? 0) > 5, // More than just base packages
  };
}

/**
 * Install dependencies from a requirements file
 *
 * Runs pip install -r on the specified requirements file within the environment.
 * Yields progress updates during installation.
 *
 * @param envPath - Path to the environment
 * @param requirementsPath - Path to requirements.txt file
 * @yields SetupProgress updates during installation
 */
export async function* installDependencies(
  envPath: string,
  requirementsPath: string
): AsyncGenerator<SetupProgress> {
  yield {
    step: 'installing-deps',
    message: 'Installing dependencies...',
    detail: `From: ${requirementsPath}`,
    progress: 0,
    timestamp: new Date().toISOString(),
  };

  // Verify requirements file exists
  try {
    await fsPromises.access(requirementsPath);
  } catch {
    yield {
      step: 'error',
      message: 'Requirements file not found',
      detail: requirementsPath,
      timestamp: new Date().toISOString(),
    };
    return;
  }

  const pipExe = getCondaPipPath(envPath);

  // Verify pip exists
  try {
    await fsPromises.access(pipExe);
  } catch {
    yield {
      step: 'error',
      message: 'pip not found in environment',
      detail: pipExe,
      timestamp: new Date().toISOString(),
    };
    return;
  }

  yield {
    step: 'installing-deps',
    message: 'Running pip install...',
    progress: 20,
    timestamp: new Date().toISOString(),
  };

  try {
    const { code, stdout, stderr } = await spawnCommand(pipExe, [
      'install',
      '-r',
      requirementsPath,
    ]);

    if (code !== 0) {
      yield {
        step: 'error',
        message: 'pip install failed',
        detail: stderr || stdout,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    yield {
      step: 'installing-deps',
      message: 'Dependencies installed successfully',
      detail: stdout,
      progress: 100,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    yield {
      step: 'error',
      message: 'Failed to run pip install',
      detail: String(err),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generate activation scripts for different shells
 *
 * Creates activate.bat, activate.ps1, and activate.sh in <envPath>/activate/
 * Also writes .conda_base file containing the Conda base path.
 *
 * @param envPath - Path to the environment
 * @param condaBase - Path to the Conda installation
 * @returns Generated script paths
 */
export async function generateActivationScripts(
  envPath: string,
  condaBase: string
): Promise<ActivationScripts> {
  const activateDir = path.join(envPath, 'activate');
  await fsPromises.mkdir(activateDir, { recursive: true });

  // Normalize paths for scripts
  const envPathNormalized = envPath.replace(/\\/g, '/');
  const condaBaseNormalized = condaBase.replace(/\\/g, '/');

  // Windows CMD batch script
  const batContent = `@echo off
REM Conda environment activation script for Windows CMD
REM Generated by Auto-Claude

set "CONDA_BASE=${condaBase}"
set "ENV_PATH=${envPath}"

REM Initialize conda
call "%CONDA_BASE%\\Scripts\\activate.bat" "%CONDA_BASE%"

REM Activate the environment
call conda activate "%ENV_PATH%"

echo Activated environment: %ENV_PATH%
`;

  // PowerShell script
  const ps1Content = `# Conda environment activation script for PowerShell
# Generated by Auto-Claude

$CONDA_BASE = "${condaBase.replace(/\\/g, '\\\\')}"
$ENV_PATH = "${envPath.replace(/\\/g, '\\\\')}"

# Initialize conda
& "$CONDA_BASE\\Scripts\\activate.ps1" "$CONDA_BASE"

# Activate the environment
conda activate "$ENV_PATH"

Write-Host "Activated environment: $ENV_PATH"
`;

  // Bash script
  const shContent = `#!/bin/bash
# Conda environment activation script for Bash
# Generated by Auto-Claude

CONDA_BASE="${condaBaseNormalized}"
ENV_PATH="${envPathNormalized}"

# Initialize conda
source "$CONDA_BASE/etc/profile.d/conda.sh"

# Activate the environment
conda activate "$ENV_PATH"

echo "Activated environment: $ENV_PATH"
`;

  // Write scripts
  const batPath = path.join(activateDir, 'activate.bat');
  const ps1Path = path.join(activateDir, 'activate.ps1');
  const shPath = path.join(activateDir, 'activate.sh');
  const condaBasePath = path.join(activateDir, '.conda_base');

  await Promise.all([
    fsPromises.writeFile(batPath, batContent, 'utf-8'),
    fsPromises.writeFile(ps1Path, ps1Content, 'utf-8'),
    fsPromises.writeFile(shPath, shContent, { encoding: 'utf-8', mode: 0o755 }),
    fsPromises.writeFile(condaBasePath, condaBase, 'utf-8'),
  ]);

  return {
    bat: batPath,
    ps1: ps1Path,
    sh: shPath,
    condaBase,
    envPath,
  };
}

/**
 * Delete a Conda environment
 *
 * Removes the environment directory and all its contents.
 *
 * @param envPath - Path to the environment to delete
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteEnvironment(envPath: string): Promise<boolean> {
  try {
    await fsPromises.access(envPath);
  } catch {
    // Environment doesn't exist - consider this success
    return true;
  }

  try {
    await fsPromises.rm(envPath, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.error(`[CondaEnvManager] Failed to delete environment: ${err}`);
    return false;
  }
}

/**
 * Delete activation scripts for a project
 *
 * Removes the workspace file and PowerShell init script generated
 * for a project's Conda environment. Respects project structure
 * (pure-python vs mixed projects with src/python/).
 *
 * @param projectPath - Path to the project directory
 * @param projectName - Name of the project (used for file naming)
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteActivationScripts(
  projectPath: string,
  projectName: string
): Promise<boolean> {
  // Import here to avoid circular dependency
  const { detectProjectStructure } = await import('./conda-project-structure');

  try {
    // Detect project structure to find the correct root for scripts
    const structure = detectProjectStructure(projectPath);
    const pythonRoot = structure.pythonRoot;

    const filesToDelete = [
      // VS Code workspace file (in pythonRoot)
      path.join(pythonRoot, `${projectName}.code-workspace`),
      // PowerShell init script (in pythonRoot/scripts)
      path.join(pythonRoot, 'scripts', `init-${projectName}.ps1`),
    ];

    console.warn(`[CondaEnvManager] Deleting activation scripts from: ${pythonRoot}`);

    let allDeleted = true;
    for (const filePath of filesToDelete) {
      try {
        if (existsSync(filePath)) {
          await fsPromises.unlink(filePath);
          console.warn(`[CondaEnvManager] Deleted: ${filePath}`);
        } else {
          console.warn(`[CondaEnvManager] File not found (skipping): ${filePath}`);
        }
      } catch (err) {
        console.error(`[CondaEnvManager] Failed to delete ${filePath}: ${err}`);
        allDeleted = false;
      }
    }

    return allDeleted;
  } catch (err) {
    console.error(`[CondaEnvManager] Failed to delete activation scripts: ${err}`);
    return false;
  }
}

/**
 * Check if pip install would succeed (dry-run)
 *
 * Runs pip install --dry-run to check for dependency conflicts
 * without actually installing anything.
 *
 * @param envPath - Path to the environment
 * @param requirementsPath - Path to requirements.txt file
 * @returns Compatibility result with any issues found
 */
export async function checkDependencyCompatibility(
  envPath: string,
  requirementsPath: string
): Promise<{ compatible: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Verify requirements file exists
  try {
    await fsPromises.access(requirementsPath);
  } catch {
    return {
      compatible: false,
      issues: [`Requirements file not found: ${requirementsPath}`],
    };
  }

  const pipExe = getCondaPipPath(envPath);

  // Verify pip exists
  try {
    await fsPromises.access(pipExe);
  } catch {
    return {
      compatible: false,
      issues: [`pip not found in environment: ${pipExe}`],
    };
  }

  try {
    // Run pip install with --dry-run flag
    const { code, stdout, stderr } = await spawnCommand(pipExe, [
      'install',
      '-r',
      requirementsPath,
      '--dry-run',
    ]);

    if (code !== 0) {
      // Parse stderr for specific issues
      const lines = (stderr || stdout).split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.includes('ERROR:') ||
          trimmed.includes('Could not find') ||
          trimmed.includes('conflict') ||
          trimmed.includes('incompatible')
        ) {
          issues.push(trimmed);
        }
      }

      if (issues.length === 0) {
        issues.push('pip dry-run failed - check requirements file syntax');
      }

      return { compatible: false, issues };
    }

    return { compatible: true, issues: [] };
  } catch (err) {
    return {
      compatible: false,
      issues: [`Failed to run pip: ${err}`],
    };
  }
}
