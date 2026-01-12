/**
 * Provider Factory
 * ================
 *
 * Factory for creating provider-specific handlers.
 * Maps provider types to their IPC handlers.
 */

import type { ProviderType, ProviderOAuthHandlers } from './types';

/**
 * Get OAuth handlers for a specific provider.
 *
 * This function returns provider-specific IPC handlers that interact
 * with the backend (gh CLI for GitHub, glab CLI for GitLab, etc.)
 */
export function getProviderOAuthHandlers(
  provider: ProviderType
): ProviderOAuthHandlers {
  switch (provider) {
    case 'github':
      return {
        checkCli: async () => {
          const result = await window.electronAPI.checkGitHubCli();
          return {
            installed: result.success && result.data?.installed === true,
            version: result.data?.version,
          };
        },
        installCli: async () => {
          // TODO: Implement installGitHubCli handler
          return { command: 'gh' };
        },
        startAuth: async () => {
          return await window.electronAPI.startGitHubAuth();
        },
        checkAuth: async () => {
          const result = await window.electronAPI.checkGitHubAuth();
          return {
            authenticated: result.success && result.data?.authenticated === true,
            username: result.data?.username,
          };
        },
        getToken: async () => {
          const result = await window.electronAPI.getGitHubToken();
          if (!result.success || !result.data?.token) {
            throw new Error('Failed to get GitHub token');
          }
          return { token: result.data.token };
        },
      };

    case 'gitlab':
      return {
        checkCli: async () => {
          const result = await window.electronAPI.checkGitLabCli();
          return {
            installed: result.success && result.data?.installed === true,
            version: result.data?.version,
          };
        },
        installCli: async () => {
          const result = await window.electronAPI.installGitLabCli();
          return {
            command: result.data?.command || 'glab',
          };
        },
        startAuth: async (instanceUrl?: string) => {
          return await window.electronAPI.startGitLabAuth(instanceUrl);
        },
        checkAuth: async (instanceUrl?: string) => {
          const result = await window.electronAPI.checkGitLabAuth(instanceUrl);
          return {
            authenticated: result.success && result.data?.authenticated === true,
            username: result.data?.username,
          };
        },
        getToken: async (instanceUrl?: string) => {
          const result = await window.electronAPI.getGitLabToken(instanceUrl);
          if (!result.success || !result.data?.token) {
            throw new Error('Failed to get GitLab token');
          }
          return { token: result.data.token };
        },
      };

    case 'bitbucket':
    case 'gitea':
    case 'azure-devops':
      // Not yet implemented
      return {
        checkCli: async () => ({ installed: false }),
        installCli: async () => ({ command: '' }),
        startAuth: async () => ({ success: false }),
        checkAuth: async () => ({ authenticated: false, username: undefined }),
        getToken: async () => {
          throw new Error(`${provider} not yet implemented`);
        },
      };

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get provider-specific repository/project fetcher.
 */
export function getProviderRepositoryFetcher(provider: ProviderType) {
  switch (provider) {
    case 'github':
      return async () => {
        // TODO: Implement GitHub repository listing
        // Check if window.electronAPI.listUserRepos exists
        return [];
      };

    case 'gitlab':
      return async () => {
        const result = await window.electronAPI.listGitLabUserProjects(undefined);
        if (!result.success || !result.data?.projects) {
          return [];
        }
        return result.data.projects.map((project: any) => ({
          name: project.pathWithNamespace,
          fullName: project.pathWithNamespace,
          description: project.description,
          visibility: project.visibility,
        }));
      };

    default:
      return async () => [];
  }
}

/**
 * Convert environment config to provider config.
 */
export function envConfigToProviderConfig(
  provider: ProviderType,
  envConfig: any
): any {
  switch (provider) {
    case 'github':
      return {
        enabled: envConfig.githubEnabled ?? false,
        token: envConfig.githubToken,
        repo: envConfig.githubRepo,
        defaultBranch: envConfig.defaultBranch,
      };

    case 'gitlab':
      return {
        enabled: envConfig.gitlabEnabled ?? false,
        token: envConfig.gitlabToken,
        project: envConfig.gitlabProject,
        instanceUrl: envConfig.gitlabInstanceUrl || 'https://gitlab.com',
        defaultBranch: envConfig.defaultBranch,
      };

    default:
      return { enabled: false };
  }
}

/**
 * Convert provider config back to environment config format.
 */
export function providerConfigToEnvConfig(
  provider: ProviderType,
  config: any
): any {
  switch (provider) {
    case 'github':
      return {
        githubEnabled: config.enabled,
        githubToken: config.token,
        githubRepo: config.repo,
        defaultBranch: config.defaultBranch,
      };

    case 'gitlab':
      return {
        gitlabEnabled: config.enabled,
        gitlabToken: config.token,
        gitlabProject: config.project,
        gitlabInstanceUrl: config.instanceUrl,
        defaultBranch: config.defaultBranch,
      };

    default:
      return {};
  }
}
