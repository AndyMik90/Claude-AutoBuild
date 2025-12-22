import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Users, Sparkles, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';
import type { RoadmapGenerationStatus } from '../../shared/types/roadmap';

/**
 * Hook to detect user's reduced motion preference.
 * Listens for changes to the prefers-reduced-motion media query.
 */
function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    // Check if window is available (for SSR safety)
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    // Add listener for changes
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reducedMotion;
}

interface RoadmapGenerationProgressProps {
  generationStatus: RoadmapGenerationStatus;
  className?: string;
  onStop?: () => void | Promise<void>;
}

// Type for generation phases (excluding idle)
type GenerationPhase = Exclude<RoadmapGenerationStatus['phase'], 'idle'>;

// Phase display configuration
const PHASE_CONFIG: Record<
  GenerationPhase,
  {
    label: string;
    description: string;
    icon: typeof Search;
    color: string;
    bgColor: string;
  }
> = {
  analyzing: {
    label: 'Analyzing',
    description: 'Analyzing project structure and codebase...',
    icon: Search,
    color: 'bg-amber-500',
    bgColor: 'bg-amber-500/20',
  },
  discovering: {
    label: 'Discovering',
    description: 'Discovering target audience and user needs...',
    icon: Users,
    color: 'bg-info',
    bgColor: 'bg-info/20',
  },
  generating: {
    label: 'Generating',
    description: 'Generating feature roadmap...',
    icon: Sparkles,
    color: 'bg-primary',
    bgColor: 'bg-primary/20',
  },
  complete: {
    label: 'Complete',
    description: 'Roadmap generation complete!',
    icon: CheckCircle2,
    color: 'bg-success',
    bgColor: 'bg-success/20',
  },
  error: {
    label: 'Error',
    description: 'Generation failed',
    icon: AlertCircle,
    color: 'bg-destructive',
    bgColor: 'bg-destructive/20',
  },
};

// Phases shown in the step indicator (excluding complete and error)
const STEP_PHASES: { key: GenerationPhase; label: string }[] = [
  { key: 'analyzing', label: 'Analyze' },
  { key: 'discovering', label: 'Discover' },
  { key: 'generating', label: 'Generate' },
];

/**
 * Internal component for showing phase steps indicator
 */
