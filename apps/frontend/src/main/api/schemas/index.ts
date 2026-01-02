/**
 * JSON Schemas for API validation and OpenAPI generation
 *
 * These schemas are used by Fastify for:
 * 1. Request/response validation (runtime type checking)
 * 2. OpenAPI/Swagger specification generation
 *
 * Schemas match the TypeScript interfaces in ../types/index.ts
 */

import type { FastifySchema } from 'fastify';

/**
 * Extended Fastify schema type that includes OpenAPI/Swagger properties
 * These properties are used by @fastify/swagger for documentation generation
 */
export interface RouteSchema extends FastifySchema {
  /** OpenAPI tags for grouping endpoints */
  tags?: string[];
  /** Short summary of the endpoint */
  summary?: string;
  /** Detailed description of the endpoint */
  description?: string;
  /** Security requirements for the endpoint */
  security?: Array<Record<string, string[]>>;
  /** Whether the endpoint is deprecated */
  deprecated?: boolean;
  /** External documentation */
  externalDocs?: { url: string; description?: string };
}

// ============================================
// Reusable Schema Components
// ============================================

/**
 * Task status enum values
 */
export const taskStatusEnum = ['backlog', 'in_progress', 'ai_review', 'human_review', 'done'] as const;

/**
 * Subtask status enum values
 */
export const subtaskStatusEnum = ['pending', 'in_progress', 'completed', 'failed'] as const;

/**
 * Execution phase enum values
 */
export const executionPhaseEnum = ['idle', 'planning', 'coding', 'qa_review', 'qa_fixing', 'complete', 'failed'] as const;

/**
 * Task category enum values
 */
export const taskCategoryEnum = [
  'feature',
  'bug_fix',
  'refactoring',
  'documentation',
  'security',
  'performance',
  'ui_ux',
  'infrastructure',
  'testing'
] as const;

/**
 * Task complexity enum values
 */
export const taskComplexityEnum = ['trivial', 'small', 'medium', 'large', 'complex'] as const;

/**
 * Task impact enum values
 */
export const taskImpactEnum = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Task priority enum values
 */
export const taskPriorityEnum = ['low', 'medium', 'high', 'urgent'] as const;

/**
 * WebSocket message type enum values
 */
export const webSocketMessageTypeEnum = [
  'task-progress',
  'task-status-change',
  'task-log',
  'task-error',
  'task-execution-progress',
  'subscribe',
  'unsubscribe',
  'ping',
  'pong',
  'error'
] as const;

// ============================================
// Base Schema Components
// ============================================

/**
 * Standard error response schema
 */
export const apiErrorResponseSchema = {
  type: 'object',
  required: ['error', 'message', 'statusCode'],
  properties: {
    error: { type: 'string', description: 'Error type/name' },
    message: { type: 'string', description: 'Human-readable error message' },
    statusCode: { type: 'integer', description: 'HTTP status code' }
  }
} as const;

/**
 * Generic success response wrapper schema
 */
export const apiSuccessResponseSchema = {
  type: 'object',
  required: ['success'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data: { type: 'object', additionalProperties: true },
    error: { type: 'string' }
  }
} as const;

/**
 * Subtask schema
 */
export const subtaskSchema = {
  type: 'object',
  required: ['id', 'title', 'description', 'status', 'files'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string', enum: subtaskStatusEnum },
    files: { type: 'array', items: { type: 'string' } },
    verification: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['command', 'browser'] },
        run: { type: 'string' },
        scenario: { type: 'string' }
      }
    }
  }
} as const;

/**
 * QA Issue schema
 */
export const qaIssueSchema = {
  type: 'object',
  required: ['id', 'severity', 'description'],
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
    description: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'integer' }
  }
} as const;

/**
 * QA Report schema
 */
