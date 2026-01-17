/**
 * Provider Factory
 * ================
 *
 * Factory for creating provider-specific handlers.
 * Maps provider types to their IPC handlers.
 */

import type {
  ProviderType,
  ProviderOAuthHandlers,
  EnvironmentConfig,
  ProviderSpecificConfig,
  ProviderEnvConfig,
  GitHubProviderConfig,
  GitLabProviderConfig,
} from './types';
import i18n from '../../../shared/i18n';

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
          const result = await window.electronAPI.installGitHubCli();
          return {
            command: result.data?.command || 'gh',
          };
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
            throw new Error(i18n.t('common:errors.failedToGetGitHubToken'));
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
            throw new Error(i18n.t('common:errors.failedToGetGitLabToken'));
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
          throw new Error(i18n.t('common:errors.providerNotImplemented', { provider }));
        },
      };

    default:
      throw new Error(i18n.t('common:errors.unknownProvider', { provider }));
  }
}

/**
 * Get provider-specific repository/project fetcher.
 */
export function getProviderRepositoryFetcher(provider: ProviderType) {
  switch (provider) {
    case 'github':
      return async () => {
        const result = await window.electronAPI.getGitHubRepos();
        if (!result.success || !result.data) {
          return [];
        }
        return result.data.map((repo: any) => ({
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
          url: repo.html_url,
        }));
      };

    case 'gitlab':
      return async () => {
        const result = await window.electronAPI.getGitLabProjects();
        if (!result.success || !result.data) {
          return [];
        }
        return result.data.map((project: any) => ({
          name: project.name || project.pathWithNamespace,
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
  envConfig: EnvironmentConfig
): ProviderSpecificConfig {
  switch (provider) {
    case 'github':
      return {
        enabled: envConfig.githubEnabled ?? false,
        token: envConfig.githubToken,
        repo: envConfig.githubRepo,
        defaultBranch: envConfig.defaultBranch,
      } satisfies GitHubProviderConfig;

    case 'gitlab':
      return {
        enabled: envConfig.gitlabEnabled ?? false,
        token: envConfig.gitlabToken,
        project: envConfig.gitlabProject,
        instanceUrl: envConfig.gitlabInstanceUrl || 'https://gitlab.com',
        defaultBranch: envConfig.defaultBranch,
      } satisfies GitLabProviderConfig;

    default:
      return { enabled: false };
  }
}

/**
 * Convert provider config back to environment config format.
 */
export function providerConfigToEnvConfig(
  provider: ProviderType,
  config: ProviderSpecificConfig
): ProviderEnvConfig {
  switch (provider) {
    case 'github': {
      const githubConfig = config as GitHubProviderConfig;
      return {
        githubEnabled: githubConfig.enabled,
        githubToken: githubConfig.token,
        githubRepo: githubConfig.repo,
        defaultBranch: githubConfig.defaultBranch,
      };
    }

    case 'gitlab': {
      const gitlabConfig = config as GitLabProviderConfig;
      return {
        gitlabEnabled: gitlabConfig.enabled,
        gitlabToken: gitlabConfig.token,
        gitlabProject: gitlabConfig.project,
        gitlabInstanceUrl: gitlabConfig.instanceUrl,
        defaultBranch: gitlabConfig.defaultBranch,
      };
    }

    default:
      return {};
  }
}
