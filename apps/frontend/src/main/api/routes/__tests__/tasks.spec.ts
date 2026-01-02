/**
 * Unit tests for Task Management REST API Routes
 * Tests all task CRUD operations with mock dependencies
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';

// Test data directory
const TEST_DIR = '/tmp/task-routes-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const TEST_SPECS_DIR = path.join(TEST_PROJECT_PATH, '.auto-claude', 'specs');

// Mock project data
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

// Mock task data
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
vi.mock('../../../project-store', () => ({
  projectStore: {
    getProjects: vi.fn(() => [mockProject]),
    getProject: vi.fn((id: string) => (id === mockProject.id ? mockProject : undefined)),
    getTasks: vi.fn((projectId: string) => (projectId === mockProject.id ? [mockTask] : [])),
  },
}));

// Mock auth middleware to always pass
vi.mock('../../middleware/auth', () => ({
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

describe('Task Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestProject();
    vi.clearAllMocks();

    // Reset mock implementations to default state
    const { projectStore } = await import('../../../project-store');
    vi.mocked(projectStore.getProjects).mockReturnValue([mockProject]);
    vi.mocked(projectStore.getProject).mockImplementation((id: string) =>
      id === mockProject.id ? mockProject : undefined
    );
    vi.mocked(projectStore.getTasks).mockImplementation((projectId: string) =>
      projectId === mockProject.id ? [{ ...mockTask }] : []
    );

    // Create a new Fastify instance for each test
    fastify = Fastify({ logger: false });

    // Import and register task routes
    const { registerTaskRoutes } = await import('../tasks');
    await registerTaskRoutes(fastify);
  });

  afterEach(async () => {
    await fastify.close();
    cleanupTestDirs();
  });

  describe('GET /api/tasks', () => {
    it('should return tasks for a valid project', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks?projectId=test-project-id',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('tasks');
      expect(Array.isArray(body.tasks)).toBe(true);
    });

    it('should return 400 when projectId is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for non-existent project', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks?projectId=non-existent-project',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Project not found');
    });

    it('should filter tasks by status when provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks?projectId=test-project-id&status=backlog',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tasks).toHaveLength(1);
    });

    it('should return empty array when filtering by non-matching status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks?projectId=test-project-id&status=done',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tasks).toHaveLength(0);
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'test-project-id',
          title: 'New Test Task',
          description: 'A new task description',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('task');
      expect(body.task.title).toBe('New Test Task');
      expect(body.task.description).toBe('A new task description');
      expect(body.task.status).toBe('backlog');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'non-existent-project',
          title: 'New Task',
          description: 'Description',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Project not found');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'test-project-id',
          // Missing title and description
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should create task with metadata when provided', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'test-project-id',
          title: 'Task with Metadata',
          description: 'Description with metadata',
          metadata: {
            category: 'feature',
            priority: 'high',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.task.metadata).toHaveProperty('category', 'feature');
      expect(body.task.metadata).toHaveProperty('priority', 'high');
      expect(body.task.metadata).toHaveProperty('sourceType', 'manual');
    });

    it('should generate spec ID with incrementing number', async () => {
      // First task
      const response1 = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'test-project-id',
          title: 'First Task',
          description: 'First description',
        },
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);
      // Should be 002 since 001-test-task already exists
      expect(body1.task.specId).toMatch(/^002-/);

      // Second task
      const response2 = await fastify.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'test-project-id',
          title: 'Second Task',
          description: 'Second description',
        },
      });

      expect(response2.statusCode).toBe(201);
      const body2 = JSON.parse(response2.body);
      expect(body2.task.specId).toMatch(/^003-/);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return a specific task', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks/001-test-task',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('task');
      expect(body.task.id).toBe('001-test-task');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/tasks/non-existent-task',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('not found');
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    it('should update task title', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/tasks/001-test-task',
        payload: {
          title: 'Updated Task Title',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task.title).toBe('Updated Task Title');
    });

    it('should update task description', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/tasks/001-test-task',
        payload: {
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task.description).toBe('Updated description');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/tasks/non-existent-task',
        payload: {
          title: 'New Title',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should update both title and description', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/tasks/001-test-task',
        payload: {
          title: 'New Title',
          description: 'New Description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.task.title).toBe('New Title');
      expect(body.task.description).toBe('New Description');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/tasks/001-test-task',
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify spec directory was deleted
      expect(existsSync(path.join(TEST_SPECS_DIR, '001-test-task'))).toBe(false);
    });

    it('should return 404 for non-existent task', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/tasks/non-existent-task',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/tasks/:id/start', () => {
    it('should accept start request for a task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/start',
        payload: {},
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task start requested');
      expect(body.taskId).toBe('001-test-task');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/non-existent-task/start',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 if task is already running', async () => {
      // Update mock task to be in_progress
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'in_progress' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/start',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is already running');
    });

    it('should return 400 if task is already completed', async () => {
      // Update mock task to be done
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'done' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/start',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is already completed');
    });

    it('should accept start options', async () => {
      // Reset mock to default backlog status
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([{ ...mockTask, status: 'backlog' as const }]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/start',
        payload: {
          options: {
            parallel: true,
            workers: 3,
            model: 'opus',
          },
        },
      });

      expect(response.statusCode).toBe(202);
    });
  });

  describe('POST /api/tasks/:id/stop', () => {
    it('should accept stop request for a running task', async () => {
      // Update mock task to be in_progress
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'in_progress' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/stop',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task stop requested');
      expect(body.taskId).toBe('001-test-task');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/non-existent-task/stop',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 if task is not running', async () => {
      // Reset mock to backlog status (not running)
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([{ ...mockTask, status: 'backlog' as const }]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/stop',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is not currently running');
    });
  });

  describe('POST /api/tasks/:id/review', () => {
    it('should accept review for a task in human_review status', async () => {
      // Update mock task to be in human_review
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'human_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/review',
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task approved');
    });

    it('should accept review for a task in ai_review status', async () => {
      // Update mock task to be in ai_review
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'ai_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/review',
        payload: {
          approved: false,
          feedback: 'Needs more work',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task rejected and returned to backlog');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/non-existent-task/review',
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 if task is not in review status', async () => {
      // Reset mock to backlog status (not in review)
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([{ ...mockTask, status: 'backlog' as const }]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/review',
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Task is not awaiting review');
    });

    it('should return 400 when approved field is missing', async () => {
      // Update mock task to be in human_review
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'human_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/review',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should save feedback when rejecting', async () => {
      // Update mock task to be in human_review
      const { projectStore } = await import('../../../project-store');
      vi.mocked(projectStore.getTasks).mockReturnValue([
        { ...mockTask, status: 'human_review' as const },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/tasks/001-test-task/review',
        payload: {
          approved: false,
          feedback: 'The implementation needs these improvements...',
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify feedback file was created
      const feedbackPath = path.join(TEST_SPECS_DIR, '001-test-task', 'review_feedback.txt');
      expect(existsSync(feedbackPath)).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should call authenticateApiKey middleware', async () => {
      const { authenticateApiKey } = await import('../../middleware/auth');

      await fastify.inject({
        method: 'GET',
        url: '/api/tasks?projectId=test-project-id',
      });

      expect(authenticateApiKey).toHaveBeenCalled();
    });
  });
});
