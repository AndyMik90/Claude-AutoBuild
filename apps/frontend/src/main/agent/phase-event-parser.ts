/**
 * Structured phase event parser for Python ↔ TypeScript protocol.
 * Protocol: __EXEC_PHASE__:{"phase":"coding","message":"Starting"}
 */

import type { ExecutionPhase } from '../../shared/types/task';

export const PHASE_MARKER_PREFIX = '__EXEC_PHASE__:';
const DEBUG = process.env.DEBUG?.toLowerCase() === 'true' || process.env.DEBUG === '1';

/** Payload structure matching apps/backend/core/phase_event.py */
export interface PhaseEvent {
  phase: ExecutionPhase;
  message: string;
  progress?: number;
  subtask?: string;
}

/** Must stay in sync with apps/backend/core/phase_event.py ExecutionPhase enum */
const VALID_PHASES: readonly string[] = [
  'planning',
  'coding',
  'qa_review',
  'qa_fixing',
  'complete',
  'failed'
] as const;

/**
 * Parse a log line for structured phase event.
 * @returns PhaseEvent if line contains valid phase marker, null otherwise
 */
export function parsePhaseEvent(line: string): PhaseEvent | null {
  const markerIndex = line.indexOf(PHASE_MARKER_PREFIX);
  if (markerIndex === -1) {
    return null;
  }

  const jsonStr = line.slice(markerIndex + PHASE_MARKER_PREFIX.length).trim();
  if (!jsonStr) {
    return null;
  }

  try {
    const payload = JSON.parse(jsonStr) as Record<string, unknown>;

    if (typeof payload.phase !== 'string' || !VALID_PHASES.includes(payload.phase)) {
      if (DEBUG) {
        console.log('[phase-event-parser] Invalid phase:', payload.phase);
      }
      return null;
    }

    const event: PhaseEvent = {
      phase: payload.phase as ExecutionPhase,
      message: typeof payload.message === 'string' ? payload.message : ''
    };

    if (typeof payload.progress === 'number') {
      event.progress = payload.progress;
    }

    if (typeof payload.subtask === 'string') {
      event.subtask = payload.subtask;
    }

    return event;
  } catch (e) {
    if (DEBUG) {
      console.log('[phase-event-parser] JSON parse failed:', jsonStr, e);
    }
    return null;
  }
}

export function hasPhaseMarker(line: string): boolean {
  return line.includes(PHASE_MARKER_PREFIX);
}
