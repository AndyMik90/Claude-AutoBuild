/**
 * Forgejo handler types
 */

export interface ForgejoConfig {
  instanceUrl: string;
  token: string;
  owner: string;
  repo: string;
}

export interface ForgejoInstanceConfig {
  id: string;
  name: string;
  url: string;
  token: string;
  connected: boolean;
  lastSyncedAt?: string;
}

export interface ForgejoAPIRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url?: string;
  };
}

export interface ForgejoAPIIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description?: string;
  }>;
  assignees: Array<{
    login: string;
    avatar_url?: string;
  }>;
  user: {
    login: string;
    avatar_url?: string;
  };
  milestone?: {
    id: number;
    title: string;
    state: string;
  };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  comments: number;
  html_url: string;
}

export interface ForgejoAPIPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  merged: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
    avatar_url?: string;
  };
  assignees: Array<{
    login: string;
    avatar_url?: string;
  }>;
  requested_reviewers: Array<{
    login: string;
    avatar_url?: string;
  }>;
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  mergeable: boolean;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface ForgejoAPIComment {
  id: number;
  body: string;
  user: {
    login: string;
    avatar_url?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface ForgejoAPIUser {
  id: number;
  login: string;
  full_name: string;
  email: string;
  avatar_url: string;
}
