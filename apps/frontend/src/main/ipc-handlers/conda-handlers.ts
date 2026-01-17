/**
 * Conda IPC Handlers
 *
 * IPC handlers for Conda environment management:
 * - Detection: Detect and refresh Conda installations
 * - App-level env: Setup and check the auto-claude environment
 * - Project-level env: Setup, check, delete project environments
 * - Utilities: Parse Python version, install dependencies
 *
 * All handlers return IPCResult<T> for consistent error handling.
 * Progress is streamed via CONDA_SETUP_PROGRESS events.
 */

import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';

import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type {
  CondaDetectionResult,
  CondaEnvConfig,
  CondaEnvValidation,
  PythonVersionResult,
  SetupProgress,
  CondaProjectPaths,
} from '../../shared/types/conda';

import {
  detectCondaInstallations,
} from '../conda-detector';
import {
  createEnvironment,
  verifyEnvironment,
  installDependencies,
  deleteEnvironment,
  deleteActivationScripts,
  parseRequiredPythonVersionAsync,
  generateActivationScripts,
} from '../conda-env-manager';
import {
  generateWorkspaceFiles,
} from '../conda-workspace-generator';
import {
  getPythonEnvPath,
  getScriptsPath,
  getWorkspaceFilePath,
  detectProjectStructure,
} from '../conda-project-structure';

/**
 * Register all Conda-related IPC handlers
 *
 * @param getMainWindow - Function to get the current main window for sending events
 */
