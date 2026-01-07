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
 */
export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center">
      {steps.map((step, index) => {
        const isCompleted = step.completed;
        const isCurrent = index === currentStep;
        const isUpcoming = index > currentStep;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step indicator circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-200',
                  isCompleted && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && !isCompleted && 'border-primary bg-background text-primary',
                  isUpcoming && 'border-muted-foreground/40 bg-background text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {/* Step label below circle */}
              <span
                className={cn(
                  'mt-2 text-xs font-medium text-center max-w-[80px] truncate',
                  isCompleted && 'text-primary',
                  isCurrent && !isCompleted && 'text-primary',
                  isUpcoming && 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line (not after last step) */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-12 transition-colors duration-200',
                  step.completed ? 'bg-primary' : 'bg-muted-foreground/40'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
