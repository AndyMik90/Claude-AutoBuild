import { describe, it, expect } from 'vitest';
import {
  PhaseEventSchema,
  validatePhaseEvent,
  isValidPhasePayload,
  type PhaseEventPayload
} from '../agent/phase-event-schema';
import { BACKEND_PHASES } from '../../shared/constants/phase-protocol';

describe('Phase Event Schema', () => {
  describe('PhaseEventSchema', () => {
    it('should parse valid complete payload', () => {
      const input = {
        phase: 'coding',
        message: 'Working on feature',
        progress: 50,
        subtask: 'task-1'
      };
      const result = PhaseEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phase).toBe('coding');
        expect(result.data.message).toBe('Working on feature');
        expect(result.data.progress).toBe(50);
        expect(result.data.subtask).toBe('task-1');
      }
    });

    it('should parse minimal payload with defaults', () => {
      const input = { phase: 'planning' };
      const result = PhaseEventSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phase).toBe('planning');
        expect(result.data.message).toBe('');
        expect(result.data.progress).toBeUndefined();
        expect(result.data.subtask).toBeUndefined();
      }
    });

    it('should reject invalid phase', () => {
      const input = { phase: 'invalid_phase', message: '' };
      const result = PhaseEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing phase', () => {
      const input = { message: 'No phase' };
      const result = PhaseEventSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    describe('Progress Validation', () => {
      it('should accept progress at 0', () => {
        const input = { phase: 'coding', progress: 0 };
        const result = PhaseEventSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should accept progress at 100', () => {
        const input = { phase: 'coding', progress: 100 };
        const result = PhaseEventSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should reject progress below 0', () => {
        const input = { phase: 'coding', progress: -1 };
        const result = PhaseEventSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject progress above 100', () => {
        const input = { phase: 'coding', progress: 101 };
        const result = PhaseEventSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should reject non-integer progress', () => {
        const input = { phase: 'coding', progress: 50.5 };
        const result = PhaseEventSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('validatePhaseEvent', () => {
    it('should return success result for valid payload', () => {
      const input = { phase: 'coding', message: 'Test' };
      const result = validatePhaseEvent(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phase).toBe('coding');
      }
    });

    it('should return error result for invalid payload', () => {
      const input = { phase: 'invalid', message: 'Test' };
      const result = validatePhaseEvent(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('isValidPhasePayload', () => {
    it('should return true for valid payload', () => {
      const input = { phase: 'coding', message: 'Test' };
      expect(isValidPhasePayload(input)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      const input = { phase: 'invalid', message: 'Test' };
      expect(isValidPhasePayload(input)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidPhasePayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidPhasePayload(undefined)).toBe(false);
    });

    it('should act as type guard', () => {
      const input: unknown = { phase: 'coding', message: 'Test' };
      if (isValidPhasePayload(input)) {
        const typed: PhaseEventPayload = input;
        expect(typed.phase).toBe('coding');
      }
    });
  });

  describe('All Valid Phases', () => {
    BACKEND_PHASES.forEach((phase) => {
      it(`should accept phase: ${phase}`, () => {
        const input = { phase, message: '' };
        const result = PhaseEventSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });
});
