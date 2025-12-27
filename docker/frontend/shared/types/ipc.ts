/**
 * IPC (Inter-Process Communication) types for Electron API
 */

import type { IPCResult } from './common';
import type {
  Project,
  ProjectSettings,
  AutoBuildVersionInfo,
  InitializationResult,
  CreateProjectFolderResult,
  FileNode,
  ProjectContextData,
  ProjectIndex,
  GraphitiMemoryStatus,
  ContextSearchResult,
  MemoryEpisode,
  ProjectEnvConfig,
  InfrastructureStatus,
  GraphitiValidationResult,
  GraphitiConnectionTestResult,
  GitStatus
} from './project';
import type {
  Task,
  TaskStatus,
  TaskStartOptions,
  ImplementationPlan,
  ExecutionProgress,
  WorktreeStatus,
  WorktreeDiff,
  WorktreeMergeResult,
  WorktreeDiscardResult,
  WorktreeListResult,
  TaskRecoveryResult,
  TaskRecoveryOptions,
  TaskMetadata,
  TaskLogs,
  TaskLogStreamChunk
} from './task';
import type {
  TerminalCreateOptions,
  TerminalSession,
  TerminalRestoreResult,
  SessionDateInfo,
  SessionDateRestoreResult,
  RateLimitInfo,
  SDKRateLimitInfo,
  RetryWithProfileRequest
} from './terminal';
import type {
  ClaudeProfileSettings,
  ClaudeProfile,
  ClaudeAutoSwitchSettings,
  ClaudeAuthResult,
  ClaudeUsageSnapshot
} from './agent';
import type { AppSettings, SourceEnvConfig, SourceEnvCheckResult, AutoBuildSourceUpdateCheck, AutoBuildSourceUpdateProgress } from './settings';
import type { AppUpdateInfo, AppUpdateProgress, AppUpdateAvailableEvent, AppUpdateDownloadedEvent } from './app-update';
import type {
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
  ReleaseableVersion,
  ReleasePreflightStatus,
  CreateReleaseRequest,
  CreateReleaseResult,
  ReleaseProgress
} from './changelog';
import type {
  IdeationSession,
  IdeationConfig,
  IdeationStatus,
  IdeationGenerationStatus,
  Idea,
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsModelConfig
} from './insights';
import type {
  Roadmap,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus
} from './roadmap';
import type {
  LinearTeam,
  LinearProject,
  LinearIssue,
  LinearImportResult,
  LinearSyncStatus,
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationResult,
  GitHubInvestigationStatus
} from './integrations';

// Electron API exposed via contextBridge
export interface ElectronAPI {
  // Project operations
  addProject: (projectPath: string) => Promise<IPCResult<Project>>;
  removeProject: (projectId: string) => Promise<IPCResult>;
  getProjects: () => Promise<IPCResult<Project[]>>;
  updateProjectSettings: (projectId: string, settings: Partial<ProjectSettings>) => Promise<IPCResult>;
  initializeProject: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  updateProjectAutoBuild: (projectId: string) => Promise<IPCResult<InitializationResult>>;
  checkProjectVersion: (projectId: string) => Promise<IPCResult<AutoBuildVersionInfo>>;

  // Task operations
  getTasks: (projectId: string) => Promise<IPCResult<Task[]>>;
  createTask: (projectId: string, title: string, description: string, metadata?: TaskMetadata) => Promise<IPCResult<Task>>;
  deleteTask: (taskId: string) => Promise<IPCResult>;
  updateTask: (taskId: string, updates: { title?: string; description?: string }) => Promise<IPCResult<Task>>;
  startTask: (taskId: string, options?: TaskStartOptions) => void;
  stopTask: (taskId: string) => void;
  submitReview: (taskId: string, approved: boolean, feedback?: string) => Promise<IPCResult>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<IPCResult>;
  recoverStuckTask: (taskId: string, options?: TaskRecoveryOptions) => Promise<IPCResult<TaskRecoveryResult>>;
  checkTaskRunning: (taskId: string) => Promise<IPCResult<boolean>>;

