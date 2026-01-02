/**
 * API Routes Module Index
 *
 * This module exports a single setup function that registers all API routes
 * organized by domain into separate route modules.
 */

import type { FastifyInstance } from 'fastify';

// Import all route registration functions
import { registerTaskRoutes } from './tasks';
import { registerProjectRoutes } from './projects';
import { registerMonitoringRoutes } from './monitoring';

// Import WebSocket route registration
import { registerWebSocketRoute } from '../websocket';

/**
 * Register all API routes with the Fastify instance
 *
 * This function registers all route modules in the correct order.
 * Routes are registered with their full paths (already prefixed with /api).
 *
 * @param fastify - The Fastify instance to register routes on
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Task management routes (/api/tasks/*)
  await registerTaskRoutes(fastify);

  // Project management routes (/api/projects/*)
  await registerProjectRoutes(fastify);

  // Monitoring routes (/api/health, /api/version, /api/status)
  await registerMonitoringRoutes(fastify);

  // WebSocket route (/ws)
  registerWebSocketRoute(fastify);

  fastify.log.info('[API] All route modules registered successfully');
}

// Re-export all individual registration functions for potential custom usage
export {
  registerTaskRoutes,
  registerProjectRoutes,
  registerMonitoringRoutes,
  registerWebSocketRoute,
};
