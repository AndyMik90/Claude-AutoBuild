/**
 * Project Management REST API Routes
 *
 * Provides REST endpoints for project operations, mirroring the existing
 * IPC functionality for remote access via HTTP API.
 *
 * Endpoints:
 * - GET    /api/projects          - List all projects
 * - POST   /api/projects          - Add a project by path
 * - GET    /api/projects/:id      - Get a specific project
 * - DELETE /api/projects/:id      - Remove a project
 * - PATCH  /api/projects/:id/settings - Update project settings
 */

import type { FastifyInstance } from 'fastify';
import { existsSync } from 'fs';
import { projectStore } from '../../project-store';
import { authenticateApiKey } from '../middleware/auth';
import {
  addProjectSchema,
  listProjectsSchema,
  getProjectSchema,
  deleteProjectSchema,
  updateProjectSettingsSchema,
} from '../schemas';
import type {
  AddProjectRequest,
  ProjectRouteParams,
  UpdateProjectSettingsRequest,
  ProjectSettings,
} from '../types';

/**
 * Register project management routes with the Fastify instance
 *
 * @param fastify - The Fastify instance to register routes on
 */
export async function registerProjectRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/projects - List all projects
   *
   * Returns all registered projects. Validates that .auto-claude folders
   * still exist for initialized projects (resets autoBuildPath if missing).
   */
  fastify.route({
    method: 'GET',
    url: '/api/projects',
    schema: listProjectsSchema,
    preHandler: [authenticateApiKey],
    handler: async (_request, reply) => {
      // Validate that .auto-claude folders still exist for all projects
      // If a folder was deleted, reset autoBuildPath so UI prompts for reinitialization
      const resetIds = projectStore.validateProjects();
      if (resetIds.length > 0) {
        fastify.log.warn(
          { resetCount: resetIds.length },
          'Detected missing .auto-claude folders for project(s)'
        );
      }

      const projects = projectStore.getProjects();
      return reply.send({ projects });
    },
  });

  /**
   * POST /api/projects - Add a project by filesystem path
   *
   * Body:
   * - projectPath (required): The filesystem path to the project directory
   *
   * Returns the created/existing project. If project already exists at the path,
   * returns the existing project.
   */
  fastify.route<{
    Body: AddProjectRequest;
  }>({
    method: 'POST',
    url: '/api/projects',
    schema: addProjectSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { projectPath } = request.body;

      // Validate path exists
      if (!existsSync(projectPath)) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Directory does not exist',
          statusCode: 400,
        });
      }

      const project = projectStore.addProject(projectPath);
      return reply.code(201).send({ project });
    },
  });

  /**
   * GET /api/projects/:id - Get a specific project
   *
   * Returns the project details for the specified ID.
   */
  fastify.route<{
    Params: ProjectRouteParams;
  }>({
    method: 'GET',
    url: '/api/projects/:id',
    schema: getProjectSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;

      const project = projectStore.getProject(id);

      if (!project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Project with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      return reply.send({ project });
    },
  });

  /**
   * DELETE /api/projects/:id - Remove a project
   *
   * Removes the project from AutoClaude. This does NOT delete
   * any files from the filesystem - it only removes the project
   * from AutoClaude's tracking.
   */
  fastify.route<{
    Params: ProjectRouteParams;
  }>({
    method: 'DELETE',
    url: '/api/projects/:id',
    schema: deleteProjectSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;

      // Check if project exists first for proper 404 response
      const project = projectStore.getProject(id);
      if (!project) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Project with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      const success = projectStore.removeProject(id);

      if (!success) {
        return reply.code(500).send({
          error: 'InternalServerError',
          message: 'Failed to remove project',
          statusCode: 500,
        });
      }

      return reply.code(204).send();
    },
  });

  /**
   * PATCH /api/projects/:id/settings - Update project settings
   *
   * Body:
   * - settings (required): Partial settings object with properties to update
   *
   * Allows updating individual settings without replacing the entire settings object.
   */
  fastify.route<{
    Params: ProjectRouteParams;
    Body: UpdateProjectSettingsRequest;
  }>({
    method: 'PATCH',
    url: '/api/projects/:id/settings',
    schema: updateProjectSettingsSchema,
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { id } = request.params;
      const { settings } = request.body;

      // Check if project exists first
      const existingProject = projectStore.getProject(id);
      if (!existingProject) {
        return reply.code(404).send({
          error: 'NotFound',
          message: `Project with ID '${id}' not found`,
          statusCode: 404,
        });
      }

      // Validate settings object is provided
      if (!settings || typeof settings !== 'object') {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'Settings object is required',
          statusCode: 400,
        });
      }

      const updatedProject = projectStore.updateProjectSettings(
        id,
        settings as Partial<ProjectSettings>
      );

      if (!updatedProject) {
        return reply.code(500).send({
          error: 'InternalServerError',
          message: 'Failed to update project settings',
          statusCode: 500,
        });
      }

      return reply.send({ message: 'Project settings updated successfully' });
    },
  });
}
