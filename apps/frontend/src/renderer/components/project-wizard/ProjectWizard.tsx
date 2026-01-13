import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder } from 'lucide-react';
import {
  FullScreenDialog,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogTitle,
  FullScreenDialogDescription
} from '../ui/full-screen-dialog';
import { ScrollArea } from '../ui/scroll-area';
import { WizardProgress, WizardStep } from '../onboarding/WizardProgress';
import { ProjectStep } from './ProjectStep';
import { ProjectNewStep } from './ProjectNewStep';
import { GitStep } from './GitStep';
import { AutoClaudeStep } from './AutoClaudeStep';
import { GitHubStep } from './GitHubStep';
import { GitLabStep } from './GitLabStep';
import { ProviderSelectionStep } from './ProviderSelectionStep';
import { CompletionStep } from './CompletionStep';
import type { Project } from '../../../shared/types';

// Wizard step identifiers
type WizardStepId = 'project' | 'project-new' | 'git' | 'provider' | 'autoclaude' | 'github' | 'gitlab' | 'complete';

// Step configuration with translation keys
const WIZARD_STEPS: { id: WizardStepId; labelKey: string; optional: boolean }[] = [
  { id: 'project', labelKey: 'steps.project', optional: false },
  { id: 'git', labelKey: 'steps.git', optional: true },
  { id: 'autoclaude', labelKey: 'steps.autoclaude', optional: false },
  { id: 'github', labelKey: 'steps.github', optional: true },
  { id: 'gitlab', labelKey: 'steps.gitlab', optional: true },
  { id: 'complete', labelKey: 'steps.complete', optional: false }
];

// Steps that can be shown (based on user choices)
type VisibleStepId = Exclude<WizardStepId, 'project-new'>;

interface ProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded?: (project: Project) => void;
}

interface WizardState {
  // Project data
  project: Project | null;
  projectPath: string | null;
  projectName: string | null;

  // Git state
  gitInitialized: boolean;

  // Auto Claude state
  autoClaudeInitialized: boolean;

  // GitHub state
  githubConfigured: boolean;
  githubData: { token: string; repo: string; branch: string } | null;

  // GitLab state
  gitlabConfigured: boolean;
  gitlabData: { token: string; project: string; branch: string } | null;

  // Which integration steps to show
  showGitHub: boolean;
  showGitLab: boolean;
}

/**
 * Main project wizard component.
 * Provides a full-screen, multi-step wizard experience for setting up new projects.
 *
 * Features:
 * - Step progress indicator
 * - Navigation between steps (next, back, skip)
 * - Optional steps for git and integrations
 * - Unified project setup experience
 */
