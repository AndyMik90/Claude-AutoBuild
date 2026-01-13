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
import type { Task, QueueStatus, QueueConfig, TaskPriority } from '../shared/types';
import { projectStore } from './project-store';
import { debugLog, debugError } from '../shared/utils/debug-logger';
import { QUEUE_MIN_CONCURRENT, QUEUE_MAX_CONCURRENT, type QueueConcurrent } from '../shared/constants/task';
import type { AgentManager } from './agent/agent-manager';
import { findTaskAndProject } from './ipc-handlers/task/shared';

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
 * Delay to wait for status updates to propagate after a task exits.
 *
 * This is a deliberate trade-off between simplicity and correctness:
 * - Simpler alternative: Track task status in-memory in TaskQueueManager
 * - More complex alternative: Have projectStore emit events/promises on status changes
 *
 * The 500ms delay is pragmatic because:
 * 1. Task status updates typically complete within 100-200ms
 * 2. The queue check happens infrequently (only on task exit)
 * 3. The small delay is imperceptible to users
 * 4. Adding event-based synchronization would complicate projectStore architecture
 *
 * If this proves insufficient (e.g., races on slow systems), the preferred fix is
 * to track running tasks in TaskQueueManager state rather than relying on
 * projectStore's eventually-consistent status.
 */
const STATUS_PROPAGATION_DELAY_MS = 500;

/**
 * Maximum depth of chained promises per project before eviction.
 * Prevents unbounded growth from rapidly queued operations.
 */
const MAX_QUEUE_DEPTH = 50;

/**
 * Time-to-live for processing queue entries in milliseconds.
 * Entries older than this are pruned by the periodic cleanup.
 */
const QUEUE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Interval for periodic pruning of stale processing queue entries.
 */
const PRUNE_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Delay between consecutive task starts to avoid overwhelming the system.
 * Provides a brief pause for the agent to initialize before starting the next task.
 */
const TASK_START_THROTTLE_MS = 100;

/**
 * Processing queue entry with metadata for bounded cleanup
 */
