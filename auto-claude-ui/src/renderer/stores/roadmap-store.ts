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

  // Actions
  setRoadmap: (roadmap: Roadmap | null) => void;
  setCompetitorAnalysis: (analysis: CompetitorAnalysis | null) => void;
  setGenerationStatus: (status: RoadmapGenerationStatus) => void;
  updateFeatureStatus: (featureId: string, status: RoadmapFeatureStatus) => void;
  updateFeatureLinkedSpec: (featureId: string, specId: string) => void;
  clearRoadmap: () => void;
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

  // Actions
  setRoadmap: (roadmap) => set({ roadmap }),

  setCompetitorAnalysis: (analysis) => set({ competitorAnalysis: analysis }),

  setGenerationStatus: (status) => set({ generationStatus: status }),

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
      generationStatus: initialGenerationStatus
    })
}));

// Helper functions for loading roadmap
export async function loadRoadmap(projectId: string): Promise<void> {
  const result = await window.electronAPI.getRoadmap(projectId);
  if (result.success && result.data) {
    useRoadmapStore.getState().setRoadmap(result.data);
  } else {
    useRoadmapStore.getState().setRoadmap(null);
  }
}

export function generateRoadmap(
  projectId: string,
  enableCompetitorAnalysis: boolean = false
): void {
  useRoadmapStore.getState().setGenerationStatus({
    phase: 'analyzing',
    progress: 0,
    message: enableCompetitorAnalysis
      ? 'Starting roadmap generation with competitor analysis...'
      : 'Starting roadmap generation...'
  });
  window.electronAPI.generateRoadmap(projectId, enableCompetitorAnalysis);
}

export function refreshRoadmap(
  projectId: string,
  enableCompetitorAnalysis: boolean = false
): void {
  useRoadmapStore.getState().setGenerationStatus({
    phase: 'analyzing',
    progress: 0,
    message: enableCompetitorAnalysis
      ? 'Refreshing roadmap with competitor analysis...'
      : 'Refreshing roadmap...'
  });
  window.electronAPI.refreshRoadmap(projectId, enableCompetitorAnalysis);
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
