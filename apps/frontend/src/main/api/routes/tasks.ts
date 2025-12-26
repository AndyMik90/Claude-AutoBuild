/**
 * Task Management REST API Routes
 *
 * Provides REST endpoints for task CRUD operations, mirroring the existing
 * IPC functionality for remote access via HTTP API.
 *
 * Endpoints:
 * - GET    /api/tasks          - List tasks for a project
 * - POST   /api/tasks          - Create a new task
 * - GET    /api/tasks/:id      - Get a specific task
 * - PATCH  /api/tasks/:id      - Update a task
 * - DELETE /api/tasks/:id      - Delete a task
 * - POST   /api/tasks/:id/start  - Start task execution
 * - POST   /api/tasks/:id/stop   - Stop task execution
 * - POST   /api/tasks/:id/review - Submit task review
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { projectStore } from '../../project-store';
import { authenticateApiKey } from '../middleware/auth';
import {
  createTaskSchema,
  listTasksSchema,
  getTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  startTaskSchema,
  stopTaskSchema,
  submitReviewSchema,
} from '../schemas';
import type {
  CreateTaskRequest,
  ListTasksQuery,
  TaskRouteParams,
  UpdateTaskRequest,
  StartTaskRequest,
  SubmitReviewRequest,
  Task,
  TaskStatus,
  TaskMetadata,
} from '../types';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import { AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';

/**
 * Helper function to find task and project by taskId
 * (Similar to IPC handlers' shared helper)
 */
function findTaskAndProject(taskId: string): { task: Task | undefined; project: ReturnType<typeof projectStore.getProject> } {
  const projects = projectStore.getProjects();
  let task: Task | undefined;
  let project: ReturnType<typeof projectStore.getProject>;

  for (const p of projects) {
    const tasks = projectStore.getTasks(p.id);
    task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      project = p;
      break;
    }
  }

  return { task, project };
}

/**
 * Slugify a title for use in spec ID
 */
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Generate a fallback title from description
 */
function generateFallbackTitle(description: string): string {
  const title = description.split('\n')[0].substring(0, 60);
  return title.length === 60 ? title + '...' : title;
}

/**
 * Register task management routes with the Fastify instance
 *
 * @param fastify - The Fastify instance to register routes on
 */
