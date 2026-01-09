import { create } from 'zustand';
import type {
  CompetitorAnalysis,
  Roadmap,
  RoadmapFeature,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus
} from '../../shared/types';

interface RoadmapState {
  // Data
  roadmap: Roadmap | null;
  competitorAnalysis: CompetitorAnalysis | null;
  generationStatus: RoadmapGenerationStatus;
  currentProjectId: string | null;  // Track which project we're viewing/generating for

  // Actions
  setRoadmap: (roadmap: Roadmap | null) => void;
  setCompetitorAnalysis: (analysis: CompetitorAnalysis | null) => void;
  setGenerationStatus: (status: RoadmapGenerationStatus) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  updateFeatureStatus: (featureId: string, status: RoadmapFeatureStatus) => void;
  updateFeatureLinkedSpec: (featureId: string, specId: string) => void;
  clearRoadmap: () => void;
  // Drag-and-drop actions
  reorderFeatures: (phaseId: string, featureIds: string[]) => void;
  updateFeaturePhase: (featureId: string, newPhaseId: string) => void;
  addFeature: (feature: Omit<RoadmapFeature, 'id'>) => string;
}

const initialGenerationStatus: RoadmapGenerationStatus = {
  phase: 'idle',
  progress: 0,
  message: ''
};

export const useRoadmapStore = create<RoadmapState>((set) => ({
  // Initial state
  roadmap: null,
  competitorAnalysis: null,
  generationStatus: initialGenerationStatus,
  currentProjectId: null,

  // Actions
  setRoadmap: (roadmap) => set({ roadmap }),

  setCompetitorAnalysis: (analysis) => set({ competitorAnalysis: analysis }),

  setGenerationStatus: (status) => set({ generationStatus: status }),

  setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),

  updateFeatureStatus: (featureId, status) =>
    set((state) => {
      if (!state.roadmap) return state;

      const updatedFeatures = state.roadmap.features.map((feature) =>
        feature.id === featureId ? { ...feature, status } : feature
      );

      return {
        roadmap: {
          ...state.roadmap,
          features: updatedFeatures,
          updatedAt: new Date()
        }
      };
    }),

  updateFeatureLinkedSpec: (featureId, specId) =>
    set((state) => {
      if (!state.roadmap) return state;

      const updatedFeatures = state.roadmap.features.map((feature) =>
        feature.id === featureId
          ? { ...feature, linkedSpecId: specId, status: 'planned' as RoadmapFeatureStatus }
          : feature
      );

      return {
        roadmap: {
          ...state.roadmap,
          features: updatedFeatures,
          updatedAt: new Date()
        }
      };
    }),

  clearRoadmap: () =>
    set({
      roadmap: null,
      competitorAnalysis: null,
      generationStatus: initialGenerationStatus,
      currentProjectId: null
    }),

  // Reorder features within a phase
  reorderFeatures: (phaseId, featureIds) =>
    set((state) => {
      if (!state.roadmap) return state;

      // Get features for this phase in the new order
      const phaseFeatures = featureIds
        .map((id) => state.roadmap!.features.find((f) => f.id === id))
        .filter((f): f is RoadmapFeature => f !== undefined);

      // Get features from other phases (unchanged)
      const otherFeatures = state.roadmap.features.filter(
        (f) => f.phaseId !== phaseId
      );

      // Combine: other phases first, then reordered phase features
      const updatedFeatures = [...otherFeatures, ...phaseFeatures];

      return {
        roadmap: {
          ...state.roadmap,
          features: updatedFeatures,
          updatedAt: new Date()
        }
      };
    }),

  // Move a feature to a different phase
  updateFeaturePhase: (featureId, newPhaseId) =>
    set((state) => {
      if (!state.roadmap) return state;

      const updatedFeatures = state.roadmap.features.map((feature) =>
        feature.id === featureId ? { ...feature, phaseId: newPhaseId } : feature
      );

      return {
        roadmap: {
          ...state.roadmap,
          features: updatedFeatures,
          updatedAt: new Date()
        }
      };
    }),

  // Add a new feature to the roadmap
  addFeature: (featureData) => {
    const newId = `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newFeature: RoadmapFeature = {
      ...featureData,
      id: newId
    };

    set((state) => {
      if (!state.roadmap) return state;

      return {
        roadmap: {
          ...state.roadmap,
          features: [...state.roadmap.features, newFeature],
          updatedAt: new Date()
        }
      };
    });

    return newId;
  }
}));

// Helper functions for loading roadmap
export async function loadRoadmap(projectId: string): Promise<void> {
  const store = useRoadmapStore.getState();

  // Always set current project ID first - this ensures event handlers
  // only process events for the currently viewed project
  store.setCurrentProjectId(projectId);

  // Query if roadmap generation is currently running for this project
  // This restores the generation status when switching back to a project
  const statusResult = await window.electronAPI.getRoadmapStatus(projectId);
  if (statusResult.success && statusResult.data?.isRunning) {
    // Generation is running - restore the UI state to show progress
    // The actual progress will be updated by incoming events
    store.setGenerationStatus({
      phase: 'analyzing',
      progress: 0,
      message: 'Roadmap generation in progress...'
    });
  } else {
    // Generation is not running - reset to idle
    store.setGenerationStatus({
      phase: 'idle',
      progress: 0,
      message: ''
    });
  }

  const result = await window.electronAPI.getRoadmap(projectId);
  if (result.success && result.data) {
    store.setRoadmap(result.data);
    // Extract and set competitor analysis separately if present
    if (result.data.competitorAnalysis) {
      store.setCompetitorAnalysis(result.data.competitorAnalysis);
    } else {
      store.setCompetitorAnalysis(null);
    }
  } else {
    store.setRoadmap(null);
    store.setCompetitorAnalysis(null);
  }
}

export function generateRoadmap(projectId: string, enableCompetitorAnalysis?: boolean): void {
  // Debug logging
  if (window.DEBUG) {
    console.log('[Roadmap] Starting generation:', { projectId, enableCompetitorAnalysis });
  }

  useRoadmapStore.getState().setGenerationStatus({
    phase: 'analyzing',
    progress: 0,
    message: 'Starting roadmap generation...'
  });
  window.electronAPI.generateRoadmap(projectId, enableCompetitorAnalysis);
}

export function refreshRoadmap(projectId: string, enableCompetitorAnalysis?: boolean): void {
  useRoadmapStore.getState().setGenerationStatus({
    phase: 'analyzing',
    progress: 0,
    message: 'Refreshing roadmap...'
  });
  window.electronAPI.refreshRoadmap(projectId, enableCompetitorAnalysis);
}

export async function stopRoadmap(projectId: string): Promise<boolean> {
  const store = useRoadmapStore.getState();

  // Debug logging
  if (window.DEBUG) {
    console.log('[Roadmap] Stop requested:', { projectId });
  }

  // Always update UI state to 'idle' when user requests stop, regardless of backend response
  // This prevents the UI from getting stuck in "generating" state if the process already ended
  store.setGenerationStatus({
    phase: 'idle',
    progress: 0,
    message: 'Generation stopped'
  });

  const result = await window.electronAPI.stopRoadmap(projectId);

  // Debug logging
  if (window.DEBUG) {
    console.log('[Roadmap] Stop result:', { projectId, success: result.success });
  }

  if (!result.success) {
    // Backend couldn't find/stop the process (likely already finished/crashed)
    console.log('[Roadmap] Process already stopped');
  }

  return result.success;
}

// Selectors
export function getFeaturesByPhase(
  roadmap: Roadmap | null,
  phaseId: string
): RoadmapFeature[] {
  if (!roadmap) return [];
  return roadmap.features.filter((f) => f.phaseId === phaseId);
}

export function getFeaturesByPriority(
  roadmap: Roadmap | null,
  priority: string
): RoadmapFeature[] {
  if (!roadmap) return [];
  return roadmap.features.filter((f) => f.priority === priority);
}

export function getFeatureStats(roadmap: Roadmap | null): {
  total: number;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
  byComplexity: Record<string, number>;
} {
  if (!roadmap) {
    return {
      total: 0,
      byPriority: {},
      byStatus: {},
      byComplexity: {}
    };
  }

  const byPriority: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};

  roadmap.features.forEach((feature) => {
    byPriority[feature.priority] = (byPriority[feature.priority] || 0) + 1;
    byStatus[feature.status] = (byStatus[feature.status] || 0) + 1;
    byComplexity[feature.complexity] = (byComplexity[feature.complexity] || 0) + 1;
  });

  return {
    total: roadmap.features.length,
    byPriority,
    byStatus,
    byComplexity
  };
}