function PhaseStepsIndicator({
  currentPhase,
  reducedMotion,
}: {
  currentPhase: RoadmapGenerationStatus['phase'];
  reducedMotion: boolean;
}) {
  const getPhaseState = (
    phaseKey: GenerationPhase
  ): 'pending' | 'active' | 'complete' | 'error' => {
    const phaseOrder: GenerationPhase[] = ['analyzing', 'discovering', 'generating', 'complete'];
    const currentIndex = phaseOrder.indexOf(currentPhase as GenerationPhase);
    const phaseIndex = phaseOrder.indexOf(phaseKey);

    if (currentPhase === 'error') return 'error';
    if (currentPhase === 'complete') return 'complete';
    if (phaseKey === currentPhase) return 'active';
    if (phaseIndex < currentIndex) return 'complete';
    return 'pending';
  };

  // Animation values that respect reduced motion preference
  const getStepAnimation = (state: string) => {
    if (state !== 'active') return { opacity: 1 };
    return reducedMotion ? { opacity: 1 } : { opacity: [1, 0.6, 1] };
  };

  const getStepTransition = (state: string) => {
    if (state !== 'active' || reducedMotion) return undefined;
    return { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const };
  };

  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      {STEP_PHASES.map((phase, index) => {
        const state = getPhaseState(phase.key);
        return (
          <div key={phase.key} className="flex items-center">
            <motion.div
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                state === 'complete' && 'bg-success/10 text-success',
                state === 'active' && 'bg-primary/10 text-primary',
                state === 'error' && 'bg-destructive/10 text-destructive',
                state === 'pending' && 'bg-muted text-muted-foreground'
              )}
              animate={getStepAnimation(state)}
              transition={getStepTransition(state)}
            >
              {state === 'complete' && (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {phase.label}
            </motion.div>
            {index < STEP_PHASES.length - 1 && (
              <div
                className={cn(
                  'w-4 h-px mx-1',
                  getPhaseState(STEP_PHASES[index + 1].key) !== 'pending'
                    ? 'bg-success/50'
                    : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Animated progress component for roadmap generation.
 * Displays the current generation phase with animated transitions,
 * progress visualization, and step indicators.
 */
export function RoadmapGenerationProgress({
  generationStatus,
  className,
  onStop
}: RoadmapGenerationProgressProps) {
  const { phase, progress, message, error } = generationStatus;
  const reducedMotion = useReducedMotion();
  const [isStopping, setIsStopping] = useState(false);

  /**
   * Handle stop button click with error handling and double-click prevention
   */
  const handleStopClick = async () => {
    if (!onStop || isStopping) return;

    setIsStopping(true);
    try {
      await onStop();
    } catch (err) {
      console.error('Failed to stop generation:', err);
    } finally {
      setIsStopping(false);
    }
  };

  // Don't render anything for idle phase
  if (phase === 'idle') {
    return null;
  }

  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;
  const isActivePhase = phase !== 'complete' && phase !== 'error';

  // Animation values that respect reduced motion preference
  const pulseAnimation = reducedMotion
    ? {}
    : {
        scale: [1, 1.1, 1],
        opacity: [1, 0.8, 1],
      };

  const pulseTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 1.5,
        repeat: isActivePhase ? Infinity : 0,
        ease: 'easeInOut' as const,
      };

  const dotAnimation = reducedMotion
    ? { scale: 1, opacity: 1 }
    : {
        scale: [1, 1.5, 1],
        opacity: [1, 0.5, 1],
      };

  const dotTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 1,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      };

  const indeterminateAnimation = reducedMotion
    ? { x: '150%' }
    : { x: ['-100%', '400%'] };

  const indeterminateTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut' as const,
      };

  return (
    <div className={cn('space-y-4 p-6 rounded-xl bg-card border', className)}>
      {/* Header with Stop button */}
      {isActivePhase && onStop && (
        <div className="flex justify-end mb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopClick}
                disabled={isStopping}
              >
                <Square className="h-4 w-4 mr-1" />
                {isStopping ? 'Stopping...' : 'Stop'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop generation</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Main phase display */}
      <div className="flex flex-col items-center text-center space-y-3">
        {/* Animated icon with pulsing animation for active phase */}
        <div className="relative">
          <motion.div
            className={cn('p-4 rounded-full', config.bgColor)}
            animate={isActivePhase ? pulseAnimation : {}}
            transition={pulseTransition}
          >
            <Icon className={cn('h-8 w-8', config.color.replace('bg-', 'text-'))} />
          </motion.div>
          {/* Pulsing activity indicator dot for active phase */}
          {isActivePhase && (
            <motion.div
              className={cn('absolute top-0 right-0 h-3 w-3 rounded-full', config.color)}
              animate={dotAnimation}
              transition={dotTransition}
            />
          )}
        </div>

        {/* Phase label and description */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-1"
          >
            <h3 className="text-lg font-semibold">{config.label}</h3>
            <p className="text-sm text-muted-foreground">{config.description}</p>
            {message && message !== config.description && (
              <p className="text-xs text-muted-foreground mt-1">{message}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      {isActivePhase && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-xs font-medium">{progress}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-border">
            {progress > 0 ? (
              // Determinate progress bar
              <motion.div
                className={cn('h-full rounded-full', config.color)}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            ) : (
              // Indeterminate progress bar when progress is 0
              <motion.div
                className={cn('absolute h-full w-1/3 rounded-full', config.color)}
                animate={indeterminateAnimation}
                transition={indeterminateTransition}
              />
            )}
          </div>
        </div>
      )}

      {/* Phase steps indicator */}
      <PhaseStepsIndicator currentPhase={phase} reducedMotion={reducedMotion} />

      {/* Error display - shows whenever error is present, regardless of phase */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error-display"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="p-3 bg-destructive/10 rounded-md"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
