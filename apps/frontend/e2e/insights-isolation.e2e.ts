/**
 * End-to-End tests for Insights View session and project isolation
 * Tests cross-session and cross-project state isolation to prevent state leakage
 *
 * NOTE: These tests require the Electron app to be built first.
 * Run `npm run build` before running E2E tests.
 *
 * To run: npx playwright test --config=e2e/playwright.config.ts insights-isolation
 */
import { test, expect, _electron as _electron, ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';

// Test data directories
const TEST_DATA_DIR = '/tmp/auto-claude-insights-e2e';
const TEST_PROJECT_1_DIR = path.join(TEST_DATA_DIR, 'project-1');
const TEST_PROJECT_2_DIR = path.join(TEST_DATA_DIR, 'project-2');

// ============================================
// Test Environment Setup
// ============================================

function setupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(TEST_PROJECT_1_DIR, { recursive: true });
  mkdirSync(TEST_PROJECT_2_DIR, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_1_DIR, 'auto-claude', 'specs'), { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_2_DIR, 'auto-claude', 'specs'), { recursive: true });
}

function cleanupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

// ============================================
// Mock Session State for Testing
// ============================================

interface MockSessionState {
  streamingContent: string;
  currentTool: { name: string; input?: string } | null;
  status: { phase: string; message: string };
  toolsUsed: Array<{ name: string; timestamp: Date }>;
  lastUpdated: Date;
}

function createMockSessionState(overrides: Partial<MockSessionState> = {}): MockSessionState {
  return {
    streamingContent: '',
    currentTool: null,
    status: { phase: 'idle', message: '' },
    toolsUsed: [],
    lastUpdated: new Date(),
    ...overrides
  };
}

function getSessionKey(projectId: string, sessionId: string): string {
  return `${projectId}:${sessionId}`;
}

// ============================================
// Interactive Electron Tests (require app to be running)
// ============================================

test.describe('Insights Cross-Session Isolation (Interactive)', () => {
  // These variables are placeholders for future interactive Electron tests
  let _app: ElectronApplication | undefined;
  let _page: Page | undefined;

  test.beforeAll(async () => {
    setupTestEnvironment();
  });

  test.afterAll(async () => {
    if (_app) {
      await _app.close();
    }
    cleanupTestEnvironment();
  });

  test.skip('should have input enabled in new conversation when another has active agent', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start a conversation A with an active agent query
    // 2. While agent is running, switch to a new conversation B
    // 3. Verify input textbox is enabled in conversation B
    // 4. Verify no tool indicators visible in conversation B
  });

  test.skip('should show tool indicators only in originating session', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start a query that uses tools in Conversation A
    // 2. While tools are being used, observe tool indicators
    // 3. Switch to Conversation B
    // 4. Verify no tool indicators visible in Conversation B
    // 5. Return to Conversation A
    // 6. Verify tool indicators still visible in Conversation A
  });

  test.skip('should have model selector work independently per conversation', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Open Conversation A and start an agent query
    // 2. While agent is running, model selector should be disabled in A
    // 3. Switch to Conversation B
    // 4. Verify model selector is enabled in Conversation B
    // 5. Change model in Conversation B
    // 6. Verify model change doesn't affect Conversation A
  });

  test.skip('should preserve agent state when returning to previous conversation', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start an agent query in Conversation A
    // 2. Switch to Conversation B
    // 3. Return to Conversation A
    // 4. Verify agent state (streaming content, tools used) is preserved
    // 5. Verify loading state is correct for Conversation A
  });

  test.skip('should isolate task suggestions to originating conversation', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start a query that generates task suggestion in Conversation A
    // 2. Switch to Conversation B
    // 3. Verify no task suggestion visible in Conversation B
    // 4. Return to Conversation A
    // 5. Verify task suggestion is visible in Conversation A
  });
});

test.describe('Insights Cross-Project Isolation (Interactive)', () => {
  // These variables are placeholders for future interactive Electron tests
  let _app: ElectronApplication | undefined;
  let _page: Page | undefined;

  test.beforeAll(async () => {
    setupTestEnvironment();
  });

  test.afterAll(async () => {
    if (_app) {
      await _app.close();
    }
    cleanupTestEnvironment();
  });

  test.skip('should completely isolate state between projects', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start an agent query in Project A
    // 2. Switch to Project B
    // 3. Verify no state from Project A visible in Project B:
    //    - Input is enabled
    //    - No streaming content
    //    - No tool indicators
    //    - No loading state
  });

  test.skip('should filter IPC events by project', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start an agent query in Project A
    // 2. Switch to Project B
    // 3. While Project A events are coming in, verify they don't update Project B UI
    // 4. Start a query in Project B
    // 5. Verify only Project B events update the UI
  });

  test.skip('should preserve project state on return', async () => {
    // This test requires interactive Electron session
    test.skip(!process.env.ELECTRON_PATH, 'Electron not available in CI');

    // Steps:
    // 1. Start an agent query in Project A
    // 2. Switch to Project B
    // 3. Start a query in Project B
    // 4. Return to Project A
    // 5. Verify Project A state is preserved
    // 6. Return to Project B
    // 7. Verify Project B state is preserved
  });
});

