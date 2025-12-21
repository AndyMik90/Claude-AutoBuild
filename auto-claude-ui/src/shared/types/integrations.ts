/**
 * External integrations (Linear, Plane, GitHub)
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
// Plane.so Integration Types
// ============================================

/**
 * Plane work item (issue/task)
 */
/**
 * Plane state object (returned when using expand=state)
 */
export interface PlaneStateDetail {
  id: string;
  name: string;
  group: string;  // backlog, unstarted, started, completed, cancelled
  color: string;
}

export interface PlaneWorkItem {
  id: string;
  sequence_id: number;  // e.g., 123 in PROJ-123
  name: string;
  description_html?: string;
  description_stripped?: string;
  // State can be UUID string or expanded object depending on API call
  state: string | PlaneStateDetail;
  priority: 'none' | 'urgent' | 'high' | 'medium' | 'low';
  labels: string[];  // Label UUIDs
  assignees: string[];  // User UUIDs
  project: string;  // Project UUID
  workspace: string;  // Workspace UUID
  created_at: string;
  updated_at: string;
  target_date?: string;
  // Expanded fields (when using expand parameter)
  state_detail?: PlaneStateDetail;
  project_detail?: {
    id: string;
    name: string;
    identifier: string;  // e.g., "PROJ"
  };
  label_details?: Array<{ id: string; name: string; color: string }>;
  assignee_details?: Array<{ id: string; display_name: string; email: string }>;
}

/**
 * Plane project
 */
export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;  // e.g., "PROJ" for PROJ-123
  description?: string;
  workspace: string;
}

/**
 * Plane workflow state
 */
export interface PlaneState {
  id: string;
  name: string;
  group: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
  color: string;
  sequence: number;
}

/**
 * Result of importing work items from Plane
 */
export interface PlaneImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

/**
 * Plane connection/sync status
 */
export interface PlaneSyncStatus {
  connected: boolean;
  workspaceSlug?: string;
  projectCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

/**
 * Project with Plane configuration (for copy settings feature)
 */
export interface PlaneConfiguredProject {
  id: string;
  name: string;
  planeApiKey: string;
  planeBaseUrl?: string;
  planeWorkspaceSlug?: string;
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
