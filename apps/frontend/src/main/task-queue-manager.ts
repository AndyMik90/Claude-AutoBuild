/**
 * Task Queue Manager - Automatic task scheduling from Planning to In Progress
 *
 * This manager handles the automatic queueing of tasks from backlog to in_progress
 * when slots are available. It integrates with the AgentManager to start tasks
 * and emits events to keep the UI in sync.
 *
 * Features:
 * - Monitors task completion events
 * - Checks if queue is enabled for the project
 * - Counts running tasks vs max concurrent limit
 * - Automatically starts the next backlog task when slots are available
 * - Emits queue status updates to the UI
 *
 * Queue Config Persistence:
 * - Stored in project.settings.queueConfig (ProjectSettings type)
 * - Saved via projectStore.updateProjectSettings()
 */

import { EventEmitter } from 'events';
import type { Task, TaskStatus, QueueStatus, QueueConfig, TaskPriority, Project } from '../shared/types';
import { projectStore } from './project-store';
import { debugLog, debugError } from '../shared/utils/debug-logger';
import { QUEUE_MIN_CONCURRENT } from '../shared/constants/task';
import type { AgentManager } from './agent/agent-manager';

/**
 * Priority weight for sorting tasks (higher = more important)
 */
const PRIORITY_WEIGHT: Record<TaskPriority | '', number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  '': 0 // No priority set
};

/**
 * Task Queue Manager
 *
 * Manages automatic task scheduling from backlog to in_progress
 * based on project queue configuration.
 *
 * Queue Order:
 * 1. Priority (urgent > high > medium > low > none)
 * 2. Creation date (oldest first within same priority)
 */
export class TaskQueueManager {
  private agentManager: AgentManager;
  private emitter: EventEmitter;
  /** Per-project promise chain for serializing queue operations */
  private processingQueue = new Map<string, Promise<void>>();
  /** Bound handler for cleanup */
  private boundHandleTaskExit: (taskId: string, exitCode: number | null) => Promise<void>;

  constructor(agentManager: AgentManager, emitter: EventEmitter) {
    this.agentManager = agentManager;
    this.emitter = emitter;

    // Store bound handler for cleanup
    this.boundHandleTaskExit = this.handleTaskExit.bind(this);
    // Listen for task exit events to trigger queue check
    this.emitter.on('exit', this.boundHandleTaskExit);
  }

  /**
   * Stop the queue manager and remove event listeners
   */
  stop(): void {
    this.emitter.off('exit', this.boundHandleTaskExit);
  }

  /**
   * Get priority weight for a task (higher = more important)
   */
  private getPriorityWeight(task: Task): number {
    const priority = task.metadata?.priority || '';
    return PRIORITY_WEIGHT[priority] ?? 0;
  }

  /**
   * Get queue configuration for a project
   */
  getQueueConfig(projectId: string): QueueConfig {
    const project = projectStore.getProject(projectId);
    if (!project?.settings.queueConfig) {
      return { enabled: false, maxConcurrent: QUEUE_MIN_CONCURRENT as 1 | 2 | 3 };
    }
    return {
      enabled: project.settings.queueConfig.enabled || false,
      maxConcurrent: (project.settings.queueConfig.maxConcurrent || QUEUE_MIN_CONCURRENT) as 1 | 2 | 3
    };
  }

  /**
   * Get queue status for a project (includes running/backlog counts)
   */
  getQueueStatus(projectId: string): QueueStatus {
    const config = this.getQueueConfig(projectId);
    const tasks = projectStore.getTasks(projectId);

    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const backlogTasks = tasks.filter(t => t.status === 'backlog');

    return {
      enabled: config.enabled,
      maxConcurrent: config.maxConcurrent,
      runningCount: inProgressTasks.length,
      backlogCount: backlogTasks.length
    };
  }

  /**
   * Check if the queue can start more tasks for a project
   */
  canStartMoreTasks(projectId: string): boolean {
    const config = this.getQueueConfig(projectId);
    if (!config.enabled) {
      return false;
    }

    const status = this.getQueueStatus(projectId);
    return status.runningCount < status.maxConcurrent && status.backlogCount > 0;
  }

