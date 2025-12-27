import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';

export interface UnityProjectInfo {
  isUnityProject: boolean;
  version?: string;
  projectPath: string;
}

export interface UnityEditorInfo {
  version: string;
  path: string;
}

export interface UnitySettings {
  unityProjectPath?: string;
  editorPath?: string;
  buildExecuteMethod?: string;
}

export interface UnityRun {
  id: string;
  action: 'editmode-tests' | 'playmode-tests' | 'build';
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
    buildTarget?: string;
    testFilter?: string;
  };
  artifactPaths: {
    runDir: string;
    log?: string;
    testResults?: string;
    stdout?: string;
    stderr?: string;
    errorDigest?: string;
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
  canceledReason?: string;
}

export interface UnityProfile {
  id: string;
  name: string;
  editorPath?: string;
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

export interface UnityProfileSettings {
  profiles: UnityProfile[];
  activeProfileId?: string;
}

export type PipelineStepType = 'validate' | 'editmode-tests' | 'playmode-tests' | 'build' | 'collect-artifacts';

export interface PipelineStep {
  type: PipelineStepType;
  enabled: boolean;
  runId?: string;
  status?: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled';
}

export interface UnityPipelineRun {
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

export interface UnityAPI {
  // Unity project detection
  detectUnityProject: (projectPath: string) => Promise<IPCResult<UnityProjectInfo>>;
  updateUnityProjectVersion: (projectId: string, newVersion: string) => Promise<IPCResult<void>>;

  // Unity Editor discovery
  discoverUnityEditors: () => Promise<IPCResult<{ editors: UnityEditorInfo[] }>>;
  autoDetectUnityHub: () => Promise<IPCResult<{ path: string | null }>>;
  autoDetectUnityEditorsFolder: () => Promise<IPCResult<{ path: string | null }>>;
  scanUnityEditorsFolder: (editorsFolder: string) => Promise<IPCResult<{ editors: UnityEditorInfo[] }>>;

  // Unity settings
  getUnitySettings: (projectId: string) => Promise<IPCResult<UnitySettings>>;
  saveUnitySettings: (projectId: string, settings: UnitySettings) => Promise<IPCResult<void>>;

  // Unity actions
  runUnityEditModeTests: (projectId: string, editorPath: string) => Promise<IPCResult<void>>;
  runUnityPlayModeTests: (projectId: string, editorPath: string, options?: { buildTarget?: string; testFilter?: string }) => Promise<IPCResult<void>>;
  runUnityBuild: (projectId: string, editorPath: string, executeMethod: string) => Promise<IPCResult<void>>;
  openUnityProject: (projectId: string, editorPath: string) => Promise<IPCResult<void>>;
  cancelUnityRun: (projectId: string, runId: string) => Promise<IPCResult<void>>;
  rerunUnity: (projectId: string, runId: string) => Promise<IPCResult<void>>;

  // Unity runs
  loadUnityRuns: (projectId: string) => Promise<IPCResult<{ runs: UnityRun[] }>>;
  deleteUnityRun: (projectId: string, runId: string) => Promise<IPCResult<void>>;
  clearUnityRuns: (projectId: string) => Promise<IPCResult<void>>;

  // Unity profiles
  getUnityProfiles: (projectId: string) => Promise<IPCResult<UnityProfileSettings>>;
  createUnityProfile: (projectId: string, profile: Omit<UnityProfile, 'id'>) => Promise<IPCResult<UnityProfile>>;
  updateUnityProfile: (projectId: string, profileId: string, updates: Partial<Omit<UnityProfile, 'id'>>) => Promise<IPCResult<void>>;
  deleteUnityProfile: (projectId: string, profileId: string) => Promise<IPCResult<void>>;
  setActiveUnityProfile: (projectId: string, profileId: string) => Promise<IPCResult<void>>;

