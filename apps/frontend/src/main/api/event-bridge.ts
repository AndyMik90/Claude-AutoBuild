/**
 * Event Bridge for WebSocket Integration
 *
 * Bridges events from AgentManager and FileWatcher to WebSocket clients.
 * This module decouples the event sources (IPC handlers) from the WebSocket
 * transport layer, allowing the same events to be consumed by both:
 * - Electron IPC (for the desktop UI)
 * - WebSocket clients (for remote/mobile access)
 *
 * Based on patterns from:
 * - apps/frontend/src/main/ipc-handlers/agent-events-handlers.ts
 */

import type { AgentManager, ProcessType, ExecutionProgressData } from '../agent';
import type { FileWatcher } from '../file-watcher';
import type { ImplementationPlan, TaskStatus } from '../../shared/types';
import {
  broadcastTaskLog,
  broadcastTaskError,
  broadcastTaskStatusChange,
  broadcastTaskExecutionProgress,
  broadcastTaskProgress,
} from './websocket';

// ============================================
// Types
// ============================================

/**
 * Event bridge configuration options
 */
export interface EventBridgeOptions {
  /** Enable verbose logging of bridged events */
  debug?: boolean;
}

/**
 * Event bridge state
 */
interface EventBridgeState {
  /** Whether the bridge is currently active */
  isActive: boolean;
  /** Timestamp when bridge was initialized */
  initializedAt: Date | null;
  /** Count of events bridged since initialization */
  eventCount: number;
}

// ============================================
// Module State
// ============================================

/**
 * Current bridge state
 */
const state: EventBridgeState = {
  isActive: false,
  initializedAt: null,
  eventCount: 0,
};

/**
 * Cleanup functions for event listeners
 */
const cleanupFunctions: Array<() => void> = [];

/**
 * Debug mode flag
 */
let debugMode = false;

// ============================================
// Event Handlers
// ============================================

/**
 * Handle log events from AgentManager
 */
function handleAgentLog(taskId: string, log: string): void {
  state.eventCount++;
  if (debugMode) {
    // Truncate log for debug output
    const truncatedLog = log.length > 100 ? log.substring(0, 100) + '...' : log;
    process.stdout.write(`[EventBridge] log: ${taskId} - ${truncatedLog}\n`);
  }
  broadcastTaskLog(taskId, log);
}

/**
 * Handle error events from AgentManager
 */
function handleAgentError(taskId: string, error: string): void {
  state.eventCount++;
  if (debugMode) {
    process.stdout.write(`[EventBridge] error: ${taskId} - ${error}\n`);
  }
  broadcastTaskError(taskId, error);
}

/**
 * Handle exit events from AgentManager
 * Maps process exit to task status change
 */
function handleAgentExit(taskId: string, code: number | null, processType: ProcessType): void {
  state.eventCount++;

  // Determine new status based on process type and exit code
  // This mirrors the logic in agent-events-handlers.ts
  let newStatus: TaskStatus;

  if (processType === 'spec-creation') {
    // Spec creation doesn't trigger a status change via WebSocket
    // The status is updated through other means
    if (debugMode) {
      process.stdout.write(`[EventBridge] exit (spec-creation): ${taskId} code=${code}\n`);
    }
    return;
  }

  if (processType === 'task-execution' || processType === 'qa-process') {
    // Task execution or QA process completed -> Human Review
    newStatus = 'human_review';
  } else {
    // Unknown process type -> Human Review
    newStatus = 'human_review';
  }

  if (debugMode) {
    process.stdout.write(
      `[EventBridge] exit: ${taskId} code=${code} type=${processType} -> ${newStatus}\n`
    );
  }

  broadcastTaskStatusChange(taskId, newStatus);
}

/**
 * Handle execution progress events from AgentManager
 */
function handleExecutionProgress(taskId: string, progress: ExecutionProgressData): void {
  state.eventCount++;
  if (debugMode) {
    process.stdout.write(
      `[EventBridge] execution-progress: ${taskId} phase=${progress.phase} ` +
        `overall=${progress.overallProgress}%\n`
    );
  }

  // Forward the execution progress to WebSocket clients
  broadcastTaskExecutionProgress(taskId, {
    phase: progress.phase,
    phaseProgress: progress.phaseProgress,
    overallProgress: progress.overallProgress,
    currentSubtask: progress.currentSubtask,
    message: progress.message,
  });

  // Auto-move task to AI Review when entering qa_review phase
  // This mirrors the behavior in agent-events-handlers.ts
  if (progress.phase === 'qa_review') {
    if (debugMode) {
      process.stdout.write(`[EventBridge] status-change (qa_review): ${taskId} -> ai_review\n`);
    }
    broadcastTaskStatusChange(taskId, 'ai_review');
  }
}

