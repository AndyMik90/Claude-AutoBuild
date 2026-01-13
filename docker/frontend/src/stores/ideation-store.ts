import { create } from 'zustand';
import type {
  IdeationSession,
  Idea,
  IdeationStatus,
  IdeationGenerationStatus,
  IdeationType,
  IdeationConfig,
  IdeationSummary
} from '../../shared/types';
import { DEFAULT_IDEATION_CONFIG } from '../../shared/constants';

// Tracks the state of each ideation type during parallel generation
export type IdeationTypeState = 'pending' | 'generating' | 'completed' | 'failed';

interface IdeationState {
  // Data
  session: IdeationSession | null;
  generationStatus: IdeationGenerationStatus;
  config: IdeationConfig;
  logs: string[];
  // Track which ideation types are pending, generating, completed, or failed
  typeStates: Record<IdeationType, IdeationTypeState>;
  // Selection state
  selectedIds: Set<string>;

  // Actions
  setSession: (session: IdeationSession | null) => void;
  setGenerationStatus: (status: IdeationGenerationStatus) => void;
  setConfig: (config: Partial<IdeationConfig>) => void;
  updateIdeaStatus: (ideaId: string, status: IdeationStatus) => void;
  setIdeaTaskId: (ideaId: string, taskId: string) => void;
  dismissIdea: (ideaId: string) => void;
  dismissAllIdeas: () => void;
  archiveIdea: (ideaId: string) => void;
  deleteIdea: (ideaId: string) => void;
  deleteMultipleIdeas: (ideaIds: string[]) => void;
  clearSession: () => void;
  addLog: (log: string) => void;
  clearLogs: () => void;
  // Selection actions
  toggleSelectIdea: (ideaId: string) => void;
  selectAllIdeas: (ideaIds: string[]) => void;
  clearSelection: () => void;
  // New actions for streaming parallel results
  initializeTypeStates: (types: IdeationType[]) => void;
  setTypeState: (type: IdeationType, state: IdeationTypeState) => void;
  addIdeasForType: (ideationType: string, ideas: Idea[]) => void;
}

const initialGenerationStatus: IdeationGenerationStatus = {
  phase: 'idle',
  progress: 0,
  message: ''
};

const initialConfig: IdeationConfig = {
  enabledTypes: [...DEFAULT_IDEATION_CONFIG.enabledTypes] as IdeationType[],
  includeRoadmapContext: DEFAULT_IDEATION_CONFIG.includeRoadmapContext,
  includeKanbanContext: DEFAULT_IDEATION_CONFIG.includeKanbanContext,
  maxIdeasPerType: DEFAULT_IDEATION_CONFIG.maxIdeasPerType
};

// Initialize all type states to 'pending' initially (will be set when generation starts)
// Note: high_value_features removed, low_hanging_fruit renamed to code_improvements
const initialTypeStates: Record<IdeationType, IdeationTypeState> = {
  code_improvements: 'pending',
  ui_ux_improvements: 'pending',
  documentation_gaps: 'pending',
  security_hardening: 'pending',
  performance_optimizations: 'pending',
  code_quality: 'pending'
};

