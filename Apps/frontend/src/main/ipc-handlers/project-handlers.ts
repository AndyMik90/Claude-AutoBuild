import { ipcMain, app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { is } from '@electron-toolkit/utils';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  Project,
  ProjectSettings,
  IPCResult,
  InitializationResult,
  AutoBuildVersionInfo,
  GitStatus
} from '../../shared/types';
import { projectStore } from '../project-store';
import {
  initializeProject,
  isInitialized,
  hasLocalSource,
  checkGitStatus,
  initializeGit
} from '../project-initializer';
import { PythonEnvManager, type PythonEnvStatus } from '../python-env-manager';
import { AgentManager } from '../agent';
import { changelogService } from '../changelog-service';
import { insightsService } from '../insights-service';
import { titleGenerator } from '../title-generator';
import type { BrowserWindow } from 'electron';

// ============================================
// Git Helper Functions
// ============================================

/**
 * Get list of git branches for a directory
 */
function getGitBranches(projectPath: string): string[] {
  try {
    const result = execSync('git branch --list --format="%(refname:short)"', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim().split('\n').filter(b => b.trim());
  } catch {
    return [];
  }
}

/**
 * Get the current git branch for a directory
 */
function getCurrentGitBranch(projectPath: string): string | null {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Detect the main branch for a git repository
 * Checks for common main branch names in order of preference
 */
function detectMainBranch(projectPath: string): string | null {
  const branches = getGitBranches(projectPath);
  if (branches.length === 0) return null;

  // Check for common main branch names in order of preference
  const mainBranchCandidates = ['main', 'master', 'develop', 'dev', 'trunk'];
  for (const candidate of mainBranchCandidates) {
    if (branches.includes(candidate)) {
      return candidate;
    }
  }

  // If none of the common names found, check for origin/HEAD reference
  try {
    const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const ref = result.trim();
    // Extract branch name from refs/remotes/origin/main
    const match = ref.match(/refs\/remotes\/origin\/(.+)/);
    if (match && branches.includes(match[1])) {
      return match[1];
    }
  } catch {
    // origin/HEAD not set, continue with fallback
  }

  // Fallback: return the first branch (usually the current one)
  return branches[0] || null;
}

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/**
 * Auto-detect the auto-claude source path relative to the app location.
 * Works across platforms (macOS, Windows, Linux) in both dev and production modes.
 */
const detectAutoBuildSourcePath = (): string | null => {
  const possiblePaths: string[] = [];

  // Development mode paths
  if (is.dev) {
    // In dev, __dirname is typically auto-claude-ui/out/main
    // We need to go up to the project root to find auto-claude/
    possiblePaths.push(
      path.resolve(__dirname, '..', '..', '..', 'auto-claude'),  // From out/main up 3 levels
      path.resolve(__dirname, '..', '..', 'auto-claude'),        // From out/main up 2 levels
      path.resolve(process.cwd(), 'auto-claude'),                // From cwd (project root)
      path.resolve(process.cwd(), '..', 'auto-claude')           // From cwd parent (if running from auto-claude-ui/)
    );
  } else {
    // Production mode paths (packaged app)
    // On Windows/Linux/macOS, the app might be installed anywhere
    // We check common locations relative to the app bundle
    const appPath = app.getAppPath();
    possiblePaths.push(
      path.resolve(appPath, '..', 'auto-claude'),               // Sibling to app
      path.resolve(appPath, '..', '..', 'auto-claude'),         // Up 2 from app
      path.resolve(appPath, '..', '..', '..', 'auto-claude'),   // Up 3 from app
      path.resolve(process.resourcesPath, '..', 'auto-claude'), // Relative to resources
      path.resolve(process.resourcesPath, '..', '..', 'auto-claude')
    );
  }

  // Add process.cwd() as last resort on all platforms
  possiblePaths.push(path.resolve(process.cwd(), 'auto-claude'));

  // Enable debug logging with DEBUG=1
  const debug = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

  if (debug) {
    console.warn('[project-handlers:detectAutoBuildSourcePath] Platform:', process.platform);
    console.warn('[project-handlers:detectAutoBuildSourcePath] Is dev:', is.dev);
    console.warn('[project-handlers:detectAutoBuildSourcePath] __dirname:', __dirname);
    console.warn('[project-handlers:detectAutoBuildSourcePath] app.getAppPath():', app.getAppPath());
    console.warn('[project-handlers:detectAutoBuildSourcePath] process.cwd():', process.cwd());
    console.warn('[project-handlers:detectAutoBuildSourcePath] Checking paths:', possiblePaths);
  }

  for (const p of possiblePaths) {
    // Use requirements.txt as marker - it always exists in auto-claude source
    const markerPath = path.join(p, 'requirements.txt');
    const exists = existsSync(p) && existsSync(markerPath);

    if (debug) {
      console.warn(`[project-handlers:detectAutoBuildSourcePath] Checking ${p}: ${exists ? '✓ FOUND' : '✗ not found'}`);
    }

    if (exists) {
      console.warn(`[project-handlers:detectAutoBuildSourcePath] Auto-detected source path: ${p}`);
      return p;
    }
  }

  console.warn('[project-handlers:detectAutoBuildSourcePath] Could not auto-detect Auto Claude source path.');
  console.warn('[project-handlers:detectAutoBuildSourcePath] Set DEBUG=1 environment variable for detailed path checking.');
  return null;
};

/**
 * Get the configured auto-claude source path from settings, or auto-detect
 */
const getAutoBuildSourcePath = (): string | null => {
  // First check if manually configured
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      if (settings.autoBuildPath && existsSync(settings.autoBuildPath)) {
        return settings.autoBuildPath;
      }
    } catch {
      // Fall through to auto-detect
    }
  }

  // Auto-detect from app location
  return detectAutoBuildSourcePath();
};

