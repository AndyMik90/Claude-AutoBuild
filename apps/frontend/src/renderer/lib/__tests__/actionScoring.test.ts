/**
 * Unit tests for Action Scoring Algorithm
 *
 * Tests weighted scoring algorithm for intelligent subtask action summarization.
 * Verifies:
 * - Scoring weights (Error=40, Warning=20, Decision=25, FileChange=20, TimeAnomaly=10, Novelty=5)
 * - Top 5 filtering functionality
 * - Edge cases (empty arrays, fewer than 5 actions, missing metadata)
 * - Tiebreaker logic (earlier actions win when scores equal)
 * - Performance (<100ms for 1000 actions)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCORING_WEIGHTS,
  DEFAULT_TOP_N,
  scoreAction,
  filterTopActions,
  groupActionsBySubphase,
  getScoreReason,
  isErrorAction,
  isWarningAction,
  isDecisionAction,
  isFileChangeAction,
  isNovelty,
  countFilesChanged,
  calculateSubtaskRelevance,
  calculateSubtaskRelevanceScores,
  sortSubtasksByRelevance,
  extractFilesFromAction,
  extractFilesFromActions,
  getFilesSummary,
  getImportantFiles,
  type ScoredAction,
  type ScoringContext,
  type SubtaskRelevanceScore,
  type ExtractedFile,
  type FilesSummary,
} from '../actionScoring';
import type { TaskLogEntry, TaskLogEntryType, TaskLogPhase } from '../../../shared/types/task';

/**
 * Helper to create a test TaskLogEntry with sensible defaults
 */
function createTestAction(overrides: Partial<TaskLogEntry> = {}): TaskLogEntry {
  return {
    timestamp: new Date().toISOString(),
    type: 'text' as TaskLogEntryType,
    content: 'Test action content',
    phase: 'coding' as TaskLogPhase,
    ...overrides,
  };
}

/**
 * Helper to create a fresh scoring context
 */
function createScoringContext(): ScoringContext {
  return {
    averageDuration: undefined,
    seenToolTypes: new Set<string>(),
  };
}

