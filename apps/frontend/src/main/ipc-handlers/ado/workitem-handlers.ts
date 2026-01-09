/**
 * Azure DevOps work item (issue) IPC handlers
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { projectStore } from '../../project-store';
import {
  getADOConfig,
  adoFetch,
  adoPatch,
  sanitizeWiqlString,
  normalizeWorkItemState,
} from './utils';
import type { ADOAPIWorkItem, ADOAPIComment, ADOWorkItem } from './types';

/**
 * Transform ADO API work item to application format
 */
function transformWorkItem(wi: ADOAPIWorkItem, config: { instanceUrl: string; organization: string; project: string }): ADOWorkItem {
  const fields = wi.fields;
  const state = normalizeWorkItemState(fields['System.State']);

  const assignedTo = fields['System.AssignedTo'];
  const createdBy = fields['System.CreatedBy'];

  return {
    id: wi.id,
    number: wi.id, // Alias for compatibility
    title: fields['System.Title'],
    body: fields['System.Description'],
    state,
    workItemType: fields['System.WorkItemType'],
    tags: (fields['System.Tags'] || '').split(';').map(t => t.trim()).filter(Boolean),
    assignees: assignedTo
      ? [{
          login: assignedTo.uniqueName,
          displayName: assignedTo.displayName,
          avatarUrl: assignedTo.imageUrl,
        }]
      : [],
    author: {
      login: createdBy.uniqueName,
      displayName: createdBy.displayName,
      avatarUrl: createdBy.imageUrl,
    },
    priority: fields['Microsoft.VSTS.Common.Priority'],
    iteration: fields['System.IterationPath'],
    areaPath: fields['System.AreaPath'],
    createdAt: fields['System.CreatedDate'],
    updatedAt: fields['System.ChangedDate'],
    closedAt: state === 'closed' ? fields['System.ChangedDate'] : undefined,
    url: wi.url,
    htmlUrl: wi._links?.html?.href || `${config.instanceUrl}/${config.organization}/${config.project}/_workitems/edit/${wi.id}`,
  };
}

/**
 * Check ADO connection (using saved project config)
 */
export function registerCheckConnection(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_CHECK_CONNECTION,
    async (_, projectId: string): Promise<IPCResult<boolean>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found. Set ADO_ORGANIZATION, ADO_PROJECT, and ADO_PAT in .env' };
      }

      try {
        // Test connection by fetching project info
        await adoFetch(config, '/projects');
        return { success: true, data: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to connect to Azure DevOps',
        };
      }
    }
  );
}

/**
 * Test ADO connection with provided credentials (before saving)
 */
export function registerTestConnection(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_TEST_CONNECTION,
    async (
      _,
      credentials: {
        organization: string;
        project: string;
        repoName: string;
        pat: string;
        instanceUrl: string;
      }
    ): Promise<IPCResult<boolean>> => {
      if (!credentials.organization || !credentials.project || !credentials.pat) {
        return { success: false, error: 'Organization, project, and PAT are required' };
      }

      // Build config from provided credentials
      const config = {
        organization: credentials.organization,
        project: credentials.project,
        repoName: credentials.repoName || credentials.project,
        pat: credentials.pat,
        instanceUrl: credentials.instanceUrl || 'https://dev.azure.com',
      };

      try {
        // Test connection by fetching project info
        await adoFetch(config, '/projects');
        return { success: true, data: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to connect to Azure DevOps',
        };
      }
    }
  );
}

/**
 * Get list of work items from project
 */
export function registerGetWorkItems(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_GET_WORK_ITEMS,
    async (_, projectId: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<IPCResult<ADOWorkItem[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        // Build WIQL query
        const projectSafe = sanitizeWiqlString(config.project);
        let stateCondition = '';
        if (state === 'open') {
          stateCondition = "AND ([System.State] = 'New' OR [System.State] = 'Active')";
        } else if (state === 'closed') {
          stateCondition = "AND ([System.State] = 'Closed' OR [System.State] = 'Resolved' OR [System.State] = 'Done')";
        }

        const wiqlQuery = {
          query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectSafe}' ${stateCondition} ORDER BY [System.ChangedDate] DESC`,
        };

        const queryResult = await adoFetch(config, '/wit/wiql', {
          method: 'POST',
          body: JSON.stringify(wiqlQuery),
        }) as { workItems?: Array<{ id: number }> };

        if (!queryResult.workItems || queryResult.workItems.length === 0) {
          return { success: true, data: [] };
        }

        // Fetch full work item details (batch, max 200)
        const ids = queryResult.workItems.slice(0, 200).map(wi => wi.id);
        const workItemsResult = await adoFetch(
          config,
          `/wit/workitems?ids=${ids.join(',')}&$expand=All`
        ) as { value: ADOAPIWorkItem[] };

        const result: ADOWorkItem[] = workItemsResult.value.map(wi =>
          transformWorkItem(wi, config)
        );

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch work items',
        };
      }
    }
  );
}

