/**
 * Ideation IPC handlers registration
 *
 * This module serves as the entry point for all ideation-related IPC handlers.
 * The actual handler implementations are organized in the ./ideation/ subdirectory:
 *
 * - session-manager.ts: CRUD operations for ideation sessions
 * - idea-manager.ts: Individual idea operations (update, dismiss, etc.)
 * - generation-handlers.ts: Start/stop ideation generation
 * - task-converter.ts: Convert ideas to tasks
 * - transformers.ts: Data transformation utilities (snake_case to camelCase)
 * - file-utils.ts: File system operations
 */

import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { AgentManager } from '../agent';
import {
  getIdeationSession,
  updateIdeaStatus,
  dismissIdea,
  dismissAllIdeas,
  archiveIdea,
  deleteIdea,
  deleteMultipleIdeas,
  startIdeationGeneration,
  refreshIdeationSession,
  stopIdeationGeneration,
  convertIdeaToTask
} from './ideation';

/**
 * Register all ideation-related IPC handlers
 */
export function registerIdeationHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // Session management
  ipcMain.handle(
    IPC_CHANNELS.IDEATION_GET,
    getIdeationSession
  );

  // Idea operations
  ipcMain.handle(
    IPC_CHANNELS.IDEATION_UPDATE_IDEA,
    updateIdeaStatus
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_DISMISS,
    dismissIdea
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_DISMISS_ALL,
    dismissAllIdeas
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_ARCHIVE,
    archiveIdea
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_DELETE,
    deleteIdea
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_DELETE_MULTIPLE,
    deleteMultipleIdeas
  );

  // Generation operations
  ipcMain.on(
    IPC_CHANNELS.IDEATION_GENERATE,
    (event, projectId, config) =>
      startIdeationGeneration(event, projectId, config, agentManager, getMainWindow())
  );

  ipcMain.on(
    IPC_CHANNELS.IDEATION_REFRESH,
    (event, projectId, config) =>
      refreshIdeationSession(event, projectId, config, agentManager, getMainWindow())
  );

  ipcMain.handle(
    IPC_CHANNELS.IDEATION_STOP,
    (event, projectId) =>
      stopIdeationGeneration(event, projectId, agentManager, getMainWindow())
  );

  // Task conversion
  ipcMain.handle(
    IPC_CHANNELS.IDEATION_CONVERT_TO_TASK,
    convertIdeaToTask
  );
}
