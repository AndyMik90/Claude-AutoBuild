/**
 * Ideation generation handlers (start/stop generation)
 */

import type { IpcMainEvent, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS, DEFAULT_FEATURE_MODELS, DEFAULT_FEATURE_THINKING } from '../../../shared/constants';
import type { IPCResult, IdeationConfig, IdeationGenerationStatus, AppSettings } from '../../../shared/types';
import { projectStore } from '../../project-store';
import type { AgentManager } from '../../agent';
import { debugLog, debugError } from '../../../shared/utils/debug-logger';

/**
 * Read ideation feature settings from the settings file
 */
function getIdeationFeatureSettings(): { model?: string; thinkingLevel?: string } {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  try {
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(content) };

      // Get ideation-specific settings
      const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
      const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

      return {
        model: featureModels.ideation,
        thinkingLevel: featureThinking.ideation
      };
    }
  } catch (error) {
    debugError('[Ideation Handler] Failed to read feature settings:', error);
  }

  // Return defaults if settings file doesn't exist or fails to parse
  return {
    model: DEFAULT_FEATURE_MODELS.ideation,
    thinkingLevel: DEFAULT_FEATURE_THINKING.ideation
  };
}

/**
 * Start ideation generation for a project
 */
export function startIdeationGeneration(
  _event: IpcMainEvent,
  projectId: string,
  config: IdeationConfig,
  agentManager: AgentManager,
  mainWindow: BrowserWindow | null
): void {
  // Get feature settings and merge with config
  const featureSettings = getIdeationFeatureSettings();
  const configWithSettings: IdeationConfig = {
    ...config,
    model: config.model || featureSettings.model,
    thinkingLevel: config.thinkingLevel || featureSettings.thinkingLevel
  };

  debugLog('[Ideation Handler] Start generation request:', {
    projectId,
    enabledTypes: configWithSettings.enabledTypes,
    maxIdeasPerType: configWithSettings.maxIdeasPerType,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel
  });

  if (!mainWindow) {
    debugError('[Ideation Handler] Cannot start generation - mainWindow is null:', { projectId });
    return;
  }

  const project = projectStore.getProject(projectId);
  if (!project) {
    debugError('[Ideation Handler] Project not found:', projectId);
    try {
      mainWindow.webContents.send(
        IPC_CHANNELS.IDEATION_ERROR,
        projectId,
        'Project not found'
      );
    } catch (ipcError) {
      debugError('[Ideation Handler] Failed to send project not found error via IPC:', ipcError);
    }
    return;
  }

  debugLog('[Ideation Handler] Starting agent manager generation:', {
    projectId,
    projectPath: project.path,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel
  });

  // Start ideation generation via agent manager
  try {
    agentManager.startIdeationGeneration(projectId, project.path, configWithSettings, false);
  } catch (error) {
    debugError('[Ideation Handler] Failed to start ideation generation:', {
      projectId,
      error: error instanceof Error ? error.message : String(error)
    });
    try {
      mainWindow.webContents.send(
        IPC_CHANNELS.IDEATION_ERROR,
        projectId,
        error instanceof Error ? error.message : 'Failed to start ideation generation'
      );
    } catch (ipcError) {
      debugError('[Ideation Handler] Failed to send generation error via IPC:', ipcError);
    }
    return;
  }

  // Send initial progress
  try {
    mainWindow.webContents.send(
      IPC_CHANNELS.IDEATION_PROGRESS,
      projectId,
      {
        phase: 'analyzing',
        progress: 10,
        message: 'Analyzing project structure...'
      } as IdeationGenerationStatus
    );
  } catch (ipcError) {
    debugError('[Ideation Handler] Failed to send initial progress via IPC:', ipcError);
  }
}

/**
 * Refresh ideation session (regenerate with new ideas)
 */
export function refreshIdeationSession(
  _event: IpcMainEvent,
  projectId: string,
  config: IdeationConfig,
  agentManager: AgentManager,
  mainWindow: BrowserWindow | null
): void {
  // Get feature settings and merge with config
  const featureSettings = getIdeationFeatureSettings();
  const configWithSettings: IdeationConfig = {
    ...config,
    model: config.model || featureSettings.model,
    thinkingLevel: config.thinkingLevel || featureSettings.thinkingLevel
  };

  debugLog('[Ideation Handler] Refresh session request:', {
    projectId,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel
  });

  if (!mainWindow) {
    debugError('[Ideation Handler] Cannot refresh session - mainWindow is null:', { projectId });
    return;
  }

  const project = projectStore.getProject(projectId);
  if (!project) {
    debugError('[Ideation Handler] Project not found for refresh:', projectId);
    try {
      mainWindow.webContents.send(
        IPC_CHANNELS.IDEATION_ERROR,
        projectId,
        'Project not found'
      );
    } catch (ipcError) {
      debugError('[Ideation Handler] Failed to send project not found error via IPC:', ipcError);
    }
    return;
  }

  debugLog('[Ideation Handler] Starting agent manager refresh:', {
    projectId,
    projectPath: project.path,
    model: configWithSettings.model,
    thinkingLevel: configWithSettings.thinkingLevel
  });

  // Start ideation regeneration with refresh flag
  try {
    agentManager.startIdeationGeneration(projectId, project.path, configWithSettings, true);
  } catch (error) {
    debugError('[Ideation Handler] Failed to refresh ideation session:', {
      projectId,
      error: error instanceof Error ? error.message : String(error)
    });
    try {
      mainWindow.webContents.send(
        IPC_CHANNELS.IDEATION_ERROR,
        projectId,
        error instanceof Error ? error.message : 'Failed to refresh ideation session'
      );
    } catch (ipcError) {
      debugError('[Ideation Handler] Failed to send refresh error via IPC:', ipcError);
    }
    return;
  }

  // Send initial progress
  try {
    mainWindow.webContents.send(
      IPC_CHANNELS.IDEATION_PROGRESS,
      projectId,
      {
        phase: 'analyzing',
        progress: 10,
        message: 'Refreshing ideation...'
      } as IdeationGenerationStatus
    );
  } catch (ipcError) {
    debugError('[Ideation Handler] Failed to send refresh progress via IPC:', ipcError);
  }
}

/**
 * Stop ideation generation
 */
export async function stopIdeationGeneration(
  _event: IpcMainInvokeEvent,
  projectId: string,
  agentManager: AgentManager,
  mainWindow: BrowserWindow | null
): Promise<IPCResult> {
  debugLog('[Ideation Handler] Stop generation request:', { projectId });

  let wasStopped = false;
  try {
    wasStopped = agentManager.stopIdeation(projectId);
  } catch (error) {
    debugError('[Ideation Handler] Failed to stop ideation generation:', {
      projectId,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop ideation generation'
    };
  }

  debugLog('[Ideation Handler] Stop result:', { projectId, wasStopped });

  if (!wasStopped) {
    debugLog('[Ideation Handler] No running ideation process found to stop:', { projectId });
  }

  if (wasStopped && mainWindow) {
    debugLog('[Ideation Handler] Sending stopped event to renderer');
    try {
      mainWindow.webContents.send(IPC_CHANNELS.IDEATION_STOPPED, projectId);
    } catch (ipcError) {
      debugError('[Ideation Handler] Failed to send stopped event via IPC:', ipcError);
    }
  } else if (wasStopped && !mainWindow) {
    debugError('[Ideation Handler] Cannot send stopped event - mainWindow is null:', { projectId });
  }

  return { success: wasStopped };
}
