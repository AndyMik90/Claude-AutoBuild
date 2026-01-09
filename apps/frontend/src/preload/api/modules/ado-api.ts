import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { invokeIpc, createIpcListener, IpcListenerCleanup } from './ipc-utils';

/**
 * Azure DevOps Work Item (normalized format)
 */
export interface ADOWorkItem {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  workItemType: string;
  tags: string[];
  assignees: Array<{
    login: string;
    displayName: string;
    avatarUrl?: string;
  }>;
  author: {
    login: string;
    displayName: string;
    avatarUrl?: string;
  };
  priority?: number;
  iteration?: string;
  areaPath?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  htmlUrl: string;
}

/**
 * Azure DevOps Pull Request (normalized format)
 */
export interface ADOPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  author: {
    login: string;
    displayName: string;
    avatarUrl?: string;
  };
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  mergeStatus?: string;
  reviewers: Array<{
    login: string;
    displayName: string;
    avatarUrl?: string;
    vote: number;
  }>;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  url: string;
  htmlUrl: string;
}

/**
 * Azure DevOps Comment
 */
export interface ADOComment {
  id: number;
  content: string;
  author: {
    displayName: string;
    uniqueName: string;
    imageUrl?: string;
  };
  publishedDate: string;
  lastUpdatedDate: string;
}

// Work Item Operations

export async function checkADOConnection(projectId: string): Promise<IPCResult<boolean>> {
  return invokeIpc(IPC_CHANNELS.ADO_CHECK_CONNECTION, projectId);
}

export async function testADOConnection(credentials: {
  organization: string;
  project: string;
  repoName: string;
  pat: string;
  instanceUrl: string;
}): Promise<IPCResult<boolean>> {
  return invokeIpc(IPC_CHANNELS.ADO_TEST_CONNECTION, credentials);
}

