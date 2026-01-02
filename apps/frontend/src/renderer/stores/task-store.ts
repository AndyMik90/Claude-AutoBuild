import { create } from 'zustand';
import type { Task, TaskStatus, ImplementationPlan, Subtask, TaskMetadata, ExecutionProgress, ExecutionPhase, ReviewReason, TaskDraft } from '../../shared/types';

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTaskFromPlan: (taskId: string, plan: ImplementationPlan) => void;
  updateExecutionProgress: (taskId: string, progress: Partial<ExecutionProgress>) => void;
  appendLog: (taskId: string, log: string) => void;
  batchAppendLogs: (taskId: string, logs: string[]) => void;
  selectTask: (taskId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearTasks: () => void;

  // Selectors
  getSelectedTask: () => Task | undefined;
  getTasksByStatus: (status: TaskStatus) => Task[];
}

/**
 * Helper to find task index by id or specId.
 * Returns -1 if not found.
 */
function findTaskIndex(tasks: Task[], taskId: string): number {
  return tasks.findIndex((t) => t.id === taskId || t.specId === taskId);
}

/**
 * Helper to update a single task efficiently.
 * Uses slice instead of map to avoid iterating all tasks.
 */
function updateTaskAtIndex(tasks: Task[], index: number, updater: (task: Task) => Task): Task[] {
  if (index < 0 || index >= tasks.length) return tasks;

  const updatedTask = updater(tasks[index]);

  // If the task reference didn't change, return original array
  if (updatedTask === tasks[index]) {
    return tasks;
  }

  // Create new array with only the changed task replaced
  const newTasks = [...tasks];
  newTasks[index] = updatedTask;

  return newTasks;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  isLoading: false,
  error: null,

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task]
    })),

  updateTask: (taskId, updates) =>
    set((state) => {
      const index = findTaskIndex(state.tasks, taskId);
      if (index === -1) return state;

      return {
        tasks: updateTaskAtIndex(state.tasks, index, (t) => ({ ...t, ...updates }))
      };
    }),

  updateTaskStatus: (taskId, status) =>
    set((state) => {
      const index = findTaskIndex(state.tasks, taskId);
      if (index === -1) return state;

      return {
        tasks: updateTaskAtIndex(state.tasks, index, (t) => {
          // Determine execution progress based on status transition
          let executionProgress = t.executionProgress;

          if (status === 'backlog') {
            // When status goes to backlog, reset execution progress to idle
            // This ensures the planning/coding animation stops when task is stopped
            executionProgress = { phase: 'idle' as ExecutionPhase, phaseProgress: 0, overallProgress: 0 };
          } else if (status === 'in_progress' && !t.executionProgress?.phase) {
            // When starting a task and no phase is set yet, default to planning
            // This prevents the "no active phase" UI state during startup race condition
            executionProgress = { phase: 'planning' as ExecutionPhase, phaseProgress: 0, overallProgress: 0 };
          }

          return { ...t, status, executionProgress, updatedAt: new Date() };
        })
      };
    }),

  updateTaskFromPlan: (taskId, plan) =>
    set((state) => {
      const index = findTaskIndex(state.tasks, taskId);
      if (index === -1) return state;

      return {
        tasks: updateTaskAtIndex(state.tasks, index, (t) => {
          const subtasks: Subtask[] = plan.phases.flatMap((phase) =>
            phase.subtasks.map((subtask) => ({
              id: subtask.id,
              title: subtask.description,
              description: subtask.description,
              status: subtask.status,
              files: [],
              verification: subtask.verification as Subtask['verification']
            }))
          );

          const allCompleted = subtasks.every((s) => s.status === 'completed');
          const anyFailed = subtasks.some((s) => s.status === 'failed');
          const anyInProgress = subtasks.some((s) => s.status === 'in_progress');
          const anyCompleted = subtasks.some((s) => s.status === 'completed');

          let status: TaskStatus = t.status;
          let reviewReason: ReviewReason | undefined = t.reviewReason;

          // RACE CONDITION FIX: Don't let stale plan data override status during active execution
          const activePhases: ExecutionPhase[] = ['planning', 'coding', 'qa_review', 'qa_fixing'];
          const isInActivePhase = t.executionProgress?.phase && activePhases.includes(t.executionProgress.phase);

          if (!isInActivePhase) {
            if (allCompleted) {
              status = 'ai_review';
            } else if (anyFailed) {
              status = 'human_review';
              reviewReason = 'errors';
            } else if (anyInProgress || anyCompleted) {
              status = 'in_progress';
            }
          }

          return {
            ...t,
            title: plan.feature || t.title,
            subtasks,
            status,
            reviewReason,
            updatedAt: new Date()
          };
        })
      };
    }),

  updateExecutionProgress: (taskId, progress) =>
    set((state) => {
      const index = findTaskIndex(state.tasks, taskId);
      if (index === -1) return state;

      return {
        tasks: updateTaskAtIndex(state.tasks, index, (t) => {
          const existingProgress = t.executionProgress || {
            phase: 'idle' as ExecutionPhase,
            phaseProgress: 0,
            overallProgress: 0,
            sequenceNumber: 0
          };

          const incomingSeq = progress.sequenceNumber ?? 0;
          const currentSeq = existingProgress.sequenceNumber ?? 0;
          if (incomingSeq > 0 && currentSeq > 0 && incomingSeq < currentSeq) {
            return t; // Skip out-of-order update
          }

          // Only update updatedAt on phase transitions (not on every progress tick)
          // This prevents unnecessary re-renders from the memo comparator
          const phaseChanged = progress.phase && progress.phase !== existingProgress.phase;

          return {
            ...t,
            executionProgress: {
              ...existingProgress,
              ...progress
            },
            // Only set updatedAt on phase changes to reduce re-renders
            ...(phaseChanged ? { updatedAt: new Date() } : {})
          };
        })
      };
    }),

  appendLog: (taskId, log) =>
    set((state) => {
      const index = findTaskIndex(state.tasks, taskId);
      if (index === -1) return state;

      return {
        tasks: updateTaskAtIndex(state.tasks, index, (t) => ({
          ...t,
          logs: [...(t.logs || []), log]
        }))
      };
    }),

  // Batch append multiple logs at once (single state update instead of N updates)
  batchAppendLogs: (taskId, logs) =>
    set((state) => {
      if (logs.length === 0) return state;
      const index = findTaskIndex(state.tasks, taskId);
      if (index === -1) return state;

      return {
        tasks: updateTaskAtIndex(state.tasks, index, (t) => ({
          ...t,
          logs: [...(t.logs || []), ...logs]
        }))
      };
    }),

  selectTask: (taskId) => set({ selectedTaskId: taskId }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clearTasks: () => set({ tasks: [], selectedTaskId: null }),

  getSelectedTask: () => {
    const state = get();
    return state.tasks.find((t) => t.id === state.selectedTaskId);
  },

  getTasksByStatus: (status) => {
    const state = get();
    return state.tasks.filter((t) => t.status === status);
  }
}));

