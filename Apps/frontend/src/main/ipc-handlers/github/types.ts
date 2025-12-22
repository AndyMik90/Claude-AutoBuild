/**
 * GitHub module types and interfaces
 */

export interface GitHubConfig {
  token: string;
  repo: string;
}

export interface GitHubAPIIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: Array<{ id: number; name: string; color: string; description?: string }>;
  assignees: Array<{ login: string; avatar_url?: string }>;
  user: { login: string; avatar_url?: string };
  milestone?: { id: number; title: string; state: 'open' | 'closed' };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  comments: number;
  url: string;
  html_url: string;
  pull_request?: unknown;
}

export interface GitHubAPIRepository {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  owner: { login: string; avatar_url?: string };
}

export interface GitHubAPIComment {
  id: number;
  body: string;
  user: { login: string; avatar_url?: string };
  created_at: string;
  updated_at: string;
}

export interface ReleaseOptions {
  draft?: boolean;
  prerelease?: boolean;
}