export const useIdeationStore = create<IdeationState>((set) => ({
  // Initial state
  session: null,
  generationStatus: initialGenerationStatus,
  config: initialConfig,
  logs: [],
  typeStates: { ...initialTypeStates },
  selectedIds: new Set<string>(),

  // Actions
  setSession: (session) => set({ session }),

  setGenerationStatus: (status) => set({ generationStatus: status }),

  setConfig: (newConfig) =>
    set((state) => ({
      config: { ...state.config, ...newConfig }
    })),

  updateIdeaStatus: (ideaId, status) =>
    set((state) => {
      if (!state.session) return state;

      const updatedIdeas = state.session.ideas.map((idea) =>
        idea.id === ideaId ? { ...idea, status } : idea
      );

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        }
      };
    }),

  setIdeaTaskId: (ideaId, taskId) =>
    set((state) => {
      if (!state.session) return state;

      const updatedIdeas = state.session.ideas.map((idea) =>
        idea.id === ideaId
          ? { ...idea, taskId, status: 'archived' as IdeationStatus }
          : idea
      );

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        }
      };
    }),

  dismissIdea: (ideaId) =>
    set((state) => {
      if (!state.session) return state;

      const updatedIdeas = state.session.ideas.map((idea) =>
        idea.id === ideaId ? { ...idea, status: 'dismissed' as IdeationStatus } : idea
      );

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        }
      };
    }),

  dismissAllIdeas: () =>
    set((state) => {
      if (!state.session) return state;

      const updatedIdeas = state.session.ideas.map((idea) =>
        idea.status !== 'dismissed' && idea.status !== 'converted' && idea.status !== 'archived'
          ? { ...idea, status: 'dismissed' as IdeationStatus }
          : idea
      );

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        }
      };
    }),

  archiveIdea: (ideaId) =>
    set((state) => {
      if (!state.session) return state;

      const updatedIdeas = state.session.ideas.map((idea) =>
        idea.id === ideaId ? { ...idea, status: 'archived' as IdeationStatus } : idea
      );

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        }
      };
    }),

  deleteIdea: (ideaId) =>
    set((state) => {
      if (!state.session) return state;

      const updatedIdeas = state.session.ideas.filter((idea) => idea.id !== ideaId);

      // Also remove from selection if selected
      const newSelectedIds = new Set(state.selectedIds);
      newSelectedIds.delete(ideaId);

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        },
        selectedIds: newSelectedIds
      };
    }),

  deleteMultipleIdeas: (ideaIds) =>
    set((state) => {
      if (!state.session) return state;

      const idsToDelete = new Set(ideaIds);
      const updatedIdeas = state.session.ideas.filter((idea) => !idsToDelete.has(idea.id));

      // Clear selection for deleted items
      const newSelectedIds = new Set(state.selectedIds);
      ideaIds.forEach((id) => newSelectedIds.delete(id));

      return {
        session: {
          ...state.session,
          ideas: updatedIdeas,
          updatedAt: new Date()
        },
        selectedIds: newSelectedIds
      };
    }),

  clearSession: () =>
    set({
      session: null,
      generationStatus: initialGenerationStatus,
      typeStates: { ...initialTypeStates },
      selectedIds: new Set<string>()
    }),

  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, log].slice(-100) // Keep last 100 logs
    })),

  clearLogs: () => set({ logs: [] }),

  // Selection actions
  toggleSelectIdea: (ideaId) =>
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      if (newSelectedIds.has(ideaId)) {
        newSelectedIds.delete(ideaId);
      } else {
        newSelectedIds.add(ideaId);
      }
      return { selectedIds: newSelectedIds };
    }),

  selectAllIdeas: (ideaIds) =>
    set(() => ({
      selectedIds: new Set(ideaIds)
    })),

  clearSelection: () =>
    set(() => ({
      selectedIds: new Set<string>()
    })),

  // Initialize type states when starting generation
  initializeTypeStates: (types) =>
    set((_state) => {
      const newTypeStates = { ...initialTypeStates };
      // Set all enabled types to 'generating'
      types.forEach((type) => {
        newTypeStates[type] = 'generating';
      });
      // Set all disabled types to 'pending' (they won't be generated)
      Object.keys(newTypeStates).forEach((type) => {
        if (!types.includes(type as IdeationType)) {
          newTypeStates[type as IdeationType] = 'pending';
        }
      });
      return { typeStates: newTypeStates };
    }),

  // Update individual type state
  setTypeState: (type, state) =>
    set((prevState) => ({
      typeStates: { ...prevState.typeStates, [type]: state }
    })),

  // Add ideas for a specific type (streaming update)
  addIdeasForType: (ideationType, ideas) =>
    set((state) => {
      // Update type state to completed
      const newTypeStates = { ...state.typeStates };
      newTypeStates[ideationType as IdeationType] = 'completed';

      // If no session exists yet, create a partial one
      if (!state.session) {
        const config = state.config;
        return {
          typeStates: newTypeStates,
          session: {
            id: `session-${Date.now()}`,
            projectId: '', // Will be set by final session
            config,
            ideas,
            projectContext: {
              existingFeatures: [],
              techStack: [],
              plannedFeatures: []
            },
            generatedAt: new Date(),
            updatedAt: new Date()
          }
        };
      }

      // Merge new ideas with existing ones (avoid duplicates by id)
      const existingIds = new Set(state.session.ideas.map((i) => i.id));
      const newIdeas = ideas.filter((idea) => !existingIds.has(idea.id));

      return {
        typeStates: newTypeStates,
        session: {
          ...state.session,
          ideas: [...state.session.ideas, ...newIdeas],
          updatedAt: new Date()
        }
      };
    })
}));

