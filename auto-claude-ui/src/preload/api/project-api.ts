import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  Project,
  ProjectSettings,
  IPCResult,
  InitializationResult,
  AutoBuildVersionInfo,
  ProjectContextData,
  ProjectIndex,
  GraphitiMemoryStatus,
  ContextSearchResult,
  MemoryEpisode,
  ProjectEnvConfig,
  ClaudeAuthResult,
  InfrastructureStatus,
  GraphitiValidationResult,
  GraphitiConnectionTestResult,
  GitStatus
} from '../../shared/types';

export interface ProjectAPI {
  // Project Management
  addProject: (projectPath: string) => Promise<IPCResult<Project>>;
  removeProject: (projectId: string) => Promise<IPCResult>;
  getProjects: () => Promise<IPCResult<Project[]>>;
  updateProjectSettings: (
    projectId: string,
    settings: Partial<ProjectSettings>
  ) => Promise<IPCResult>;
  initializeProject: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  updateProjectAutoBuild: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  checkProjectVersion: (projectId: string) => Promise<IPCResult<AutoBuildVersionInfo>>;

  // Context Operations
  getProjectContext: (projectId: string) => Promise<any>;
  refreshProjectIndex: (projectId: string) => Promise<any>;
  getMemoryStatus: (projectId: string) => Promise<any>;
  searchMemories: (projectId: string, query: string) => Promise<any>;
  getRecentMemories: (projectId: string, limit?: number) => Promise<any>;

  // Environment Configuration
  getProjectEnv: (projectId: string) => Promise<IPCResult<ProjectEnvConfig>>;
  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>) => Promise<IPCResult>;
  checkClaudeAuth: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;
  invokeClaudeSetup: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;

  // Dialog Operations
  selectDirectory: () => Promise<string | null>;
  createProjectFolder: (
    location: string,
    name: string,
    initGit: boolean
  ) => Promise<IPCResult<import('../../shared/types').CreateProjectFolderResult>>;
  getDefaultProjectLocation: () => Promise<string | null>;

  // Docker & Infrastructure Operations (for Graphiti/FalkorDB)
  getInfrastructureStatus: (port?: number) => Promise<IPCResult<InfrastructureStatus>>;
  startFalkorDB: (port?: number) => Promise<IPCResult<{ success: boolean; error?: string }>>;
  stopFalkorDB: () => Promise<IPCResult<{ success: boolean; error?: string }>>;
  openDockerDesktop: () => Promise<IPCResult<{ success: boolean; error?: string }>>;
  getDockerDownloadUrl: () => Promise<string>;

  // Graphiti Validation Operations
  validateFalkorDBConnection: (uri: string) => Promise<IPCResult<GraphitiValidationResult>>;
  validateOpenAIApiKey: (apiKey: string) => Promise<IPCResult<GraphitiValidationResult>>;
  testGraphitiConnection: (
    falkorDbUri: string,
    openAiApiKey: string
  ) => Promise<IPCResult<GraphitiConnectionTestResult>>;

  // Git Operations
  getGitBranches: (projectPath: string) => Promise<IPCResult<string[]>>;
  getCurrentGitBranch: (projectPath: string) => Promise<IPCResult<string | null>>;
  detectMainBranch: (projectPath: string) => Promise<IPCResult<string | null>>;
  checkGitStatus: (projectPath: string) => Promise<IPCResult<GitStatus>>;
  initializeGit: (projectPath: string) => Promise<IPCResult<InitializationResult>>;
}

export const createProjectAPI = (): ProjectAPI => ({
  // Project Management
  addProject: (projectPath: string): Promise<IPCResult<Project>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ADD, projectPath),

  removeProject: (projectId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REMOVE, projectId),

  getProjects: (): Promise<IPCResult<Project[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),

  updateProjectSettings: (
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE_SETTINGS, projectId, settings),

  initializeProject: (projectId: string): Promise<IPCResult<InitializationResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_INITIALIZE, projectId),

  updateProjectAutoBuild: (projectId: string): Promise<IPCResult<InitializationResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE_AUTOBUILD, projectId),

  checkProjectVersion: (projectId: string): Promise<IPCResult<AutoBuildVersionInfo>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CHECK_VERSION, projectId),

  // Context Operations
  getProjectContext: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET, projectId),

  refreshProjectIndex: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_REFRESH_INDEX, projectId),

  getMemoryStatus: (projectId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_MEMORY_STATUS, projectId),

  searchMemories: (projectId: string, query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_SEARCH_MEMORIES, projectId, query),

  getRecentMemories: (projectId: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET_MEMORIES, projectId, limit),

  // Environment Configuration
  getProjectEnv: (projectId: string): Promise<IPCResult<ProjectEnvConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_GET, projectId),

  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_UPDATE, projectId, config),

  checkClaudeAuth: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_CHECK_CLAUDE_AUTH, projectId),

  invokeClaudeSetup: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_INVOKE_CLAUDE_SETUP, projectId),

  // Dialog Operations
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY),

  createProjectFolder: (
    location: string,
    name: string,
    initGit: boolean
  ): Promise<IPCResult<import('../../shared/types').CreateProjectFolderResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CREATE_PROJECT_FOLDER, location, name, initGit),

  getDefaultProjectLocation: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_GET_DEFAULT_PROJECT_LOCATION),

  // Docker & Infrastructure Operations
  getInfrastructureStatus: (port?: number): Promise<IPCResult<InfrastructureStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOCKER_STATUS, port),

  startFalkorDB: (port?: number): Promise<IPCResult<{ success: boolean; error?: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOCKER_START_FALKORDB, port),

  stopFalkorDB: (): Promise<IPCResult<{ success: boolean; error?: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOCKER_STOP_FALKORDB),

  openDockerDesktop: (): Promise<IPCResult<{ success: boolean; error?: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOCKER_OPEN_DESKTOP),

  getDockerDownloadUrl: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOCKER_GET_DOWNLOAD_URL),

  // Graphiti Validation Operations
  validateFalkorDBConnection: (uri: string): Promise<IPCResult<GraphitiValidationResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPHITI_VALIDATE_FALKORDB, uri),

  validateOpenAIApiKey: (apiKey: string): Promise<IPCResult<GraphitiValidationResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPHITI_VALIDATE_OPENAI, apiKey),

  testGraphitiConnection: (
    falkorDbUri: string,
    openAiApiKey: string
  ): Promise<IPCResult<GraphitiConnectionTestResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GRAPHITI_TEST_CONNECTION, falkorDbUri, openAiApiKey),

  // Git Operations
  getGitBranches: (projectPath: string): Promise<IPCResult<string[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_BRANCHES, projectPath),

  getCurrentGitBranch: (projectPath: string): Promise<IPCResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_CURRENT_BRANCH, projectPath),

  detectMainBranch: (projectPath: string): Promise<IPCResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_DETECT_MAIN_BRANCH, projectPath),

  checkGitStatus: (projectPath: string): Promise<IPCResult<GitStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_CHECK_STATUS, projectPath),

  initializeGit: (projectPath: string): Promise<IPCResult<InitializationResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_INITIALIZE, projectPath)
});
