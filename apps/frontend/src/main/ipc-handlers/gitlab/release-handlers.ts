/**
 * GitLab release handlers
 * Handles creating releases
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabReleaseOptions } from './types';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

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
 * Create a GitLab release
 */
export function registerCreateRelease(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CREATE_RELEASE,
    async (
      _event,
      projectId: string,
      tagName: string,
      releaseNotes: string,
      options?: GitLabReleaseOptions
    ): Promise<IPCResult<{ url: string }>> => {
      debugLog('createGitLabRelease handler called', { tagName });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = await getGitLabConfig(project);
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
          ref: options?.ref || project.settings.mainBranch || 'main'
        };

        if (options?.milestones && Array.isArray(options.milestones)) {
          releaseBody.milestones = options.milestones.filter(
            (m): m is string => typeof m === 'string' && m.length > 0
          );
        }

        const release = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/releases`,
          {
            method: 'POST',
            body: JSON.stringify(releaseBody)
          }
        ) as unknown;

        // Safely extract URL from response
        const releaseUrl = (
          release &&
          typeof release === 'object' &&
          '_links' in release &&
          release._links &&
          typeof release._links === 'object' &&
          'self' in release._links &&
          typeof release._links.self === 'string'
        ) ? release._links.self : null;

        if (!releaseUrl) {
          return {
            success: false,
            error: 'Unexpected response format from GitLab API'
          };
        }

        debugLog('Release created:', { tagName, url: releaseUrl });

        return {
          success: true,
          data: { url: releaseUrl }
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
