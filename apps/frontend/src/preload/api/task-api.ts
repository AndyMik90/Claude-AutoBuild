import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  Task,
  IPCResult,
  TaskStartOptions,
  TaskStatus,
  TaskRecoveryResult,
  ImplementationPlan,
  TaskMetadata,
  TaskLogs,
  TaskLogStreamChunk
} from '../../shared/types';

export interface TaskAPI {
  // Task Operations
  getTasks: (projectId: string) => Promise<IPCResult<Task[]>>;
  createTask: (
    projectId: string,
    title: string,
    description: string,
    metadata?: TaskMetadata
  ) => Promise<IPCResult<Task>>;
  deleteTask: (taskId: string) => Promise<IPCResult>;
  updateTask: (
    taskId: string,
    updates: { title?: string; description?: string }
  ) => Promise<IPCResult<Task>>;
  startTask: (taskId: string, options?: TaskStartOptions) => void;
  stopTask: (taskId: string) => void;
  submitReview: (
    taskId: string,
    approved: boolean,
    feedback?: string
  ) => Promise<IPCResult>;
  updateTaskStatus: (
    taskId: string,
    status: TaskStatus
  ) => Promise<IPCResult>;
  recoverStuckTask: (
    taskId: string,
    options?: import('../../shared/types').TaskRecoveryOptions
  ) => Promise<IPCResult<TaskRecoveryResult>>;
  checkTaskRunning: (taskId: string) => Promise<IPCResult<boolean>>;

  // Workspace Management (for human review)
  getWorktreeStatus: (taskId: string) => Promise<IPCResult<import('../../shared/types').WorktreeStatus>>;
  getWorktreeDiff: (taskId: string) => Promise<IPCResult<import('../../shared/types').WorktreeDiff>>;
  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }) => Promise<IPCResult<import('../../shared/types').WorktreeMergeResult>>;
  mergeWorktreePreview: (taskId: string) => Promise<IPCResult<import('../../shared/types').WorktreeMergeResult>>;
  discardWorktree: (taskId: string) => Promise<IPCResult<import('../../shared/types').WorktreeDiscardResult>>;
  listWorktrees: (projectId: string) => Promise<IPCResult<import('../../shared/types').WorktreeListResult>>;
  archiveTasks: (projectId: string, taskIds: string[], version?: string) => Promise<IPCResult<boolean>>;
  unarchiveTasks: (projectId: string, taskIds: string[]) => Promise<IPCResult<boolean>>;

  // Task Event Listeners
  onTaskProgress: (callback: (taskId: string, plan: ImplementationPlan) => void) => () => void;
  onTaskError: (callback: (taskId: string, error: string) => void) => () => void;
  onTaskLog: (callback: (taskId: string, log: string) => void) => () => void;
  onTaskStatusChange: (callback: (taskId: string, status: TaskStatus) => void) => () => void;
  onTaskExecutionProgress: (
    callback: (taskId: string, progress: import('../../shared/types').ExecutionProgress) => void
  ) => () => void;

  // Task Phase Logs
  getTaskLogs: (projectId: string, specId: string) => Promise<IPCResult<TaskLogs | null>>;
  watchTaskLogs: (projectId: string, specId: string) => Promise<IPCResult>;
  unwatchTaskLogs: (specId: string) => Promise<IPCResult>;
  onTaskLogsChanged: (callback: (specId: string, logs: TaskLogs) => void) => () => void;
  onTaskLogsStream: (callback: (specId: string, chunk: TaskLogStreamChunk) => void) => () => void;
}

