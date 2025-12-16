import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  Task,
  IPCResult,
  Roadmap,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus,
  IdeationSession,
  IdeationConfig,
  IdeationStatus,
  IdeationGenerationStatus,
  Idea,
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
  AutoBuildSourceUpdateCheck,
  AutoBuildSourceUpdateProgress,
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
  TaskMetadata
} from '../../shared/types';

export interface AgentAPI {
  // Roadmap Operations
  getRoadmap: (projectId: string) => Promise<IPCResult<Roadmap | null>>;
  saveRoadmap: (projectId: string, roadmap: Roadmap) => Promise<IPCResult>;
  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean) => void;
  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean) => void;  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ) => Promise<IPCResult>;
  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ) => Promise<IPCResult<Task>>;

  // Roadmap Event Listeners
  onRoadmapProgress: (callback: (projectId: string, status: RoadmapGenerationStatus) => void) => () => void;
  onRoadmapComplete: (callback: (projectId: string, roadmap: Roadmap) => void) => () => void;
  onRoadmapError: (callback: (projectId: string, error: string) => void) => () => void;

  // Ideation Operations
  getIdeation: (projectId: string) => Promise<IPCResult<IdeationSession | null>>;
  generateIdeation: (projectId: string, config: IdeationConfig) => void;
  refreshIdeation: (projectId: string, config: IdeationConfig) => void;
  stopIdeation: (projectId: string) => Promise<IPCResult>;
  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus) => Promise<IPCResult>;
  convertIdeaToTask: (projectId: string, ideaId: string) => Promise<IPCResult<Task>>;
  dismissIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  dismissAllIdeas: (projectId: string) => Promise<IPCResult>;

  // Ideation Event Listeners
  onIdeationProgress: (callback: (projectId: string, status: IdeationGenerationStatus) => void) => () => void;
  onIdeationLog: (callback: (projectId: string, log: string) => void) => () => void;
  onIdeationComplete: (callback: (projectId: string, session: IdeationSession) => void) => () => void;
  onIdeationError: (callback: (projectId: string, error: string) => void) => () => void;
  onIdeationStopped: (callback: (projectId: string) => void) => () => void;
  onIdeationTypeComplete: (callback: (projectId: string, ideationType: string, ideas: Idea[]) => void) => () => void;
  onIdeationTypeFailed: (callback: (projectId: string, ideationType: string) => void) => () => void;

  // Insights Operations
  getInsightsSession: (projectId: string) => Promise<IPCResult<InsightsSession | null>>;
  sendInsightsMessage: (projectId: string, message: string) => void;
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

  // Insights Event Listeners
  onInsightsStreamChunk: (callback: (projectId: string, chunk: InsightsStreamChunk) => void) => () => void;
  onInsightsStatus: (callback: (projectId: string, status: InsightsChatStatus) => void) => () => void;
  onInsightsError: (callback: (projectId: string, error: string) => void) => () => void;

  // Changelog Operations
  getChangelogDoneTasks: (projectId: string, tasks?: Task[]) => Promise<IPCResult<ChangelogTask[]>>;
  loadTaskSpecs: (projectId: string, taskIds: string[]) => Promise<IPCResult<TaskSpecContent[]>>;
  generateChangelog: (request: ChangelogGenerationRequest) => void;
  saveChangelog: (request: ChangelogSaveRequest) => Promise<IPCResult<ChangelogSaveResult>>;
  readExistingChangelog: (projectId: string) => Promise<IPCResult<ExistingChangelog>>;
  suggestChangelogVersion: (
    projectId: string,
    taskIds: string[]
  ) => Promise<IPCResult<{ version: string; reason: string }>>;
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

  // Changelog Event Listeners
  onChangelogGenerationProgress: (callback: (projectId: string, progress: ChangelogGenerationProgress) => void) => () => void;
  onChangelogGenerationComplete: (callback: (projectId: string, result: ChangelogGenerationResult) => void) => () => void;
  onChangelogGenerationError: (callback: (projectId: string, error: string) => void) => () => void;

  // Linear Integration
  getLinearTeams: (projectId: string) => Promise<IPCResult<LinearTeam[]>>;
  getLinearProjects: (projectId: string, teamId: string) => Promise<IPCResult<LinearProject[]>>;
  getLinearIssues: (projectId: string, teamId?: string, linearProjectId?: string) => Promise<IPCResult<LinearIssue[]>>;
  importLinearIssues: (projectId: string, issueIds: string[]) => Promise<IPCResult<LinearImportResult>>;
  checkLinearConnection: (projectId: string) => Promise<IPCResult<LinearSyncStatus>>;

  // GitHub Integration
  getGitHubRepositories: (projectId: string) => Promise<IPCResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<GitHubIssue>>;
  checkGitHubConnection: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number) => void;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<GitHubImportResult>>;
  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ) => Promise<IPCResult<{ url: string }>>;

  // GitHub Event Listeners
  onGitHubInvestigationProgress: (callback: (projectId: string, status: GitHubInvestigationStatus) => void) => () => void;
  onGitHubInvestigationComplete: (callback: (projectId: string, result: GitHubInvestigationResult) => void) => () => void;
  onGitHubInvestigationError: (callback: (projectId: string, error: string) => void) => () => void;

  // Auto-Build Source Update
  checkAutoBuildSourceUpdate: () => Promise<IPCResult<AutoBuildSourceUpdateCheck>>;
  downloadAutoBuildSourceUpdate: () => void;
  getAutoBuildSourceVersion: () => Promise<IPCResult<string>>;
  onAutoBuildSourceUpdateProgress: (callback: (progress: AutoBuildSourceUpdateProgress) => void) => () => void;
  
  // Shell Operations
  openExternal: (url: string) => Promise<void>;
}

export const createAgentAPI = (): AgentAPI => ({
  // Roadmap Operations
  getRoadmap: (projectId: string): Promise<IPCResult<Roadmap | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROADMAP_GET, projectId),

  saveRoadmap: (projectId: string, roadmap: Roadmap): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ROADMAP_SAVE, projectId, roadmap),

  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean): void =>
    ipcRenderer.send(IPC_CHANNELS.ROADMAP_GENERATE, projectId, enableCompetitorAnalysis),
  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean): void =>
    ipcRenderer.send(IPC_CHANNELS.ROADMAP_REFRESH, projectId, enableCompetitorAnalysis),

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

  // Roadmap Event Listeners
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

  // Ideation Operations
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

  // Ideation Event Listeners
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

  // Insights Operations
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

  // Insights Event Listeners
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

  // Changelog Operations
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

  saveChangelogImage: (
    projectId: string,
    imageData: string,
    filename: string
  ): Promise<IPCResult<{ relativePath: string; url: string }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHANGELOG_SAVE_IMAGE, projectId, imageData, filename),

  // Changelog Event Listeners
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

  // Linear Integration
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

  // GitHub Integration
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

  // GitHub Event Listeners
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

  // Auto-Build Source Update
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
  
  // Shell Operations
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url)
});
