import { create } from 'zustand';
import type {
  CSharpLspStatus,
  CSharpLspDiagnostic,
  CSharpLspPublishDiagnosticsParams
} from '../../shared/types';

// LSP Diagnostic Severity levels (from LSP spec)
const SEVERITY_ERROR = 1;
const SEVERITY_WARNING = 2;

interface FileDiagnostics {
  relPath: string;
  diagnostics: CSharpLspDiagnostic[];
  updatedAt: number;
}

interface CSharpLspState {
  status: CSharpLspStatus;
  statusMessage?: string;
  workspaceRoot: string | null;
  diagnostics: Map<string, FileDiagnostics>; // relPath -> diagnostics
  isStarting: boolean;
  // Cached counts for performance
  _errorCount: number;
  _warningCount: number;

  // Actions
  setStatus: (status: CSharpLspStatus, message?: string) => void;
  setWorkspaceRoot: (workspaceRoot: string | null) => void;
  updateDiagnostics: (params: CSharpLspPublishDiagnosticsParams) => void;
  clearDiagnostics: (relPath?: string) => void;
  start: (workspaceRoot: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
  initialize: () => void;

  // Selectors
  getDiagnostics: (relPath: string) => CSharpLspDiagnostic[];
  getAllDiagnostics: () => FileDiagnostics[];
  getErrorCount: () => number;
  getWarningCount: () => number;
  isReady: () => boolean;
}

export const useCSharpLspStore = create<CSharpLspState>((set, get) => ({
  status: 'stopped',
  statusMessage: undefined,
  workspaceRoot: null,
  diagnostics: new Map(),
  isStarting: false,
  _errorCount: 0,
  _warningCount: 0,

  setStatus: (status: CSharpLspStatus, message?: string) => {
    set({ status, statusMessage: message });
  },

  setWorkspaceRoot: (workspaceRoot: string | null) => {
    set({ workspaceRoot });
  },

  updateDiagnostics: (params: CSharpLspPublishDiagnosticsParams) => {
    set((state) => {
      const newDiagnostics = new Map(state.diagnostics);
      newDiagnostics.set(params.relPath, {
        relPath: params.relPath,
        diagnostics: params.diagnostics,
        updatedAt: Date.now()
      });

      // Recompute cached counts for performance
      let errorCount = 0;
      let warningCount = 0;
      newDiagnostics.forEach((fileDiag) => {
        fileDiag.diagnostics.forEach((d) => {
          if (d.severity === SEVERITY_ERROR) errorCount++;
          else if (d.severity === SEVERITY_WARNING) warningCount++;
        });
      });

      return {
        diagnostics: newDiagnostics,
        _errorCount: errorCount,
        _warningCount: warningCount
      };
    });
  },

  clearDiagnostics: (relPath?: string) => {
    set((state) => {
      if (relPath) {
        const newDiagnostics = new Map(state.diagnostics);
        newDiagnostics.delete(relPath);

        // Recompute cached counts
        let errorCount = 0;
        let warningCount = 0;
        newDiagnostics.forEach((fileDiag) => {
          fileDiag.diagnostics.forEach((d) => {
            if (d.severity === SEVERITY_ERROR) errorCount++;
            else if (d.severity === SEVERITY_WARNING) warningCount++;
          });
        });

        return {
          diagnostics: newDiagnostics,
          _errorCount: errorCount,
          _warningCount: warningCount
        };
      }
      return {
        diagnostics: new Map(),
        _errorCount: 0,
        _warningCount: 0
      };
    });
  },

  start: async (workspaceRoot: string): Promise<boolean> => {
    set({ isStarting: true, status: 'starting' });

    try {
      const result = await window.electronAPI.csharpLspStart(workspaceRoot);

      if (result.success) {
        set({
          status: 'ready',
          workspaceRoot,
          isStarting: false,
          statusMessage: undefined
        });
        return true;
      } else {
        set({
          status: 'error',
          statusMessage: result.error,
          isStarting: false
        });
        return false;
      }
    } catch (error) {
      set({
        status: 'error',
        statusMessage: error instanceof Error ? error.message : 'Failed to start LSP server',
        isStarting: false
      });
      return false;
    }
  },

  stop: async (): Promise<boolean> => {
    try {
      const result = await window.electronAPI.csharpLspStop();

      if (result.success) {
        set({
          status: 'stopped',
          workspaceRoot: null,
          diagnostics: new Map(),
          statusMessage: undefined,
          _errorCount: 0,
          _warningCount: 0
        });
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  },

  initialize: () => {
    // Set up event listeners for diagnostics
    const unsubDiagnostics = window.electronAPI.onCSharpLspPublishDiagnostics((params) => {
      get().updateDiagnostics(params);
    });

    const unsubLog = window.electronAPI.onCSharpLspLog((message) => {
      if (message.level === 'error') {
        console.error('[C# LSP]', message.message);
      } else if (message.level === 'warn') {
        console.warn('[C# LSP]', message.message);
      } else {
        console.log('[C# LSP]', message.message);
      }
    });

    const unsubProgress = window.electronAPI.onCSharpLspProgress((message) => {
      set({ statusMessage: message.message });
    });

    // Store cleanup functions (you might want to call these on unmount)
    return () => {
      unsubDiagnostics();
      unsubLog();
      unsubProgress();
    };
  },

  // Selectors
  getDiagnostics: (relPath: string): CSharpLspDiagnostic[] => {
    const fileDiagnostics = get().diagnostics.get(relPath);
    return fileDiagnostics?.diagnostics || [];
  },

  getAllDiagnostics: (): FileDiagnostics[] => {
    return Array.from(get().diagnostics.values());
  },

  getErrorCount: (): number => {
    return get()._errorCount;
  },

  getWarningCount: (): number => {
    return get()._warningCount;
  },

  isReady: (): boolean => {
    return get().status === 'ready';
  }
}));