export const qaReportSchema = {
  type: 'object',
  required: ['status', 'issues', 'timestamp'],
  properties: {
    status: { type: 'string', enum: ['passed', 'failed', 'pending'] },
    issues: { type: 'array', items: qaIssueSchema },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Execution progress schema
 */
export const executionProgressSchema = {
  type: 'object',
  required: ['phase', 'phaseProgress', 'overallProgress'],
  properties: {
    phase: { type: 'string', enum: executionPhaseEnum },
    phaseProgress: { type: 'number', minimum: 0, maximum: 100 },
    overallProgress: { type: 'number', minimum: 0, maximum: 100 },
    currentSubtask: { type: 'string' },
    message: { type: 'string' },
    startedAt: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Task metadata schema
 */
export const taskMetadataSchema = {
  type: 'object',
  properties: {
    sourceType: { type: 'string', enum: ['ideation', 'manual', 'imported', 'insights', 'roadmap', 'linear', 'github'] },
    ideationType: { type: 'string' },
    ideaId: { type: 'string' },
    featureId: { type: 'string' },
    linearIssueId: { type: 'string' },
    linearIdentifier: { type: 'string' },
    linearUrl: { type: 'string' },
    githubIssueNumber: { type: 'integer' },
    githubIssueNumbers: { type: 'array', items: { type: 'integer' } },
    githubUrl: { type: 'string' },
    githubBatchTheme: { type: 'string' },
    category: { type: 'string', enum: taskCategoryEnum },
    complexity: { type: 'string', enum: taskComplexityEnum },
    impact: { type: 'string', enum: taskImpactEnum },
    priority: { type: 'string', enum: taskPriorityEnum },
    rationale: { type: 'string' },
    problemSolved: { type: 'string' },
    targetAudience: { type: 'string' },
    affectedFiles: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    estimatedEffort: { type: 'string', enum: taskComplexityEnum },
    securitySeverity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    performanceCategory: { type: 'string' },
    uiuxCategory: { type: 'string' },
    codeQualitySeverity: { type: 'string', enum: ['suggestion', 'minor', 'major', 'critical'] },
    requireReviewBeforeCoding: { type: 'boolean' },
    model: { type: 'string', enum: ['haiku', 'sonnet', 'opus'] },
    thinkingLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'ultrathink'] },
    isAutoProfile: { type: 'boolean' },
    baseBranch: { type: 'string' },
    archivedAt: { type: 'string', format: 'date-time' },
    archivedInVersion: { type: 'string' }
  }
} as const;

/**
 * Task schema - full task object
 */
export const taskSchema = {
  type: 'object',
  required: ['id', 'specId', 'projectId', 'title', 'description', 'status', 'subtasks', 'logs', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', description: 'Unique task identifier' },
    specId: { type: 'string', description: 'Specification identifier' },
    projectId: { type: 'string', description: 'Project identifier' },
    title: { type: 'string', description: 'Task title' },
    description: { type: 'string', description: 'Task description' },
    status: { type: 'string', enum: taskStatusEnum, description: 'Current task status' },
    reviewReason: { type: 'string', enum: ['completed', 'errors', 'qa_rejected', 'plan_review'] },
    subtasks: { type: 'array', items: subtaskSchema },
    qaReport: qaReportSchema,
    logs: { type: 'array', items: { type: 'string' } },
    metadata: taskMetadataSchema,
    executionProgress: executionProgressSchema,
    releasedInVersion: { type: 'string' },
    stagedInMainProject: { type: 'boolean' },
    stagedAt: { type: 'string', format: 'date-time' },
    location: { type: 'string', enum: ['main', 'worktree'] },
    specsPath: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Notification settings schema
 */
export const notificationSettingsSchema = {
  type: 'object',
  required: ['onTaskComplete', 'onTaskFailed', 'onReviewNeeded', 'sound'],
  properties: {
    onTaskComplete: { type: 'boolean' },
    onTaskFailed: { type: 'boolean' },
    onReviewNeeded: { type: 'boolean' },
    sound: { type: 'boolean' }
  }
} as const;

/**
 * Project settings schema
 */
export const projectSettingsSchema = {
  type: 'object',
  required: ['model', 'memoryBackend', 'linearSync', 'notifications', 'graphitiMcpEnabled'],
  properties: {
    model: { type: 'string' },
    memoryBackend: { type: 'string', enum: ['graphiti', 'file'] },
    linearSync: { type: 'boolean' },
    linearTeamId: { type: 'string' },
    notifications: notificationSettingsSchema,
    graphitiMcpEnabled: { type: 'boolean' },
    graphitiMcpUrl: { type: 'string' },
    mainBranch: { type: 'string' }
  }
} as const;

/**
 * Project schema - full project object
 */
export const projectSchema = {
  type: 'object',
  required: ['id', 'name', 'path', 'autoBuildPath', 'settings', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', description: 'Unique project identifier' },
    name: { type: 'string', description: 'Project name' },
    path: { type: 'string', description: 'Project filesystem path' },
    autoBuildPath: { type: 'string', description: 'Path to .auto-claude directory' },
    settings: projectSettingsSchema,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Implementation plan phase schema
 */
export const planPhaseSchema = {
  type: 'object',
  required: ['phase', 'name', 'type', 'subtasks'],
  properties: {
    phase: { type: 'integer' },
    name: { type: 'string' },
    type: { type: 'string' },
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'status'],
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: subtaskStatusEnum },
          verification: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              run: { type: 'string' },
              scenario: { type: 'string' }
            }
          }
        }
      }
    },
    depends_on: { type: 'array', items: { type: 'integer' } }
  }
} as const;

