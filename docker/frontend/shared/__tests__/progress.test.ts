/**
 * Unit tests for progress calculation utilities
 * Tests progress percentage calculations and status determination
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateProgress,
  countSubtasksByStatus,
  determineOverallStatus,
  formatProgressString,
  estimateRemainingTime
} from '../progress';
import type { Subtask, SubtaskStatus } from '../types';

// Helper to create subtasks
function createSubtasks(statuses: SubtaskStatus[]): Subtask[] {
  return statuses.map((status, i) => ({
    id: `subtask-${i}`,
    title: `Subtask ${i}`,
    description: `Description ${i}`,
    status,
    files: []
  }));
}

describe('calculateProgress', () => {
  describe('with 0 subtasks', () => {
    it('should return 0 for empty array', () => {
      const progress = calculateProgress([]);
      expect(progress).toBe(0);
    });
  });

  describe('with all pending subtasks', () => {
    it('should return 0 when all subtasks are pending', () => {
      const subtasks = createSubtasks(['pending', 'pending', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(0);
    });
  });

  describe('with all completed subtasks', () => {
    it('should return 100 when all subtasks are completed', () => {
      const subtasks = createSubtasks(['completed', 'completed', 'completed']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(100);
    });

    it('should return 100 for single completed subtask', () => {
      const subtasks = createSubtasks(['completed']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(100);
    });
  });

  describe('with mixed status subtasks', () => {
    it('should calculate correct percentage for mixed statuses', () => {
      // 2 completed out of 4 = 50%
      const subtasks = createSubtasks(['completed', 'completed', 'pending', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(50);
    });

    it('should round to nearest integer', () => {
      // 1 completed out of 3 = 33.33... → 33%
      const subtasks = createSubtasks(['completed', 'pending', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(33);
    });

    it('should handle in_progress as not completed', () => {
      // Only 'completed' status counts
      const subtasks = createSubtasks(['completed', 'in_progress', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(33);
    });

    it('should handle failed as not completed', () => {
      const subtasks = createSubtasks(['completed', 'failed', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(33);
    });

    it('should calculate 25% correctly', () => {
      const subtasks = createSubtasks(['completed', 'pending', 'pending', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(25);
    });

    it('should calculate 75% correctly', () => {
      const subtasks = createSubtasks(['completed', 'completed', 'completed', 'pending']);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(75);
    });

    it('should handle large number of subtasks', () => {
      const statuses: SubtaskStatus[] = Array(100)
        .fill('completed', 0, 73)
        .fill('pending', 73);
      const subtasks = createSubtasks(statuses as SubtaskStatus[]);
      const progress = calculateProgress(subtasks);
      expect(progress).toBe(73);
    });
  });
});

describe('countSubtasksByStatus', () => {
  it('should return zeros for empty array', () => {
    const counts = countSubtasksByStatus([]);
    expect(counts).toEqual({
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0
    });
  });

  it('should count all statuses correctly', () => {
    const subtasks = createSubtasks([
      'pending',
      'pending',
      'in_progress',
      'completed',
      'completed',
      'completed',
      'failed'
    ]);
    const counts = countSubtasksByStatus(subtasks);
    expect(counts).toEqual({
      pending: 2,
      in_progress: 1,
      completed: 3,
      failed: 1
    });
  });

  it('should handle single status', () => {
    const subtasks = createSubtasks(['pending', 'pending', 'pending']);
    const counts = countSubtasksByStatus(subtasks);
    expect(counts.pending).toBe(3);
    expect(counts.in_progress).toBe(0);
    expect(counts.completed).toBe(0);
    expect(counts.failed).toBe(0);
  });
});

describe('determineOverallStatus', () => {
  it('should return not_started for empty array', () => {
    const status = determineOverallStatus([]);
    expect(status).toBe('not_started');
  });

  it('should return not_started when all pending', () => {
    const subtasks = createSubtasks(['pending', 'pending']);
    const status = determineOverallStatus(subtasks);
    expect(status).toBe('not_started');
  });

  it('should return completed when all completed', () => {
    const subtasks = createSubtasks(['completed', 'completed']);
    const status = determineOverallStatus(subtasks);
    expect(status).toBe('completed');
  });

  it('should return in_progress when some in_progress', () => {
    const subtasks = createSubtasks(['pending', 'in_progress', 'completed']);
    const status = determineOverallStatus(subtasks);
    expect(status).toBe('in_progress');
  });

  it('should return in_progress when some completed', () => {
    const subtasks = createSubtasks(['pending', 'completed']);
    const status = determineOverallStatus(subtasks);
    expect(status).toBe('in_progress');
  });

  it('should return failed when any failed', () => {
    const subtasks = createSubtasks(['completed', 'failed', 'pending']);
    const status = determineOverallStatus(subtasks);
    expect(status).toBe('failed');
  });

  it('should prioritize failed over in_progress', () => {
    const subtasks = createSubtasks(['in_progress', 'failed']);
    const status = determineOverallStatus(subtasks);
    expect(status).toBe('failed');
  });
});

describe('formatProgressString', () => {
  it('should return "No subtasks" for 0 total', () => {
    const str = formatProgressString(0, 0);
    expect(str).toBe('No subtasks');
  });

  it('should format completed/total correctly', () => {
    expect(formatProgressString(3, 5)).toBe('3/5 subtasks');
    expect(formatProgressString(0, 10)).toBe('0/10 subtasks');
    expect(formatProgressString(10, 10)).toBe('10/10 subtasks');
    expect(formatProgressString(1, 1)).toBe('1/1 subtasks');
  });
});

describe('estimateRemainingTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null for 0% progress', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(60000); // 1 minute
    const remaining = estimateRemainingTime(startTime, 0);
    expect(remaining).toBeNull();
  });

  it('should return null for 100% progress', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(60000);
    const remaining = estimateRemainingTime(startTime, 100);
    expect(remaining).toBeNull();
  });

  it('should return null for negative progress', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(60000);
    const remaining = estimateRemainingTime(startTime, -10);
    expect(remaining).toBeNull();
  });

  it('should estimate remaining time at 50%', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(60000); // 1 minute elapsed

    const remaining = estimateRemainingTime(startTime, 50);

    // At 50% with 1 minute elapsed, total should be 2 minutes
    // So remaining should be about 1 minute (60000ms)
    expect(remaining).toBe(60000);
  });

  it('should estimate remaining time at 25%', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(30000); // 30 seconds elapsed

    const remaining = estimateRemainingTime(startTime, 25);

    // At 25% with 30s elapsed, total should be 120s
    // Remaining should be 90s (90000ms)
    expect(remaining).toBe(90000);
  });

  it('should estimate remaining time at 75%', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(90000); // 90 seconds elapsed

    const remaining = estimateRemainingTime(startTime, 75);

    // At 75% with 90s elapsed, total should be 120s
    // Remaining should be 30s (30000ms)
    expect(remaining).toBe(30000);
  });

  it('should return 0 if calculation results in negative', () => {
    // This shouldn't happen in practice but we handle it
    const startTime = new Date();
    vi.advanceTimersByTime(1000);

    // If somehow progress is very high relative to time
    const remaining = estimateRemainingTime(startTime, 99);

    // Should be a small positive number or 0, not negative
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});
