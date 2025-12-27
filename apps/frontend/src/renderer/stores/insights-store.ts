import { create } from 'zustand';
import type {
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsToolUsage,
  InsightsModelConfig,
  TaskMetadata,
  Task
} from '../../shared/types';

// ============================================
// Session State Types (for cross-session isolation)
// ============================================

interface ToolUsage {
  name: string;
  input?: string;
}

/**
 * Session-scoped state that must be isolated per conversation.
 * This prevents state leakage between different sessions and projects.
 */
export interface SessionState {
  streamingContent: string;
  currentTool: ToolUsage | null;
  status: InsightsChatStatus;
  toolsUsed: InsightsToolUsage[];
  lastUpdated: Date;
}

// ============================================
// Composite Key Utilities
// ============================================

/**
 * Maximum number of session states to keep per project.
 * Older sessions (by lastUpdated) will be cleaned up to prevent memory leaks.
 */
const MAX_SESSIONS_PER_PROJECT = 10;

/**
 * Creates a composite key for session-scoped state lookup.
 * Format: "${projectId}:${sessionId}"
 */
export function getSessionKey(projectId: string, sessionId: string): string {
  return `${projectId}:${sessionId}`;
}

/**
 * Parses a composite key back into projectId and sessionId.
 * Returns null if the key is invalid.
 */
export function parseSessionKey(key: string): { projectId: string; sessionId: string } | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) return null;
  return {
    projectId: key.substring(0, colonIndex),
    sessionId: key.substring(colonIndex + 1)
  };
}

/**
 * Default session state for new or non-existent sessions
 */
function getDefaultSessionState(): SessionState {
  return {
    streamingContent: '',
    currentTool: null,
    status: { phase: 'idle', message: '' },
    toolsUsed: [],
    lastUpdated: new Date()
  };
}

/**
 * Returns existing session state or creates a default one.
 * Does NOT mutate the map - caller is responsible for storing if needed.
 */
export function getOrCreateSessionState(
  key: string,
  sessionStates: Map<string, SessionState>
): SessionState {
  return sessionStates.get(key) || getDefaultSessionState();
}

// ============================================
// Main Store Interface
// ============================================

interface InsightsState {
  // Data
  session: InsightsSession | null;
  sessions: InsightsSessionSummary[]; // List of all sessions
  status: InsightsChatStatus;
  pendingMessage: string;
  streamingContent: string; // Accumulates streaming response
  currentTool: ToolUsage | null; // Currently executing tool
  toolsUsed: InsightsToolUsage[]; // Tools used during current response
  isLoadingSessions: boolean;

  // Session-scoped state (for cross-session isolation)
  activeProjectId: string | null;
  activeSessionId: string | null;
  sessionStates: Map<string, SessionState>;