export const createTaskAPI = (): TaskAPI => ({
  // Task Operations
  getTasks: (projectId: string): Promise<IPCResult<Task[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, projectId),

  createTask: (
    projectId: string,
    title: string,
    description: string,
    metadata?: TaskMetadata
  ): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, projectId, title, description, metadata),

  deleteTask: (taskId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_DELETE, taskId),

  updateTask: (
    taskId: string,
    updates: { title?: string; description?: string }
  ): Promise<IPCResult<Task>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE, taskId, updates),

  startTask: (taskId: string, options?: TaskStartOptions): void =>
    ipcRenderer.send(IPC_CHANNELS.TASK_START, taskId, options),

  stopTask: (taskId: string): void =>
    ipcRenderer.send(IPC_CHANNELS.TASK_STOP, taskId),

  submitReview: (
    taskId: string,
    approved: boolean,
    feedback?: string
  ): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_REVIEW, taskId, approved, feedback),

  updateTaskStatus: (
    taskId: string,
    status: TaskStatus
  ): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UPDATE_STATUS, taskId, status),

  recoverStuckTask: (
    taskId: string,
    options?: import('../../shared/types').TaskRecoveryOptions
  ): Promise<IPCResult<TaskRecoveryResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_RECOVER_STUCK, taskId, options),

  checkTaskRunning: (taskId: string): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_CHECK_RUNNING, taskId),

  // Workspace Management
  getWorktreeStatus: (taskId: string): Promise<IPCResult<import('../../shared/types').WorktreeStatus>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_STATUS, taskId),

  getWorktreeDiff: (taskId: string): Promise<IPCResult<import('../../shared/types').WorktreeDiff>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_DIFF, taskId),

  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }): Promise<IPCResult<import('../../shared/types').WorktreeMergeResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_MERGE, taskId, options),

  mergeWorktreePreview: (taskId: string): Promise<IPCResult<import('../../shared/types').WorktreeMergeResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_MERGE_PREVIEW, taskId),

  discardWorktree: (taskId: string): Promise<IPCResult<import('../../shared/types').WorktreeDiscardResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_WORKTREE_DISCARD, taskId),

  listWorktrees: (projectId: string): Promise<IPCResult<import('../../shared/types').WorktreeListResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST_WORKTREES, projectId),

  archiveTasks: (projectId: string, taskIds: string[], version?: string): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_ARCHIVE, projectId, taskIds, version),

  unarchiveTasks: (projectId: string, taskIds: string[]): Promise<IPCResult<boolean>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_UNARCHIVE, projectId, taskIds),

  // Task Event Listeners
  onTaskProgress: (
    callback: (taskId: string, plan: ImplementationPlan) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      plan: ImplementationPlan
    ): void => {
      callback(taskId, plan);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_PROGRESS, handler);
    };
  },

  onTaskError: (
    callback: (taskId: string, error: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      error: string
    ): void => {
      callback(taskId, error);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_ERROR, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_ERROR, handler);
    };
  },

  onTaskLog: (
    callback: (taskId: string, log: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      log: string
    ): void => {
      callback(taskId, log);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_LOG, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_LOG, handler);
    };
  },

  onTaskStatusChange: (
    callback: (taskId: string, status: TaskStatus) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      status: TaskStatus
    ): void => {
      callback(taskId, status);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_STATUS_CHANGE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_STATUS_CHANGE, handler);
    };
  },

  onTaskExecutionProgress: (
    callback: (taskId: string, progress: import('../../shared/types').ExecutionProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      taskId: string,
      progress: import('../../shared/types').ExecutionProgress
    ): void => {
      callback(taskId, progress);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, handler);
    };
  },

  // Task Phase Logs
  getTaskLogs: (projectId: string, specId: string): Promise<IPCResult<TaskLogs | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LOGS_GET, projectId, specId),

  watchTaskLogs: (projectId: string, specId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LOGS_WATCH, projectId, specId),

  unwatchTaskLogs: (specId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_LOGS_UNWATCH, specId),

  onTaskLogsChanged: (
    callback: (specId: string, logs: TaskLogs) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      specId: string,
      logs: TaskLogs
    ): void => {
      callback(specId, logs);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_LOGS_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_LOGS_CHANGED, handler);
    };
  },

  onTaskLogsStream: (
    callback: (specId: string, chunk: TaskLogStreamChunk) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      specId: string,
      chunk: TaskLogStreamChunk
    ): void => {
      callback(specId, chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.TASK_LOGS_STREAM, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TASK_LOGS_STREAM, handler);
    };
  }
});
