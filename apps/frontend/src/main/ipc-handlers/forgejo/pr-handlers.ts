/**
 * Forgejo pull request handlers
 * Handles PR listing, review, and management
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, ForgejoPullRequest } from '../../../shared/types';
import { projectStore } from '../../project-store';
import {
  getForgejoConfig,
  forgejoFetch,
  forgejoFetchDiff,
  debugLog,
} from './utils';
import type { ForgejoAPIPullRequest } from './types';

/**
 * Transform API PR to frontend PR type
 */
function transformPR(pr: ForgejoAPIPullRequest): ForgejoPullRequest {
  let state: 'open' | 'closed' | 'merged' = 'open';
  if (pr.merged) {
    state = 'merged';
  } else if (pr.state === 'closed') {
    state = 'closed';
  }

  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state,
    sourceBranch: pr.head.ref,
    targetBranch: pr.base.ref,
    author: {
      login: pr.user.login,
      avatarUrl: pr.user.avatar_url,
    },
    assignees: pr.assignees.map(a => ({
      login: a.login,
      avatarUrl: a.avatar_url,
    })),
    reviewers: pr.requested_reviewers.map(r => ({
      login: r.login,
      avatarUrl: r.avatar_url,
    })),
    labels: pr.labels.map(l => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    webUrl: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
    mergeable: pr.mergeable,
    draft: pr.draft,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
  };
}

/**
 * List pull requests
 */
export function registerListPRs(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_PR_LIST,
    async (
      _event,
      projectId: string,
      state: 'open' | 'closed' | 'all' = 'open'
    ): Promise<IPCResult<ForgejoPullRequest[]>> => {
      debugLog('listForgejoPRs handler called', { projectId, state });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const prs = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/pulls?state=${state}&limit=100`
        ) as ForgejoAPIPullRequest[];

        const result = prs.map(pr => transformPR(pr));

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch PRs';
        debugLog('Failed to fetch PRs:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Get a single PR by number
 */
export function registerGetPR(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_PR_GET,
    async (
      _event,
      projectId: string,
      prNumber: number
    ): Promise<IPCResult<ForgejoPullRequest>> => {
      debugLog('getForgejoPR handler called', { projectId, prNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const pr = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/pulls/${prNumber}`
        ) as ForgejoAPIPullRequest;

        const result = transformPR(pr);

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch PR';
        debugLog('Failed to fetch PR:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Get PR diff
 */
export function registerGetPRDiff(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_PR_GET_DIFF,
    async (
      _event,
      projectId: string,
      prNumber: number
    ): Promise<IPCResult<string>> => {
      debugLog('getForgejoPRDiff handler called', { projectId, prNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const diff = await forgejoFetchDiff(
          config.token,
          config.instanceUrl,
          config.owner,
          config.repo,
          prNumber
        );

        return { success: true, data: diff };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch PR diff';
        debugLog('Failed to fetch PR diff:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Merge a PR
 */
export function registerMergePR(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_PR_MERGE,
    async (
      _event,
      projectId: string,
      prNumber: number,
      mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
      commitTitle?: string
    ): Promise<IPCResult<void>> => {
      debugLog('mergeForgejoPR handler called', { projectId, prNumber, mergeMethod });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        // Map merge method to Forgejo format
        const doMethodMap = {
          'merge': 'merge',
          'squash': 'squash',
          'rebase': 'rebase-merge',
        };

        const mergeData: Record<string, unknown> = {
          Do: doMethodMap[mergeMethod],
        };

        if (commitTitle) {
          mergeData.MergeTitleField = commitTitle;
        }

        await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/pulls/${prNumber}/merge`,
          {
            method: 'POST',
            body: JSON.stringify(mergeData),
          }
        );

        return { success: true, data: undefined };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to merge PR';
        debugLog('Failed to merge PR:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Close a PR without merging
 */
export function registerClosePR(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_PR_CLOSE,
    async (
      _event,
      projectId: string,
      prNumber: number,
      comment?: string
    ): Promise<IPCResult<void>> => {
      debugLog('closeForgejoPR handler called', { projectId, prNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        // Add comment if provided
        if (comment) {
          await forgejoFetch(
            config.token,
            config.instanceUrl,
            `/repos/${config.owner}/${config.repo}/issues/${prNumber}/comments`,
            {
              method: 'POST',
              body: JSON.stringify({ body: comment }),
            }
          );
        }

        // Close the PR
        await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/pulls/${prNumber}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ state: 'closed' }),
          }
        );

        return { success: true, data: undefined };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to close PR';
        debugLog('Failed to close PR:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Post a review on a PR
 */
export function registerPostReview(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_PR_POST_REVIEW,
    async (
      _event,
      projectId: string,
      prNumber: number,
      body: string,
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT'
    ): Promise<IPCResult<{ id: number }>> => {
      debugLog('postForgejoPRReview handler called', { projectId, prNumber, event });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const review = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/pulls/${prNumber}/reviews`,
          {
            method: 'POST',
            body: JSON.stringify({ body, event }),
          }
        ) as { id: number };

        return { success: true, data: { id: review.id } };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to post review';
        debugLog('Failed to post review:', errorMessage);
        return { success: false, error: errorMessage };
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
  registerMergePR();
  registerClosePR();
  registerPostReview();
}
