/**
 * GitLab module types and interfaces
 */

export interface GitLabConfig {
  token: string;
  instanceUrl: string; // e.g., "https://gitlab.com" or "https://gitlab.mycompany.com"
  project: string; // Can be numeric ID or "group/project" path
}

export interface GitLabAPIProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description?: string;
  web_url: string;
  default_branch: string;
  visibility: 'private' | 'internal' | 'public';
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: 'group' | 'user';
  };
  avatar_url?: string;
}

export interface GitLabAPIIssue {
  id: number;
  iid: number; // Project-scoped ID
  title: string;
  description?: string;
  state: 'opened' | 'closed';
  labels: string[];
  assignees: Array<{ username: string; avatar_url?: string }>;
  author: { username: string; avatar_url?: string };
  milestone?: { id: number; title: string; state: string };
  created_at: string;
  updated_at: string;
  closed_at?: string;
  user_notes_count: number;
  web_url: string;
}

export interface GitLabAPINote {
  id: number;
  body: string;
  author: { username: string; avatar_url?: string };
  created_at: string;
  updated_at: string;
  system: boolean;
}

export interface GitLabAPIMergeRequest {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: 'opened' | 'closed' | 'merged' | 'locked';
  source_branch: string;
  target_branch: string;
  author: { username: string; avatar_url?: string };
  assignees: Array<{ username: string; avatar_url?: string }>;
  labels: string[];
  web_url: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  merge_status: string;
}

export interface GitLabAPIGroup {
  id: number;
  name: string;
  path: string;
  full_path: string;
  description?: string;
  avatar_url?: string;
}

export interface GitLabAPIUser {
  id: number;
  username: string;
  name: string;
  avatar_url?: string;
  web_url: string;
}

export interface GitLabReleaseOptions {
  description?: string;
  ref?: string; // Branch/tag to create release from
  milestones?: string[];
}

export interface GitLabAuthStartResult {
  deviceCode: string;
  verificationUrl: string;
  userCode: string;
}

export interface CreateMergeRequestOptions {
  title: string;
  description?: string;
  sourceBranch: string;
  targetBranch: string;
  labels?: string[];
  assigneeIds?: number[];
  removeSourceBranch?: boolean;
  squash?: boolean;
}
