import { ChildProcess } from 'child_process';

/**
 * Agent-specific types for process and state management
 */

export type QueueProcessType = 'ideation' | 'roadmap';

export interface AgentProcess {
  taskId: string;
  process: ChildProcess;
  startedAt: Date;
  projectPath?: string; // For ideation processes to load session on completion
  spawnId: number; // Unique ID to identify this specific spawn
  queueProcessType?: QueueProcessType; // Type of queue process (ideation or roadmap)
}

export interface ExecutionProgressData {
  phase: 'idle' | 'planning' | 'coding' | 'qa_review' | 'qa_fixing' | 'complete' | 'failed';
  phaseProgress: number;
  overallProgress: number;
  currentSubtask?: string;
  message?: string;
}

export type ProcessType = 'spec-creation' | 'task-execution' | 'qa-process';

export interface AgentManagerEvents {
  log: (taskId: string, log: string) => void;
  error: (taskId: string, error: string) => void;
  exit: (taskId: string, code: number | null, processType: ProcessType) => void;
  'execution-progress': (taskId: string, progress: ExecutionProgressData) => void;
}

export interface IdeationConfig {
  enabledTypes: string[];
  includeRoadmapContext: boolean;
  includeKanbanContext: boolean;
  maxIdeasPerType: number;
  append?: boolean;
  model?: string;          // Model shorthand (opus, sonnet, haiku)
  thinkingLevel?: string;  // Thinking level (none, low, medium, high, ultrathink)
}

export interface RoadmapConfig {
  model?: string;          // Model shorthand (opus, sonnet, haiku)
  thinkingLevel?: string;  // Thinking level (none, low, medium, high, ultrathink)
}

export interface TaskExecutionOptions {
  parallel?: boolean;
  workers?: number;
  baseBranch?: string;
}

export interface SpecCreationMetadata {
  requireReviewBeforeCoding?: boolean;
  // Auto profile - phase-based model and thinking configuration
  isAutoProfile?: boolean;
  phaseModels?: {
    spec: 'haiku' | 'sonnet' | 'opus';
    planning: 'haiku' | 'sonnet' | 'opus';
    coding: 'haiku' | 'sonnet' | 'opus';
    qa: 'haiku' | 'sonnet' | 'opus';
  };
  phaseThinking?: {
    spec: 'none' | 'low' | 'medium' | 'high' | 'ultrathink';
    planning: 'none' | 'low' | 'medium' | 'high' | 'ultrathink';
    coding: 'none' | 'low' | 'medium' | 'high' | 'ultrathink';
    qa: 'none' | 'low' | 'medium' | 'high' | 'ultrathink';
  };
  // Non-auto profile - single model and thinking level
  model?: 'haiku' | 'sonnet' | 'opus';
  thinkingLevel?: 'none' | 'low' | 'medium' | 'high' | 'ultrathink';
}

export interface IdeationProgressData {
  phase: string;
  progress: number;
  message: string;
  completedTypes?: string[];
}

export interface RoadmapProgressData {
  phase: string;
  progress: number;
  message: string;
}