export async function registerTaskRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/tasks - List tasks for a project
   *
   * Query Parameters:
   * - projectId (required): The project to list tasks for
   * - status (optional): Filter by task status
   */
  fastify.route<{
    Querystring: ListTasksQuery;
  }>({
    method: 'GET',
    url: '/api/tasks',
    schema: listTasksSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { projectId, status } = request.query;

      // Validate project exists
      const project = projectStore.getProject(projectId);
      if (!project) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Project not found',
          statusCode: 400,
        });
      }

      // Get tasks for the project
      let tasks = projectStore.getTasks(projectId);

      // Filter by status if provided
      if (status) {
        tasks = tasks.filter((t) => t.status === status);
      }

      return reply.send({ tasks });
    },
  });

  /**
   * POST /api/tasks - Create a new task
   *
   * Body:
   * - projectId (required): The project to create the task in
   * - title (required): Task title
   * - description (required): Task description
   * - metadata (optional): Task metadata
   */
  fastify.route<{
    Body: CreateTaskRequest;
  }>({
    method: 'POST',
    url: '/api/tasks',
    schema: createTaskSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { projectId, title, description, metadata } = request.body;

      // Validate project exists
      const project = projectStore.getProject(projectId);
      if (!project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Project not found',
          statusCode: 404,
        });
      }

      // Use provided title or generate fallback
      const finalTitle = title.trim() || generateFallbackTitle(description);

      // Generate a unique spec ID based on existing specs
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specsDir = path.join(project.path, specsBaseDir);

      // Find next available spec number
      let specNumber = 1;
      if (existsSync(specsDir)) {
        const existingDirs = readdirSync(specsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        // Extract numbers from spec directory names (e.g., "001-feature" -> 1)
        const existingNumbers = existingDirs
          .map((name) => {
            const match = name.match(/^(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter((n) => n > 0);

        if (existingNumbers.length > 0) {
          specNumber = Math.max(...existingNumbers) + 1;
        }
      }

      // Create spec ID with zero-padded number and slugified title
      const specId = `${String(specNumber).padStart(3, '0')}-${slugifyTitle(finalTitle)}`;

      // Create spec directory
      const specDir = path.join(specsDir, specId);
      mkdirSync(specDir, { recursive: true });

      // Build metadata with source type
      const taskMetadata: TaskMetadata = {
        sourceType: 'manual',
        ...metadata,
      };

      // Process and save attached images if present
      if (taskMetadata.attachedImages && taskMetadata.attachedImages.length > 0) {
        const attachmentsDir = path.join(specDir, 'attachments');
        mkdirSync(attachmentsDir, { recursive: true });

        const savedImages: typeof taskMetadata.attachedImages = [];

        for (const image of taskMetadata.attachedImages) {
          if (image.data) {
            try {
              // Decode base64 and save to file
              const buffer = Buffer.from(image.data, 'base64');
              const imagePath = path.join(attachmentsDir, image.filename);
              writeFileSync(imagePath, buffer);

              // Store relative path instead of base64 data
              savedImages.push({
                id: image.id,
                filename: image.filename,
                mimeType: image.mimeType,
                size: image.size,
                path: `attachments/${image.filename}`,
              });
            } catch {
              // Skip failed image saves
            }
          }
        }

        // Update metadata with saved image paths (without base64 data)
        taskMetadata.attachedImages = savedImages;
      }

      // Create initial implementation_plan.json
      const now = new Date().toISOString();
      const implementationPlan = {
        feature: finalTitle,
        description: description,
        created_at: now,
        updated_at: now,
        status: 'pending',
        phases: [],
      };

      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      writeFileSync(planPath, JSON.stringify(implementationPlan, null, 2));

      // Save task metadata
      const metadataPath = path.join(specDir, 'task_metadata.json');
      writeFileSync(metadataPath, JSON.stringify(taskMetadata, null, 2));

      // Create requirements.json
      const requirements: Record<string, unknown> = {
        task_description: description,
        workflow_type: taskMetadata.category || 'feature',
      };

      // Add attached images to requirements if present
      if (taskMetadata.attachedImages && taskMetadata.attachedImages.length > 0) {
        requirements.attached_images = taskMetadata.attachedImages.map((img) => ({
          filename: img.filename,
          path: img.path,
          description: '',
        }));
      }

      const requirementsPath = path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS);
      writeFileSync(requirementsPath, JSON.stringify(requirements, null, 2));

      // Create the task object
      const task: Task = {
        id: specId,
        specId: specId,
        projectId,
        title: finalTitle,
        description,
        status: 'backlog',
        subtasks: [],
        logs: [],
        metadata: taskMetadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return reply.code(201).send({ task });
    },
  });

  /**
   * GET /api/tasks/:id - Get a specific task
   */
  fastify.route<{
    Params: TaskRouteParams;
  }>({
    method: 'GET',
    url: '/api/tasks/:id',
    schema: getTaskSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;

      const { task } = findTaskAndProject(id);

      if (!task) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Task with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      return reply.send({ task });
    },
  });

  /**
   * PATCH /api/tasks/:id - Update a task
   */
  fastify.route<{
    Params: TaskRouteParams;
    Body: UpdateTaskRequest;
  }>({
    method: 'PATCH',
    url: '/api/tasks/:id',
    schema: updateTaskSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { title, description } = request.body;

      const { task, project } = findTaskAndProject(id);

      if (!task || !project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Task with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      const autoBuildDir = project.autoBuildPath || '.auto-claude';
      const specDir = path.join(project.path, autoBuildDir, 'specs', task.specId);

      if (!existsSync(specDir)) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Spec directory not found',
          statusCode: 404,
        });
      }

      // Determine final title
      let finalTitle = title;
      if (title !== undefined && !title.trim()) {
        // Generate fallback title from description
        const descriptionToUse = description ?? task.description;
        finalTitle = generateFallbackTitle(descriptionToUse);
      }

      // Update implementation_plan.json
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      if (existsSync(planPath)) {
        try {
          const planContent = readFileSync(planPath, 'utf-8');
          const plan = JSON.parse(planContent);

          if (finalTitle !== undefined) {
            plan.feature = finalTitle;
          }
          if (description !== undefined) {
            plan.description = description;
          }
          plan.updated_at = new Date().toISOString();

          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        } catch {
          // Plan file might not be valid JSON, continue anyway
        }
      }

      // Update spec.md if it exists
      const specPath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
      if (existsSync(specPath)) {
        try {
          let specContent = readFileSync(specPath, 'utf-8');

          // Update title (first # heading)
          if (finalTitle !== undefined) {
            specContent = specContent.replace(/^#\s+.*$/m, `# ${finalTitle}`);
          }

          // Update description (## Overview section content)
          if (description !== undefined) {
            specContent = specContent.replace(
              /(## Overview\n)([\s\S]*?)((?=\n## )|$)/,
              `$1${description}\n\n$3`
            );
          }

          writeFileSync(specPath, specContent);
        } catch {
          // Spec file update failed, continue anyway
        }
      }

      // Build the updated task object
      const updatedTask: Task = {
        ...task,
        title: finalTitle ?? task.title,
        description: description ?? task.description,
        updatedAt: new Date(),
      };

      return reply.send({ task: updatedTask });
    },
  });

  /**
   * DELETE /api/tasks/:id - Delete a task
   */
  fastify.route<{
    Params: TaskRouteParams;
  }>({
    method: 'DELETE',
    url: '/api/tasks/:id',
    schema: deleteTaskSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;

      const { task, project } = findTaskAndProject(id);

      if (!task || !project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Task with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      // Note: In the HTTP API, we don't have direct access to AgentManager
      // to check if a task is running. For now, we allow deletion.
      // The IPC handler has this check, but for remote API we proceed.

      // Delete the spec directory
      const specDir = task.specsPath || path.join(project.path, getSpecsDir(project.autoBuildPath), task.specId);

      try {
        if (existsSync(specDir)) {
          await rm(specDir, { recursive: true, force: true });
        }
        return reply.code(204).send();
      } catch (error) {
        return reply.code(500).send({
          error: 'InternalServerError',
          message: error instanceof Error ? error.message : 'Failed to delete task files',
          statusCode: 500,
        });
      }
    },
  });

  /**
   * POST /api/tasks/:id/start - Start task execution
   *
   * Note: This endpoint accepts the start request but actual execution
   * requires the AgentManager which is part of the Electron app.
   * For remote API usage, this triggers the start but execution happens
   * through the main Electron process.
   */
  fastify.route<{
    Params: TaskRouteParams;
    Body: StartTaskRequest;
  }>({
    method: 'POST',
    url: '/api/tasks/:id/start',
    schema: startTaskSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { options } = request.body || {};

      const { task, project } = findTaskAndProject(id);

      if (!task || !project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Task with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      // Check if task is already running or completed
      if (task.status === 'in_progress') {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Task is already running',
          statusCode: 400,
        });
      }

      if (task.status === 'done') {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Task is already completed',
          statusCode: 400,
        });
      }

      // Update the task status in the implementation plan
      const specDir = task.specsPath || path.join(project.path, getSpecsDir(project.autoBuildPath), task.specId);
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

      if (existsSync(planPath)) {
        try {
          const planContent = readFileSync(planPath, 'utf-8');
          const plan = JSON.parse(planContent);
          plan.status = 'in_progress';
          plan.updated_at = new Date().toISOString();
          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        } catch {
          // Continue even if plan update fails
        }
      }

      // Note: Actual task execution is handled by the AgentManager in Electron.
      // The HTTP API can signal the start, but full execution requires
      // integration with the Electron main process (future enhancement).

      return reply.code(202).send({
        message: 'Task start requested',
        taskId: id,
      });
    },
  });

  /**
   * POST /api/tasks/:id/stop - Stop task execution
   */
  fastify.route<{
    Params: TaskRouteParams;
  }>({
    method: 'POST',
    url: '/api/tasks/:id/stop',
    schema: stopTaskSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;

      const { task, project } = findTaskAndProject(id);

      if (!task || !project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Task with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      if (task.status !== 'in_progress') {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Task is not currently running',
          statusCode: 400,
        });
      }

      // Update the task status in the implementation plan
      const specDir = task.specsPath || path.join(project.path, getSpecsDir(project.autoBuildPath), task.specId);
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

      if (existsSync(planPath)) {
        try {
          const planContent = readFileSync(planPath, 'utf-8');
          const plan = JSON.parse(planContent);
          plan.status = 'backlog';
          plan.updated_at = new Date().toISOString();
          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        } catch {
          // Continue even if plan update fails
        }
      }

      // Note: Actual task stopping is handled by the AgentManager in Electron.
      // The HTTP API can signal the stop, but full execution control requires
      // integration with the Electron main process (future enhancement).

      return reply.send({
        message: 'Task stop requested',
        taskId: id,
      });
    },
  });

  /**
   * POST /api/tasks/:id/review - Submit task review
   */
  fastify.route<{
    Params: TaskRouteParams;
    Body: SubmitReviewRequest;
  }>({
    method: 'POST',
    url: '/api/tasks/:id/review',
    schema: submitReviewSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { approved, feedback } = request.body;

      const { task, project } = findTaskAndProject(id);

      if (!task || !project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Task with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      // Verify task is in a reviewable state
      if (task.status !== 'human_review' && task.status !== 'ai_review') {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Task is not awaiting review',
          statusCode: 400,
        });
      }

      // Update the task status based on review decision
      const specDir = task.specsPath || path.join(project.path, getSpecsDir(project.autoBuildPath), task.specId);
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

      if (existsSync(planPath)) {
        try {
          const planContent = readFileSync(planPath, 'utf-8');
          const plan = JSON.parse(planContent);

          if (approved) {
            plan.status = 'done';
          } else {
            // Rejected - back to backlog for rework
            plan.status = 'backlog';
            if (feedback) {
              plan.reviewFeedback = feedback;
            }
          }
          plan.updated_at = new Date().toISOString();

          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        } catch {
          // Continue even if plan update fails
        }
      }

      // If feedback provided, save it to a review file
      if (feedback) {
        const reviewPath = path.join(specDir, 'review_feedback.txt');
        try {
          const timestamp = new Date().toISOString();
          const reviewContent = `Review submitted: ${timestamp}\nApproved: ${approved}\nFeedback:\n${feedback}\n`;
          writeFileSync(reviewPath, reviewContent);
        } catch {
          // Continue even if feedback file write fails
        }
      }

      return reply.send({
        message: approved ? 'Task approved' : 'Task rejected and returned to backlog',
        taskId: id,
      });
    },
  });
}
