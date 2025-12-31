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
  GitLabMRReviewResult,
  GitLabMRReviewProgress,
  GitLabNewCommitsCheck,
  GitLabAutoFixConfig,
  GitLabAutoFixQueueItem,
  GitLabAutoFixProgress,
  GitLabIssueBatch,
  GitLabAnalyzePreviewResult,
  GitLabTriageConfig,
  GitLabTriageResult,
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
  getGitLabIssueNotes: (projectId: string, issueIid: number) => Promise<IPCResult<GitLabNote[]>>;
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

  // MR Review operations (AI-powered)
  getGitLabMRDiff: (projectId: string, mrIid: number) => Promise<string | null>;
  getGitLabMRReview: (projectId: string, mrIid: number) => Promise<GitLabMRReviewResult | null>;
  runGitLabMRReview: (projectId: string, mrIid: number) => void;
  runGitLabMRFollowupReview: (projectId: string, mrIid: number) => void;
  postGitLabMRReview: (projectId: string, mrIid: number, selectedFindingIds?: string[]) => Promise<boolean>;
  postGitLabMRNote: (projectId: string, mrIid: number, body: string) => Promise<boolean>;
  mergeGitLabMR: (projectId: string, mrIid: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  assignGitLabMR: (projectId: string, mrIid: number, userIds: number[]) => Promise<boolean>;
  approveGitLabMR: (projectId: string, mrIid: number) => Promise<boolean>;
  cancelGitLabMRReview: (projectId: string, mrIid: number) => Promise<boolean>;
  checkGitLabMRNewCommits: (projectId: string, mrIid: number) => Promise<GitLabNewCommitsCheck>;

  // MR Review Event Listeners
  onGitLabMRReviewProgress: (
    callback: (projectId: string, progress: GitLabMRReviewProgress) => void
  ) => IpcListenerCleanup;
  onGitLabMRReviewComplete: (
    callback: (projectId: string, result: GitLabMRReviewResult) => void
  ) => IpcListenerCleanup;
  onGitLabMRReviewError: (
    callback: (projectId: string, data: { mrIid: number; error: string }) => void
  ) => IpcListenerCleanup;

  // GitLab Auto-Fix operations
  getGitLabAutoFixConfig: (projectId: string) => Promise<GitLabAutoFixConfig | null>;
  saveGitLabAutoFixConfig: (projectId: string, config: GitLabAutoFixConfig) => Promise<boolean>;
  getGitLabAutoFixQueue: (projectId: string) => Promise<GitLabAutoFixQueueItem[]>;
  checkGitLabAutoFixLabels: (projectId: string) => Promise<number[]>;
  checkNewGitLabAutoFixIssues: (projectId: string) => Promise<Array<{ iid: number }>>;
  startGitLabAutoFix: (projectId: string, issueIid: number) => void;
  getGitLabAutoFixBatches: (projectId: string) => Promise<GitLabIssueBatch[]>;
  analyzeGitLabAutoFixPreview: (projectId: string, issueIids?: number[], maxIssues?: number) => void;
  approveGitLabAutoFixBatches: (projectId: string, batches: GitLabIssueBatch[]) => Promise<{ success: boolean; batches?: GitLabIssueBatch[]; error?: string }>;

  // GitLab Auto-Fix Event Listeners
  onGitLabAutoFixProgress: (
    callback: (projectId: string, progress: GitLabAutoFixProgress) => void
  ) => IpcListenerCleanup;
  onGitLabAutoFixComplete: (
    callback: (projectId: string, result: GitLabAutoFixQueueItem) => void
  ) => IpcListenerCleanup;
  onGitLabAutoFixError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
  onGitLabAutoFixAnalyzePreviewProgress: (
    callback: (projectId: string, progress: { phase: string; progress: number; message: string }) => void
  ) => IpcListenerCleanup;
  onGitLabAutoFixAnalyzePreviewComplete: (
    callback: (projectId: string, result: GitLabAnalyzePreviewResult) => void
  ) => IpcListenerCleanup;
  onGitLabAutoFixAnalyzePreviewError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;

  // GitLab Triage operations
  getGitLabTriageConfig: (projectId: string) => Promise<GitLabTriageConfig | null>;
  saveGitLabTriageConfig: (projectId: string, config: GitLabTriageConfig) => Promise<boolean>;
  getGitLabTriageResults: (projectId: string) => Promise<GitLabTriageResult[]>;
  runGitLabTriage: (projectId: string, issueIids?: number[]) => void;
  applyGitLabTriageLabels: (projectId: string, issueIid: number, labelsToAdd: string[], labelsToRemove: string[]) => Promise<boolean>;

  // GitLab Triage Event Listeners
  onGitLabTriageProgress: (
    callback: (projectId: string, progress: { phase: string; progress: number; message: string; issueIid?: number }) => void
  ) => IpcListenerCleanup;
  onGitLabTriageComplete: (
    callback: (projectId: string, results: GitLabTriageResult[]) => void
  ) => IpcListenerCleanup;
  onGitLabTriageError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;

  // Release operations
  createGitLabRelease: (
    projectId: string,
    tagName: string,
    releaseNotes: string,
    options?: { description?: string; ref?: string; milestones?: string[] }
  ) => Promise<IPCResult<{ url: string }>>;

  // OAuth operations (glab CLI)
  checkGitLabCli: () => Promise<IPCResult<{ installed: boolean; version?: string }>>;
  installGitLabCli: () => Promise<IPCResult<{ command: string }>>;
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

  getGitLabIssueNotes: (projectId: string, issueIid: number): Promise<IPCResult<GitLabNote[]>> =>
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

  // MR Review operations (AI-powered)
  getGitLabMRDiff: (projectId: string, mrIid: number): Promise<string | null> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_GET_DIFF, projectId, mrIid),

  getGitLabMRReview: (projectId: string, mrIid: number): Promise<GitLabMRReviewResult | null> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_GET_REVIEW, projectId, mrIid),

  runGitLabMRReview: (projectId: string, mrIid: number): void =>
    sendIpc(IPC_CHANNELS.GITLAB_MR_REVIEW, projectId, mrIid),

  runGitLabMRFollowupReview: (projectId: string, mrIid: number): void =>
    sendIpc(IPC_CHANNELS.GITLAB_MR_FOLLOWUP_REVIEW, projectId, mrIid),

  postGitLabMRReview: (projectId: string, mrIid: number, selectedFindingIds?: string[]): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_POST_REVIEW, projectId, mrIid, selectedFindingIds),

  postGitLabMRNote: (projectId: string, mrIid: number, body: string): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_POST_NOTE, projectId, mrIid, body),

  mergeGitLabMR: (projectId: string, mrIid: number, mergeMethod?: 'merge' | 'squash' | 'rebase'): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_MERGE, projectId, mrIid, mergeMethod),

  assignGitLabMR: (projectId: string, mrIid: number, userIds: number[]): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_ASSIGN, projectId, mrIid, userIds),

  approveGitLabMR: (projectId: string, mrIid: number): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_APPROVE, projectId, mrIid),

  cancelGitLabMRReview: (projectId: string, mrIid: number): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_REVIEW_CANCEL, projectId, mrIid),

  checkGitLabMRNewCommits: (projectId: string, mrIid: number): Promise<GitLabNewCommitsCheck> =>
    invokeIpc(IPC_CHANNELS.GITLAB_MR_CHECK_NEW_COMMITS, projectId, mrIid),

  // MR Review Event Listeners
  onGitLabMRReviewProgress: (
    callback: (projectId: string, progress: GitLabMRReviewProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_MR_REVIEW_PROGRESS, callback),

  onGitLabMRReviewComplete: (
    callback: (projectId: string, result: GitLabMRReviewResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_MR_REVIEW_COMPLETE, callback),

  onGitLabMRReviewError: (
    callback: (projectId: string, data: { mrIid: number; error: string }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_MR_REVIEW_ERROR, callback),

  // GitLab Auto-Fix operations
  getGitLabAutoFixConfig: (projectId: string): Promise<GitLabAutoFixConfig | null> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_GET_CONFIG, projectId),

  saveGitLabAutoFixConfig: (projectId: string, config: GitLabAutoFixConfig): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_SAVE_CONFIG, projectId, config),

  getGitLabAutoFixQueue: (projectId: string): Promise<GitLabAutoFixQueueItem[]> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_GET_QUEUE, projectId),

  checkGitLabAutoFixLabels: (projectId: string): Promise<number[]> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_CHECK_LABELS, projectId),

  checkNewGitLabAutoFixIssues: (projectId: string): Promise<Array<{ iid: number }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_CHECK_NEW, projectId),

  startGitLabAutoFix: (projectId: string, issueIid: number): void =>
    sendIpc(IPC_CHANNELS.GITLAB_AUTOFIX_START, projectId, issueIid),

  getGitLabAutoFixBatches: (projectId: string): Promise<GitLabIssueBatch[]> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_GET_BATCHES, projectId),

  analyzeGitLabAutoFixPreview: (projectId: string, issueIids?: number[], maxIssues?: number): void =>
    sendIpc(IPC_CHANNELS.GITLAB_AUTOFIX_ANALYZE_PREVIEW, projectId, issueIids, maxIssues),

  approveGitLabAutoFixBatches: (projectId: string, batches: GitLabIssueBatch[]): Promise<{ success: boolean; batches?: GitLabIssueBatch[]; error?: string }> =>
    invokeIpc(IPC_CHANNELS.GITLAB_AUTOFIX_APPROVE_BATCHES, projectId, batches),

  // GitLab Auto-Fix Event Listeners
  onGitLabAutoFixProgress: (
    callback: (projectId: string, progress: GitLabAutoFixProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_AUTOFIX_PROGRESS, callback),

  onGitLabAutoFixComplete: (
    callback: (projectId: string, result: GitLabAutoFixQueueItem) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_AUTOFIX_COMPLETE, callback),

  onGitLabAutoFixError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_AUTOFIX_ERROR, callback),

  onGitLabAutoFixAnalyzePreviewProgress: (
    callback: (projectId: string, progress: { phase: string; progress: number; message: string }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_AUTOFIX_ANALYZE_PREVIEW_PROGRESS, callback),

  onGitLabAutoFixAnalyzePreviewComplete: (
    callback: (projectId: string, result: GitLabAnalyzePreviewResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_AUTOFIX_ANALYZE_PREVIEW_COMPLETE, callback),

  onGitLabAutoFixAnalyzePreviewError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_AUTOFIX_ANALYZE_PREVIEW_ERROR, callback),

  // GitLab Triage operations
  getGitLabTriageConfig: (projectId: string): Promise<GitLabTriageConfig | null> =>
    invokeIpc(IPC_CHANNELS.GITLAB_TRIAGE_GET_CONFIG, projectId),

  saveGitLabTriageConfig: (projectId: string, config: GitLabTriageConfig): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_TRIAGE_SAVE_CONFIG, projectId, config),

  getGitLabTriageResults: (projectId: string): Promise<GitLabTriageResult[]> =>
    invokeIpc(IPC_CHANNELS.GITLAB_TRIAGE_GET_RESULTS, projectId),

  runGitLabTriage: (projectId: string, issueIids?: number[]): void =>
    sendIpc(IPC_CHANNELS.GITLAB_TRIAGE_RUN, projectId, issueIids),

  applyGitLabTriageLabels: (projectId: string, issueIid: number, labelsToAdd: string[], labelsToRemove: string[]): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITLAB_TRIAGE_APPLY_LABELS, projectId, issueIid, labelsToAdd, labelsToRemove),

  // GitLab Triage Event Listeners
  onGitLabTriageProgress: (
    callback: (projectId: string, progress: { phase: string; progress: number; message: string; issueIid?: number }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_TRIAGE_PROGRESS, callback),

  onGitLabTriageComplete: (
    callback: (projectId: string, results: GitLabTriageResult[]) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_TRIAGE_COMPLETE, callback),

  onGitLabTriageError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITLAB_TRIAGE_ERROR, callback),

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

  installGitLabCli: (): Promise<IPCResult<{ command: string }>> =>
    invokeIpc(IPC_CHANNELS.GITLAB_INSTALL_CLI),

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