  // Actions
  setSession: (session: InsightsSession | null) => void;
  setSessions: (sessions: InsightsSessionSummary[]) => void;
  setStatus: (status: InsightsChatStatus) => void;
  setPendingMessage: (message: string) => void;
  addMessage: (message: InsightsChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setCurrentTool: (tool: ToolUsage | null) => void;
  addToolUsage: (tool: ToolUsage) => void;
  clearToolsUsed: () => void;
  finalizeStreamingMessage: (suggestedTask?: InsightsChatMessage['suggestedTask']) => void;
  clearSession: () => void;
  setLoadingSessions: (loading: boolean) => void;

  // Session-scoped state actions
  setActiveContext: (projectId: string, sessionId: string) => void;
  getSessionState: (projectId: string, sessionId: string) => SessionState;

  // Session state cleanup actions
  removeSessionState: (projectId: string, sessionId: string) => void;
  cleanupOldSessions: (projectId: string) => void;
  cleanupProjectSessions: (projectId: string) => void;
}

const initialStatus: InsightsChatStatus = {
  phase: 'idle',
  message: ''
};

export const useInsightsStore = create<InsightsState>((set, get) => ({
  // Initial state
  session: null,
  sessions: [],
  status: initialStatus,
  pendingMessage: '',
  streamingContent: '',
  currentTool: null,
  toolsUsed: [],
  isLoadingSessions: false,

  // Session-scoped state (for cross-session isolation)
  activeProjectId: null,
  activeSessionId: null,
  sessionStates: new Map<string, SessionState>(),

  // Actions
  setSession: (session) => {
    if (session) {
      // Update active context when session changes
      const key = getSessionKey(session.projectId, session.id);
      const currentState = get();
      const existingSessionState = currentState.sessionStates.get(key);

      // Initialize session state if it doesn't exist
      if (!existingSessionState) {
        const newSessionStates = new Map(currentState.sessionStates);
        newSessionStates.set(key, getDefaultSessionState());
        set({
          session,
          activeProjectId: session.projectId,
          activeSessionId: session.id,
          sessionStates: newSessionStates
        });
      } else {
        set({
          session,
          activeProjectId: session.projectId,
          activeSessionId: session.id
        });
      }
    } else {
      set({ session });
    }
  },

  setSessions: (sessions) => set({ sessions }),

  setStatus: (status) => {
    const state = get();
    // Update global status for backwards compatibility
    set({ status });

    // Also update session-specific status if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        status,
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }
  },

  setLoadingSessions: (loading) => set({ isLoadingSessions: loading }),

  setPendingMessage: (message) => set({ pendingMessage: message }),

  addMessage: (message) =>
    set((state) => {
      if (!state.session) {
        // Create new session if none exists
        return {
          session: {
            id: `session-${Date.now()}`,
            projectId: '',
            messages: [message],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        };
      }

      return {
        session: {
          ...state.session,
          messages: [...state.session.messages, message],
          updatedAt: new Date()
        }
      };
    }),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      if (!state.session || state.session.messages.length === 0) return state;

      const messages = [...state.session.messages];
      const lastIndex = messages.length - 1;
      const lastMessage = messages[lastIndex];

      if (lastMessage.role === 'assistant') {
        messages[lastIndex] = { ...lastMessage, content };
      }

      return {
        session: {
          ...state.session,
          messages,
          updatedAt: new Date()
        }
      };
    }),

  appendStreamingContent: (content) => {
    const state = get();
    // Update global streamingContent for backwards compatibility
    set({ streamingContent: state.streamingContent + content });

    // Also update session-specific streamingContent if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        streamingContent: sessionState.streamingContent + content,
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }
  },

