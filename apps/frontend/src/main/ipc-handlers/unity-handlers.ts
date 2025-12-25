import { ipcMain, shell } from 'electron';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { projectStore } from '../project-store';

interface UnityProjectInfo {
  isUnityProject: boolean;
  version?: string;
  projectPath: string;
}

interface UnityEditorInfo {
  version: string;
  path: string;
}

interface UnitySettings {
  unityProjectPath?: string;  // Custom Unity project path (if not at root)
  editorPath?: string;
  buildExecuteMethod?: string;
}

interface UnityRun {
  id: string;
  action: 'editmode-tests' | 'build';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'failed';
  exitCode?: number;
  command: string;
  artifactPaths: {
    runDir: string;
    log?: string;
    testResults?: string;
    stdout?: string;
    stderr?: string;
  };
}

/**
 * Detect if a directory is a Unity project and extract version info
 */
function detectUnityProject(projectPath: string): UnityProjectInfo {
  const projectVersionPath = join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');

  const result: UnityProjectInfo = {
    isUnityProject: false,
    projectPath
  };

  // Primary detection: ProjectSettings/ProjectVersion.txt must exist
  if (!existsSync(projectVersionPath)) {
    return result;
  }

  // Also check for Assets/ and Packages/manifest.json for additional confidence
  const assetsPath = join(projectPath, 'Assets');
  const manifestPath = join(projectPath, 'Packages', 'manifest.json');

  const hasAssets = existsSync(assetsPath);
  const hasManifest = existsSync(manifestPath);

  // If we have ProjectVersion.txt and at least one of the other indicators
  if (hasAssets || hasManifest) {
    result.isUnityProject = true;

    // Parse version from ProjectVersion.txt
    try {
      const content = readFileSync(projectVersionPath, 'utf-8');
      const versionMatch = content.match(/m_EditorVersion:\s*(.+)/);
      if (versionMatch) {
        result.version = versionMatch[1].trim();
      }
    } catch (error) {
      console.error('Failed to read Unity version:', error);
    }
  }

  return result;
}

/**
 * Update Unity project version in ProjectSettings/ProjectVersion.txt
 */
function updateUnityProjectVersion(projectPath: string, newVersion: string): void {
  const projectVersionPath = join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');

  if (!existsSync(projectVersionPath)) {
    throw new Error('ProjectVersion.txt not found');
  }

  try {
    const content = readFileSync(projectVersionPath, 'utf-8');
    const updatedContent = content.replace(
      /m_EditorVersion:\s*.+/,
      `m_EditorVersion: ${newVersion}`
    );
    writeFileSync(projectVersionPath, updatedContent, 'utf-8');
  } catch (error) {
    console.error('Failed to update Unity version:', error);
    throw error;
  }
}

/**
 * Auto-detect Unity Hub path on the system
 */
function autoDetectUnityHub(): string | null {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const hubPath = 'C:\\Program Files\\Unity Hub\\Unity Hub.exe';
      if (existsSync(hubPath)) return hubPath;
    } else if (platform === 'darwin') {
      const hubPath = '/Applications/Unity Hub.app';
      if (existsSync(hubPath)) return hubPath;
    } else if (platform === 'linux') {
      // Linux: Try common paths
      const possiblePaths = [
        join(process.env.HOME || '', 'Unity Hub', 'unityhub'),
        '/usr/bin/unityhub',
        '/usr/local/bin/unityhub'
      ];

      for (const path of possiblePaths) {
        if (existsSync(path)) return path;
      }
    }
  } catch (error) {
    console.error('Failed to auto-detect Unity Hub:', error);
  }

  return null;
}

/**
 * Auto-detect Unity Editors folder on the system
 */
function autoDetectUnityEditorsFolder(): string | null {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const editorsPath = 'C:\\Program Files\\Unity\\Hub\\Editor';
      if (existsSync(editorsPath)) return editorsPath;
    } else if (platform === 'darwin') {
      const editorsPath = '/Applications/Unity/Hub/Editor';
      if (existsSync(editorsPath)) return editorsPath;
    } else if (platform === 'linux') {
      // Linux: Try common paths
      const possiblePaths = [
        join(process.env.HOME || '', 'Unity', 'Hub', 'Editor'),
        join(process.env.HOME || '', '.local', 'share', 'Unity', 'Hub', 'Editor')
      ];

      for (const path of possiblePaths) {
        if (existsSync(path)) return path;
      }
    }
  } catch (error) {
    console.error('Failed to auto-detect Unity Editors folder:', error);
  }

  return null;
}

