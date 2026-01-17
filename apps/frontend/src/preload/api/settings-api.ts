import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  AppSettings,
  IPCResult,
  SourceEnvConfig,
  SourceEnvCheckResult,
  ToolDetectionResult
} from '../../shared/types';

export interface SettingsAPI {
  // App Settings
  getSettings: () => Promise<IPCResult<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<IPCResult>;

  // CLI Tools Detection
  getCliToolsInfo: () => Promise<IPCResult<{
    python: ToolDetectionResult;
    git: ToolDetectionResult;
    gh: ToolDetectionResult;
    claude: ToolDetectionResult;
  }>>;

  // App Info
  getAppVersion: () => Promise<string>;

  // Auto-Build Source Environment
  getSourceEnv: () => Promise<IPCResult<SourceEnvConfig>>;
  updateSourceEnv: (config: { claudeOAuthToken?: string }) => Promise<IPCResult>;
  checkSourceToken: () => Promise<IPCResult<SourceEnvCheckResult>>;

  // Sentry error reporting
  notifySentryStateChanged: (enabled: boolean) => void;
  getSentryDsn: () => Promise<string>;
  getSentryConfig: () => Promise<{ dsn: string; tracesSampleRate: number; profilesSampleRate: number }>;

  // Python package validation
  validatePythonPackages: (params: { pythonPath: string; activationScript?: string }) => Promise<IPCResult<{
    allInstalled: boolean;
    missingPackages: string[];
    installLocation: string;
  }>>;
  onPythonValidationProgress: (callback: (progress: { current: number; total: number; packageName: string }) => void) => () => void;
  installPythonRequirements: (params: { pythonPath: string; activationScript?: string }) => Promise<IPCResult>;
  onPythonInstallProgress: (callback: (progress: string) => void) => () => void;
  validatePythonEnvironment: (params: { activationScript: string }) => Promise<IPCResult<{
    valid: boolean;
    pythonPath: string | null;
    version: string | null;
    error: string | null;
    status: 'valid' | 'missing' | 'wrong_version' | 'error';
  }>>;
  reinstallPythonEnvironment: (params: { activationScript: string; pythonVersion?: string }) => Promise<IPCResult<{
    success: boolean;
    environmentPath: string | null;
    pythonVersion: string | null;
    error: string | null;
    stepsCompleted: string[];
  }>>;
  onPythonReinstallProgress: (callback: (progress: { step: string; completed: number; total: number }) => void) => () => void;
}

export const createSettingsAPI = (): SettingsAPI => ({
  // App Settings
  getSettings: (): Promise<IPCResult<AppSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (settings: Partial<AppSettings>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),

  // CLI Tools Detection
  getCliToolsInfo: (): Promise<IPCResult<{
    python: ToolDetectionResult;
    git: ToolDetectionResult;
    gh: ToolDetectionResult;
    claude: ToolDetectionResult;
  }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_CLI_TOOLS_INFO),

  // App Info
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  // Auto-Build Source Environment
  getSourceEnv: (): Promise<IPCResult<SourceEnvConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_GET),

  updateSourceEnv: (config: { claudeOAuthToken?: string }): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_UPDATE, config),

  checkSourceToken: (): Promise<IPCResult<SourceEnvCheckResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_CHECK_TOKEN),

  // Sentry error reporting - notify main process when setting changes
  notifySentryStateChanged: (enabled: boolean): void =>
    ipcRenderer.send(IPC_CHANNELS.SENTRY_STATE_CHANGED, enabled),

  // Get Sentry DSN from main process (loaded from environment variable)
  getSentryDsn: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SENTRY_DSN),

  // Get full Sentry config from main process (DSN + sample rates)
  getSentryConfig: (): Promise<{ dsn: string; tracesSampleRate: number; profilesSampleRate: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SENTRY_CONFIG),

  // Python package validation
  validatePythonPackages: (params: { pythonPath: string; activationScript?: string }): Promise<IPCResult<{
    allInstalled: boolean;
    missingPackages: string[];
    installLocation: string;
  }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_VALIDATE_PACKAGES, params),

  onPythonValidationProgress: (callback: (progress: { current: number; total: number; packageName: string }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { current: number; total: number; packageName: string }) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.PYTHON_VALIDATION_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PYTHON_VALIDATION_PROGRESS, handler);
  },

  installPythonRequirements: (params: { pythonPath: string; activationScript?: string }): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_INSTALL_REQUIREMENTS, params),

  onPythonInstallProgress: (callback: (progress: string) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, progress: string) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.PYTHON_INSTALL_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PYTHON_INSTALL_PROGRESS, handler);
  },

  validatePythonEnvironment: (params: { activationScript: string }): Promise<IPCResult<{
    valid: boolean;
    pythonPath: string | null;
    version: string | null;
    error: string | null;
    status: 'valid' | 'missing' | 'wrong_version' | 'error';
  }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_VALIDATE_ENVIRONMENT, params),

  reinstallPythonEnvironment: (params: { activationScript: string; pythonVersion?: string }): Promise<IPCResult<{
    success: boolean;
    environmentPath: string | null;
    pythonVersion: string | null;
    error: string | null;
    stepsCompleted: string[];
  }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PYTHON_REINSTALL_ENVIRONMENT, params),

  onPythonReinstallProgress: (callback: (progress: { step: string; completed: number; total: number }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { step: string; completed: number; total: number }) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.PYTHON_REINSTALL_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PYTHON_REINSTALL_PROGRESS, handler);
  }
});
