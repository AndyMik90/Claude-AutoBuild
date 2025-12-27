/**
 * Structured phase event parser for Python ↔ TypeScript protocol.
 * Protocol: __EXEC_PHASE__:{"phase":"coding","message":"Starting"}
 */

import { PHASE_MARKER_PREFIX } from '../../shared/constants/phase-protocol';
import { validatePhaseEvent, type PhaseEventPayload } from './phase-event-schema';

export { PHASE_MARKER_PREFIX };
export type { PhaseEventPayload as PhaseEvent };

const DEBUG = process.env.DEBUG?.toLowerCase() === 'true' || process.env.DEBUG === '1';

export function parsePhaseEvent(line: string): PhaseEventPayload | null {
  const markerIndex = line.indexOf(PHASE_MARKER_PREFIX);
  if (markerIndex === -1) {
    return null;
  }

  if (DEBUG) {
    console.log('[phase-event-parser] Found marker at index', markerIndex, 'in line:', line.substring(0, 200));
  }

  const rawJsonStr = line.slice(markerIndex + PHASE_MARKER_PREFIX.length).trim();
  if (!rawJsonStr) {
    if (DEBUG) {
      console.log('[phase-event-parser] Empty JSON string after marker');
    }
    return null;
  }

  const jsonStr = extractJsonObject(rawJsonStr);
  if (!jsonStr) {
    if (DEBUG) {
      console.log('[phase-event-parser] Could not extract JSON object from:', rawJsonStr.substring(0, 200));
    }
    return null;
  }

  if (DEBUG) {
    console.log('[phase-event-parser] Attempting to parse JSON:', jsonStr.substring(0, 200));
  }

  try {
    const rawPayload = JSON.parse(jsonStr) as unknown;
    const result = validatePhaseEvent(rawPayload);

    if (!result.success) {
      if (DEBUG) {
        console.log('[phase-event-parser] Validation failed:', result.error.format());
      }
      return null;
    }

    if (DEBUG) {
      console.log('[phase-event-parser] Successfully parsed event:', result.data);
    }

    return result.data;
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

/**
 * Extract a JSON object from a string that may have trailing garbage.
 * Finds the matching closing brace for the first opening brace.
 */
function extractJsonObject(str: string): string | null {
  const firstBrace = str.indexOf('{');
  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = firstBrace; i < str.length; i++) {
    const char = str[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(firstBrace, i + 1);
      }
    }
  }

  return null;
}
