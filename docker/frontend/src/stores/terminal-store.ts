import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { TerminalSession } from '../../shared/types';
import { terminalBufferManager } from '../lib/terminal-buffer-manager';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

export type TerminalStatus = 'idle' | 'running' | 'claude-active' | 'exited';

export interface Terminal {
  id: string;
  projectId?: string;  // Project UUID this terminal belongs to (for filtering)
  title: string;
  status: TerminalStatus;
  cwd: string;
  createdAt: Date;
  isClaudeMode: boolean;
  claudeSessionId?: string;  // Claude Code session ID for resume
  // outputBuffer removed - now managed by terminalBufferManager singleton
  isRestored?: boolean;  // Whether this terminal was restored from a saved session
  associatedTaskId?: string;  // ID of task associated with this terminal (for context loading)
}

interface TerminalLayout {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

interface TerminalState {
  terminals: Terminal[];
  layouts: TerminalLayout[];
  activeTerminalId: string | null;
  maxTerminals: number;
  hasRestoredSessions: boolean;  // Track if we've restored sessions for this project

  // Actions
  addTerminal: (cwd?: string, projectId?: string) => Terminal | null;
  addRestoredTerminal: (session: TerminalSession) => Terminal;
  removeTerminal: (id: string) => void;
  updateTerminal: (id: string, updates: Partial<Terminal>) => void;
  setActiveTerminal: (id: string | null) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  setClaudeMode: (id: string, isClaudeMode: boolean) => void;
  setClaudeSessionId: (id: string, sessionId: string) => void;
  setAssociatedTask: (id: string, taskId: string | undefined) => void;
  appendOutput: (id: string, data: string) => void;
  clearOutputBuffer: (id: string) => void;
  clearAllTerminals: () => void;
  setHasRestoredSessions: (value: boolean) => void;

  // Selectors
  getTerminal: (id: string) => Terminal | undefined;
  getActiveTerminal: () => Terminal | undefined;
  canAddTerminal: () => boolean;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  layouts: [],
  activeTerminalId: null,
  maxTerminals: 12,
  hasRestoredSessions: false,

  addTerminal: (cwd?: string, projectId?: string) => {
    const state = get();
    if (state.terminals.length >= state.maxTerminals) {
      return null;
    }

    const newTerminal: Terminal = {
      id: uuid(),
      projectId,  // Store project ID for filtering
      title: `Terminal ${state.terminals.length + 1}`,
      status: 'idle',
      cwd: cwd || process.env.HOME || '~',
      createdAt: new Date(),
      isClaudeMode: false,
      // outputBuffer removed - managed by terminalBufferManager
    };

    set((state) => ({
      terminals: [...state.terminals, newTerminal],
      activeTerminalId: newTerminal.id,
    }));

    return newTerminal;
  },

  addRestoredTerminal: (session: TerminalSession) => {
    const state = get();

    // Check if terminal already exists
    const existingTerminal = state.terminals.find(t => t.id === session.id);
    if (existingTerminal) {
      return existingTerminal;
    }

    const restoredTerminal: Terminal = {
      id: session.id,
      projectId: session.projectId,  // Include projectId for filtering
      title: session.title,
      status: 'idle',  // Will be updated to 'running' when PTY is created
      cwd: session.cwd,
      createdAt: new Date(session.createdAt),
      isClaudeMode: session.isClaudeMode,
      claudeSessionId: session.claudeSessionId,
      // outputBuffer now stored in terminalBufferManager
      isRestored: true,
    };

    // Restore buffer to buffer manager
    if (session.outputBuffer) {
      terminalBufferManager.set(session.id, session.outputBuffer);
    }

    set((state) => ({
      terminals: [...state.terminals, restoredTerminal],
      activeTerminalId: state.activeTerminalId || restoredTerminal.id,
    }));

    return restoredTerminal;
  },

  removeTerminal: (id: string) => {
    // Clean up buffer manager
    terminalBufferManager.dispose(id);

    set((state) => {
      const newTerminals = state.terminals.filter((t) => t.id !== id);
      const newActiveId = state.activeTerminalId === id
        ? (newTerminals.length > 0 ? newTerminals[newTerminals.length - 1].id : null)
        : state.activeTerminalId;

      return {
        terminals: newTerminals,
        activeTerminalId: newActiveId,
      };
    });
  },

  updateTerminal: (id: string, updates: Partial<Terminal>) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },

  setActiveTerminal: (id: string | null) => {
    set({ activeTerminalId: id });
  },

  setTerminalStatus: (id: string, status: TerminalStatus) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, status } : t
      ),
    }));
  },

  setClaudeMode: (id: string, isClaudeMode: boolean) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id
          ? { ...t, isClaudeMode, status: isClaudeMode ? 'claude-active' : 'running' }
          : t
      ),
    }));
  },

  setClaudeSessionId: (id: string, sessionId: string) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, claudeSessionId: sessionId } : t
      ),
    }));
  },

  setAssociatedTask: (id: string, taskId: string | undefined) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, associatedTaskId: taskId } : t
      ),
    }));
  },

  // DEPRECATED: Use terminalBufferManager.append() directly
  // Kept for backward compatibility, but does NOT trigger React re-renders
  appendOutput: (id: string, data: string) => {
    terminalBufferManager.append(id, data);
    // No React state update - this is the key performance improvement!
  },

  // DEPRECATED: Use terminalBufferManager.clear() directly
  clearOutputBuffer: (id: string) => {
    terminalBufferManager.clear(id);
  },

  clearAllTerminals: () => {
    set({ terminals: [], activeTerminalId: null, hasRestoredSessions: false });
  },

  setHasRestoredSessions: (value: boolean) => {
    set({ hasRestoredSessions: value });
  },

  getTerminal: (id: string) => {
    return get().terminals.find((t) => t.id === id);
  },

  getActiveTerminal: () => {
    const state = get();
    return state.terminals.find((t) => t.id === state.activeTerminalId);
  },

  canAddTerminal: () => {
    const state = get();
    return state.terminals.length < state.maxTerminals;
  },
}));

/**
 * Restore terminal sessions for a project from persisted storage
 */
export async function restoreTerminalSessions(projectPath: string): Promise<void> {
  const store = useTerminalStore.getState();

  // Don't restore if we already have terminals (user might have opened some manually)
  if (store.terminals.length > 0) {
    debugLog('[TerminalStore] Terminals already exist, skipping session restore');
    return;
  }

  try {
    const result = await window.electronAPI.getTerminalSessions(projectPath);
    if (!result.success || !result.data || result.data.length === 0) {
      return;
    }

    // Add terminals to the store (they'll be created in the TerminalGrid component)
    for (const session of result.data) {
      store.addRestoredTerminal(session);
    }

    store.setHasRestoredSessions(true);
  } catch (error) {
    debugError('[TerminalStore] Error restoring sessions:', error);
  }
}