/**
 * Implementation plan schema
 */
export const implementationPlanSchema = {
  type: 'object',
  required: ['workflow_type', 'phases', 'final_acceptance', 'created_at', 'updated_at', 'spec_file'],
  properties: {
    feature: { type: 'string' },
    title: { type: 'string' },
    workflow_type: { type: 'string' },
    services_involved: { type: 'array', items: { type: 'string' } },
    phases: { type: 'array', items: planPhaseSchema },
    final_acceptance: { type: 'array', items: { type: 'string' } },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    spec_file: { type: 'string' },
    status: { type: 'string', enum: taskStatusEnum },
    planStatus: { type: 'string' },
    recoveryNote: { type: 'string' },
    description: { type: 'string' }
  }
} as const;

// ============================================
// Task API Schemas
// ============================================

/**
 * Create task request body schema
 * POST /api/tasks
 */
export const createTaskRequestSchema = {
  type: 'object',
  required: ['projectId', 'title', 'description'],
  properties: {
    projectId: { type: 'string', description: 'ID of the project to create the task in' },
    title: { type: 'string', minLength: 1, maxLength: 500, description: 'Task title' },
    description: { type: 'string', minLength: 1, description: 'Task description' },
    metadata: taskMetadataSchema
  }
} as const;

/**
 * Create task response schema
 */
export const createTaskResponseSchema = {
  type: 'object',
  required: ['task'],
  properties: {
    task: taskSchema
  }
} as const;

/**
 * List tasks query parameters schema
 * GET /api/tasks
 */
export const listTasksQuerySchema = {
  type: 'object',
  required: ['projectId'],
  properties: {
    projectId: { type: 'string', description: 'Filter tasks by project ID' },
    status: { type: 'string', enum: taskStatusEnum, description: 'Filter by task status' }
  }
} as const;

/**
 * List tasks response schema
 */
export const listTasksResponseSchema = {
  type: 'object',
  required: ['tasks'],
  properties: {
    tasks: { type: 'array', items: taskSchema }
  }
} as const;

/**
 * Get task response schema
 * GET /api/tasks/:id
 */
export const getTaskResponseSchema = {
  type: 'object',
  required: ['task'],
  properties: {
    task: taskSchema
  }
} as const;

/**
 * Update task request body schema
 * PATCH /api/tasks/:id
 */
export const updateTaskRequestSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 500 },
    description: { type: 'string', minLength: 1 }
  }
} as const;

/**
 * Start task request body schema
 * POST /api/tasks/:id/start
 */
export const startTaskRequestSchema = {
  type: 'object',
  properties: {
    options: {
      type: 'object',
      properties: {
        parallel: { type: 'boolean' },
        workers: { type: 'integer', minimum: 1, maximum: 10 },
        model: { type: 'string' },
        baseBranch: { type: 'string' }
      }
    }
  }
} as const;

/**
 * Submit review request body schema
 * POST /api/tasks/:id/review
 */
export const submitReviewRequestSchema = {
  type: 'object',
  required: ['approved'],
  properties: {
    approved: { type: 'boolean', description: 'Whether the review is approved' },
    feedback: { type: 'string', description: 'Optional feedback for the review' }
  }
} as const;

/**
 * Task route parameters schema
 */
export const taskParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'Task ID' }
  }
} as const;

// ============================================
// Project API Schemas
// ============================================

/**
 * Add project request body schema
 * POST /api/projects
 */
export const addProjectRequestSchema = {
  type: 'object',
  required: ['projectPath'],
  properties: {
    projectPath: { type: 'string', minLength: 1, description: 'Filesystem path to the project' }
  }
} as const;

/**
 * Add project response schema
 */
export const addProjectResponseSchema = {
  type: 'object',
  required: ['project'],
  properties: {
    project: projectSchema
  }
} as const;

/**
 * List projects response schema
 * GET /api/projects
 */
export const listProjectsResponseSchema = {
  type: 'object',
  required: ['projects'],
  properties: {
    projects: { type: 'array', items: projectSchema }
  }
} as const;

/**
 * Get project response schema
 * GET /api/projects/:id
 */
export const getProjectResponseSchema = {
  type: 'object',
  required: ['project'],
  properties: {
    project: projectSchema
  }
} as const;

/**
 * Update project settings request body schema
 * PATCH /api/projects/:id/settings
 */