/**
 * Configure all Python-dependent services with the managed Python path
 */
const configureServicesWithPython = (
  pythonPath: string,
  autoBuildPath: string,
  agentManager: AgentManager
): void => {
  console.warn('[IPC] Configuring services with Python:', pythonPath);
  agentManager.configure(pythonPath, autoBuildPath);
  changelogService.configure(pythonPath, autoBuildPath);
  insightsService.configure(pythonPath, autoBuildPath);
  titleGenerator.configure(pythonPath, autoBuildPath);
};

/**
 * Initialize the Python environment and configure services
 */
const initializePythonEnvironment = async (
  pythonEnvManager: PythonEnvManager,
  agentManager: AgentManager
): Promise<PythonEnvStatus> => {
  const autoBuildSource = getAutoBuildSourcePath();
  if (!autoBuildSource) {
    console.warn('[IPC] Auto-build source not found, skipping Python env init');
    return {
      ready: false,
      pythonPath: null,
      venvExists: false,
      depsInstalled: false,
      error: 'Auto-build source not found'
    };
  }

  console.warn('[IPC] Initializing Python environment...');
  const status = await pythonEnvManager.initialize(autoBuildSource);

  if (status.ready && status.pythonPath) {
    configureServicesWithPython(status.pythonPath, autoBuildSource, agentManager);
  }

  return status;
};

/**
 * Register all project-related IPC handlers
 */
