import { useState, useCallback } from 'react';
import { Wand2 } from 'lucide-react';
import {
  FullScreenDialog,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogTitle,
  FullScreenDialogDescription
} from '../ui/full-screen-dialog';
import { ScrollArea } from '../ui/scroll-area';
import { WizardProgress, WizardStep } from './WizardProgress';
import { WelcomeStep } from './WelcomeStep';
import { AuthChoiceStep } from './AuthChoiceStep';
import { OAuthStep } from './OAuthStep';
import { GraphitiStep } from './GraphitiStep';
import { CompletionStep } from './CompletionStep';
import { useSettingsStore } from '../../stores/settings-store';

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTaskCreator?: () => void;
  onOpenSettings?: () => void;
}

// Wizard step identifiers
type WizardStepId = 'welcome' | 'auth-choice' | 'oauth' | 'graphiti' | 'completion';

// Step configuration
const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'auth-choice', label: 'Auth Method' },
  { id: 'oauth', label: 'OAuth' },
  { id: 'graphiti', label: 'Memory' },
  { id: 'completion', label: 'Done' }
];

/**
 * Main onboarding wizard component.
 * Provides a full-screen, multi-step wizard experience for new users
 * to configure their Auto Claude environment.
 *
 * Features:
 * - Step progress indicator
 * - Navigation between steps (next, back, skip)
 * - Persists completion state to settings
 * - Can be re-run from settings
 */
export function OnboardingWizard({
  open,
  onOpenChange,
  onOpenTaskCreator,
  onOpenSettings
}: OnboardingWizardProps) {
  const { updateSettings } = useSettingsStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepId>>(new Set());
  // Track if oauth step was bypassed (API key path chosen)
  const [oauthBypassed, setOauthBypassed] = useState(false);

  // Get current step ID
  const currentStepId = WIZARD_STEPS[currentStepIndex].id;

  // Build step data for progress indicator
  const steps: WizardStep[] = WIZARD_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    completed: completedSteps.has(step.id) || index < currentStepIndex
  }));

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    // Mark current step as completed
    setCompletedSteps(prev => new Set(prev).add(currentStepId));

    // If leaving auth-choice, reset oauth bypassed flag
    if (currentStepId === 'auth-choice') {
      setOauthBypassed(false);
    }

    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [currentStepIndex, currentStepId]);

  const goToPreviousStep = useCallback(() => {
    // If going back from graphiti and oauth was bypassed, go back to auth-choice (skip oauth)
    if (currentStepId === 'graphiti' && oauthBypassed) {
      // Find index of auth-choice step
      const authChoiceIndex = WIZARD_STEPS.findIndex(step => step.id === 'auth-choice');
      setCurrentStepIndex(authChoiceIndex);
      setOauthBypassed(false);
      return;
    }

    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex, currentStepId, oauthBypassed]);

  // Handler for when API key path is chosen - skips oauth step
  const handleSkipToGraphiti = useCallback(() => {
    setOauthBypassed(true);
    setCompletedSteps(prev => new Set(prev).add('auth-choice'));

    // Find index of graphiti step
    const graphitiIndex = WIZARD_STEPS.findIndex(step => step.id === 'graphiti');
    setCurrentStepIndex(graphitiIndex);
  }, []);

  // Reset wizard state (for re-running) - defined before skipWizard/finishWizard that use it
  const resetWizard = useCallback(() => {
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
    setOauthBypassed(false);
  }, []);

  const skipWizard = useCallback(async () => {
    // Mark onboarding as completed and close - save to disk AND update local state
    try {
      const result = await window.electronAPI.saveSettings({ onboardingCompleted: true });
      if (!result?.success) {
        console.error('Failed to save onboarding completion:', result?.error);
      }
    } catch (err) {
      console.error('Error saving onboarding completion:', err);
    }
    updateSettings({ onboardingCompleted: true });
    onOpenChange(false);
    resetWizard();
  }, [updateSettings, onOpenChange, resetWizard]);

  const finishWizard = useCallback(async () => {
    // Mark onboarding as completed - save to disk AND update local state
    try {
      const result = await window.electronAPI.saveSettings({ onboardingCompleted: true });
      if (!result?.success) {
        console.error('Failed to save onboarding completion:', result?.error);
      }
    } catch (err) {
      console.error('Error saving onboarding completion:', err);
    }
    updateSettings({ onboardingCompleted: true });
    onOpenChange(false);
    resetWizard();
  }, [updateSettings, onOpenChange, resetWizard]);

  // Handle opening task creator from within wizard
  const handleOpenTaskCreator = useCallback(() => {
    if (onOpenTaskCreator) {
      // Close wizard first, then open task creator
      onOpenChange(false);
      onOpenTaskCreator();
    }
  }, [onOpenTaskCreator, onOpenChange]);

  // Handle opening settings from completion step
  const handleOpenSettings = useCallback(() => {
    if (onOpenSettings) {
      // Finish wizard first, then open settings
      finishWizard();
      onOpenSettings();
    }
  }, [onOpenSettings, finishWizard]);

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case 'welcome':
        return (
          <WelcomeStep
            onGetStarted={goToNextStep}
            onSkip={skipWizard}
          />
        );
      case 'auth-choice':
        return (
          <AuthChoiceStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSkip={skipWizard}
            onAPIKeyPathComplete={handleSkipToGraphiti}
          />
        );
      case 'oauth':
        return (
          <OAuthStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSkip={skipWizard}
          />
        );
      case 'graphiti':
        return (
          <GraphitiStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSkip={skipWizard}
          />
        );
      case 'completion':
        return (
          <CompletionStep
            onFinish={finishWizard}
            onOpenTaskCreator={handleOpenTaskCreator}
            onOpenSettings={handleOpenSettings}
          />
        );
      default:
        return null;
    }
  };

  // Handle dialog close - ask for confirmation if not completed
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      // If closing before completion, skip the wizard
      skipWizard();
    } else {
      onOpenChange(newOpen);
    }
  }, [skipWizard, onOpenChange]);

  return (
    <FullScreenDialog open={open} onOpenChange={handleOpenChange}>
      <FullScreenDialogContent>
        <FullScreenDialogHeader>
          <FullScreenDialogTitle className="flex items-center gap-3">
            <Wand2 className="h-6 w-6" />
            Setup Wizard
          </FullScreenDialogTitle>
          <FullScreenDialogDescription>
            Configure your Auto Claude environment in a few simple steps
          </FullScreenDialogDescription>

          {/* Progress indicator - show for all steps except welcome and completion */}
          {currentStepId !== 'welcome' && currentStepId !== 'completion' && (
            <div className="mt-6">
              <WizardProgress currentStep={currentStepIndex} steps={steps} />
            </div>
          )}
        </FullScreenDialogHeader>

        <FullScreenDialogBody>
          <ScrollArea className="h-full">
            {renderStepContent()}
          </ScrollArea>
        </FullScreenDialogBody>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}