// Helper functions for loading ideation
export async function loadIdeation(projectId: string): Promise<void> {
  const result = await window.electronAPI.getIdeation(projectId);
  if (result.success && result.data) {
    useIdeationStore.getState().setSession(result.data);
  } else {
    useIdeationStore.getState().setSession(null);
  }
}

export function generateIdeation(projectId: string): void {
  const store = useIdeationStore.getState();
  const config = store.config;

  // Debug logging
  if (window.DEBUG) {
    console.log('[Ideation] Starting generation:', {
      projectId,
      enabledTypes: config.enabledTypes,
      includeRoadmapContext: config.includeRoadmapContext,
      includeKanbanContext: config.includeKanbanContext,
      maxIdeasPerType: config.maxIdeasPerType
    });
  }

  store.clearLogs();
  store.clearSession(); // Clear existing session for fresh generation
  store.initializeTypeStates(config.enabledTypes);
  store.addLog('Starting ideation generation in parallel...');
  store.setGenerationStatus({
    phase: 'generating',
    progress: 0,
    message: `Generating ${config.enabledTypes.length} ideation types in parallel...`
  });
  window.electronAPI.generateIdeation(projectId, config);
}

export async function stopIdeation(projectId: string): Promise<boolean> {
  const store = useIdeationStore.getState();

  // Debug logging
  if (window.DEBUG) {
    console.log('[Ideation] Stop requested:', { projectId });
  }

  // Always update UI state to 'idle' when user requests stop, regardless of backend response
  // This prevents the UI from getting stuck in "generating" state if the process already ended
  store.addLog('Stopping ideation generation...');
  store.setGenerationStatus({
    phase: 'idle',
    progress: 0,
    message: 'Generation stopped'
  });

  const result = await window.electronAPI.stopIdeation(projectId);

  // Debug logging
  if (window.DEBUG) {
    console.log('[Ideation] Stop result:', { projectId, success: result.success });
  }

  if (!result.success) {
    // Backend couldn't find/stop the process (likely already finished/crashed)
    store.addLog('Process already stopped');
  } else {
    store.addLog('Ideation generation stopped');
  }

  return result.success;
}

export async function refreshIdeation(projectId: string): Promise<void> {
  const store = useIdeationStore.getState();
  const config = store.config;

  // Stop any existing generation first
  await window.electronAPI.stopIdeation(projectId);

  store.clearLogs();
  store.clearSession(); // Clear existing session for fresh generation
  store.initializeTypeStates(config.enabledTypes);
  store.addLog('Refreshing ideation in parallel...');
  store.setGenerationStatus({
    phase: 'generating',
    progress: 0,
    message: `Refreshing ${config.enabledTypes.length} ideation types in parallel...`
  });
  window.electronAPI.refreshIdeation(projectId, config);
}

export async function dismissAllIdeasForProject(projectId: string): Promise<boolean> {
  const store = useIdeationStore.getState();
  const result = await window.electronAPI.dismissAllIdeas(projectId);
  if (result.success) {
    store.dismissAllIdeas();
    store.addLog('All ideas dismissed');
  }
  return result.success;
}

