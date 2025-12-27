/**
 * Phase Event Parser Tests
 * =========================
 * Tests the parser for __EXEC_PHASE__ protocol between Python backend and TypeScript frontend.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePhaseEvent,
  hasPhaseMarker,
  PHASE_MARKER_PREFIX
} from '../agent/phase-event-parser';

describe('Phase Event Parser', () => {
  describe('PHASE_MARKER_PREFIX', () => {
    it('should have correct value', () => {
      expect(PHASE_MARKER_PREFIX).toBe('__EXEC_PHASE__:');
    });

    it('should end with colon', () => {
      expect(PHASE_MARKER_PREFIX.endsWith(':')).toBe(true);
    });
  });

  describe('parsePhaseEvent', () => {
    describe('Basic Parsing', () => {
      it('should parse valid phase event', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Starting implementation"}';
        const result = parsePhaseEvent(line);

        expect(result).not.toBeNull();
        expect(result?.phase).toBe('coding');
        expect(result?.message).toBe('Starting implementation');
      });

      it('should return null for line without marker', () => {
        const line = 'Just a regular log line';
        const result = parsePhaseEvent(line);

        expect(result).toBeNull();
      });

      it('should handle marker at start of line', () => {
        const line = '__EXEC_PHASE__:{"phase":"planning","message":"Creating plan"}';
        const result = parsePhaseEvent(line);

        expect(result).not.toBeNull();
        expect(result?.phase).toBe('planning');
      });

      it('should handle marker with prefix text', () => {
        const line = '[2024-01-01 12:00:00] INFO: __EXEC_PHASE__:{"phase":"coding","message":"Working"}';
        const result = parsePhaseEvent(line);

        expect(result).not.toBeNull();
        expect(result?.phase).toBe('coding');
      });

      it('should handle ANSI color codes around JSON by extracting valid JSON', () => {
        const line = '\x1b[32m__EXEC_PHASE__:{"phase":"coding","message":"Test"}\x1b[0m';
        const result = parsePhaseEvent(line);

        expect(result).not.toBeNull();
        expect(result?.phase).toBe('coding');
        expect(result?.message).toBe('Test');
      });
    });

    describe('Phase Validation', () => {
      it('should accept planning phase', () => {
        const line = '__EXEC_PHASE__:{"phase":"planning","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('planning');
      });

      it('should accept coding phase', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('coding');
      });

      it('should accept qa_review phase', () => {
        const line = '__EXEC_PHASE__:{"phase":"qa_review","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('qa_review');
      });

      it('should accept qa_fixing phase', () => {
        const line = '__EXEC_PHASE__:{"phase":"qa_fixing","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('qa_fixing');
      });

      it('should accept complete phase', () => {
        const line = '__EXEC_PHASE__:{"phase":"complete","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('complete');
      });

      it('should accept failed phase', () => {
        const line = '__EXEC_PHASE__:{"phase":"failed","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('failed');
      });

      it('should reject unknown phase value', () => {
        const line = '__EXEC_PHASE__:{"phase":"unknown_phase","message":""}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should reject uppercase phase value', () => {
        const line = '__EXEC_PHASE__:{"phase":"CODING","message":""}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should reject numeric phase value', () => {
        const line = '__EXEC_PHASE__:{"phase":123,"message":""}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should reject null phase value', () => {
        const line = '__EXEC_PHASE__:{"phase":null,"message":""}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });
    });

    describe('Message Handling', () => {
      it('should extract message field', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Building feature X"}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toBe('Building feature X');
      });

      it('should handle empty message', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":""}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toBe('');
      });

      it('should default to empty string for missing message', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding"}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toBe('');
      });

      it('should handle unicode in message', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Building 🚀 feature with émojis"}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toContain('🚀');
        expect(result?.message).toContain('émojis');
      });

      it('should handle escaped quotes in message', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Message with \\"quotes\\""}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toContain('"quotes"');
      });

      it('should handle escaped newlines in message (JSON format)', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Line1\\nLine2"}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toBe('Line1\nLine2');
      });

      it('should handle escaped backslashes', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"path\\\\to\\\\file"}';
        const result = parsePhaseEvent(line);
        expect(result?.message).toBe('path\\to\\file');
      });

      it('should reject non-string message', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":123}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });
    });

    describe('Optional Fields', () => {
      it('should extract progress when present', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","progress":50}';
        const result = parsePhaseEvent(line);
        expect(result?.progress).toBe(50);
      });

      it('should not include progress when not present', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working"}';
        const result = parsePhaseEvent(line);
        expect(result?.progress).toBeUndefined();
      });

      it('should handle progress of 0', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Starting","progress":0}';
        const result = parsePhaseEvent(line);
        expect(result?.progress).toBe(0);
      });

      it('should handle progress of 100', () => {
        const line = '__EXEC_PHASE__:{"phase":"complete","message":"Done","progress":100}';
        const result = parsePhaseEvent(line);
        expect(result?.progress).toBe(100);
      });

      it('should reject non-numeric progress', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","progress":"50%"}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should reject progress below 0', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","progress":-1}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should reject progress above 100', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","progress":101}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should reject non-integer progress', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","progress":50.5}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should extract subtask when present', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","subtask":"task-123"}';
        const result = parsePhaseEvent(line);
        expect(result?.subtask).toBe('task-123');
      });

      it('should not include subtask when not present', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working"}';
        const result = parsePhaseEvent(line);
        expect(result?.subtask).toBeUndefined();
      });

      it('should handle subtask with special characters', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","subtask":"feat/add-login#123"}';
        const result = parsePhaseEvent(line);
        expect(result?.subtask).toBe('feat/add-login#123');
      });

      it('should reject non-string subtask', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","subtask":123}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should handle all optional fields together', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","progress":75,"subtask":"feat-1"}';
        const result = parsePhaseEvent(line);
        expect(result?.progress).toBe(75);
        expect(result?.subtask).toBe('feat-1');
      });

      it('should ignore unknown fields', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Working","unknown":"field","extra":123}';
        const result = parsePhaseEvent(line);
        expect(result).not.toBeNull();
        expect(result?.phase).toBe('coding');
        expect(result).not.toHaveProperty('unknown');
      });
    });

    describe('Error Handling', () => {
      it('should return null for invalid JSON', () => {
        const line = '__EXEC_PHASE__:{invalid json}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should return null for empty JSON string', () => {
        const line = '__EXEC_PHASE__:';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should return null for non-object JSON', () => {
        const line = '__EXEC_PHASE__:"just a string"';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should return null for JSON array', () => {
        const line = '__EXEC_PHASE__:["phase","coding"]';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should return null for truncated JSON', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Trun';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should return null for JSON without phase field', () => {
        const line = '__EXEC_PHASE__:{"message":"No phase field"}';
        const result = parsePhaseEvent(line);
        expect(result).toBeNull();
      });

      it('should handle whitespace after marker', () => {
        const line = '__EXEC_PHASE__:  {"phase":"coding","message":"With spaces"}';
        const result = parsePhaseEvent(line);
        expect(result).not.toBeNull();
        expect(result?.phase).toBe('coding');
      });

      it('should handle trailing whitespace in JSON', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Test"}  ';
        const result = parsePhaseEvent(line);
        expect(result).not.toBeNull();
      });
    });

    describe('Real-world Scenarios', () => {
      it('should parse typical planning event', () => {
        const line = '__EXEC_PHASE__:{"phase":"planning","message":"Creating implementation plan"}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('planning');
        expect(result?.message).toBe('Creating implementation plan');
      });

      it('should parse typical coding event with subtask', () => {
        const line = '__EXEC_PHASE__:{"phase":"coding","message":"Implementing feature","subtask":"1/3","progress":33}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('coding');
        expect(result?.subtask).toBe('1/3');
        expect(result?.progress).toBe(33);
      });

      it('should parse QA review event', () => {
        const line = '__EXEC_PHASE__:{"phase":"qa_review","message":"Running QA validation iteration 1"}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('qa_review');
      });

      it('should parse QA fixing event', () => {
        const line = '__EXEC_PHASE__:{"phase":"qa_fixing","message":"Fixing QA issues"}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('qa_fixing');
      });

      it('should parse complete event', () => {
        const line = '__EXEC_PHASE__:{"phase":"complete","message":"QA validation passed","progress":100}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('complete');
        expect(result?.progress).toBe(100);
      });

      it('should parse failed event with error message', () => {
        const line = '__EXEC_PHASE__:{"phase":"failed","message":"Build failed: TypeError: Cannot read property of undefined"}';
        const result = parsePhaseEvent(line);
        expect(result?.phase).toBe('failed');
        expect(result?.message).toContain('TypeError');
      });
    });
  });

  describe('hasPhaseMarker', () => {
    it('should return true when marker present at start', () => {
      const line = '__EXEC_PHASE__:{"phase":"coding","message":""}';
      expect(hasPhaseMarker(line)).toBe(true);
    });

    it('should return true when marker present in middle', () => {
      const line = 'Some prefix __EXEC_PHASE__:{"phase":"coding","message":""}';
      expect(hasPhaseMarker(line)).toBe(true);
    });

    it('should return false when marker absent', () => {
      const line = 'Just a regular log line without marker';
      expect(hasPhaseMarker(line)).toBe(false);
    });

    it('should return false for partial marker', () => {
      const line = '__EXEC_PHASE';
      expect(hasPhaseMarker(line)).toBe(false);
    });

    it('should return false for similar but different marker', () => {
      const line = '__EXEC_PHASE_:{"phase":"coding"}';
      expect(hasPhaseMarker(line)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasPhaseMarker('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      const line = '__exec_phase__:{"phase":"coding","message":""}';
      expect(hasPhaseMarker(line)).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should return correct PhaseEvent type', () => {
      const line = '__EXEC_PHASE__:{"phase":"coding","message":"Test","progress":50,"subtask":"t1"}';
      const result = parsePhaseEvent(line);

      // TypeScript compile-time check
      if (result) {
        const phase: string = result.phase;
        const message: string = result.message;
        const progress: number | undefined = result.progress;
        const subtask: string | undefined = result.subtask;

        expect(phase).toBe('coding');
        expect(message).toBe('Test');
        expect(progress).toBe(50);
        expect(subtask).toBe('t1');
      }
    });
  });
});
