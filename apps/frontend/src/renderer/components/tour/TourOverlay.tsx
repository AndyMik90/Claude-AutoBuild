/**
 * Interactive Tour Overlay Component
 *
 * Provides step-by-step guided tour through Auto-Claude features.
 * Highlights UI elements and explains their purpose.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export interface TourStep {
  /** Unique step identifier */
  id: string;
  /** CSS selector for the element to highlight (optional - if not provided, shows centered modal) */
  target?: string;
  /** Translation key for title */
  titleKey: string;
  /** Translation key for description */
  descriptionKey: string;
  /** Position of tooltip relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Optional action to perform when step is shown */
  onShow?: () => void;
}

interface TourOverlayProps {
  /** Whether the tour is active */
  isOpen: boolean;
  /** Callback when tour is closed */
  onClose: () => void;
  /** Callback when tour is completed */
  onComplete: () => void;
  /** Tour steps to display */
  steps: TourStep[];
  /** Translation namespace */
  namespace?: string;
}

/**
 * Tour Overlay - Shows highlighted elements with explanatory tooltips
 */
export function TourOverlay({
  isOpen,
  onClose,
  onComplete,
  steps,
  namespace = 'tour'
}: TourOverlayProps) {
  const { t } = useTranslation(namespace);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const currentStep = steps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Find and highlight target element
  useEffect(() => {
    if (!isOpen || !currentStep?.target) {
      setTargetRect(null);
      return;
    }

    const findTarget = () => {
      const element = document.querySelector(currentStep.target!);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        // Scroll element into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setTargetRect(null);
      }
    };

    // Small delay to allow UI to render
    const timer = setTimeout(findTarget, 100);

    // Re-calculate on resize
    window.addEventListener('resize', findTarget);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', findTarget);
    };
  }, [isOpen, currentStep]);

  // Call onShow callback when step changes
  useEffect(() => {
    if (isOpen && currentStep?.onShow) {
      currentStep.onShow();
    }
  }, [isOpen, currentStep]);

  const goToNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [isLastStep, onComplete]);

  const goToPrevious = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [isFirstStep]);

  const handleClose = useCallback(() => {
    setCurrentStepIndex(0);
    onClose();
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') goToNext();
      if (e.key === 'ArrowLeft') goToPrevious();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, goToNext, goToPrevious]);

  if (!isOpen) return null;

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || currentStep?.position === 'center') {
      // Center in viewport
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const padding = 16;
    const position = currentStep?.position || 'bottom';

    switch (position) {
      case 'top':
        return {
          position: 'fixed',
          bottom: window.innerHeight - targetRect.top + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)'
        };
      case 'bottom':
        return {
          position: 'fixed',
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)'
        };
      case 'left':
        return {
          position: 'fixed',
          top: targetRect.top + targetRect.height / 2,
          right: window.innerWidth - targetRect.left + padding,
          transform: 'translateY(-50%)'
        };
      case 'right':
        return {
          position: 'fixed',
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + padding,
          transform: 'translateY(-50%)'
        };
      default:
        return {
          position: 'fixed',
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2,
          transform: 'translateX(-50%)'
        };
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Dark overlay with cutout for target */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Spotlight on target element */}
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6), 0 0 20px 4px rgba(var(--primary), 0.3)'
          }}
        />
      )}

      {/* Tooltip */}
      <div
        style={getTooltipStyle()}
        className={cn(
          'bg-card border border-border rounded-xl shadow-2xl p-6 max-w-md z-10',
          'animate-in fade-in-0 zoom-in-95 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {t(currentStep.titleKey)}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {t(currentStep.descriptionKey)}
        </p>

        {/* Progress & Navigation */}
        <div className="flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {steps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full transition-colors',
                  index === currentStepIndex
                    ? 'bg-primary'
                    : index < currentStepIndex
                    ? 'bg-primary/50'
                    : 'bg-muted'
                )}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={goToPrevious}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('navigation.back')}
              </Button>
            )}
            <Button size="sm" onClick={goToNext}>
              {isLastStep ? t('navigation.finish') : t('navigation.next')}
              {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Step counter */}
        <div className="text-xs text-muted-foreground text-center mt-4">
          {t('navigation.stepOf', { current: currentStepIndex + 1, total: steps.length })}
        </div>
      </div>
    </div>
  );
}

export default TourOverlay;
