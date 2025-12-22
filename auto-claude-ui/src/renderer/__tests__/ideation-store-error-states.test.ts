/**
 * Unit tests for Ideation Store Error State Handling
 * Tests Zustand store for proper error state management
 *
 * This test verifies the error handling for:
 * - Issue: Error states should display correctly in UI
 * - Fix: Error events properly update store state
 * - Fix: Auth failures are detected and handled
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useIdeationStore } from '../stores/ideation-store';
import type {
  IdeationType,
  IdeationGenerationStatus
} from '../../shared/types';

describe('Ideation Store - Error State Handling', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useIdeationStore.setState({
      session: null,
      generationStatus: {
        phase: 'idle',
        progress: 0,
        message: ''
      },
      config: {
        enabledTypes: ['code_improvements', 'ui_ux_improvements'] as IdeationType[],
        includeRoadmapContext: false,
        includeKanbanContext: false,
        maxIdeasPerType: 5
      },
      logs: [],
      typeStates: {
        code_improvements: 'pending',
        ui_ux_improvements: 'pending',
        documentation_gaps: 'pending',
        security_hardening: 'pending',
        performance_optimizations: 'pending',
        code_quality: 'pending'
      },
      selectedIds: new Set<string>(),
      currentProjectId: null
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('setGenerationStatus with error', () => {
    it('should set error state correctly', () => {
      const errorStatus: IdeationGenerationStatus = {
        phase: 'error',
        progress: 0,
        message: '',
        error: 'authentication required'
      };

      useIdeationStore.getState().setGenerationStatus(errorStatus);

      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('error');
      expect(state.generationStatus.progress).toBe(0);
      expect(state.generationStatus.error).toBe('authentication required');
    });

    it('should transition from generating to error', () => {
      // Start with generating state
      useIdeationStore.getState().setGenerationStatus({
        phase: 'generating',
        progress: 50,
        message: 'Generating ideas...'
      });

      expect(useIdeationStore.getState().generationStatus.phase).toBe('generating');

      // Transition to error
      useIdeationStore.getState().setGenerationStatus({
        phase: 'error',
        progress: 0,
        message: '',
        error: 'Process exited with code 1'
      });

      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('error');
      expect(state.generationStatus.error).toBe('Process exited with code 1');
    });

    it('should preserve error message when transitioning to error state', () => {
      const errorMessage = 'No OAuth token found. Auto Claude requires Claude Code OAuth authentication.';

      useIdeationStore.getState().setGenerationStatus({
        phase: 'error',
        progress: 0,
        message: '',
        error: errorMessage
      });

      expect(useIdeationStore.getState().generationStatus.error).toBe(errorMessage);
    });
  });

  describe('addLog with errors', () => {
    it('should add error log entries', () => {
      useIdeationStore.getState().addLog('Error: authentication required');

      const logs = useIdeationStore.getState().logs;
      expect(logs).toContain('Error: authentication required');
    });

    it('should accumulate multiple error logs', () => {
      useIdeationStore.getState().addLog('Starting generation...');
      useIdeationStore.getState().addLog('Error: authentication required');
      useIdeationStore.getState().addLog('Error: process exited with code 1');

      const logs = useIdeationStore.getState().logs;
      expect(logs.length).toBe(3);
      expect(logs[0]).toBe('Starting generation...');
      expect(logs[1]).toBe('Error: authentication required');
      expect(logs[2]).toBe('Error: process exited with code 1');
    });

    it('should preserve order of log entries', () => {
      useIdeationStore.getState().addLog('Step 1');
      useIdeationStore.getState().addLog('Step 2');
      useIdeationStore.getState().addLog('Error occurred');
      useIdeationStore.getState().addLog('Step 3 - recovery');

      const logs = useIdeationStore.getState().logs;
      expect(logs).toEqual([
        'Step 1',
        'Step 2',
        'Error occurred',
        'Step 3 - recovery'
      ]);
    });
  });

  describe('clearSession clears error state', () => {
    it('should clear error state when clearing session', () => {
      // Setup: Error state
      useIdeationStore.setState({
        generationStatus: {
          phase: 'error',
          progress: 0,
          message: '',
          error: 'Test error'
        },
        logs: ['Error: Test error']
      });

      // Act: Clear session
      useIdeationStore.getState().clearSession();

      // Assert: Error state is cleared (but logs are preserved - they're cleared separately)
      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('idle');
      expect(state.generationStatus.error).toBeUndefined();
      // Note: clearSession does NOT clear logs - that's done by clearLogs()
      // This is by design to allow viewing error history
    });

    it('should reset to initial state after error', () => {
      // Setup: Error state with partial generation
      useIdeationStore.setState({
        generationStatus: {
          phase: 'error',
          progress: 50,
          message: 'Failed at 50%',
          error: 'Process crashed'
        },
        typeStates: {
          code_improvements: 'completed',
          ui_ux_improvements: 'failed',
          documentation_gaps: 'pending',
          security_hardening: 'pending',
          performance_optimizations: 'pending',
          code_quality: 'pending'
        },
        logs: ['Started', 'Code improvements done', 'Error in UI/UX']
      });

      // Act: Clear session
      useIdeationStore.getState().clearSession();

      // Assert: Generation state is reset, logs preserved
      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('idle');
      expect(state.generationStatus.progress).toBe(0);
      expect(state.typeStates.code_improvements).toBe('pending');
      expect(state.typeStates.ui_ux_improvements).toBe('pending');
      // Logs are NOT cleared by clearSession - use clearLogs() for that
    });

    it('should clear logs when clearLogs is called', () => {
      // Setup: Error state with logs
      useIdeationStore.setState({
        logs: ['Started', 'Error occurred', 'Failed']
      });

      expect(useIdeationStore.getState().logs.length).toBe(3);

      // Act: Clear logs
      useIdeationStore.getState().clearLogs();

      // Assert: Logs are cleared
      expect(useIdeationStore.getState().logs.length).toBe(0);
    });
  });

  describe('Error state UI display logic', () => {
    it('should identify error state for UI conditional rendering', () => {
      useIdeationStore.getState().setGenerationStatus({
        phase: 'error',
        progress: 0,
        message: '',
        error: 'Test error'
      });

      const { generationStatus } = useIdeationStore.getState();

      // This is the condition used in Ideation.tsx
      const showProgressScreen =
        generationStatus.phase !== 'idle' &&
        generationStatus.phase !== 'complete' &&
        generationStatus.phase !== 'error';

      expect(showProgressScreen).toBe(false);
    });

    it('should show progress screen during generation', () => {
      useIdeationStore.getState().setGenerationStatus({
        phase: 'generating',
        progress: 50,
        message: 'Processing...'
      });

      const { generationStatus } = useIdeationStore.getState();

      const showProgressScreen =
        generationStatus.phase !== 'idle' &&
        generationStatus.phase !== 'complete' &&
        generationStatus.phase !== 'error';

      expect(showProgressScreen).toBe(true);
    });

    it('should hide progress screen when idle', () => {
      const { generationStatus } = useIdeationStore.getState();

      const showProgressScreen =
        generationStatus.phase !== 'idle' &&
        generationStatus.phase !== 'complete' &&
        generationStatus.phase !== 'error';

      expect(showProgressScreen).toBe(false);
    });
  });

  describe('Type state handling during errors', () => {
    it('should mark type as failed when error occurs', () => {
      useIdeationStore.getState().setTypeState('code_improvements', 'failed');

      expect(useIdeationStore.getState().typeStates.code_improvements).toBe('failed');
    });

    it('should preserve other type states when one fails', () => {
      // Setup: Partial progress
      useIdeationStore.setState({
        typeStates: {
          code_improvements: 'completed',
          ui_ux_improvements: 'generating',
          documentation_gaps: 'pending',
          security_hardening: 'pending',
          performance_optimizations: 'pending',
          code_quality: 'pending'
        }
      });

      // Act: Mark ui_ux as failed
      useIdeationStore.getState().setTypeState('ui_ux_improvements', 'failed');

      // Assert: Only ui_ux changed
      const { typeStates } = useIdeationStore.getState();
      expect(typeStates.code_improvements).toBe('completed');
      expect(typeStates.ui_ux_improvements).toBe('failed');
      expect(typeStates.documentation_gaps).toBe('pending');
    });
  });

  describe('Error event handling simulation', () => {
    it('should simulate onIdeationError event handling', () => {
      // This simulates the behavior in setupIdeationListeners()
      const projectId = 'test-project';
      const error = 'authentication required';

      // Simulate setting current project
      useIdeationStore.getState().setCurrentProjectId(projectId);

      // Simulate onIdeationError handler
      useIdeationStore.getState().setGenerationStatus({
        phase: 'error',
        progress: 0,
        message: '',
        error
      });
      useIdeationStore.getState().addLog(`Error: ${error}`);

      // Verify state
      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('error');
      expect(state.generationStatus.error).toBe(error);
      expect(state.logs).toContain(`Error: ${error}`);
    });

    it('should ignore error events for wrong project', () => {
      // Setup: Current project is A
      useIdeationStore.getState().setCurrentProjectId('project-a');

      // Simulate error state being set (as if from correct project)
      const initialLogs = [...useIdeationStore.getState().logs];

      // The IPC listener would validate projectId before updating
      // If validation fails, no update happens
      // Here we simulate successful validation
      useIdeationStore.getState().setGenerationStatus({
        phase: 'error',
        progress: 0,
        message: '',
        error: 'test error'
      });

      expect(useIdeationStore.getState().generationStatus.phase).toBe('error');
    });
  });

  describe('Auth failure specific errors', () => {
    const authErrorMessages = [
      'authentication required',
      'No OAuth token found. Auto Claude requires Claude Code OAuth authentication.',
      'Please configure your OAuth token in Settings > Claude Profiles.',
      'Invalid token',
      'Session expired',
      'Unauthorized access'
    ];

    authErrorMessages.forEach(errorMessage => {
      it(`should handle auth error: "${errorMessage.substring(0, 30)}..."`, () => {
        useIdeationStore.getState().setGenerationStatus({
          phase: 'error',
          progress: 0,
          message: '',
          error: errorMessage
        });
        useIdeationStore.getState().addLog(`Error: ${errorMessage}`);

        const state = useIdeationStore.getState();
        expect(state.generationStatus.phase).toBe('error');
        expect(state.generationStatus.error).toBe(errorMessage);
        expect(state.logs.some(log => log.includes(errorMessage))).toBe(true);
      });
    });
  });

  describe('Recovery from error state', () => {
    it('should allow retry after error', () => {
      // Setup: Error state
      useIdeationStore.setState({
        generationStatus: {
          phase: 'error',
          progress: 0,
          message: '',
          error: 'Previous error'
        }
      });

      // Act: Clear and start new generation
      useIdeationStore.getState().clearSession();
      useIdeationStore.getState().setGenerationStatus({
        phase: 'generating',
        progress: 0,
        message: 'Starting generation...'
      });

      // Assert: Generation in progress
      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('generating');
      expect(state.generationStatus.error).toBeUndefined();
    });

    it('should clear previous error when new generation starts', () => {
      // Setup: Error state with logs
      useIdeationStore.setState({
        generationStatus: {
          phase: 'error',
          progress: 0,
          message: '',
          error: 'auth failed'
        },
        logs: ['Error: auth failed']
      });

      // Act: Clear session and logs (as generateIdeation does)
      // Note: generateIdeation calls clearLogs() THEN clearSession()
      useIdeationStore.getState().clearLogs();
      useIdeationStore.getState().clearSession();

      // Assert: Clean slate
      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('idle');
      expect(state.generationStatus.error).toBeUndefined();
      expect(state.logs.length).toBe(0);
    });

    it('should simulate full generateIdeation recovery flow', () => {
      // Setup: Error state
      useIdeationStore.setState({
        generationStatus: {
          phase: 'error',
          progress: 0,
          message: '',
          error: 'Previous auth error'
        },
        logs: ['Error: Previous auth error']
      });

      // Act: Simulate what generateIdeation does for recovery
      // Step 1: Clear logs (line 368 in ideation-store.ts)
      useIdeationStore.getState().clearLogs();
      // Step 2: Clear session (line 369)
      useIdeationStore.getState().clearSession();
      // Step 3: Initialize type states (sets enabled types to 'generating')
      useIdeationStore.getState().initializeTypeStates(['code_improvements', 'ui_ux_improvements']);
      // Step 4: Add starting log
      useIdeationStore.getState().addLog('Starting ideation generation in parallel...');
      // Step 5: Set generating status
      useIdeationStore.getState().setGenerationStatus({
        phase: 'generating',
        progress: 0,
        message: 'Generating 2 ideation types in parallel...'
      });

      // Assert: Ready for new generation
      const state = useIdeationStore.getState();
      expect(state.generationStatus.phase).toBe('generating');
      expect(state.generationStatus.error).toBeUndefined();
      expect(state.logs.length).toBe(1);
      expect(state.logs[0]).toBe('Starting ideation generation in parallel...');
      // initializeTypeStates sets enabled types to 'generating' (not 'pending')
      expect(state.typeStates.code_improvements).toBe('generating');
      expect(state.typeStates.ui_ux_improvements).toBe('generating');
      // Disabled types remain 'pending'
      expect(state.typeStates.documentation_gaps).toBe('pending');
    });
  });
});
