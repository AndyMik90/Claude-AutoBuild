import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  ForgejoInstance,
  ForgejoRepository,
  ForgejoIssue,
  ForgejoPullRequest,
  ForgejoSyncStatus,
  ForgejoImportResult,
  ForgejoInvestigationStatus,
  ForgejoInvestigationResult,
  ForgejoPRReviewResult,
  ForgejoPRReviewProgress,
  IPCResult
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * Forgejo Integration API operations
 * Supports self-hosted Forgejo/Gitea instances
 */
export interface ForgejoAPI {
  // Instance management
  getForgejoInstances: () => Promise<IPCResult<ForgejoInstance[]>>;
  addForgejoInstance: (name: string, url: string, token: string) => Promise<IPCResult<ForgejoInstance>>;
  removeForgejoInstance: (instanceId: string) => Promise<IPCResult<void>>;
  updateForgejoInstance: (instanceId: string, name: string, url: string, token: string) => Promise<IPCResult<ForgejoInstance>>;
  testForgejoConnection: (instanceId: string) => Promise<IPCResult<ForgejoSyncStatus>>;

  // Repository operations
  getForgejoRepositories: (instanceId: string) => Promise<IPCResult<ForgejoRepository[]>>;
  checkForgejoConnection: (projectId: string) => Promise<IPCResult<ForgejoSyncStatus>>;
  getForgejoSyncStatus: (projectId: string) => Promise<IPCResult<ForgejoSyncStatus>>;

  // Issue operations
  getForgejoIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<ForgejoIssue[]>>;
  getForgejoIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<ForgejoIssue>>;
  getForgejoIssueComments: (projectId: string, issueNumber: number) => Promise<IPCResult<Array<{
    id: number;
    body: string;
    author: { login: string; avatarUrl?: string };
    createdAt: string;
  }>>>;
  createForgejoIssue: (
    projectId: string,
    title: string,
    body: string,
    labels?: string[],
    assignees?: string[]
  ) => Promise<IPCResult<ForgejoIssue>>;
  closeForgejoIssue: (projectId: string, issueNumber: number, comment?: string) => Promise<IPCResult<void>>;
  addForgejoComment: (projectId: string, issueNumber: number, body: string) => Promise<IPCResult<{ id: number }>>;

  // Investigation operations (AI-powered)
  investigateForgejoIssue: (projectId: string, issueNumber: number) => void;
  importForgejoIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<ForgejoImportResult>>;

  // PR operations
  getForgejoPRs: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<ForgejoPullRequest[]>>;
  getForgejoPR: (projectId: string, prNumber: number) => Promise<IPCResult<ForgejoPullRequest>>;
  getForgejoPRDiff: (projectId: string, prNumber: number) => Promise<IPCResult<string>>;
  mergeForgejoPR: (
    projectId: string,
    prNumber: number,
    mergeMethod?: 'merge' | 'squash' | 'rebase',
    commitTitle?: string
  ) => Promise<IPCResult<void>>;
  closeForgejoPR: (projectId: string, prNumber: number, comment?: string) => Promise<IPCResult<void>>;
  postForgejoPRReview: (
    projectId: string,
    prNumber: number,
    body: string,
    event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  ) => Promise<IPCResult<{ id: number }>>;

  // PR Review operations (AI-powered)
  runForgejoPRReview: (projectId: string, prNumber: number) => void;
  cancelForgejoPRReview: (projectId: string, prNumber: number) => Promise<IPCResult<void>>;
  getForgejoPRReview: (projectId: string, prNumber: number) => Promise<IPCResult<ForgejoPRReviewResult | null>>;

  // Event listeners
  onForgejoInvestigationProgress: (
    callback: (projectId: string, status: ForgejoInvestigationStatus) => void
  ) => IpcListenerCleanup;
  onForgejoInvestigationComplete: (
    callback: (projectId: string, result: ForgejoInvestigationResult) => void
  ) => IpcListenerCleanup;
  onForgejoInvestigationError: (
    callback: (projectId: string, data: { issueNumber: number; error: string }) => void
  ) => IpcListenerCleanup;
  onForgejoPRReviewProgress: (
    callback: (projectId: string, progress: ForgejoPRReviewProgress) => void
  ) => IpcListenerCleanup;
  onForgejoPRReviewComplete: (
    callback: (projectId: string, result: ForgejoPRReviewResult) => void
  ) => IpcListenerCleanup;
  onForgejoPRReviewError: (
    callback: (projectId: string, data: { prNumber: number; error: string }) => void
  ) => IpcListenerCleanup;
}

/**
 * Create Forgejo API object
 */
