/**
 * Forgejo repository handlers
 * Handles repository listing and connection status
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, ForgejoRepository, ForgejoSyncStatus } from '../../../shared/types';
import { projectStore } from '../../project-store';
import {
  getForgejoConfig,
  loadForgejoInstances,
  forgejoFetch,
  forgejoFetchWithCount,
  debugLog,
} from './utils';
import type { ForgejoAPIRepository } from './types';

/**
 * Check Forgejo connection status for a project
 */
export function registerCheckConnection(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_CHECK_CONNECTION,
    async (_event, projectId: string): Promise<IPCResult<ForgejoSyncStatus>> => {
      debugLog('checkForgejoConnection handler called', { projectId });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        debugLog('No Forgejo config found');
        return {
          success: true,
          data: {
            connected: false,
            error: 'Forgejo not configured. Please add FORGEJO_INSTANCE_URL, FORGEJO_TOKEN, and FORGEJO_REPO to your .env file.'
          }
        };
      }

      try {
        // Fetch repository info
        const repoInfo = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}`
        ) as ForgejoAPIRepository;

        debugLog('Repository info retrieved:', { name: repoInfo.name });

        // Get issue count
        const { totalCount: issueCount } = await forgejoFetchWithCount(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues?state=open&limit=1&type=issues`
        );

        return {
          success: true,
          data: {
            connected: true,
            instanceUrl: config.instanceUrl,
            repoFullName: repoInfo.full_name,
            repoDescription: repoInfo.description,
            issueCount,
            lastSyncedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Forgejo';
        debugLog('Connection check failed:', errorMessage);
        return {
          success: true,
          data: {
            connected: false,
            error: errorMessage
          }
        };
      }
    }
  );
}

/**
 * Get list of repositories from a Forgejo instance
 */
export function registerGetRepositories(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_GET_REPOSITORIES,
    async (_event, instanceId: string): Promise<IPCResult<ForgejoRepository[]>> => {
      debugLog('getForgejoRepositories handler called', { instanceId });

      try {
        const instances = loadForgejoInstances();
        const instance = instances.find(i => i.id === instanceId);

        if (!instance) {
          return { success: false, error: 'Instance not found' };
        }

        // Get user's repositories
        const repos = await forgejoFetch(
          instance.token,
          instance.url,
          '/user/repos?limit=100'
        ) as ForgejoAPIRepository[];

        const result: ForgejoRepository[] = repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          webUrl: repo.html_url,
          defaultBranch: repo.default_branch,
          private: repo.private,
          owner: {
            login: repo.owner.login,
            avatarUrl: repo.owner.avatar_url,
          },
          instanceUrl: instance.url,
        }));

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch repositories';
        debugLog('Failed to fetch repositories:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Get sync status for a Forgejo connection
 */
export function registerGetSyncStatus(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_GET_SYNC_STATUS,
    async (_event, projectId: string): Promise<IPCResult<ForgejoSyncStatus>> => {
      debugLog('getForgejoSyncStatus handler called', { projectId });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return {
          success: true,
          data: {
            connected: false,
          }
        };
      }

      try {
        const { totalCount: issueCount } = await forgejoFetchWithCount(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues?state=open&limit=1&type=issues`
        );

        return {
          success: true,
          data: {
            connected: true,
            instanceUrl: config.instanceUrl,
            repoFullName: `${config.owner}/${config.repo}`,
            issueCount,
            lastSyncedAt: new Date().toISOString(),
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get sync status';
        return {
          success: true,
          data: {
            connected: false,
            error: errorMessage,
          }
        };
      }
    }
  );
}

/**
 * Register all repository handlers
 */
export function registerRepositoryHandlers(): void {
  registerCheckConnection();
  registerGetRepositories();
  registerGetSyncStatus();
}
