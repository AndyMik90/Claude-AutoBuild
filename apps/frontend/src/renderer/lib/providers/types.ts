/**
 * Provider Types
 * ==============
 *
 * Type definitions for git provider abstraction.
 * Enables unified interface for GitHub, GitLab, Bitbucket, etc.
 */

export type ProviderType = 'github' | 'gitlab' | 'bitbucket' | 'gitea' | 'azure-devops';

export interface ProviderConfig {
  type: ProviderType;
  enabled: boolean;

  // Common fields
  token?: string;
  instanceUrl?: string;
  defaultBranch?: string;

  // GitHub-specific
  githubRepo?: string;

  // GitLab-specific
  gitlabProject?: string;

  // Bitbucket-specific (future)
  bitbucketWorkspace?: string;
  bitbucketRepo?: string;
}

export interface ProviderAuthState {
  mode: 'manual' | 'oauth' | 'oauth-success';
  username: string | null;
  cliInstalled: boolean;
  cliVersion: string | null;
}

export interface ProviderRepository {
  name: string;
  fullName: string;
  description: string | null;
  visibility: string;
  url?: string;
}

export interface ProviderOAuthHandlers {
  checkCli: () => Promise<{ installed: boolean; version?: string }>;
  installCli: () => Promise<{ command: string }>;
  startAuth: (instanceUrl?: string) => Promise<{ success: boolean }>;
  checkAuth: (instanceUrl?: string) => Promise<{ authenticated: boolean; username?: string }>;
  getToken: (instanceUrl?: string) => Promise<{ token: string }>;
}

export interface ProviderMetadata {
  name: string;
  displayName: string;
  icon: string;
  cliName: string;
  terminology: {
    pr: string;        // Pull Request or Merge Request
    prAbbrev: string;  // PR or MR
    repo: string;      // Repository or Project
  };
  oauth: {
    supported: boolean;
    cliCommand: string;
  };
  instanceUrl: {
    default: string;
    supportsCustom: boolean;
  };
}

export const PROVIDER_METADATA: Record<ProviderType, ProviderMetadata> = {
  github: {
    name: 'github',
    displayName: 'GitHub',
    icon: '🐙',
    cliName: 'gh',
    terminology: {
      pr: 'Pull Request',
      prAbbrev: 'PR',
      repo: 'Repository',
    },
    oauth: {
      supported: true,
      cliCommand: 'gh auth login',
    },
    instanceUrl: {
      default: 'https://github.com',
      supportsCustom: true, // GitHub Enterprise
    },
  },
  gitlab: {
    name: 'gitlab',
    displayName: 'GitLab',
    icon: '🦊',
    cliName: 'glab',
    terminology: {
      pr: 'Merge Request',
      prAbbrev: 'MR',
      repo: 'Project',
    },
    oauth: {
      supported: true,
      cliCommand: 'glab auth login --web',
    },
    instanceUrl: {
      default: 'https://gitlab.com',
      supportsCustom: true, // Self-hosted GitLab
    },
  },
  bitbucket: {
    name: 'bitbucket',
    displayName: 'Bitbucket',
    icon: '🪣',
    cliName: 'bb', // Hypothetical
    terminology: {
      pr: 'Pull Request',
      prAbbrev: 'PR',
      repo: 'Repository',
    },
    oauth: {
      supported: false,
      cliCommand: '',
    },
    instanceUrl: {
      default: 'https://bitbucket.org',
      supportsCustom: true,
    },
  },
  gitea: {
    name: 'gitea',
    displayName: 'Gitea',
    icon: '🍵',
    cliName: 'tea',
    terminology: {
      pr: 'Pull Request',
      prAbbrev: 'PR',
      repo: 'Repository',
    },
    oauth: {
      supported: false,
      cliCommand: '',
    },
    instanceUrl: {
      default: 'https://gitea.com',
      supportsCustom: true,
    },
  },
  'azure-devops': {
    name: 'azure-devops',
    displayName: 'Azure DevOps',
    icon: '☁️',
    cliName: 'az',
    terminology: {
      pr: 'Pull Request',
      prAbbrev: 'PR',
      repo: 'Repository',
    },
    oauth: {
      supported: false,
      cliCommand: '',
    },
    instanceUrl: {
      default: 'https://dev.azure.com',
      supportsCustom: true,
    },
  },
};