  // Unity pipelines
  runUnityPipeline: (projectId: string, config: {
    profileId?: string;
    steps: PipelineStep[];
    continueOnFail?: boolean;
  }) => Promise<IPCResult<void>>;
  cancelUnityPipeline: (projectId: string, pipelineId: string) => Promise<IPCResult<void>>;
  loadUnityPipelines: (projectId: string) => Promise<IPCResult<{ pipelines: UnityPipelineRun[] }>>;

  // File operations
  openPath: (path: string) => Promise<IPCResult<void>>;
  copyToClipboard: (text: string) => Promise<IPCResult<void>>;
}

export const createUnityAPI = (): UnityAPI => ({
  detectUnityProject: (projectPath: string): Promise<IPCResult<UnityProjectInfo>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_DETECT_PROJECT, projectPath),

  updateUnityProjectVersion: (projectId: string, newVersion: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_UPDATE_PROJECT_VERSION, projectId, newVersion),

  discoverUnityEditors: (): Promise<IPCResult<{ editors: UnityEditorInfo[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_DISCOVER_EDITORS),

  autoDetectUnityHub: (): Promise<IPCResult<{ path: string | null }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_AUTO_DETECT_HUB),

  autoDetectUnityEditorsFolder: (): Promise<IPCResult<{ path: string | null }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_AUTO_DETECT_EDITORS_FOLDER),

  scanUnityEditorsFolder: (editorsFolder: string): Promise<IPCResult<{ editors: UnityEditorInfo[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_SCAN_EDITORS_FOLDER, editorsFolder),

  getUnitySettings: (projectId: string): Promise<IPCResult<UnitySettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_GET_SETTINGS, projectId),

  saveUnitySettings: (projectId: string, settings: UnitySettings): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_SAVE_SETTINGS, projectId, settings),

  runUnityEditModeTests: (projectId: string, editorPath: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_RUN_EDITMODE_TESTS, projectId, editorPath),

  runUnityPlayModeTests: (projectId: string, editorPath: string, options?: { buildTarget?: string; testFilter?: string }): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_RUN_PLAYMODE_TESTS, projectId, editorPath, options),

  runUnityBuild: (projectId: string, editorPath: string, executeMethod: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_RUN_BUILD, projectId, editorPath, executeMethod),

  openUnityProject: (projectId: string, editorPath: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_OPEN_PROJECT, projectId, editorPath),

  cancelUnityRun: (projectId: string, runId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_CANCEL_RUN, projectId, runId),

  rerunUnity: (projectId: string, runId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_RERUN, projectId, runId),

  loadUnityRuns: (projectId: string): Promise<IPCResult<{ runs: UnityRun[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_LOAD_RUNS, projectId),

  getUnityProfiles: (projectId: string): Promise<IPCResult<UnityProfileSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_GET_PROFILES, projectId),

  createUnityProfile: (projectId: string, profile: Omit<UnityProfile, 'id'>): Promise<IPCResult<UnityProfile>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_CREATE_PROFILE, projectId, profile),

  updateUnityProfile: (projectId: string, profileId: string, updates: Partial<Omit<UnityProfile, 'id'>>): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_UPDATE_PROFILE, projectId, profileId, updates),

  deleteUnityProfile: (projectId: string, profileId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_DELETE_PROFILE, projectId, profileId),

  setActiveUnityProfile: (projectId: string, profileId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_SET_ACTIVE_PROFILE, projectId, profileId),

  runUnityPipeline: (projectId: string, config: {
    profileId?: string;
    steps: PipelineStep[];
    continueOnFail?: boolean;
  }): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_RUN_PIPELINE, projectId, config),

  cancelUnityPipeline: (projectId: string, pipelineId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_CANCEL_PIPELINE, projectId, pipelineId),

  loadUnityPipelines: (projectId: string): Promise<IPCResult<{ pipelines: UnityPipelineRun[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_LOAD_PIPELINES, projectId),

  deleteUnityRun: (projectId: string, runId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_DELETE_RUN, projectId, runId),

  clearUnityRuns: (projectId: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_CLEAR_RUNS, projectId),

  openPath: (path: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_OPEN_PATH, path),

  copyToClipboard: (text: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_COPY_TO_CLIPBOARD, text)
});