export function registerProjectHandlers(
  pythonEnvManager: PythonEnvManager,
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Project Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_ADD,
    async (_, projectPath: string): Promise<IPCResult<Project>> => {
      try {
        // Validate path exists
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }

        const project = projectStore.addProject(projectPath);
        return { success: true, data: project };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REMOVE,
    async (_, projectId: string): Promise<IPCResult> => {
      const success = projectStore.removeProject(projectId);
      return { success };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LIST,
    async (): Promise<IPCResult<Project[]>> => {
      // Validate that .auto-claude folders still exist for all projects
      // If a folder was deleted, reset autoBuildPath so UI prompts for reinitialization
      const resetIds = projectStore.validateProjects();
      if (resetIds.length > 0) {
        console.warn('[IPC] PROJECT_LIST: Detected missing .auto-claude folders for', resetIds.length, 'project(s)');
      }

      const projects = projectStore.getProjects();
      console.warn('[IPC] PROJECT_LIST returning', projects.length, 'projects');
      return { success: true, data: projects };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_SETTINGS,
    async (
      _,
      projectId: string,
      settings: Partial<ProjectSettings>
    ): Promise<IPCResult> => {
      const project = projectStore.updateProjectSettings(projectId, settings);
      if (project) {
        return { success: true };
      }
      return { success: false, error: 'Project not found' };
    }
  );

  // ============================================
  // Project Initialization Operations
  // ============================================

  // Set up Python environment status events
  pythonEnvManager.on('status', (message: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('python-env:status', message);
    }
  });

  pythonEnvManager.on('error', (error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('python-env:error', error);
    }
  });

  pythonEnvManager.on('ready', (pythonPath: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('python-env:ready', pythonPath);
    }
  });

  // Initialize Python environment on startup (non-blocking)
  initializePythonEnvironment(pythonEnvManager, agentManager).then((status) => {
    console.warn('[IPC] Python environment initialized:', status);
  });

  // IPC handler to get Python environment status
  ipcMain.handle(
    'python-env:get-status',
    async (): Promise<IPCResult<PythonEnvStatus>> => {
      const status = await pythonEnvManager.getStatus();
      return { success: true, data: status };
    }
  );

  // IPC handler to reinitialize Python environment
  ipcMain.handle(
    'python-env:reinitialize',
    async (): Promise<IPCResult<PythonEnvStatus>> => {
      const status = await initializePythonEnvironment(pythonEnvManager, agentManager);
      return { success: status.ready, data: status, error: status.error };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_INITIALIZE,
    async (_, projectId: string): Promise<IPCResult<InitializationResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const result = initializeProject(project.path);

        if (result.success) {
          // Update project's autoBuildPath
          projectStore.updateAutoBuildPath(projectId, '.auto-claude');
        }

        return { success: result.success, data: result, error: result.error };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // PROJECT_UPDATE_AUTOBUILD is deprecated - .auto-claude only contains data, no code to update
  // Kept for API compatibility, returns success immediately
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UPDATE_AUTOBUILD,
    async (_, projectId: string): Promise<IPCResult<InitializationResult>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        // Nothing to update - .auto-claude only contains data directories
        // The framework runs from the source repo
        return { success: true, data: { success: true } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // PROJECT_CHECK_VERSION now just checks if project is initialized
  // Version tracking for .auto-claude is removed since it only contains data
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CHECK_VERSION,
    async (_, projectId: string): Promise<IPCResult<AutoBuildVersionInfo>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        return {
          success: true,
          data: {
            isInitialized: isInitialized(project.path),
            updateAvailable: false // No updates for .auto-claude - it's just data
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Check if project has local auto-claude source (is dev project)
  ipcMain.handle(
    'project:has-local-source',
    async (_, projectId: string): Promise<IPCResult<boolean>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }
        return { success: true, data: hasLocalSource(project.path) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // ============================================
  // Git Operations
  // ============================================

  // Get all branches for a project
  ipcMain.handle(
    IPC_CHANNELS.GIT_GET_BRANCHES,
    async (_, projectPath: string): Promise<IPCResult<string[]>> => {
      try {
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }
        const branches = getGitBranches(projectPath);
        return { success: true, data: branches };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Get current branch for a project
  ipcMain.handle(
    IPC_CHANNELS.GIT_GET_CURRENT_BRANCH,
    async (_, projectPath: string): Promise<IPCResult<string | null>> => {
      try {
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }
        const branch = getCurrentGitBranch(projectPath);
        return { success: true, data: branch };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Auto-detect main branch for a project
  ipcMain.handle(
    IPC_CHANNELS.GIT_DETECT_MAIN_BRANCH,
    async (_, projectPath: string): Promise<IPCResult<string | null>> => {
      try {
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }
        const mainBranch = detectMainBranch(projectPath);
        return { success: true, data: mainBranch };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Check git status for a project (is it a repo? has commits?)
  ipcMain.handle(
    IPC_CHANNELS.GIT_CHECK_STATUS,
    async (_, projectPath: string): Promise<IPCResult<GitStatus>> => {
      try {
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }
        const gitStatus = checkGitStatus(projectPath);
        return { success: true, data: gitStatus };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Initialize git in a project (run git init and create initial commit)
  ipcMain.handle(
    IPC_CHANNELS.GIT_INITIALIZE,
    async (_, projectPath: string): Promise<IPCResult<InitializationResult>> => {
      try {
        if (!existsSync(projectPath)) {
          return { success: false, error: 'Directory does not exist' };
        }
        const result = initializeGit(projectPath);
        return { success: result.success, data: result, error: result.error };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );
}