export function ProjectWizard({
  open,
  onOpenChange,
  onProjectAdded
}: ProjectWizardProps) {
  const { t } = useTranslation('project-wizard');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepId>>(new Set());

  // Wizard state
  const [state, setState] = useState<WizardState>({
    project: null,
    projectPath: null,
    projectName: null,
    gitInitialized: false,
    autoClaudeInitialized: false,
    githubConfigured: false,
    githubData: null,
    gitlabConfigured: false,
    gitlabData: null,
    showGitHub: false,
    showGitLab: false
  });

  // Build visible steps based on state
  const getVisibleSteps = (): VisibleStepId[] => {
    const steps: VisibleStepId[] = ['project', 'git', 'autoclaude', 'complete'];
    // Provider step is shown dynamically after git based on showGitHub/showGitLab state
    // Integration steps are added after autoclaude
    if (state.showGitHub) {
      steps.splice(3, 0, 'github');
    }
    if (state.showGitLab) {
      steps.splice(3, 0, 'gitlab');
    }
    return steps;
  };

  const visibleSteps = getVisibleSteps();
  // Get current step ID - can be any WizardStepId including project-new and provider
  const getAllSteps = (): WizardStepId[] => {
    const baseSteps: WizardStepId[] = ['project', 'project-new', 'git', 'provider', 'autoclaude', 'complete'];
    if (state.showGitHub) baseSteps.splice(5, 0, 'github');
    if (state.showGitLab) baseSteps.splice(5, 0, 'gitlab');
    return baseSteps;
  };
  const allSteps = getAllSteps();
  const currentStepId = allSteps[currentStepIndex];

  // Find the current step's index in visibleSteps for progress indicator
  const currentVisibleStepIndex = visibleSteps.indexOf(currentStepId as VisibleStepId);

  // Build step data for progress indicator
  const steps: WizardStep[] = visibleSteps.map((stepId, index) => {
    const stepConfig = WIZARD_STEPS.find(s => s.id === stepId);
    return {
      id: stepId,
      label: stepConfig ? t(stepConfig.labelKey) : stepId,
      completed: completedSteps.has(stepId) || index < currentVisibleStepIndex
    };
  });

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    // Mark current step as completed
    setCompletedSteps(prev => new Set(prev).add(currentStepId));

    if (currentStepIndex < allSteps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [currentStepIndex, currentStepId, allSteps.length]);

  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  // Step completion handlers
  const handleProjectSelected = useCallback((project: Project, needsGit: boolean, needsAutoClaude: boolean) => {
    setState(prev => ({
      ...prev,
      project,
      projectPath: project.path,
      showGitHub: false, // Will be set by provider selection
      showGitLab: false  // Will be set by provider selection
    }));

    // Always go to git step first (index 2 in allSteps)
    setCurrentStepIndex(2);
  }, []);

  const handleProjectCreated = useCallback((project: Project, initWithGit: boolean) => {
    setState(prev => ({
      ...prev,
      project,
      projectPath: project.path,
      projectName: project.name,
      gitInitialized: initWithGit
    }));

    // Move to git step (will show already initialized state)
    goToNextStep();
  }, [goToNextStep]);

  const handleGitComplete = useCallback(() => {
    setState(prev => ({ ...prev, gitInitialized: true }));
    goToNextStep();
  }, [goToNextStep]);

  const handleGitSkip = useCallback(() => {
    goToNextStep();
  }, [goToNextStep]);

  const handleProviderSelection = useCallback((selection: { github: boolean; gitlab: boolean }) => {
    setState(prev => ({
      ...prev,
      showGitHub: selection.github,
      showGitLab: selection.gitlab
    }));

    // Move to autoclaude step directly since provider is at index 3 and autoclaude is at index 4
    setCurrentStepIndex(4);
  }, []);

  const handleAutoClaudeComplete = useCallback(() => {
    setState(prev => ({ ...prev, autoClaudeInitialized: true }));
    goToNextStep();
  }, [goToNextStep]);

  const handleAutoClaudeSkip = useCallback(() => {
    goToNextStep();
  }, [goToNextStep]);

  const handleGitHubComplete = useCallback((data: { token: string; repo: string; branch: string }) => {
    setState(prev => ({
      ...prev,
      githubConfigured: true,
      githubData: data
    }));
    goToNextStep();
  }, [goToNextStep]);

  const handleGitHubSkip = useCallback(() => {
    setState(prev => ({ ...prev, githubConfigured: false }));
    goToNextStep();
  }, [goToNextStep]);

  const handleGitLabComplete = useCallback((data: { token: string; project: string; branch: string }) => {
    setState(prev => ({
      ...prev,
      gitlabConfigured: true,
      gitlabData: data
    }));
    goToNextStep();
  }, [goToNextStep]);

  const handleGitLabSkip = useCallback(() => {
    setState(prev => ({ ...prev, gitlabConfigured: false }));
    goToNextStep();
  }, [goToNextStep]);

  const handleComplete = useCallback(() => {
    // Trigger callback with the created project
    if (state.project && onProjectAdded) {
      onProjectAdded(state.project);
    }
    onOpenChange(false);
  }, [state.project, onProjectAdded, onOpenChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Reset wizard when closed
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      // Reset state
      setCurrentStepIndex(0);
      setCompletedSteps(new Set());
      setState({
        project: null,
        projectPath: null,
        projectName: null,
        gitInitialized: false,
        autoClaudeInitialized: false,
        githubConfigured: false,
        githubData: null,
        gitlabConfigured: false,
        gitlabData: null,
        showGitHub: false,
        showGitLab: false
      });
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case 'project':
        return (
          <ProjectStep
            onNext={handleProjectSelected}
            onCreateNew={() => setCurrentStepIndex(1)} // Go to project-new step
            onBack={handleClose}
          />
        );
      case 'project-new':
        return (
          <ProjectNewStep
            onProjectCreated={handleProjectCreated}
            onBack={() => setCurrentStepIndex(0)}
          />
        );
      case 'git':
        return (
          <GitStep
            project={state.project}
            gitInitialized={state.gitInitialized}
            onComplete={handleGitComplete}
            onSkip={handleGitSkip}
            onBack={goToPreviousStep}
          />
        );
      case 'provider':
        return (
          <ProviderSelectionStep
            onComplete={handleProviderSelection}
            onBack={goToPreviousStep}
          />
        );
      case 'autoclaude':
        return (
          <AutoClaudeStep
            project={state.project}
            autoClaudeInitialized={state.autoClaudeInitialized}
            onComplete={handleAutoClaudeComplete}
            onSkip={handleAutoClaudeSkip}
            onBack={goToPreviousStep}
          />
        );
      case 'github':
        return (
          <GitHubStep
            project={state.project}
            onComplete={handleGitHubComplete}
            onSkip={handleGitHubSkip}
            onBack={goToPreviousStep}
          />
        );
      case 'gitlab':
        return (
          <GitLabStep
            project={state.project}
            onComplete={handleGitLabComplete}
            onSkip={handleGitLabSkip}
            onBack={goToPreviousStep}
          />
        );
      case 'complete':
        return (
          <CompletionStep
            project={state.project}
            gitInitialized={state.gitInitialized}
            autoClaudeInitialized={state.autoClaudeInitialized}
            githubConfigured={state.githubConfigured}
            gitlabConfigured={state.gitlabConfigured}
            onComplete={handleComplete}
          />
        );
      default:
        return null;
    }
  };

  // Check if we should show progress indicator (hide for project, project-new, provider, and complete steps)
  const showProgress = currentStepId !== 'project' && currentStepId !== 'project-new' && currentStepId !== 'provider' && currentStepId !== 'complete';

  return (
    <FullScreenDialog open={open} onOpenChange={handleOpenChange}>
      <FullScreenDialogContent>
        <FullScreenDialogHeader>
          <FullScreenDialogTitle className="flex items-center gap-3">
            <Folder className="h-6 w-6" />
            {t('wizard.title')}
          </FullScreenDialogTitle>
          <FullScreenDialogDescription>
            {t('wizard.description')}
          </FullScreenDialogDescription>

          {/* Progress indicator */}
          {showProgress && (
            <div className="mt-6">
              <WizardProgress currentStep={currentVisibleStepIndex} steps={steps} />
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
