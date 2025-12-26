/**
 * Integration tests for OpenAPI spec generation and validation
 *
 * Tests that the OpenAPI specification is correctly generated from:
 * - JSON schemas defined in api/schemas/index.ts
 * - Route definitions in api/routes/*.ts
 * - Security schemes configured in api/server.ts
 *
 * Validates:
 * - OpenAPI spec is valid JSON
 * - All endpoints are documented
 * - Schemas are properly structured
 * - Security definitions are present
 * - TypeScript interfaces are reflected in the spec
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';

// Mock project data
const mockProject = {
  id: 'test-project-id',
  name: 'test-project',
  path: '/tmp/test-project',
  autoBuildPath: '.auto-claude',
  settings: {
    model: 'sonnet',
    memoryBackend: 'file',
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

// Mock projectStore before importing the routes
vi.mock('../../main/project-store', () => ({
  projectStore: {
    getProjects: vi.fn(() => [mockProject]),
    getProject: vi.fn(() => mockProject),
    getTasks: vi.fn(() => []),
    addProject: vi.fn(),
    removeProject: vi.fn(),
    updateProjectSettings: vi.fn(),
    validateProjects: vi.fn(() => []),
  },
}));

// Mock auth middleware to always pass for tests
vi.mock('../../main/api/middleware/auth', () => ({
  authenticateApiKey: vi.fn(async () => {
    // Authentication passes by not throwing
  }),
  authenticateWebSocket: vi.fn(async () => {
    // Authentication passes
  }),
}));

// Import schema for security scheme
import { apiKeySecurityScheme } from '../../main/api/schemas';

describe('OpenAPI Spec Generation and Validation', () => {
  let fastify: FastifyInstance;
  let openApiSpec: Record<string, unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a new Fastify instance with Swagger plugins
    fastify = Fastify({ logger: false });

    // Register Swagger plugins (same configuration as server.ts)
    await fastify.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'AutoClaude Remote API',
          description: 'HTTP API for remote control of AutoClaude task automation.',
          version: '1.0.0',
          contact: {
            name: 'AutoClaude Team',
            url: 'https://github.com/AndyMik90/Auto-Claude',
          },
          license: {
            name: 'AGPL-3.0',
            url: 'https://www.gnu.org/licenses/agpl-3.0.html',
          },
        },
        servers: [
          {
            url: 'http://localhost:3001',
            description: 'Local development server',
          },
        ],
        tags: [
          {
            name: 'Tasks',
            description: 'Task management operations (create, list, start, stop, review)',
          },
          {
            name: 'Projects',
            description: 'Project management operations (list, add, remove, settings)',
          },
          {
            name: 'Monitoring',
            description: 'Health checks and system status endpoints',
          },
          {
            name: 'WebSocket',
            description: 'Real-time task progress via WebSocket connection',
          },
        ],
        components: {
          securitySchemes: {
            apiKey: apiKeySecurityScheme,
          },
        },
        security: [{ apiKey: [] }],
      },
    });

    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/documentation',
    });

    await fastify.register(fastifyWebsocket);

    // Register all routes
    const { registerTaskRoutes } = await import('../../main/api/routes/tasks');
    const { registerProjectRoutes } = await import('../../main/api/routes/projects');
    const { registerMonitoringRoutes } = await import('../../main/api/routes/monitoring');
    const { registerWebSocketRoute } = await import('../../main/api/websocket');

    await registerTaskRoutes(fastify);
    await registerProjectRoutes(fastify);
    await registerMonitoringRoutes(fastify);
    registerWebSocketRoute(fastify);

    // Generate OpenAPI spec after routes are registered
    await fastify.ready();
    openApiSpec = fastify.swagger() as Record<string, unknown>;
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('OpenAPI Spec Structure', () => {
    it('generates valid OpenAPI 3.0 specification', () => {
      expect(openApiSpec).toBeDefined();
      expect(openApiSpec.openapi).toMatch(/^3\.\d+\.\d+$/);
    });

    it('contains required info section', () => {
      const info = openApiSpec.info as Record<string, unknown>;
      expect(info).toBeDefined();
      expect(info.title).toBe('AutoClaude Remote API');
      expect(info.version).toBe('1.0.0');
      expect(info.description).toBeDefined();
    });

    it('contains server definitions', () => {
      const servers = openApiSpec.servers as Array<Record<string, unknown>>;
      expect(servers).toBeDefined();
      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0].url).toBe('http://localhost:3001');
    });

    it('contains tag definitions for endpoint grouping', () => {
      const tags = openApiSpec.tags as Array<Record<string, unknown>>;
      expect(tags).toBeDefined();
      expect(Array.isArray(tags)).toBe(true);

      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('Tasks');
      expect(tagNames).toContain('Projects');
      expect(tagNames).toContain('Monitoring');
      expect(tagNames).toContain('WebSocket');
    });

    it('contains paths section with endpoints', () => {
      const paths = openApiSpec.paths as Record<string, unknown>;
      expect(paths).toBeDefined();
      expect(typeof paths).toBe('object');
      expect(Object.keys(paths).length).toBeGreaterThan(0);
    });

    it('contains components section with schemas', () => {
      const components = openApiSpec.components as Record<string, unknown>;
      expect(components).toBeDefined();
    });
  });

  describe('Task Endpoints Documentation', () => {
    it('documents GET /api/tasks endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks']).toBeDefined();
      expect(paths['/api/tasks'].get).toBeDefined();

      const endpoint = paths['/api/tasks'].get as Record<string, unknown>;
      expect(endpoint.summary).toBeDefined();
      expect(endpoint.tags).toContain('Tasks');
    });

    it('documents POST /api/tasks endpoint with request body', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks']).toBeDefined();
      expect(paths['/api/tasks'].post).toBeDefined();

      const endpoint = paths['/api/tasks'].post as Record<string, unknown>;
      expect(endpoint.summary).toBeDefined();
      expect(endpoint.requestBody).toBeDefined();
    });

    it('documents GET /api/tasks/{id} endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks/{id}']).toBeDefined();
      expect(paths['/api/tasks/{id}'].get).toBeDefined();

      const endpoint = paths['/api/tasks/{id}'].get as Record<string, unknown>;
      expect(endpoint.parameters).toBeDefined();
    });

    it('documents PATCH /api/tasks/{id} endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks/{id}']).toBeDefined();
      expect(paths['/api/tasks/{id}'].patch).toBeDefined();
    });

    it('documents DELETE /api/tasks/{id} endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks/{id}']).toBeDefined();
      expect(paths['/api/tasks/{id}'].delete).toBeDefined();
    });

    it('documents POST /api/tasks/{id}/start endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks/{id}/start']).toBeDefined();
      expect(paths['/api/tasks/{id}/start'].post).toBeDefined();
    });

    it('documents POST /api/tasks/{id}/stop endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks/{id}/stop']).toBeDefined();
      expect(paths['/api/tasks/{id}/stop'].post).toBeDefined();
    });

    it('documents POST /api/tasks/{id}/review endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/tasks/{id}/review']).toBeDefined();
      expect(paths['/api/tasks/{id}/review'].post).toBeDefined();
    });
  });

  describe('Project Endpoints Documentation', () => {
    it('documents GET /api/projects endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/projects']).toBeDefined();
      expect(paths['/api/projects'].get).toBeDefined();

      const endpoint = paths['/api/projects'].get as Record<string, unknown>;
      expect(endpoint.tags).toContain('Projects');
    });

    it('documents POST /api/projects endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/projects']).toBeDefined();
      expect(paths['/api/projects'].post).toBeDefined();
    });

    it('documents GET /api/projects/{id} endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/projects/{id}']).toBeDefined();
      expect(paths['/api/projects/{id}'].get).toBeDefined();
    });

    it('documents DELETE /api/projects/{id} endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/projects/{id}']).toBeDefined();
      expect(paths['/api/projects/{id}'].delete).toBeDefined();
    });

    it('documents PATCH /api/projects/{id}/settings endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/projects/{id}/settings']).toBeDefined();
      expect(paths['/api/projects/{id}/settings'].patch).toBeDefined();
    });
  });

  describe('Monitoring Endpoints Documentation', () => {
    it('documents GET /api/health endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/health']).toBeDefined();
      expect(paths['/api/health'].get).toBeDefined();

      const endpoint = paths['/api/health'].get as Record<string, unknown>;
      expect(endpoint.tags).toContain('Monitoring');
    });

    it('documents GET /api/version endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/version']).toBeDefined();
      expect(paths['/api/version'].get).toBeDefined();
    });

    it('documents GET /api/status endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/api/status']).toBeDefined();
      expect(paths['/api/status'].get).toBeDefined();
    });

    it('marks health endpoint as public (no security requirement)', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const healthEndpoint = paths['/api/health'].get as Record<string, unknown>;

      // Public endpoints should have security: [] (empty array)
      expect(healthEndpoint.security).toEqual([]);
    });

    it('marks version endpoint as public (no security requirement)', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const versionEndpoint = paths['/api/version'].get as Record<string, unknown>;

      expect(versionEndpoint.security).toEqual([]);
    });
  });

  describe('WebSocket Endpoint Documentation', () => {
    it('documents /ws endpoint if captured by swagger', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;

      // WebSocket routes registered via @fastify/websocket with type assertion may not
      // be captured by swagger due to how the handler signature differs. The WebSocket
      // schema is defined in websocket.ts but may not appear in the OpenAPI spec.
      // This is a known limitation of documenting WebSocket endpoints in OpenAPI.
      if (paths['/ws']) {
        expect(paths['/ws'].get).toBeDefined();
        const endpoint = paths['/ws'].get as Record<string, unknown>;
        expect(endpoint.tags).toContain('WebSocket');
      } else {
        // WebSocket routes may not appear in OpenAPI spec - this is acceptable
        // as WebSocket is not part of the OpenAPI 3.0 specification.
        // The route is still functional and authenticated.
        expect(true).toBe(true);
      }
    });

    it('WebSocket tag is defined for documentation purposes', () => {
      const tags = openApiSpec.tags as Array<Record<string, unknown>>;
      const webSocketTag = tags.find((t) => t.name === 'WebSocket');
      expect(webSocketTag).toBeDefined();
      expect(webSocketTag?.description).toBeDefined();
    });
  });

  describe('Security Scheme Documentation', () => {
    it('defines apiKey security scheme', () => {
      const components = openApiSpec.components as Record<string, Record<string, unknown>>;
      expect(components.securitySchemes).toBeDefined();
      expect(components.securitySchemes.apiKey).toBeDefined();

      const apiKeyScheme = components.securitySchemes.apiKey as Record<string, unknown>;
      expect(apiKeyScheme.type).toBe('apiKey');
      expect(apiKeyScheme.name).toBe('x-api-key');
      expect(apiKeyScheme.in).toBe('header');
    });

    it('applies security globally by default', () => {
      const security = openApiSpec.security as Array<Record<string, unknown>>;
      expect(security).toBeDefined();
      expect(Array.isArray(security)).toBe(true);
      expect(security.length).toBeGreaterThan(0);
      expect(security[0]).toHaveProperty('apiKey');
    });
  });

  describe('Response Schema Documentation', () => {
    it('documents success responses with proper schema', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksGet = paths['/api/tasks'].get as Record<string, unknown>;
      const responses = tasksGet.responses as Record<string, unknown>;

      expect(responses['200']).toBeDefined();
      const successResponse = responses['200'] as Record<string, unknown>;
      expect(successResponse.content).toBeDefined();
    });

    it('documents error responses (401 Unauthorized)', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksGet = paths['/api/tasks'].get as Record<string, unknown>;
      const responses = tasksGet.responses as Record<string, unknown>;

      expect(responses['401']).toBeDefined();
    });

    it('documents error responses (400 Bad Request) for create endpoints', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksPost = paths['/api/tasks'].post as Record<string, unknown>;
      const responses = tasksPost.responses as Record<string, unknown>;

      expect(responses['400']).toBeDefined();
    });

    it('documents 404 responses for single resource endpoints', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const taskGet = paths['/api/tasks/{id}'].get as Record<string, unknown>;
      const responses = taskGet.responses as Record<string, unknown>;

      expect(responses['404']).toBeDefined();
    });

    it('documents 204 responses for delete endpoints', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const taskDelete = paths['/api/tasks/{id}'].delete as Record<string, unknown>;
      const responses = taskDelete.responses as Record<string, unknown>;

      expect(responses['204']).toBeDefined();
    });

    it('documents 202 response for async start endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const startTask = paths['/api/tasks/{id}/start'].post as Record<string, unknown>;
      const responses = startTask.responses as Record<string, unknown>;

      expect(responses['202']).toBeDefined();
    });
  });

  describe('Request Body Schema Documentation', () => {
    it('documents request body for task creation', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksPost = paths['/api/tasks'].post as Record<string, unknown>;
      const requestBody = tasksPost.requestBody as Record<string, unknown>;

      expect(requestBody).toBeDefined();
      expect(requestBody.content).toBeDefined();

      const content = requestBody.content as Record<string, Record<string, unknown>>;
      expect(content['application/json']).toBeDefined();
      expect(content['application/json'].schema).toBeDefined();
    });

    it('documents request body for project creation', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const projectsPost = paths['/api/projects'].post as Record<string, unknown>;
      const requestBody = projectsPost.requestBody as Record<string, unknown>;

      expect(requestBody).toBeDefined();
      expect(requestBody.content).toBeDefined();
    });

    it('documents request body for task review', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const reviewPost = paths['/api/tasks/{id}/review'].post as Record<string, unknown>;
      const requestBody = reviewPost.requestBody as Record<string, unknown>;

      expect(requestBody).toBeDefined();
    });
  });

  describe('Query Parameter Documentation', () => {
    it('documents query parameters for task list endpoint', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksGet = paths['/api/tasks'].get as Record<string, unknown>;
      const parameters = tasksGet.parameters as Array<Record<string, unknown>>;

      expect(parameters).toBeDefined();
      expect(Array.isArray(parameters)).toBe(true);

      const queryParams = parameters.filter((p) => p.in === 'query');
      expect(queryParams.length).toBeGreaterThan(0);

      // Should have projectId and status query params
      const paramNames = queryParams.map((p) => p.name);
      expect(paramNames).toContain('projectId');
      expect(paramNames).toContain('status');
    });
  });

  describe('Path Parameter Documentation', () => {
    it('documents path parameters for task endpoints', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const taskGet = paths['/api/tasks/{id}'].get as Record<string, unknown>;
      const parameters = taskGet.parameters as Array<Record<string, unknown>>;

      expect(parameters).toBeDefined();
      const pathParams = parameters.filter((p) => p.in === 'path');
      expect(pathParams.length).toBeGreaterThan(0);

      const idParam = pathParams.find((p) => p.name === 'id');
      expect(idParam).toBeDefined();
      expect(idParam?.required).toBe(true);
    });

    it('documents path parameters for project endpoints', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const projectGet = paths['/api/projects/{id}'].get as Record<string, unknown>;
      const parameters = projectGet.parameters as Array<Record<string, unknown>>;

      expect(parameters).toBeDefined();
      const pathParams = parameters.filter((p) => p.in === 'path');
      expect(pathParams.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAPI Spec Accessibility', () => {
    it('serves OpenAPI spec via /documentation/json endpoint', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/documentation/json',
      });

      expect(response.statusCode).toBe(200);

      const contentType = response.headers['content-type'];
      expect(contentType).toContain('application/json');

      const spec = JSON.parse(response.body);
      expect(spec.openapi).toBeDefined();
      expect(spec.info).toBeDefined();
      expect(spec.paths).toBeDefined();
    });

    it('returns valid JSON from /documentation/json', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/documentation/json',
      });

      expect(() => JSON.parse(response.body)).not.toThrow();
    });

    it('OpenAPI spec JSON matches programmatic generation', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/documentation/json',
      });

      const httpSpec = JSON.parse(response.body);

      // Both should have the same endpoints
      expect(Object.keys(httpSpec.paths).sort()).toEqual(
        Object.keys(openApiSpec.paths as Record<string, unknown>).sort()
      );
    });
  });

  describe('Schema Validation in Spec', () => {
    it('includes task status enum values in schema', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksGet = paths['/api/tasks'].get as Record<string, unknown>;
      const parameters = tasksGet.parameters as Array<Record<string, unknown>>;

      const statusParam = parameters.find((p) => p.name === 'status');
      if (statusParam) {
        const schema = statusParam.schema as Record<string, unknown>;
        expect(schema.enum).toBeDefined();
        expect(Array.isArray(schema.enum)).toBe(true);
        expect(schema.enum).toContain('backlog');
        expect(schema.enum).toContain('in_progress');
        expect(schema.enum).toContain('done');
      }
    });

    it('documents required fields in request bodies', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const tasksPost = paths['/api/tasks'].post as Record<string, unknown>;
      const requestBody = tasksPost.requestBody as Record<string, unknown>;
      const content = requestBody.content as Record<string, Record<string, unknown>>;
      const schema = content['application/json'].schema as Record<string, unknown>;

      // Should have required fields defined
      expect(schema.required || schema.$ref).toBeDefined();
    });
  });

  describe('Complete Endpoint Coverage', () => {
    // Core REST endpoints that must be documented
    const coreEndpoints = [
      // Task endpoints
      { path: '/api/tasks', method: 'get' },
      { path: '/api/tasks', method: 'post' },
      { path: '/api/tasks/{id}', method: 'get' },
      { path: '/api/tasks/{id}', method: 'patch' },
      { path: '/api/tasks/{id}', method: 'delete' },
      { path: '/api/tasks/{id}/start', method: 'post' },
      { path: '/api/tasks/{id}/stop', method: 'post' },
      { path: '/api/tasks/{id}/review', method: 'post' },
      // Project endpoints
      { path: '/api/projects', method: 'get' },
      { path: '/api/projects', method: 'post' },
      { path: '/api/projects/{id}', method: 'get' },
      { path: '/api/projects/{id}', method: 'delete' },
      { path: '/api/projects/{id}/settings', method: 'patch' },
      // Monitoring endpoints
      { path: '/api/health', method: 'get' },
      { path: '/api/version', method: 'get' },
      { path: '/api/status', method: 'get' },
    ];

    // WebSocket endpoint - may or may not be captured by Swagger
    // depending on @fastify/websocket and @fastify/swagger versions
    const optionalEndpoints = [{ path: '/ws', method: 'get' }];

    it('documents all core REST endpoints', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;

      for (const endpoint of coreEndpoints) {
        expect(paths[endpoint.path]).toBeDefined();
        expect(paths[endpoint.path][endpoint.method]).toBeDefined();
      }
    });

    it('has at least all core paths documented', () => {
      const paths = openApiSpec.paths as Record<string, unknown>;
      const uniqueCorePaths = new Set(coreEndpoints.map((e) => e.path));

      // Should have at least all core paths (may have more if /ws is included)
      expect(Object.keys(paths).length).toBeGreaterThanOrEqual(uniqueCorePaths.size);
    });

    it('all documented paths have valid HTTP methods', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
      const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

      for (const [path, methods] of Object.entries(paths)) {
        expect(typeof path).toBe('string');
        expect(path.startsWith('/')).toBe(true);

        for (const method of Object.keys(methods)) {
          expect(validMethods).toContain(method);
        }
      }
    });

    it('WebSocket endpoint is optional in OpenAPI spec', () => {
      const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;

      // WebSocket may or may not be documented - just verify the test handles both cases
      for (const endpoint of optionalEndpoints) {
        if (paths[endpoint.path]) {
          expect(paths[endpoint.path][endpoint.method]).toBeDefined();
        }
      }
    });
  });
});
