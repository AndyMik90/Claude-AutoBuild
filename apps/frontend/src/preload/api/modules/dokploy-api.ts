import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { DokployApiRequest, DokployApiResponse, DokployProjectDeployment } from '../../../shared/types';

export interface DokployAPI {
  dokployApi: <T = unknown>(request: DokployApiRequest) => Promise<DokployApiResponse<T>>;
  dokployReadEnv: (servicePath: string) => Promise<DokployApiResponse<Record<string, string>>>;
  dokploySaveDeployment: (projectPath: string, deployment: DokployProjectDeployment) => Promise<DokployApiResponse<void>>;
  dokployGetDeployment: (projectPath: string) => Promise<DokployApiResponse<DokployProjectDeployment | null>>;
  dokployDeleteDeployment: (projectPath: string) => Promise<DokployApiResponse<void>>;
}

export const createDokployAPI = (): DokployAPI => ({
  dokployApi: <T = unknown>(request: DokployApiRequest): Promise<DokployApiResponse<T>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOKPLOY_API, request),
  dokployReadEnv: (servicePath: string): Promise<DokployApiResponse<Record<string, string>>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOKPLOY_READ_ENV, servicePath),
  dokploySaveDeployment: (projectPath: string, deployment: DokployProjectDeployment): Promise<DokployApiResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOKPLOY_SAVE_DEPLOYMENT, projectPath, deployment),
  dokployGetDeployment: (projectPath: string): Promise<DokployApiResponse<DokployProjectDeployment | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOKPLOY_GET_DEPLOYMENT, projectPath),
  dokployDeleteDeployment: (projectPath: string): Promise<DokployApiResponse<void>> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOKPLOY_DELETE_DEPLOYMENT, projectPath)
});
