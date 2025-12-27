import { ipcMain, shell, clipboard } from 'electron';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync, createWriteStream } from 'fs';
import { join, relative } from 'path';
import { spawn } from 'child_process';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { projectStore } from '../project-store';
import { parseUnityTestResults } from '../utils/unity-test-parser';
import { buildUnityErrorDigest } from '../utils/unity-error-digest';
import { unityProcessStore, killProcessTree } from '../utils/process-manager';

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

interface UnityTweakParams {
  targetGroup?: string;
  symbol?: string;
  backend?: string;
  buildTarget?: string;
}

interface UnityRun {
  id: string;
  action: 'editmode-tests' | 'playmode-tests' | 'build' | 'tweak' | 'upm-resolve' | 'bridge-install';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'failed' | 'canceled';
  exitCode?: number;
  command: string;
  pid?: number;
  actionId?: string;
  params?: {
    editorPath: string;
    projectPath: string;
    executeMethod?: string;
    testPlatform?: string;
    buildTarget?: string;  // for PlayMode and Build
    testFilter?: string;   // for test filtering
    tweakAction?: string;  // M3: tweak action type
  } & UnityTweakParams;    // M3: additional typed tweak params
  artifactPaths: {
    runDir: string;
    log?: string;
    testResults?: string;
    stdout?: string;
    stderr?: string;
    errorDigest?: string;
    preBackupDir?: string;   // M3: pre-backup directory
    postBackupDir?: string;  // M3: post-backup directory
    diffFile?: string;       // M3: diff file
  };
  testsSummary?: {
    passed: number;
    failed: number;
    skipped: number;
    durationSeconds?: number;
  };
  errorSummary?: {
    errorCount: number;
    firstErrorLine?: string;
  };
  tweakSummary?: {             // M3: tweak summary
    action: string;
    description: string;
    changedFiles: string[];
    backupCreated: boolean;
  };
  canceledReason?: string;
}

interface UnityProfile {
  id: string;
  name: string;
  editorPath?: string;  // Optional: per-profile editor override
  buildExecuteMethod?: string;
  testDefaults?: {
    editModeEnabled?: boolean;
    playModeEnabled?: boolean;
    playModeBuildTarget?: string;
    testFilter?: string;
  };
  buildDefaults?: {
    enabled?: boolean;
    buildTarget?: string;
    developmentBuild?: boolean;
    extraArgs?: string[];
  };
}

interface UnityProfileSettings {
  profiles: UnityProfile[];
  activeProfileId?: string;
}

type PipelineStepType = 'validate' | 'editmode-tests' | 'playmode-tests' | 'build' | 'collect-artifacts';

interface PipelineStep {
  type: PipelineStepType;
  enabled: boolean;
  runId?: string;  // Reference to the actual run
  status?: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled';
  errorDetails?: {
    type: 'test-failure' | 'execution-error' | 'unknown';
    message?: string;
  };
}

interface UnityPipelineRun {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'failed' | 'canceled';
  selectedProfileId?: string;
  selectedProfileName?: string;
  steps: PipelineStep[];
  continueOnFail?: boolean;
  artifactPaths: {
    pipelineDir: string;
    summary?: string;
    bundleDir?: string;
  };
  summary?: {
    totalSteps: number;
    successCount: number;
    failedCount: number;
    canceledCount: number;
    skippedCount: number;
  };
}

// Constants
const DEFAULT_CANCELED_REASON = 'canceled (reason unknown)';

// Error patterns for detecting execution errors in pipeline steps
const EXECUTION_ERROR_PATTERNS = [
  'not found',
  'not configured',
  'failed to',
  'cannot find',
  'missing',
  'invalid path',
  'permission denied'
];

/**
 * Parse ISO timestamp for use in IDs (includes milliseconds for uniqueness)
 * Converts "2024-12-26T14:30:45.123Z" to "20241226-143045123"
 */
function parseTimestampForId(now: Date): string {
  const iso = now.toISOString();
  const parts = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z/);
  if (!parts) {
    // Fallback to Date.now() if regex parsing fails
    console.warn(`Failed to parse ISO timestamp format: expected YYYY-MM-DDTHH:MM:SS.sssZ, got ${iso}. Using Date.now() fallback.`);
    return Date.now().toString();
  }
  const [, y, m, d, hh, mm, ss, ms] = parts;
  return `${y}${m}${d}-${hh}${mm}${ss}${ms}`;
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
 * Parse Unity version string to major.minor format
 * Example: "2021.3.15f1" -> { major: 2021, minor: 3 }
 */
function parseUnityVersion(version: string): { major: number; minor: number } | null {
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10)
  };
}

/**
 * Determine the appropriate macOS build target based on Unity version
 * Unity versions before 2017 used different naming conventions
 * Unity 2017-2019: StandaloneOSX (universal) or StandaloneOSXIntel64
 * Unity 2020+: StandaloneOSX (universal, includes Apple Silicon support in 2020.2+)
 */