describe('Action Scoring Algorithm', () => {
  describe('SCORING_WEIGHTS constants', () => {
    it('should have correct weight values based on cognitive science principles', () => {
      expect(SCORING_WEIGHTS.ERROR).toBe(40);
      expect(SCORING_WEIGHTS.WARNING).toBe(20);
      expect(SCORING_WEIGHTS.DECISION).toBe(25);
      expect(SCORING_WEIGHTS.FILE_CHANGE).toBe(20);
      expect(SCORING_WEIGHTS.TIME_ANOMALY).toBe(10);
      expect(SCORING_WEIGHTS.NOVELTY).toBe(5);
    });

    it('should have DEFAULT_TOP_N set to 5', () => {
      expect(DEFAULT_TOP_N).toBe(5);
    });
  });

  describe('isErrorAction', () => {
    it('should detect error type entries', () => {
      const action = createTestAction({ type: 'error' });
      expect(isErrorAction(action)).toBe(true);
    });

    it('should detect error keywords in content', () => {
      const errorKeywords = ['error', 'failed', 'failure', 'exception', 'crash'];

      errorKeywords.forEach((keyword) => {
        const action = createTestAction({ content: `Something ${keyword} here` });
        expect(isErrorAction(action)).toBe(true);
      });
    });

    it('should return false for non-error actions', () => {
      const action = createTestAction({ type: 'text', content: 'All good' });
      expect(isErrorAction(action)).toBe(false);
    });

    it('should handle missing content gracefully', () => {
      const action = createTestAction({ content: undefined });
      expect(isErrorAction(action)).toBe(false);
    });
  });

  describe('isWarningAction', () => {
    it('should detect warning keywords in content', () => {
      const warningKeywords = ['warning', 'deprecated', 'caution'];

      warningKeywords.forEach((keyword) => {
        const action = createTestAction({ content: `Something ${keyword} here` });
        expect(isWarningAction(action)).toBe(true);
      });
    });

    it('should return false for non-warning actions', () => {
      const action = createTestAction({ content: 'Normal message' });
      expect(isWarningAction(action)).toBe(false);
    });
  });

  describe('isDecisionAction', () => {
    it('should detect decision-related tool names', () => {
      const decisionTools = ['Edit', 'Write', 'Create', 'Bash', 'Delete', 'Rename'];

      decisionTools.forEach((tool) => {
        const action = createTestAction({ tool_name: tool });
        expect(isDecisionAction(action)).toBe(true);
      });
    });

    it('should detect decision keywords in content', () => {
      const decisionKeywords = [
        'decided',
        'choosing',
        'selected',
        'implementing',
        'creating',
        'adding',
        'modifying',
      ];

      decisionKeywords.forEach((keyword) => {
        const action = createTestAction({ content: `${keyword} a new feature` });
        expect(isDecisionAction(action)).toBe(true);
      });
    });

    it('should return false for non-decision actions', () => {
      const action = createTestAction({ tool_name: 'Read', content: 'Just reading' });
      expect(isDecisionAction(action)).toBe(false);
    });
  });

  describe('isFileChangeAction', () => {
    it('should detect file change tool names', () => {
      const fileChangeTools = ['Edit', 'Write', 'Create', 'Delete', 'Rename', 'Move', 'NotebookEdit'];

      fileChangeTools.forEach((tool) => {
        const action = createTestAction({ tool_name: tool });
        expect(isFileChangeAction(action)).toBe(true);
      });
    });

    it('should detect file change keywords in content', () => {
      const fileChangeKeywords = ['wrote', 'edited', 'created', 'modified', 'deleted'];

      fileChangeKeywords.forEach((keyword) => {
        const action = createTestAction({ content: `${keyword} file.ts` });
        expect(isFileChangeAction(action)).toBe(true);
      });
    });

    it('should return false for non-file-change actions', () => {
      const action = createTestAction({ tool_name: 'Read', content: 'Reading content' });
      expect(isFileChangeAction(action)).toBe(false);
    });
  });

  describe('countFilesChanged', () => {
    it('should count file paths in tool input', () => {
      const action = createTestAction({
        tool_input: '/src/component.tsx',
        detail: 'Modified file',
      });
      expect(countFilesChanged(action)).toBe(1);
    });

    it('should count multiple file paths', () => {
      const action = createTestAction({
        tool_input: '/src/component.tsx',
        detail: 'Also changed /src/utils.ts and /src/types.ts',
      });
      expect(countFilesChanged(action)).toBe(3);
    });

    it('should cap at 3 files for scoring purposes', () => {
      const action = createTestAction({
        detail:
          '/a.ts /b.ts /c.ts /d.ts /e.ts /f.ts',
      });
      expect(countFilesChanged(action)).toBe(3);
    });

    it('should handle missing tool_input and detail', () => {
      const action = createTestAction({});
      expect(countFilesChanged(action)).toBe(0);
    });
  });

  describe('isNovelty', () => {
    it('should return true for first occurrence of tool type', () => {
      const action = createTestAction({ tool_name: 'NewTool' });
      const seenTypes = new Set<string>();

      expect(isNovelty(action, seenTypes)).toBe(true);
    });

    it('should return false for repeated tool type', () => {
      const action = createTestAction({ tool_name: 'Edit' });
      const seenTypes = new Set(['edit']);

      expect(isNovelty(action, seenTypes)).toBe(false);
    });

    it('should return false for actions without tool_name', () => {
      const action = createTestAction({ tool_name: undefined });
      const seenTypes = new Set<string>();

      expect(isNovelty(action, seenTypes)).toBe(false);
    });
  });

  describe('scoreAction', () => {
    let context: ScoringContext;

    beforeEach(() => {
      context = createScoringContext();
    });

    it('should score error actions with ERROR weight (40)', () => {
      const action = createTestAction({ type: 'error', content: 'Test error' });
      const scored = scoreAction(action, 0, context);

      expect(scored.scoreBreakdown.error).toBe(SCORING_WEIGHTS.ERROR);
      expect(scored.score).toBeGreaterThanOrEqual(SCORING_WEIGHTS.ERROR);
    });

    it('should score warning actions with WARNING weight (20)', () => {
      const action = createTestAction({ content: 'Warning: deprecated method' });
      const scored = scoreAction(action, 0, context);

      expect(scored.scoreBreakdown.error).toBe(SCORING_WEIGHTS.WARNING);
    });

    it('should score decision actions with DECISION weight (25)', () => {
      const action = createTestAction({ tool_name: 'Edit' });
      const scored = scoreAction(action, 0, context);

      expect(scored.scoreBreakdown.decision).toBe(SCORING_WEIGHTS.DECISION);
    });

    it('should score file change actions with FILE_CHANGE weight (20)', () => {
      const action = createTestAction({
        tool_name: 'Write',
        tool_input: '/src/file.ts',
      });
      const scored = scoreAction(action, 0, context);

      expect(scored.scoreBreakdown.fileChange).toBeGreaterThanOrEqual(SCORING_WEIGHTS.FILE_CHANGE);
    });

    it('should score novel tool types with NOVELTY weight (5)', () => {
      const action = createTestAction({ tool_name: 'NewTool' });
      const scored = scoreAction(action, 0, context);

      expect(scored.scoreBreakdown.novelty).toBe(SCORING_WEIGHTS.NOVELTY);
    });

    it('should track seen tool types for novelty scoring', () => {
      const action1 = createTestAction({ tool_name: 'Edit' });
      const action2 = createTestAction({ tool_name: 'Edit' });

      scoreAction(action1, 0, context);
      const scored2 = scoreAction(action2, 1, context);

      expect(scored2.scoreBreakdown.novelty).toBe(0);
    });

    it('should combine multiple scoring criteria', () => {
      const action = createTestAction({
        type: 'error',
        tool_name: 'Edit',
        content: 'Error while implementing feature',
        tool_input: '/src/file.ts',
      });

      const scored = scoreAction(action, 0, context);

      // Should have error (40) + decision (25) + file change (20+) + novelty (5)
      expect(scored.score).toBeGreaterThan(
        SCORING_WEIGHTS.ERROR + SCORING_WEIGHTS.DECISION
      );
    });

    it('should include original index for tiebreaking', () => {
      const action = createTestAction({});
      const scored = scoreAction(action, 42, context);

      expect(scored.index).toBe(42);
    });

    it('should include the original action in result', () => {
      const action = createTestAction({ content: 'Original content' });
      const scored = scoreAction(action, 0, context);

      expect(scored.action).toBe(action);
      expect(scored.action.content).toBe('Original content');
    });
  });

  describe('filterTopActions', () => {
    it('should return empty array for null/undefined input', () => {
      expect(filterTopActions(null as unknown as TaskLogEntry[])).toEqual([]);
      expect(filterTopActions(undefined as unknown as TaskLogEntry[])).toEqual([]);
    });

    it('should return empty array for empty input', () => {
      expect(filterTopActions([])).toEqual([]);
    });

    it('should return all actions when fewer than N', () => {
      const actions = [
        createTestAction({ content: 'Action 1' }),
        createTestAction({ content: 'Action 2' }),
        createTestAction({ content: 'Action 3' }),
      ];

      const result = filterTopActions(actions, 5);
      expect(result).toHaveLength(3);
    });

    it('should return exactly N actions when more than N exist', () => {
      const actions = Array.from({ length: 20 }, (_, i) =>
        createTestAction({ content: `Action ${i}` })
      );

      const result = filterTopActions(actions, 5);
      expect(result).toHaveLength(5);
    });

    it('should prioritize error actions over normal actions', () => {
      const actions = [
        createTestAction({ content: 'Normal action 1' }),
        createTestAction({ content: 'Normal action 2' }),
        createTestAction({ type: 'error', content: 'Error occurred' }),
        createTestAction({ content: 'Normal action 3' }),
        createTestAction({ content: 'Normal action 4' }),
      ];

      const result = filterTopActions(actions, 3);

      // Error action should be first (highest score)
      expect(result[0].action.type).toBe('error');
    });

    it('should prioritize file changes over simple text actions', () => {
      const actions = [
        createTestAction({ type: 'text', content: 'Just text' }),
        createTestAction({ tool_name: 'Write', tool_input: '/src/file.ts' }),
        createTestAction({ type: 'text', content: 'More text' }),
      ];

      const result = filterTopActions(actions, 2);

      // Write action should score higher
      const writeAction = result.find((r) => r.action.tool_name === 'Write');
      expect(writeAction).toBeDefined();
    });

    it('should use index as tiebreaker when scores are equal', () => {
      // Create 10 identical actions (same score)
      const actions = Array.from({ length: 10 }, (_, i) =>
        createTestAction({ content: `Identical action`, tool_name: undefined })
      );

      const result = filterTopActions(actions, 5);

      // Earlier actions should win tiebreaker
      result.forEach((scored, resultIndex) => {
        if (resultIndex > 0) {
          expect(scored.index).toBeGreaterThanOrEqual(result[resultIndex - 1].index);
        }
      });
    });

    it('should filter by subtask_id when provided', () => {
      const actions = [
        createTestAction({ subtask_id: 'subtask-1', content: 'Subtask 1 action' }),
        createTestAction({ subtask_id: 'subtask-2', content: 'Subtask 2 action' }),
        createTestAction({ subtask_id: 'subtask-1', content: 'Another subtask 1 action' }),
      ];

      const result = filterTopActions(actions, 5, 'subtask-1');

      expect(result).toHaveLength(2);
      result.forEach((scored) => {
        expect(scored.action.subtask_id).toBe('subtask-1');
      });
    });

    it('should return sorted results by score (descending)', () => {
      const actions = [
        createTestAction({ content: 'Low score text' }),
        createTestAction({ type: 'error', content: 'High score error' }),
        createTestAction({ tool_name: 'Edit', content: 'Medium score edit' }),
      ];

      const result = filterTopActions(actions, 3);

      // Verify descending order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].score).toBeLessThanOrEqual(result[i - 1].score);
      }
    });
  });

  describe('groupActionsBySubphase', () => {
    it('should group actions by subphase', () => {
      const context = createScoringContext();
      const scoredActions: ScoredAction[] = [
        scoreAction(createTestAction({ subphase: 'Planning' }), 0, context),
        scoreAction(createTestAction({ subphase: 'Implementation' }), 1, context),
        scoreAction(createTestAction({ subphase: 'Planning' }), 2, context),
        scoreAction(createTestAction({ subphase: 'Testing' }), 3, context),
      ];

      const groups = groupActionsBySubphase(scoredActions);

      expect(groups.size).toBe(3);
      expect(groups.get('Planning')).toHaveLength(2);
      expect(groups.get('Implementation')).toHaveLength(1);
      expect(groups.get('Testing')).toHaveLength(1);
    });

    it('should use "Other" for actions without subphase', () => {
      const context = createScoringContext();
      const scoredActions: ScoredAction[] = [
        scoreAction(createTestAction({ subphase: undefined }), 0, context),
        scoreAction(createTestAction({ subphase: 'Planning' }), 1, context),
      ];

      const groups = groupActionsBySubphase(scoredActions);

      expect(groups.get('Other')).toHaveLength(1);
      expect(groups.get('Planning')).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const groups = groupActionsBySubphase([]);
      expect(groups.size).toBe(0);
    });
  });

  describe('getScoreReason', () => {
    it('should return "Error detected" for error actions', () => {
      const context = createScoringContext();
      const scored = scoreAction(createTestAction({ type: 'error' }), 0, context);

      expect(getScoreReason(scored)).toContain('Error detected');
    });

    it('should return "Warning detected" for warning actions', () => {
      const context = createScoringContext();
      const scored = scoreAction(createTestAction({ content: 'Warning: deprecated' }), 0, context);

      expect(getScoreReason(scored)).toContain('Warning detected');
    });

    it('should return "Key decision" for decision actions', () => {
      const context = createScoringContext();
      const scored = scoreAction(createTestAction({ tool_name: 'Edit' }), 0, context);

      expect(getScoreReason(scored)).toContain('Key decision');
    });

    it('should return "File modification" for file change actions', () => {
      const context = createScoringContext();
      const scored = scoreAction(
        createTestAction({ tool_name: 'Write', tool_input: '/src/file.ts' }),
        0,
        context
      );

      expect(getScoreReason(scored)).toContain('File modification');
    });

    it('should return "New action type" for novel actions', () => {
      const context = createScoringContext();
      const scored = scoreAction(createTestAction({ tool_name: 'BrandNewTool' }), 0, context);

      expect(getScoreReason(scored)).toContain('New action type');
    });

    it('should return "Standard action" for low-score actions', () => {
      const context = createScoringContext();
      context.seenToolTypes.add('read'); // Mark Read as seen
      const scored = scoreAction(
        createTestAction({ tool_name: 'Read', content: 'Just reading' }),
        0,
        context
      );

      expect(getScoreReason(scored)).toBe('Standard action');
    });

    it('should combine multiple reasons', () => {
      const context = createScoringContext();
      const scored = scoreAction(
        createTestAction({
          type: 'error',
          tool_name: 'Edit',
        }),
        0,
        context
      );

      const reason = getScoreReason(scored);
      expect(reason).toContain('Error detected');
      expect(reason).toContain('Key decision');
    });
  });

  describe('Edge Cases', () => {
    it('should handle actions with all undefined optional fields', () => {
      const action: TaskLogEntry = {
        timestamp: new Date().toISOString(),
        type: 'text',
        content: 'Minimal action',
        phase: 'coding',
      };

      const context = createScoringContext();
      const scored = scoreAction(action, 0, context);

      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.action).toBe(action);
    });

    it('should handle actions with empty string content', () => {
      const action = createTestAction({ content: '' });
      const context = createScoringContext();
      const scored = scoreAction(action, 0, context);

      expect(scored.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle all actions having the same score', () => {
      const actions = Array.from({ length: 10 }, () =>
        createTestAction({ content: 'Same content' })
      );

      const result = filterTopActions(actions, 5);

      expect(result).toHaveLength(5);
      // All should have same score
      const scores = result.map((r) => r.score);
      expect(new Set(scores).size).toBe(1);
    });

    it('should handle single action', () => {
      const actions = [createTestAction({ content: 'Only action' })];
      const result = filterTopActions(actions, 5);

      expect(result).toHaveLength(1);
    });

    it('should handle N=0 (request for zero actions)', () => {
      const actions = [createTestAction({ content: 'Action' })];
      const result = filterTopActions(actions, 0);

      expect(result).toHaveLength(0);
    });

    it('should handle negative N gracefully', () => {
      const actions = [createTestAction({ content: 'Action' })];
      const result = filterTopActions(actions, -1);

      expect(result).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('should process 1000 actions in less than 100ms', () => {
      const actions: TaskLogEntry[] = Array.from({ length: 1000 }, (_, i) => {
        // Create variety of action types
        const types: TaskLogEntryType[] = ['text', 'tool_start', 'tool_end', 'error', 'success'];
        const tools = ['Edit', 'Write', 'Read', 'Bash', 'Glob', 'Grep', undefined];

        return createTestAction({
          type: types[i % types.length],
          tool_name: tools[i % tools.length],
          content: `Action ${i} with some content for variety`,
          subtask_id: `subtask-${i % 5}`,
          subphase: i % 3 === 0 ? 'Planning' : i % 3 === 1 ? 'Implementation' : 'Testing',
        });
      });

      const startTime = performance.now();
      const result = filterTopActions(actions, 5);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toHaveLength(5);
      expect(duration).toBeLessThan(100);
    });

    it('should process 5000 actions in less than 500ms', () => {
      const actions: TaskLogEntry[] = Array.from({ length: 5000 }, (_, i) =>
        createTestAction({
          content: `Action ${i}`,
          tool_name: i % 10 === 0 ? 'Edit' : undefined,
        })
      );

      const startTime = performance.now();
      const result = filterTopActions(actions, 5);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(result).toHaveLength(5);
      expect(duration).toBeLessThan(500);
    });

    it('should not cause memory issues with large datasets', () => {
      // Create large dataset
      const actions: TaskLogEntry[] = Array.from({ length: 1000 }, (_, i) =>
        createTestAction({ content: `Action ${i}`.repeat(100) }) // Large content
      );

      // Should complete without throwing
      expect(() => {
        const result = filterTopActions(actions, 5);
        expect(result).toHaveLength(5);
      }).not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('should correctly rank a realistic mix of actions', () => {
      const actions = [
        createTestAction({ type: 'text', content: 'Reading file structure' }),
        createTestAction({ tool_name: 'Read', content: 'Read package.json' }),
        createTestAction({ type: 'error', content: 'Failed to parse JSON' }),
        createTestAction({ tool_name: 'Edit', content: 'Fixed JSON syntax', tool_input: '/package.json' }),
        createTestAction({ content: 'warning: deprecated package' }),
        createTestAction({ tool_name: 'Bash', content: 'npm install' }),
        createTestAction({ type: 'success', content: 'Installation complete' }),
        createTestAction({ tool_name: 'Write', content: 'Creating new file', tool_input: '/src/new-file.ts' }),
        createTestAction({ type: 'text', content: 'Analysis complete' }),
        createTestAction({ tool_name: 'Read', content: 'Checking results' }),
      ];

      const result = filterTopActions(actions, 5);

      // Error should be in top 5
      const hasError = result.some((r) => r.action.type === 'error');
      expect(hasError).toBe(true);

      // File modifications should be in top 5
      const hasFileChange = result.some(
        (r) => r.action.tool_name === 'Edit' || r.action.tool_name === 'Write'
      );
      expect(hasFileChange).toBe(true);
    });

    it('should handle subtask-specific filtering with scoring', () => {
      const actions = [
        createTestAction({ subtask_id: 'subtask-1', type: 'error', content: 'Error in subtask 1' }),
        createTestAction({ subtask_id: 'subtask-2', type: 'error', content: 'Error in subtask 2' }),
        createTestAction({ subtask_id: 'subtask-1', tool_name: 'Edit', content: 'Fixed issue' }),
        createTestAction({ subtask_id: 'subtask-2', tool_name: 'Edit', content: 'Fixed other issue' }),
      ];

      const subtask1Result = filterTopActions(actions, 5, 'subtask-1');
      const subtask2Result = filterTopActions(actions, 5, 'subtask-2');

      expect(subtask1Result).toHaveLength(2);
      expect(subtask2Result).toHaveLength(2);

      subtask1Result.forEach((r) => expect(r.action.subtask_id).toBe('subtask-1'));
      subtask2Result.forEach((r) => expect(r.action.subtask_id).toBe('subtask-2'));
    });
  });

  describe('Subtask Relevance Scoring', () => {
    describe('calculateSubtaskRelevance', () => {
      it('should return zero scores for subtask with no actions', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', content: 'Action 1' }),
        ];

        const result = calculateSubtaskRelevance(actions, 'subtask-2');

        expect(result.subtaskId).toBe('subtask-2');
        expect(result.totalScore).toBe(0);
        expect(result.actionCount).toBe(0);
        expect(result.averageScore).toBe(0);
        expect(result.hasErrors).toBe(false);
        expect(result.hasDecisions).toBe(false);
        expect(result.topScore).toBe(0);
      });

      it('should calculate correct scores for subtask with actions', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', type: 'error', content: 'Error occurred' }),
          createTestAction({ subtask_id: 'subtask-1', tool_name: 'Edit', content: 'Fixed issue' }),
          createTestAction({ subtask_id: 'subtask-1', content: 'Some text' }),
        ];

        const result = calculateSubtaskRelevance(actions, 'subtask-1');

        expect(result.subtaskId).toBe('subtask-1');
        expect(result.actionCount).toBe(3);
        expect(result.totalScore).toBeGreaterThan(0);
        expect(result.hasErrors).toBe(true);
        expect(result.hasDecisions).toBe(true);
        expect(result.topScore).toBeGreaterThanOrEqual(SCORING_WEIGHTS.ERROR);
      });

      it('should detect subtasks with errors', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', type: 'error', content: 'Error occurred' }),
        ];

        const result = calculateSubtaskRelevance(actions, 'subtask-1');

        expect(result.hasErrors).toBe(true);
      });

      it('should detect subtasks without errors', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', content: 'Some text' }),
        ];

        const result = calculateSubtaskRelevance(actions, 'subtask-1');

        expect(result.hasErrors).toBe(false);
      });

      it('should detect subtasks with decisions', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', tool_name: 'Edit', content: 'Editing file' }),
        ];

        const result = calculateSubtaskRelevance(actions, 'subtask-1');

        expect(result.hasDecisions).toBe(true);
      });
    });

    describe('calculateSubtaskRelevanceScores', () => {
      it('should calculate scores for multiple subtasks', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', type: 'error', content: 'Error' }),
          createTestAction({ subtask_id: 'subtask-2', tool_name: 'Edit', content: 'Edit' }),
          createTestAction({ subtask_id: 'subtask-3', content: 'Text' }),
        ];

        const result = calculateSubtaskRelevanceScores(actions, ['subtask-1', 'subtask-2', 'subtask-3']);

        expect(result.size).toBe(3);
        expect(result.get('subtask-1')?.hasErrors).toBe(true);
        expect(result.get('subtask-2')?.hasDecisions).toBe(true);
        expect(result.get('subtask-3')?.hasErrors).toBe(false);
      });

      it('should return empty map for empty subtask list', () => {
        const actions = [createTestAction({ subtask_id: 'subtask-1' })];
        const result = calculateSubtaskRelevanceScores(actions, []);

        expect(result.size).toBe(0);
      });
    });

    describe('sortSubtasksByRelevance', () => {
      it('should sort subtasks by relevance score (highest first)', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', content: 'Text only' }),
          createTestAction({ subtask_id: 'subtask-2', type: 'error', content: 'Error occurred' }),
          createTestAction({ subtask_id: 'subtask-3', tool_name: 'Edit', content: 'Edit' }),
        ];

        const subtaskIds = ['subtask-1', 'subtask-2', 'subtask-3'];
        const scores = calculateSubtaskRelevanceScores(actions, subtaskIds);
        const sorted = sortSubtasksByRelevance(subtaskIds, scores);

        // subtask-2 should be first (has error, highest priority)
        expect(sorted[0]).toBe('subtask-2');
      });

      it('should prioritize subtasks with errors', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', tool_name: 'Edit', content: 'Edit', tool_input: '/file.ts' }),
          createTestAction({ subtask_id: 'subtask-1', tool_name: 'Write', content: 'Write', tool_input: '/file2.ts' }),
          createTestAction({ subtask_id: 'subtask-2', type: 'error', content: 'Error' }),
        ];

        const subtaskIds = ['subtask-1', 'subtask-2'];
        const scores = calculateSubtaskRelevanceScores(actions, subtaskIds);
        const sorted = sortSubtasksByRelevance(subtaskIds, scores);

        // subtask-2 should be first due to error even though subtask-1 has more actions
        expect(sorted[0]).toBe('subtask-2');
      });

      it('should use action count as secondary sort when scores are similar', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', content: 'Text 1' }),
          createTestAction({ subtask_id: 'subtask-2', content: 'Text 2' }),
          createTestAction({ subtask_id: 'subtask-2', content: 'Text 3' }),
          createTestAction({ subtask_id: 'subtask-2', content: 'Text 4' }),
        ];

        const subtaskIds = ['subtask-1', 'subtask-2'];
        const scores = calculateSubtaskRelevanceScores(actions, subtaskIds);
        const sorted = sortSubtasksByRelevance(subtaskIds, scores);

        // subtask-2 should be first (more actions)
        expect(sorted[0]).toBe('subtask-2');
      });

      it('should handle empty relevance scores gracefully', () => {
        const subtaskIds = ['subtask-1', 'subtask-2'];
        const scores = new Map<string, SubtaskRelevanceScore>();

        const sorted = sortSubtasksByRelevance(subtaskIds, scores);

        // Should return same order when no scores available
        expect(sorted).toEqual(subtaskIds);
      });

      it('should handle partial relevance scores', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-1', type: 'error', content: 'Error' }),
        ];

        const subtaskIds = ['subtask-1', 'subtask-2'];
        const scores = calculateSubtaskRelevanceScores(actions, ['subtask-1']); // Only score subtask-1
        const sorted = sortSubtasksByRelevance(subtaskIds, scores);

        // subtask-1 should be first (has score), subtask-2 at end (no score)
        expect(sorted[0]).toBe('subtask-1');
      });

      it('should not mutate original array', () => {
        const actions = [
          createTestAction({ subtask_id: 'subtask-2', type: 'error', content: 'Error' }),
        ];

        const subtaskIds = ['subtask-1', 'subtask-2'];
        const originalOrder = [...subtaskIds];
        const scores = calculateSubtaskRelevanceScores(actions, subtaskIds);

        sortSubtasksByRelevance(subtaskIds, scores);

        expect(subtaskIds).toEqual(originalOrder);
      });
    });
  });

  /**
   * File Extraction Tests
   */
  describe('File Extraction', () => {
    describe('extractFilesFromAction', () => {
      it('should extract file path from Read tool action', () => {
        const action = createTestAction({
          type: 'tool_start',
          tool_name: 'Read',
          tool_input: '/src/components/App.tsx',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('/src/components/App.tsx');
        expect(files[0].filename).toBe('App.tsx');
        expect(files[0].operation).toBe('read');
      });

      it('should extract file path from Edit tool action', () => {
        const action = createTestAction({
          type: 'tool_start',
          tool_name: 'Edit',
          tool_input: '/src/lib/utils.ts',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('/src/lib/utils.ts');
        expect(files[0].operation).toBe('edit');
      });

      it('should extract file path from Write tool action', () => {
        const action = createTestAction({
          type: 'tool_start',
          tool_name: 'Write',
          tool_input: '/src/new-file.ts',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('/src/new-file.ts');
        expect(files[0].operation).toBe('write');
      });

      it('should skip tool_end actions to avoid duplicates', () => {
        const action = createTestAction({
          type: 'tool_end',
          tool_name: 'Read',
          tool_input: '/src/file.ts',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(0);
      });

      it('should skip non-tool actions', () => {
        const action = createTestAction({
          type: 'text',
          content: 'Some text about /src/file.ts',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(0);
      });

      it('should handle relative paths', () => {
        const action = createTestAction({
          type: 'tool_start',
          tool_name: 'Read',
          tool_input: './src/components/Button.tsx',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('./src/components/Button.tsx');
        expect(files[0].filename).toBe('Button.tsx');
      });

      it('should extract file from detail when tool_input is empty', () => {
        const action = createTestAction({
          type: 'tool_start',
          tool_name: 'Edit',
          tool_input: '',
          detail: 'Editing /src/config.json',
        });

        const files = extractFilesFromAction(action);

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('/src/config.json');
      });
    });

    describe('extractFilesFromActions', () => {
      it('should extract files from multiple actions', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/file1.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Edit',
            tool_input: '/src/file2.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Write',
            tool_input: '/src/file3.ts',
          }),
        ];

        const files = extractFilesFromActions(actions);

        expect(files).toHaveLength(3);
        expect(files.map(f => f.path)).toEqual([
          '/src/file1.ts',
          '/src/file2.ts',
          '/src/file3.ts',
        ]);
      });

      it('should skip Grep and Glob tools (search operations)', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Grep',
            tool_input: 'searchPattern',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Glob',
            tool_input: '**/*.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/file.ts',
          }),
        ];

        const files = extractFilesFromActions(actions);

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('/src/file.ts');
      });
    });

    describe('getFilesSummary', () => {
      it('should categorize files by operation type', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/read-only.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Edit',
            tool_input: '/src/modified.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Write',
            tool_input: '/src/written.ts',
          }),
        ];

        const summary = getFilesSummary(actions);

        expect(summary.modifiedFiles).toContain('/src/modified.ts');
        expect(summary.modifiedFiles).toContain('/src/written.ts');
        expect(summary.readFiles).toContain('/src/read-only.ts');
      });

      it('should not include read file in readFiles if it was also modified', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/file.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Edit',
            tool_input: '/src/file.ts',
          }),
        ];

        const summary = getFilesSummary(actions);

        expect(summary.modifiedFiles).toContain('/src/file.ts');
        expect(summary.readFiles).not.toContain('/src/file.ts');
      });

      it('should filter by subtask_id when specified', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/subtask1-file.ts',
            subtask_id: 'subtask-1',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/subtask2-file.ts',
            subtask_id: 'subtask-2',
          }),
        ];

        const summary = getFilesSummary(actions, 'subtask-1');

        expect(summary.uniqueFiles).toHaveLength(1);
        expect(summary.uniqueFiles).toContain('/src/subtask1-file.ts');
        expect(summary.uniqueFiles).not.toContain('/src/subtask2-file.ts');
      });

      it('should return unique file paths', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/file.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/file.ts',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Edit',
            tool_input: '/src/file.ts',
          }),
        ];

        const summary = getFilesSummary(actions);

        expect(summary.uniqueFiles).toHaveLength(1);
        expect(summary.modifiedFiles).toHaveLength(1);
      });
    });

    describe('getImportantFiles', () => {
      it('should prioritize modified files over read files', () => {
        const actions = [
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/read1.ts',
            subtask_id: 'subtask-1',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Read',
            tool_input: '/src/read2.ts',
            subtask_id: 'subtask-1',
          }),
          createTestAction({
            type: 'tool_start',
            tool_name: 'Edit',
            tool_input: '/src/edited.ts',
            subtask_id: 'subtask-1',
          }),
        ];

        const result = getImportantFiles(actions, 'subtask-1', 2);

        // Modified file should come first
        expect(result.modified).toContain('/src/edited.ts');
        // Read files fill remaining slots
        expect(result.read).toHaveLength(1);
      });

      it('should limit to maxFiles parameter', () => {
        const actions = Array.from({ length: 10 }, (_, i) =>
          createTestAction({
            type: 'tool_start',
            tool_name: 'Edit',
            tool_input: `/src/file${i}.ts`,
            subtask_id: 'subtask-1',
          })
        );

        const result = getImportantFiles(actions, 'subtask-1', 3);

        expect(result.modified).toHaveLength(3);
      });

      it('should return empty arrays when no files found', () => {
        const actions = [
          createTestAction({
            type: 'text',
            content: 'Some text',
            subtask_id: 'subtask-1',
          }),
        ];

        const result = getImportantFiles(actions, 'subtask-1');

        expect(result.modified).toHaveLength(0);
        expect(result.read).toHaveLength(0);
      });
    });
  });
});