export async function getADOWorkItems(
  projectId: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<IPCResult<ADOWorkItem[]>> {
  return invokeIpc(IPC_CHANNELS.ADO_GET_WORK_ITEMS, projectId, state);
}

export async function getADOWorkItem(
  projectId: string,
  workItemId: number
): Promise<IPCResult<ADOWorkItem>> {
  return invokeIpc(IPC_CHANNELS.ADO_GET_WORK_ITEM, projectId, workItemId);
}

export async function createADOWorkItem(
  projectId: string,
  workItemType: string,
  title: string,
  body?: string,
  tags?: string[]
): Promise<IPCResult<ADOWorkItem>> {
  return invokeIpc(IPC_CHANNELS.ADO_CREATE_WORK_ITEM, projectId, workItemType, title, body, tags);
}

export async function updateADOWorkItem(
  projectId: string,
  workItemId: number,
  updates: { title?: string; body?: string; state?: string; tags?: string[] }
): Promise<IPCResult<ADOWorkItem>> {
  return invokeIpc(IPC_CHANNELS.ADO_UPDATE_WORK_ITEM, projectId, workItemId, updates);
}

export async function getADOWorkItemComments(
  projectId: string,
  workItemId: number
): Promise<IPCResult<ADOComment[]>> {
  return invokeIpc(IPC_CHANNELS.ADO_GET_WORK_ITEM_COMMENTS, projectId, workItemId);
}

// Pull Request Operations

export async function getADOPullRequests(
  projectId: string,
  status: 'active' | 'completed' | 'abandoned' | 'all' = 'active'
): Promise<IPCResult<ADOPullRequest[]>> {
  return invokeIpc(IPC_CHANNELS.ADO_PR_LIST, projectId, status);
}

export async function getADOPullRequest(
  projectId: string,
  prId: number
): Promise<IPCResult<ADOPullRequest>> {
  return invokeIpc(IPC_CHANNELS.ADO_PR_GET, projectId, prId);
}

export async function getADOPullRequestDiff(
  projectId: string,
  prId: number
): Promise<IPCResult<string>> {
  return invokeIpc(IPC_CHANNELS.ADO_PR_GET_DIFF, projectId, prId);
}

export async function postADOPRReview(
  projectId: string,
  prId: number,
  comment: string,
  vote?: number
): Promise<IPCResult<number>> {
  return invokeIpc(IPC_CHANNELS.ADO_PR_POST_REVIEW, projectId, prId, comment, vote);
}

export async function mergeADOPullRequest(
  projectId: string,
  prId: number,
  mergeStrategy?: 'squash' | 'rebase' | 'noFastForward',
  deleteSourceBranch?: boolean
): Promise<IPCResult<boolean>> {
  return invokeIpc(IPC_CHANNELS.ADO_PR_MERGE, projectId, prId, mergeStrategy, deleteSourceBranch);
}

export async function abandonADOPullRequest(
  projectId: string,
  prId: number
): Promise<IPCResult<boolean>> {
  return invokeIpc(IPC_CHANNELS.ADO_PR_ABANDON, projectId, prId);
}

// Event Listeners

export function onADOInvestigationProgress(
  callback: (progress: { phase: string; progress: number; message: string }) => void
): IpcListenerCleanup {
  return createIpcListener(IPC_CHANNELS.ADO_INVESTIGATION_PROGRESS, callback);
}

export function onADOInvestigationComplete(
  callback: (result: unknown) => void
): IpcListenerCleanup {
  return createIpcListener(IPC_CHANNELS.ADO_INVESTIGATION_COMPLETE, callback);
}

export function onADOInvestigationError(
  callback: (error: string) => void
): IpcListenerCleanup {
  return createIpcListener(IPC_CHANNELS.ADO_INVESTIGATION_ERROR, callback);
}

export function onADOPRReviewProgress(
  callback: (progress: { phase: string; progress: number; message: string }) => void
): IpcListenerCleanup {
  return createIpcListener(IPC_CHANNELS.ADO_PR_REVIEW_PROGRESS, callback);
}

export function onADOPRReviewComplete(
  callback: (result: unknown) => void
): IpcListenerCleanup {
  return createIpcListener(IPC_CHANNELS.ADO_PR_REVIEW_COMPLETE, callback);
}

export function onADOPRReviewError(
  callback: (error: string) => void
): IpcListenerCleanup {
  return createIpcListener(IPC_CHANNELS.ADO_PR_REVIEW_ERROR, callback);
}

// API Interface and Factory

export interface ADOAPI {
  checkADOConnection: (projectId: string) => Promise<IPCResult<boolean>>;
  testADOConnection: (credentials: { organization: string; project: string; repoName: string; pat: string; instanceUrl: string }) => Promise<IPCResult<boolean>>;
  getADOWorkItems: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<ADOWorkItem[]>>;
  getADOWorkItem: (projectId: string, workItemId: number) => Promise<IPCResult<ADOWorkItem>>;
  createADOWorkItem: (projectId: string, workItemType: string, title: string, body?: string, tags?: string[]) => Promise<IPCResult<ADOWorkItem>>;
  updateADOWorkItem: (projectId: string, workItemId: number, updates: { title?: string; body?: string; state?: string; tags?: string[] }) => Promise<IPCResult<ADOWorkItem>>;
  getADOWorkItemComments: (projectId: string, workItemId: number) => Promise<IPCResult<ADOComment[]>>;
  getADOPullRequests: (projectId: string, status?: 'active' | 'completed' | 'abandoned' | 'all') => Promise<IPCResult<ADOPullRequest[]>>;
  getADOPullRequest: (projectId: string, prId: number) => Promise<IPCResult<ADOPullRequest>>;
  getADOPullRequestDiff: (projectId: string, prId: number) => Promise<IPCResult<string>>;
  postADOPRReview: (projectId: string, prId: number, comment: string, vote?: number) => Promise<IPCResult<number>>;
  mergeADOPullRequest: (projectId: string, prId: number, mergeStrategy?: 'squash' | 'rebase' | 'noFastForward', deleteSourceBranch?: boolean) => Promise<IPCResult<boolean>>;
  abandonADOPullRequest: (projectId: string, prId: number) => Promise<IPCResult<boolean>>;
  onADOInvestigationProgress: (callback: (progress: { phase: string; progress: number; message: string }) => void) => IpcListenerCleanup;
  onADOInvestigationComplete: (callback: (result: unknown) => void) => IpcListenerCleanup;
  onADOInvestigationError: (callback: (error: string) => void) => IpcListenerCleanup;
  onADOPRReviewProgress: (callback: (progress: { phase: string; progress: number; message: string }) => void) => IpcListenerCleanup;
  onADOPRReviewComplete: (callback: (result: unknown) => void) => IpcListenerCleanup;
  onADOPRReviewError: (callback: (error: string) => void) => IpcListenerCleanup;
}

export const createADOAPI = (): ADOAPI => ({
  checkADOConnection,
  testADOConnection,
  getADOWorkItems,
  getADOWorkItem,
  createADOWorkItem,
  updateADOWorkItem,
  getADOWorkItemComments,
  getADOPullRequests,
  getADOPullRequest,
  getADOPullRequestDiff,
  postADOPRReview,
  mergeADOPullRequest,
  abandonADOPullRequest,
  onADOInvestigationProgress,
  onADOInvestigationComplete,
  onADOInvestigationError,
  onADOPRReviewProgress,
  onADOPRReviewComplete,
  onADOPRReviewError,
});
