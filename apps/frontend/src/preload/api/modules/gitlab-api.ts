import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  GitLabProject,
  GitLabIssue,
  GitLabNote,
  GitLabMergeRequest,
  GitLabSyncStatus,
  GitLabImportResult,
  GitLabInvestigationStatus,
  GitLabInvestigationResult,
  GitLabGroup,
  IPCResult
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * GitLab Integration API operations
 */
export interface GitLabAPI {
  // Project operations
  getGitLabProjects: (projectId: string) => Promise<IPCResult<GitLabProject[]>>;
  checkGitLabConnection: (projectId: string) => Promise<IPCResult<GitLabSyncStatus>>;

  // Issue operations
  getGitLabIssues: (projectId: string, state?: 'opened' | 'closed' | 'all') => Promise<IPCResult<GitLabIssue[]>>;
  getGitLabIssue: (projectId: string, issueIid: number) => Promise<IPCResult<GitLabIssue>>;
  getIssueNotes: (projectId: string, issueIid: number) => Promise<IPCResult<GitLabNote[]>>;
  investigateGitLabIssue: (projectId: string, issueIid: number, selectedNoteIds?: number[]) => void;
  importGitLabIssues: (projectId: string, issueIids: number[]) => Promise<IPCResult<GitLabImportResult>>;

  // Merge Request operations
  getGitLabMergeRequests: (projectId: string, state?: string) => Promise<IPCResult<GitLabMergeRequest[]>>;
  getGitLabMergeRequest: (projectId: string, mrIid: number) => Promise<IPCResult<GitLabMergeRequest>>;
  createGitLabMergeRequest: (
    projectId: string,
    options: {
      title: string;
      description?: string;
      sourceBranch: string;
      targetBranch: string;
      labels?: string[];
      assigneeIds?: number[];
      removeSourceBranch?: boolean;
      squash?: boolean;
    }
  ) => Promise<IPCResult<GitLabMergeRequest>>;
  updateGitLabMergeRequest: (
    projectId: string,
    mrIid: number,
    updates: {
      title?: string;
      description?: string;
      targetBranch?: string;
      labels?: string[];
      assigneeIds?: number[];
    }
  ) => Promise<IPCResult<GitLabMergeRequest>>;

  // Release operations
  createGitLabRelease: (
    projectId: string,
    tagName: string,
    releaseNotes: string,
    options?: { description?: string; ref?: string; milestones?: string[] }
  ) => Promise<IPCResult<{ url: string }>>;

  // OAuth operations (glab CLI)
  checkGitLabCli: () => Promise<IPCResult<{ installed: boolean; version?: string }>>;
  checkGitLabAuth: (instanceUrl?: string) => Promise<IPCResult<{ authenticated: boolean; username?: string }>>;
  startGitLabAuth: (instanceUrl?: string) => Promise<IPCResult<{ deviceCode: string; verificationUrl: string; userCode: string }>>;
  getGitLabToken: (instanceUrl?: string) => Promise<IPCResult<{ token: string }>>;
  getGitLabUser: (instanceUrl?: string) => Promise<IPCResult<{ username: string; name?: string }>>;
  listGitLabUserProjects: (instanceUrl?: string) => Promise<IPCResult<{ projects: Array<{ pathWithNamespace: string; description: string | null; visibility: string }> }>>;

  // Project detection and management
  detectGitLabProject: (projectPath: string) => Promise<IPCResult<{ project: string; instanceUrl: string }>>;
  getGitLabBranches: (project: string, instanceUrl: string) => Promise<IPCResult<string[]>>;
  createGitLabProject: (
    projectName: string,
    options: { description?: string; visibility?: string; projectPath: string; namespace?: string; instanceUrl?: string }
  ) => Promise<IPCResult<{ pathWithNamespace: string; webUrl: string }>>;
  addGitLabRemote: (
    projectPath: string,
    projectFullPath: string,
    instanceUrl?: string
  ) => Promise<IPCResult<{ remoteUrl: string }>>;
  listGitLabGroups: (instanceUrl?: string) => Promise<IPCResult<{ groups: GitLabGroup[] }>>;

  // Event Listeners
  onGitLabInvestigationProgress: (
    callback: (projectId: string, status: GitLabInvestigationStatus) => void
  ) => IpcListenerCleanup;
  onGitLabInvestigationComplete: (
    callback: (projectId: string, result: GitLabInvestigationResult) => void
  ) => IpcListenerCleanup;
  onGitLabInvestigationError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the GitLab Integration API implementation
 */
export const createGitLabAPI = (): GitLabAPI => ({
  // Project operations
  getGitLabProjects: (projectId: string): Promise<IPCResult<GitLabProject[]>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_PROJECTS, projectId),

  checkGitLabConnection: (projectId: string): Promise<IPCResult<GitLabSyncStatus>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_CHECK_CONNECTION, projectId),

