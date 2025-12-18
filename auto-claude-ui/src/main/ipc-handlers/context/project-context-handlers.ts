import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { IPC_CHANNELS, getSpecsDir, AUTO_BUILD_PATHS } from '../../../shared/constants';
import type {
  IPCResult,
  ProjectContextData,
  ProjectIndex,
  MemoryEpisode
} from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getFalkorDBService } from '../../falkordb-service';
import {
  getAutoBuildSourcePath
} from './utils';
import {
  loadGraphitiStateFromSpecs,
  buildMemoryStatus
} from './memory-status-handlers';
import { loadFileBasedMemories } from './memory-data-handlers';

/**
 * Load project index from file
 */
function loadProjectIndex(projectPath: string): ProjectIndex | null {
  const indexPath = path.join(projectPath, AUTO_BUILD_PATHS.PROJECT_INDEX);
  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const content = readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Load recent memories with FalkorDB fallback
 */
async function loadRecentMemories(
  projectPath: string,
  autoBuildPath: string | undefined,
  memoryStatusAvailable: boolean,
  memoryHost?: string,
  memoryPort?: number
): Promise<MemoryEpisode[]> {
  let recentMemories: MemoryEpisode[] = [];

  // Try to load from FalkorDB first if Graphiti is available
  if (memoryStatusAvailable && memoryHost && memoryPort) {
    try {
      const falkorService = getFalkorDBService({
        host: memoryHost,
        port: memoryPort,
      });
      const falkorMemories = await falkorService.getAllMemories(20);
      if (falkorMemories.length > 0) {
        recentMemories = falkorMemories;
      }
    } catch (error) {
      console.warn('Failed to load memories from FalkorDB, falling back to file-based:', error);
    }
  }

  // Fall back to file-based memory if no FalkorDB memories found
  if (recentMemories.length === 0) {
    const specsBaseDir = getSpecsDir(autoBuildPath);
    const specsDir = path.join(projectPath, specsBaseDir);
    recentMemories = loadFileBasedMemories(specsDir, 20);
  }

  return recentMemories;
}

/**
 * Register project context handlers
 */
export function registerProjectContextHandlers(
  _getMainWindow: () => BrowserWindow | null
): void {
  // Get full project context
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_GET,
    async (_, projectId: string): Promise<IPCResult<ProjectContextData>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Load project index
        const projectIndex = loadProjectIndex(project.path);

        // Load graphiti state from most recent spec
        const memoryState = loadGraphitiStateFromSpecs(project.path, project.autoBuildPath);

        // Build memory status
        const memoryStatus = buildMemoryStatus(
          project.path,
          project.autoBuildPath,
          memoryState
        );

        // Load recent memories
        const recentMemories = await loadRecentMemories(
          project.path,
          project.autoBuildPath,
          memoryStatus.available,
          memoryStatus.host,
          memoryStatus.port
        );

        return {
          success: true,
          data: {
            projectIndex,
            memoryStatus,
            memoryState,
            recentMemories,
            isLoading: false
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load project context'
        };
      }
    }
  );

  // Refresh project index
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_REFRESH_INDEX,
    async (_, projectId: string): Promise<IPCResult<ProjectIndex>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Run the analyzer script to regenerate project_index.json
        const autoBuildSource = getAutoBuildSourcePath();

        if (!autoBuildSource) {
          return {
            success: false,
            error: 'Auto-build source path not configured'
          };
        }

        const analyzerPath = path.join(autoBuildSource, 'analyzer.py');
        const indexOutputPath = path.join(project.path, AUTO_BUILD_PATHS.PROJECT_INDEX);

        // Run analyzer
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('python', [
            analyzerPath,
            '--project-dir', project.path,
            '--output', indexOutputPath
          ], {
            cwd: project.path,
            env: { ...process.env }
          });

          proc.on('close', (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Analyzer exited with code ${code}`));
            }
          });

          proc.on('error', reject);
        });

        // Read the new index
        const projectIndex = loadProjectIndex(project.path);
        if (projectIndex) {
          return { success: true, data: projectIndex };
        }

        return { success: false, error: 'Failed to generate project index' };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to refresh project index'
        };
      }
    }
  );
}