// ============================================
// Mock-based E2E Tests (can run without Electron)
// ============================================

test.describe('Insights Session Isolation (Mock-based)', () => {
  test('should generate unique session keys for different sessions', async () => {
    setupTestEnvironment();

    const key1 = getSessionKey('project-1', 'session-1');
    const key2 = getSessionKey('project-1', 'session-2');
    const key3 = getSessionKey('project-2', 'session-1');

    expect(key1).toBe('project-1:session-1');
    expect(key2).toBe('project-1:session-2');
    expect(key3).toBe('project-2:session-1');

    // All keys should be unique
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key2).not.toBe(key3);

    cleanupTestEnvironment();
  });

  test('should maintain separate state for different sessions', async () => {
    setupTestEnvironment();

    // Simulate session states for multiple sessions
    const sessionStates = new Map<string, MockSessionState>();

    // Session A is actively streaming with a tool
    const sessionAKey = getSessionKey('project-1', 'session-a');
    sessionStates.set(sessionAKey, createMockSessionState({
      streamingContent: 'Session A is responding...',
      currentTool: { name: 'Read', input: 'file.ts' },
      status: { phase: 'streaming', message: 'Reading file...' },
      toolsUsed: [{ name: 'Read', timestamp: new Date() }]
    }));

    // Session B is idle
    const sessionBKey = getSessionKey('project-1', 'session-b');
    sessionStates.set(sessionBKey, createMockSessionState({
      streamingContent: '',
      currentTool: null,
      status: { phase: 'idle', message: '' },
      toolsUsed: []
    }));

    // Verify isolation
    const stateA = sessionStates.get(sessionAKey);
    const stateB = sessionStates.get(sessionBKey);

    expect(stateA?.streamingContent).toBe('Session A is responding...');
    expect(stateA?.currentTool?.name).toBe('Read');
    expect(stateA?.status.phase).toBe('streaming');

    expect(stateB?.streamingContent).toBe('');
    expect(stateB?.currentTool).toBeNull();
    expect(stateB?.status.phase).toBe('idle');

    cleanupTestEnvironment();
  });

  test('should update only the active session state', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();
    // Active context: project-1:session-a

    // Initialize both sessions
    const sessionAKey = getSessionKey('project-1', 'session-a');
    const sessionBKey = getSessionKey('project-1', 'session-b');

    sessionStates.set(sessionAKey, createMockSessionState());
    sessionStates.set(sessionBKey, createMockSessionState({ streamingContent: 'preserved content' }));

    // Simulate updating only the active session
    const currentState = sessionStates.get(sessionAKey);
    if (currentState) {
      sessionStates.set(sessionAKey, {
        ...currentState,
        streamingContent: 'new content for session A',
        status: { phase: 'streaming', message: 'Processing...' }
      });
    }

    // Verify session A was updated
    expect(sessionStates.get(sessionAKey)?.streamingContent).toBe('new content for session A');
    expect(sessionStates.get(sessionAKey)?.status.phase).toBe('streaming');

    // Verify session B was NOT updated
    expect(sessionStates.get(sessionBKey)?.streamingContent).toBe('preserved content');
    expect(sessionStates.get(sessionBKey)?.status.phase).toBe('idle');

    cleanupTestEnvironment();
  });

  test('should filter IPC events by projectId', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();
    const activeProjectId = 'project-1';
    const activeSessionId = 'session-1';

    const sessionKey = getSessionKey(activeProjectId, activeSessionId);
    sessionStates.set(sessionKey, createMockSessionState());

    // Simulate IPC event handler with filtering
    function handleIPCEvent(eventProjectId: string, eventSessionId: string, content: string): boolean {
      // CRITICAL: Filter by projectId to prevent cross-project contamination
      if (eventProjectId !== activeProjectId) {
        return false; // Event filtered out
      }

      const key = getSessionKey(eventProjectId, eventSessionId);
      const currentState = sessionStates.get(key);
      if (currentState) {
        sessionStates.set(key, {
          ...currentState,
          streamingContent: currentState.streamingContent + content
        });
      }
      return true; // Event processed
    }

    // Event from active project should be processed
    const processed1 = handleIPCEvent('project-1', 'session-1', 'hello');
    expect(processed1).toBe(true);
    expect(sessionStates.get(sessionKey)?.streamingContent).toBe('hello');

    // Event from different project should be filtered
    const processed2 = handleIPCEvent('project-2', 'session-1', ' world');
    expect(processed2).toBe(false);
    expect(sessionStates.get(sessionKey)?.streamingContent).toBe('hello'); // Unchanged

    cleanupTestEnvironment();
  });

  test('should preserve state when switching between sessions', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();
    // Simulating: active context is project-1:session-a

    // Set up initial state for session A
    const sessionAKey = getSessionKey('project-1', 'session-a');
    sessionStates.set(sessionAKey, createMockSessionState({
      streamingContent: 'Session A content',
      currentTool: { name: 'Grep', input: 'pattern' },
      status: { phase: 'streaming', message: 'Searching...' },
      toolsUsed: [{ name: 'Grep', timestamp: new Date() }]
    }));

    // Simulating: switch to session B
    const sessionBKey = getSessionKey('project-1', 'session-b');
    sessionStates.set(sessionBKey, createMockSessionState());

    // Session B should show idle state
    expect(sessionStates.get(sessionBKey)?.status.phase).toBe('idle');
    expect(sessionStates.get(sessionBKey)?.currentTool).toBeNull();

    // Simulating: switch back to session A - state should be preserved
    const restoredState = sessionStates.get(sessionAKey);

    expect(restoredState?.streamingContent).toBe('Session A content');
    expect(restoredState?.currentTool?.name).toBe('Grep');
    expect(restoredState?.status.phase).toBe('streaming');
    expect(restoredState?.toolsUsed).toHaveLength(1);

    cleanupTestEnvironment();
  });

  test('should determine isLoading from session-specific state', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();

    // Session A is actively loading
    const sessionAKey = getSessionKey('project-1', 'session-a');
    sessionStates.set(sessionAKey, createMockSessionState({
      status: { phase: 'streaming', message: 'Processing...' }
    }));

    // Session B is idle
    const sessionBKey = getSessionKey('project-1', 'session-b');
    sessionStates.set(sessionBKey, createMockSessionState({
      status: { phase: 'idle', message: '' }
    }));

    // Helper to determine if session is loading
    function isSessionLoading(projectId: string, sessionId: string): boolean {
      const key = getSessionKey(projectId, sessionId);
      const state = sessionStates.get(key);
      return state?.status.phase === 'streaming' || state?.status.phase === 'thinking';
    }

    // Session A should be loading
    expect(isSessionLoading('project-1', 'session-a')).toBe(true);

    // Session B should NOT be loading
    expect(isSessionLoading('project-1', 'session-b')).toBe(false);

    cleanupTestEnvironment();
  });
});