  // Issue operations
  getGitLabIssues: (projectId: string, state?: 'opened' | 'closed' | 'all'): Promise<IPCResult<GitLabIssue[]>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_ISSUES, projectId, state),

  getGitLabIssue: (projectId: string, issueIid: number): Promise<IPCResult<GitLabIssue>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_ISSUE, projectId, issueIid),

  getIssueNotes: (projectId: string, issueIid: number): Promise<IPCResult<GitLabNote[]>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_ISSUE_NOTES, projectId, issueIid),

  investigateGitLabIssue: (projectId: string, issueIid: number, selectedNoteIds?: number[]): void =>
    sendIpc(IPC_CHANNELS.GITLAB_INVESTIGATE_ISSUE, projectId, issueIid, selectedNoteIds),

  importGitLabIssues: (projectId: string, issueIids: number[]): Promise<IPCResult<GitLabImportResult>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_IMPORT_ISSUES, projectId, issueIids),

  // Merge Request operations
  getGitLabMergeRequests: (projectId: string, state?: string): Promise<IPCResult<GitLabMergeRequest[]>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_MERGE_REQUESTS, projectId, state),

  getGitLabMergeRequest: (projectId: string, mrIid: number): Promise<IPCResult<GitLabMergeRequest>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_MERGE_REQUEST, projectId, mrIid),

  createGitLabMergeRequest: (
    projectId: string,
    options: {
      title: string;
      description?: string;
      sourceBranch: string;
      targetBranch: string;
      labels?: string[];
      assigneeIds?: number[];
      removeSourceBranch?: boolean;
      squash?: boolean;
    }
  ): Promise<IPCResult<GitLabMergeRequest>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_CREATE_MERGE_REQUEST, projectId, options),

  updateGitLabMergeRequest: (
    projectId: string,
    mrIid: number,
    updates: {
      title?: string;
      description?: string;
      targetBranch?: string;
      labels?: string[];
      assigneeIds?: number[];
    }
  ): Promise<IPCResult<GitLabMergeRequest>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_UPDATE_MERGE_REQUEST, projectId, mrIid, updates),

  // Release operations
  createGitLabRelease: (
    projectId: string,
    tagName: string,
    releaseNotes: string,
    options?: { description?: string; ref?: string; milestones?: string[] }
  ): Promise<IPCResult<{ url: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_CREATE_RELEASE, projectId, tagName, releaseNotes, options),

  // OAuth operations (glab CLI)
  checkGitLabCli: (): Promise<IPCResult<{ installed: boolean; version?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_CHECK_CLI),

  checkGitLabAuth: (instanceUrl?: string): Promise<IPCResult<{ authenticated: boolean; username?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_CHECK_AUTH, instanceUrl),

  startGitLabAuth: (instanceUrl?: string): Promise<IPCResult<{ deviceCode: string; verificationUrl: string; userCode: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_START_AUTH, instanceUrl),

  getGitLabToken: (instanceUrl?: string): Promise<IPCResult<{ token: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_TOKEN, instanceUrl),

  getGitLabUser: (instanceUrl?: string): Promise<IPCResult<{ username: string; name?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_USER, instanceUrl),

  listGitLabUserProjects: (instanceUrl?: string): Promise<IPCResult<{ projects: Array<{ pathWithNamespace: string; description: string | null; visibility: string }> }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_LIST_USER_PROJECTS, instanceUrl),

  // Project detection and management
  detectGitLabProject: (projectPath: string): Promise<IPCResult<{ project: string; instanceUrl: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_DETECT_PROJECT, projectPath),

  getGitLabBranches: (project: string, instanceUrl: string): Promise<IPCResult<string[]>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_GET_BRANCHES, project, instanceUrl),

  createGitLabProject: (
    projectName: string,
    options: { description?: string; visibility?: string; projectPath: string; namespace?: string; instanceUrl?: string }
  ): Promise<IPCResult<{ pathWithNamespace: string; webUrl: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_CREATE_PROJECT, projectName, options),

  addGitLabRemote: (
    projectPath: string,
    projectFullPath: string,
    instanceUrl?: string
  ): Promise<IPCResult<{ remoteUrl: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_ADD_REMOTE, projectPath, projectFullPath, instanceUrl),

  listGitLabGroups: (instanceUrl?: string): Promise<IPCResult<{ groups: GitLabGroup[] }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_LIST_GROUPS, instanceUrl),

  // Event Listeners
  onGitLabInvestigationProgress: (
    callback: (projectId: string, status: GitLabInvestigationStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_INVESTIGATION_PROGRESS, callback),

  onGitLabInvestigationComplete: (
    callback: (projectId: string, result: GitLabInvestigationResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_INVESTIGATION_COMPLETE, callback),

  onGitLabInvestigationError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_INVESTIGATION_ERROR, callback)
});
