import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { TerminalSession, TerminalWorktreeConfig } from '../../shared/types';
import { terminalBufferManager } from '../lib/terminal-buffer-manager';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

export type TerminalStatus = 'idle' | 'running' | 'claude-active' | 'exited';

export interface Terminal {
  id: string;
  title: string;
  status: TerminalStatus;
  cwd: string;
  createdAt: Date;
  isClaudeMode: boolean;
  claudeSessionId?: string;  // Claude Code session ID for resume
  // outputBuffer removed - now managed by terminalBufferManager singleton
  isRestored?: boolean;  // Whether this terminal was restored from a saved session
  associatedTaskId?: string;  // ID of task associated with this terminal (for context loading)
  projectPath?: string;  // Project this terminal belongs to (for multi-project support)
  worktreeConfig?: TerminalWorktreeConfig;  // Associated worktree for isolated development
  isClaudeBusy?: boolean;  // Whether Claude Code is actively processing (for visual indicator)
  pendingClaudeResume?: boolean;  // Whether this terminal has a pending Claude resume (deferred until tab activated)
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
  addTerminal: (cwd?: string, projectPath?: string) => Terminal | null;
  addRestoredTerminal: (session: TerminalSession) => Terminal;
  // Add a terminal with a specific ID (for terminals created in main process, like OAuth login terminals)
  addExternalTerminal: (id: string, title: string, cwd?: string, projectPath?: string) => Terminal | null;
  removeTerminal: (id: string) => void;
  updateTerminal: (id: string, updates: Partial<Terminal>) => void;
  setActiveTerminal: (id: string | null) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  setClaudeMode: (id: string, isClaudeMode: boolean) => void;
  setClaudeSessionId: (id: string, sessionId: string) => void;
  setAssociatedTask: (id: string, taskId: string | undefined) => void;
  setWorktreeConfig: (id: string, config: TerminalWorktreeConfig | undefined) => void;
  setClaudeBusy: (id: string, isBusy: boolean) => void;
  setPendingClaudeResume: (id: string, pending: boolean) => void;
  clearAllTerminals: () => void;
  setHasRestoredSessions: (value: boolean) => void;
  reorderTerminals: (activeId: string, overId: string) => void;

  // Selectors
  getTerminal: (id: string) => Terminal | undefined;
  getActiveTerminal: () => Terminal | undefined;
  canAddTerminal: (projectPath?: string) => boolean;
  getTerminalsForProject: (projectPath: string) => Terminal[];
  getWorktreeCount: () => number;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  layouts: [],
  activeTerminalId: null,
  maxTerminals: 12,
  hasRestoredSessions: false,

