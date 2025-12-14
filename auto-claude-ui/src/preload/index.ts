import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import type {
  Project,
  ProjectSettings,
  Task,
  AppSettings,
  IPCResult,
  TaskStartOptions,
  TaskStatus,
  TaskRecoveryResult,
  ImplementationPlan,
  ElectronAPI,
  TerminalCreateOptions,
  Roadmap,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus,
  InitializationResult,
  AutoBuildVersionInfo,
  ProjectContextData,
  ProjectIndex,
  GraphitiMemoryStatus,
  ContextSearchResult,
  MemoryEpisode,
  ProjectEnvConfig,
  ClaudeAuthResult,
  LinearTeam,
  LinearProject,
  LinearIssue,
  LinearImportResult,
  LinearSyncStatus,
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationStatus,
  GitHubInvestigationResult,
  IdeationSession,
  IdeationConfig,
  IdeationStatus,
  IdeationGenerationStatus,
  Idea,
  AutoBuildSourceUpdateCheck,
  AutoBuildSourceUpdateProgress,
  SourceEnvConfig,
  SourceEnvCheckResult,
  ChangelogTask,
  TaskSpecContent,
  ChangelogGenerationRequest,
  ChangelogGenerationResult,
  ChangelogSaveRequest,
  ChangelogSaveResult,
  ChangelogGenerationProgress,
  ExistingChangelog,
  GitBranchInfo,
  GitTagInfo,
  GitCommit,
  GitHistoryOptions,
  BranchDiffOptions,
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatStatus,
  InsightsStreamChunk,
  TaskMetadata,
  TaskLogs,
  TaskLogStreamChunk,
  RateLimitInfo,
  ClaudeProfile,
  ClaudeProfileSettings
} from '../shared/types';

