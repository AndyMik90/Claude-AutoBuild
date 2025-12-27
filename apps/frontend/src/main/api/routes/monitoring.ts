/**
 * Monitoring REST API Routes
 *
 * Provides health check, version, and status monitoring endpoints
 * for the AutoClaude Remote API.
 *
 * Endpoints:
 * - GET /api/health  - Health check (public, no auth required)
 * - GET /api/version - API version information (public, no auth required)
 * - GET /api/status  - Detailed system status (requires auth)
 */

import type { FastifyInstance } from 'fastify';
import { getServerUptime, getServerStartTime } from '../server';
import { authenticateApiKey } from '../middleware/auth';
import { healthSchema, versionSchema } from '../schemas';
import type { RouteSchema } from '../schemas';
import type { HealthCheckResponse, VersionResponse } from '../types';

/**
 * API version constant
 * Follows semantic versioning: major.minor.patch
 */
const API_VERSION = '1.0.0';

/**
 * Application version from package.json
 * This is read at build time or runtime
 */
const APP_VERSION = process.env.npm_package_version || '2.7.2';

/**
 * Get Electron version if running in Electron context
 */
function getElectronVersion(): string | undefined {
  // Check if running in Electron environment
  if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
    return process.versions.electron;
  }
  return undefined;
}

/**
 * Status response schema for GET /api/status
 */
const statusResponseSchema = {
  type: 'object',
  required: ['status', 'timestamp', 'uptime', 'version', 'components'],
  properties: {
    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'], description: 'Overall system health status' },
    timestamp: { type: 'string', format: 'date-time', description: 'Current timestamp' },
    uptime: { type: 'number', description: 'Server uptime in seconds' },
    version: { type: 'string', description: 'Application version' },
    apiVersion: { type: 'string', description: 'API version' },
    components: {
      type: 'object',
      description: 'Individual component health statuses',
      properties: {
        api: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            uptime: { type: 'number' }
          }
        },
        projectStore: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            projectCount: { type: 'integer' }
          }
        }
      }
    },
    memory: {
      type: 'object',
      description: 'Memory usage information',
      properties: {
        heapUsed: { type: 'number', description: 'Heap memory used in MB' },
        heapTotal: { type: 'number', description: 'Total heap memory in MB' },
        rss: { type: 'number', description: 'Resident set size in MB' }
      }
    },
    startedAt: { type: 'string', format: 'date-time', description: 'Server start timestamp' }
  }
} as const;

/**
 * Complete schema for GET /api/status
 */
const statusSchema: RouteSchema = {
  tags: ['Monitoring'],
  summary: 'System status',
  description: 'Returns detailed system status including component health and memory usage',
  security: [{ apiKey: [] }],
  response: {
    200: statusResponseSchema,
    401: {
      type: 'object',
      required: ['error', 'message', 'statusCode'],
      properties: {
        error: { type: 'string' },
        message: { type: 'string' },
        statusCode: { type: 'integer' }
      }
    }
  }
};

/**
 * Determine overall health status based on system state
 */
function determineHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
  // Check if server has been running for a reasonable time
  const uptime = getServerUptime();

  // Check memory usage
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
  const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

  // Consider degraded if heap usage is over 85%
  if (heapUsagePercent > 85) {
    return 'degraded';
  }

  // Consider unhealthy if server just started (may still be initializing)
  // or if heap usage is critical (over 95%)
  if (heapUsagePercent > 95) {
    return 'unhealthy';
  }

  return 'healthy';
}

/**
 * Register monitoring routes with the Fastify instance
 *
 * @param fastify - The Fastify instance to register routes on
 */
export async function registerMonitoringRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/health - Health check endpoint
   *
   * Public endpoint (no authentication required).
   * Used by load balancers, monitoring systems, and uptime checks.
   */
  fastify.route({
    method: 'GET',
    url: '/api/health',
    schema: healthSchema,
    // No preHandler - this endpoint is public
    handler: async (_request, reply) => {
      const uptime = getServerUptime();
      const status = determineHealthStatus();

      const response: HealthCheckResponse = {
        status,
        timestamp: new Date().toISOString(),
        uptime,
        version: APP_VERSION,
      };

      // Use appropriate status code based on health
      const httpStatus = status === 'unhealthy' ? 503 : 200;

      return reply.code(httpStatus).send(response);
    },
  });

  /**
   * GET /api/version - API version information
   *
   * Public endpoint (no authentication required).
   * Returns version information for the API and application.
   */
  fastify.route({
    method: 'GET',
    url: '/api/version',
    schema: versionSchema,
    // No preHandler - this endpoint is public
    handler: async (_request, reply) => {
      const electronVersion = getElectronVersion();

      const response: VersionResponse = {
        version: APP_VERSION,
        apiVersion: API_VERSION,
      };

      // Only include electronVersion if running in Electron
      if (electronVersion) {
        response.electronVersion = electronVersion;
      }

      return reply.send(response);
    },
  });

  /**
   * GET /api/status - Detailed system status
   *
   * Protected endpoint (requires authentication).
   * Returns comprehensive status including component health and resource usage.
   */
  fastify.route({
    method: 'GET',
    url: '/api/status',
    schema: statusSchema,
    preHandler: [authenticateApiKey],
    handler: async (_request, reply) => {
      const uptime = getServerUptime();
      const status = determineHealthStatus();
      const serverStartTime = getServerStartTime();

      // Get memory usage
      const memUsage = process.memoryUsage();

      // Try to get project count safely
      let projectCount = 0;
      let projectStoreStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      try {
        // Dynamic import to avoid circular dependency issues at startup
        const { projectStore } = await import('../../project-store');
        const projects = projectStore.getProjects();
        projectCount = projects.length;
      } catch {
        projectStoreStatus = 'degraded';
      }

      const response = {
        status,
        timestamp: new Date().toISOString(),
        uptime,
        version: APP_VERSION,
        apiVersion: API_VERSION,
        components: {
          api: {
            status: 'healthy' as const,
            uptime,
          },
          projectStore: {
            status: projectStoreStatus,
            projectCount,
          },
        },
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
          rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        },
        startedAt: serverStartTime?.toISOString() ?? null,
      };

      return reply.send(response);
    },
  });
}
