import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, ProjectEnvConfig, ClaudeAuthResult } from '../../shared/types';

export interface EnvAPI {
  // Project Environment Configuration
  get: (projectId: string) => Promise<IPCResult<ProjectEnvConfig>>;
  update: (projectId: string, config: Partial<ProjectEnvConfig>) => Promise<IPCResult>;

  // Claude Authentication
  checkClaudeAuth: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;
  invokeClaudeSetup: (projectId: string) => Promise<IPCResult<ClaudeAuthResult>>;
}

export const createEnvAPI = (): EnvAPI => ({
  // Get project environment configuration (merged with global defaults)
  get: (projectId: string): Promise<IPCResult<ProjectEnvConfig>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_GET, projectId),

  // Update project environment configuration
  update: (projectId: string, config: Partial<ProjectEnvConfig>): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_UPDATE, projectId, config),

  // Check Claude authentication status
  checkClaudeAuth: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_CHECK_CLAUDE_AUTH, projectId),

  // Invoke Claude CLI setup-token command
  invokeClaudeSetup: (projectId: string): Promise<IPCResult<ClaudeAuthResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.ENV_INVOKE_CLAUDE_SETUP, projectId)
});
