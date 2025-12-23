/**
 * External integrations (Linear, GitHub)
 */

// ============================================
// Linear Integration Types
// ============================================

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "ABC-123"
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    type: string; // 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'
  };
  priority: number; // 0-4, where 1 is urgent
  priorityLabel: string;
  labels: Array<{ id: string; name: string; color: string }>;
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearProject {
  id: string;
  name: string;
  state: string;
}

export interface LinearImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

export interface LinearSyncStatus {
  connected: boolean;
  teamName?: string;
  projectName?: string;
  issueCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

// ============================================
// GitHub Integration Types
// ============================================

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string; // owner/repo
  description?: string;
  url: string;
  defaultBranch: string;
  private: boolean;
  owner: {
    login: string;
    avatarUrl?: string;
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: Array<{ id: number; name: string; color: string; description?: string }>;
  assignees: Array<{ login: string; avatarUrl?: string }>;
  author: {
    login: string;
    avatarUrl?: string;
  };
  milestone?: {
    id: number;
    title: string;
    state: 'open' | 'closed';
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  commentsCount: number;
  url: string;
  htmlUrl: string;
  repoFullName: string;
}

export interface GitHubSyncStatus {
  connected: boolean;
  repoFullName?: string;
  repoDescription?: string;
  issueCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

export interface GitHubImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
  tasks?: import('./task').Task[];
}

export interface GitHubInvestigationResult {
  success: boolean;
  issueNumber: number;
  analysis: {
    summary: string;
    proposedSolution: string;
    affectedFiles: string[];
    estimatedComplexity: 'simple' | 'standard' | 'complex';
    acceptanceCriteria: string[];
  };
  taskId?: string;
  error?: string;
}

export interface GitHubInvestigationStatus {
  phase: 'idle' | 'fetching' | 'analyzing' | 'creating_task' | 'complete' | 'error';
  issueNumber?: number;
  progress: number;
  message: string;
  error?: string;
}

// ============================================
// GitLab Integration Types
// ============================================

export interface GitLabProject {
  id: number;
  name: string;
  pathWithNamespace: string; // group/project format
  description?: string;
  webUrl: string;
  defaultBranch: string;
  visibility: 'private' | 'internal' | 'public';
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: 'group' | 'user';
  };
  avatarUrl?: string;
}

export interface GitLabIssue {
  id: number;
  iid: number; // Project-scoped ID (GitLab uses iid for display)
  title: string;
  description?: string;
  state: 'opened' | 'closed';
  labels: string[]; // GitLab uses string array, not objects
  assignees: Array<{ username: string; avatarUrl?: string }>;
  author: {
    username: string;
    avatarUrl?: string;
  };
  milestone?: {
    id: number;
    title: string;
    state: 'active' | 'closed';
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  userNotesCount: number; // GitLab's comment count field
  webUrl: string;
  projectPathWithNamespace: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description?: string;
  state: 'opened' | 'closed' | 'merged' | 'locked';
  sourceBranch: string;
  targetBranch: string;
  author: {
    username: string;
    avatarUrl?: string;
  };
  assignees: Array<{ username: string; avatarUrl?: string }>;
  labels: string[];
  webUrl: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  mergeStatus: string;
}

export interface GitLabNote {
  id: number;
  body: string;
  author: {
    username: string;
    avatarUrl?: string;
  };
  createdAt: string;
  updatedAt: string;
  system: boolean; // System-generated notes (status changes, etc.)
}

export interface GitLabGroup {
  id: number;
  name: string;
  path: string;
  fullPath: string;
  description?: string;
  avatarUrl?: string;
}

export interface GitLabSyncStatus {
  connected: boolean;
  instanceUrl?: string; // GitLab-specific: base URL of instance
  projectPathWithNamespace?: string;
  projectDescription?: string;
  issueCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

export interface GitLabImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
  tasks?: import('./task').Task[];
}

export interface GitLabInvestigationResult {
  success: boolean;
  issueIid: number; // GitLab uses iid
  analysis: {
    summary: string;
    proposedSolution: string;
    affectedFiles: string[];
    estimatedComplexity: 'simple' | 'standard' | 'complex';
    acceptanceCriteria: string[];
  };
  taskId?: string;
  error?: string;
}

export interface GitLabInvestigationStatus {
  phase: 'idle' | 'fetching' | 'analyzing' | 'creating_task' | 'complete' | 'error';
  issueIid?: number;
  progress: number;
  message: string;
  error?: string;
}

// ============================================
// Roadmap Integration Types (Canny, etc.)
// ============================================

/**
 * Represents a feedback item from an external roadmap service
 */
export interface RoadmapFeedbackItem {
  externalId: string;
  title: string;
  description: string;
  votes: number;
  status: string;  // Provider-specific status
  url: string;
  createdAt: Date;
  updatedAt?: Date;
  author?: string;
  tags?: string[];
}

/**
 * Connection status for a roadmap provider
 */
export interface RoadmapProviderConnection {
  id: string;
  name: string;
  connected: boolean;
  lastSync?: Date;
  error?: string;
}

/**
 * Configuration for a roadmap provider integration
 */
export interface RoadmapProviderConfig {
  enabled: boolean;
  apiKey?: string;
  boardId?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * Canny-specific status values
 */
export type CannyStatus = 'open' | 'under review' | 'planned' | 'in progress' | 'complete' | 'closed';
