/**
 * AutoClaude Remote API Module
 *
 * This is the main entry point for the HTTP API layer that exposes
 * AutoClaude functionality for remote access (e.g., mobile companion app).
 *
 * Usage:
 * ```typescript
 * import {
 *   createApiServer,
 *   startApiServer,
 *   stopApiServer,
 *   registerRoutes,
 *   initializeEventBridge,
 * } from './api';
 *
 * // Create and configure server
 * const fastify = await createApiServer({ port: 3001 });
 *
 * // Register all routes
 * await registerRoutes(fastify);
 *
 * // Start listening
 * await startApiServer(fastify);
 *
 * // Initialize event bridge for real-time updates
 * initializeEventBridge(agentManager, fileWatcher);
 * ```
 */

// ============================================
// Server Lifecycle
// ============================================

export {
  createApiServer,
  startApiServer,
  stopApiServer,
  createAndStartApiServer,
  isServerRunning,
  getServerUptime,
  getServerStartTime,
  getServerInstance,
} from './server';

export type { ApiServerConfig } from './server';

// ============================================
// Route Registration
// ============================================

export {
  registerRoutes,
  registerTaskRoutes,
  registerProjectRoutes,
  registerMonitoringRoutes,
  registerWebSocketRoute,
} from './routes';

// ============================================
// Authentication
// ============================================

export {
  loadApiKeys,
  validateApiKey,
  authenticateApiKey,
  authenticateWebSocket,
  extractApiKey,
  areKeysLoaded,
  getKeyCount,
  // Testing utilities
  resetAuthState,
  setApiKeysForTesting,
} from './middleware/auth';

export type { AuthConfig } from './middleware/auth';

// ============================================
// WebSocket
// ============================================

export {
  // Client management
  getClient,
  getAllClients,
  getClientCount,
  // Broadcast functions
  broadcastTaskProgress,
  broadcastTaskStatusChange,
  broadcastTaskLog,
  broadcastTaskError,
  broadcastTaskExecutionProgress,
  broadcastToProject,
  // Lifecycle
  closeAllConnections,
  isWebSocketReady,
} from './websocket';

// ============================================
// Event Bridge
// ============================================

export {
  initializeEventBridge,
  shutdownEventBridge,
  isEventBridgeActive,
  getEventBridgeStats,
  setEventBridgeDebug,
} from './event-bridge';

export type { EventBridgeOptions } from './event-bridge';

// ============================================
// Startup (for Electron integration)
// ============================================

export {
  initializeApiServer,
  shutdownApiServer,
  getApiServerStatus,
  isApiServerEnabled,
  isApiServerRunning,
  areApiKeysLoaded,
  getApiServerInstance,
} from './startup';

export type {
  ApiStartupOptions,
  ApiStartupResult,
  ApiShutdownResult,
  ApiServerStatus,
} from './startup';

// ============================================
// Types (re-exported from types module)
// ============================================

export type {
  // Core types (from shared)
  IPCResult,
  Project,
  ProjectSettings,
  InitializationResult,
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
  // API response types
  ApiErrorResponse,
  ApiResponse,
  // Task API types
  CreateTaskRequest,
  CreateTaskResponse,
  ListTasksQuery,
  ListTasksResponse,
  GetTaskResponse,
  UpdateTaskRequest,
  StartTaskRequest,
  SubmitReviewRequest,
  // Project API types
  AddProjectRequest,
  AddProjectResponse,
  ListProjectsResponse,
  GetProjectResponse,
  UpdateProjectSettingsRequest,
  // Monitoring API types
  HealthCheckResponse,
  VersionResponse,
  // WebSocket types
  WebSocketMessageType,
  WebSocketMessage,
  TaskProgressPayload,
  TaskStatusChangePayload,
  TaskLogPayload,
  TaskErrorPayload,
  TaskExecutionProgressPayload,
  SubscribePayload,
  UnsubscribePayload,
  WebSocketErrorPayload,
  // Auth types
  ApiKeyValidation,
  // Route parameter types
  TaskRouteParams,
  ProjectRouteParams,
  // Pagination types
  PaginationQuery,
  PaginatedResponse,
} from './types';

// ============================================
// Schemas (for custom route definitions and validation)
// ============================================

export {
  // Schema type
  type RouteSchema,
  // Enum values
  taskStatusEnum,
  subtaskStatusEnum,
  executionPhaseEnum,
  taskCategoryEnum,
  taskComplexityEnum,
  taskImpactEnum,
  taskPriorityEnum,
  webSocketMessageTypeEnum,
  // Base component schemas
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  subtaskSchema,
  qaIssueSchema,
  qaReportSchema,
  executionProgressSchema,
  taskMetadataSchema,
  taskSchema,
  notificationSettingsSchema,
  projectSettingsSchema,
  projectSchema,
  planPhaseSchema,
  implementationPlanSchema,
  // Task API request/response schemas
  createTaskRequestSchema,
  createTaskResponseSchema,
  listTasksQuerySchema,
  listTasksResponseSchema,
  getTaskResponseSchema,
  updateTaskRequestSchema,
  startTaskRequestSchema,
  submitReviewRequestSchema,
  taskParamsSchema,
  // Project API request/response schemas
  addProjectRequestSchema,
  addProjectResponseSchema,
  listProjectsResponseSchema,
  getProjectResponseSchema,
  updateProjectSettingsRequestSchema,
  projectParamsSchema,
  // Monitoring API schemas
  healthCheckResponseSchema,
  versionResponseSchema,
  // WebSocket schemas
  webSocketMessageSchema,
  taskProgressPayloadSchema,
  taskStatusChangePayloadSchema,
  taskLogPayloadSchema,
  taskErrorPayloadSchema,
  taskExecutionProgressPayloadSchema,
  subscribePayloadSchema,
  unsubscribePayloadSchema,
  webSocketErrorPayloadSchema,
  // Pagination schemas
  paginationQuerySchema,
  paginatedResponseSchema,
  // Complete route schemas (with OpenAPI metadata)
  createTaskSchema,
  listTasksSchema,
  getTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  startTaskSchema,
  stopTaskSchema,
  submitReviewSchema,
  addProjectSchema,
  listProjectsSchema,
  getProjectSchema,
  deleteProjectSchema,
  updateProjectSettingsSchema,
  healthSchema,
  versionSchema,
  // Security scheme for OpenAPI
  apiKeySecurityScheme,
} from './schemas';