/**
 * Get a single work item by ID
 */
export function registerGetWorkItem(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_GET_WORK_ITEM,
    async (_, projectId: string, workItemId: number): Promise<IPCResult<ADOWorkItem>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        const wi = await adoFetch(
          config,
          `/wit/workitems/${workItemId}?$expand=All`
        ) as ADOAPIWorkItem;

        const result = transformWorkItem(wi, config);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch work item',
        };
      }
    }
  );
}

/**
 * Get comments for a work item
 */
export function registerGetWorkItemComments(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_GET_WORK_ITEM_COMMENTS,
    async (_, projectId: string, workItemId: number): Promise<IPCResult<ADOAPIComment[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        const commentsResult = await adoFetch(
          config,
          `/wit/workitems/${workItemId}/comments`
        ) as { comments: ADOAPIComment[] };

        return { success: true, data: commentsResult.comments || [] };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch work item comments',
        };
      }
    }
  );
}

/**
 * Create a new work item
 */
export function registerCreateWorkItem(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_CREATE_WORK_ITEM,
    async (
      _,
      projectId: string,
      workItemType: string,
      title: string,
      body?: string,
      tags?: string[]
    ): Promise<IPCResult<ADOWorkItem>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        const operations = [
          { op: 'add', path: '/fields/System.Title', value: title },
        ];

        if (body) {
          operations.push({ op: 'add', path: '/fields/System.Description', value: body });
        }

        if (tags && tags.length > 0) {
          operations.push({ op: 'add', path: '/fields/System.Tags', value: tags.join('; ') });
        }

        const wi = await adoPatch(
          config,
          `/wit/workitems/$${encodeURIComponent(workItemType)}`,
          operations
        ) as ADOAPIWorkItem;

        const result = transformWorkItem(wi, config);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create work item',
        };
      }
    }
  );
}

/**
 * Update a work item
 */
export function registerUpdateWorkItem(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADO_UPDATE_WORK_ITEM,
    async (
      _,
      projectId: string,
      workItemId: number,
      updates: { title?: string; body?: string; state?: string; tags?: string[] }
    ): Promise<IPCResult<ADOWorkItem>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getADOConfig(project);
      if (!config) {
        return { success: false, error: 'No Azure DevOps configuration found' };
      }

      try {
        const operations: Array<{ op: string; path: string; value?: unknown }> = [];

        if (updates.title !== undefined) {
          operations.push({ op: 'replace', path: '/fields/System.Title', value: updates.title });
        }
        if (updates.body !== undefined) {
          operations.push({ op: 'replace', path: '/fields/System.Description', value: updates.body });
        }
        if (updates.state !== undefined) {
          operations.push({ op: 'replace', path: '/fields/System.State', value: updates.state });
        }
        if (updates.tags !== undefined) {
          operations.push({ op: 'replace', path: '/fields/System.Tags', value: updates.tags.join('; ') });
        }

        if (operations.length === 0) {
          return { success: false, error: 'No updates provided' };
        }

        const wi = await adoPatch(
          config,
          `/wit/workitems/${workItemId}`,
          operations
        ) as ADOAPIWorkItem;

        const result = transformWorkItem(wi, config);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update work item',
        };
      }
    }
  );
}

/**
 * Register all work item handlers
 */
export function registerWorkItemHandlers(): void {
  registerCheckConnection();
  registerTestConnection();
  registerGetWorkItems();
  registerGetWorkItem();
  registerGetWorkItemComments();
  registerCreateWorkItem();
  registerUpdateWorkItem();
}
