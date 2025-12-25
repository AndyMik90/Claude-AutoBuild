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
  runUnityBuild: (projectId: string, editorPath: string, executeMethod: string) => Promise<IPCResult<void>>;

  // Unity runs
  loadUnityRuns: (projectId: string) => Promise<IPCResult<{ runs: UnityRun[] }>>;

  // File operations
  openPath: (path: string) => Promise<IPCResult<void>>;
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

  runUnityBuild: (projectId: string, editorPath: string, executeMethod: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_RUN_BUILD, projectId, editorPath, executeMethod),

  loadUnityRuns: (projectId: string): Promise<IPCResult<{ runs: UnityRun[] }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_LOAD_RUNS, projectId),

  openPath: (path: string): Promise<IPCResult<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNITY_OPEN_PATH, path)
});
