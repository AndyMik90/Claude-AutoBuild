/**
 * API type definitions for REST endpoints and WebSocket communication
 *
 * These types define the contracts for the HTTP API layer that exposes
 * IPC functionality for remote access (e.g., mobile companion app).
 */

// Import core types from shared types for local use
import type { IPCResult } from '../../../shared/types/common';
import type {
  Project,
  ProjectSettings,
  InitializationResult,
} from '../../../shared/types/project';
import type {
  Task,
  TaskStatus,
  TaskMetadata,
  TaskStartOptions,
  ExecutionProgress,
  ExecutionPhase,
  ImplementationPlan,
  Subtask,
  SubtaskStatus,
  QAReport,
  WorktreeStatus,
  WorktreeDiff,
  WorktreeMergeResult,
} from '../../../shared/types/task';

// Re-export core types for API consumers
export type { IPCResult };
export type { Project, ProjectSettings, InitializationResult };
export type {
  Task,
  TaskStatus,
  TaskMetadata,
  TaskStartOptions,
  ExecutionProgress,
  ExecutionPhase,
  ImplementationPlan,
  Subtask,
  SubtaskStatus,
  QAReport,
  WorktreeStatus,
  WorktreeDiff,
  WorktreeMergeResult,
};

// ============================================
// API Response Types
// ============================================

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

/**
 * Generic API response wrapper for consistent responses
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Task API Types
// ============================================

/**
 * Request body for creating a new task
 * POST /api/tasks
 */
export interface CreateTaskRequest {
  projectId: string;
  title: string;
  description: string;
  metadata?: TaskMetadata;
}

/**
 * Response for task creation
 * Returns the created task
 */
export interface CreateTaskResponse {
  task: Task;
}

/**
 * Query parameters for listing tasks
 * GET /api/tasks
 */
export interface ListTasksQuery {
  projectId: string;
  status?: TaskStatus;
}

/**
 * Response for listing tasks
 */
export interface ListTasksResponse {
  tasks: Task[];
}

/**
 * Response for getting a single task
 * GET /api/tasks/:id
 */
export interface GetTaskResponse {
  task: Task;
}

/**
 * Request body for updating a task
 * PATCH /api/tasks/:id
 */
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
}

/**
 * Request body for starting a task
 * POST /api/tasks/:id/start
 */
export interface StartTaskRequest {
  options?: TaskStartOptions;
}

/**
 * Request body for submitting task review
 * POST /api/tasks/:id/review
 */
export interface SubmitReviewRequest {
  approved: boolean;
  feedback?: string;
}

// ============================================
// Project API Types
// ============================================

/**
 * Request body for adding a project
 * POST /api/projects
 */
export interface AddProjectRequest {
  projectPath: string;
}

/**
 * Response for adding a project
 */
export interface AddProjectResponse {
  project: Project;
}

/**
 * Response for listing projects
 * GET /api/projects
 */
export interface ListProjectsResponse {
  projects: Project[];
}

/**
 * Response for getting a single project
 * GET /api/projects/:id
 */
export interface GetProjectResponse {
  project: Project;
}

/**
 * Request body for updating project settings
 * PATCH /api/projects/:id/settings
 */
export interface UpdateProjectSettingsRequest {
  settings: Partial<ProjectSettings>;
}

// ============================================
// Monitoring API Types
// ============================================

/**
 * Health check response
 * GET /api/health
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

/**
 * API version response
 * GET /api/version
 */
export interface VersionResponse {
  version: string;
  apiVersion: string;
  electronVersion?: string;
}

// ============================================
// WebSocket Types
// ============================================

/**
 * WebSocket message types for real-time events
 */
export type WebSocketMessageType =
  | 'task-progress'
  | 'task-status-change'
  | 'task-log'
  | 'task-error'
  | 'task-execution-progress'
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'pong'
  | 'error';

/**
 * Base WebSocket message structure
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload?: T;
  timestamp: string;
}

/**
 * Task progress WebSocket event payload
 */
export interface TaskProgressPayload {
  taskId: string;
  plan: ImplementationPlan;
}

/**
 * Task status change WebSocket event payload
 */
export interface TaskStatusChangePayload {
  taskId: string;
  status: TaskStatus;
  previousStatus?: TaskStatus;
}

/**
 * Task log WebSocket event payload
 */
export interface TaskLogPayload {
  taskId: string;
  log: string;
  timestamp: string;
}

/**
 * Task error WebSocket event payload
 */
export interface TaskErrorPayload {
  taskId: string;
  error: string;
  timestamp: string;
}

/**
 * Task execution progress WebSocket event payload
 */
export interface TaskExecutionProgressPayload {
  taskId: string;
  progress: ExecutionProgress;
}

/**
 * Subscribe message payload - client requests to subscribe to task events
 */
export interface SubscribePayload {
  taskIds?: string[];
  projectId?: string;
  events?: WebSocketMessageType[];
}

/**
 * Unsubscribe message payload - client requests to unsubscribe from events
 */
export interface UnsubscribePayload {
  taskIds?: string[];
  projectId?: string;
  events?: WebSocketMessageType[];
}

/**
 * WebSocket error payload
 */
export interface WebSocketErrorPayload {
  code: string;
  message: string;
}

// ============================================
// Authentication Types
// ============================================

/**
 * API key validation result (internal use)
 */
export interface ApiKeyValidation {
  valid: boolean;
  keyId?: string;
}

// ============================================
// Route Parameter Types
// ============================================

/**
 * Common route parameters for task endpoints
 */
export interface TaskRouteParams {
  id: string;
}

/**
 * Common route parameters for project endpoints
 */
export interface ProjectRouteParams {
  id: string;
}

// ============================================
// Pagination Types (for future use)
// ============================================

/**
 * Pagination query parameters
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
