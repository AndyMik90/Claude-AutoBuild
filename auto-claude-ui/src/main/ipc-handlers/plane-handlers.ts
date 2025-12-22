import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, getSpecsDir, AUTO_BUILD_PATHS } from '../../shared/constants';
import type {
  IPCResult,
  PlaneWorkItem,
  PlaneProject,
  PlaneState,
  PlaneImportResult,
  PlaneSyncStatus,
  Project,
  TaskMetadata
} from '../../shared/types';
import path from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { projectStore } from '../project-store';
import { parseEnvFile } from './utils';

import { AgentManager } from '../agent';

/**
 * Plane.so REST API configuration
 */
interface PlaneConfig {
  apiKey: string;
  baseUrl: string;
  workspaceSlug?: string;
}

/**
 * Register all Plane-related IPC handlers
 */
export function registerPlaneHandlers(
  _agentManager: AgentManager,
  _getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Plane Integration Operations
  // ============================================

  /**
   * Helper to get Plane config from project env
   */
  const getPlaneConfig = (project: Project): PlaneConfig | null => {
    if (!project.autoBuildPath) return null;
    const envPath = path.join(project.path, project.autoBuildPath, '.env');
    if (!existsSync(envPath)) return null;

    try {
      const content = readFileSync(envPath, 'utf-8');
      const vars = parseEnvFile(content);
      const apiKey = vars['PLANE_API_KEY'];
      if (!apiKey) return null;

      return {
        apiKey,
        baseUrl: vars['PLANE_BASE_URL'] || 'https://api.plane.so',
        workspaceSlug: vars['PLANE_WORKSPACE_SLUG']
      };
    } catch {
      return null;
    }
  };

  /**
   * Make a request to the Plane API
   */
  const planeAPI = async <T>(
    config: PlaneConfig,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> => {
    const url = `${config.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded (60 req/min)');
    }

    if (response.status === 401) {
      throw new Error('Invalid API key');
    }

    if (response.status === 404) {
      throw new Error(`Resource not found: ${endpoint}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Plane API error: ${response.status} - ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  };

  // Check Plane connection
  ipcMain.handle(
    IPC_CHANNELS.PLANE_CHECK_CONNECTION,
    async (_, projectId: string): Promise<IPCResult<PlaneSyncStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getPlaneConfig(project);
      if (!config) {
        return {
          success: true,
          data: {
            connected: false,
            error: 'No Plane API key configured'
          }
        };
      }

      if (!config.workspaceSlug) {
        return {
          success: true,
          data: {
            connected: false,
            error: 'No workspace slug configured (PLANE_WORKSPACE_SLUG)'
          }
        };
      }

      try {
        // Test connection by listing projects
        const data = await planeAPI<{ results?: PlaneProject[] }>(
          config,
          'GET',
          `/api/v1/workspaces/${config.workspaceSlug}/projects/`
        );

        const projects = data.results || (Array.isArray(data) ? data : []);

        return {
          success: true,
          data: {
            connected: true,
            workspaceSlug: config.workspaceSlug,
            projectCount: projects.length
          }
        };
      } catch (error) {
        return {
          success: true,
          data: {
            connected: false,
            error: error instanceof Error ? error.message : 'Failed to connect to Plane'
          }
        };
      }
    }
  );

  // Get list of projects that have Plane configured (for "copy from" feature)
  ipcMain.handle(
    IPC_CHANNELS.PLANE_GET_CONFIGURED_PROJECTS,
    async (_, excludeProjectId?: string): Promise<IPCResult<Array<{
      id: string;
      name: string;
      planeApiKey: string;
      planeBaseUrl?: string;
      planeWorkspaceSlug?: string;
    }>>> => {
      const allProjects = projectStore.getProjects();
      const configuredProjects: Array<{
        id: string;
        name: string;
        planeApiKey: string;
        planeBaseUrl?: string;
        planeWorkspaceSlug?: string;
      }> = [];

      for (const project of allProjects) {
        // Skip the current project if specified
        if (excludeProjectId && project.id === excludeProjectId) {
          continue;
        }

        const config = getPlaneConfig(project);
        if (config?.apiKey) {
          configuredProjects.push({
            id: project.id,
            name: project.name,
            planeApiKey: config.apiKey,
            planeBaseUrl: config.baseUrl,
            planeWorkspaceSlug: config.workspaceSlug
          });
        }
      }

      return { success: true, data: configuredProjects };
    }
  );

  // Get projects
  ipcMain.handle(
    IPC_CHANNELS.PLANE_GET_PROJECTS,
    async (_, projectId: string, workspaceSlug?: string): Promise<IPCResult<PlaneProject[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getPlaneConfig(project);
      if (!config) {
        return { success: false, error: 'No Plane API key configured' };
      }

      const slug = workspaceSlug || config.workspaceSlug;
      if (!slug) {
        return { success: false, error: 'No workspace slug provided' };
      }

      try {
        const data = await planeAPI<{ results?: PlaneProject[] }>(
          config,
          'GET',
          `/api/v1/workspaces/${slug}/projects/`
        );

        const projects = data.results || (Array.isArray(data) ? data : []);
        return { success: true, data: projects };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch projects'
        };
      }
    }
  );

  // Get work items
  ipcMain.handle(
    IPC_CHANNELS.PLANE_GET_WORK_ITEMS,
    async (
      _,
      projectId: string,
      workspaceSlug: string,
      planeProjectId: string
    ): Promise<IPCResult<PlaneWorkItem[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getPlaneConfig(project);
      if (!config) {
        return { success: false, error: 'No Plane API key configured' };
      }

      try {
        // Fetch all work items with pagination support
        const allWorkItems: PlaneWorkItem[] = [];
        let page = 1;
        let hasMore = true;
        const perPage = 100;

        while (hasMore) {
          const data = await planeAPI<{ results?: PlaneWorkItem[]; next?: string }>(
            config,
            'GET',
            `/api/v1/workspaces/${workspaceSlug}/projects/${planeProjectId}/work-items/?expand=state,labels,assignees,project&per_page=${perPage}&page=${page}`
          );

          const workItems = data.results || (Array.isArray(data) ? data : []);
          allWorkItems.push(...workItems);

          // Stop if we got fewer than perPage (last page) or no next link
          hasMore = workItems.length === perPage && !!data.next;
          page++;

          // Safety limit to prevent infinite loops
          if (page > 50) {
            console.warn('[Plane] Hit pagination safety limit (5000 items)');
            break;
          }
        }

        console.log('[Plane] Fetched work items:', allWorkItems.length);
        if (allWorkItems.length > 0) {
          console.log('[Plane] Sample work item state field:', allWorkItems[0].state);
          console.log('[Plane] Sample work item state_detail:', JSON.stringify(allWorkItems[0].state_detail, null, 2));
        }
        return { success: true, data: allWorkItems };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch work items'
        };
      }
    }
  );

  // Get states
  ipcMain.handle(
    IPC_CHANNELS.PLANE_GET_STATES,
    async (
      _,
      projectId: string,
      workspaceSlug: string,
      planeProjectId: string
    ): Promise<IPCResult<PlaneState[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getPlaneConfig(project);
      if (!config) {
        return { success: false, error: 'No Plane API key configured' };
      }

      try {
        const data = await planeAPI<{ results?: PlaneState[] }>(
          config,
          'GET',
          `/api/v1/workspaces/${workspaceSlug}/projects/${planeProjectId}/states/`
        );

        const states = data.results || (Array.isArray(data) ? data : []);
        console.log('[Plane] Fetched states:', states.length, 'states');
        if (states.length > 0) {
          console.log('[Plane] Sample state:', JSON.stringify(states[0], null, 2));
        }
        return { success: true, data: states };
      } catch (error) {
        console.error('[Plane] Failed to fetch states:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch states'
        };
      }
    }
  );

  // Import work items as specs
  ipcMain.handle(
    IPC_CHANNELS.PLANE_IMPORT_WORK_ITEMS,
    async (
      _,
      projectId: string,
      workItemIds: string[],
      workspaceSlug: string,
      planeProjectId: string,
      planeProjectIdentifier: string
    ): Promise<IPCResult<PlaneImportResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getPlaneConfig(project);
      if (!config) {
        return { success: false, error: 'No Plane API key configured' };
      }

      // Validate required parameters
      if (!workspaceSlug) {
        return { success: false, error: 'No workspace slug provided' };
      }
      if (!planeProjectId) {
        return { success: false, error: 'No Plane project selected' };
      }
      if (!workItemIds || workItemIds.length === 0) {
        return { success: false, error: 'No work items selected for import' };
      }

      console.warn(`[Plane] Importing ${workItemIds.length} work items from ${workspaceSlug}/${planeProjectId}`);

      try {
        let imported = 0;
        let failed = 0;
        const errors: string[] = [];

        // Set up specs directory
        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specsDir = path.join(project.path, specsBaseDir);
        if (!existsSync(specsDir)) {
          mkdirSync(specsDir, { recursive: true });
        }

        // Fetch each work item and create a spec
        for (const workItemId of workItemIds) {
          try {
            // Fetch work item details
            const workItem = await planeAPI<PlaneWorkItem>(
              config,
              'GET',
              `/api/v1/workspaces/${workspaceSlug}/projects/${planeProjectId}/work-items/${workItemId}/?expand=state,project`
            );

            // Get project identifier for display (e.g., "PLAT-25")
            // Use the identifier passed from UI, fall back to API response, then 'PLANE'
            const projectIdentifier = planeProjectIdentifier || workItem.project_detail?.identifier || 'PLANE';
            const identifier = `${projectIdentifier}-${workItem.sequence_id}`;

            // Task title: "PLAT-25 - Fix login bug"
            const taskTitle = `${identifier} - ${workItem.name}`;

            // Description: Just the work item description
            const description = workItem.description_stripped || workItem.description_html || 'No description provided.';

            // Create spec ID with slugified title
            const slugifiedTitle = workItem.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 50) || 'untitled';  // Fallback for empty titles

            // Find next available spec number with retry to handle race conditions
            let specDir = '';
            let specId = '';
            let attempts = 0;
            const maxAttempts = 10;

            while (attempts < maxAttempts) {
              attempts++;
              const existingDirs = readdirSync(specsDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
              const existingNumbers = existingDirs
                .map(name => {
                  const match = name.match(/^(\d+)/);
                  return match ? parseInt(match[1], 10) : 0;
                })
                .filter(n => n > 0);
              const specNumber = existingNumbers.length > 0
                ? Math.max(...existingNumbers) + 1
                : 1;

              specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;
              specDir = path.join(specsDir, specId);

              // Try to create directory - if it fails due to existing dir, retry with next number
              try {
                mkdirSync(specDir, { recursive: false });
                break;  // Success - directory created
              } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
                  // Directory already exists (race condition), retry
                  continue;
                }
                throw err;  // Other error, propagate
              }
            }

            if (attempts >= maxAttempts) {
              throw new Error(`Failed to create unique spec directory after ${maxAttempts} attempts`);
            }

            // Create initial implementation_plan.json
            const now = new Date().toISOString();
            const implementationPlan = {
              feature: taskTitle,
              description: description,
              created_at: now,
              updated_at: now,
              status: 'pending',
              phases: []
            };
            writeFileSync(
              path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN),
              JSON.stringify(implementationPlan, null, 2)
            );

            // Create requirements.json
            const requirements = {
              task_description: description,
              workflow_type: 'feature'
            };
            writeFileSync(
              path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS),
              JSON.stringify(requirements, null, 2)
            );

            // Build metadata
            const metadata: TaskMetadata = {
              sourceType: 'plane',
              planeWorkItemId: workItem.id,
              planeIdentifier: identifier,
              planeWorkspaceSlug: workspaceSlug,
              planeProjectId: planeProjectId,
              category: 'feature'
            };
            writeFileSync(
              path.join(specDir, 'task_metadata.json'),
              JSON.stringify(metadata, null, 2)
            );

            // NOTE: We intentionally do NOT call agentManager.startSpecCreation() here
            // This allows the task to stay in "backlog" status until the user manually starts it
            // The task files are created, but the AI agent is not started automatically

            imported++;
          } catch (err) {
            failed++;
            errors.push(
              `Failed to import ${workItemId}: ${err instanceof Error ? err.message : 'Unknown error'}`
            );
          }
        }

        console.warn(`[Plane] Import complete: ${imported} imported, ${failed} failed`);

        return {
          success: true,
          data: {
            success: failed === 0,
            imported,
            failed,
            errors: errors.length > 0 ? errors : undefined
          }
        };
      } catch (error) {
        console.error('[Plane] Import error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to import work items'
        };
      }
    }
  );
}