export async function archiveIdeaForProject(projectId: string, ideaId: string): Promise<boolean> {
  const store = useIdeationStore.getState();
  const result = await window.electronAPI.archiveIdea(projectId, ideaId);
  if (result.success) {
    store.archiveIdea(ideaId);
    store.addLog('Idea archived');
  }
  return result.success;
}

export async function deleteIdeaForProject(projectId: string, ideaId: string): Promise<boolean> {
  const store = useIdeationStore.getState();
  const result = await window.electronAPI.deleteIdea(projectId, ideaId);
  if (result.success) {
    store.deleteIdea(ideaId);
    store.addLog('Idea deleted');
  }
  return result.success;
}

export async function deleteMultipleIdeasForProject(projectId: string, ideaIds: string[]): Promise<boolean> {
  const store = useIdeationStore.getState();
  const result = await window.electronAPI.deleteMultipleIdeas(projectId, ideaIds);
  if (result.success) {
    store.deleteMultipleIdeas(ideaIds);
    store.clearSelection();
    store.addLog(`${ideaIds.length} ideas deleted`);
  }
  return result.success;
}

/**
 * Append new ideation types to existing session without clearing existing ideas.
 * This allows users to add more categories (like security, performance) while keeping
 * their existing ideas intact.
 */
export function appendIdeation(projectId: string, typesToAdd: IdeationType[]): void {
  const store = useIdeationStore.getState();
  const config = store.config;

  // Don't clear existing session - we're appending
  store.clearLogs();

  // Only initialize states for the new types we're adding
  // Keep existing type states as 'completed' for types we already have
  const newTypeStates = { ...store.typeStates };
  typesToAdd.forEach((type) => {
    newTypeStates[type] = 'generating';
  });
  store.initializeTypeStates(typesToAdd);

  store.addLog(`Adding ${typesToAdd.length} new ideation types...`);
  store.setGenerationStatus({
    phase: 'generating',
    progress: 0,
    message: `Generating ${typesToAdd.length} additional ideation types...`
  });

  // Call generate with append mode and only the new types
  const appendConfig = {
    ...config,
    enabledTypes: typesToAdd,
    append: true
  };
  window.electronAPI.generateIdeation(projectId, appendConfig);
}

// Selectors
export function getIdeasByType(
  session: IdeationSession | null,
  type: IdeationType
): Idea[] {
  if (!session) return [];
  return session.ideas.filter((idea) => idea.type === type);
}

export function getIdeasByStatus(
  session: IdeationSession | null,
  status: IdeationStatus
): Idea[] {
  if (!session) return [];
  return session.ideas.filter((idea) => idea.status === status);
}

export function getActiveIdeas(session: IdeationSession | null): Idea[] {
  if (!session) return [];
  return session.ideas.filter((idea) => idea.status !== 'dismissed' && idea.status !== 'archived');
}

export function getArchivedIdeas(session: IdeationSession | null): Idea[] {
  if (!session) return [];
  return session.ideas.filter((idea) => idea.status === 'archived');
}

export function getIdeationSummary(session: IdeationSession | null): IdeationSummary {
  if (!session) {
    return {
      totalIdeas: 0,
      byType: {} as Record<IdeationType, number>,
      byStatus: {} as Record<IdeationStatus, number>
    };
  }

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  session.ideas.forEach((idea) => {
    byType[idea.type] = (byType[idea.type] || 0) + 1;
    byStatus[idea.status] = (byStatus[idea.status] || 0) + 1;
  });

  return {
    totalIdeas: session.ideas.length,
    byType: byType as Record<IdeationType, number>,
    byStatus: byStatus as Record<IdeationStatus, number>,
    lastGenerated: session.generatedAt
  };
}

// Type guards for idea types
// Note: isLowHangingFruitIdea renamed to isCodeImprovementIdea
// isHighValueIdea removed - strategic features belong to Roadmap
export function isCodeImprovementIdea(idea: Idea): idea is Idea & { type: 'code_improvements' } {
  return idea.type === 'code_improvements';
}