  addTerminal: (cwd?: string, projectPath?: string) => {
    const state = get();
    if (state.terminals.length >= state.maxTerminals) {
      return null;
    }

    const newTerminal: Terminal = {
      id: uuid(),
      title: `Terminal ${state.terminals.length + 1}`,
      status: 'idle',
      cwd: cwd || process.env.HOME || '~',
      createdAt: new Date(),
      isClaudeMode: false,
      // outputBuffer removed - managed by terminalBufferManager
      projectPath,
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
      title: session.title,
      status: 'idle',  // Will be updated to 'running' when PTY is created
      cwd: session.cwd,
      createdAt: new Date(session.createdAt),
      // Reset Claude mode to false - Claude Code is killed on app restart
      // Keep claudeSessionId so users can resume by clicking the invoke button
      isClaudeMode: false,
      claudeSessionId: session.claudeSessionId,
      // outputBuffer now stored in terminalBufferManager
      isRestored: true,
      projectPath: session.projectPath,
      // Worktree config is validated in main process before restore
      worktreeConfig: session.worktreeConfig,
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

  addExternalTerminal: (id: string, title: string, cwd?: string, projectPath?: string) => {
    const state = get();

    // Check if terminal with this ID already exists
    const existingTerminal = state.terminals.find(t => t.id === id);
    if (existingTerminal) {
      // Just activate it and return it
      set({ activeTerminalId: id });
      return existingTerminal;
    }

    // Use the same logic as canAddTerminal - count only non-exited terminals
    // This ensures consistency and doesn't block new terminals when only exited ones exist
    const activeTerminalCount = state.terminals.filter(t => t.status !== 'exited').length;
    if (activeTerminalCount >= state.maxTerminals) {
      return null;
    }

    const newTerminal: Terminal = {
      id,
      title,
      status: 'running',  // External terminals are already running
      cwd: cwd || process.env.HOME || '~',
      createdAt: new Date(),
      isClaudeMode: false,
      projectPath,
    };

    set((state) => ({
      terminals: [...state.terminals, newTerminal],
      activeTerminalId: newTerminal.id,
    }));

    return newTerminal;
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
          ? {
              ...t,
              isClaudeMode,
              status: isClaudeMode ? 'claude-active' : 'running',
              // Reset busy state when leaving Claude mode
              isClaudeBusy: isClaudeMode ? t.isClaudeBusy : undefined
            }
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

  setWorktreeConfig: (id: string, config: TerminalWorktreeConfig | undefined) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, worktreeConfig: config } : t
      ),
    }));
  },

  setClaudeBusy: (id: string, isBusy: boolean) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, isClaudeBusy: isBusy } : t
      ),
    }));
  },

  setPendingClaudeResume: (id: string, pending: boolean) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, pendingClaudeResume: pending } : t
      ),
    }));
  },

  clearAllTerminals: () => {
    set({ terminals: [], activeTerminalId: null, hasRestoredSessions: false });
  },

  setHasRestoredSessions: (value: boolean) => {
    set({ hasRestoredSessions: value });
  },

  reorderTerminals: (activeId: string, overId: string) => {
    set((state) => {
      const oldIndex = state.terminals.findIndex((t) => t.id === activeId);
      const newIndex = state.terminals.findIndex((t) => t.id === overId);

      if (oldIndex === -1 || newIndex === -1) {
        return state;
      }

      return {
        terminals: arrayMove(state.terminals, oldIndex, newIndex),
      };
    });
  },

  getTerminal: (id: string) => {
    return get().terminals.find((t) => t.id === id);
  },

  getActiveTerminal: () => {
    const state = get();
    return state.terminals.find((t) => t.id === state.activeTerminalId);
  },

  canAddTerminal: (projectPath?: string) => {
    const state = get();
    // Count only non-exited terminals, optionally filtered by project
    const activeTerminals = state.terminals.filter(t => {
      // Exclude exited terminals from the count
      if (t.status === 'exited') return false;
      // If projectPath specified, only count terminals for that project (or legacy without projectPath)
      if (projectPath) {
        return t.projectPath === projectPath || !t.projectPath;
      }
      return true;
    });
    return activeTerminals.length < state.maxTerminals;
  },

  getTerminalsForProject: (projectPath: string) => {
    return get().terminals.filter(t => t.projectPath === projectPath);
  },

  getWorktreeCount: () => {
    return get().terminals.filter(t => t.worktreeConfig).length;
  },
}));

// Track in-progress restore operations to prevent race conditions
const restoringProjects = new Set<string>();

/**
 * Restore terminal sessions for a project from persisted storage
 */
export async function restoreTerminalSessions(projectPath: string): Promise<void> {
  // Validate input
  if (!projectPath || typeof projectPath !== 'string') {
    debugLog('[TerminalStore] Invalid projectPath, skipping restore');
    return;
  }

  // Prevent concurrent restores for same project (race condition protection)
  if (restoringProjects.has(projectPath)) {
    debugLog('[TerminalStore] Already restoring terminals for this project, skipping');
    return;
  }
  restoringProjects.add(projectPath);

  try {
    const store = useTerminalStore.getState();

    // Get terminals for this project that exist in state
    const projectTerminals = store.terminals.filter(t => t.projectPath === projectPath);

    if (projectTerminals.length > 0) {
      // Check if PTY processes are alive for existing terminals
      const aliveChecks = await Promise.all(
        projectTerminals.map(async (terminal) => {
          try {
            const result = await window.electronAPI.checkTerminalPtyAlive(terminal.id);
            return { terminal, alive: result.success && result.data?.alive === true };
          } catch {
            return { terminal, alive: false };
          }
        })
      );

      // Remove dead terminals from store (they have state but no PTY process)
      const deadTerminals = aliveChecks.filter(c => !c.alive);

      for (const { terminal } of deadTerminals) {
        debugLog(`[TerminalStore] Removing dead terminal: ${terminal.id}`);
        store.removeTerminal(terminal.id);
      }

      // If all terminals were alive, we're done
      if (deadTerminals.length === 0) {
        debugLog('[TerminalStore] All terminals have live PTY processes');
        return;
      }

      // Note: We don't skip disk restore when alive terminals exist because:
      // 1. Dead terminals were removed from state above
      // 2. addRestoredTerminal() has duplicate protection (checks terminal ID)
      // 3. Disk restore will safely only add back the dead terminals
      debugLog(`[TerminalStore] ${deadTerminals.length} terminals had dead PTY, will restore from disk`);
    }

    // Restore from disk
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
  } finally {
    restoringProjects.delete(projectPath);
  }
}
