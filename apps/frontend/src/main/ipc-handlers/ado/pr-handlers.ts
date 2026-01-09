/**
 * Azure DevOps Pull Request IPC handlers
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { projectStore } from '../../project-store';
import {
  getADOConfig,
  adoFetch,
  normalizePRState,
  extractBranchName,
} from './utils';
import type { ADOAPIPullRequest, ADOPullRequest } from './types';

/**
 * Transform ADO API PR to application format
 */
function transformPR(pr: ADOAPIPullRequest, config: { instanceUrl: string; organization: string; project: string; repoName: string }): ADOPullRequest {
  return {
    id: pr.pullRequestId,
    number: pr.pullRequestId,
    title: pr.title,
    body: pr.description,
    state: normalizePRState(pr.status),
    author: {
      login: pr.createdBy.uniqueName,
      displayName: pr.createdBy.displayName,
      avatarUrl: pr.createdBy.imageUrl,
    },
    sourceBranch: extractBranchName(pr.sourceRefName),
    targetBranch: extractBranchName(pr.targetRefName),
    isDraft: pr.isDraft || false,
    mergeStatus: pr.mergeStatus,
    reviewers: (pr.reviewers || []).map(r => ({
      login: r.uniqueName,
      displayName: r.displayName,
      avatarUrl: r.imageUrl,
      vote: r.vote,
    })),
    labels: (pr.labels || []).map(l => l.name),
    createdAt: pr.creationDate,
    updatedAt: pr.creationDate, // ADO doesn't have a separate updated date
    closedAt: pr.closedDate,
    url: pr.url,
    htmlUrl: pr._links?.web?.href || `${config.instanceUrl}/${config.organization}/${config.project}/_git/${config.repoName}/pullrequest/${pr.pullRequestId}`,
  };
}

/**
 * List pull requests
 */
export function registerListPRs(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_PR_LIST,
    async (_, projectId: string, status: 'active' | 'completed' | 'abandoned' | 'all' = 'active'): Promise<IPCResult<ADOPullRequest[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        const prsResult = await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests?searchCriteria.status=${status}&$top=100`
        ) as { value: ADOAPIPullRequest[] };

        const result: ADOPullRequest[] = prsResult.value.map(pr =>
          transformPR(pr, config)
        );

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch pull requests',
        };
      }
    }
  );
}

/**
 * Get a single PR by ID
 */
export function registerGetPR(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_PR_GET,
    async (_, projectId: string, prId: number): Promise<IPCResult<ADOPullRequest>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        const pr = await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}`
        ) as ADOAPIPullRequest;

        const result = transformPR(pr, config);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch pull request',
        };
      }
    }
  );
}

/**
 * Get PR diff/changes
 */
export function registerGetPRDiff(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_PR_GET_DIFF,
    async (_, projectId: string, prId: number): Promise<IPCResult<string>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        // Get PR iterations (versions)
        const iterationsResult = await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}/iterations`
        ) as { value: Array<{ id: number }> };

        if (!iterationsResult.value || iterationsResult.value.length === 0) {
          return { success: true, data: '' };
        }

        // Get changes from the latest iteration
        const latestIteration = iterationsResult.value[iterationsResult.value.length - 1];
        const changesResult = await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}/iterations/${latestIteration.id}/changes`
        ) as { changeEntries?: Array<{ changeType: string; item?: { path: string } }> };

        // Build a summary of changes
        const diffLines: string[] = [];
        for (const change of changesResult.changeEntries || []) {
          const changeType = change.changeType || 'edit';
          const path = change.item?.path || '';
          diffLines.push(`--- ${changeType}: ${path}`);
        }

        return { success: true, data: diffLines.join('\n') };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch PR diff',
        };
      }
    }
  );
}

/**
 * Post a review comment on a PR
 */
export function registerPostPRReview(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_PR_POST_REVIEW,
    async (
      _,
      projectId: string,
      prId: number,
      comment: string,
      vote?: number // -10 = rejected, 0 = none, 5 = approved with suggestions, 10 = approved
    ): Promise<IPCResult<number>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        // Create a comment thread
        const threadResult = await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}/threads`,
          {
            method: 'POST',
            body: JSON.stringify({
              comments: [{ content: comment }],
              status: 'active',
            }),
          }
        ) as { id: number };

        // If vote is provided, update reviewer vote
        if (vote !== undefined) {
          await adoFetch(
            config,
            `/git/repositories/${config.repoName}/pullrequests/${prId}/reviewers/me`,
            {
              method: 'PUT',
              body: JSON.stringify({ vote }),
            }
          );
        }

        return { success: true, data: threadResult.id };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to post review',
        };
      }
    }
  );
}

/**
 * Merge a PR
 */
export function registerMergePR(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_PR_MERGE,
    async (
      _,
      projectId: string,
      prId: number,
      mergeStrategy: 'squash' | 'rebase' | 'noFastForward' = 'squash',
      deleteSourceBranch: boolean = true
    ): Promise<IPCResult<boolean>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        // Get PR to get the last merge source commit
        const pr = await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}`
        ) as ADOAPIPullRequest & { lastMergeSourceCommit?: { commitId: string } };

        // Complete the PR
        await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'completed',
              lastMergeSourceCommit: pr.lastMergeSourceCommit,
              completionOptions: {
                deleteSourceBranch,
                mergeStrategy,
              },
            }),
          }
        );

        return { success: true, data: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge pull request',
        };
      }
    }
  );
}

/**
 * Abandon (close) a PR
 */
export function registerAbandonPR(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_PR_ABANDON,
    async (_, projectId: string, prId: number): Promise<IPCResult<boolean>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        await adoFetch(
          config,
          `/git/repositories/${config.repoName}/pullrequests/${prId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status: 'abandoned' }),
          }
        );

        return { success: true, data: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to abandon pull request',
        };
      }
    }
  );
}

/**
 * Register all PR handlers
 */
export function registerPRHandlers(): void {
  registerListPRs();
  registerGetPR();
  registerGetPRDiff();
  registerPostPRReview();
  registerMergePR();
  registerAbandonPR();
}
