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

  if (DEBUG) {
    console.log('[phase-event-parser] Found marker at index', markerIndex, 'in line:', line.substring(0, 200));
  }

  const jsonStr = line.slice(markerIndex + PHASE_MARKER_PREFIX.length).trim();
  if (!jsonStr) {
    if (DEBUG) {
      console.log('[phase-event-parser] Empty JSON string after marker');
    }
    return null;
  }

  if (DEBUG) {
    console.log('[phase-event-parser] Attempting to parse JSON:', jsonStr.substring(0, 200));
  }

  try {
    const payload = JSON.parse(jsonStr) as Record<string, unknown>;

    if (typeof payload.phase !== 'string' || !VALID_PHASES.includes(payload.phase)) {
      if (DEBUG) {
        console.log('[phase-event-parser] Invalid phase:', payload.phase, 'valid phases:', VALID_PHASES);
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

    if (DEBUG) {
      console.log('[phase-event-parser] Successfully parsed event:', event);
    }

    return event;
  } catch (e) {
    if (DEBUG) {
      console.log('[phase-event-parser] JSON parse FAILED for:', jsonStr);
      console.log('[phase-event-parser] Error:', e);
    }
    return null;
  }
}

export function hasPhaseMarker(line: string): boolean {
  return line.includes(PHASE_MARKER_PREFIX);
}