/**
 * Scan Unity Editors folder and return all editor installations
 */
function scanUnityEditorsFolder(editorsFolder: string): UnityEditorInfo[] {
  const editors: UnityEditorInfo[] = [];
  const platform = process.platform;

  try {
    if (!existsSync(editorsFolder)) {
      return editors;
    }

    const versions = readdirSync(editorsFolder);

    for (const version of versions) {
      let editorPath: string;

      if (platform === 'win32') {
        editorPath = join(editorsFolder, version, 'Editor', 'Unity.exe');
      } else if (platform === 'darwin') {
        editorPath = join(editorsFolder, version, 'Unity.app', 'Contents', 'MacOS', 'Unity');
      } else {
        // Linux
        editorPath = join(editorsFolder, version, 'Editor', 'Unity');
      }

      if (existsSync(editorPath)) {
        editors.push({ version, path: editorPath });
      }
    }
  } catch (error) {
    console.error('Failed to scan Unity editors folder:', error);
  }

  return editors;
}

/**
 * Discover Unity Editor installations on the system
 * @deprecated Use scanUnityEditorsFolder with the editors folder from settings
 */
function discoverUnityEditors(): UnityEditorInfo[] {
  const editorsFolder = autoDetectUnityEditorsFolder();
  if (!editorsFolder) {
    return [];
  }
  return scanUnityEditorsFolder(editorsFolder);
}

/**
 * Get Unity settings for a project
 */
function getUnitySettings(projectId: string): UnitySettings {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const settingsPath = join(project.path, '.auto-claude', 'unity-settings.json');

  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read Unity settings:', error);
    }
  }

  return {};
}

/**
 * Save Unity settings for a project
 */