function getMacOSBuildTarget(unityVersion?: string): string {
  // Default to modern target
  const defaultTarget = 'StandaloneOSX';
  
  if (!unityVersion) {
    return defaultTarget;
  }

  const parsed = parseUnityVersion(unityVersion);
  if (!parsed) {
    return defaultTarget;
  }

  // Unity 2017+ uses StandaloneOSX
  // Earlier versions used different names, but those are very rare now
  if (parsed.major < 2017) {
    // For very old Unity versions, use StandaloneOSXUniversal
    // Note: These versions are rarely used in modern development
    return 'StandaloneOSXUniversal';
  }

  return defaultTarget;
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
 * Quote and escape a string for *display/logging only*.
 *
 * This helper is intended solely for building human-readable command strings
 * (e.g. for logs or devtools). It is **not** safe to use for constructing
 * shell commands, as different shells have different escaping requirements.
 *
 * Escapes internal backslashes and double quotes for readability, and wraps
 * the string in double quotes if it contains spaces or common shell special
 * characters.
 */
function quoteShellArg(arg: string): string {
  // First escape backslashes, then escape internal quotes for display
  const escaped = arg
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  // Quote if the original argument contains spaces or special characters
  // (test against original arg to avoid false positives from escaped backslashes)
  if (/[\s&|<>()$`"]/.test(arg)) {
    return `"${escaped}"`;
  }
  return escaped;
}

/**
 * Build a display-friendly command string with quoted arguments.
 *
 * This is for logging / debugging only and must not be used to construct
 * actual shell command lines. The actual command execution uses spawn() with
 * an arguments array, which is the safe approach.
 */
function buildCommandString(executable: string, args: string[]): string {
  return `${quoteShellArg(executable)} ${args.map(quoteShellArg).join(' ')}`;
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
function createRunDir(projectId: string, action: 'editmode-tests' | 'playmode-tests' | 'build' | 'tweak' | 'upm-resolve' | 'bridge-install'): { id: string; dir: string } {
  const runsDir = getUnityRunsDir(projectId);

  // Generate run ID: YYYYMMDD-HHMMSSmmm_action
  const now = new Date();
  const timestamp = parseTimestampForId(now);
  const id = `${timestamp}_${action}`;
  const runDir = join(runsDir, id);

  mkdirSync(runDir, { recursive: true });

  return { id, dir: runDir };
}

/**
 * Create a new pipeline directory and return the pipeline ID
 */
function createPipelineDir(projectId: string): { id: string; dir: string } {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const pipelinesDir = join(project.path, '.auto-claude', 'unity-runs', 'pipelines');

  // Create if it doesn't exist
  if (!existsSync(pipelinesDir)) {
    mkdirSync(pipelinesDir, { recursive: true });
  }

  // Generate pipeline ID: YYYYMMDD-HHMMSSmmm_pipeline
  const now = new Date();
  const timestamp = parseTimestampForId(now);
  const id = `${timestamp}_pipeline`;
  const pipelineDir = join(pipelinesDir, id);

  mkdirSync(pipelineDir, { recursive: true });

  return { id, dir: pipelineDir };
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
 * Load a single run record from disk
 */
function loadRunRecord(projectId: string, runId: string): UnityRun | null {
  try {
    const runsDir = getUnityRunsDir(projectId);
    const runJsonPath = join(runsDir, runId, 'run.json');

    if (!existsSync(runJsonPath)) {
      return null;
    }

    const content = readFileSync(runJsonPath, 'utf-8');
    return JSON.parse(content) as UnityRun;
  } catch (error) {
    console.error(`Failed to load run record ${runId}:`, error);
    return null;
  }
}

/**
 * Delete a single Unity run
 */
function deleteUnityRun(projectId: string, runId: string): void {
  try {
    const runsDir = getUnityRunsDir(projectId);
    const runDir = join(runsDir, runId);

    if (existsSync(runDir)) {
      // Delete the entire run directory
      rmSync(runDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Failed to delete run ${runId}:`, error);
    throw new Error(`Failed to delete run: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clear all Unity runs for a project
 */
function clearUnityRuns(projectId: string): void {
  try {
    const runsDir = getUnityRunsDir(projectId);

    if (existsSync(runsDir)) {
      // Read all run directories and delete them
      const entries = readdirSync(runsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const runDir = join(runsDir, entry.name);
          rmSync(runDir, { recursive: true, force: true });
        }
      }
    }
  } catch (error) {
    console.error('Failed to clear Unity runs:', error);
    throw new Error(`Failed to clear runs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Run Unity EditMode tests
 */
async function runEditModeTests(projectId: string, editorPath: string): Promise<string> {
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
  const errorDigestFile = join(runDir, 'error-digest.txt');

  const args = [
    '-runTests',
    '-batchmode',
    '-projectPath', unityPath,
    '-testPlatform', 'EditMode',
    '-testResults', testResultsFile,
    '-logFile', logFile
  ];

  const command = buildCommandString(editorPath, args);
  const startTime = new Date();

  // Create initial run record
  const run: UnityRun = {
    id,
    action: 'editmode-tests',
    actionId: 'unity.runEditModeTests',
    startedAt: startTime.toISOString(),
    status: 'running',
    command,
    params: {
      editorPath,
      projectPath: unityPath,
      testPlatform: 'EditMode'
    },
    artifactPaths: {
      runDir,
      log: logFile,
      testResults: testResultsFile,
      stdout: stdoutFile,
      stderr: stderrFile,
      errorDigest: errorDigestFile
    }
  };

  saveRunRecord(projectId, run);

  return new Promise((resolve, reject) => {
    const childProcess = spawn(editorPath, args, {
      cwd: unityPath,
      detached: process.platform !== 'win32' // Use process groups on Unix
    });

    // Store PID for cancellation
    const pid = childProcess.pid;
    if (pid) {
      run.pid = pid;
      saveRunRecord(projectId, run);
      unityProcessStore.register(id, pid);
    }

    let stdoutData = '';
    let stderrData = '';

    childProcess.stdout?.on('data', (data) => {
      stdoutData += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderrData += data.toString();
    });

    childProcess.on('close', async (code) => {
      const endTime = new Date();

      // Unregister process
      unityProcessStore.unregister(id);

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData, 'utf-8');

      // Check if this was a cancellation by reloading from disk
      // to avoid race condition with cancelRun handler
      const diskRun = loadRunRecord(projectId, id);
      const wasCanceled = diskRun?.status === 'canceled';

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.exitCode = code ?? undefined;

      if (!wasCanceled) {
        run.status = code === 0 ? 'success' : 'failed';
      } else {
        // Preserve cancellation status and reason from disk
        run.status = 'canceled';
        run.canceledReason = diskRun.canceledReason ?? DEFAULT_CANCELED_REASON;
      }

      // Parse test results if available
      if (existsSync(testResultsFile)) {
        try {
          const testSummary = await parseUnityTestResults(testResultsFile);
          run.testsSummary = testSummary;
        } catch (error) {
          console.error('Failed to parse test results:', error);
        }
      }

      // Build error digest
      if (existsSync(logFile)) {
        try {
          const errorSummary = buildUnityErrorDigest(logFile, errorDigestFile);
          run.errorSummary = errorSummary;
        } catch (error) {
          console.error('Failed to build error digest:', error);
        }
      }

      saveRunRecord(projectId, run);
      resolve(id);
    });

    childProcess.on('error', (error) => {
      const endTime = new Date();

      // Unregister process
      unityProcessStore.unregister(id);

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
 * Run Unity PlayMode tests
 */
async function runPlayModeTests(
  projectId: string,
  editorPath: string,
  options?: { buildTarget?: string; testFilter?: string }
): Promise<string> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Get Unity settings to check for custom Unity project path
  const settings = getUnitySettings(projectId);
  const unityPath = settings.unityProjectPath || project.path;

  const { id, dir: runDir } = createRunDir(projectId, 'playmode-tests');

  const logFile = join(runDir, 'unity-editor.log');
  const testResultsFile = join(runDir, 'test-results.xml');
  const stdoutFile = join(runDir, 'stdout.txt');
  const stderrFile = join(runDir, 'stderr.txt');
  const errorDigestFile = join(runDir, 'error-digest.txt');

  // Determine default build target based on platform
  let defaultBuildTarget = 'StandaloneWindows64';
  if (process.platform === 'darwin') {
    // Detect Unity version for proper macOS build target selection
    const projectInfo = detectUnityProject(unityPath);
    defaultBuildTarget = getMacOSBuildTarget(projectInfo.version);
  } else if (process.platform === 'linux') {
    defaultBuildTarget = 'StandaloneLinux64';
  }

  const buildTarget = options?.buildTarget || defaultBuildTarget;

  const args = [
    '-runTests',
    '-batchmode',
    '-projectPath', unityPath,
    '-testPlatform', 'PlayMode',
    '-testResults', testResultsFile,
    '-buildTarget', buildTarget,
    '-logFile', logFile
  ];

  // Add test filter if provided
  if (options?.testFilter) {
    args.push('-testFilter', options.testFilter);
  }

  const command = buildCommandString(editorPath, args);
  const startTime = new Date();

  // Create initial run record
  const run: UnityRun = {
    id,
    action: 'playmode-tests',
    actionId: 'unity.runPlayModeTests',
    startedAt: startTime.toISOString(),
    status: 'running',
    command,
    params: {
      editorPath,
      projectPath: unityPath,
      testPlatform: 'PlayMode',
      buildTarget,
      testFilter: options?.testFilter
    },
    artifactPaths: {
      runDir,
      log: logFile,
      testResults: testResultsFile,
      stdout: stdoutFile,
      stderr: stderrFile,
      errorDigest: errorDigestFile
    }
  };

  saveRunRecord(projectId, run);

  return new Promise((resolve, reject) => {
    const childProcess = spawn(editorPath, args, {
      cwd: unityPath,
      detached: process.platform !== 'win32' // Use process groups on Unix
    });

    // Store PID for cancellation
    const pid = childProcess.pid;
    if (pid) {
      run.pid = pid;
      saveRunRecord(projectId, run);
      unityProcessStore.register(id, pid);
    }

    let stdoutData = '';
    let stderrData = '';

    childProcess.stdout?.on('data', (data) => {
      stdoutData += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderrData += data.toString();
    });

    childProcess.on('close', async (code) => {
      const endTime = new Date();

      // Unregister process
      unityProcessStore.unregister(id);

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData, 'utf-8');

      // Check if this was a cancellation by reloading from disk
      // to avoid race condition with cancelRun handler
      const diskRun = loadRunRecord(projectId, id);
      const wasCanceled = diskRun?.status === 'canceled';

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.exitCode = code ?? undefined;

      if (!wasCanceled) {
        run.status = code === 0 ? 'success' : 'failed';
      } else {
        // Preserve cancellation status and reason from disk
        run.status = 'canceled';
        run.canceledReason = diskRun.canceledReason ?? DEFAULT_CANCELED_REASON;
      }

      // Parse test results if available
      if (existsSync(testResultsFile)) {
        try {
          const testSummary = await parseUnityTestResults(testResultsFile);
          run.testsSummary = testSummary;
        } catch (error) {
          console.error('Failed to parse test results:', error);
        }
      }

      // Build error digest
      if (existsSync(logFile)) {
        try {
          const errorSummary = buildUnityErrorDigest(logFile, errorDigestFile);
          run.errorSummary = errorSummary;
        } catch (error) {
          console.error('Failed to build error digest:', error);
        }
      }

      saveRunRecord(projectId, run);
      resolve(id);
    });

    childProcess.on('error', (error) => {
      const endTime = new Date();

      // Unregister process
      unityProcessStore.unregister(id);

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
async function runBuild(projectId: string, editorPath: string, executeMethod: string): Promise<string> {
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
  const errorDigestFile = join(runDir, 'error-digest.txt');

  const args = [
    '-batchmode',
    '-quit',
    '-projectPath', unityPath,
    '-executeMethod', executeMethod,
    '-logFile', logFile
  ];

  const command = buildCommandString(editorPath, args);
  const startTime = new Date();

  // Create initial run record
  const run: UnityRun = {
    id,
    action: 'build',
    actionId: 'unity.runBuild',
    startedAt: startTime.toISOString(),
    status: 'running',
    command,
    params: {
      editorPath,
      projectPath: unityPath,
      executeMethod
    },
    artifactPaths: {
      runDir,
      log: logFile,
      stdout: stdoutFile,
      stderr: stderrFile,
      errorDigest: errorDigestFile
    }
  };

  saveRunRecord(projectId, run);

  return new Promise((resolve, reject) => {
    const childProcess = spawn(editorPath, args, {
      cwd: unityPath,
      detached: process.platform !== 'win32' // Use process groups on Unix
    });

    // Store PID for cancellation
    const pid = childProcess.pid;
    if (pid) {
      run.pid = pid;
      saveRunRecord(projectId, run);
      unityProcessStore.register(id, pid);
    }

    let stdoutData = '';
    let stderrData = '';

    childProcess.stdout?.on('data', (data) => {
      stdoutData += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderrData += data.toString();
    });

    childProcess.on('close', async (code) => {
      const endTime = new Date();

      // Unregister process
      unityProcessStore.unregister(id);

      // Save stdout and stderr
      writeFileSync(stdoutFile, stdoutData, 'utf-8');
      writeFileSync(stderrFile, stderrData, 'utf-8');

      // Check if this was a cancellation by reloading from disk
      // to avoid race condition with cancelRun handler
      const diskRun = loadRunRecord(projectId, id);
      const wasCanceled = diskRun?.status === 'canceled';

      // Update run record
      run.endedAt = endTime.toISOString();
      run.durationMs = endTime.getTime() - startTime.getTime();
      run.exitCode = code ?? undefined;

      if (!wasCanceled) {
        run.status = code === 0 ? 'success' : 'failed';
      } else {
        // Preserve cancellation status and reason from disk
        run.status = 'canceled';
        run.canceledReason = diskRun.canceledReason ?? DEFAULT_CANCELED_REASON;
      }

      // Build error digest
      if (existsSync(logFile)) {
        try {
          const errorSummary = buildUnityErrorDigest(logFile, errorDigestFile);
          run.errorSummary = errorSummary;
        } catch (error) {
          console.error('Failed to build error digest:', error);
        }
      }

      saveRunRecord(projectId, run);
      resolve(id);
    });

    childProcess.on('error', (error) => {
      const endTime = new Date();

      // Unregister process
      unityProcessStore.unregister(id);

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
 * Run a Unity tweak action (define symbols, scripting backend, build target, UPM)
 */
async function runUnityTweak(
  projectId: string,
  editorPath: string,
  tweakAction: string,
  params: UnityTweakParams
): Promise<string> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Get Unity settings to check for custom Unity project path
  const settings = getUnitySettings(projectId);
  const projectPath = settings.unityProjectPath || project.path;

  const { id: runId, dir: runDir } = createRunDir(projectId, 'tweak');

  // Import tweak utilities
  const {
    createPreBackup,
    createPostBackupAndDiff,
    getFilesToBackup,
    buildTweakCommand,
    getTweakDescription,
  } = await import('../utils/unity-tweaks');

  mkdirSync(runDir, { recursive: true });

  // Determine files to backup
  const filesToBackup = getFilesToBackup(tweakAction, params);

  // Create pre-backup
  const backup = await createPreBackup(projectPath, runDir, filesToBackup);

  // Build Unity command
  const logFilePath = join(runDir, 'unity-editor.log');
  const stdoutPath = join(runDir, 'stdout.txt');
  const stderrPath = join(runDir, 'stderr.txt');

  const commandArgs = buildTweakCommand(editorPath, projectPath, tweakAction, params, logFilePath);
  const commandDisplay = `${editorPath} ${commandArgs.join(' ')}`;

  // Create initial run record
  const run: UnityRun = {
    id: runId,
    action: 'tweak',
    startedAt: new Date().toISOString(),
    status: 'running',
    command: commandDisplay,
    params: {
      editorPath,
      projectPath,
      tweakAction,
      ...params,
    },
    artifactPaths: {
      runDir,
      log: logFilePath,
      stdout: stdoutPath,
      stderr: stderrPath,
      preBackupDir: backup.preDir,
    },
  };

  saveRunRecord(projectId, run);

  const startTime = Date.now();

  // Return promise for process handling (non-async executor)
  return new Promise((resolve, reject) => {
    // Spawn Unity process
    const stdoutStream = createWriteStream(stdoutPath);
    const stderrStream = createWriteStream(stderrPath);

    const unityProcess = spawn(editorPath, commandArgs, {
      cwd: projectPath,
      detached: true,
    });

    // Store PID for cancellation
    const pid = unityProcess.pid;
    if (pid) {
      run.pid = pid;
      saveRunRecord(projectId, run);
      unityProcessStore.register(runId, pid);
    }

    unityProcess.stdout.on('data', (data) => {
      stdoutStream.write(data);
    });

    unityProcess.stderr.on('data', (data) => {
      stderrStream.write(data);
    });

    unityProcess.on('close', async (code) => {
      stdoutStream.end();
      stderrStream.end();

      // Unregister process
      unityProcessStore.unregister(runId);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Check if this was a cancellation by reloading from disk
      const diskRun = loadRunRecord(projectId, runId);
      const wasCanceled = diskRun?.status === 'canceled';

      try {
        // Create post-backup and diff
        const { changedFiles, diffPath } = await createPostBackupAndDiff(
          projectPath,
          runDir,
          backup,
          true // Use git if available
        );

        // Build error digest
        const errorDigestPath = join(runDir, 'error-digest.txt');
        const errorDigest = buildUnityErrorDigest(logFilePath, errorDigestPath);

        run.endedAt = new Date().toISOString();
        run.durationMs = duration;
        run.exitCode = code;
        run.status = wasCanceled ? 'canceled' : code === 0 ? 'success' : 'failed';
        run.artifactPaths.postBackupDir = backup.postDir;
        run.artifactPaths.diffFile = diffPath;
        run.artifactPaths.errorDigest = errorDigestPath;
        run.errorSummary = {
          errorCount: errorDigest.errorCount,
          firstErrorLine: errorDigest.firstErrorLine,
        };
        run.tweakSummary = {
          action: tweakAction,
          description: getTweakDescription(tweakAction, params),
          changedFiles,
          backupCreated: true,
        };

        if (wasCanceled) {
          run.canceledReason = 'User canceled';
        }

        saveRunRecord(projectId, run);

        if (code === 0) {
          resolve(runId);
        } else {
          reject(new Error(`Unity tweak failed with exit code ${code}`));
        }
      } catch (error) {
        console.error('Error processing tweak results:', error);
        run.endedAt = new Date().toISOString();
        run.durationMs = duration;
        run.exitCode = code;
        run.status = 'failed';
        run.errorSummary = {
          errorCount: 1,
          firstErrorLine: error instanceof Error ? error.message : 'Unknown error',
        };
        saveRunRecord(projectId, run);
        reject(error);
      }
    });

    unityProcess.on('error', (error) => {
      stdoutStream.end();
      stderrStream.end();

      // Unregister process
      unityProcessStore.unregister(runId);

      run.endedAt = new Date().toISOString();
      run.durationMs = Date.now() - startTime;
      run.status = 'failed';
      run.errorSummary = {
        errorCount: 1,
        firstErrorLine: error.message,
      };
      saveRunRecord(projectId, run);
      reject(error);
    });
  });
}

/**
 * Get Unity profiles for a project
 */
function getUnityProfiles(projectId: string): UnityProfileSettings {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const profilesPath = join(project.path, '.auto-claude', 'unity-profiles.json');

  if (existsSync(profilesPath)) {
    try {
      const content = readFileSync(profilesPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read Unity profiles:', error);
    }
  }

  // Return default profiles if none exist
  const defaultProfiles: UnityProfileSettings['profiles'] = [
    {
      id: 'quest',
      name: 'Quest',
      testDefaults: {
        editModeEnabled: true,
        playModeEnabled: true,
        playModeBuildTarget: 'Android'
      },
      buildDefaults: {
        enabled: true,
        buildTarget: 'Android'
      }
    },
    {
      id: 'pcvr',
      name: 'PCVR',
      testDefaults: {
        editModeEnabled: true,
        playModeEnabled: true,
        playModeBuildTarget: 'StandaloneWindows64'
      },
      buildDefaults: {
        enabled: true,
        buildTarget: 'StandaloneWindows64'
      }
    },
    {
      id: 'mac',
      name: 'macOS',
      testDefaults: {
        editModeEnabled: true,
        playModeEnabled: true,
        playModeBuildTarget: 'StandaloneOSX'
      },
      buildDefaults: {
        enabled: true,
        buildTarget: 'StandaloneOSX'
      }
    },
    {
      id: 'ci',
      name: 'CI',
      testDefaults: {
        editModeEnabled: true,
        playModeEnabled: true,
        playModeBuildTarget: 'StandaloneLinux64'
      },
      buildDefaults: {
        enabled: true
      }
    }
  ];

  // Default active profile based on platform
  let defaultActiveProfileId: string;
  switch (process.platform) {
    case 'win32':
      defaultActiveProfileId = 'pcvr';
      break;
    case 'darwin':
      defaultActiveProfileId = 'mac';
      break;
    case 'linux':
      defaultActiveProfileId = 'ci';
      break;
    default:
      defaultActiveProfileId = 'pcvr';
      break;
  }

  return {
    profiles: defaultProfiles,
    activeProfileId: defaultActiveProfileId
  };
}

/**
 * Save Unity profiles for a project
 */
function saveUnityProfiles(projectId: string, profileSettings: UnityProfileSettings): void {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const autoCladePath = join(project.path, '.auto-claude');
  const profilesPath = join(autoCladePath, 'unity-profiles.json');

  // Create .auto-claude directory if it doesn't exist
  if (!existsSync(autoCladePath)) {
    mkdirSync(autoCladePath, { recursive: true });
  }

  writeFileSync(profilesPath, JSON.stringify(profileSettings, null, 2), 'utf-8');
}

/**
 * Create a new Unity profile
 */
function createUnityProfile(projectId: string, profile: Omit<UnityProfile, 'id'>): UnityProfile {
  const profileSettings = getUnityProfiles(projectId);

  // Generate a unique ID based on the name with robust sanitization
  let id = profile.name
    // Normalize to decompose accented characters
    .normalize('NFKD')
    // Remove combining diacritical marks
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Replace any sequence of non-letter/number characters with a single hyphen
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    // Trim leading and trailing hyphens
    .replace(/^-+|-+$/g, '');
  
  // Fallback if sanitized name is empty
  if (!id) {
    id = `profile-${Date.now()}`;
  }

  // Ensure uniqueness
  let finalId = id;
  let counter = 1;
  while (profileSettings.profiles.some(p => p.id === finalId)) {
    finalId = `${id}-${counter}`;
    counter++;
  }

  const newProfile: UnityProfile = {
    ...profile,
    id: finalId
  };

  profileSettings.profiles.push(newProfile);
  saveUnityProfiles(projectId, profileSettings);

  return newProfile;
}

/**
 * Update a Unity profile
 */
function updateUnityProfile(projectId: string, profileId: string, updates: Partial<Omit<UnityProfile, 'id'>>): void {
  const profileSettings = getUnityProfiles(projectId);
  const profileIndex = profileSettings.profiles.findIndex(p => p.id === profileId);

  if (profileIndex === -1) {
    throw new Error('Profile not found');
  }

  profileSettings.profiles[profileIndex] = {
    ...profileSettings.profiles[profileIndex],
    ...updates
  };

  saveUnityProfiles(projectId, profileSettings);
}

/**
 * Delete a Unity profile
 */
function deleteUnityProfile(projectId: string, profileId: string): void {
  const profileSettings = getUnityProfiles(projectId);
  const profileIndex = profileSettings.profiles.findIndex(p => p.id === profileId);

  if (profileIndex === -1) {
    throw new Error('Profile not found');
  }

  profileSettings.profiles.splice(profileIndex, 1);

  // If the deleted profile was active, set active to the first available profile
  if (profileSettings.activeProfileId === profileId && profileSettings.profiles.length > 0) {
    profileSettings.activeProfileId = profileSettings.profiles[0].id;
  } else if (profileSettings.profiles.length === 0) {
    profileSettings.activeProfileId = undefined;
  }

  saveUnityProfiles(projectId, profileSettings);
}

/**
 * Set the active Unity profile
 */
function setActiveUnityProfile(projectId: string, profileId: string): void {
  const profileSettings = getUnityProfiles(projectId);

  if (!profileSettings.profiles.some(p => p.id === profileId)) {
    throw new Error('Profile not found');
  }

  profileSettings.activeProfileId = profileId;
  saveUnityProfiles(projectId, profileSettings);
}

/**
 * Load Unity pipeline runs from disk
 */
function loadUnityPipelines(projectId: string): UnityPipelineRun[] {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const pipelinesDir = join(project.path, '.auto-claude', 'unity-runs', 'pipelines');
  const pipelines: UnityPipelineRun[] = [];

  try {
    if (existsSync(pipelinesDir)) {
      const entries = readdirSync(pipelinesDir);

      for (const entry of entries) {
        const pipelineJsonPath = join(pipelinesDir, entry, 'pipeline.json');
        if (existsSync(pipelineJsonPath)) {
          try {
            const content = readFileSync(pipelineJsonPath, 'utf-8');
            const pipeline = JSON.parse(content) as UnityPipelineRun;
            pipelines.push(pipeline);
          } catch (error) {
            console.error(`Failed to read pipeline ${entry}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to load Unity pipelines:', error);
  }

  // Sort by startedAt descending (newest first)
  pipelines.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // Limit to last 50 pipelines
  return pipelines.slice(0, 50);
}

/**
 * Save a pipeline record to disk
 */
function savePipelineRecord(projectId: string, pipeline: UnityPipelineRun): void {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const pipelineDir = pipeline.artifactPaths.pipelineDir;
  const pipelineJsonPath = join(pipelineDir, 'pipeline.json');

  writeFileSync(pipelineJsonPath, JSON.stringify(pipeline, null, 2), 'utf-8');
}

// Track running pipelines for cancellation
const runningPipelines = new Map<string, { canceled: boolean; currentRunId?: string }>();

/**
 * Helper function to execute a pipeline step that runs Unity and track its status
 */
async function executeUnityRunStep(
  step: PipelineStep,
  runId: string,
  projectId: string,
  pipelineRun: UnityPipelineRun,
  pipelineId: string
): Promise<void> {
  step.runId = runId;
  
  // Track current run in pipeline state
  const pipelineState = runningPipelines.get(pipelineId);
  if (pipelineState) {
    pipelineState.currentRunId = runId;
  }

  // Get the run status
  const runs = loadUnityRuns(projectId);
  const run = runs.find(r => r.id === runId);
  
  if (run) {
    if (run.status === 'success') {
      step.status = 'success';
    } else if (run.status === 'canceled') {
      step.status = 'canceled';
    } else {
      step.status = 'failed';
      // Distinguish between test failures and other errors
      if (run.testsSummary && run.testsSummary.failed > 0) {
        // This is a test failure (tests ran but some failed)
        step.errorDetails = {
          type: 'test-failure',
          message: `${run.testsSummary.failed} test(s) failed`
        };
      } else if (run.errorSummary && run.errorSummary.errorCount > 0) {
        // This is an execution error (Unity encountered errors)
        step.errorDetails = {
          type: 'execution-error',
          message: run.errorSummary.firstErrorLine || 'Unity execution error'
        };
      } else {
        // Unknown failure type
        step.errorDetails = {
          type: 'unknown',
          message: run.canceledReason || 'Unknown failure'
        };
      }
    }
  } else {
    step.status = 'failed';
    step.errorDetails = {
      type: 'execution-error',
      message: 'Run record not found'
    };
  }

  // Update summary counts
  if (step.status === 'success') {
    if (pipelineRun.summary) pipelineRun.summary.successCount++;
  } else if (step.status === 'failed') {
    if (pipelineRun.summary) pipelineRun.summary.failedCount++;
  } else if (step.status === 'canceled') {
    if (pipelineRun.summary) pipelineRun.summary.canceledCount++;
  }

  // Clear current run ID
  if (pipelineState) {
    pipelineState.currentRunId = undefined;
  }
}

/**
 * Run a Unity pipeline (sequential execution of steps)
 */
async function runUnityPipeline(
  projectId: string,
  config: {
    profileId?: string;
    steps: PipelineStep[];
    continueOnFail?: boolean;
  }
): Promise<void> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Get profile if specified
  let profile: UnityProfile | undefined;
  let profileName: string | undefined;
  if (config.profileId) {
    const profileSettings = getUnityProfiles(projectId);
    profile = profileSettings.profiles.find(p => p.id === config.profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }
    profileName = profile.name;
  }

  // Get settings for editor path and execute method
  const settings = getUnitySettings(projectId);
  const unityPath = settings.unityProjectPath || project.path;

  // Determine editor path (profile override or global setting)
  const editorPath = profile?.editorPath || settings.editorPath;
  if (!editorPath) {
    throw new Error('Editor path not configured');
  }

  const { id, dir: pipelineDir } = createPipelineDir(projectId);

  const startTime = new Date();

  // Initialize pipeline record
  const pipelineRun: UnityPipelineRun = {
    id,
    startedAt: startTime.toISOString(),
    status: 'running',
    selectedProfileId: config.profileId,
    selectedProfileName: profileName,
    steps: config.steps.map(s => ({ ...s, status: 'pending' })),
    continueOnFail: config.continueOnFail || false,
    artifactPaths: {
      pipelineDir
    },
    summary: {
      totalSteps: config.steps.filter(s => s.enabled).length,
      successCount: 0,
      failedCount: 0,
      canceledCount: 0,
      skippedCount: 0
    }
  };

  savePipelineRecord(projectId, pipelineRun);

  // Register pipeline for cancellation
  runningPipelines.set(id, { canceled: false });

  try {
    // Run each enabled step sequentially
    for (let i = 0; i < pipelineRun.steps.length; i++) {
      const step = pipelineRun.steps[i];

      // Check if pipeline was canceled
      // NOTE: Cancellation is only checked between steps, not during long-running operations.
      // For more responsive cancellation during lengthy builds/tests, the underlying
      // Unity process would need to support mid-execution cancellation checks.
      if (runningPipelines.get(id)?.canceled) {
        // Mark the current step as canceled
        step.status = 'canceled';
        if (pipelineRun.summary) pipelineRun.summary.canceledCount++;

        // Mark all remaining pending steps as canceled
        for (let j = i + 1; j < pipelineRun.steps.length; j++) {
          const remainingStep = pipelineRun.steps[j];
          if (remainingStep.status === 'pending') {
            remainingStep.status = 'canceled';
            if (pipelineRun.summary) pipelineRun.summary.canceledCount++;
          }
        }

        savePipelineRecord(projectId, pipelineRun);
        break;
      }

      if (!step.enabled) {
        step.status = 'skipped';
        if (pipelineRun.summary) pipelineRun.summary.skippedCount++;
        savePipelineRecord(projectId, pipelineRun);
        continue;
      }

      step.status = 'running';
      savePipelineRecord(projectId, pipelineRun);

      try {
        switch (step.type) {
          case 'validate': {
            // Lightweight validation
            if (!existsSync(join(unityPath, 'ProjectSettings', 'ProjectVersion.txt'))) {
              throw new Error('Unity project not detected');
            }
            if (!existsSync(editorPath)) {
              throw new Error('Unity editor not found');
            }
            // Check execute method if build step is enabled
            const buildStep = pipelineRun.steps.find(s => s.type === 'build' && s.enabled);
            if (buildStep) {
              const executeMethod = profile?.buildExecuteMethod || settings.buildExecuteMethod;
              if (!executeMethod) {
                throw new Error('Build execute method not configured');
              }
            }
            step.status = 'success';
            if (pipelineRun.summary) pipelineRun.summary.successCount++;
            break;
          }

          case 'editmode-tests': {
            const editModeRunId = await runEditModeTests(projectId, editorPath);
            await executeUnityRunStep(step, editModeRunId, projectId, pipelineRun, id);
            break;
          }

          case 'playmode-tests': {
            const playModeBuildTarget = profile?.testDefaults?.playModeBuildTarget;
            const testFilter = profile?.testDefaults?.testFilter;
            const playModeRunId = await runPlayModeTests(projectId, editorPath, {
              buildTarget: playModeBuildTarget,
              testFilter
            });
            await executeUnityRunStep(step, playModeRunId, projectId, pipelineRun, id);
            break;
          }

          case 'build': {
            const executeMethod = profile?.buildExecuteMethod || settings.buildExecuteMethod;
            if (!executeMethod) {
              throw new Error('Build execute method not configured');
            }
            const buildRunId = await runBuild(projectId, editorPath, executeMethod);
            await executeUnityRunStep(step, buildRunId, projectId, pipelineRun, id);
            break;
          }

          case 'collect-artifacts': {
            // Create bundle directory
            const bundleDir = join(pipelineDir, 'bundle');
            if (!existsSync(bundleDir)) {
              mkdirSync(bundleDir, { recursive: true });
            }

            // Copy artifacts from each step
            const runsDir = getUnityRunsDir(projectId);
            for (const s of pipelineRun.steps) {
              if (s.runId) {
                const runDir = join(runsDir, s.runId);
                if (existsSync(runDir)) {
                  const runJsonPath = join(runDir, 'run.json');
                  if (existsSync(runJsonPath)) {
                    const destPath = join(bundleDir, `${s.runId}-run.json`);
                    const content = readFileSync(runJsonPath, 'utf-8');
                    writeFileSync(destPath, content, 'utf-8');
                  }

                  // Copy log files
                  const logFiles = ['unity-editor.log', 'test-results.xml', 'error-digest.txt'];
                  for (const logFile of logFiles) {
                    const logPath = join(runDir, logFile);
                    if (existsSync(logPath)) {
                      const destPath = join(bundleDir, `${s.runId}-${logFile}`);
                      const content = readFileSync(logPath, 'utf-8');
                      writeFileSync(destPath, content, 'utf-8');
                    }
                  }
                }
              }
            }

            // Generate pipeline summary
            const summaryLines = [
              '# Unity Pipeline Summary',
              '',
              `Pipeline ID: ${pipelineRun.id}`,
              `Profile: ${pipelineRun.selectedProfileName || 'None'}`,
              `Started: ${pipelineRun.startedAt}`,
              '',
              '## Steps',
              ''
            ];

            for (const s of pipelineRun.steps) {
              const statusIcon = s.status === 'success' ? '✅' : s.status === 'failed' ? '❌' : s.status === 'skipped' ? '⏭' : s.status === 'canceled' ? '🚫' : '⏳';
              let stepLine = `${statusIcon} ${s.type}: ${s.status || 'pending'}${s.runId ? ` (${s.runId})` : ''}`;

              // Add error details for failed steps
              if (s.status === 'failed' && s.errorDetails) {
                let errorType: string;
                switch (s.errorDetails.type) {
                  case 'test-failure': {
                    errorType = '🧪 Test Failure';
                    break;
                  }
                  case 'execution-error': {
                    errorType = '⚠️ Execution Error';
                    break;
                  }
                  default: {
                    errorType = '❓ Unknown Error';
                    break;
                  }
                }
                stepLine += `\n  ${errorType}: ${s.errorDetails.message}`;
              }

              summaryLines.push(stepLine);
            }

            summaryLines.push('');
            summaryLines.push('## Summary');
            summaryLines.push(`Total Steps: ${pipelineRun.summary?.totalSteps || 0}`);
            summaryLines.push(`Success: ${pipelineRun.summary?.successCount || 0}`);
            summaryLines.push(`Failed: ${pipelineRun.summary?.failedCount || 0}`);
            summaryLines.push(`Canceled: ${pipelineRun.summary?.canceledCount || 0}`);
            summaryLines.push(`Skipped: ${pipelineRun.summary?.skippedCount || 0}`);

            const summaryPath = join(pipelineDir, 'pipeline-summary.md');
            writeFileSync(summaryPath, summaryLines.join('\n'), 'utf-8');

            pipelineRun.artifactPaths.summary = summaryPath;
            pipelineRun.artifactPaths.bundleDir = bundleDir;

            step.status = 'success';
            if (pipelineRun.summary) pipelineRun.summary.successCount++;
            break;
          }

          default:
            throw new Error(`Unknown step type: ${step.type}`);
        }
      } catch (error) {
        // Distinguish between different types of errors for better debugging
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorMessageLower = errorMessage.toLowerCase();
        
        // Detect execution errors by checking for specific patterns
        const isExecutionError = EXECUTION_ERROR_PATTERNS.some(pattern => 
          errorMessageLower.includes(pattern)
        );
        
        console.error(`Pipeline step ${step.type} failed:`, error);
        step.status = 'failed';
        
        // Set error details to distinguish execution errors from test failures
        step.errorDetails = {
          type: isExecutionError ? 'execution-error' : 'unknown',
          message: errorMessage
        };
        
        if (pipelineRun.summary) pipelineRun.summary.failedCount++;

        // Stop pipeline if continueOnFail is false
        if (!pipelineRun.continueOnFail) {
          savePipelineRecord(projectId, pipelineRun);
          break;
        }
      }

      savePipelineRecord(projectId, pipelineRun);
    }

    // Determine overall pipeline status
    const endTime = new Date();
    pipelineRun.endedAt = endTime.toISOString();
    pipelineRun.durationMs = endTime.getTime() - startTime.getTime();

    if (runningPipelines.get(id)?.canceled) {
      pipelineRun.status = 'canceled';
    } else if (pipelineRun.summary && pipelineRun.summary.failedCount > 0) {
      pipelineRun.status = 'failed';
    } else {
      pipelineRun.status = 'success';
    }

    savePipelineRecord(projectId, pipelineRun);

  } finally {
    // Unregister pipeline
    runningPipelines.delete(id);
  }
}

/**
 * Cancel a running pipeline
 */
async function cancelUnityPipeline(projectId: string, pipelineId: string): Promise<void> {
  const pipelineState = runningPipelines.get(pipelineId);
  if (pipelineState) {
    pipelineState.canceled = true;

    // Try to cancel the currently running step using in-memory state
    if (pipelineState.currentRunId) {
      try {
        await unityProcessStore.cancel(pipelineState.currentRunId);
      } catch (error) {
        console.error('Failed to cancel running step:', error);
      }
    }

    // Wait for the pipeline loop to observe cancellation and stop
    await waitForPipelineCancellation(pipelineId);
  }
}

/**
 * Wait for pipeline cancellation to complete
 */
async function waitForPipelineCancellation(
  pipelineId: string,
  timeoutMs: number = 10_000,
  pollIntervalMs: number = 100
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = runningPipelines.get(pipelineId);

    // Consider the pipeline "cancellation complete" when it is no longer registered
    // or when it is marked as canceled and has no current running step.
    if (!state || (state.canceled && !state.currentRunId)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.warn(
    `Timeout while waiting for Unity pipeline cancellation (pipelineId=${pipelineId})`
  );
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

  // Cancel run
  ipcMain.handle(
    IPC_CHANNELS.UNITY_CANCEL_RUN,
    async (_, projectId: string, runId: string): Promise<IPCResult<void>> => {
      try {
        // Mark run as canceled
        const runsDir = getUnityRunsDir(projectId);
        const runDir = join(runsDir, runId);
        const runJsonPath = join(runDir, 'run.json');

        if (!existsSync(runJsonPath)) {
          throw new Error('Run not found');
        }

        const runContent = readFileSync(runJsonPath, 'utf-8');
        const run = JSON.parse(runContent) as UnityRun;

        // Mark as canceled and save to disk immediately
        // This handles a race condition with the process close handler:
        // - If the process terminates naturally between now and the kill attempt,
        //   the close handler will reload this run from disk and see the 'canceled' status
        // - This ensures we don't incorrectly report a naturally-completed run as 'failed'
        //   or overwrite the canceled status
        run.status = 'canceled';
        run.canceledReason = 'user';
        
        // Save updated run record before attempting to kill
        saveRunRecord(projectId, run);

        // Try to kill the process
        const canceled = await unityProcessStore.cancel(runId);

        if (!canceled && run.pid) {
          // Process store didn't have it, try direct kill
          try {
            await killProcessTree(run.pid);
          } catch (error) {
            console.error('Failed to kill process:', error);
          }
        }

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to cancel run'
        };
      }
    }
  );

  // Re-run
  ipcMain.handle(
    IPC_CHANNELS.UNITY_RERUN,
    async (_, projectId: string, runId: string): Promise<IPCResult<void>> => {
      try {
        // Load the original run
        const runsDir = getUnityRunsDir(projectId);
        const runDir = join(runsDir, runId);
        const runJsonPath = join(runDir, 'run.json');

        if (!existsSync(runJsonPath)) {
          throw new Error('Run not found');
        }

        const runContent = readFileSync(runJsonPath, 'utf-8');
        const originalRun = JSON.parse(runContent) as UnityRun;

        if (!originalRun.params) {
          throw new Error('Run parameters not found');
        }

        // Re-run based on actionId
        if (originalRun.actionId === 'unity.runEditModeTests') {
          await runEditModeTests(projectId, originalRun.params.editorPath);
        } else if (originalRun.actionId === 'unity.runPlayModeTests') {
          await runPlayModeTests(projectId, originalRun.params.editorPath, {
            buildTarget: originalRun.params.buildTarget,
            testFilter: originalRun.params.testFilter
          });
        } else if (originalRun.actionId === 'unity.runBuild') {
          if (!originalRun.params.executeMethod) {
            throw new Error('Execute method not found in run parameters');
          }
          await runBuild(projectId, originalRun.params.editorPath, originalRun.params.executeMethod);
        } else {
          throw new Error(`Unknown action ID: ${originalRun.actionId}`);
        }

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to re-run'
        };
      }
    }
  );

  // Copy to clipboard
  ipcMain.handle(
    IPC_CHANNELS.UNITY_COPY_TO_CLIPBOARD,
    async (_, text: string): Promise<IPCResult<void>> => {
      try {
        clipboard.writeText(text);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to copy to clipboard'
        };
      }
    }
  );

  // Run PlayMode tests
  ipcMain.handle(
    IPC_CHANNELS.UNITY_RUN_PLAYMODE_TESTS,
    async (_, projectId: string, editorPath: string, options?: { buildTarget?: string; testFilter?: string }): Promise<IPCResult<void>> => {
      try {
        await runPlayModeTests(projectId, editorPath, options);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run PlayMode tests'
        };
      }
    }
  );

  // Get Unity profiles
  ipcMain.handle(
    IPC_CHANNELS.UNITY_GET_PROFILES,
    async (_, projectId: string): Promise<IPCResult<UnityProfileSettings>> => {
      try {
        const profiles = getUnityProfiles(projectId);
        return { success: true, data: profiles };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get Unity profiles'
        };
      }
    }
  );

  // Create Unity profile
  ipcMain.handle(
    IPC_CHANNELS.UNITY_CREATE_PROFILE,
    async (_, projectId: string, profile: Omit<UnityProfile, 'id'>): Promise<IPCResult<UnityProfile>> => {
      try {
        const newProfile = createUnityProfile(projectId, profile);
        return { success: true, data: newProfile };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create Unity profile'
        };
      }
    }
  );

  // Update Unity profile
  ipcMain.handle(
    IPC_CHANNELS.UNITY_UPDATE_PROFILE,
    async (_, projectId: string, profileId: string, updates: Partial<Omit<UnityProfile, 'id'>>): Promise<IPCResult<void>> => {
      try {
        updateUnityProfile(projectId, profileId, updates);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update Unity profile'
        };
      }
    }
  );

  // Delete Unity profile
  ipcMain.handle(
    IPC_CHANNELS.UNITY_DELETE_PROFILE,
    async (_, projectId: string, profileId: string): Promise<IPCResult<void>> => {
      try {
        deleteUnityProfile(projectId, profileId);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete Unity profile'
        };
      }
    }
  );

  // Set active Unity profile
  ipcMain.handle(
    IPC_CHANNELS.UNITY_SET_ACTIVE_PROFILE,
    async (_, projectId: string, profileId: string): Promise<IPCResult<void>> => {
      try {
        setActiveUnityProfile(projectId, profileId);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set active Unity profile'
        };
      }
    }
  );

  // Run Unity pipeline
  ipcMain.handle(
    IPC_CHANNELS.UNITY_RUN_PIPELINE,
    async (_, projectId: string, config: {
      profileId?: string;
      steps: PipelineStep[];
      continueOnFail?: boolean;
    }): Promise<IPCResult<void>> => {
      try {
        await runUnityPipeline(projectId, config);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run Unity pipeline'
        };
      }
    }
  );

  // Cancel Unity pipeline
  ipcMain.handle(
    IPC_CHANNELS.UNITY_CANCEL_PIPELINE,
    async (_, projectId: string, pipelineId: string): Promise<IPCResult<void>> => {
      try {
        await cancelUnityPipeline(projectId, pipelineId);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to cancel Unity pipeline'
        };
      }
    }
  );

  // Load Unity pipelines
  ipcMain.handle(
    IPC_CHANNELS.UNITY_LOAD_PIPELINES,
    async (_, projectId: string): Promise<IPCResult<{ pipelines: UnityPipelineRun[] }>> => {
      try {
        const pipelines = loadUnityPipelines(projectId);
        return { success: true, data: { pipelines } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load Unity pipelines'
        };
      }
    }
  );

  // Delete Unity run
  ipcMain.handle(
    IPC_CHANNELS.UNITY_DELETE_RUN,
    async (_, projectId: string, runId: string): Promise<IPCResult<void>> => {
      try {
        deleteUnityRun(projectId, runId);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete Unity run'
        };
      }
    }
  );

  // Clear all Unity runs
  ipcMain.handle(
    IPC_CHANNELS.UNITY_CLEAR_RUNS,
    async (_, projectId: string): Promise<IPCResult<void>> => {
      try {
        clearUnityRuns(projectId);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to clear Unity runs'
        };
      }
    }
  );

  // Unity Doctor - Run diagnostics checks
  ipcMain.handle(
    IPC_CHANNELS.UNITY_DOCTOR_RUN_CHECKS,
    async (_, projectId: string, editorPath?: string): Promise<IPCResult<any>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        const settings = getUnitySettings(projectId);
        const projectPath = settings.unityProjectPath || project.path;

        const { runUnityDoctorChecks } = await import('../utils/unity-doctor');
        const report = await runUnityDoctorChecks(projectPath, editorPath);
        return { success: true, data: report };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run Unity Doctor checks'
        };
      }
    }
  );

  // Unity Doctor - Get diagnostics text
  ipcMain.handle(
    IPC_CHANNELS.UNITY_DOCTOR_GET_DIAGNOSTICS_TEXT,
    async (_, report: any): Promise<IPCResult<string>> => {
      try {
        const { getDiagnosticsSummary } = await import('../utils/unity-doctor');
        const text = getDiagnosticsSummary(report);
        return { success: true, data: text };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get diagnostics text'
        };
      }
    }
  );

  // Unity Bridge - Check if installed
  ipcMain.handle(
    IPC_CHANNELS.UNITY_BRIDGE_CHECK_INSTALLED,
    async (_, projectId: string): Promise<IPCResult<{ installed: boolean }>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        const settings = getUnitySettings(projectId);
        const projectPath = settings.unityProjectPath || project.path;

        const { isUnityBridgeInstalled } = await import('../utils/unity-tweaks');
        const installed = await isUnityBridgeInstalled(projectPath);
        return { success: true, data: { installed } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check Unity Bridge installation'
        };
      }
    }
  );

  // Unity Bridge - Install
  ipcMain.handle(
    IPC_CHANNELS.UNITY_BRIDGE_INSTALL,
    async (_, projectId: string): Promise<IPCResult<void>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        const settings = getUnitySettings(projectId);
        const projectPath = settings.unityProjectPath || project.path;

        const { installUnityBridge } = await import('../utils/unity-tweaks');
        const bridgeTemplatePath = join(__dirname, '../unity-bridge-template.cs');

        // Create a run record for this installation
        const { id: runId, dir: runDir } = createRunDir(projectId, 'bridge-install');

        const startTime = Date.now();
        const result = await installUnityBridge(projectPath, bridgeTemplatePath);
        const endTime = Date.now();

        // Save run record
        const run = {
          id: runId,
          action: 'bridge-install',
          startedAt: new Date(startTime).toISOString(),
          endedAt: new Date(endTime).toISOString(),
          durationMs: endTime - startTime,
          status: 'success',
          exitCode: 0,
          command: `Install Unity Bridge to ${result.bridgePath}`,
          params: {
            projectPath
          },
          artifactPaths: {
            runDir
          },
          tweakSummary: {
            action: 'install-bridge',
            description: result.message,
            changedFiles: result.installed ? [relative(projectPath, result.bridgePath)] : [],
            backupCreated: false
          }
        };

        const runFile = join(runDir, 'run.json');
        writeFileSync(runFile, JSON.stringify(run, null, 2));

        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to install Unity Bridge'
        };
      }
    }
  );

  // Unity Tweak - Add Define Symbol
  ipcMain.handle(
    IPC_CHANNELS.UNITY_TWEAK_ADD_DEFINE,
    async (_, projectId: string, editorPath: string, params: any): Promise<IPCResult<void>> => {
      try {
        await runUnityTweak(projectId, editorPath, 'add-define', params);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add define symbol'
        };
      }
    }
  );

  // Unity Tweak - Remove Define Symbol
  ipcMain.handle(
    IPC_CHANNELS.UNITY_TWEAK_REMOVE_DEFINE,
    async (_, projectId: string, editorPath: string, params: any): Promise<IPCResult<void>> => {
      try {
        await runUnityTweak(projectId, editorPath, 'remove-define', params);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove define symbol'
        };
      }
    }
  );

  // Unity Tweak - Set Scripting Backend
  ipcMain.handle(
    IPC_CHANNELS.UNITY_TWEAK_SET_BACKEND,
    async (_, projectId: string, editorPath: string, params: any): Promise<IPCResult<void>> => {
      try {
        await runUnityTweak(projectId, editorPath, 'set-backend', params);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to set scripting backend'
        };
      }
    }
  );

  // Unity Tweak - Switch Build Target
  ipcMain.handle(
    IPC_CHANNELS.UNITY_TWEAK_SWITCH_BUILD_TARGET,
    async (_, projectId: string, editorPath: string, params: any): Promise<IPCResult<void>> => {
      try {
        await runUnityTweak(projectId, editorPath, 'switch-build-target', params);
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch build target'
        };
      }
    }
  );

  // Unity UPM - List Packages
  ipcMain.handle(
    IPC_CHANNELS.UNITY_UPM_LIST_PACKAGES,
    async (_, projectId: string): Promise<IPCResult<{ packages: any[] }>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        const settings = getUnitySettings(projectId);
        const projectPath = settings.unityProjectPath || project.path;

        const { readUnityPackages } = await import('../utils/unity-tweaks');
        const result = await readUnityPackages(projectPath);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to read Unity packages'
          };
        }

        return { success: true, data: { packages: result.packages || [] } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list Unity packages'
        };
      }
    }
  );

  // Unity UPM - Resolve
  ipcMain.handle(
    IPC_CHANNELS.UNITY_UPM_RESOLVE,
    async (_, projectId: string, editorPath: string): Promise<IPCResult<void>> => {
      try {
        await runUnityTweak(projectId, editorPath, 'upm-resolve', {});
        return { success: true, data: undefined };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to resolve Unity packages'
        };
      }
    }
  );

  console.warn('[IPC] Unity handlers registered');
}
