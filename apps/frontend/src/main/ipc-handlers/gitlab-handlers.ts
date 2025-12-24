/**
 * GitLab Handlers Entry Point
 *
 * This file serves as the main entry point for GitLab IPC handlers,
 * delegating to the modular handlers in the gitlab/ directory.
 */

import type { BrowserWindow } from 'electron';
import type { AgentManager } from '../agent';
import { registerGitlabHandlers } from './gitlab/index';

export { registerGitlabHandlers };

/**
 * Initialize GitLab IPC handlers by delegating to the module that registers them.
 *
 * @param agentManager - The AgentManager instance used by the handlers to manage agents and perform agent-related operations.
 * @param getMainWindow - Function that returns the main BrowserWindow or `null`; used when handlers need access to the main window.
 */
export default function setupGitlabHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerGitlabHandlers(agentManager, getMainWindow);
}