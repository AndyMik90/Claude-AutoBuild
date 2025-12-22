import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  LinearTeam,
  LinearProject,
  LinearIssue,
  LinearImportResult,
  LinearSyncStatus,
  IPCResult
} from '../../../shared/types';
import { invokeIpc } from './ipc-utils';

/**
 * Linear Integration API operations
 */
export interface LinearAPI {
  getLinearTeams: (projectId: string) => Promise<IPCResult<LinearTeam[]>>;
  getLinearProjects: (projectId: string, teamId: string) => Promise<IPCResult<LinearProject[]>>;
  getLinearIssues: (
    projectId: string,
    teamId?: string,
    linearProjectId?: string
  ) => Promise<IPCResult<LinearIssue[]>>;
  importLinearIssues: (projectId: string, issueIds: string[]) => Promise<IPCResult<LinearImportResult>>;
  checkLinearConnection: (projectId: string) => Promise<IPCResult<LinearSyncStatus>>;
}

/**
 * Creates the Linear Integration API implementation
 */
export const createLinearAPI = (): LinearAPI => ({
  getLinearTeams: (projectId: string): Promise<IPCResult<LinearTeam[]>> =>
    invokeIpc(IPC_CHANNELS.LINEAR_GET_TEAMS, projectId),

  getLinearProjects: (projectId: string, teamId: string): Promise<IPCResult<LinearProject[]>> =>
    invokeIpc(IPC_CHANNELS.LINEAR_GET_PROJECTS, projectId, teamId),

  getLinearIssues: (
    projectId: string,
    teamId?: string,
    linearProjectId?: string
  ): Promise<IPCResult<LinearIssue[]>> =>
    invokeIpc(IPC_CHANNELS.LINEAR_GET_ISSUES, projectId, teamId, linearProjectId),

  importLinearIssues: (projectId: string, issueIds: string[]): Promise<IPCResult<LinearImportResult>> =>
    invokeIpc(IPC_CHANNELS.LINEAR_IMPORT_ISSUES, projectId, issueIds),

  checkLinearConnection: (projectId: string): Promise<IPCResult<LinearSyncStatus>> =>
    invokeIpc(IPC_CHANNELS.LINEAR_CHECK_CONNECTION, projectId)
});
