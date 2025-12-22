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
  hasOpenAIKey,
  getGraphitiDatabaseDetails
} from './utils';

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
    const dbDetails = getGraphitiDatabaseDetails(projectEnvVars);
    return {
      enabled: true,
      available: true,
      database: memoryState.database || 'auto_claude_memory',
      dbPath: dbDetails.dbPath
    };
  }

  // Check environment configuration
  const graphitiEnabled = isGraphitiEnabled(projectEnvVars);
  const hasOpenAI = hasOpenAIKey(projectEnvVars, globalSettings);

  if (!graphitiEnabled) {
    return {
      enabled: false,
      available: false,
      reason: 'Graphiti not configured'
    };
  }

  if (!hasOpenAI) {
    return {
      enabled: true,
      available: false,
      reason: 'OPENAI_API_KEY not set (required for Graphiti embeddings)'
    };
  }

  const dbDetails = getGraphitiDatabaseDetails(projectEnvVars);
  return {
    enabled: true,
    available: true,
    dbPath: dbDetails.dbPath,
    database: dbDetails.database
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
