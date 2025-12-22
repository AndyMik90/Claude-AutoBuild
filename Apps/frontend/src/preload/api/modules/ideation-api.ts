import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  IdeationSession,
  IdeationConfig,
  IdeationStatus,
  IdeationGenerationStatus,
  Idea,
  Task,
  IPCResult
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * Ideation API operations
 */
export interface IdeationAPI {
  // Operations
  getIdeation: (projectId: string) => Promise<IPCResult<IdeationSession | null>>;
  generateIdeation: (projectId: string, config: IdeationConfig) => void;
  refreshIdeation: (projectId: string, config: IdeationConfig) => void;
  stopIdeation: (projectId: string) => Promise<IPCResult>;
  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus) => Promise<IPCResult>;
  convertIdeaToTask: (projectId: string, ideaId: string) => Promise<IPCResult<Task>>;
  dismissIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  dismissAllIdeas: (projectId: string) => Promise<IPCResult>;
  archiveIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  deleteIdea: (projectId: string, ideaId: string) => Promise<IPCResult>;
  deleteMultipleIdeas: (projectId: string, ideaIds: string[]) => Promise<IPCResult>;

  // Event Listeners
  onIdeationProgress: (
    callback: (projectId: string, status: IdeationGenerationStatus) => void
  ) => IpcListenerCleanup;
  onIdeationLog: (
    callback: (projectId: string, log: string) => void
  ) => IpcListenerCleanup;
  onIdeationComplete: (
    callback: (projectId: string, session: IdeationSession) => void
  ) => IpcListenerCleanup;
  onIdeationError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
  onIdeationStopped: (
    callback: (projectId: string) => void
  ) => IpcListenerCleanup;
  onIdeationTypeComplete: (
    callback: (projectId: string, ideationType: string, ideas: Idea[]) => void
  ) => IpcListenerCleanup;
  onIdeationTypeFailed: (
    callback: (projectId: string, ideationType: string) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the Ideation API implementation
 */
export const createIdeationAPI = (): IdeationAPI => ({
  // Operations
  getIdeation: (projectId: string): Promise<IPCResult<IdeationSession | null>> =>
    invokeIpc(IPC_CHANNELS.IDEATION_GET, projectId),

  generateIdeation: (projectId: string, config: IdeationConfig): void =>
    sendIpc(IPC_CHANNELS.IDEATION_GENERATE, projectId, config),

  refreshIdeation: (projectId: string, config: IdeationConfig): void =>
    sendIpc(IPC_CHANNELS.IDEATION_REFRESH, projectId, config),

  stopIdeation: (projectId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_STOP, projectId),

  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_UPDATE_IDEA, projectId, ideaId, status),

  convertIdeaToTask: (projectId: string, ideaId: string): Promise<IPCResult<Task>> =>
    invokeIpc(IPC_CHANNELS.IDEATION_CONVERT_TO_TASK, projectId, ideaId),

  dismissIdea: (projectId: string, ideaId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_DISMISS, projectId, ideaId),

  dismissAllIdeas: (projectId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_DISMISS_ALL, projectId),

  archiveIdea: (projectId: string, ideaId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_ARCHIVE, projectId, ideaId),

  deleteIdea: (projectId: string, ideaId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_DELETE, projectId, ideaId),

  deleteMultipleIdeas: (projectId: string, ideaIds: string[]): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.IDEATION_DELETE_MULTIPLE, projectId, ideaIds),

  // Event Listeners
  onIdeationProgress: (
    callback: (projectId: string, status: IdeationGenerationStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_PROGRESS, callback),

  onIdeationLog: (
    callback: (projectId: string, log: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_LOG, callback),

  onIdeationComplete: (
    callback: (projectId: string, session: IdeationSession) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_COMPLETE, callback),

  onIdeationError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_ERROR, callback),

  onIdeationStopped: (
    callback: (projectId: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_STOPPED, callback),

  onIdeationTypeComplete: (
    callback: (projectId: string, ideationType: string, ideas: Idea[]) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_TYPE_COMPLETE, callback),

  onIdeationTypeFailed: (
    callback: (projectId: string, ideationType: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.IDEATION_TYPE_FAILED, callback)
});