export const updateProjectSettingsRequestSchema = {
  type: 'object',
  required: ['settings'],
  properties: {
    settings: {
      type: 'object',
      properties: {
        model: { type: 'string' },
        memoryBackend: { type: 'string', enum: ['graphiti', 'file'] },
        linearSync: { type: 'boolean' },
        linearTeamId: { type: 'string' },
        notifications: notificationSettingsSchema,
        graphitiMcpEnabled: { type: 'boolean' },
        graphitiMcpUrl: { type: 'string' },
        mainBranch: { type: 'string' }
      }
    }
  }
} as const;

/**
 * Project route parameters schema
 */
export const projectParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'Project ID' }
  }
} as const;

// ============================================
// Monitoring API Schemas
// ============================================

/**
 * Health check response schema
 * GET /api/health
 */
export const healthCheckResponseSchema = {
  type: 'object',
  required: ['status', 'timestamp', 'uptime', 'version'],
  properties: {
    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'], description: 'Service health status' },
    timestamp: { type: 'string', format: 'date-time', description: 'Current timestamp' },
    uptime: { type: 'number', description: 'Server uptime in seconds' },
    version: { type: 'string', description: 'Application version' }
  }
} as const;

/**
 * Version response schema
 * GET /api/version
 */
export const versionResponseSchema = {
  type: 'object',
  required: ['version', 'apiVersion'],
  properties: {
    version: { type: 'string', description: 'Application version' },
    apiVersion: { type: 'string', description: 'API version' },
    electronVersion: { type: 'string', description: 'Electron version (if running in Electron)' }
  }
} as const;

// ============================================
// WebSocket Schemas
// ============================================

/**
 * WebSocket message base schema
 */
export const webSocketMessageSchema = {
  type: 'object',
  required: ['type', 'timestamp'],
  properties: {
    type: { type: 'string', enum: webSocketMessageTypeEnum },
    payload: { type: 'object', additionalProperties: true },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Task progress payload schema
 */
export const taskProgressPayloadSchema = {
  type: 'object',
  required: ['taskId', 'plan'],
  properties: {
    taskId: { type: 'string' },
    plan: implementationPlanSchema
  }
} as const;

/**
 * Task status change payload schema
 */
export const taskStatusChangePayloadSchema = {
  type: 'object',
  required: ['taskId', 'status'],
  properties: {
    taskId: { type: 'string' },
    status: { type: 'string', enum: taskStatusEnum },
    previousStatus: { type: 'string', enum: taskStatusEnum }
  }
} as const;

/**
 * Task log payload schema
 */
export const taskLogPayloadSchema = {
  type: 'object',
  required: ['taskId', 'log', 'timestamp'],
  properties: {
    taskId: { type: 'string' },
    log: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Task error payload schema
 */
export const taskErrorPayloadSchema = {
  type: 'object',
  required: ['taskId', 'error', 'timestamp'],
  properties: {
    taskId: { type: 'string' },
    error: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Task execution progress payload schema
 */
export const taskExecutionProgressPayloadSchema = {
  type: 'object',
  required: ['taskId', 'progress'],
  properties: {
    taskId: { type: 'string' },
    progress: executionProgressSchema
  }
} as const;

/**
 * Subscribe payload schema (client → server)
 */
export const subscribePayloadSchema = {
  type: 'object',
  properties: {
    taskIds: { type: 'array', items: { type: 'string' } },
    projectId: { type: 'string' },
    events: { type: 'array', items: { type: 'string', enum: webSocketMessageTypeEnum } }
  }
} as const;

/**
 * Unsubscribe payload schema (client → server)
 */
export const unsubscribePayloadSchema = {
  type: 'object',
  properties: {
    taskIds: { type: 'array', items: { type: 'string' } },
    projectId: { type: 'string' },
    events: { type: 'array', items: { type: 'string', enum: webSocketMessageTypeEnum } }
  }
} as const;

/**
 * WebSocket error payload schema
 */
export const webSocketErrorPayloadSchema = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' }
  }
} as const;

// ============================================
// Pagination Schemas
// ============================================

/**
 * Pagination query parameters schema
 */
export const paginationQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0 }
  }
} as const;

/**
 * Paginated response wrapper schema (generic)
 */
export const paginatedResponseSchema = {
  type: 'object',
  required: ['items', 'total', 'page', 'limit', 'hasMore'],
  properties: {
    items: { type: 'array', items: { type: 'object' } },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1 },
    hasMore: { type: 'boolean' }
  }
} as const;

// ============================================
// Complete Route Schemas (for Fastify routes)
// ============================================

/**
 * Complete schema for POST /api/tasks
 */