interface ProcessingQueueEntry {
  promise: Promise<void>;
  lastUpdated: number;
  depth: number;
}

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
  /** Per-project promise chain for serializing queue operations with metadata */
  private processingQueue = new Map<string, ProcessingQueueEntry>();
  /** Bound handler for cleanup */
  private boundHandleTaskExit: (taskId: string, exitCode: number | null) => Promise<void>;
  /** Periodic prune interval for cleaning up stale queue entries */
  private pruneInterval: ReturnType<typeof setInterval> | null = null;

  constructor(agentManager: AgentManager, emitter: EventEmitter) {
    this.agentManager = agentManager;
    this.emitter = emitter;

    // Store bound handler for cleanup
    this.boundHandleTaskExit = this.handleTaskExit.bind(this);
    // Listen for task exit events to trigger queue check
    this.emitter.on('exit', this.boundHandleTaskExit);

    // Set up periodic prune to prevent unbounded growth
    this.pruneInterval = setInterval(() => {
      this.pruneProcessingQueue();
    }, PRUNE_INTERVAL_MS);
  }

  /**
   * Stop the queue manager and remove event listeners
   */
  stop(): void {
    this.emitter.off('exit', this.boundHandleTaskExit);
    // Clear the periodic prune interval
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
    }
  }

  /**
   * Prune stale entries from the processing queue.
   * Removes entries that are older than QUEUE_TTL_MS or at/above MAX_QUEUE_DEPTH.
   */
  private pruneProcessingQueue(): void {
    const now = Date.now();
    const originalCount = this.processingQueue.size;

    for (const [projectId, entry] of this.processingQueue.entries()) {
      const age = now - entry.lastUpdated;
      // Remove if entry is stale or depth is at/above max.
      // executeInChain caps depth with Math.min(currentDepth + 1, MAX_QUEUE_DEPTH),
      // so entries that hit exactly MAX_QUEUE_DEPTH have reached the cap and are
      // intentionally pruned on the next prune cycle. This prevents unbounded
      // accumulation of entries that have hit the depth limit.
      if (age > QUEUE_TTL_MS || entry.depth >= MAX_QUEUE_DEPTH) {
        this.processingQueue.delete(projectId);
      }
    }

    if (this.processingQueue.size < originalCount) {
      debugLog('[TaskQueueManager] Pruned processing queue:', {
        before: originalCount,
        after: this.processingQueue.size,
        removed: originalCount - this.processingQueue.size
      });
    }
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
      return { enabled: false, maxConcurrent: QUEUE_MIN_CONCURRENT satisfies QueueConcurrent };
    }

    let maxConcurrent = project.settings.queueConfig.maxConcurrent;
    // Validate maxConcurrent is a number within allowed range
    if (typeof maxConcurrent !== 'number' || !Number.isInteger(maxConcurrent) || maxConcurrent < QUEUE_MIN_CONCURRENT || maxConcurrent > QUEUE_MAX_CONCURRENT) {
      debugLog('[TaskQueueManager] Invalid maxConcurrent value:', maxConcurrent, ', falling back to QUEUE_MIN_CONCURRENT');
      maxConcurrent = QUEUE_MIN_CONCURRENT;
    }

    return {
      enabled: project.settings.queueConfig.enabled || false,
      maxConcurrent: maxConcurrent satisfies QueueConcurrent
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
   * Execute an operation within the processing queue chain for a project.
   * This helper encapsulates the shared promise-chaining logic used by
   * handleTaskExit and triggerQueue to prevent duplication.
   *
   * @param projectId - Project ID to chain the operation for
   * @param operation - Async operation to execute within the chain
   * @param rethrow - Whether to re-throw errors (false for event handlers)
   */
  private async executeInChain(
    projectId: string,
    operation: () => Promise<void>,
    rethrow: boolean = false
  ): Promise<void> {
    // Get or create the processing promise chain for this project
    const existingEntry = this.processingQueue.get(projectId);
    const existingChain = existingEntry?.promise || Promise.resolve();
    const currentDepth = existingEntry?.depth ?? 0;

    // Chain this operation onto the existing one
    const processingPromise = existingChain.then(async () => {
      try {
        await operation();
      } catch (error) {
        debugError('[TaskQueueManager] Error in promise chain:', error);
        // Emit queue status update even on error to keep state consistent
        this.emitQueueStatusUpdate(projectId);
        if (rethrow) {
          throw error; // Re-throw for upstream handlers
        }
        // Don't re-throw for event handlers to prevent unhandled rejection
      }
    });

    // Create entry with updated metadata
    const entry: ProcessingQueueEntry = {
      promise: processingPromise,
      lastUpdated: Date.now(),
      depth: Math.min(currentDepth + 1, MAX_QUEUE_DEPTH)
    };

    // Update the chain (removes the completed promise to prevent memory leak)
    processingPromise.finally(() => {
      // Only remove if it's still the current chain
      const current = this.processingQueue.get(projectId);
      if (current && current.promise === processingPromise) {
        this.processingQueue.delete(projectId);
      }
    });

    this.processingQueue.set(projectId, entry);

    // Wait for this operation to complete
    await processingPromise;
  }

  /**
   * Handle task exit event - trigger queue check
   * Uses per-project promise chaining to prevent race conditions
   */
  private async handleTaskExit(taskId: string, exitCode: number | null): Promise<void> {
    debugLog('[TaskQueueManager] Task exit:', { taskId, exitCode });

    // Find the project for this task
    const { task, project } = findTaskAndProject(taskId);
    if (!task || !project) {
      debugLog('[TaskQueueManager] Task or project not found, skipping queue check');
      return;
    }

    const projectId = project.id;

    // Execute queue check in the promise chain (no rethrow for event handler)
    await this.executeInChain(projectId, async () => {
      // Check if queue is enabled for this project
      const config = this.getQueueConfig(projectId);
      if (!config.enabled) {
        debugLog('[TaskQueueManager] Queue not enabled for project:', projectId);
        return;
      }

      // Wait for status updates to propagate before checking if we can start more tasks.
      // See STATUS_PROPAGATION_DELAY_MS documentation for the trade-off analysis.
      await new Promise(resolve => setTimeout(resolve, STATUS_PROPAGATION_DELAY_MS));

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
    }, false); // No rethrow for event handler
  }

  /**
   * Trigger the next task from backlog for a project
   * Private method to ensure it's only called through the promise chain
   */
  private async triggerNextTask(projectId: string): Promise<boolean> {
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
        // Handle both Date and string createdAt fields defensively
        const timestampA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const timestampB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return timestampA - timestampB;
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

    // Check if task is already running to prevent duplicate starts
    if (this.agentManager.isRunning(nextTask.id)) {
      debugLog('[TaskQueueManager] Task already running, skipping:', nextTask.id);
      return false;
    }

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
   * Manually trigger queue processing for a project.
   * Starts up to maxConcurrent tasks from backlog.
   *
   * Uses per-project promise chaining to prevent race conditions with
   * handleTaskExit, ensuring maxConcurrent is never exceeded.
   */
  async triggerQueue(projectId: string): Promise<void> {
    const config = this.getQueueConfig(projectId);
    if (!config.enabled) {
      debugLog('[TaskQueueManager] Queue not enabled, skipping trigger');
      return;
    }

    debugLog('[TaskQueueManager] Manually triggering queue for project:', projectId);

    // Execute queue trigger in the promise chain (with rethrow for caller)
    await this.executeInChain(projectId, async () => {
      // Fetch fresh config inside the promise chain to avoid stale values
      const freshConfig = this.getQueueConfig(projectId);
      if (!freshConfig.enabled) {
        return;
      }

      // Start tasks until we reach max concurrent or run out of backlog
      // Re-check canStartMoreTasks() before each iteration to handle status updates
      let startedCount = 0;
      while (this.canStartMoreTasks(projectId)) {
        const started = await this.triggerNextTask(projectId);
        if (!started) {
          break; // Stop if we can't start more tasks
        }
        startedCount++;
        // Small delay between starts to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, TASK_START_THROTTLE_MS));
      }

      debugLog('[TaskQueueManager] Started', startedCount, 'tasks from backlog');

      // Emit queue status update
      this.emitQueueStatusUpdate(projectId);
    }, true); // Rethrow for upstream handlers
  }

  /**
   * Emit queue status update to renderer
   */
  private emitQueueStatusUpdate(projectId: string): void {
    const status = this.getQueueStatus(projectId);
    this.emitter.emit('queue-status-update', projectId, status);
  }
}