/**
 * Load tasks for a project
 */
export async function loadTasks(projectId: string): Promise<void> {
  const store = useTaskStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    const result = await window.electronAPI.getTasks(projectId);
    if (result.success && result.data) {
      store.setTasks(result.data);
    } else {
      store.setError(result.error || 'Failed to load tasks');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
  }
}

/**
 * Create a new task
 */
export async function createTask(
  projectId: string,
  title: string,
  description: string,
  metadata?: TaskMetadata
): Promise<Task | null> {
  const store = useTaskStore.getState();

  try {
    const result = await window.electronAPI.createTask(projectId, title, description, metadata);
    if (result.success && result.data) {
      store.addTask(result.data);
      return result.data;
    } else {
      store.setError(result.error || 'Failed to create task');
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Start a task
 */
export function startTask(taskId: string, options?: { parallel?: boolean; workers?: number }): void {
  window.electronAPI.startTask(taskId, options);
}

/**
 * Stop a task
 */
export function stopTask(taskId: string): void {
  window.electronAPI.stopTask(taskId);
}

/**
 * Submit review for a task
 */
export async function submitReview(
  taskId: string,
  approved: boolean,
  feedback?: string
): Promise<boolean> {
  const store = useTaskStore.getState();

  try {
    const result = await window.electronAPI.submitReview(taskId, approved, feedback);
    if (result.success) {
      store.updateTaskStatus(taskId, approved ? 'done' : 'in_progress');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Update task status and persist to file
 */
export async function persistTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<boolean> {
  const store = useTaskStore.getState();

  try {
    // Update local state first for immediate feedback
    store.updateTaskStatus(taskId, status);

    // Persist to file
    const result = await window.electronAPI.updateTaskStatus(taskId, status);
    if (!result.success) {
      console.error('Failed to persist task status:', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error persisting task status:', error);
    return false;
  }
}

/**
 * Update task title/description/metadata and persist to file
 */
export async function persistUpdateTask(
  taskId: string,
  updates: { title?: string; description?: string; metadata?: Partial<TaskMetadata> }
): Promise<boolean> {
  const store = useTaskStore.getState();

  try {
    // Call the IPC to persist changes to spec files
    const result = await window.electronAPI.updateTask(taskId, updates);

    if (result.success && result.data) {
      // Update local state with the returned task data
      store.updateTask(taskId, {
        title: result.data.title,
        description: result.data.description,
        metadata: result.data.metadata,
        updatedAt: new Date()
      });
      return true;
    }

    console.error('Failed to persist task update:', result.error);
    return false;
  } catch (error) {
    console.error('Error persisting task update:', error);
    return false;
  }
}

/**
 * Check if a task has an active running process
 */
export async function checkTaskRunning(taskId: string): Promise<boolean> {
  try {
    const result = await window.electronAPI.checkTaskRunning(taskId);
    return result.success && result.data === true;
  } catch (error) {
    console.error('Error checking task running status:', error);
    return false;
  }
}

/**
 * Recover a stuck task (status shows in_progress but no process running)
 * @param taskId - The task ID to recover
 * @param options - Recovery options (autoRestart defaults to true)
 */
export async function recoverStuckTask(
  taskId: string,
  options: { targetStatus?: TaskStatus; autoRestart?: boolean } = { autoRestart: true }
): Promise<{ success: boolean; message: string; autoRestarted?: boolean }> {
  const store = useTaskStore.getState();

  try {
    const result = await window.electronAPI.recoverStuckTask(taskId, options);

    if (result.success && result.data) {
      // Update local state
      store.updateTaskStatus(taskId, result.data.newStatus);
      return {
        success: true,
        message: result.data.message,
        autoRestarted: result.data.autoRestarted
      };
    }

    return {
      success: false,
      message: result.error || 'Failed to recover task'
    };
  } catch (error) {
    console.error('Error recovering stuck task:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Delete a task and its spec directory
 */
export async function deleteTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const store = useTaskStore.getState();

  try {
    const result = await window.electronAPI.deleteTask(taskId);

    if (result.success) {
      // Remove from local state
      store.setTasks(store.tasks.filter(t => t.id !== taskId && t.specId !== taskId));
      // Clear selection if this task was selected
      if (store.selectedTaskId === taskId) {
        store.selectTask(null);
      }
      return { success: true };
    }

    return {
      success: false,
      error: result.error || 'Failed to delete task'
    };
  } catch (error) {
    console.error('Error deleting task:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Archive tasks
 * Marks tasks as archived by adding archivedAt timestamp to metadata
 */
export async function archiveTasks(
  projectId: string,
  taskIds: string[],
  version?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await window.electronAPI.archiveTasks(projectId, taskIds, version);

    if (result.success) {
      // Reload tasks to update the UI (archived tasks will be filtered out by default)
      await loadTasks(projectId);
      return { success: true };
    }

    return {
      success: false,
      error: result.error || 'Failed to archive tasks'
    };
  } catch (error) {
    console.error('Error archiving tasks:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ============================================
// Task Creation Draft Management
// ============================================

const DRAFT_KEY_PREFIX = 'task-creation-draft';

/**
 * Get the localStorage key for a project's draft
 */
function getDraftKey(projectId: string): string {
  return `${DRAFT_KEY_PREFIX}-${projectId}`;
}

/**
 * Save a task creation draft to localStorage
 * Note: For large images, we only store thumbnails in the draft to avoid localStorage limits
 */
export function saveDraft(draft: TaskDraft): void {
  try {
    const key = getDraftKey(draft.projectId);
    // Create a copy with thumbnails only to avoid localStorage size limits
    const draftToStore = {
      ...draft,
      images: draft.images.map(img => ({
        ...img,
        data: undefined // Don't store full image data in localStorage
      })),
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(draftToStore));
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}

/**
 * Load a task creation draft from localStorage
 */
export function loadDraft(projectId: string): TaskDraft | null {
  try {
    const key = getDraftKey(projectId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const draft = JSON.parse(stored);
    // Convert savedAt back to Date
    draft.savedAt = new Date(draft.savedAt);
    return draft as TaskDraft;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}

/**
 * Clear a task creation draft from localStorage
 */
export function clearDraft(projectId: string): void {
  try {
    const key = getDraftKey(projectId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear draft:', error);
  }
}

/**
 * Check if a draft exists for a project
 */
export function hasDraft(projectId: string): boolean {
  const key = getDraftKey(projectId);
  return localStorage.getItem(key) !== null;
}

/**
 * Check if a draft has any meaningful content (title, description, or images)
 */
export function isDraftEmpty(draft: TaskDraft | null): boolean {
  if (!draft) return true;
  return (
    !draft.title.trim() &&
    !draft.description.trim() &&
    draft.images.length === 0 &&
    !draft.category &&
    !draft.priority &&
    !draft.complexity &&
    !draft.impact
  );
}

// ============================================
// GitHub Issue Linking Helpers
// ============================================

/**
 * Find a task by GitHub issue number
 * Used to check if a task already exists for a GitHub issue
 */
export function getTaskByGitHubIssue(issueNumber: number): Task | undefined {
  const store = useTaskStore.getState();
  return store.tasks.find(t => t.metadata?.githubIssueNumber === issueNumber);
}

// ============================================
// Task State Detection Helpers
// ============================================

/**
 * Check if a task is in human_review but has no completed subtasks.
 * This indicates the task crashed/exited before implementation completed
 * and should be resumed rather than reviewed.
 */
export function isIncompleteHumanReview(task: Task): boolean {
  if (task.status !== 'human_review') return false;

  // If no subtasks defined, task hasn't been planned yet (shouldn't be in human_review)
  if (!task.subtasks || task.subtasks.length === 0) return true;

  // Check if any subtasks are completed
  const completedSubtasks = task.subtasks.filter(s => s.status === 'completed').length;

  // If 0 completed subtasks, this task crashed before implementation
  return completedSubtasks === 0;
}

/**
 * Get the count of completed subtasks for a task
 */
export function getCompletedSubtaskCount(task: Task): number {
  if (!task.subtasks || task.subtasks.length === 0) return 0;
  return task.subtasks.filter(s => s.status === 'completed').length;
}

/**
 * Get task progress info
 */
export function getTaskProgress(task: Task): { completed: number; total: number; percentage: number } {
  const total = task.subtasks?.length || 0;
  const completed = task.subtasks?.filter(s => s.status === 'completed').length || 0;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}
