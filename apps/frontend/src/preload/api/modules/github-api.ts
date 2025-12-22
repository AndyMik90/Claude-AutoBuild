import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationStatus,
  GitHubInvestigationResult,
  IPCResult,
  VersionSuggestion
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * GitHub Integration API operations
 */
export interface GitHubAPI {
  // Operations
  getGitHubRepositories: (projectId: string) => Promise<IPCResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<GitHubIssue>>;
  getIssueComments: (projectId: string, issueNumber: number) => Promise<IPCResult<any[]>>;
  checkGitHubConnection: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]) => void;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<GitHubImportResult>>;
  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ) => Promise<IPCResult<{ url: string }>>;

  /** AI-powered version suggestion based on commits since last release */
  suggestReleaseVersion: (projectId: string) => Promise<IPCResult<VersionSuggestion>>;

  // OAuth operations (gh CLI)
  checkGitHubCli: () => Promise<IPCResult<{ installed: boolean; version?: string }>>;
  checkGitHubAuth: () => Promise<IPCResult<{ authenticated: boolean; username?: string }>>;
  startGitHubAuth: () => Promise<IPCResult<{ success: boolean; message?: string }>>;
  getGitHubToken: () => Promise<IPCResult<{ token: string }>>;
  getGitHubUser: () => Promise<IPCResult<{ username: string; name?: string }>>;
  listGitHubUserRepos: () => Promise<IPCResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean }> }>>;

  // Repository detection and management
  detectGitHubRepo: (projectPath: string) => Promise<IPCResult<string>>;
  getGitHubBranches: (repo: string, token: string) => Promise<IPCResult<string[]>>;
  createGitHubRepo: (
    repoName: string,
    options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }
  ) => Promise<IPCResult<{ fullName: string; url: string }>>;
  addGitRemote: (
    projectPath: string,
    repoFullName: string
  ) => Promise<IPCResult<{ remoteUrl: string }>>;
  listGitHubOrgs: () => Promise<IPCResult<{ orgs: Array<{ login: string; avatarUrl?: string }> }>>;

  // Event Listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ) => IpcListenerCleanup;
  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ) => IpcListenerCleanup;
  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the GitHub Integration API implementation
 */
export const createGitHubAPI = (): GitHubAPI => ({
  // Operations
  getGitHubRepositories: (projectId: string): Promise<IPCResult<GitHubRepository[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_REPOSITORIES, projectId),

  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all'): Promise<IPCResult<GitHubIssue[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_ISSUES, projectId, state),

  getGitHubIssue: (projectId: string, issueNumber: number): Promise<IPCResult<GitHubIssue>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_ISSUE, projectId, issueNumber),

  getIssueComments: (projectId: string, issueNumber: number): Promise<IPCResult<any[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_ISSUE_COMMENTS, projectId, issueNumber),

  checkGitHubConnection: (projectId: string): Promise<IPCResult<GitHubSyncStatus>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CHECK_CONNECTION, projectId),

  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]): void =>
    sendIpc(IPC_CHANNELS.GITHUB_INVESTIGATE_ISSUE, projectId, issueNumber, selectedCommentIds),

  importGitHubIssues: (projectId: string, issueNumbers: number[]): Promise<IPCResult<GitHubImportResult>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_IMPORT_ISSUES, projectId, issueNumbers),

  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ): Promise<IPCResult<{ url: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CREATE_RELEASE, projectId, version, releaseNotes, options),

  suggestReleaseVersion: (projectId: string): Promise<IPCResult<VersionSuggestion>> =>
    invokeIpc(IPC_CHANNELS.RELEASE_SUGGEST_VERSION, projectId),

  // OAuth operations (gh CLI)
  checkGitHubCli: (): Promise<IPCResult<{ installed: boolean; version?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CHECK_CLI),

  checkGitHubAuth: (): Promise<IPCResult<{ authenticated: boolean; username?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CHECK_AUTH),

  startGitHubAuth: (): Promise<IPCResult<{ success: boolean; message?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_START_AUTH),

  getGitHubToken: (): Promise<IPCResult<{ token: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_TOKEN),

  getGitHubUser: (): Promise<IPCResult<{ username: string; name?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_USER),

  listGitHubUserRepos: (): Promise<IPCResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean }> }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_LIST_USER_REPOS),

  // Repository detection and management
  detectGitHubRepo: (projectPath: string): Promise<IPCResult<string>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_DETECT_REPO, projectPath),

  getGitHubBranches: (repo: string, token: string): Promise<IPCResult<string[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_BRANCHES, repo, token),

  createGitHubRepo: (
    repoName: string,
    options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }
  ): Promise<IPCResult<{ fullName: string; url: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CREATE_REPO, repoName, options),

  addGitRemote: (
    projectPath: string,
    repoFullName: string
  ): Promise<IPCResult<{ remoteUrl: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_ADD_REMOTE, projectPath, repoFullName),

  listGitHubOrgs: (): Promise<IPCResult<{ orgs: Array<{ login: string; avatarUrl?: string }> }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_LIST_ORGS),

  // Event Listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS, callback),

  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_INVESTIGATION_COMPLETE, callback),

  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR, callback)
});
