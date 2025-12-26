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
 * Default export for consistency with other handler modules
 */
export default function setupGitlabHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerGitlabHandlers(agentManager, getMainWindow);
}
