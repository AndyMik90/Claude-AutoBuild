/**
 * GitLab release handlers
 * Handles creating releases
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, Project } from '../../../shared/types';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabReleaseOptions } from './types';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[GitLab Release] ${message}`, data);
    } else {
      console.warn(`[GitLab Release] ${message}`);
    }
  }
}

/**
 * Create a GitLab release
 */
export function registerCreateRelease(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CREATE_RELEASE,
    async (
      _event,
      project: Project,
      tagName: string,
      releaseNotes: string,
      options?: GitLabReleaseOptions
    ): Promise<IPCResult<{ url: string }>> => {
      debugLog('createGitLabRelease handler called', { tagName });

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);

        // Create the release
        const releaseBody: Record<string, unknown> = {
          tag_name: tagName,
          description: options?.description || releaseNotes,
          ref: options?.ref || 'main'
        };

        if (options?.milestones) {
          releaseBody.milestones = options.milestones;
        }

        const release = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/releases`,
          {
            method: 'POST',
            body: JSON.stringify(releaseBody)
          }
        ) as { _links: { self: string } };

        debugLog('Release created:', { tagName, url: release._links.self });

        return {
          success: true,
          data: { url: release._links.self }
        };
      } catch (error) {
        debugLog('Failed to create release:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create release'
        };
      }
    }
  );
}

/**
 * Register all release handlers
 */
export function registerReleaseHandlers(): void {
  debugLog('Registering GitLab release handlers');
  registerCreateRelease();
  debugLog('GitLab release handlers registered');
}
