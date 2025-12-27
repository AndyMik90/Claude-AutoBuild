/**
 * Phase Event Protocol Constants
 * ===============================
 * Single source of truth for execution phase communication between
 * Python backend and TypeScript frontend.
 *
 * SYNC REQUIREMENT: Phase values must match apps/backend/core/phase_event.py
 *
 * Protocol: __EXEC_PHASE__:{"phase":"coding","message":"Starting"}
 */

// Protocol marker prefix - must match Python's PHASE_MARKER_PREFIX
export const PHASE_MARKER_PREFIX = '__EXEC_PHASE__:' as const;

// Protocol version for future compatibility checks
export const PHASE_PROTOCOL_VERSION = '1.0.0' as const;

/**
 * All execution phases in order of progression.
 * Order matters for regression detection.
 *
 * 'idle' is frontend-only (initial state before any backend events)
 */
export const EXECUTION_PHASES = [
  'idle',
  'planning',
  'coding',
  'qa_review',
  'qa_fixing',
  'complete',
  'failed'
] as const;

/**
 * Phases that can be emitted by the Python backend.
 * Subset of EXECUTION_PHASES (excludes 'idle')
 */
export const BACKEND_PHASES = [
  'planning',
  'coding',
  'qa_review',
  'qa_fixing',
  'complete',
  'failed'
] as const;

// Types derived from constants (single source of truth)
export type ExecutionPhase = (typeof EXECUTION_PHASES)[number];
export type BackendPhase = (typeof BACKEND_PHASES)[number];

/**
 * Phase ordering index for regression detection.
 * Higher index = later in the pipeline.
 * Used to prevent fallback text matching from regressing phases.
 */
export const PHASE_ORDER_INDEX: Readonly<Record<ExecutionPhase, number>> = {
  idle: -1,
  planning: 0,
  coding: 1,
  qa_review: 2,
  qa_fixing: 3,
  complete: 4,
  failed: 99
} as const;

/**
 * Terminal phases that cannot be changed by fallback text matching.
 * Only structured events can transition away from these.
 */
export const TERMINAL_PHASES: ReadonlySet<ExecutionPhase> = new Set(['complete', 'failed']);

/**
 * Check if a phase transition would be a regression.
 * Used to prevent fallback text matching from going backwards.
 *
 * @param currentPhase - The current phase
 * @param newPhase - The proposed new phase
 * @returns true if transitioning to newPhase would be a regression
 */
export function wouldPhaseRegress(currentPhase: ExecutionPhase, newPhase: ExecutionPhase): boolean {
  const currentIndex = PHASE_ORDER_INDEX[currentPhase];
  const newIndex = PHASE_ORDER_INDEX[newPhase];
  return newIndex < currentIndex;
}

/**
 * Check if a phase is a terminal state.
 *
 * @param phase - The phase to check
 * @returns true if the phase is terminal (complete or failed)
 */
export function isTerminalPhase(phase: ExecutionPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

/**
 * Validate that a string is a valid backend phase.
 *
 * @param value - The string to validate
 * @returns true if the value is a valid BackendPhase
 */
export function isValidBackendPhase(value: string): value is BackendPhase {
  return (BACKEND_PHASES as readonly string[]).includes(value);
}

/**
 * Validate that a string is a valid execution phase.
 *
 * @param value - The string to validate
 * @returns true if the value is a valid ExecutionPhase
 */
export function isValidExecutionPhase(value: string): value is ExecutionPhase {
  return (EXECUTION_PHASES as readonly string[]).includes(value);
}