  clearStreamingContent: () => {
    const state = get();
    // Clear global streamingContent for backwards compatibility
    set({ streamingContent: '' });

    // Also clear session-specific streamingContent if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        streamingContent: '',
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }
  },

  setCurrentTool: (tool) => {
    const state = get();
    // Update global currentTool for backwards compatibility
    set({ currentTool: tool });

    // Also update session-specific currentTool if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        currentTool: tool,
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }
  },

  addToolUsage: (tool) => {
    const state = get();
    const newToolUsage: InsightsToolUsage = {
      name: tool.name,
      input: tool.input,
      timestamp: new Date()
    };

    // Update global toolsUsed for backwards compatibility
    set({ toolsUsed: [...state.toolsUsed, newToolUsage] });

    // Also update session-specific toolsUsed if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        toolsUsed: [...sessionState.toolsUsed, newToolUsage],
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }
  },

  clearToolsUsed: () => {
    const state = get();
    // Clear global toolsUsed for backwards compatibility
    set({ toolsUsed: [] });

    // Also clear session-specific toolsUsed if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        toolsUsed: [],
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }
  },

  finalizeStreamingMessage: (suggestedTask) => {
    const state = get();
    const content = state.streamingContent;
    const toolsUsedList = state.toolsUsed.length > 0 ? [...state.toolsUsed] : undefined;

    // Also clear session-specific state if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const sessionState = getOrCreateSessionState(key, state.sessionStates);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, {
        ...sessionState,
        streamingContent: '',
        toolsUsed: [],
        currentTool: null,
        lastUpdated: new Date()
      });
      set({ sessionStates: newSessionStates });
    }

    if (!content && !suggestedTask && !toolsUsedList) {
      set({ streamingContent: '', toolsUsed: [] });
      return;
    }

    const newMessage: InsightsChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: new Date(),
      suggestedTask,
      toolsUsed: toolsUsedList
    };

    if (!state.session) {
      set({
        streamingContent: '',
        toolsUsed: [],
        session: {
          id: `session-${Date.now()}`,
          projectId: '',
          messages: [newMessage],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      return;
    }

    set({
      streamingContent: '',
      toolsUsed: [],
      session: {
        ...state.session,
        messages: [...state.session.messages, newMessage],
        updatedAt: new Date()
      }
    });
  },

  clearSession: () => {
    const state = get();

    // Clear session-specific state if we have active context
    if (state.activeProjectId && state.activeSessionId) {
      const key = getSessionKey(state.activeProjectId, state.activeSessionId);
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, getDefaultSessionState());
      set({
        session: null,
        status: initialStatus,
        pendingMessage: '',
        streamingContent: '',
        currentTool: null,
        toolsUsed: [],
        sessionStates: newSessionStates
      });
    } else {
      set({
        session: null,
        status: initialStatus,
        pendingMessage: '',
        streamingContent: '',
        currentTool: null,
        toolsUsed: []
      });
    }
  },

  // Session-scoped state actions
  setActiveContext: (projectId, sessionId) => {
    const state = get();
    const key = getSessionKey(projectId, sessionId);

    // Initialize session state if it doesn't exist
    if (!state.sessionStates.has(key)) {
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.set(key, getDefaultSessionState());
      set({
        activeProjectId: projectId,
        activeSessionId: sessionId,
        sessionStates: newSessionStates
      });
    } else {
      set({
        activeProjectId: projectId,
        activeSessionId: sessionId
      });
    }
  },

  getSessionState: (projectId, sessionId) => {
    const key = getSessionKey(projectId, sessionId);
    return getOrCreateSessionState(key, get().sessionStates);
  },

  // Session state cleanup actions
  removeSessionState: (projectId, sessionId) => {
    const key = getSessionKey(projectId, sessionId);
    const state = get();
    if (state.sessionStates.has(key)) {
      const newSessionStates = new Map(state.sessionStates);
      newSessionStates.delete(key);
      set({ sessionStates: newSessionStates });
    }
  },

  cleanupOldSessions: (projectId) => {
    const state = get();

    // Collect all sessions for this project
    const projectSessions: Array<{ key: string; lastUpdated: Date }> = [];
    for (const [key, sessionState] of state.sessionStates.entries()) {
      const parsed = parseSessionKey(key);
      if (parsed && parsed.projectId === projectId) {
        projectSessions.push({ key, lastUpdated: sessionState.lastUpdated });
      }
    }

    // If under the limit, no cleanup needed
    if (projectSessions.length <= MAX_SESSIONS_PER_PROJECT) {
      return;
    }

    // Sort by lastUpdated descending (most recent first)
    projectSessions.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

    // Keep only the most recent MAX_SESSIONS_PER_PROJECT sessions
    const sessionsToRemove = projectSessions.slice(MAX_SESSIONS_PER_PROJECT);

    // Don't remove the active session even if it's old
    const activeKey = state.activeProjectId && state.activeSessionId
      ? getSessionKey(state.activeProjectId, state.activeSessionId)
      : null;

    const newSessionStates = new Map(state.sessionStates);
    for (const { key } of sessionsToRemove) {
      if (key !== activeKey) {
        newSessionStates.delete(key);
      }
    }

    if (newSessionStates.size !== state.sessionStates.size) {
      set({ sessionStates: newSessionStates });
    }
  },

  cleanupProjectSessions: (projectId) => {
    const state = get();
    const newSessionStates = new Map<string, SessionState>();

    // Keep only sessions from other projects
    for (const [key, sessionState] of state.sessionStates.entries()) {
      const parsed = parseSessionKey(key);
      if (!parsed || parsed.projectId !== projectId) {
        newSessionStates.set(key, sessionState);
      }
    }

    if (newSessionStates.size !== state.sessionStates.size) {
      set({ sessionStates: newSessionStates });
    }
  }
}));

