import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { IPC_CHANNELS, getSpecsDir, AUTO_BUILD_PATHS } from '../../../shared/constants';
import type { IPCResult, GraphitiMemoryStatus, GraphitiMemoryState } from '../../../shared/types';
import { projectStore } from '../../project-store';
import {
  loadProjectEnvVars,
  loadGlobalSettings,
  isGraphitiEnabled,
  hasProviderCredentials,
  getRequiredProviders,
  getProviderEnvVarName,
  getGraphitiConnectionDetails
} from './utils';
import type { GraphitiLLMProvider, GraphitiEmbeddingProvider } from '../../../shared/types/project';

/**
 * Load Graphiti state from most recent spec directory
 */
export function loadGraphitiStateFromSpecs(
  projectPath: string,
  autoBuildPath?: string
): GraphitiMemoryState | null {
  if (!autoBuildPath) return null;

  const specsBaseDir = getSpecsDir(autoBuildPath);
  const specsDir = path.join(projectPath, specsBaseDir);

  if (!existsSync(specsDir)) {
    return null;
  }

  const specDirs = readdirSync(specsDir)
    .filter((f: string) => {
      const specPath = path.join(specsDir, f);
      return statSync(specPath).isDirectory();
    })
    .sort()
    .reverse();

  for (const specDir of specDirs) {
    const statePath = path.join(specsDir, specDir, AUTO_BUILD_PATHS.GRAPHITI_STATE);
    if (existsSync(statePath)) {
      try {
        const stateContent = readFileSync(statePath, 'utf-8');
        return JSON.parse(stateContent);
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Build memory status from environment configuration
 */
export function buildMemoryStatus(
  projectPath: string,
  autoBuildPath?: string,
  memoryState?: GraphitiMemoryState | null
): GraphitiMemoryStatus {
  const projectEnvVars = loadProjectEnvVars(projectPath, autoBuildPath);
  const globalSettings = loadGlobalSettings();

  // If we have initialized state from specs, use it
  if (memoryState?.initialized) {
    const connDetails = getGraphitiConnectionDetails(projectEnvVars);
    return {
      enabled: true,
      available: true,
      database: memoryState.database || 'auto_claude_memory',
      host: connDetails.host,
      port: connDetails.port
    };
  }

  // Check environment configuration
  const graphitiEnabled = isGraphitiEnabled(projectEnvVars);

  if (!graphitiEnabled) {
    return {
      enabled: false,
      available: false,
      reason: 'Graphiti not configured'
    };
  }

  // Get selected providers from env vars, defaulting to 'openai' for backward compatibility
  const llmProvider = (projectEnvVars['GRAPHITI_LLM_PROVIDER'] ||
                       process.env.GRAPHITI_LLM_PROVIDER ||
                       'openai') as GraphitiLLMProvider;
  const embeddingProvider = (projectEnvVars['GRAPHITI_EMBEDDER_PROVIDER'] ||
                             process.env.GRAPHITI_EMBEDDER_PROVIDER ||
                             'openai') as GraphitiEmbeddingProvider;

  // Get unique providers that require credentials
  const requiredProviders = getRequiredProviders(llmProvider, embeddingProvider);

  // Check credentials for each required provider
  for (const provider of requiredProviders) {
    if (!hasProviderCredentials(provider, projectEnvVars, globalSettings)) {
      const envVarName = getProviderEnvVarName(provider) || `${provider.toUpperCase()}_API_KEY`;
      return {
        enabled: true,
        available: false,
        reason: `${envVarName} not set (required for ${provider} provider)`
      };
    }
  }

  const connDetails = getGraphitiConnectionDetails(projectEnvVars);
  return {
    enabled: true,
    available: true,
    host: connDetails.host,
    port: connDetails.port,
    database: connDetails.database
  };
}

/**
 * Register memory status handlers
 */
export function registerMemoryStatusHandlers(
  _getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_MEMORY_STATUS,
    async (_, projectId: string): Promise<IPCResult<GraphitiMemoryStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const memoryStatus = buildMemoryStatus(project.path, project.autoBuildPath);

      return {
        success: true,
        data: memoryStatus
      };
    }
  );
}