/**
 * Handle progress events from FileWatcher
 */
function handleFileWatcherProgress(taskId: string, plan: ImplementationPlan): void {
  state.eventCount++;
  if (debugMode) {
    const subtaskCount = plan.phases?.reduce(
      (acc, phase) => acc + (phase.subtasks?.length || 0),
      0
    ) || 0;
    process.stdout.write(
      `[EventBridge] file-progress: ${taskId} status=${plan.status} subtasks=${subtaskCount}\n`
    );
  }
  broadcastTaskProgress(taskId, plan);
}

/**
 * Handle error events from FileWatcher
 */
function handleFileWatcherError(taskId: string, error: string): void {
  state.eventCount++;
  if (debugMode) {
    process.stdout.write(`[EventBridge] file-error: ${taskId} - ${error}\n`);
  }
  broadcastTaskError(taskId, error);
}

// ============================================
// Public API
// ============================================

/**
 * Initialize the event bridge to forward events to WebSocket clients
 *
 * This function subscribes to events from AgentManager and FileWatcher
 * and forwards them to connected WebSocket clients via the broadcast functions.
 *
 * @param agentManager - The AgentManager instance to subscribe to
 * @param fileWatcher - The FileWatcher instance to subscribe to
 * @param options - Optional configuration
 */
export function initializeEventBridge(
  agentManager: AgentManager,
  fileWatcher: FileWatcher,
  options: EventBridgeOptions = {}
): void {
  // Prevent double initialization
  if (state.isActive) {
    if (debugMode) {
      process.stdout.write('[EventBridge] Already initialized, skipping\n');
    }
    return;
  }

  debugMode = options.debug ?? false;

  if (debugMode) {
    process.stdout.write('[EventBridge] Initializing event bridge\n');
  }

  // ============================================
  // Subscribe to AgentManager Events
  // ============================================

  agentManager.on('log', handleAgentLog);
  cleanupFunctions.push(() => agentManager.off('log', handleAgentLog));

  agentManager.on('error', handleAgentError);
  cleanupFunctions.push(() => agentManager.off('error', handleAgentError));

  agentManager.on('exit', handleAgentExit);
  cleanupFunctions.push(() => agentManager.off('exit', handleAgentExit));

  agentManager.on('execution-progress', handleExecutionProgress);
  cleanupFunctions.push(() => agentManager.off('execution-progress', handleExecutionProgress));

  // ============================================
  // Subscribe to FileWatcher Events
  // ============================================

  fileWatcher.on('progress', handleFileWatcherProgress);
  cleanupFunctions.push(() => fileWatcher.off('progress', handleFileWatcherProgress));

  fileWatcher.on('error', handleFileWatcherError);
  cleanupFunctions.push(() => fileWatcher.off('error', handleFileWatcherError));

  // Update state
  state.isActive = true;
  state.initializedAt = new Date();
  state.eventCount = 0;

  if (debugMode) {
    process.stdout.write('[EventBridge] Event bridge initialized successfully\n');
  }
}

/**
 * Shutdown the event bridge and remove all event listeners
 *
 * This should be called during graceful shutdown to clean up resources.
 */
export function shutdownEventBridge(): void {
  if (!state.isActive) {
    return;
  }

  if (debugMode) {
    process.stdout.write(
      `[EventBridge] Shutting down (bridged ${state.eventCount} events)\n`
    );
  }

  // Run all cleanup functions
  for (const cleanup of cleanupFunctions) {
    try {
      cleanup();
    } catch {
      // Ignore cleanup errors during shutdown
    }
  }

  // Clear cleanup functions
  cleanupFunctions.length = 0;

  // Reset state
  state.isActive = false;
  state.initializedAt = null;
  state.eventCount = 0;

  if (debugMode) {
    process.stdout.write('[EventBridge] Event bridge shut down successfully\n');
  }
}

/**
 * Check if the event bridge is currently active
 */
export function isEventBridgeActive(): boolean {
  return state.isActive;
}

/**
 * Get event bridge statistics
 */
export function getEventBridgeStats(): {
  isActive: boolean;
  initializedAt: Date | null;
  eventCount: number;
  uptimeMs: number | null;
} {
  return {
    isActive: state.isActive,
    initializedAt: state.initializedAt,
    eventCount: state.eventCount,
    uptimeMs: state.initializedAt ? Date.now() - state.initializedAt.getTime() : null,
  };
}

/**
 * Enable or disable debug mode
 */
export function setEventBridgeDebug(enabled: boolean): void {
  debugMode = enabled;
}
