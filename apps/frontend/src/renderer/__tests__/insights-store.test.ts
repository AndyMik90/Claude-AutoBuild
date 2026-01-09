/**
 * Unit tests for Insights Store
 * Tests Zustand store for session key generation and state isolation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useInsightsStore,
  getSessionKey,
  parseSessionKey,
  getOrCreateSessionState,
  type SessionState
} from '../stores/insights-store';
import type {
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsToolUsage
} from '../../shared/types';

// Helper to create test sessions
function createTestSession(overrides: Partial<InsightsSession> = {}): InsightsSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    projectId: 'project-1',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to create test session summaries
function createTestSessionSummary(
  overrides: Partial<InsightsSessionSummary> = {}
): InsightsSessionSummary {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    projectId: 'project-1',
    title: 'Test Session',
    messageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to create test messages
function createTestMessage(overrides: Partial<InsightsChatMessage> = {}): InsightsChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    role: 'user',
    content: 'Test message content',
    timestamp: new Date(),
    ...overrides
  };
}

// Helper to create test session state
function createTestSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    streamingContent: '',
    currentTool: null,
    status: { phase: 'idle', message: '' },
    toolsUsed: [],
    lastUpdated: new Date(),
    ...overrides
  };
}

// Default initial state for resetting
const initialState = {
  session: null,
  sessions: [],
  status: { phase: 'idle' as const, message: '' },
  pendingMessage: '',
  streamingContent: '',
  currentTool: null,
  toolsUsed: [],
  isLoadingSessions: false,
  activeProjectId: null,
  activeSessionId: null,
  sessionStates: new Map<string, SessionState>()
};

describe('Insights Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useInsightsStore.setState(initialState);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Session Key Generation Tests
  // ============================================

  describe('getSessionKey', () => {
    it('should create composite key from projectId and sessionId', () => {
      const key = getSessionKey('project-1', 'session-1');
      expect(key).toBe('project-1:session-1');
    });

    it('should handle empty projectId', () => {
      const key = getSessionKey('', 'session-1');
      expect(key).toBe(':session-1');
    });

    it('should handle empty sessionId', () => {
      const key = getSessionKey('project-1', '');
      expect(key).toBe('project-1:');
    });

    it('should handle projectId containing colons', () => {
      const key = getSessionKey('project:with:colons', 'session-1');
      expect(key).toBe('project:with:colons:session-1');
    });

    it('should handle sessionId containing colons', () => {
      const key = getSessionKey('project-1', 'session:with:colons');
      expect(key).toBe('project-1:session:with:colons');
    });

    it('should create unique keys for different projects', () => {
      const key1 = getSessionKey('project-1', 'session-1');
      const key2 = getSessionKey('project-2', 'session-1');
      expect(key1).not.toBe(key2);
    });

    it('should create unique keys for different sessions', () => {
      const key1 = getSessionKey('project-1', 'session-1');
      const key2 = getSessionKey('project-1', 'session-2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('parseSessionKey', () => {
    it('should parse valid composite key', () => {
      const result = parseSessionKey('project-1:session-1');
      expect(result).toEqual({ projectId: 'project-1', sessionId: 'session-1' });
    });

    it('should return null for key without colon', () => {
      const result = parseSessionKey('invalid-key');
      expect(result).toBeNull();
    });

    it('should handle key with empty projectId', () => {
      const result = parseSessionKey(':session-1');
      expect(result).toEqual({ projectId: '', sessionId: 'session-1' });
    });

    it('should handle key with empty sessionId', () => {
      const result = parseSessionKey('project-1:');
      expect(result).toEqual({ projectId: 'project-1', sessionId: '' });
    });

    it('should handle key with colons in sessionId', () => {
      const result = parseSessionKey('project-1:session:with:colons');
      expect(result).toEqual({ projectId: 'project-1', sessionId: 'session:with:colons' });
    });

    it('should return null for empty string', () => {
      const result = parseSessionKey('');
      expect(result).toBeNull();
    });

    it('should use first colon as separator', () => {
      const result = parseSessionKey('a:b:c');
      expect(result).toEqual({ projectId: 'a', sessionId: 'b:c' });
    });
  });

  describe('getOrCreateSessionState', () => {
    it('should return existing session state from map', () => {
      const existingState = createTestSessionState({
        streamingContent: 'existing content',
        status: { phase: 'streaming', message: 'test' }
      });
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', existingState);

      const result = getOrCreateSessionState('project-1:session-1', sessionStates);

      expect(result).toBe(existingState);
      expect(result.streamingContent).toBe('existing content');
    });

    it('should return default session state for non-existent key', () => {
      const sessionStates = new Map<string, SessionState>();

      const result = getOrCreateSessionState('project-1:session-1', sessionStates);

      expect(result.streamingContent).toBe('');
      expect(result.currentTool).toBeNull();
      expect(result.status).toEqual({ phase: 'idle', message: '' });
      expect(result.toolsUsed).toEqual([]);
    });

    it('should not mutate the map when key does not exist', () => {
      const sessionStates = new Map<string, SessionState>();

      getOrCreateSessionState('project-1:session-1', sessionStates);

      expect(sessionStates.size).toBe(0);
    });

    it('should return different default states for different calls', () => {
      const sessionStates = new Map<string, SessionState>();

      const result1 = getOrCreateSessionState('project-1:session-1', sessionStates);
      const result2 = getOrCreateSessionState('project-1:session-2', sessionStates);

      expect(result1).not.toBe(result2);
    });
  });

  // ============================================
  // Session State Isolation Tests
  // ============================================

  describe('setActiveContext', () => {
    it('should set activeProjectId and activeSessionId', () => {
      useInsightsStore.getState().setActiveContext('project-1', 'session-1');

      const state = useInsightsStore.getState();
      expect(state.activeProjectId).toBe('project-1');
      expect(state.activeSessionId).toBe('session-1');
    });

    it('should initialize session state if it does not exist', () => {
      useInsightsStore.getState().setActiveContext('project-1', 'session-1');

      const state = useInsightsStore.getState();
      const key = getSessionKey('project-1', 'session-1');
      expect(state.sessionStates.has(key)).toBe(true);
    });

    it('should preserve existing session state when setting context', () => {
      // First set up an existing session state
      const existingState = createTestSessionState({
        streamingContent: 'existing content'
      });
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', existingState);
      useInsightsStore.setState({ sessionStates });

      // Set active context
      useInsightsStore.getState().setActiveContext('project-1', 'session-1');

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.streamingContent).toBe('existing content');
    });

    it('should not modify other session states', () => {
      // Set up existing session states
      const existingState = createTestSessionState({
        streamingContent: 'other content'
      });
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', existingState);
      useInsightsStore.setState({ sessionStates });

      // Set active context for a different session
      useInsightsStore.getState().setActiveContext('project-1', 'session-2');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.get('project-1:session-1')?.streamingContent).toBe('other content');
    });
  });

  describe('getSessionState', () => {
    it('should return existing session state', () => {
      const existingState = createTestSessionState({
        streamingContent: 'test content',
        status: { phase: 'streaming', message: 'testing' }
      });
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', existingState);
      useInsightsStore.setState({ sessionStates });

      const result = useInsightsStore.getState().getSessionState('project-1', 'session-1');

      expect(result.streamingContent).toBe('test content');
      expect(result.status).toEqual({ phase: 'streaming', message: 'testing' });
    });

    it('should return default state for non-existent session', () => {
      const result = useInsightsStore.getState().getSessionState('project-1', 'nonexistent');

      expect(result.streamingContent).toBe('');
      expect(result.currentTool).toBeNull();
      expect(result.status).toEqual({ phase: 'idle', message: '' });
      expect(result.toolsUsed).toEqual([]);
    });
  });

  describe('removeSessionState', () => {
    it('should remove session state from map', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState());
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().removeSessionState('project-1', 'session-1');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.has('project-1:session-1')).toBe(false);
    });

    it('should not affect other session states', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState());
      sessionStates.set('project-1:session-2', createTestSessionState({ streamingContent: 'keep me' }));
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().removeSessionState('project-1', 'session-1');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.has('project-1:session-2')).toBe(true);
      expect(state.sessionStates.get('project-1:session-2')?.streamingContent).toBe('keep me');
    });

    it('should do nothing if session state does not exist', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState());
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().removeSessionState('project-1', 'nonexistent');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.size).toBe(1);
    });
  });

  describe('cleanupOldSessions', () => {
    it('should not cleanup when under limit', () => {
      const sessionStates = new Map<string, SessionState>();
      for (let i = 0; i < 5; i++) {
        sessionStates.set(`project-1:session-${i}`, createTestSessionState());
      }
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().cleanupOldSessions('project-1');

      expect(useInsightsStore.getState().sessionStates.size).toBe(5);
    });

    it('should cleanup oldest sessions when over limit', () => {
      const sessionStates = new Map<string, SessionState>();
      const now = Date.now();

      // Create 12 sessions (over the MAX_SESSIONS_PER_PROJECT of 10)
      for (let i = 0; i < 12; i++) {
        sessionStates.set(
          `project-1:session-${i}`,
          createTestSessionState({
            lastUpdated: new Date(now - i * 1000) // Older sessions have earlier timestamps
          })
        );
      }
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().cleanupOldSessions('project-1');

      const state = useInsightsStore.getState();
      // Should keep only 10 sessions (the most recent ones)
      expect(state.sessionStates.size).toBe(10);

      // The oldest sessions (session-10, session-11) should be removed
      expect(state.sessionStates.has('project-1:session-10')).toBe(false);
      expect(state.sessionStates.has('project-1:session-11')).toBe(false);

      // The newest sessions should remain
      expect(state.sessionStates.has('project-1:session-0')).toBe(true);
      expect(state.sessionStates.has('project-1:session-1')).toBe(true);
    });

    it('should not remove active session even if old', () => {
      const sessionStates = new Map<string, SessionState>();
      const now = Date.now();

      // Create 12 sessions with the active session being the oldest
      for (let i = 0; i < 12; i++) {
        sessionStates.set(
          `project-1:session-${i}`,
          createTestSessionState({
            lastUpdated: new Date(now - i * 1000)
          })
        );
      }

      // Set active session to one of the oldest
      useInsightsStore.setState({
        sessionStates,
        activeProjectId: 'project-1',
        activeSessionId: 'session-11'
      });

      useInsightsStore.getState().cleanupOldSessions('project-1');

      const state = useInsightsStore.getState();
      // Active session should be preserved even though it's old
      expect(state.sessionStates.has('project-1:session-11')).toBe(true);
    });

    it('should not affect sessions from other projects', () => {
      const sessionStates = new Map<string, SessionState>();
      const now = Date.now();

      // Create sessions for project-1
      for (let i = 0; i < 12; i++) {
        sessionStates.set(
          `project-1:session-${i}`,
          createTestSessionState({ lastUpdated: new Date(now - i * 1000) })
        );
      }

      // Create sessions for project-2
      for (let i = 0; i < 5; i++) {
        sessionStates.set(
          `project-2:session-${i}`,
          createTestSessionState({ lastUpdated: new Date(now - i * 1000) })
        );
      }

      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().cleanupOldSessions('project-1');

      const state = useInsightsStore.getState();

      // Project-2 sessions should be unaffected
      for (let i = 0; i < 5; i++) {
        expect(state.sessionStates.has(`project-2:session-${i}`)).toBe(true);
      }
    });
  });

  describe('cleanupProjectSessions', () => {
    it('should remove all sessions for a project', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState());
      sessionStates.set('project-1:session-2', createTestSessionState());
      sessionStates.set('project-2:session-1', createTestSessionState());
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().cleanupProjectSessions('project-1');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.has('project-1:session-1')).toBe(false);
      expect(state.sessionStates.has('project-1:session-2')).toBe(false);
      expect(state.sessionStates.has('project-2:session-1')).toBe(true);
    });

    it('should do nothing if project has no sessions', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState());
      useInsightsStore.setState({ sessionStates });

      useInsightsStore.getState().cleanupProjectSessions('project-2');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.size).toBe(1);
    });
  });

  // ============================================
  // State Update Isolation Tests
  // ============================================

  describe('setStatus with session isolation', () => {
    it('should update global status', () => {
      const newStatus: InsightsChatStatus = { phase: 'streaming', message: 'test' };

      useInsightsStore.getState().setStatus(newStatus);

      expect(useInsightsStore.getState().status).toEqual(newStatus);
    });

    it('should update session-specific status when context is active', () => {
      useInsightsStore.setState({
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      const newStatus: InsightsChatStatus = { phase: 'streaming', message: 'test' };
      useInsightsStore.getState().setStatus(newStatus);

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.status).toEqual(newStatus);
    });
  });

  describe('appendStreamingContent with session isolation', () => {
    it('should update global streamingContent', () => {
      useInsightsStore.getState().appendStreamingContent('test content');

      expect(useInsightsStore.getState().streamingContent).toBe('test content');
    });

    it('should accumulate content', () => {
      useInsightsStore.getState().appendStreamingContent('first ');
      useInsightsStore.getState().appendStreamingContent('second');

      expect(useInsightsStore.getState().streamingContent).toBe('first second');
    });

    it('should update session-specific streamingContent when context is active', () => {
      useInsightsStore.setState({
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      useInsightsStore.getState().appendStreamingContent('session content');

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.streamingContent).toBe('session content');
    });

    it('should isolate content between different sessions', () => {
      // Set up two sessions
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState({ streamingContent: 'session 1 content' }));
      sessionStates.set('project-1:session-2', createTestSessionState({ streamingContent: 'session 2 content' }));
      useInsightsStore.setState({
        sessionStates,
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      // Append content to session-1
      useInsightsStore.getState().appendStreamingContent(' more');

      const state = useInsightsStore.getState();
      expect(state.sessionStates.get('project-1:session-1')?.streamingContent).toBe('session 1 content more');
      expect(state.sessionStates.get('project-1:session-2')?.streamingContent).toBe('session 2 content');
    });
  });

  describe('clearStreamingContent with session isolation', () => {
    it('should clear global streamingContent', () => {
      useInsightsStore.setState({ streamingContent: 'some content' });

      useInsightsStore.getState().clearStreamingContent();

      expect(useInsightsStore.getState().streamingContent).toBe('');
    });

    it('should clear session-specific streamingContent when context is active', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState({ streamingContent: 'to clear' }));
      useInsightsStore.setState({
        sessionStates,
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        streamingContent: 'global content'
      });

      useInsightsStore.getState().clearStreamingContent();

      const state = useInsightsStore.getState();
      expect(state.streamingContent).toBe('');
      expect(state.sessionStates.get('project-1:session-1')?.streamingContent).toBe('');
    });
  });

  describe('setCurrentTool with session isolation', () => {
    it('should update global currentTool', () => {
      const tool = { name: 'TestTool', input: 'test input' };

      useInsightsStore.getState().setCurrentTool(tool);

      expect(useInsightsStore.getState().currentTool).toEqual(tool);
    });

    it('should update session-specific currentTool when context is active', () => {
      useInsightsStore.setState({
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      const tool = { name: 'SessionTool', input: 'session input' };
      useInsightsStore.getState().setCurrentTool(tool);

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.currentTool).toEqual(tool);
    });

    it('should clear currentTool when set to null', () => {
      useInsightsStore.setState({
        currentTool: { name: 'Tool', input: '' },
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      useInsightsStore.getState().setCurrentTool(null);

      const state = useInsightsStore.getState();
      expect(state.currentTool).toBeNull();
      expect(state.sessionStates.get('project-1:session-1')?.currentTool).toBeNull();
    });
  });

  describe('addToolUsage with session isolation', () => {
    it('should add tool to global toolsUsed', () => {
      const tool = { name: 'TestTool', input: 'test' };

      useInsightsStore.getState().addToolUsage(tool);

      const state = useInsightsStore.getState();
      expect(state.toolsUsed).toHaveLength(1);
      expect(state.toolsUsed[0].name).toBe('TestTool');
    });

    it('should add tool to session-specific toolsUsed when context is active', () => {
      useInsightsStore.setState({
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      const tool = { name: 'SessionTool', input: 'session' };
      useInsightsStore.getState().addToolUsage(tool);

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.toolsUsed).toHaveLength(1);
      expect(sessionState?.toolsUsed[0].name).toBe('SessionTool');
    });

    it('should accumulate tools used', () => {
      useInsightsStore.setState({
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      useInsightsStore.getState().addToolUsage({ name: 'Tool1' });
      useInsightsStore.getState().addToolUsage({ name: 'Tool2' });

      const state = useInsightsStore.getState();
      expect(state.toolsUsed).toHaveLength(2);
      expect(state.sessionStates.get('project-1:session-1')?.toolsUsed).toHaveLength(2);
    });
  });

  describe('clearToolsUsed with session isolation', () => {
    it('should clear global toolsUsed', () => {
      useInsightsStore.setState({
        toolsUsed: [{ name: 'Tool', timestamp: new Date() }]
      });

      useInsightsStore.getState().clearToolsUsed();

      expect(useInsightsStore.getState().toolsUsed).toHaveLength(0);
    });

    it('should clear session-specific toolsUsed when context is active', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState({
        toolsUsed: [{ name: 'SessionTool', timestamp: new Date() }]
      }));
      useInsightsStore.setState({
        sessionStates,
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        toolsUsed: [{ name: 'GlobalTool', timestamp: new Date() }]
      });

      useInsightsStore.getState().clearToolsUsed();

      const state = useInsightsStore.getState();
      expect(state.toolsUsed).toHaveLength(0);
      expect(state.sessionStates.get('project-1:session-1')?.toolsUsed).toHaveLength(0);
    });
  });

  // ============================================
  // setSession with Context Updates
  // ============================================

  describe('setSession', () => {
    it('should set session and update active context', () => {
      const session = createTestSession({ id: 'session-1', projectId: 'project-1' });

      useInsightsStore.getState().setSession(session);

      const state = useInsightsStore.getState();
      expect(state.session).toBeDefined();
      expect(state.session?.id).toBe('session-1');
      expect(state.activeProjectId).toBe('project-1');
      expect(state.activeSessionId).toBe('session-1');
    });

    it('should initialize session state on first set', () => {
      const session = createTestSession({ id: 'session-1', projectId: 'project-1' });

      useInsightsStore.getState().setSession(session);

      const state = useInsightsStore.getState();
      const key = getSessionKey('project-1', 'session-1');
      expect(state.sessionStates.has(key)).toBe(true);
    });

    it('should preserve existing session state when setting same session', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState({
        streamingContent: 'preserved content'
      }));
      useInsightsStore.setState({ sessionStates });

      const session = createTestSession({ id: 'session-1', projectId: 'project-1' });
      useInsightsStore.getState().setSession(session);

      const state = useInsightsStore.getState();
      expect(state.sessionStates.get('project-1:session-1')?.streamingContent).toBe('preserved content');
    });

    it('should clear session when set to null', () => {
      useInsightsStore.setState({
        session: createTestSession(),
        activeProjectId: 'project-1',
        activeSessionId: 'session-1'
      });

      useInsightsStore.getState().setSession(null);

      expect(useInsightsStore.getState().session).toBeNull();
    });
  });

  // ============================================
  // clearSession Tests
  // ============================================

  describe('clearSession', () => {
    it('should clear session and reset state', () => {
      useInsightsStore.setState({
        session: createTestSession(),
        status: { phase: 'streaming', message: 'test' },
        pendingMessage: 'pending',
        streamingContent: 'content',
        currentTool: { name: 'Tool' },
        toolsUsed: [{ name: 'Tool', timestamp: new Date() }]
      });

      useInsightsStore.getState().clearSession();

      const state = useInsightsStore.getState();
      expect(state.session).toBeNull();
      expect(state.status).toEqual({ phase: 'idle', message: '' });
      expect(state.pendingMessage).toBe('');
      expect(state.streamingContent).toBe('');
      expect(state.currentTool).toBeNull();
      expect(state.toolsUsed).toHaveLength(0);
    });

    it('should reset session-specific state when context is active', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState({
        streamingContent: 'session content',
        status: { phase: 'streaming', message: 'test' }
      }));
      useInsightsStore.setState({
        sessionStates,
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        session: createTestSession()
      });

      useInsightsStore.getState().clearSession();

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.streamingContent).toBe('');
      expect(sessionState?.status).toEqual({ phase: 'idle', message: '' });
    });
  });

  // ============================================
  // Basic Store Operations
  // ============================================

  describe('setSessions', () => {
    it('should set sessions array', () => {
      const sessions = [
        createTestSessionSummary({ id: 'session-1' }),
        createTestSessionSummary({ id: 'session-2' })
      ];

      useInsightsStore.getState().setSessions(sessions);

      expect(useInsightsStore.getState().sessions).toHaveLength(2);
    });

    it('should replace existing sessions', () => {
      useInsightsStore.setState({
        sessions: [createTestSessionSummary({ id: 'old' })]
      });

      const newSessions = [createTestSessionSummary({ id: 'new' })];
      useInsightsStore.getState().setSessions(newSessions);

      const state = useInsightsStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('new');
    });
  });

  describe('setPendingMessage', () => {
    it('should set pending message', () => {
      useInsightsStore.getState().setPendingMessage('test message');

      expect(useInsightsStore.getState().pendingMessage).toBe('test message');
    });

    it('should clear pending message with empty string', () => {
      useInsightsStore.setState({ pendingMessage: 'existing' });

      useInsightsStore.getState().setPendingMessage('');

      expect(useInsightsStore.getState().pendingMessage).toBe('');
    });
  });

  describe('setLoadingSessions', () => {
    it('should set loading state to true', () => {
      useInsightsStore.getState().setLoadingSessions(true);

      expect(useInsightsStore.getState().isLoadingSessions).toBe(true);
    });

    it('should set loading state to false', () => {
      useInsightsStore.setState({ isLoadingSessions: true });

      useInsightsStore.getState().setLoadingSessions(false);

      expect(useInsightsStore.getState().isLoadingSessions).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should add message to existing session', () => {
      useInsightsStore.setState({
        session: createTestSession({ messages: [] })
      });

      const message = createTestMessage({ content: 'new message' });
      useInsightsStore.getState().addMessage(message);

      const state = useInsightsStore.getState();
      expect(state.session?.messages).toHaveLength(1);
      expect(state.session?.messages[0].content).toBe('new message');
    });

    it('should create new session if none exists', () => {
      const message = createTestMessage({ content: 'first message' });
      useInsightsStore.getState().addMessage(message);

      const state = useInsightsStore.getState();
      expect(state.session).toBeDefined();
      expect(state.session?.messages).toHaveLength(1);
    });

    it('should update session updatedAt timestamp', () => {
      const oldDate = new Date('2024-01-01');
      useInsightsStore.setState({
        session: createTestSession({ updatedAt: oldDate })
      });

      useInsightsStore.getState().addMessage(createTestMessage());

      const state = useInsightsStore.getState();
      expect(state.session?.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('finalizeStreamingMessage', () => {
    it('should create assistant message from streaming content', () => {
      // Set up session state in the Map (used by session-specific state reading)
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set(getSessionKey('project-1', 'session-1'), createTestSessionState({
        streamingContent: 'streamed response'
      }));

      useInsightsStore.setState({
        session: createTestSession({ messages: [] }),
        streamingContent: 'streamed response',
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        sessionStates
      });

      useInsightsStore.getState().finalizeStreamingMessage();

      const state = useInsightsStore.getState();
      expect(state.session?.messages).toHaveLength(1);
      expect(state.session?.messages[0].role).toBe('assistant');
      expect(state.session?.messages[0].content).toBe('streamed response');
    });

    it('should clear streaming content after finalizing', () => {
      // Set up session state in the Map
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set(getSessionKey('project-1', 'session-1'), createTestSessionState({
        streamingContent: 'content to clear'
      }));

      useInsightsStore.setState({
        session: createTestSession(),
        streamingContent: 'content to clear',
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        sessionStates
      });

      useInsightsStore.getState().finalizeStreamingMessage();

      expect(useInsightsStore.getState().streamingContent).toBe('');
    });

    it('should include tools used in finalized message', () => {
      const tools: InsightsToolUsage[] = [
        { name: 'Tool1', timestamp: new Date() },
        { name: 'Tool2', timestamp: new Date() }
      ];

      // Set up session state in the Map with tools
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set(getSessionKey('project-1', 'session-1'), createTestSessionState({
        streamingContent: 'response with tools',
        toolsUsed: tools
      }));

      useInsightsStore.setState({
        session: createTestSession({ messages: [] }),
        streamingContent: 'response with tools',
        toolsUsed: tools,
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        sessionStates
      });

      useInsightsStore.getState().finalizeStreamingMessage();

      const state = useInsightsStore.getState();
      expect(state.session?.messages[0].toolsUsed).toHaveLength(2);
    });

    it('should include suggested task in finalized message', () => {
      // Set up session state in the Map
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set(getSessionKey('project-1', 'session-1'), createTestSessionState({
        streamingContent: 'task suggestion'
      }));

      useInsightsStore.setState({
        session: createTestSession({ messages: [] }),
        streamingContent: 'task suggestion',
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        sessionStates
      });

      const suggestedTask = { title: 'New Task', description: 'Task description' };
      useInsightsStore.getState().finalizeStreamingMessage(suggestedTask);

      const state = useInsightsStore.getState();
      expect(state.session?.messages[0].suggestedTask).toEqual(suggestedTask);
    });

    it('should clear session-specific state when finalizing', () => {
      const sessionStates = new Map<string, SessionState>();
      sessionStates.set('project-1:session-1', createTestSessionState({
        streamingContent: 'session content',
        toolsUsed: [{ name: 'Tool', timestamp: new Date() }],
        currentTool: { name: 'ActiveTool' }
      }));
      useInsightsStore.setState({
        session: createTestSession(),
        sessionStates,
        activeProjectId: 'project-1',
        activeSessionId: 'session-1',
        streamingContent: 'global content',
        toolsUsed: [{ name: 'GlobalTool', timestamp: new Date() }]
      });

      useInsightsStore.getState().finalizeStreamingMessage();

      const state = useInsightsStore.getState();
      const sessionState = state.sessionStates.get('project-1:session-1');
      expect(sessionState?.streamingContent).toBe('');
      expect(sessionState?.toolsUsed).toHaveLength(0);
      expect(sessionState?.currentTool).toBeNull();
    });
  });
});