function saveUnitySettings(projectId: string, settings: UnitySettings): void {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const autoCladePath = join(project.path, '.auto-claude');
  const settingsPath = join(autoCladePath, 'unity-settings.json');

  // Create .auto-claude directory if it doesn't exist
  if (!existsSync(autoCladePath)) {
    mkdirSync(autoCladePath, { recursive: true });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Get the Unity runs directory for a project
 */
function getUnityRunsDir(projectId: string): string {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const runsDir = join(project.path, '.auto-claude', 'unity-runs');

  // Create if it doesn't exist
  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  return runsDir;
}

/**
 * Create a new run directory and return the run ID
 */
function createRunDir(projectId: string, action: 'editmode-tests' | 'build'): { id: string; dir: string } {
  const runsDir = getUnityRunsDir(projectId);

  // Generate run ID: YYYYMMDD-HHMMSS_action
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-').substring(0, 15);
  const id = `${timestamp}_${action}`;
  const runDir = join(runsDir, id);

  mkdirSync(runDir, { recursive: true });

  return { id, dir: runDir };
}

/**
 * Load Unity runs from disk
 */
function loadUnityRuns(projectId: string): UnityRun[] {
  const runsDir = getUnityRunsDir(projectId);
  const runs: UnityRun[] = [];

  try {
    if (existsSync(runsDir)) {
      const entries = readdirSync(runsDir);

      for (const entry of entries) {
        const runJsonPath = join(runsDir, entry, 'run.json');
        if (existsSync(runJsonPath)) {
          try {
            const content = readFileSync(runJsonPath, 'utf-8');
            const run = JSON.parse(content) as UnityRun;
            runs.push(run);
          } catch (error) {
            console.error(`Failed to read run ${entry}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load Unity runs:', error);
  }

  // Sort by startedAt descending (newest first)
  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // Limit to last 50 runs
  return runs.slice(0, 50);
}

/**
 * Save a run record to disk
 */
function saveRunRecord(projectId: string, run: UnityRun): void {
  const runsDir = getUnityRunsDir(projectId);
  const runDir = join(runsDir, run.id);
  const runJsonPath = join(runDir, 'run.json');

  writeFileSync(runJsonPath, JSON.stringify(run, null, 2), 'utf-8');
}

/**
 * Run Unity EditMode tests
 */
async function runEditModeTests(projectId: string, editorPath: string): Promise<void> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Get Unity settings to check for custom Unity project path
  const settings = getUnitySettings(projectId);
  const unityPath = settings.unityProjectPath || project.path;

  const { id, dir: runDir } = createRunDir(projectId, 'editmode-tests');

  const logFile = join(runDir, 'unity-editor.log');
  const testResultsFile = join(runDir, 'test-results.xml');
  const stdoutFile = join(runDir, 'stdout.txt');
  const stderrFile = join(runDir, 'stderr.txt');

  const args = [
    '-runTests',
    '-batchmode',
    '-projectPath', unityPath,
    '-testPlatform', 'EditMode',
    '-testResults', testResultsFile,
    '-logFile', logFile
  ];

  const command = `${editorPath} ${args.join(' ')}`;
  const startTime = new Date();

  // Create initial run record
  const run: UnityRun = {
    id,
    action: 'editmode-tests',
    startedAt: startTime.toISOString(),
    status: 'running',
    command,
    artifactPaths: {
      runDir,
      log: logFile,
      testResults: testResultsFile,
      stdout: stdoutFile,
      stderr: stderrFile
    }
  };

  saveRunRecord(projectId, run);

  return new Promise((resolve, reject) => {
    const process = spawn(editorPath, args, {
      cwd: unityPath
    });

    let stdoutData = '';
    let stderrData = '';

    process.stdout?.on('data', (data) => {
      stdoutData += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderrData += data.toString();
    });

    process.on('close', (code) => {
      const endTime = new Date();

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData, 'utf-8');

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.exitCode = code ?? undefined;
      run.status = code === 0 ? 'success' : 'failed';

      saveRunRecord(projectId, run);
      resolve();
    });

    process.on('error', (error) => {
      const endTime = new Date();

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData + '\n' + error.message, 'utf-8');

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.status = 'failed';

      saveRunRecord(projectId, run);
      reject(error);
    });
  });
}

/**
 * Run Unity custom build
 */
async function runBuild(projectId: string, editorPath: string, executeMethod: string): Promise<void> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Get Unity settings to check for custom Unity project path
  const settings = getUnitySettings(projectId);
  const unityPath = settings.unityProjectPath || project.path;

  const { id, dir: runDir } = createRunDir(projectId, 'build');

  const logFile = join(runDir, 'unity-editor.log');
  const stdoutFile = join(runDir, 'stdout.txt');
  const stderrFile = join(runDir, 'stderr.txt');

  const args = [
    '-batchmode',
    '-quit',
    '-projectPath', unityPath,
    '-executeMethod', executeMethod,
    '-logFile', logFile
  ];

  const command = `${editorPath} ${args.join(' ')}`;
  const startTime = new Date();

  // Create initial run record
  const run: UnityRun = {
    id,
    action: 'build',
    startedAt: startTime.toISOString(),
    status: 'running',
    command,
    artifactPaths: {
      runDir,
      log: logFile,
      stdout: stdoutFile,
      stderr: stderrFile
    }
  };

  saveRunRecord(projectId, run);

  return new Promise((resolve, reject) => {
    const process = spawn(editorPath, args, {
      cwd: unityPath
    });

    let stdoutData = '';
    let stderrData = '';

    process.stdout?.on('data', (data) => {
      stdoutData += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderrData += data.toString();
    });

    process.on('close', (code) => {
      const endTime = new Date();

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData, 'utf-8');

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.exitCode = code ?? undefined;
      run.status = code === 0 ? 'success' : 'failed';

      saveRunRecord(projectId, run);
      resolve();
    });

    process.on('error', (error) => {
      const endTime = new Date();

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData + '\n' + error.message, 'utf-8');

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.status = 'failed';

      saveRunRecord(projectId, run);
      reject(error);
    });
  });
}

/**
 * Register all Unity-related IPC handlers
 */
export function registerUnityHandlers(): void {
  // Detect Unity project
  ipcMain.handle(
    IPC_CHANNELS.UNITY_DETECT_PROJECT,
    async (_, projectPath: string): Promise<IPCResult<UnityProjectInfo>> => {
      try {
        const info = detectUnityProject(projectPath);
        return { success: true, data: info };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect Unity project'
        };
      }
    }
  );

  // Update Unity project version
  ipcMain.handle(
    IPC_CHANNELS.UNITY_UPDATE_PROJECT_VERSION,
    async (_, projectId: string, newVersion: string): Promise<IPCResult<void>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }

        // Get Unity settings to check for custom Unity project path
        const settings = getUnitySettings(projectId);
        const unityPath = settings.unityProjectPath || project.path;

        updateUnityProjectVersion(unityPath, newVersion);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update Unity project version'
        };
      }
    }
  );

  // Discover Unity editors
  ipcMain.handle(
    IPC_CHANNELS.UNITY_DISCOVER_EDITORS,
    async (): Promise<IPCResult<{ editors: UnityEditorInfo[] }>> => {
      try {
        const editors = discoverUnityEditors();
        return { success: true, data: { editors } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to discover Unity editors'
        };
      }
    }
  );

  // Get Unity settings
  ipcMain.handle(
    IPC_CHANNELS.UNITY_GET_SETTINGS,
    async (_, projectId: string): Promise<IPCResult<UnitySettings>> => {
      try {
        const settings = getUnitySettings(projectId);
        return { success: true, data: settings };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get Unity settings'
        };
      }
    }
  );

  // Save Unity settings
  ipcMain.handle(
    IPC_CHANNELS.UNITY_SAVE_SETTINGS,
    async (_, projectId: string, settings: UnitySettings): Promise<IPCResult<void>> => {
      try {
        saveUnitySettings(projectId, settings);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save Unity settings'
        };
      }
    }
  );

  // Run EditMode tests
  ipcMain.handle(
    IPC_CHANNELS.UNITY_RUN_EDITMODE_TESTS,
    async (_, projectId: string, editorPath: string): Promise<IPCResult<void>> => {
      try {
        await runEditModeTests(projectId, editorPath);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run EditMode tests'
        };
      }
    }
  );

  // Run build
  ipcMain.handle(
    IPC_CHANNELS.UNITY_RUN_BUILD,
    async (_, projectId: string, editorPath: string, executeMethod: string): Promise<IPCResult<void>> => {
      try {
        await runBuild(projectId, editorPath, executeMethod);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run build'
        };
      }
    }
  );

  // Load runs
  ipcMain.handle(
    IPC_CHANNELS.UNITY_LOAD_RUNS,
    async (_, projectId: string): Promise<IPCResult<{ runs: UnityRun[] }>> => {
      try {
        const runs = loadUnityRuns(projectId);
        return { success: true, data: { runs } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load Unity runs'
        };
      }
    }
  );

  // Open path (for artifacts)
  ipcMain.handle(
    IPC_CHANNELS.UNITY_OPEN_PATH,
    async (_, path: string): Promise<IPCResult<void>> => {
      try {
        const result = await shell.openPath(path);

        if (result) {
          return {
            success: false,
            error: result
          };
        }

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open path'
        };
      }
    }
  );

  // Open Unity project
  ipcMain.handle(
    IPC_CHANNELS.UNITY_OPEN_PROJECT,
    async (_, projectId: string, editorPath: string): Promise<IPCResult<void>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }

        // Get Unity settings to check for custom Unity project path
        const settings = getUnitySettings(projectId);
        const unityPath = settings.unityProjectPath || project.path;

        // Open Unity in editor mode (not batch mode)
        const args = ['-projectPath', unityPath];

        spawn(editorPath, args, {
          cwd: unityPath,
          detached: true,
          stdio: 'ignore'
        }).unref();

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to open Unity project'
        };
      }
    }
  );

  // Auto-detect Unity Hub
  ipcMain.handle(
    IPC_CHANNELS.UNITY_AUTO_DETECT_HUB,
    async (): Promise<IPCResult<{ path: string | null }>> => {
      try {
        const path = autoDetectUnityHub();
        return { success: true, data: { path } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to auto-detect Unity Hub'
        };
      }
    }
  );

  // Auto-detect Unity Editors folder
  ipcMain.handle(
    IPC_CHANNELS.UNITY_AUTO_DETECT_EDITORS_FOLDER,
    async (): Promise<IPCResult<{ path: string | null }>> => {
      try {
        const path = autoDetectUnityEditorsFolder();
        return { success: true, data: { path } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to auto-detect Unity Editors folder'
        };
      }
    }
  );

  // Scan Unity Editors folder
  ipcMain.handle(
    IPC_CHANNELS.UNITY_SCAN_EDITORS_FOLDER,
    async (_, editorsFolder: string): Promise<IPCResult<{ editors: UnityEditorInfo[] }>> => {
      try {
        const editors = scanUnityEditorsFolder(editorsFolder);
        return { success: true, data: { editors } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to scan Unity Editors folder'
        };
      }
    }
  );

  console.warn('[IPC] Unity handlers registered');
}