  /**
   * Handle task exit event - trigger queue check
   * Uses per-project promise chaining to prevent race conditions
   */
  private async handleTaskExit(taskId: string, exitCode: number | null): Promise<void> {
    debugLog('[TaskQueueManager] Task exit:', { taskId, exitCode });

    // Find the project for this task
    const { task, project } = this.findTaskAndProject(taskId);
    if (!task || !project) {
      debugLog('[TaskQueueManager] Task or project not found, skipping queue check');
      return;
    }

    // Get or create the processing promise chain for this project
    const projectId = project.id;
    const existingChain = this.processingQueue.get(projectId) || Promise.resolve();

    // Chain this operation onto the existing one
    const processingPromise = existingChain.then(async () => {
      // Check if queue is enabled for this project
      const config = this.getQueueConfig(projectId);
      if (!config.enabled) {
        debugLog('[TaskQueueManager] Queue not enabled for project:', projectId);
        return;
      }

      // Wait a bit for status updates to propagate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if we can start more tasks
      if (this.canStartMoreTasks(projectId)) {
        debugLog('[TaskQueueManager] Queue can start more tasks, triggering next task');
        await this.triggerNextTask(projectId);
      } else {
        debugLog('[TaskQueueManager] Queue cannot start more tasks',
          this.getQueueStatus(projectId)
        );
      }

      // Emit queue status update
      this.emitQueueStatusUpdate(projectId);
    });

    // Update the chain (removes the completed promise to prevent memory leak)
    processingPromise.then(() => {
      // Only remove if it's still the current chain
      if (this.processingQueue.get(projectId) === processingPromise) {
        this.processingQueue.delete(projectId);
      }
    });

    this.processingQueue.set(projectId, processingPromise);

    // Wait for this operation to complete
    await processingPromise;
  }

  /**
   * Trigger the next task from backlog for a project
   */
  async triggerNextTask(projectId: string): Promise<boolean> {
    const project = projectStore.getProject(projectId);
    if (!project) {
      debugError('[TaskQueueManager] Project not found:', projectId);
      return false;
    }

    const status = this.getQueueStatus(projectId);
    if (status.runningCount >= status.maxConcurrent) {
      debugLog('[TaskQueueManager] Max concurrent tasks reached:', status);
      return false;
    }

    if (status.backlogCount === 0) {
      debugLog('[TaskQueueManager] No backlog tasks to start');
      return false;
    }

    // Get backlog tasks, sorted by priority (highest first), then by creation date (oldest first)
    const tasks = projectStore.getTasks(projectId);
    const backlogTasks = tasks
      .filter(t => t.status === 'backlog')
      .sort((a, b) => {
        // First sort by priority (higher weight = more important = should be first)
        const priorityDiff = this.getPriorityWeight(b) - this.getPriorityWeight(a);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        // Within same priority, sort by creation date (oldest first = FIFO)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    if (backlogTasks.length === 0) {
      debugLog('[TaskQueueManager] No backlog tasks available (race condition)');
      return false;
    }

    const nextTask = backlogTasks[0];
    debugLog('[TaskQueueManager] Starting next task from queue:', {
      id: nextTask.id,
      priority: nextTask.metadata?.priority || 'none',
      title: nextTask.title
    });

    // Start the task
    try {
      await this.agentManager.startTaskExecution(
        nextTask.id,
        project.path,
        nextTask.specId,
        {}
      );
      debugLog('[TaskQueueManager] Task started successfully:', nextTask.id);
      return true;
    } catch (error) {
      debugError('[TaskQueueManager] Failed to start task:', error);
      return false;
    }
  }

  /**
   * Manually trigger queue processing for a project
   * Starts up to maxConcurrent tasks from backlog
   */
  async triggerQueue(projectId: string): Promise<void> {
    const config = this.getQueueConfig(projectId);
    if (!config.enabled) {
      debugLog('[TaskQueueManager] Queue not enabled, skipping trigger');
      return;
    }

    debugLog('[TaskQueueManager] Manually triggering queue for project:', projectId);

    // Start tasks until we reach max concurrent or run out of backlog
    const status = this.getQueueStatus(projectId);
    const tasksToStart = Math.min(config.maxConcurrent - status.runningCount, status.backlogCount);

    debugLog('[TaskQueueManager] Will start', tasksToStart, 'tasks from backlog');

    for (let i = 0; i < tasksToStart; i++) {
      const started = await this.triggerNextTask(projectId);
      if (!started) {
        break; // Stop if we can't start more tasks
      }
      // Small delay between starts to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Emit queue status update
    this.emitQueueStatusUpdate(projectId);
  }

  /**
   * Emit queue status update to renderer
   */
  private emitQueueStatusUpdate(projectId: string): void {
    const status = this.getQueueStatus(projectId);
    this.emitter.emit('queue-status-update', projectId, status);
  }

  /**
   * Helper to find task and project by taskId
   * (copied from task/shared.ts to avoid circular dependencies)
   */
  private findTaskAndProject(taskId: string): { task: Task | undefined; project: Project | undefined } {
    const projects = projectStore.getProjects();
    let task: Task | undefined;
    let project: Project | undefined;

    for (const p of projects) {
      const tasks = projectStore.getTasks(p.id);
      task = tasks.find((t) => t.id === taskId || t.specId === taskId);
      if (task) {
        project = p;
        break;
      }
    }

    return { task, project };
  }
}
