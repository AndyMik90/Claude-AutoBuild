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

/**
 * Logs a prefixed debug message for GitLab release operations when debug mode is enabled.
 *
 * If additional `data` is provided it will be logged alongside the message.
 *
 * @param message - The message to log
 * @param data - Optional additional data to include with the log
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab Release] ${message}`, data);
    } else {
      console.debug(`[GitLab Release] ${message}`);
    }
  }
}

/**
 * Registers an IPC handler that creates a release in GitLab.
 *
 * The registered handler listens on IPC_CHANNELS.GITLAB_CREATE_RELEASE and, when invoked,
 * creates a release for the specified project and tag. The handler returns an IPCResult
 * containing the created release URL on success or an error message on failure.
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
 * Registers IPC handlers related to GitLab releases.
 *
 * Sets up all release-related handlers used by the Electron main process.
 */
export function registerReleaseHandlers(): void {
  debugLog('Registering GitLab release handlers');
  registerCreateRelease();
  debugLog('GitLab release handlers registered');
}