import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface WizardStep {
  id: string;
  label: string;
  completed: boolean;
}

interface WizardProgressProps {
  currentStep: number;
  steps: WizardStep[];
}

/**
 * Step progress indicator component for the onboarding wizard.
 * Displays numbered circles connected by lines, with visual states
 * for completed, current, and upcoming steps.
 *
 * Uses responsive layout to prevent expanding beyond container.
 */
export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  // For 2-3 steps, show compact layout; for 4+ steps, use tighter spacing
  const isCompact = steps.length <= 3;

  return (
    <div className="w-full overflow-hidden">
      <div className={cn(
        'flex items-center justify-center w-full gap-1',
        isCompact ? 'px-4' : 'px-2'
      )}>
        {steps.map((step, index) => {
          const isCompleted = step.completed;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step indicator circle with label */}
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200',
                    isCompleted && 'border-primary bg-primary text-primary-foreground',
                    isCurrent && !isCompleted && 'border-primary bg-background text-primary',
                    isUpcoming && 'border-muted-foreground/40 bg-background text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {/* Step label below circle - truncated if needed */}
                <span
                  className={cn(
                    'mt-1.5 text-[10px] font-medium text-center truncate w-full',
                    isCompleted && 'text-primary',
                    isCurrent && !isCompleted && 'text-primary',
                    isUpcoming && 'text-muted-foreground'
                  )}
                  title={step.label}
                >
                  {step.label}
                </span>
              </div>

              {/* Connecting line (not after last step) */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 shrink-0 transition-colors duration-200',
                    isCompact ? 'w-8 mx-2' : 'w-6 mx-1',
                    step.completed ? 'bg-primary' : 'bg-muted-foreground/40'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