export function createForgejoAPI(): ForgejoAPI {
  return {
    // Instance management
    getForgejoInstances: (): Promise<IPCResult<ForgejoInstance[]>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_GET_INSTANCES),

    addForgejoInstance: (name, url, token): Promise<IPCResult<ForgejoInstance>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_ADD_INSTANCE, name, url, token),

    removeForgejoInstance: (instanceId): Promise<IPCResult<void>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_REMOVE_INSTANCE, instanceId),

    updateForgejoInstance: (instanceId, name, url, token): Promise<IPCResult<ForgejoInstance>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_UPDATE_INSTANCE, instanceId, name, url, token),

    testForgejoConnection: (instanceId): Promise<IPCResult<ForgejoSyncStatus>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_TEST_CONNECTION, instanceId),

    // Repository operations
    getForgejoRepositories: (instanceId): Promise<IPCResult<ForgejoRepository[]>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_GET_REPOSITORIES, instanceId),

    checkForgejoConnection: (projectId): Promise<IPCResult<ForgejoSyncStatus>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_CHECK_CONNECTION, projectId),

    getForgejoSyncStatus: (projectId): Promise<IPCResult<ForgejoSyncStatus>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_GET_SYNC_STATUS, projectId),

    // Issue operations
    getForgejoIssues: (projectId, state = 'open'): Promise<IPCResult<ForgejoIssue[]>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_GET_ISSUES, projectId, state),

    getForgejoIssue: (projectId, issueNumber): Promise<IPCResult<ForgejoIssue>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_GET_ISSUE, projectId, issueNumber),

    getForgejoIssueComments: (projectId, issueNumber): Promise<IPCResult<Array<{
      id: number;
      body: string;
      author: { login: string; avatarUrl?: string };
      createdAt: string;
    }>>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_GET_ISSUE_COMMENTS, projectId, issueNumber),

    createForgejoIssue: (projectId, title, body, labels, assignees): Promise<IPCResult<ForgejoIssue>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_CREATE_ISSUE, projectId, title, body, labels, assignees),

    closeForgejoIssue: (projectId, issueNumber, comment): Promise<IPCResult<void>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_CLOSE_ISSUE, projectId, issueNumber, comment),

    addForgejoComment: (projectId, issueNumber, body): Promise<IPCResult<{ id: number }>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_ADD_COMMENT, projectId, issueNumber, body),

    // Investigation operations
    investigateForgejoIssue: (projectId, issueNumber): void =>
      sendIpc(IPC_CHANNELS.FORGEJO_INVESTIGATE_ISSUE, projectId, issueNumber),

    importForgejoIssues: (projectId, issueNumbers): Promise<IPCResult<ForgejoImportResult>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_IMPORT_ISSUES, projectId, issueNumbers),

    // PR operations
    getForgejoPRs: (projectId, state = 'open'): Promise<IPCResult<ForgejoPullRequest[]>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_LIST, projectId, state),

    getForgejoPR: (projectId, prNumber): Promise<IPCResult<ForgejoPullRequest>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_GET, projectId, prNumber),

    getForgejoPRDiff: (projectId, prNumber): Promise<IPCResult<string>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_GET_DIFF, projectId, prNumber),

    mergeForgejoPR: (projectId, prNumber, mergeMethod = 'merge', commitTitle): Promise<IPCResult<void>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_MERGE, projectId, prNumber, mergeMethod, commitTitle),

    closeForgejoPR: (projectId, prNumber, comment): Promise<IPCResult<void>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_CLOSE, projectId, prNumber, comment),

    postForgejoPRReview: (projectId, prNumber, body, event = 'COMMENT'): Promise<IPCResult<{ id: number }>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_POST_REVIEW, projectId, prNumber, body, event),

    // PR Review operations
    runForgejoPRReview: (projectId, prNumber): void =>
      sendIpc(IPC_CHANNELS.FORGEJO_PR_REVIEW, projectId, prNumber),

    cancelForgejoPRReview: (projectId, prNumber): Promise<IPCResult<void>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_REVIEW_CANCEL, projectId, prNumber),

    getForgejoPRReview: (projectId, prNumber): Promise<IPCResult<ForgejoPRReviewResult | null>> =>
      invokeIpc(IPC_CHANNELS.FORGEJO_PR_GET_REVIEW, projectId, prNumber),

    // Event listeners
    onForgejoInvestigationProgress: (callback) =>
      createIpcListener<[string, ForgejoInvestigationStatus]>(
        IPC_CHANNELS.FORGEJO_INVESTIGATION_PROGRESS,
        (projectId, status) => callback(projectId, status)
      ),

    onForgejoInvestigationComplete: (callback) =>
      createIpcListener<[string, ForgejoInvestigationResult]>(
        IPC_CHANNELS.FORGEJO_INVESTIGATION_COMPLETE,
        (projectId, result) => callback(projectId, result)
      ),

    onForgejoInvestigationError: (callback) =>
      createIpcListener<[string, { issueNumber: number; error: string }]>(
        IPC_CHANNELS.FORGEJO_INVESTIGATION_ERROR,
        (projectId, data) => callback(projectId, data)
      ),

    onForgejoPRReviewProgress: (callback) =>
      createIpcListener<[string, ForgejoPRReviewProgress]>(
        IPC_CHANNELS.FORGEJO_PR_REVIEW_PROGRESS,
        (projectId, progress) => callback(projectId, progress)
      ),

    onForgejoPRReviewComplete: (callback) =>
      createIpcListener<[string, ForgejoPRReviewResult]>(
        IPC_CHANNELS.FORGEJO_PR_REVIEW_COMPLETE,
        (projectId, result) => callback(projectId, result)
      ),

    onForgejoPRReviewError: (callback) =>
      createIpcListener<[string, { prNumber: number; error: string }]>(
        IPC_CHANNELS.FORGEJO_PR_REVIEW_ERROR,
        (projectId, data) => callback(projectId, data)
      ),
  };
}