export function isUIUXIdea(idea: Idea): idea is Idea & { type: 'ui_ux_improvements' } {
  return idea.type === 'ui_ux_improvements';
}

// IPC listener setup - call this once when the app initializes
export function setupIdeationListeners(): () => void {
  const store = useIdeationStore.getState;

  // Listen for progress updates
  const unsubProgress = window.electronAPI.onIdeationProgress((_projectId, status) => {
    // Debug logging
    if (window.DEBUG) {
      console.log('[Ideation] Progress update:', {
        projectId: _projectId,
        phase: status.phase,
        progress: status.progress,
        message: status.message
      });
    }
    store().setGenerationStatus(status);
  });

  // Listen for log messages
  const unsubLog = window.electronAPI.onIdeationLog((_projectId, log) => {
    store().addLog(log);
  });

  // Listen for individual ideation type completion (streaming)
  const unsubTypeComplete = window.electronAPI.onIdeationTypeComplete(
    (_projectId, ideationType, ideas) => {
      // Debug logging
      if (window.DEBUG) {
        console.log('[Ideation] Type completed:', {
          projectId: _projectId,
          ideationType,
          ideasCount: ideas.length,
          ideas: ideas.map(i => ({ id: i.id, title: i.title, type: i.type }))
        });
      }

      store().addIdeasForType(ideationType, ideas);
      store().addLog(`✓ ${ideationType} completed with ${ideas.length} ideas`);

      // Update progress based on completed types
      const typeStates = store().typeStates;
      const config = store().config;
      const completedCount = Object.entries(typeStates).filter(
        ([type, state]) =>
          config.enabledTypes.includes(type as IdeationType) &&
          (state === 'completed' || state === 'failed')
      ).length;
      const totalTypes = config.enabledTypes.length;
      const progress = Math.round((completedCount / totalTypes) * 100);

      store().setGenerationStatus({
        phase: 'generating',
        progress,
        message: `${completedCount}/${totalTypes} ideation types complete`
      });
    }
  );

  // Listen for individual ideation type failure
  const unsubTypeFailed = window.electronAPI.onIdeationTypeFailed(
    (_projectId, ideationType) => {
      // Debug logging
      if (window.DEBUG) {
        console.error('[Ideation] Type failed:', { projectId: _projectId, ideationType });
      }

      store().setTypeState(ideationType as IdeationType, 'failed');
      store().addLog(`✗ ${ideationType} failed`);
    }
  );

  // Listen for completion (final session with all data)
  const unsubComplete = window.electronAPI.onIdeationComplete((_projectId, session) => {
    // Debug logging
    if (window.DEBUG) {
      console.log('[Ideation] Generation complete:', {
        projectId: _projectId,
        totalIdeas: session.ideas.length,
        ideaTypes: session.ideas.reduce((acc, idea) => {
          acc[idea.type] = (acc[idea.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });
    }

    // Final session replaces the partial one with complete data
    store().setSession(session);
    store().setGenerationStatus({
      phase: 'complete',
      progress: 100,
      message: 'Ideation complete'
    });
    store().addLog('Ideation generation complete!');
  });

  // Listen for errors
  const unsubError = window.electronAPI.onIdeationError((_projectId, error) => {
    // Debug logging
    if (window.DEBUG) {
      console.error('[Ideation] Error received:', { projectId: _projectId, error });
    }

    store().setGenerationStatus({
      phase: 'error',
      progress: 0,
      message: '',
      error
    });
    store().addLog(`Error: ${error}`);
  });

  // Listen for stopped event
  const unsubStopped = window.electronAPI.onIdeationStopped((_projectId) => {
    store().setGenerationStatus({
      phase: 'idle',
      progress: 0,
      message: 'Generation stopped'
    });
    store().addLog('Ideation generation stopped');
  });

  // Return cleanup function
  return () => {
    unsubProgress();
    unsubLog();
    unsubTypeComplete();
    unsubTypeFailed();
    unsubComplete();
    unsubError();
    unsubStopped();
  };
}