// Helper functions

export async function loadInsightsSessions(projectId: string): Promise<void> {
  const store = useInsightsStore.getState();
  store.setLoadingSessions(true);

  try {
    const result = await window.electronAPI.listInsightsSessions(projectId);
    if (result.success && result.data) {
      store.setSessions(result.data);
    } else {
      store.setSessions([]);
    }
  } finally {
    store.setLoadingSessions(false);
  }
}

export async function loadInsightsSession(projectId: string): Promise<void> {
  const result = await window.electronAPI.getInsightsSession(projectId);
  if (result.success && result.data) {
    useInsightsStore.getState().setSession(result.data);
  } else {
    useInsightsStore.getState().setSession(null);
  }
  // Also load the sessions list
  await loadInsightsSessions(projectId);
}

export function sendMessage(projectId: string, message: string, modelConfig?: InsightsModelConfig): void {
  const store = useInsightsStore.getState();
  const session = store.session;

  // Add user message to session
  const userMessage: InsightsChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: message,
    timestamp: new Date()
  };
  store.addMessage(userMessage);

  // Clear pending and set status
  store.setPendingMessage('');
  store.clearStreamingContent();
  store.clearToolsUsed(); // Clear tools from previous response
  store.setStatus({
    phase: 'thinking',
    message: 'Processing your message...'
  });

  // Use provided modelConfig, or fall back to session's config
  const configToUse = modelConfig || session?.modelConfig;

  // Send to main process
  window.electronAPI.sendInsightsMessage(projectId, message, configToUse);
}

export async function clearSession(projectId: string): Promise<void> {
  const result = await window.electronAPI.clearInsightsSession(projectId);
  if (result.success) {
    useInsightsStore.getState().clearSession();
    // Reload sessions list and current session
    await loadInsightsSession(projectId);
  }
}

export async function newSession(projectId: string): Promise<void> {
  const result = await window.electronAPI.newInsightsSession(projectId);
  if (result.success && result.data) {
    const store = useInsightsStore.getState();
    store.setSession(result.data);
    // Cleanup old session states to prevent memory leaks
    store.cleanupOldSessions(projectId);
    // Reload sessions list
    await loadInsightsSessions(projectId);
  }
}

export async function switchSession(projectId: string, sessionId: string): Promise<void> {
  const result = await window.electronAPI.switchInsightsSession(projectId, sessionId);
  if (result.success && result.data) {
    const store = useInsightsStore.getState();
    // Set the session (which also updates activeProjectId/activeSessionId)
    store.setSession(result.data);

    // Sync global state with the new session's state
    // This ensures backwards compatibility while using session-scoped state
    const key = getSessionKey(projectId, sessionId);
    const sessionState = getOrCreateSessionState(key, store.sessionStates);

    // Update global state to match session state
    useInsightsStore.setState({
      streamingContent: sessionState.streamingContent,
      currentTool: sessionState.currentTool,
      toolsUsed: sessionState.toolsUsed,
      status: sessionState.status
    });

    // Cleanup old session states to prevent memory leaks
    store.cleanupOldSessions(projectId);
  }
}

export async function deleteSession(projectId: string, sessionId: string): Promise<boolean> {
  const result = await window.electronAPI.deleteInsightsSession(projectId, sessionId);
  if (result.success) {
    // Remove session state from the Map to prevent memory leaks
    useInsightsStore.getState().removeSessionState(projectId, sessionId);
    // Reload sessions list and current session
    await loadInsightsSession(projectId);
    return true;
  }
  return false;
}

export async function renameSession(projectId: string, sessionId: string, newTitle: string): Promise<boolean> {
  const result = await window.electronAPI.renameInsightsSession(projectId, sessionId, newTitle);
  if (result.success) {
    // Reload sessions list to reflect the change
    await loadInsightsSessions(projectId);
    return true;
  }
  return false;
}

