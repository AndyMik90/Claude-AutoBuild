import { ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { DokployApiRequest, DokployApiResponse, AppSettings, DokployAccount, DokployProjectDeployment } from '../../shared/types';
import { readSettingsFile } from '../settings-utils';
import { parseEnvFile } from './utils';

const DEPLOYMENT_FILE = '.dokploy.json';

/**
 * Make a request to the Dokploy API
 */
async function makeDokployRequest<T>(
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  query?: Record<string, string>
): Promise<DokployApiResponse<T>> {
  try {
    // Build URL - Dokploy uses TRPC format
    // baseUrl should be like https://dokploy.example.com/api
    let url = `${baseUrl}/${endpoint}`;

    // For GET requests with TRPC, we need to pass input as JSON in query string
    if (method === 'GET') {
      const input = query && Object.keys(query).length > 0 ? query : {};
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    };

    if (method === 'POST' && body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API error: ${response.status} - ${errorText}`
      };
    }

    const responseData = await response.json();
    // TRPC returns data in { result: { data: ... } } format for queries
    // or just the data directly for mutations
    const data = responseData?.result?.data ?? responseData;
    return {
      success: true,
      data: data as T
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed'
    };
  }
}

/**
 * Read environment variables from env files at a given path
 * Checks multiple common env file names
 */
function readEnvFile(servicePath: string): Record<string, string> {
  console.log('[Dokploy Backend] readEnvFile called with:', servicePath);

  // Common env file names to check (in priority order)
  const envFileNames = ['.env', '.env.local', '.env.development', '.env.production'];
  let allEnvVars: Record<string, string> = {};

  for (const fileName of envFileNames) {
    const envPath = path.join(servicePath, fileName);
    console.log('[Dokploy Backend] Checking:', envPath, 'exists:', existsSync(envPath));

    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8');
        console.log(`[Dokploy Backend] Found ${fileName}, length:`, content.length);
        const parsed = parseEnvFile(content);
        console.log(`[Dokploy Backend] Parsed from ${fileName}:`, Object.keys(parsed));
        // Merge (earlier files take precedence)
        allEnvVars = { ...parsed, ...allEnvVars };
      } catch (err) {
        console.error(`[Dokploy Backend] Error reading ${fileName}:`, err);
      }
    }
  }

  console.log('[Dokploy Backend] Total env vars found:', Object.keys(allEnvVars));
  return allEnvVars;
}

/**
 * Register Dokploy-related IPC handlers
 */
export function registerDokployHandlers(): void {
  // Main Dokploy API handler
  ipcMain.handle(
    IPC_CHANNELS.DOKPLOY_API,
    async (_, request: DokployApiRequest): Promise<DokployApiResponse<unknown>> => {
      try {
        // Get settings to find the Dokploy account
        const settings = readSettingsFile() as unknown as AppSettings;
        const dokployAccounts: DokployAccount[] = settings?.deploymentProviders?.dokploy || [];

        // Find the account by ID
        const account = dokployAccounts.find((a: DokployAccount) => a.id === request.accountId);
        if (!account) {
          return {
            success: false,
            error: 'Dokploy account not found'
          };
        }

        // Make the API request
        return await makeDokployRequest(
          account.baseUrl,
          account.apiKey,
          request.endpoint,
          request.method,
          request.body,
          request.query
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // Read env variables from a service path
  ipcMain.handle(
    IPC_CHANNELS.DOKPLOY_READ_ENV,
    async (_, servicePath: string): Promise<DokployApiResponse<Record<string, string>>> => {
      try {
        const envVars = readEnvFile(servicePath);
        return { success: true, data: envVars };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read env file'
        };
      }
    }
  );

  // Save deployment info to project directory
  ipcMain.handle(
    IPC_CHANNELS.DOKPLOY_SAVE_DEPLOYMENT,
    async (_, projectPath: string, deployment: DokployProjectDeployment): Promise<DokployApiResponse<void>> => {
      try {
        const filePath = path.join(projectPath, DEPLOYMENT_FILE);
        writeFileSync(filePath, JSON.stringify(deployment, null, 2), 'utf-8');
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save deployment info'
        };
      }
    }
  );

  // Get deployment info from project directory
  ipcMain.handle(
    IPC_CHANNELS.DOKPLOY_GET_DEPLOYMENT,
    async (_, projectPath: string): Promise<DokployApiResponse<DokployProjectDeployment | null>> => {
      try {
        const filePath = path.join(projectPath, DEPLOYMENT_FILE);
        if (!existsSync(filePath)) {
          return { success: true, data: null };
        }
        const content = readFileSync(filePath, 'utf-8');
        const deployment = JSON.parse(content) as DokployProjectDeployment;
        return { success: true, data: deployment };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read deployment info'
        };
      }
    }
  );

  // Delete deployment info from project directory
  ipcMain.handle(
    IPC_CHANNELS.DOKPLOY_DELETE_DEPLOYMENT,
    async (_, projectPath: string): Promise<DokployApiResponse<void>> => {
      try {
        const filePath = path.join(projectPath, DEPLOYMENT_FILE);
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete deployment info'
        };
      }
    }
  );
}
