/**
 * Types for remote repository setup
 */

export type RemoteService = 'github' | 'gitlab';
export type RemoteServiceOption = RemoteService | null;
export type RemoteAction = 'create' | 'link';

export type GitHubVisibility = 'private' | 'public';
export type GitLabVisibility = 'private' | 'internal' | 'public';

/**
 * Configuration for a remote repository setup
 */
export interface RemoteConfig {
  service: RemoteService | null;
  enabled: boolean;
  // GitHub-specific
  githubOwner?: string;
  githubVisibility?: GitHubVisibility;
  githubAction?: RemoteAction;
  githubExistingRepo?: string;
  // GitLab-specific
  gitlabInstanceUrl?: string;
  gitlabNamespace?: string;
  gitlabVisibility?: GitLabVisibility;
  gitlabAction?: RemoteAction;
  gitlabExistingProject?: string;
}

/**
 * Owner/namespace selection data
 */
export interface Owner {
  id: string | number;
  name: string;
  path: string;
  avatarUrl?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  token: string;
  username: string;
}