export async function updateModelConfig(projectId: string, sessionId: string, modelConfig: InsightsModelConfig): Promise<boolean> {
  const result = await window.electronAPI.updateInsightsModelConfig(projectId, sessionId, modelConfig);
  if (result.success) {
    // Update local session state
    const store = useInsightsStore.getState();
    if (store.session?.id === sessionId) {
      store.setSession({
        ...store.session,
        modelConfig,
        updatedAt: new Date()
      });
    }
    // Reload sessions list to reflect the change
    await loadInsightsSessions(projectId);
    return true;
  }
  return false;
}

export async function createTaskFromSuggestion(
  projectId: string,
  title: string,
  description: string,
  metadata?: TaskMetadata
): Promise<Task | null> {
  const result = await window.electronAPI.createTaskFromInsights(
    projectId,
    title,
    description,
    metadata
  );

  if (result.success && result.data) {
    return result.data;
  }
  return null;
}

// IPC listener setup - call this once when the app initializes
export function setupInsightsListeners(): () => void {
  const store = useInsightsStore.getState;

  // Listen for streaming chunks
  const unsubStreamChunk = window.electronAPI.onInsightsStreamChunk(
    (projectId, chunk: InsightsStreamChunk) => {
      // CRITICAL: Filter events by projectId to prevent cross-project contamination
      const currentState = store();
      if (projectId !== currentState.activeProjectId) {
        // Event is for a different project - ignore it
        if (window.DEBUG) {
          console.debug(
            '[InsightsStore] Filtered stream chunk event - projectId mismatch:',
            { received: projectId, active: currentState.activeProjectId }
          );
        }
        return;
      }

      switch (chunk.type) {
        case 'text':
          if (chunk.content) {
            store().appendStreamingContent(chunk.content);
            store().setCurrentTool(null); // Clear tool when receiving text
            store().setStatus({
              phase: 'streaming',
              message: 'Receiving response...'
            });
          }
          break;
        case 'tool_start':
          if (chunk.tool) {
            store().setCurrentTool({
              name: chunk.tool.name,
              input: chunk.tool.input
            });
            // Record this tool usage for history
            store().addToolUsage({
              name: chunk.tool.name,
              input: chunk.tool.input
            });
            store().setStatus({
              phase: 'streaming',
              message: `Using ${chunk.tool.name}...`
            });
          }
          break;
        case 'tool_end':
          store().setCurrentTool(null);
          break;
        case 'task_suggestion':
          // Finalize the message with task suggestion
          store().setCurrentTool(null);
          store().finalizeStreamingMessage(chunk.suggestedTask);
          break;
        case 'done':
          // Finalize any remaining content
          store().setCurrentTool(null);
          store().finalizeStreamingMessage();
          store().setStatus({
            phase: 'complete',
            message: ''
          });
          break;
        case 'error':
          store().setCurrentTool(null);
          store().setStatus({
            phase: 'error',
            error: chunk.error
          });
          break;
      }
    }
  );

  // Listen for status updates
  const unsubStatus = window.electronAPI.onInsightsStatus((projectId, status) => {
    // CRITICAL: Filter events by projectId to prevent cross-project contamination
    const currentState = store();
    if (projectId !== currentState.activeProjectId) {
      // Event is for a different project - ignore it
      if (window.DEBUG) {
        console.debug(
          '[InsightsStore] Filtered status event - projectId mismatch:',
          { received: projectId, active: currentState.activeProjectId }
        );
      }
      return;
    }
    store().setStatus(status);
  });

  // Listen for errors
  const unsubError = window.electronAPI.onInsightsError((projectId, error) => {
    // CRITICAL: Filter events by projectId to prevent cross-project contamination
    const currentState = store();
    if (projectId !== currentState.activeProjectId) {
      // Event is for a different project - ignore it
      if (window.DEBUG) {
        console.debug(
          '[InsightsStore] Filtered error event - projectId mismatch:',
          { received: projectId, active: currentState.activeProjectId }
        );
      }
      return;
    }
    store().setStatus({
      phase: 'error',
      error
    });
  });

  // Return cleanup function
  return () => {
    unsubStreamChunk();
    unsubStatus();
    unsubError();
  };
}
