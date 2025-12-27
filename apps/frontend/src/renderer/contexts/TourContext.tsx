/**
 * Tour Context
 *
 * Provides tour functionality across the entire application.
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import { useTour, type UseTourReturn } from '../hooks/useTour';
import { TourOverlay } from '../components/tour';
import { MAIN_TOUR_STEPS, QUICK_TOUR_STEPS, FEATURE_TOURS } from '../components/tour';
import type { TourStep } from '../components/tour';

interface TourContextValue extends UseTourReturn {
  startMainTour: () => void;
  startQuickTour: () => void;
  startFeatureTour: (featureId: keyof typeof FEATURE_TOURS) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const tour = useTour();

  const startMainTour = () => {
    tour.startTour(MAIN_TOUR_STEPS, 'main');
  };

  const startQuickTour = () => {
    tour.startTour(QUICK_TOUR_STEPS, 'quick');
  };

  const startFeatureTour = (featureId: keyof typeof FEATURE_TOURS) => {
    const steps = FEATURE_TOURS[featureId] as TourStep[];
    if (steps) {
      tour.startTour(steps, featureId);
    }
  };

  const value: TourContextValue = {
    ...tour,
    startMainTour,
    startQuickTour,
    startFeatureTour
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay
        isOpen={tour.isActive}
        steps={tour.currentSteps}
        onClose={tour.endTour}
        onComplete={tour.endTour}
      />
    </TourContext.Provider>
  );
}

export function useTourContext(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTourContext must be used within a TourProvider');
  }
  return context;
}

export default TourContext;