  // Workspace management (for human review)
  // Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
  getWorktreeStatus: (taskId: string) => Promise<IPCResult<WorktreeStatus>>;
  getWorktreeDiff: (taskId: string) => Promise<IPCResult<WorktreeDiff>>;
  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }) => Promise<IPCResult<WorktreeMergeResult>>;
  mergeWorktreePreview: (taskId: string) => Promise<IPCResult<WorktreeMergeResult>>;
  discardWorktree: (taskId: string) => Promise<IPCResult<WorktreeDiscardResult>>;
  listWorktrees: (projectId: string) => Promise<IPCResult<WorktreeListResult>>;

  // Task archive operations
  archiveTasks: (projectId: string, taskIds: string[], version?: string) => Promise<IPCResult<boolean>>;
  unarchiveTasks: (projectId: string, taskIds: string[]) => Promise<IPCResult<boolean>>;

  // Event listeners
  onTaskProgress: (callback: (taskId: string, plan: ImplementationPlan) => void) => () => void;
  onTaskError: (callback: (taskId: string, error: string) => void) => () => void;
  onTaskLog: (callback: (taskId: string, log: string) => void) => () => void;
  onTaskStatusChange: (callback: (taskId: string, status: TaskStatus) => void) => () => void;
  onTaskExecutionProgress: (callback: (taskId: string, progress: ExecutionProgress) => void) => () => void;

  // Terminal operations
  createTerminal: (options: TerminalCreateOptions) => Promise<IPCResult>;
  destroyTerminal: (id: string) => Promise<IPCResult>;
  sendTerminalInput: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  invokeClaudeInTerminal: (id: string, cwd?: string) => void;
  generateTerminalName: (command: string, cwd?: string) => Promise<IPCResult<string>>;

  // Terminal session management (persistence/restore)
  getTerminalSessions: (projectPath: string) => Promise<IPCResult<TerminalSession[]>>;
  restoreTerminalSession: (session: TerminalSession, cols?: number, rows?: number) => Promise<IPCResult<TerminalRestoreResult>>;
  clearTerminalSessions: (projectPath: string) => Promise<IPCResult>;
  resumeClaudeInTerminal: (id: string, sessionId?: string) => void;
  getTerminalSessionDates: (projectPath?: string) => Promise<IPCResult<SessionDateInfo[]>>;
  getTerminalSessionsForDate: (date: string, projectPath: string) => Promise<IPCResult<TerminalSession[]>>;
  restoreTerminalSessionsFromDate: (date: string, projectPath: string, cols?: number, rows?: number) => Promise<IPCResult<SessionDateRestoreResult>>;
  saveTerminalBuffer: (terminalId: string, serialized: string) => Promise<void>;

  // Terminal event listeners
  onTerminalOutput: (callback: (id: string, data: string) => void) => () => void;
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void;
  onTerminalTitleChange: (callback: (id: string, title: string) => void) => () => void;
  onTerminalClaudeSession: (callback: (id: string, sessionId: string) => void) => () => void;
  onTerminalRateLimit: (callback: (info: RateLimitInfo) => void) => () => void;
  /** Listen for OAuth authentication completion (token is auto-saved to profile, never exposed to frontend) */
  onTerminalOAuthToken: (callback: (info: {
    terminalId: string;
    profileId?: string;
    email?: string;
    success: boolean;
    message?: string;
    detectedAt: string
  }) => void) => () => void;

  // Claude profile management (multi-account support)
  getClaudeProfiles: () => Promise<IPCResult<ClaudeProfileSettings>>;
  saveClaudeProfile: (profile: ClaudeProfile) => Promise<IPCResult<ClaudeProfile>>;
  deleteClaudeProfile: (profileId: string) => Promise<IPCResult>;
  renameClaudeProfile: (profileId: string, newName: string) => Promise<IPCResult>;
  setActiveClaudeProfile: (profileId: string) => Promise<IPCResult>;
  /** Switch terminal to use a different Claude profile (restarts Claude with new config) */
  switchClaudeProfile: (terminalId: string, profileId: string) => Promise<IPCResult>;
  /** Initialize authentication for a Claude profile */
  initializeClaudeProfile: (profileId: string) => Promise<IPCResult>;
  /** Set OAuth token for a profile (used when capturing from terminal) */
  setClaudeProfileToken: (profileId: string, token: string, email?: string) => Promise<IPCResult>;
  /** Get auto-switch settings */
  getAutoSwitchSettings: () => Promise<IPCResult<ClaudeAutoSwitchSettings>>;
  /** Update auto-switch settings */
  updateAutoSwitchSettings: (settings: Partial<ClaudeAutoSwitchSettings>) => Promise<IPCResult>;
  /** Request usage fetch from a terminal (sends /usage command) */
  fetchClaudeUsage: (terminalId: string) => Promise<IPCResult>;
  /** Get the best available profile (for manual switching) */
  getBestAvailableProfile: (excludeProfileId?: string) => Promise<IPCResult<ClaudeProfile | null>>;
  /** Listen for SDK/CLI rate limit events (non-terminal) */
  onSDKRateLimit: (callback: (info: SDKRateLimitInfo) => void) => () => void;
  /** Retry a rate-limited operation with a different profile */
  retryWithProfile: (request: RetryWithProfileRequest) => Promise<IPCResult>;

  // Usage Monitoring (Proactive Account Switching)
  /** Request current usage snapshot */
  requestUsageUpdate: () => Promise<IPCResult<ClaudeUsageSnapshot | null>>;
  /** Listen for usage data updates */
  onUsageUpdated: (callback: (usage: ClaudeUsageSnapshot) => void) => () => void;
  /** Listen for proactive swap notifications */
  onProactiveSwapNotification: (callback: (notification: {
    fromProfile: { id: string; name: string };
    toProfile: { id: string; name: string };
    reason: string;
    usageSnapshot: ClaudeUsageSnapshot;
  }) => void) => () => void;

  // App settings
  getSettings: () => Promise<IPCResult<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<IPCResult>;

  // Dialog operations
  selectDirectory: () => Promise<string | null>;
  createProjectFolder: (location: string, name: string, initGit: boolean) => Promise<IPCResult<CreateProjectFolderResult>>;
  getDefaultProjectLocation: () => Promise<string | null>;

  // App info
  getAppVersion: () => Promise<string>;

  // Roadmap operations
  getRoadmap: (projectId: string) => Promise<IPCResult<Roadmap | null>>;
  getRoadmapStatus: (projectId: string) => Promise<IPCResult<{ isRunning: boolean }>>;
  saveRoadmap: (projectId: string, roadmap: Roadmap) => Promise<IPCResult>;
  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean) => void;
  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean) => void;
  stopRoadmap: (projectId: string) => Promise<IPCResult>;
  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ) => Promise<IPCResult>;
  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ) => Promise<IPCResult<Task>>;

  // Roadmap event listeners
  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ) => () => void;
  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ) => () => void;
  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;
  onRoadmapStopped: (
    callback: (projectId: string) => void
  ) => () => void;

  // Context operations
  getProjectContext: (projectId: string) => Promise<IPCResult<ProjectContextData>>;
  refreshProjectIndex: (projectId: string) => Promise<IPCResult<ProjectIndex>>;
  getMemoryStatus: (projectId: string) => Promise<IPCResult<GraphitiMemoryStatus>>;
  searchMemories: (projectId: string, query: string) => Promise<IPCResult<ContextSearchResult[]>>;
  getRecentMemories: (projectId: string, limit?: number) => Promise<IPCResult<MemoryEpisode[]>>;

  // Environment configuration operations
  getProjectEnv: (projectId: string) => Promise<IPCResult<ProjectEnvConfig>>;
  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>) => Promise<IPCResult>;
  checkClaudeAuth: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;
  invokeClaudeSetup: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;

  // Docker & Infrastructure operations (for Graphiti/FalkorDB)
  getInfrastructureStatus: (port?: number) => Promise<IPCResult<InfrastructureStatus>>;
  startFalkorDB: (port?: number) => Promise<IPCResult<{ success: boolean; error?: string }>>;
  stopFalkorDB: () => Promise<IPCResult<{ success: boolean; error?: string }>>;
  openDockerDesktop: () => Promise<IPCResult<{ success: boolean; error?: string }>>;
  getDockerDownloadUrl: () => Promise<string>;

  // Graphiti validation operations
  validateFalkorDBConnection: (uri: string) => Promise<IPCResult<GraphitiValidationResult>>;
  validateOpenAIApiKey: (apiKey: string) => Promise<IPCResult<GraphitiValidationResult>>;
  testGraphitiConnection: (
    falkorDbUri: string,
    openAiApiKey: string
  ) => Promise<IPCResult<GraphitiConnectionTestResult>>;

  // Linear integration operations
  getLinearTeams: (projectId: string) => Promise<IPCResult<LinearTeam[]>>;
  getLinearProjects: (projectId: string, teamId: string) => Promise<IPCResult<LinearProject[]>>;
  getLinearIssues: (projectId: string, teamId?: string, projectId_?: string) => Promise<IPCResult<LinearIssue[]>>;
  importLinearIssues: (projectId: string, issueIds: string[]) => Promise<IPCResult<LinearImportResult>>;
  checkLinearConnection: (projectId: string) => Promise<IPCResult<LinearSyncStatus>>;

  // GitHub integration operations
  getGitHubRepositories: (projectId: string) => Promise<IPCResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<GitHubIssue>>;
  checkGitHubConnection: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]) => void;
  getIssueComments: (projectId: string, issueNumber: number) => Promise<IPCResult<Array<{ id: number; body: string; user: { login: string; avatar_url?: string }; created_at: string; updated_at: string }>>>;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<GitHubImportResult>>;
  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ) => Promise<IPCResult<{ url: string }>>;

  // GitHub OAuth operations (gh CLI)
  checkGitHubCli: () => Promise<IPCResult<{ installed: boolean; version?: string }>>;
  checkGitHubAuth: () => Promise<IPCResult<{ authenticated: boolean; username?: string }>>;
  startGitHubAuth: () => Promise<IPCResult<{ success: boolean; message?: string }>>;
  getGitHubToken: () => Promise<IPCResult<{ token: string }>>;
  getGitHubUser: () => Promise<IPCResult<{ username: string; name?: string }>>;
  listGitHubUserRepos: () => Promise<IPCResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean }> }>>;
  detectGitHubRepo: (projectPath: string) => Promise<IPCResult<string>>;
  getGitHubBranches: (repo: string, token: string) => Promise<IPCResult<string[]>>;

  // GitHub event listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ) => () => void;
  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ) => () => void;
  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Release operations
  getReleaseableVersions: (projectId: string) => Promise<IPCResult<ReleaseableVersion[]>>;
  runReleasePreflightCheck: (projectId: string, version: string) => Promise<IPCResult<ReleasePreflightStatus>>;
  createRelease: (request: CreateReleaseRequest) => void;

  // Release event listeners
  onReleaseProgress: (
    callback: (projectId: string, progress: ReleaseProgress) => void
  ) => () => void;
  onReleaseComplete: (
    callback: (projectId: string, result: CreateReleaseResult) => void
  ) => () => void;
  onReleaseError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Ideation operations
  getIdeation: (projectId: string) => Promise<IPCResult<IdeationSession | null>>;
  generateIdeation: (projectId: string, config: IdeationConfig) => void;
  refreshIdeation: (projectId: string, config: IdeationConfig) => void;
  stopIdeation: (projectId: string) => Promise<IPCResult>;
  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus) => Promise<IPCResult>;
  convertIdeaToTask: (projectId: string, ideaId: string) => Promise<IPCResult<Task>>;
  dismissIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  dismissAllIdeas: (projectId: string) => Promise<IPCResult>;
  archiveIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  deleteIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  deleteMultipleIdeas: (projectId: string, ideaIds: string[]) => Promise<IPCResult>;

  // Ideation event listeners
  onIdeationProgress: (
    callback: (projectId: string, status: IdeationGenerationStatus) => void
  ) => () => void;
  onIdeationLog: (
    callback: (projectId: string, log: string) => void
  ) => () => void;
  onIdeationComplete: (
    callback: (projectId: string, session: IdeationSession) => void
  ) => () => void;
  onIdeationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;
  onIdeationStopped: (
    callback: (projectId: string) => void
  ) => () => void;
  onIdeationTypeComplete: (
    callback: (projectId: string, ideationType: string, ideas: Idea[]) => void
  ) => () => void;
  onIdeationTypeFailed: (
    callback: (projectId: string, ideationType: string) => void
  ) => () => void;

  // Auto Claude source update operations
  checkAutoBuildSourceUpdate: () => Promise<IPCResult<AutoBuildSourceUpdateCheck>>;
  downloadAutoBuildSourceUpdate: () => void;
  getAutoBuildSourceVersion: () => Promise<IPCResult<string>>;

  // Auto Claude source update event listeners
  onAutoBuildSourceUpdateProgress: (
    callback: (progress: AutoBuildSourceUpdateProgress) => void
  ) => () => void;

  // Electron app update operations
  checkAppUpdate: () => Promise<IPCResult<AppUpdateInfo | null>>;
  downloadAppUpdate: () => Promise<IPCResult>;
  installAppUpdate: () => void;

  // Electron app update event listeners
  onAppUpdateAvailable: (
    callback: (info: AppUpdateAvailableEvent) => void
  ) => () => void;
  onAppUpdateDownloaded: (
    callback: (info: AppUpdateDownloadedEvent) => void
  ) => () => void;
  onAppUpdateProgress: (
    callback: (progress: AppUpdateProgress) => void
  ) => () => void;

  // Shell operations
  openExternal: (url: string) => Promise<void>;

  // Auto Claude source environment operations
  getSourceEnv: () => Promise<IPCResult<SourceEnvConfig>>;
  updateSourceEnv: (config: { claudeOAuthToken?: string }) => Promise<IPCResult>;
  checkSourceToken: () => Promise<IPCResult<SourceEnvCheckResult>>;

  // Changelog operations
  getChangelogDoneTasks: (projectId: string, tasks?: Task[]) => Promise<IPCResult<ChangelogTask[]>>;
  loadTaskSpecs: (projectId: string, taskIds: string[]) => Promise<IPCResult<TaskSpecContent[]>>;
  generateChangelog: (request: ChangelogGenerationRequest) => void; // Async with progress events
  saveChangelog: (request: ChangelogSaveRequest) => Promise<IPCResult<ChangelogSaveResult>>;
  readExistingChangelog: (projectId: string) => Promise<IPCResult<ExistingChangelog>>;
  suggestChangelogVersion: (
    projectId: string,
    taskIds: string[]
  ) => Promise<IPCResult<{ version: string; reason: string }>>;
  suggestChangelogVersionFromCommits: (
    projectId: string,
    commits: import('./changelog').GitCommit[]
  ) => Promise<IPCResult<{ version: string; reason: string }>>;

  // Changelog git operations (for git-based changelog generation)
  getChangelogBranches: (projectId: string) => Promise<IPCResult<GitBranchInfo[]>>;
  getChangelogTags: (projectId: string) => Promise<IPCResult<GitTagInfo[]>>;
  getChangelogCommitsPreview: (
    projectId: string,
    options: GitHistoryOptions | BranchDiffOptions,
    mode: 'git-history' | 'branch-diff'
  ) => Promise<IPCResult<GitCommit[]>>;
  saveChangelogImage: (
    projectId: string,
    imageData: string,
    filename: string
  ) => Promise<IPCResult<{ relativePath: string; url: string }>>;

  // Changelog event listeners
  onChangelogGenerationProgress: (
    callback: (projectId: string, progress: ChangelogGenerationProgress) => void
  ) => () => void;
  onChangelogGenerationComplete: (
    callback: (projectId: string, result: ChangelogGenerationResult) => void
  ) => () => void;
  onChangelogGenerationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Insights operations
  getInsightsSession: (projectId: string) => Promise<IPCResult<InsightsSession | null>>;
  sendInsightsMessage: (projectId: string, message: string, modelConfig?: InsightsModelConfig) => void;
  clearInsightsSession: (projectId: string) => Promise<IPCResult>;
  createTaskFromInsights: (
    projectId: string,
    title: string,
    description: string,
    metadata?: TaskMetadata
  ) => Promise<IPCResult<Task>>;
  listInsightsSessions: (projectId: string) => Promise<IPCResult<InsightsSessionSummary[]>>;
  newInsightsSession: (projectId: string) => Promise<IPCResult<InsightsSession>>;
  switchInsightsSession: (projectId: string, sessionId: string) => Promise<IPCResult<InsightsSession | null>>;
  deleteInsightsSession: (projectId: string, sessionId: string) => Promise<IPCResult>;
  renameInsightsSession: (projectId: string, sessionId: string, newTitle: string) => Promise<IPCResult>;
  updateInsightsModelConfig: (projectId: string, sessionId: string, modelConfig: InsightsModelConfig) => Promise<IPCResult>;

  // Insights event listeners
  onInsightsStreamChunk: (
    callback: (projectId: string, chunk: InsightsStreamChunk) => void
  ) => () => void;
  onInsightsStatus: (
    callback: (projectId: string, status: InsightsChatStatus) => void
  ) => () => void;
  onInsightsError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Task logs operations
  getTaskLogs: (projectId: string, specId: string) => Promise<IPCResult<TaskLogs | null>>;
  watchTaskLogs: (projectId: string, specId: string) => Promise<IPCResult>;
  unwatchTaskLogs: (specId: string) => Promise<IPCResult>;

  // Task logs event listeners
  onTaskLogsChanged: (
    callback: (specId: string, logs: TaskLogs) => void
  ) => () => void;
  onTaskLogsStream: (
    callback: (specId: string, chunk: TaskLogStreamChunk) => void
  ) => () => void;

  // File explorer operations
  listDirectory: (dirPath: string) => Promise<IPCResult<FileNode[]>>;

  // Git operations
  getGitBranches: (projectPath: string) => Promise<IPCResult<string[]>>;
  getCurrentGitBranch: (projectPath: string) => Promise<IPCResult<string | null>>;
  detectMainBranch: (projectPath: string) => Promise<IPCResult<string | null>>;
  checkGitStatus: (projectPath: string) => Promise<IPCResult<GitStatus>>;
  initializeGit: (projectPath: string) => Promise<IPCResult<InitializationResult>>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    DEBUG: boolean;
  }
}