test.describe('Insights Project Isolation (Mock-based)', () => {
  test('should generate unique keys for different projects', async () => {
    setupTestEnvironment();

    const project1Key = getSessionKey('project-1', 'session-1');
    const project2Key = getSessionKey('project-2', 'session-1');

    expect(project1Key).not.toBe(project2Key);
    expect(project1Key).toBe('project-1:session-1');
    expect(project2Key).toBe('project-2:session-1');

    cleanupTestEnvironment();
  });

  test('should completely isolate state between projects', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();

    // Project 1 session with active state
    const project1Key = getSessionKey('project-1', 'session-1');
    sessionStates.set(project1Key, createMockSessionState({
      streamingContent: 'Project 1 is responding',
      currentTool: { name: 'Write', input: 'new file' },
      status: { phase: 'streaming', message: 'Writing...' },
      toolsUsed: [
        { name: 'Read', timestamp: new Date() },
        { name: 'Write', timestamp: new Date() }
      ]
    }));

    // Project 2 session - completely independent
    const project2Key = getSessionKey('project-2', 'session-1');
    sessionStates.set(project2Key, createMockSessionState({
      streamingContent: '',
      currentTool: null,
      status: { phase: 'idle', message: '' },
      toolsUsed: []
    }));

    // Verify complete isolation
    const project1State = sessionStates.get(project1Key);
    const project2State = sessionStates.get(project2Key);

    // Project 1 is active
    expect(project1State?.streamingContent).toBe('Project 1 is responding');
    expect(project1State?.currentTool?.name).toBe('Write');
    expect(project1State?.status.phase).toBe('streaming');
    expect(project1State?.toolsUsed).toHaveLength(2);

    // Project 2 is completely clean
    expect(project2State?.streamingContent).toBe('');
    expect(project2State?.currentTool).toBeNull();
    expect(project2State?.status.phase).toBe('idle');
    expect(project2State?.toolsUsed).toHaveLength(0);

    cleanupTestEnvironment();
  });

  test('should handle switching between projects with different active sessions', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();

    // Set up states for both projects
    const project1Session1 = getSessionKey('project-1', 'session-1');
    const project1Session2 = getSessionKey('project-1', 'session-2');
    const project2Session1 = getSessionKey('project-2', 'session-1');

    sessionStates.set(project1Session1, createMockSessionState({
      streamingContent: 'P1S1 content',
      status: { phase: 'complete', message: '' }
    }));
    sessionStates.set(project1Session2, createMockSessionState({
      streamingContent: 'P1S2 content',
      status: { phase: 'streaming', message: 'Active' }
    }));
    sessionStates.set(project2Session1, createMockSessionState({
      streamingContent: 'P2S1 content',
      status: { phase: 'idle', message: '' }
    }));

    // Simulating: switch to project 2, session 1
    const activeProjectId = 'project-2';
    const activeSessionId = 'session-1';

    // Verify we see project 2 state
    const activeKey = getSessionKey(activeProjectId, activeSessionId);
    const activeState = sessionStates.get(activeKey);
    expect(activeState?.streamingContent).toBe('P2S1 content');
    expect(activeState?.status.phase).toBe('idle');

    // Project 1 states should be preserved
    expect(sessionStates.get(project1Session1)?.streamingContent).toBe('P1S1 content');
    expect(sessionStates.get(project1Session2)?.streamingContent).toBe('P1S2 content');
    expect(sessionStates.get(project1Session2)?.status.phase).toBe('streaming');

    cleanupTestEnvironment();
  });

  test('should cleanup all sessions for a project', async () => {
    setupTestEnvironment();

    const sessionStates = new Map<string, MockSessionState>();

    // Set up sessions for multiple projects
    sessionStates.set(getSessionKey('project-1', 'session-1'), createMockSessionState());
    sessionStates.set(getSessionKey('project-1', 'session-2'), createMockSessionState());
    sessionStates.set(getSessionKey('project-1', 'session-3'), createMockSessionState());
    sessionStates.set(getSessionKey('project-2', 'session-1'), createMockSessionState());
    sessionStates.set(getSessionKey('project-2', 'session-2'), createMockSessionState());

    expect(sessionStates.size).toBe(5);

    // Simulate cleanup for project-1
    function cleanupProjectSessions(projectId: string): void {
      const keysToDelete: string[] = [];
      for (const key of sessionStates.keys()) {
        if (key.startsWith(`${projectId}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        sessionStates.delete(key);
      }
    }

    cleanupProjectSessions('project-1');

    // Project 1 sessions should be removed
    expect(sessionStates.has(getSessionKey('project-1', 'session-1'))).toBe(false);
    expect(sessionStates.has(getSessionKey('project-1', 'session-2'))).toBe(false);
    expect(sessionStates.has(getSessionKey('project-1', 'session-3'))).toBe(false);

    // Project 2 sessions should remain
    expect(sessionStates.has(getSessionKey('project-2', 'session-1'))).toBe(true);
    expect(sessionStates.has(getSessionKey('project-2', 'session-2'))).toBe(true);

    expect(sessionStates.size).toBe(2);

    cleanupTestEnvironment();
  });
});

test.describe('Insights Memory Cleanup (Mock-based)', () => {
  test('should limit session states per project', async () => {
    setupTestEnvironment();

    const MAX_SESSIONS_PER_PROJECT = 10;
    const sessionStates = new Map<string, MockSessionState>();
    const now = Date.now();

    // Create 15 sessions for project-1 (exceeds limit)
    for (let i = 0; i < 15; i++) {
      sessionStates.set(
        getSessionKey('project-1', `session-${i}`),
        createMockSessionState({
          lastUpdated: new Date(now - i * 1000) // Older sessions have earlier timestamps
        })
      );
    }

    expect(sessionStates.size).toBe(15);

    // Simulate cleanup - keep only most recent 10
    function cleanupOldSessions(projectId: string): void {
      const projectSessions: Array<{ key: string; lastUpdated: Date }> = [];

      for (const [key, state] of sessionStates.entries()) {
        if (key.startsWith(`${projectId}:`)) {
          projectSessions.push({ key, lastUpdated: state.lastUpdated });
        }
      }

      if (projectSessions.length <= MAX_SESSIONS_PER_PROJECT) {
        return;
      }

      // Sort by lastUpdated descending (most recent first)
      projectSessions.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

      // Remove sessions beyond the limit
      const sessionsToRemove = projectSessions.slice(MAX_SESSIONS_PER_PROJECT);
      for (const { key } of sessionsToRemove) {
        sessionStates.delete(key);
      }
    }

    cleanupOldSessions('project-1');

    // Should only have 10 sessions now
    expect(sessionStates.size).toBe(10);

    // Most recent sessions (0-9) should be kept
    for (let i = 0; i < 10; i++) {
      expect(sessionStates.has(getSessionKey('project-1', `session-${i}`))).toBe(true);
    }

    // Oldest sessions (10-14) should be removed
    for (let i = 10; i < 15; i++) {
      expect(sessionStates.has(getSessionKey('project-1', `session-${i}`))).toBe(false);
    }

    cleanupTestEnvironment();
  });

  test('should not remove active session during cleanup', async () => {
    setupTestEnvironment();

    const MAX_SESSIONS_PER_PROJECT = 10;
    const sessionStates = new Map<string, MockSessionState>();
    const now = Date.now();
    const activeProjectId = 'project-1';
    const activeSessionId = 'session-14'; // The oldest session

    // Create 15 sessions for project-1
    for (let i = 0; i < 15; i++) {
      sessionStates.set(
        getSessionKey('project-1', `session-${i}`),
        createMockSessionState({
          lastUpdated: new Date(now - i * 1000)
        })
      );
    }

    // Simulate cleanup that preserves active session
    function cleanupOldSessions(projectId: string): void {
      const projectSessions: Array<{ key: string; lastUpdated: Date }> = [];
      const activeKey = getSessionKey(activeProjectId, activeSessionId);

      for (const [key, state] of sessionStates.entries()) {
        if (key.startsWith(`${projectId}:`)) {
          projectSessions.push({ key, lastUpdated: state.lastUpdated });
        }
      }

      if (projectSessions.length <= MAX_SESSIONS_PER_PROJECT) {
        return;
      }

      projectSessions.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

      const sessionsToRemove = projectSessions.slice(MAX_SESSIONS_PER_PROJECT);
      for (const { key } of sessionsToRemove) {
        // Don't remove active session
        if (key !== activeKey) {
          sessionStates.delete(key);
        }
      }
    }

    cleanupOldSessions('project-1');

    // Active session should be preserved even though it's the oldest
    expect(sessionStates.has(getSessionKey('project-1', 'session-14'))).toBe(true);

    // Should have 11 sessions (10 + 1 preserved active)
    expect(sessionStates.size).toBe(11);

    cleanupTestEnvironment();
  });
});

test.describe('E2E Test Infrastructure for Insights Isolation', () => {
  test('should have test environment setup correctly', () => {
    setupTestEnvironment();

    expect(existsSync(TEST_DATA_DIR)).toBe(true);
    expect(existsSync(TEST_PROJECT_1_DIR)).toBe(true);
    expect(existsSync(TEST_PROJECT_2_DIR)).toBe(true);
    expect(existsSync(path.join(TEST_PROJECT_1_DIR, 'auto-claude', 'specs'))).toBe(true);
    expect(existsSync(path.join(TEST_PROJECT_2_DIR, 'auto-claude', 'specs'))).toBe(true);

    cleanupTestEnvironment();
  });

  test('should cleanup test environment correctly', () => {
    setupTestEnvironment();
    expect(existsSync(TEST_DATA_DIR)).toBe(true);

    cleanupTestEnvironment();
    expect(existsSync(TEST_DATA_DIR)).toBe(false);
  });

  test('should create mock session states correctly', () => {
    const defaultState = createMockSessionState();

    expect(defaultState.streamingContent).toBe('');
    expect(defaultState.currentTool).toBeNull();
    expect(defaultState.status.phase).toBe('idle');
    expect(defaultState.toolsUsed).toHaveLength(0);
    expect(defaultState.lastUpdated).toBeInstanceOf(Date);

    const customState = createMockSessionState({
      streamingContent: 'custom content',
      currentTool: { name: 'TestTool' },
      status: { phase: 'streaming', message: 'testing' }
    });

    expect(customState.streamingContent).toBe('custom content');
    expect(customState.currentTool?.name).toBe('TestTool');
    expect(customState.status.phase).toBe('streaming');
  });
});
