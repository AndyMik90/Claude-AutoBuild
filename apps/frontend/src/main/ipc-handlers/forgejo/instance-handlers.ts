/**
 * Forgejo instance management handlers
 * Handles adding, removing, and testing Forgejo instances
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, ForgejoInstance, ForgejoSyncStatus } from '../../../shared/types';
import {
  loadForgejoInstances,
  saveForgejoInstances,
  forgejoFetch,
  generateInstanceId,
  debugLog,
} from './utils';
import type { ForgejoInstanceConfig, ForgejoAPIUser } from './types';

/**
 * Get all configured Forgejo instances
 */
export function registerGetInstances(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_GET_INSTANCES,
    async (): Promise<IPCResult<ForgejoInstance[]>> => {
      debugLog('getForgejoInstances handler called');

      try {
        const instances = loadForgejoInstances();
        const result: ForgejoInstance[] = instances.map(inst => ({
          id: inst.id,
          name: inst.name,
          url: inst.url,
          connected: inst.connected,
          lastSyncedAt: inst.lastSyncedAt,
        }));

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load instances';
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Add a new Forgejo instance
 */
export function registerAddInstance(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_ADD_INSTANCE,
    async (
      _event,
      name: string,
      url: string,
      token: string
    ): Promise<IPCResult<ForgejoInstance>> => {
      debugLog('addForgejoInstance handler called', { name, url });

      try {
        // Validate by testing the connection
        const normalizedUrl = url.replace(/\/$/, '');
        await forgejoFetch(token, normalizedUrl, '/user') as ForgejoAPIUser;

        const instances = loadForgejoInstances();

        // Check for duplicate URL
        if (instances.some(i => i.url === normalizedUrl)) {
          return { success: false, error: 'An instance with this URL already exists' };
        }

        const newInstance: ForgejoInstanceConfig = {
          id: generateInstanceId(),
          name,
          url: normalizedUrl,
          token,
          connected: true,
          lastSyncedAt: new Date().toISOString(),
        };

        instances.push(newInstance);
        saveForgejoInstances(instances);

        return {
          success: true,
          data: {
            id: newInstance.id,
            name: newInstance.name,
            url: newInstance.url,
            connected: newInstance.connected,
            lastSyncedAt: newInstance.lastSyncedAt,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add instance';
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Remove a Forgejo instance
 */
export function registerRemoveInstance(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_REMOVE_INSTANCE,
    async (_event, instanceId: string): Promise<IPCResult<void>> => {
      debugLog('removeForgejoInstance handler called', { instanceId });

      try {
        const instances = loadForgejoInstances();
        const index = instances.findIndex(i => i.id === instanceId);

        if (index === -1) {
          return { success: false, error: 'Instance not found' };
        }

        instances.splice(index, 1);
        saveForgejoInstances(instances);

        return { success: true, data: undefined };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to remove instance';
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Update a Forgejo instance
 */
export function registerUpdateInstance(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_UPDATE_INSTANCE,
    async (
      _event,
      instanceId: string,
      name: string,
      url: string,
      token: string
    ): Promise<IPCResult<ForgejoInstance>> => {
      debugLog('updateForgejoInstance handler called', { instanceId, name, url });

      try {
        const instances = loadForgejoInstances();
        const instance = instances.find(i => i.id === instanceId);

        if (!instance) {
          return { success: false, error: 'Instance not found' };
        }

        // Validate by testing the connection
        const normalizedUrl = url.replace(/\/$/, '');
        await forgejoFetch(token, normalizedUrl, '/user') as ForgejoAPIUser;

        instance.name = name;
        instance.url = normalizedUrl;
        instance.token = token;
        instance.connected = true;
        instance.lastSyncedAt = new Date().toISOString();

        saveForgejoInstances(instances);

        return {
          success: true,
          data: {
            id: instance.id,
            name: instance.name,
            url: instance.url,
            connected: instance.connected,
            lastSyncedAt: instance.lastSyncedAt,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update instance';
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Test connection to a Forgejo instance
 */
export function registerTestConnection(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_TEST_CONNECTION,
    async (_event, instanceId: string): Promise<IPCResult<ForgejoSyncStatus>> => {
      debugLog('testForgejoConnection handler called', { instanceId });

      try {
        const instances = loadForgejoInstances();
        const instance = instances.find(i => i.id === instanceId);

        if (!instance) {
          return { success: false, error: 'Instance not found' };
        }

        try {
          // Verify connection by fetching user info
          await forgejoFetch(instance.token, instance.url, '/user') as ForgejoAPIUser;

          // Update instance status
          instance.connected = true;
          instance.lastSyncedAt = new Date().toISOString();
          saveForgejoInstances(instances);

          return {
            success: true,
            data: {
              connected: true,
              instanceUrl: instance.url,
              instanceName: instance.name,
              lastSyncedAt: instance.lastSyncedAt,
            },
          };
        } catch (error) {
          // Update instance status to disconnected
          instance.connected = false;
          saveForgejoInstances(instances);

          const errorMessage = error instanceof Error ? error.message : 'Connection failed';
          return {
            success: true,
            data: {
              connected: false,
              instanceUrl: instance.url,
              instanceName: instance.name,
              error: errorMessage,
            },
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to test connection';
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Register all instance management handlers
 */
export function registerInstanceHandlers(): void {
  registerGetInstances();
  registerAddInstance();
  registerRemoveInstance();
  registerUpdateInstance();
  registerTestConnection();
}
