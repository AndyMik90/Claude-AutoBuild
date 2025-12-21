import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  PlaneProject,
  PlaneWorkItem,
  PlaneState,
  PlaneImportResult,
  PlaneSyncStatus,
  IPCResult
} from '../../../shared/types';
import { invokeIpc } from './ipc-utils';

/**
 * Project with Plane configuration (for copy settings feature)
 */
export interface PlaneConfiguredProject {
  id: string;
  name: string;
  planeApiKey: string;
  planeBaseUrl?: string;
  planeWorkspaceSlug?: string;
}

/**
 * Plane.so Integration API operations
 */
export interface PlaneAPI {
  checkPlaneConnection: (projectId: string) => Promise<IPCResult<PlaneSyncStatus>>;
  getPlaneProjects: (projectId: string, workspaceSlug?: string) => Promise<IPCResult<PlaneProject[]>>;
  getPlaneWorkItems: (
    projectId: string,
    workspaceSlug: string,
    planeProjectId: string
  ) => Promise<IPCResult<PlaneWorkItem[]>>;
  getPlaneStates: (
    projectId: string,
    workspaceSlug: string,
    planeProjectId: string
  ) => Promise<IPCResult<PlaneState[]>>;
  getPlaneConfiguredProjects: (excludeProjectId?: string) => Promise<IPCResult<PlaneConfiguredProject[]>>;
  importPlaneWorkItems: (
    projectId: string,
    workItemIds: string[],
    workspaceSlug: string,
    planeProjectId: string,
    planeProjectIdentifier: string
  ) => Promise<IPCResult<PlaneImportResult>>;
}

/**
 * Creates the Plane Integration API implementation
 */
export const createPlaneAPI = (): PlaneAPI => ({
  checkPlaneConnection: (projectId: string): Promise<IPCResult<PlaneSyncStatus>> =>
    invokeIpc(IPC_CHANNELS.PLANE_CHECK_CONNECTION, projectId),

  getPlaneProjects: (projectId: string, workspaceSlug?: string): Promise<IPCResult<PlaneProject[]>> =>
    invokeIpc(IPC_CHANNELS.PLANE_GET_PROJECTS, projectId, workspaceSlug),

  getPlaneWorkItems: (
    projectId: string,
    workspaceSlug: string,
    planeProjectId: string
  ): Promise<IPCResult<PlaneWorkItem[]>> =>
    invokeIpc(IPC_CHANNELS.PLANE_GET_WORK_ITEMS, projectId, workspaceSlug, planeProjectId),

  getPlaneStates: (
    projectId: string,
    workspaceSlug: string,
    planeProjectId: string
  ): Promise<IPCResult<PlaneState[]>> =>
    invokeIpc(IPC_CHANNELS.PLANE_GET_STATES, projectId, workspaceSlug, planeProjectId),

  getPlaneConfiguredProjects: (excludeProjectId?: string): Promise<IPCResult<PlaneConfiguredProject[]>> =>
    invokeIpc(IPC_CHANNELS.PLANE_GET_CONFIGURED_PROJECTS, excludeProjectId),

  importPlaneWorkItems: (
    projectId: string,
    workItemIds: string[],
    workspaceSlug: string,
    planeProjectId: string,
    planeProjectIdentifier: string
  ): Promise<IPCResult<PlaneImportResult>> =>
    invokeIpc(IPC_CHANNELS.PLANE_IMPORT_WORK_ITEMS, projectId, workItemIds, workspaceSlug, planeProjectId, planeProjectIdentifier)
});
