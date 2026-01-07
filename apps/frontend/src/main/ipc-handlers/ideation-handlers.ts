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
import type { IdeationGenerationStatus, IdeationSession, Idea } from '../../shared/types';
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
): () => void {
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

  // ============================================
  // Ideation Agent Events → Renderer
  // ============================================

  const handleIdeationProgress = (projectId: string, status: IdeationGenerationStatus): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_PROGRESS, projectId, status);
    }
  };

  const handleIdeationLog = (projectId: string, log: string): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_LOG, projectId, log);
    }
  };

  const handleIdeationTypeComplete = (projectId: string, ideationType: string, ideas: Idea[]): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_TYPE_COMPLETE, projectId, ideationType, ideas);
    }
  };

  const handleIdeationTypeFailed = (projectId: string, ideationType: string): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_TYPE_FAILED, projectId, ideationType);
    }
  };

  const handleIdeationComplete = (projectId: string, session: IdeationSession): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_COMPLETE, projectId, session);
    }
  };

  const handleIdeationError = (projectId: string, error: string): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_ERROR, projectId, error);
    }
  };

  const handleIdeationStopped = (projectId: string): void => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_STOPPED, projectId);
    }
  };

  agentManager.on('ideation-progress', handleIdeationProgress);
  agentManager.on('ideation-log', handleIdeationLog);
  agentManager.on('ideation-type-complete', handleIdeationTypeComplete);
  agentManager.on('ideation-type-failed', handleIdeationTypeFailed);
  agentManager.on('ideation-complete', handleIdeationComplete);
  agentManager.on('ideation-error', handleIdeationError);
  agentManager.on('ideation-stopped', handleIdeationStopped);

  return (): void => {
    agentManager.off('ideation-progress', handleIdeationProgress);
    agentManager.off('ideation-log', handleIdeationLog);
    agentManager.off('ideation-type-complete', handleIdeationTypeComplete);
    agentManager.off('ideation-type-failed', handleIdeationTypeFailed);
    agentManager.off('ideation-complete', handleIdeationComplete);
    agentManager.off('ideation-error', handleIdeationError);
    agentManager.off('ideation-stopped', handleIdeationStopped);
  };
}