// Expose a secure API to the renderer process
const electronAPI: ElectronAPI = {
  // ============================================
  // Project Operations
  // ============================================

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

  // ============================================
  // Task Operations
  // ============================================

  getTasks: (projectId: string): Promise<IPCResult<Task[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, projectId),

  createTask: (
    projectId: string,
    title: string,
    description: string,
    metadata?: import('../shared/types').TaskMetadata
  ): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, projectId, title, description, metadata),

  deleteTask: (taskId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, taskId),

  updateTask: (
    taskId: string,
    updates: { title?: string; description?: string }
  ): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, taskId, updates),

  startTask: (taskId: string, options?: TaskStartOptions): void =>
    ipcRenderer.send(IPC_CHANNELS.TASK_START, taskId, options),

  stopTask: (taskId: string): void =>
    ipcRenderer.send(IPC_CHANNELS.TASK_STOP, taskId),

  submitReview: (
    taskId: string,
    approved: boolean,
    feedback?: string
  ): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_REVIEW, taskId, approved, feedback),

  updateTaskStatus: (
    taskId: string,
    status: import('../shared/types').TaskStatus
  ): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE_STATUS, taskId, status),

  recoverStuckTask: (
    taskId: string,
    options?: import('../shared/types').TaskRecoveryOptions
  ): Promise<IPCResult<import('../shared/types').TaskRecoveryResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_RECOVER_STUCK, taskId, options),

  checkTaskRunning: (taskId: string): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CHECK_RUNNING, taskId),

  // ============================================
  // Workspace Management (for human review)
  // ============================================

  getWorktreeStatus: (taskId: string): Promise<IPCResult<import('../shared/types').WorktreeStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_STATUS, taskId),

  getWorktreeDiff: (taskId: string): Promise<IPCResult<import('../shared/types').WorktreeDiff>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_DIFF, taskId),

  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }): Promise<IPCResult<import('../shared/types').WorktreeMergeResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_MERGE, taskId, options),

  discardWorktree: (taskId: string): Promise<IPCResult<import('../shared/types').WorktreeDiscardResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_DISCARD, taskId),

  listWorktrees: (projectId: string): Promise<IPCResult<import('../shared/types').WorktreeListResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST_WORKTREES, projectId),

  archiveTasks: (projectId: string, taskIds: string[], version?: string): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_ARCHIVE, projectId, taskIds, version),

  unarchiveTasks: (projectId: string, taskIds: string[]): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UNARCHIVE, projectId, taskIds),

  // ============================================
  // Event Listeners (main → renderer)
  // ============================================

  onTaskProgress: (
    callback: (taskId: string, plan: ImplementationPlan) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      plan: ImplementationPlan
    ): void => {
      callback(taskId, plan);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS, handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_PROGRESS, handler);
    };
  },

  onTaskError: (
    callback: (taskId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      error: string
    ): void => {
      callback(taskId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_ERROR, handler);
    };
  },

  onTaskLog: (
    callback: (taskId: string, log: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      log: string
    ): void => {
      callback(taskId, log);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_LOG, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_LOG, handler);
    };
  },

  onTaskStatusChange: (
    callback: (taskId: string, status: TaskStatus) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      status: TaskStatus
    ): void => {
      callback(taskId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_STATUS_CHANGE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_STATUS_CHANGE, handler);
    };
  },

  onTaskExecutionProgress: (
    callback: (taskId: string, progress: import('../shared/types').ExecutionProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      progress: import('../shared/types').ExecutionProgress
    ): void => {
      callback(taskId, progress);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, handler);
    };
  },

  // ============================================
  // Task Phase Logs (collapsible by phase)
  // ============================================

  getTaskLogs: (projectId: string, specId: string): Promise<IPCResult<TaskLogs | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LOGS_GET, projectId, specId),

  watchTaskLogs: (projectId: string, specId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LOGS_WATCH, projectId, specId),

  unwatchTaskLogs: (specId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LOGS_UNWATCH, specId),

  onTaskLogsChanged: (
    callback: (specId: string, logs: TaskLogs) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      specId: string,
      logs: TaskLogs
    ): void => {
      callback(specId, logs);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_LOGS_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_LOGS_CHANGED, handler);
    };
  },

  onTaskLogsStream: (
    callback: (specId: string, chunk: TaskLogStreamChunk) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      specId: string,
      chunk: TaskLogStreamChunk
    ): void => {
      callback(specId, chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_LOGS_STREAM, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_LOGS_STREAM, handler);
    };
  },

  // ============================================
  // Terminal Operations
  // ============================================

  createTerminal: (options: TerminalCreateOptions): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),

  destroyTerminal: (id: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id),

  sendTerminalInput: (id: string, data: string): void =>
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_INPUT, id, data),

  resizeTerminal: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),

  invokeClaudeInTerminal: (id: string, cwd?: string): void =>
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_INVOKE_CLAUDE, id, cwd),

  // Terminal Session Management (persistence/restore)
  getTerminalSessions: (projectPath: string): Promise<IPCResult<import('../shared/types').TerminalSession[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_GET_SESSIONS, projectPath),

  restoreTerminalSession: (
    session: import('../shared/types').TerminalSession,
    cols?: number,
    rows?: number
  ): Promise<IPCResult<import('../shared/types').TerminalRestoreResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESTORE_SESSION, session, cols, rows),

  clearTerminalSessions: (projectPath: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CLEAR_SESSIONS, projectPath),

  resumeClaudeInTerminal: (id: string, sessionId?: string): void =>
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESUME_CLAUDE, id, sessionId),

  getTerminalSessionDates: (projectPath?: string): Promise<IPCResult<import('../shared/types').SessionDateInfo[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_GET_SESSION_DATES, projectPath),

  getTerminalSessionsForDate: (
    date: string,
    projectPath: string
  ): Promise<IPCResult<import('../shared/types').TerminalSession[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_GET_SESSIONS_FOR_DATE, date, projectPath),

  restoreTerminalSessionsFromDate: (
    date: string,
    projectPath: string,
    cols?: number,
    rows?: number
  ): Promise<IPCResult<import('../shared/types').SessionDateRestoreResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESTORE_FROM_DATE, date, projectPath, cols, rows),

  // ============================================
  // Terminal Event Listeners
  // ============================================

  onTerminalOutput: (
    callback: (id: string, data: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      id: string,
      data: string
    ): void => {
      callback(id, data);
    };
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_OUTPUT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_OUTPUT, handler);
    };
  },

  onTerminalExit: (
    callback: (id: string, exitCode: number) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      id: string,
      exitCode: number
    ): void => {
      callback(id, exitCode);
    };
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, handler);
    };
  },

  onTerminalTitleChange: (
    callback: (id: string, title: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      id: string,
      title: string
    ): void => {
      callback(id, title);
    };
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, handler);
    };
  },

  onTerminalClaudeSession: (
    callback: (id: string, sessionId: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      id: string,
      sessionId: string
    ): void => {
      callback(id, sessionId);
    };
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, handler);
    };
  },

  onTerminalRateLimit: (
    callback: (info: RateLimitInfo) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: RateLimitInfo
    ): void => {
      callback(info);
    };
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_RATE_LIMIT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_RATE_LIMIT, handler);
    };
  },

  onTerminalOAuthToken: (
    callback: (info: { terminalId: string; profileId?: string; email?: string; success: boolean; message?: string; detectedAt: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { terminalId: string; profileId?: string; email?: string; success: boolean; message?: string; detectedAt: string }
    ): void => {
      callback(info);
    };
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, handler);
    };
  },

  // ============================================
  // Claude Profile Management (Multi-Account Support)
  // ============================================

  getClaudeProfiles: (): Promise<IPCResult<ClaudeProfileSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILES_GET),

  saveClaudeProfile: (profile: ClaudeProfile): Promise<IPCResult<ClaudeProfile>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_SAVE, profile),

  deleteClaudeProfile: (profileId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_DELETE, profileId),

  renameClaudeProfile: (profileId: string, newName: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_RENAME, profileId, newName),

  setActiveClaudeProfile: (profileId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_SET_ACTIVE, profileId),

  switchClaudeProfile: (terminalId: string, profileId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_SWITCH, terminalId, profileId),

  initializeClaudeProfile: (profileId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_INITIALIZE, profileId),

  setClaudeProfileToken: (profileId: string, token: string, email?: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_SET_TOKEN, profileId, token, email),

  getAutoSwitchSettings: (): Promise<IPCResult<import('../shared/types').ClaudeAutoSwitchSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_AUTO_SWITCH_SETTINGS),

  updateAutoSwitchSettings: (settings: Partial<import('../shared/types').ClaudeAutoSwitchSettings>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_UPDATE_AUTO_SWITCH, settings),

  fetchClaudeUsage: (terminalId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_FETCH_USAGE, terminalId),

  getBestAvailableProfile: (excludeProfileId?: string): Promise<IPCResult<import('../shared/types').ClaudeProfile | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_PROFILE_GET_BEST_PROFILE, excludeProfileId),

  onSDKRateLimit: (
    callback: (info: import('../shared/types').SDKRateLimitInfo) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: import('../shared/types').SDKRateLimitInfo
    ): void => {
      callback(info);
    };
    ipcRenderer.on(IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, handler);
    };
  },

  retryWithProfile: (request: import('../shared/types').RetryWithProfileRequest): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_RETRY_WITH_PROFILE, request),

  // ============================================
  // App Settings
  // ============================================

  getSettings: (): Promise<IPCResult<AppSettings>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (settings: Partial<AppSettings>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),

  // ============================================
  // Dialog Operations
  // ============================================

  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY),

  createProjectFolder: (
    location: string,
    name: string,
    initGit: boolean
  ): Promise<IPCResult<import('../shared/types').CreateProjectFolderResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_CREATE_PROJECT_FOLDER, location, name, initGit),

  getDefaultProjectLocation: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIALOG_GET_DEFAULT_PROJECT_LOCATION),

  // ============================================
  // App Info
  // ============================================

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

  // ============================================
  // Roadmap Operations
  // ============================================

  getRoadmap: (projectId: string): Promise<IPCResult<Roadmap | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROADMAP_GET, projectId),

  generateRoadmap: (projectId: string): void =>
    ipcRenderer.send(IPC_CHANNELS.ROADMAP_GENERATE, projectId),

  refreshRoadmap: (projectId: string): void =>
    ipcRenderer.send(IPC_CHANNELS.ROADMAP_REFRESH, projectId),

  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROADMAP_UPDATE_FEATURE, projectId, featureId, status),

  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROADMAP_CONVERT_TO_SPEC, projectId, featureId),

  // ============================================
  // Roadmap Event Listeners
  // ============================================

  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      status: RoadmapGenerationStatus
    ): void => {
      callback(projectId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.ROADMAP_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ROADMAP_PROGRESS, handler);
    };
  },

  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      roadmap: Roadmap
    ): void => {
      callback(projectId, roadmap);
    };
    ipcRenderer.on(IPC_CHANNELS.ROADMAP_COMPLETE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ROADMAP_COMPLETE, handler);
    };
  },

  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      error: string
    ): void => {
      callback(projectId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.ROADMAP_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ROADMAP_ERROR, handler);
    };
  },

  // ============================================
  // Context Operations
  // ============================================

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

  // ============================================
  // Environment Configuration Operations
  // ============================================

  getProjectEnv: (projectId: string): Promise<IPCResult<ProjectEnvConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_GET, projectId),

  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_UPDATE, projectId, config),

  checkClaudeAuth: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_CHECK_CLAUDE_AUTH, projectId),

  invokeClaudeSetup: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_INVOKE_CLAUDE_SETUP, projectId),

  // ============================================
  // Linear Integration Operations
  // ============================================

  getLinearTeams: (projectId: string): Promise<IPCResult<LinearTeam[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LINEAR_GET_TEAMS, projectId),

  getLinearProjects: (projectId: string, teamId: string): Promise<IPCResult<LinearProject[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LINEAR_GET_PROJECTS, projectId, teamId),

  getLinearIssues: (projectId: string, teamId?: string, linearProjectId?: string): Promise<IPCResult<LinearIssue[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LINEAR_GET_ISSUES, projectId, teamId, linearProjectId),

  importLinearIssues: (projectId: string, issueIds: string[]): Promise<IPCResult<LinearImportResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LINEAR_IMPORT_ISSUES, projectId, issueIds),

  checkLinearConnection: (projectId: string): Promise<IPCResult<LinearSyncStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LINEAR_CHECK_CONNECTION, projectId),

  // ============================================
  // GitHub Integration Operations
  // ============================================

  getGitHubRepositories: (projectId: string): Promise<IPCResult<GitHubRepository[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_REPOSITORIES, projectId),

  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all'): Promise<IPCResult<GitHubIssue[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_ISSUES, projectId, state),

  getGitHubIssue: (projectId: string, issueNumber: number): Promise<IPCResult<GitHubIssue>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_ISSUE, projectId, issueNumber),

  checkGitHubConnection: (projectId: string): Promise<IPCResult<GitHubSyncStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_CHECK_CONNECTION, projectId),

  investigateGitHubIssue: (projectId: string, issueNumber: number): void =>
    ipcRenderer.send(IPC_CHANNELS.GITHUB_INVESTIGATE_ISSUE, projectId, issueNumber),

  importGitHubIssues: (projectId: string, issueNumbers: number[]): Promise<IPCResult<GitHubImportResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_IMPORT_ISSUES, projectId, issueNumbers),

  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ): Promise<IPCResult<{ url: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_CREATE_RELEASE, projectId, version, releaseNotes, options),

  // ============================================
  // GitHub Event Listeners
  // ============================================

  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      status: GitHubInvestigationStatus
    ): void => {
      callback(projectId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS, handler);
    };
  },

  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      result: GitHubInvestigationResult
    ): void => {
      callback(projectId, result);
    };
    ipcRenderer.on(IPC_CHANNELS.GITHUB_INVESTIGATION_COMPLETE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GITHUB_INVESTIGATION_COMPLETE, handler);
    };
  },

  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      error: string
    ): void => {
      callback(projectId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR, handler);
    };
  },

  // ============================================
  // Ideation Operations
  // ============================================

  getIdeation: (projectId: string): Promise<IPCResult<IdeationSession | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.IDEATION_GET, projectId),

  generateIdeation: (projectId: string, config: IdeationConfig): void =>
    ipcRenderer.send(IPC_CHANNELS.IDEATION_GENERATE, projectId, config),

  refreshIdeation: (projectId: string, config: IdeationConfig): void =>
    ipcRenderer.send(IPC_CHANNELS.IDEATION_REFRESH, projectId, config),

  stopIdeation: (projectId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IDEATION_STOP, projectId),

  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IDEATION_UPDATE_IDEA, projectId, ideaId, status),

  convertIdeaToTask: (projectId: string, ideaId: string): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.IDEATION_CONVERT_TO_TASK, projectId, ideaId),

  dismissIdea: (projectId: string, ideaId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IDEATION_DISMISS, projectId, ideaId),

  dismissAllIdeas: (projectId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IDEATION_DISMISS_ALL, projectId),

  // ============================================
  // Ideation Event Listeners
  // ============================================

  onIdeationProgress: (
    callback: (projectId: string, status: IdeationGenerationStatus) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      status: IdeationGenerationStatus
    ): void => {
      callback(projectId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_PROGRESS, handler);
    };
  },

  onIdeationLog: (
    callback: (projectId: string, log: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      log: string
    ): void => {
      callback(projectId, log);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_LOG, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_LOG, handler);
    };
  },

  onIdeationComplete: (
    callback: (projectId: string, session: IdeationSession) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      session: IdeationSession
    ): void => {
      callback(projectId, session);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_COMPLETE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_COMPLETE, handler);
    };
  },

  onIdeationError: (
    callback: (projectId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      error: string
    ): void => {
      callback(projectId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_ERROR, handler);
    };
  },

  onIdeationStopped: (
    callback: (projectId: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string
    ): void => {
      callback(projectId);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_STOPPED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_STOPPED, handler);
    };
  },

  onIdeationTypeComplete: (
    callback: (projectId: string, ideationType: string, ideas: Idea[]) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      ideationType: string,
      ideas: Idea[]
    ): void => {
      callback(projectId, ideationType, ideas);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_TYPE_COMPLETE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_TYPE_COMPLETE, handler);
    };
  },

  onIdeationTypeFailed: (
    callback: (projectId: string, ideationType: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      ideationType: string
    ): void => {
      callback(projectId, ideationType);
    };
    ipcRenderer.on(IPC_CHANNELS.IDEATION_TYPE_FAILED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IDEATION_TYPE_FAILED, handler);
    };
  },

  // ============================================
  // Auto-Build Source Update Operations
  // ============================================

  checkAutoBuildSourceUpdate: (): Promise<IPCResult<AutoBuildSourceUpdateCheck>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_CHECK),

  downloadAutoBuildSourceUpdate: (): void =>
    ipcRenderer.send(IPC_CHANNELS.AUTOBUILD_SOURCE_DOWNLOAD),

  getAutoBuildSourceVersion: (): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_VERSION),

  onAutoBuildSourceUpdateProgress: (
    callback: (progress: AutoBuildSourceUpdateProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: AutoBuildSourceUpdateProgress
    ): void => {
      callback(progress);
    };
    ipcRenderer.on(IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS, handler);
    };
  },

  // ============================================
  // Auto-Build Source Environment Operations
  // ============================================

  getSourceEnv: (): Promise<IPCResult<SourceEnvConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_GET),

  updateSourceEnv: (config: { claudeOAuthToken?: string }): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_UPDATE, config),

  checkSourceToken: (): Promise<IPCResult<SourceEnvCheckResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTOBUILD_SOURCE_ENV_CHECK_TOKEN),

  // ============================================
  // Changelog Operations
  // ============================================

  getChangelogDoneTasks: (projectId: string, tasks?: Task[]): Promise<IPCResult<ChangelogTask[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_GET_DONE_TASKS, projectId, tasks),

  loadTaskSpecs: (projectId: string, taskIds: string[]): Promise<IPCResult<TaskSpecContent[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_LOAD_TASK_SPECS, projectId, taskIds),

  generateChangelog: (request: ChangelogGenerationRequest): void =>
    ipcRenderer.send(IPC_CHANNELS.CHANGELOG_GENERATE, request),

  saveChangelog: (request: ChangelogSaveRequest): Promise<IPCResult<ChangelogSaveResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_SAVE, request),

  readExistingChangelog: (projectId: string): Promise<IPCResult<ExistingChangelog>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_READ_EXISTING, projectId),

  suggestChangelogVersion: (
    projectId: string,
    taskIds: string[]
  ): Promise<IPCResult<{ version: string; reason: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_SUGGEST_VERSION, projectId, taskIds),

  // Changelog git operations (for git-based changelog generation)
  getChangelogBranches: (projectId: string): Promise<IPCResult<GitBranchInfo[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_GET_BRANCHES, projectId),

  getChangelogTags: (projectId: string): Promise<IPCResult<GitTagInfo[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_GET_TAGS, projectId),

  getChangelogCommitsPreview: (
    projectId: string,
    options: GitHistoryOptions | BranchDiffOptions,
    mode: 'git-history' | 'branch-diff'
  ): Promise<IPCResult<GitCommit[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_GET_COMMITS_PREVIEW, projectId, options, mode),

  // ============================================
  // Changelog Event Listeners
  // ============================================

  onChangelogGenerationProgress: (
    callback: (projectId: string, progress: ChangelogGenerationProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      progress: ChangelogGenerationProgress
    ): void => {
      callback(projectId, progress);
    };
    ipcRenderer.on(IPC_CHANNELS.CHANGELOG_GENERATION_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHANGELOG_GENERATION_PROGRESS, handler);
    };
  },

  onChangelogGenerationComplete: (
    callback: (projectId: string, result: ChangelogGenerationResult) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      result: ChangelogGenerationResult
    ): void => {
      callback(projectId, result);
    };
    ipcRenderer.on(IPC_CHANNELS.CHANGELOG_GENERATION_COMPLETE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHANGELOG_GENERATION_COMPLETE, handler);
    };
  },

  onChangelogGenerationError: (
    callback: (projectId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      error: string
    ): void => {
      callback(projectId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.CHANGELOG_GENERATION_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHANGELOG_GENERATION_ERROR, handler);
    };
  },

  // ============================================
  // Insights Operations
  // ============================================

  getInsightsSession: (projectId: string): Promise<IPCResult<InsightsSession | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_GET_SESSION, projectId),

  sendInsightsMessage: (projectId: string, message: string): void =>
    ipcRenderer.send(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, projectId, message),

  clearInsightsSession: (projectId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_CLEAR_SESSION, projectId),

  createTaskFromInsights: (
    projectId: string,
    title: string,
    description: string,
    metadata?: TaskMetadata
  ): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_CREATE_TASK, projectId, title, description, metadata),

  listInsightsSessions: (projectId: string): Promise<IPCResult<InsightsSessionSummary[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_LIST_SESSIONS, projectId),

  newInsightsSession: (projectId: string): Promise<IPCResult<InsightsSession>> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_NEW_SESSION, projectId),

  switchInsightsSession: (projectId: string, sessionId: string): Promise<IPCResult<InsightsSession | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_SWITCH_SESSION, projectId, sessionId),

  deleteInsightsSession: (projectId: string, sessionId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_DELETE_SESSION, projectId, sessionId),

  renameInsightsSession: (projectId: string, sessionId: string, newTitle: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_RENAME_SESSION, projectId, sessionId, newTitle),

  // ============================================
  // Insights Event Listeners
  // ============================================

  onInsightsStreamChunk: (
    callback: (projectId: string, chunk: InsightsStreamChunk) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      chunk: InsightsStreamChunk
    ): void => {
      callback(projectId, chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.INSIGHTS_STREAM_CHUNK, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.INSIGHTS_STREAM_CHUNK, handler);
    };
  },

  onInsightsStatus: (
    callback: (projectId: string, status: InsightsChatStatus) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      status: InsightsChatStatus
    ): void => {
      callback(projectId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.INSIGHTS_STATUS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.INSIGHTS_STATUS, handler);
    };
  },

  onInsightsError: (
    callback: (projectId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      projectId: string,
      error: string
    ): void => {
      callback(projectId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.INSIGHTS_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.INSIGHTS_ERROR, handler);
    };
  },

  // ============================================
  // File Explorer Operations
  // ============================================

  listDirectory: (dirPath: string): Promise<import('../shared/types').IPCResult<import('../shared/types').FileNode[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_EXPLORER_LIST, dirPath)
};

// Expose to renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
