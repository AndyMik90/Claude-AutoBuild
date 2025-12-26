/**
 * Integration tests for HTTP API to IPC bridge
 * Tests HTTP API endpoints mirror IPC functionality for remote access
 *
 * The HTTP API serves as a remote access layer that performs the same
 * operations as the IPC handlers, allowing mobile apps and external
 * tools to interact with AutoClaude.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';

// Test data directory
const TEST_DIR = '/tmp/api-ipc-bridge-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const TEST_SPECS_DIR = path.join(TEST_PROJECT_PATH, '.auto-claude', 'specs');

// Mock project data (mirrors what IPC would return)
const mockProject = {
  id: 'test-project-id',
  name: 'test-project',
  path: TEST_PROJECT_PATH,
  autoBuildPath: '.auto-claude',
  settings: {
    model: 'sonnet',
    memoryBackend: 'file' as const,
    linearSync: false,
    notifications: {
      onTaskComplete: true,
      onTaskFailed: true,
      onReviewNeeded: true,
      sound: false,
    },
    graphitiMcpEnabled: false,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock task data (mirrors what IPC would return)
const mockTask = {
  id: '001-test-task',
  specId: '001-test-task',
  projectId: 'test-project-id',
  title: 'Test Task',
  description: 'This is a test task',
  status: 'backlog' as const,
  subtasks: [],
  logs: [],
  metadata: { sourceType: 'manual' as const },
  specsPath: path.join(TEST_SPECS_DIR, '001-test-task'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock projectStore before importing the routes
vi.mock('../../main/project-store', () => ({
  projectStore: {
    getProjects: vi.fn(() => [mockProject]),
    getProject: vi.fn((id: string) => (id === mockProject.id ? mockProject : undefined)),
    getTasks: vi.fn((projectId: string) => (projectId === mockProject.id ? [mockTask] : [])),
    addProject: vi.fn((path: string) => ({
      ...mockProject,
      path,
      name: path.split('/').pop() || 'project',
    })),
    removeProject: vi.fn(() => true),
    updateProjectSettings: vi.fn((id: string, settings: object) => ({
      ...mockProject,
      settings: { ...mockProject.settings, ...settings },
    })),
    validateProjects: vi.fn(() => []),
  },
}));

// Mock auth middleware to always pass for integration tests
vi.mock('../../main/api/middleware/auth', () => ({
  authenticateApiKey: vi.fn(async (_request, _reply) => {
    // Authentication passes by not throwing
  }),
}));

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Setup test project structure
function setupTestProject(): void {
  mkdirSync(TEST_SPECS_DIR, { recursive: true });
  // Create a spec directory for the mock task
  const specDir = path.join(TEST_SPECS_DIR, '001-test-task');
  mkdirSync(specDir, { recursive: true });

  // Create implementation_plan.json
  writeFileSync(
    path.join(specDir, 'implementation_plan.json'),
    JSON.stringify({
      feature: 'Test Task',
      description: 'This is a test task',
      status: 'backlog',
      phases: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  );
}

describe('HTTP API to IPC Bridge Integration', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestProject();
    vi.clearAllMocks();

    // Reset mock implementations to default state
    const { projectStore } = await import('../../main/project-store');
    vi.mocked(projectStore.getProjects).mockReturnValue([mockProject]);
    vi.mocked(projectStore.getProject).mockImplementation((id: string) =>
      id === mockProject.id ? mockProject : undefined
    );
    vi.mocked(projectStore.getTasks).mockImplementation((projectId: string) =>
      projectId === mockProject.id ? [{ ...mockTask }] : []
    );
    vi.mocked(projectStore.validateProjects).mockReturnValue([]);

    // Create a new Fastify instance for each test
    fastify = Fastify({ logger: false });

    // Register routes (mimics how HTTP API is set up)
    const { registerTaskRoutes } = await import('../../main/api/routes/tasks');
    const { registerProjectRoutes } = await import('../../main/api/routes/projects');
    const { registerMonitoringRoutes } = await import('../../main/api/routes/monitoring');

    await registerTaskRoutes(fastify);
    await registerProjectRoutes(fastify);
    await registerMonitoringRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
    cleanupTestDirs();
  });

  describe('HTTP API mirrors IPC project operations', () => {
    it('GET /api/projects mirrors IPC project:list', async () => {
      // HTTP API should return same data as IPC project:list
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/projects',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should return array of projects like IPC handler
      expect(body).toHaveProperty('projects');
      expect(Array.isArray(body.projects)).toBe(true);
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0].id).toBe(mockProject.id);
      expect(body.projects[0].name).toBe(mockProject.name);
    });

    it('GET /api/projects/:id mirrors IPC project:get', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/projects/${mockProject.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should return single project like IPC handler
      expect(body).toHaveProperty('project');
      expect(body.project.id).toBe(mockProject.id);
      expect(body.project.path).toBe(mockProject.path);
    });

    it('POST /api/projects mirrors IPC project:add', async () => {
      const { projectStore } = await import('../../main/project-store');

      // Create the test project directory
      mkdirSync(TEST_PROJECT_PATH, { recursive: true });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/projects',
        payload: {
          projectPath: TEST_PROJECT_PATH,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      // Should return created project like IPC handler
      expect(body).toHaveProperty('project');
      expect(projectStore.addProject).toHaveBeenCalledWith(TEST_PROJECT_PATH);
    });

    it('DELETE /api/projects/:id mirrors IPC project:remove', async () => {
      const { projectStore } = await import('../../main/project-store');

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/projects/${mockProject.id}`,
      });

      expect(response.statusCode).toBe(204);
      expect(projectStore.removeProject).toHaveBeenCalledWith(mockProject.id);
    });

    it('PATCH /api/projects/:id/settings mirrors IPC project:updateSettings', async () => {
      const { projectStore } = await import('../../main/project-store');
      const newSettings = { model: 'opus' };

      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/projects/${mockProject.id}/settings`,
        payload: {
          settings: newSettings,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(projectStore.updateProjectSettings).toHaveBeenCalledWith(
        mockProject.id,
        newSettings
      );
    });
  });

  describe('HTTP API mirrors IPC task operations', () => {
    it('GET /api/tasks mirrors IPC task:list', async () => {
      const { projectStore } = await import('../../main/project-store');

      const response = await fastify.inject({
        method: 'GET',
        url: `/api/tasks?projectId=${mockProject.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should return tasks like IPC handler
      expect(body).toHaveProperty('tasks');
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(projectStore.getTasks).toHaveBeenCalledWith(mockProject.id);
    });

    it('GET /api/tasks/:id mirrors IPC task:get', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/tasks/${mockTask.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should return single task like IPC handler
      expect(body).toHaveProperty('task');
      expect(body.task.id).toBe(mockTask.id);
      expect(body.task.title).toBe(mockTask.title);
    });

    it('POST /api/tasks mirrors IPC task:create', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: mockProject.id,
          title: 'New Task via API',
          description: 'Created through HTTP API',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      // Should return created task like IPC handler
      expect(body).toHaveProperty('task');
      expect(body.task.title).toBe('New Task via API');
      expect(body.task.description).toBe('Created through HTTP API');
      expect(body.task.status).toBe('backlog');
      expect(body.task.metadata).toHaveProperty('sourceType', 'manual');
    });

    it('POST /api/tasks/:id/start mirrors IPC task:start', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/start`,
        payload: {},
      });

      // HTTP API returns 202 Accepted for async operations
      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task start requested');
      expect(body.taskId).toBe(mockTask.id);
    });

    it('POST /api/tasks/:id/stop mirrors IPC task:stop', async () => {
      // Set task to in_progress so it can be stopped
      const { projectStore } = await import('../../main/project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'in_progress' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/stop`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task stop requested');
      expect(body.taskId).toBe(mockTask.id);
    });

    it('POST /api/tasks/:id/review mirrors IPC task:review', async () => {
      // Set task to human_review so it can be reviewed
      const { projectStore } = await import('../../main/project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'human_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/review`,
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task approved');
    });

    it('POST /api/tasks/:id/review with rejection mirrors IPC task:review rejection', async () => {
      // Set task to human_review so it can be reviewed
      const { projectStore } = await import('../../main/project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'human_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/review`,
        payload: {
          approved: false,
          feedback: 'Needs more work on error handling',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task rejected and returned to backlog');
    });

    it('DELETE /api/tasks/:id mirrors IPC task:delete', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: `/api/tasks/${mockTask.id}`,
      });

      expect(response.statusCode).toBe(204);
      // Verify spec directory was deleted
      expect(existsSync(path.join(TEST_SPECS_DIR, mockTask.id))).toBe(false);
    });

    it('PATCH /api/tasks/:id mirrors IPC task:update', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: `/api/tasks/${mockTask.id}`,
        payload: {
          title: 'Updated Task Title',
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task.title).toBe('Updated Task Title');
      expect(body.task.description).toBe('Updated description');
    });
  });

  describe('HTTP API mirrors IPC error handling', () => {
    it('returns 404 for non-existent project (like IPC returns error)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/projects/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('NotFound');
      expect(body.message).toContain('not found');
    });

    it('returns 404 for non-existent task (like IPC returns error)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks/non-existent-task',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('NotFound');
      expect(body.message).toContain('not found');
    });

    it('returns 400 for invalid request (like IPC validation)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks', // Missing required projectId
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when starting already running task', async () => {
      const { projectStore } = await import('../../main/project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'in_progress' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/start`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is already running');
    });

    it('returns 400 when stopping non-running task', async () => {
      // Reset to backlog status
      const { projectStore } = await import('../../main/project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'backlog' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/stop`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is not currently running');
    });

    it('returns 400 when reviewing non-review task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/review`,
        payload: { approved: true },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is not awaiting review');
    });
  });

  describe('HTTP API monitoring endpoints', () => {
    it('GET /api/health returns health status (public endpoint)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('version');
    });

    it('GET /api/version returns version info (public endpoint)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/version',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('apiVersion');
    });

    it('GET /api/status returns detailed status (authenticated)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('components');
      expect(body).toHaveProperty('memory');
      expect(body.components).toHaveProperty('api');
      expect(body.components).toHaveProperty('projectStore');
    });
  });

  describe('HTTP API authentication bridge', () => {
    it('calls authenticateApiKey middleware for protected endpoints', async () => {
      const { authenticateApiKey } = await import('../../main/api/middleware/auth');

      await fastify.inject({
        method: 'GET',
        url: '/api/projects',
      });

      expect(authenticateApiKey).toHaveBeenCalled();
    });

    it('calls authenticateApiKey for task endpoints', async () => {
      const { authenticateApiKey } = await import('../../main/api/middleware/auth');

      await fastify.inject({
        method: 'GET',
        url: `/api/tasks?projectId=${mockProject.id}`,
      });

      expect(authenticateApiKey).toHaveBeenCalled();
    });

    it('calls authenticateApiKey for status endpoint', async () => {
      const { authenticateApiKey } = await import('../../main/api/middleware/auth');

      await fastify.inject({
        method: 'GET',
        url: '/api/status',
      });

      expect(authenticateApiKey).toHaveBeenCalled();
    });
  });

  describe('HTTP API uses same data store as IPC', () => {
    it('both HTTP and IPC use projectStore for project data', async () => {
      const { projectStore } = await import('../../main/project-store');

      // HTTP API call
      await fastify.inject({
        method: 'GET',
        url: '/api/projects',
      });

      // Verify projectStore was called (same store IPC uses)
      expect(projectStore.getProjects).toHaveBeenCalled();
    });

    it('both HTTP and IPC use projectStore for task data', async () => {
      const { projectStore } = await import('../../main/project-store');

      // HTTP API call
      await fastify.inject({
        method: 'GET',
        url: `/api/tasks?projectId=${mockProject.id}`,
      });

      // Verify projectStore was called (same store IPC uses)
      expect(projectStore.getTasks).toHaveBeenCalledWith(mockProject.id);
    });

    it('HTTP API validates projects same as IPC', async () => {
      const { projectStore } = await import('../../main/project-store');

      // HTTP API call triggers validation
      await fastify.inject({
        method: 'GET',
        url: '/api/projects',
      });

      // Verify validateProjects was called (same as IPC does)
      expect(projectStore.validateProjects).toHaveBeenCalled();
    });
  });

  describe('HTTP API task status transitions match IPC behavior', () => {
    it('task filtering by status works like IPC', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/tasks?projectId=${mockProject.id}&status=backlog`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].status).toBe('backlog');
    });

    it('task filtering returns empty for non-matching status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/api/tasks?projectId=${mockProject.id}&status=done`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tasks).toHaveLength(0);
    });

    it('ai_review status allows review like human_review', async () => {
      const { projectStore } = await import('../../main/project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'ai_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: `/api/tasks/${mockTask.id}/review`,
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task approved');
    });
  });
});