export function registerCondaHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Detection Handlers
  // ============================================

  /**
   * Detect Conda installations on the system
   * Uses cached results unless forceRefresh is requested
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_DETECT,
    async (): Promise<IPCResult<CondaDetectionResult>> => {
      try {
        const result = await detectCondaInstallations(false);
        return { success: true, data: result };
      } catch (error) {
        console.error('[CONDA_DETECT] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect Conda installations',
        };
      }
    }
  );

  /**
   * Force refresh Conda detection cache
   * Performs a fresh scan of the system for Conda installations
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_REFRESH,
    async (): Promise<IPCResult<CondaDetectionResult>> => {
      try {
        const result = await detectCondaInstallations(true);
        return { success: true, data: result };
      } catch (error) {
        console.error('[CONDA_REFRESH] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to refresh Conda detection',
        };
      }
    }
  );

  // ============================================
  // App-level Environment Handlers
  // ============================================

  /**
   * Setup the auto-claude Conda environment
   * Creates environment and streams progress events to renderer
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_SETUP_AUTO_CLAUDE,
    async (_, config: CondaEnvConfig): Promise<IPCResult<void>> => {
      try {
        const mainWindow = getMainWindow();

        for await (const progress of createEnvironment(config)) {
          // Send progress updates to renderer
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, progress);

          // Check for error state
          if (progress.step === 'error') {
            return {
              success: false,
              error: progress.message,
            };
          }
        }

        return { success: true };
      } catch (error) {
        console.error('[CONDA_SETUP_AUTO_CLAUDE] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to setup auto-claude environment',
        };
      }
    }
  );

  /**
   * Check the status of the auto-claude environment
   * Validates the environment exists and is properly configured
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_CHECK_AUTO_CLAUDE,
    async (_, envPath: string): Promise<IPCResult<CondaEnvValidation>> => {
      try {
        const validation = await verifyEnvironment(envPath);
        return { success: true, data: validation };
      } catch (error) {
        console.error('[CONDA_CHECK_AUTO_CLAUDE] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check auto-claude environment',
        };
      }
    }
  );

  // ============================================
  // Project-level Environment Handlers
  // ============================================

  /**
   * Setup a project-specific Conda environment
   * Creates environment at project/.envs/<name> and generates workspace files
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_SETUP_PROJECT_ENV,
    async (
      _,
      projectPath: string,
      projectName: string,
      pythonVersionParam?: string
    ): Promise<IPCResult<{ envPath: string; workspacePath?: string }>> => {
      try {
        const mainWindow = getMainWindow();

        // Send initial progress - detecting conda
        const detectingProgress: SetupProgress = {
          step: 'detecting',
          message: 'Searching for Conda installations...',
          detail: 'Checking common installation paths (miniconda, anaconda, mambaforge)',
          progress: 10,
          timestamp: new Date().toISOString(),
        };
        mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, detectingProgress);

        // Detect conda installation first
        const detection = await detectCondaInstallations(false);
        if (!detection.found || !detection.preferred) {
          const errorProgress: SetupProgress = {
            step: 'error',
            message: 'No Conda installation found. Please install Miniconda or Anaconda first.',
            progress: 0,
            timestamp: new Date().toISOString(),
          };
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, errorProgress);
          return {
            success: false,
            error: 'No Conda installation found. Please install Miniconda or Anaconda first.',
          };
        }

        // Send progress - found conda
        const foundProgress: SetupProgress = {
          step: 'detecting',
          message: `Found ${detection.preferred.type} at ${detection.preferred.path}`,
          detail: `Version: ${detection.preferred.version}`,
          progress: 20,
          timestamp: new Date().toISOString(),
        };
        mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, foundProgress);

        // Determine Python version to use
        let pythonVersionToUse: string;
        let pythonVersionSource: string;

        if (pythonVersionParam) {
          // Use the version explicitly selected by the user
          pythonVersionToUse = pythonVersionParam;
          pythonVersionSource = 'user selection';

          // Send progress - using user-selected version
          const userVersionProgress: SetupProgress = {
            step: 'analyzing',
            message: `Using Python ${pythonVersionToUse}`,
            detail: `Detected from: ${pythonVersionSource}`,
            progress: 30,
            timestamp: new Date().toISOString(),
          };
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, userVersionProgress);
        } else {
          // Auto-detect from project files
          const analyzingProgress: SetupProgress = {
            step: 'analyzing',
            message: 'Analyzing project Python requirements...',
            detail: 'Checking pyproject.toml, requirements.txt, and other config files',
            progress: 25,
            timestamp: new Date().toISOString(),
          };
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, analyzingProgress);

          // Parse Python version from project files
          const pythonVersion = await parseRequiredPythonVersionAsync(projectPath);
          pythonVersionToUse = pythonVersion.version;
          pythonVersionSource = `${pythonVersion.source} (${pythonVersion.raw})`;

          // Send progress - found python version
          const pythonFoundProgress: SetupProgress = {
            step: 'analyzing',
            message: `Using Python ${pythonVersionToUse}`,
            detail: `Detected from: ${pythonVersionSource}`,
            progress: 30,
            timestamp: new Date().toISOString(),
          };
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, pythonFoundProgress);
        }

        // Build environment path using project structure (respects src/python for mixed projects)
        const envPath = getPythonEnvPath(projectPath, projectName);

        // Build config for environment creation
        const config: CondaEnvConfig = {
          envPath,
          pythonVersion: pythonVersionToUse,
          condaInstallation: detection.preferred,
        };

        // Stream progress from environment creation
        for await (const progress of createEnvironment(config)) {
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, progress);

          if (progress.step === 'error') {
            return {
              success: false,
              error: progress.message,
            };
          }
        }

        // Generate workspace files after environment is created
        let workspacePath: string | undefined;
        try {
          const result = await generateWorkspaceFiles(
            projectPath,
            projectName,
            detection.preferred.path
          );
          workspacePath = result.workspacePath;

          // Send workspace generation progress
          const workspaceProgress: SetupProgress = {
            step: 'generating-scripts',
            message: 'Generated VS Code workspace file',
            detail: workspacePath,
            progress: 95,
            timestamp: new Date().toISOString(),
          };
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, workspaceProgress);
        } catch (workspaceError) {
          // Non-fatal - environment is still usable without workspace file
          console.warn('[CONDA_SETUP_PROJECT_ENV] Failed to generate workspace files:', workspaceError);
        }

        // Send final complete event
        const completeProgress: SetupProgress = {
          step: 'complete',
          message: 'Environment ready',
          detail: `Environment created at ${envPath}`,
          progress: 100,
          timestamp: new Date().toISOString(),
        };
        mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, completeProgress);

        return {
          success: true,
          data: {
            envPath,
            workspacePath,
          },
        };
      } catch (error) {
        console.error('[CONDA_SETUP_PROJECT_ENV] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to setup project environment',
        };
      }
    }
  );

  /**
   * Check the status of a project environment
   * Validates the environment exists and reports Python version/package count
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_CHECK_PROJECT_ENV,
    async (_, envPath: string): Promise<IPCResult<CondaEnvValidation>> => {
      try {
        const validation = await verifyEnvironment(envPath);
        return { success: true, data: validation };
      } catch (error) {
        console.error('[CONDA_CHECK_PROJECT_ENV] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check project environment',
        };
      }
    }
  );

  /**
   * Delete a project environment
   * Removes the environment directory and all its contents
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_DELETE_PROJECT_ENV,
    async (_, envPath: string): Promise<IPCResult<void>> => {
      try {
        const deleted = await deleteEnvironment(envPath);
        if (!deleted) {
          return {
            success: false,
            error: 'Failed to delete environment - it may be in use',
          };
        }
        return { success: true };
      } catch (error) {
        console.error('[CONDA_DELETE_PROJECT_ENV] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete project environment',
        };
      }
    }
  );

  /**
   * Delete activation scripts for a project
   * Removes the workspace file and PowerShell init script
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_DELETE_ACTIVATION_SCRIPTS,
    async (_, projectPath: string): Promise<IPCResult<void>> => {
      try {
        // Extract project name from path
        const projectName = path.basename(projectPath);
        const deleted = await deleteActivationScripts(projectPath, projectName);
        if (!deleted) {
          return {
            success: false,
            error: 'Failed to delete some activation scripts',
          };
        }
        return { success: true };
      } catch (error) {
        console.error('[CONDA_DELETE_ACTIVATION_SCRIPTS] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete activation scripts',
        };
      }
    }
  );

  /**
   * Regenerate workspace/activation scripts for an existing environment
   * Useful when Conda installation path changes or scripts are corrupted
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_REGENERATE_SCRIPTS,
    async (
      _,
      envPath: string,
      projectPath: string
    ): Promise<IPCResult<{ workspacePath: string; initScriptPath: string }>> => {
      try {
        // First verify the environment exists
        const validation = await verifyEnvironment(envPath);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.message || 'Environment is not valid',
          };
        }

        // Detect Conda to get the base path
        const detection = await detectCondaInstallations();
        if (!detection.found || !detection.preferred) {
          return {
            success: false,
            error: 'No Conda installation found',
          };
        }

        // Regenerate activation scripts in the environment
        await generateActivationScripts(envPath, detection.preferred.path);

        // Regenerate workspace files
        const projectName = path.basename(projectPath);
        const result = await generateWorkspaceFiles(
          projectPath,
          projectName,
          detection.preferred.path
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('[CONDA_REGENERATE_SCRIPTS] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to regenerate scripts',
        };
      }
    }
  );

  // ============================================
  // Utility Handlers
  // ============================================

  /**
   * Parse Python version requirements from project files
   * Checks pyproject.toml, requirements.txt, .python-version, etc.
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_GET_PYTHON_VERSION,
    async (_, projectPath: string): Promise<IPCResult<PythonVersionResult>> => {
      try {
        const result = await parseRequiredPythonVersionAsync(projectPath);
        return { success: true, data: result };
      } catch (error) {
        console.error('[CONDA_GET_PYTHON_VERSION] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to parse Python version',
        };
      }
    }
  );

  /**
   * Install dependencies from a requirements file
   * Streams progress events during installation
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_INSTALL_DEPS,
    async (
      _,
      envPath: string,
      requirementsPath: string
    ): Promise<IPCResult<void>> => {
      try {
        const mainWindow = getMainWindow();

        for await (const progress of installDependencies(envPath, requirementsPath)) {
          mainWindow?.webContents.send(IPC_CHANNELS.CONDA_SETUP_PROGRESS, progress);

          if (progress.step === 'error') {
            return {
              success: false,
              error: progress.message,
            };
          }
        }

        return { success: true };
      } catch (error) {
        console.error('[CONDA_INSTALL_DEPS] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to install dependencies',
        };
      }
    }
  );

  /**
   * Get computed paths for a project's Conda environment
   * Returns paths based on detected project structure (pure-python vs mixed)
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_GET_PROJECT_PATHS,
    async (
      _,
      projectPath: string,
      projectName: string
    ): Promise<IPCResult<CondaProjectPaths>> => {
      try {
        // Detect project structure
        const structure = detectProjectStructure(projectPath);

        // Get computed paths
        const envPath = getPythonEnvPath(projectPath, projectName);
        const workspacePath = getWorkspaceFilePath(projectPath, projectName);
        const scriptsPath = getScriptsPath(projectPath);

        // Compute relative paths for display
        const pythonRootRelative = path.relative(projectPath, structure.pythonRoot) || '.';
        const envPathRelative = `.envs/${projectName}/`;
        const scriptsPathRelative = `scripts/`;
        const workspaceFile = `${projectName}.code-workspace`;

        return {
          success: true,
          data: {
            projectType: structure.type,
            pythonRoot: structure.pythonRoot,
            pythonRootRelative: pythonRootRelative === '.' ? '' : pythonRootRelative,
            envPath,
            envPathRelative,
            workspacePath,
            workspaceFile,
            scriptsPath,
            scriptsPathRelative,
          },
        };
      } catch (error) {
        console.error('[CONDA_GET_PROJECT_PATHS] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get project paths',
        };
      }
    }
  );

  /**
   * List available Python versions for environment creation
   * Returns a list of common Python versions that can be installed via conda
   */
  ipcMain.handle(
    IPC_CHANNELS.CONDA_LIST_PYTHON_VERSIONS,
    async (
      _,
      projectPath?: string
    ): Promise<IPCResult<{ versions: string[]; recommended: string; detectedVersion?: string }>> => {
      try {
        // Common Python versions available via conda (from newest to oldest)
        const commonVersions = ['3.13', '3.12', '3.11', '3.10', '3.9', '3.8'];

        // Default recommendation
        let recommended = '3.12';
        let detectedVersion: string | undefined;

        // If project path is provided, detect the required version
        if (projectPath) {
          try {
            const pythonVersion = await parseRequiredPythonVersionAsync(projectPath);
            detectedVersion = pythonVersion.version;
            // Use detected version as recommended if it's in our list
            if (commonVersions.includes(pythonVersion.version)) {
              recommended = pythonVersion.version;
            }
          } catch {
            // Ignore errors - just use default
          }
        }

        return {
          success: true,
          data: {
            versions: commonVersions,
            recommended,
            detectedVersion,
          },
        };
      } catch (error) {
        console.error('[CONDA_LIST_PYTHON_VERSIONS] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list Python versions',
        };
      }
    }
  );
}
