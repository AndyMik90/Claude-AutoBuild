/**
 * Agent module - modular agent management system
 *
 * This module provides a clean separation of concerns for agent process management:
 * - AgentManager: Main facade for orchestrating agent lifecycle
 * - AgentState: Process tracking and state management
 * - AgentEvents: Event handling and progress parsing
 * - AgentProcessManager: Process spawning and lifecycle
 * - AgentQueueManager: Ideation and roadmap queue management
 */

export { AgentManager } from './agent-manager';
export { AgentState } from './agent-state';
export { AgentEvents } from './agent-events';
export { AgentProcessManager } from './agent-process';
export { AgentQueueManager } from './agent-queue';

export type {
  AgentProcess,
  ExecutionProgressData,
  ProcessType,
  AgentManagerEvents,
  TaskExecutionOptions,
  SpecCreationMetadata,
  IdeationProgressData,
  RoadmapProgressData
} from './types';

// Re-export IdeationConfig from shared types for consistency
export type { IdeationConfig } from '../../shared/types';
