import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  Roadmap,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus,
  ContinuousResearchState,
  ContinuousResearchProgress,
  Task,
  IPCResult
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * Roadmap API operations
 */
export interface RoadmapAPI {
  // Operations
  getRoadmap: (projectId: string) => Promise<IPCResult<Roadmap | null>>;
  getRoadmapStatus: (projectId: string) => Promise<IPCResult<{ isRunning: boolean }>>;
  saveRoadmap: (projectId: string, roadmap: Roadmap) => Promise<IPCResult>;
  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => void;
  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => void;
  stopRoadmap: (projectId: string) => Promise<IPCResult>;
  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ) => Promise<IPCResult>;
  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ) => Promise<IPCResult<Task>>;

  // Continuous Research Operations
  startContinuousResearch: (projectId: string, durationHours: number) => void;
  stopContinuousResearch: (projectId: string) => Promise<IPCResult>;
  getContinuousResearchStatus: (projectId: string) => Promise<IPCResult<ContinuousResearchState | null>>;
  resumeContinuousResearch: (projectId: string) => void;

  // Event Listeners
  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ) => IpcListenerCleanup;
  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ) => IpcListenerCleanup;
  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
  onRoadmapStopped: (
    callback: (projectId: string) => void
  ) => IpcListenerCleanup;

  // Continuous Research Event Listeners
  onContinuousResearchProgress: (
    callback: (projectId: string, progress: ContinuousResearchProgress) => void
  ) => IpcListenerCleanup;
  onContinuousResearchIterationComplete: (
    callback: (projectId: string, state: ContinuousResearchState) => void
  ) => IpcListenerCleanup;
  onContinuousResearchError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
  onContinuousResearchStopped: (
    callback: (projectId: string) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the Roadmap API implementation
 */
export const createRoadmapAPI = (): RoadmapAPI => ({
  // Operations
  getRoadmap: (projectId: string): Promise<IPCResult<Roadmap | null>> =>
    invokeIpc(IPC_CHANNELS.ROADMAP_GET, projectId),

  getRoadmapStatus: (projectId: string): Promise<IPCResult<{ isRunning: boolean }>> =>
    invokeIpc(IPC_CHANNELS.ROADMAP_GET_STATUS, projectId),

  saveRoadmap: (projectId: string, roadmap: Roadmap): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.ROADMAP_SAVE, projectId, roadmap),

  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean): void =>
    sendIpc(IPC_CHANNELS.ROADMAP_GENERATE, projectId, enableCompetitorAnalysis, refreshCompetitorAnalysis),

  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean): void =>
    sendIpc(IPC_CHANNELS.ROADMAP_REFRESH, projectId, enableCompetitorAnalysis, refreshCompetitorAnalysis),

  stopRoadmap: (projectId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.ROADMAP_STOP, projectId),

  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.ROADMAP_UPDATE_FEATURE, projectId, featureId, status),

  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ): Promise<IPCResult<Task>> =>
    invokeIpc(IPC_CHANNELS.ROADMAP_CONVERT_TO_SPEC, projectId, featureId),

  // Continuous Research Operations
  startContinuousResearch: (projectId: string, durationHours: number): void =>
    sendIpc(IPC_CHANNELS.CONTINUOUS_ROADMAP_START, projectId, durationHours),

  stopContinuousResearch: (projectId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.CONTINUOUS_ROADMAP_STOP, projectId),

  getContinuousResearchStatus: (projectId: string): Promise<IPCResult<ContinuousResearchState | null>> =>
    invokeIpc(IPC_CHANNELS.CONTINUOUS_ROADMAP_STATUS, projectId),

  resumeContinuousResearch: (projectId: string): void =>
    sendIpc(IPC_CHANNELS.CONTINUOUS_ROADMAP_RESUME, projectId),

  // Event Listeners
  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ROADMAP_PROGRESS, callback),

  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ROADMAP_COMPLETE, callback),

  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ROADMAP_ERROR, callback),

  onRoadmapStopped: (
    callback: (projectId: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.ROADMAP_STOPPED, callback),

  // Continuous Research Event Listeners
  onContinuousResearchProgress: (
    callback: (projectId: string, progress: ContinuousResearchProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.CONTINUOUS_ROADMAP_PROGRESS, callback),

  onContinuousResearchIterationComplete: (
    callback: (projectId: string, state: ContinuousResearchState) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.CONTINUOUS_ROADMAP_ITERATION_COMPLETE, callback),

  onContinuousResearchError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.CONTINUOUS_ROADMAP_ERROR, callback),

  onContinuousResearchStopped: (
    callback: (projectId: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.CONTINUOUS_ROADMAP_STOPPED, callback)
});