export const createTaskSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Create a new task',
  description: 'Creates a new task in the specified project',
  body: createTaskRequestSchema,
  response: {
    201: createTaskResponseSchema,
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for GET /api/tasks
 */
export const listTasksSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'List tasks',
  description: 'Returns a list of tasks for the specified project',
  querystring: listTasksQuerySchema,
  response: {
    200: listTasksResponseSchema,
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema
  }
};

/**
 * Complete schema for GET /api/tasks/:id
 */
export const getTaskSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Get task details',
  description: 'Returns details of a specific task',
  params: taskParamsSchema,
  response: {
    200: getTaskResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for PATCH /api/tasks/:id
 */
export const updateTaskSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Update a task',
  description: 'Updates an existing task',
  params: taskParamsSchema,
  body: updateTaskRequestSchema,
  response: {
    200: getTaskResponseSchema,
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for DELETE /api/tasks/:id
 */
export const deleteTaskSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Delete a task',
  description: 'Deletes a task (cancels if running)',
  params: taskParamsSchema,
  response: {
    204: { type: 'null', description: 'No content - task deleted successfully' },
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for POST /api/tasks/:id/start
 */
export const startTaskSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Start a task',
  description: 'Starts execution of a task',
  params: taskParamsSchema,
  body: startTaskRequestSchema,
  response: {
    202: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
        taskId: { type: 'string' }
      }
    },
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for POST /api/tasks/:id/stop
 */
export const stopTaskSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Stop a task',
  description: 'Stops execution of a running task',
  params: taskParamsSchema,
  response: {
    200: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
        taskId: { type: 'string' }
      }
    },
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for POST /api/tasks/:id/review
 */
export const submitReviewSchema: RouteSchema = {
  tags: ['Tasks'],
  summary: 'Submit task review',
  description: 'Submits a review for a task awaiting human review',
  params: taskParamsSchema,
  body: submitReviewRequestSchema,
  response: {
    200: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
        taskId: { type: 'string' }
      }
    },
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for POST /api/projects
 */
export const addProjectSchema: RouteSchema = {
  tags: ['Projects'],
  summary: 'Add a project',
  description: 'Adds a new project from a filesystem path',
  body: addProjectRequestSchema,
  response: {
    201: addProjectResponseSchema,
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema
  }
};

/**
 * Complete schema for GET /api/projects
 */
export const listProjectsSchema: RouteSchema = {
  tags: ['Projects'],
  summary: 'List projects',
  description: 'Returns a list of all projects',
  response: {
    200: listProjectsResponseSchema,
    401: apiErrorResponseSchema
  }
};

/**
 * Complete schema for GET /api/projects/:id
 */
export const getProjectSchema: RouteSchema = {
  tags: ['Projects'],
  summary: 'Get project details',
  description: 'Returns details of a specific project',
  params: projectParamsSchema,
  response: {
    200: getProjectResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for DELETE /api/projects/:id
 */
export const deleteProjectSchema: RouteSchema = {
  tags: ['Projects'],
  summary: 'Remove a project',
  description: 'Removes a project from AutoClaude (does not delete files)',
  params: projectParamsSchema,
  response: {
    204: { type: 'null', description: 'No content - project removed successfully' },
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for PATCH /api/projects/:id/settings
 */
export const updateProjectSettingsSchema: RouteSchema = {
  tags: ['Projects'],
  summary: 'Update project settings',
  description: 'Updates settings for a specific project',
  params: projectParamsSchema,
  body: updateProjectSettingsRequestSchema,
  response: {
    200: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } }
    },
    400: apiErrorResponseSchema,
    401: apiErrorResponseSchema,
    404: apiErrorResponseSchema
  }
};

/**
 * Complete schema for GET /api/health
 */
export const healthSchema: RouteSchema = {
  tags: ['Monitoring'],
  summary: 'Health check',
  description: 'Returns the health status of the API server. This endpoint is publicly accessible (no authentication required).',
  security: [], // Public endpoint - no auth required
  response: {
    200: healthCheckResponseSchema
  }
};

/**
 * Complete schema for GET /api/version
 */
export const versionSchema: RouteSchema = {
  tags: ['Monitoring'],
  summary: 'API version',
  description: 'Returns version information for the API. This endpoint is publicly accessible (no authentication required).',
  security: [], // Public endpoint - no auth required
  response: {
    200: versionResponseSchema
  }
};

// ============================================
// Security Schemas (for OpenAPI documentation)
// ============================================

/**
 * API Key security scheme for OpenAPI
 */
export const apiKeySecurityScheme = {
  type: 'apiKey',
  name: 'x-api-key',
  in: 'header',
  description: 'API key for authentication. Set via API_KEY environment variable.'
} as const;
