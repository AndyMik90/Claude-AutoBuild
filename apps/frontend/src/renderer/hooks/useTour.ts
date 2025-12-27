/**
 * Tour Hook
 *
 * Manages tour state and persistence across sessions.
 */

import { useState, useCallback, useEffect } from 'react';
import type { TourStep } from '../components/tour';

const TOUR_STORAGE_KEY = 'auto-claude-tour-state';

interface TourState {
  hasSeenMainTour: boolean;
  hasSeenQuickTour: boolean;
  completedFeatureTours: string[];
  lastTourVersion: string;
}

const CURRENT_TOUR_VERSION = '1.0.0';

const defaultState: TourState = {
  hasSeenMainTour: false,
  hasSeenQuickTour: false,
  completedFeatureTours: [],
  lastTourVersion: CURRENT_TOUR_VERSION
};

function loadTourState(): TourState {
  try {
    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as TourState;
      // Reset if version changed (new features added)
      if (state.lastTourVersion !== CURRENT_TOUR_VERSION) {
        return { ...defaultState, lastTourVersion: CURRENT_TOUR_VERSION };
      }
      return state;
    }
  } catch (e) {
    console.error('Failed to load tour state:', e);
  }
  return defaultState;
}

function saveTourState(state: TourState): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save tour state:', e);
  }
}

export interface UseTourReturn {
  // Current tour state
  isActive: boolean;
  currentSteps: TourStep[];
  currentStepIndex: number;

  // Actions
  startTour: (steps: TourStep[], tourId?: string) => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;

  // Persistence
  hasSeenMainTour: boolean;
  hasSeenQuickTour: boolean;
  hasCompletedFeatureTour: (tourId: string) => boolean;
  resetTourState: () => void;

  // Helpers
  shouldShowMainTour: boolean;
}

export function useTour(): UseTourReturn {
  const [tourState, setTourState] = useState<TourState>(loadTourState);
  const [isActive, setIsActive] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<TourStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [activeTourId, setActiveTourId] = useState<string | null>(null);

  // Persist state changes
  useEffect(() => {
    saveTourState(tourState);
  }, [tourState]);

  const startTour = useCallback((steps: TourStep[], tourId?: string) => {
    setCurrentSteps(steps);
    setCurrentStepIndex(0);
    setActiveTourId(tourId || null);
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);

    // Mark tour as completed
    if (activeTourId === 'main') {
      setTourState(prev => ({ ...prev, hasSeenMainTour: true }));
    } else if (activeTourId === 'quick') {
      setTourState(prev => ({ ...prev, hasSeenQuickTour: true }));
    } else if (activeTourId) {
      setTourState(prev => ({
        ...prev,
        completedFeatureTours: Array.from(new Set([...prev.completedFeatureTours, activeTourId]))
      }));
    }

    setCurrentSteps([]);
    setCurrentStepIndex(0);
    setActiveTourId(null);
  }, [activeTourId]);

  const nextStep = useCallback(() => {
    if (currentStepIndex < currentSteps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      endTour();
    }
  }, [currentStepIndex, currentSteps.length, endTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < currentSteps.length) {
      setCurrentStepIndex(index);
    }
  }, [currentSteps.length]);

  const hasCompletedFeatureTour = useCallback((tourId: string) => {
    return tourState.completedFeatureTours.includes(tourId);
  }, [tourState.completedFeatureTours]);

  const resetTourState = useCallback(() => {
    setTourState(defaultState);
    setIsActive(false);
    setCurrentSteps([]);
    setCurrentStepIndex(0);
    setActiveTourId(null);
  }, []);

  return {
    isActive,
    currentSteps,
    currentStepIndex,
    startTour,
    endTour,
    nextStep,
    prevStep,
    goToStep,
    hasSeenMainTour: tourState.hasSeenMainTour,
    hasSeenQuickTour: tourState.hasSeenQuickTour,
    hasCompletedFeatureTour,
    resetTourState,
    shouldShowMainTour: !tourState.hasSeenMainTour
  };
}

export default useTour;
