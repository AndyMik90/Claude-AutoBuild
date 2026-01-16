import { useState, useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { cn } from '../lib/utils';
import { addProject } from '../stores/project-store';
import { WizardProgress } from './onboarding/WizardProgress';
import type { WizardStep } from './onboarding/WizardProgress';
import type { Project } from '../../shared/types';
import type { RemoteConfig } from './remote-setup/types';
import { ChooseStep } from './wizard-steps/ChooseStep';
import { CreateFormStep } from './wizard-steps/CreateFormStep';
import { CompletionStep } from './wizard-steps/CompletionStep';
import { GitHubOAuthFlow } from './project-settings/GitHubOAuthFlow';
import { GitLabOAuthFlow } from './project-settings/GitLabOAuthFlow';
import { GitHubRepoConfigStep } from './remote-setup/GitHubRepoConfigStep';
import { GitLabRepoConfigStep } from './remote-setup/GitLabRepoConfigStep';
import type { Owner } from './remote-setup/types';

type WizardStepId = 'choose' | 'create-form' | 'service-auth' | 'repo-config' | 'complete';

// Step configuration with translation keys
const WIZARD_STEPS: { id: WizardStepId; labelKey: string }[] = [
  { id: 'choose', labelKey: 'wizard.steps.choose' },
  { id: 'create-form', labelKey: 'wizard.steps.createForm' },
  { id: 'service-auth', labelKey: 'wizard.steps.serviceAuth' },
  { id: 'repo-config', labelKey: 'wizard.steps.repoConfig' },
  { id: 'complete', labelKey: 'wizard.steps.complete' }
];

interface ProjectCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded?: (project: Project, needsInit: boolean) => void;
}

/**
 * Unified project creation wizard that combines AddProjectModal and RemoteSetupModal
 * into a single cohesive multi-step flow with progress indication.
 */
export function ProjectCreationWizard({
  open,
  onOpenChange,
  onProjectAdded
}: ProjectCreationWizardProps) {
  const { t } = useTranslation('dialogs');

  // Step management
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepId>>(new Set());

  // Get current step ID
  const currentStepId = WIZARD_STEPS[currentStepIndex].id;

  // Project data
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');

  // Remote config
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>({
    service: null,
    enabled: false
  });

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth state
  const [authUsername, setAuthUsername] = useState<string | null>(null);
  const [githubOrgs, setGithubOrgs] = useState<Array<{ login: string; avatarUrl?: string }>>([]);
  const [gitlabGroups, setGitlabGroups] = useState<Array<{ id: number; name: string; path: string; fullPath: string }>>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCurrentStepIndex(0);
      setCompletedSteps(new Set());
      setProjectName('');
      setProjectLocation('');
      setError(null);
      setRemoteConfig({ service: null, enabled: false });
      setAuthUsername(null);
      setGithubOrgs([]);
      setGitlabGroups([]);
    }
  }, [open]);

  // Load default location on mount
  useEffect(() => {
    const loadDefaultLocation = async () => {
      try {
        const defaultDir = await window.electronAPI.getDefaultProjectLocation();
        if (defaultDir) {
          setProjectLocation(defaultDir);
        }
      } catch {
        // Ignore - will just be empty
      }
    };
    loadDefaultLocation();
  }, []);

  // Get visible steps (hide auth/repo-config if remote is skipped)
  const getVisibleSteps = () => {
    if (!remoteConfig.enabled || currentStepId === 'complete') {
      return WIZARD_STEPS.filter(s => s.id !== 'service-auth' && s.id !== 'repo-config');
    }
    return WIZARD_STEPS;
  };

  const visibleSteps = getVisibleSteps();

  // Build step data for progress indicator
  const steps: WizardStep[] = visibleSteps.map((step, index) => ({
    id: step.id,
    label: t(step.labelKey),
    completed: completedSteps.has(step.id) || index < currentStepIndex
  }));

  // Adjust step index for progress (based on visible steps)
  const getProgressIndex = () => {
    if (!remoteConfig.enabled) return 0; // Only show choose and complete

    const visibleIds = visibleSteps.map(s => s.id);
    const currentIndex = visibleIds.indexOf(currentStepId);

    // Don't show progress for choose or complete steps
    if (currentStepId === 'choose' || currentStepId === 'complete') return -1;

    // Adjust index (exclude choose from progress)
    return currentIndex - 1;
  };

  const progressIndex = getProgressIndex();

  // Navigation handlers
  const goToNextStep = () => {
    // Mark current step as completed
    setCompletedSteps(prev => new Set(prev).add(currentStepId));

    // Special handling: if skip selected, jump to complete
    if (currentStepId === 'create-form' && !remoteConfig.enabled) {
      setCurrentStepIndex(WIZARD_STEPS.findIndex(s => s.id === 'complete'));
      handleCreateProject();
      return;
    }

    // Standard next step
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleOpenExisting = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        const project = await addProject(path);
        if (project) {
          // Auto-detect and save the main branch for the project
          try {
            const mainBranchResult = await window.electronAPI.detectMainBranch(path);
            if (mainBranchResult.success && mainBranchResult.data) {
              await window.electronAPI.updateProjectSettings(project.id, {
                mainBranch: mainBranchResult.data
              });
            }
          } catch {
            // Non-fatal - main branch can be set later in settings
          }
          onProjectAdded?.(project, !project.autoBuildPath);
          onOpenChange(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToOpen'));
    }
  };

  const handleSelectLocation = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setProjectLocation(path);
      }
    } catch {
      // User cancelled - ignore
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setError(t('addProject.nameRequired'));
      return;
    }
    if (!projectLocation.trim()) {
      setError(t('addProject.locationRequired'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create the project folder (always initialize git)
      const result = await window.electronAPI.createProjectFolder(
        projectLocation,
        projectName.trim(),
        true // Always init git for new projects
      );

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to create project folder');
        return;
      }

      // Add the project to our store
      const project = await addProject(result.data.path);
      if (project) {
        // For new projects, set main branch (git is always initialized)
        try {
          const mainBranchResult = await window.electronAPI.detectMainBranch(result.data.path);
          if (mainBranchResult.success && mainBranchResult.data) {
            await window.electronAPI.updateProjectSettings(project.id, {
              mainBranch: mainBranchResult.data
            });
          }
        } catch {
          // Non-fatal - main branch can be set later in settings
        }

        // Create remote if configured
        if (remoteConfig.enabled && remoteConfig.service) {
          try {
            const sanitizedProjectName = projectName.trim()
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-_]/g, '')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');

            if (remoteConfig.service === 'gitlab') {
              if (remoteConfig.gitlabAction === 'link' && remoteConfig.gitlabExistingProject) {
                // Link to existing GitLab project
                const linkResult = await window.electronAPI.linkGitLabProject(
                  result.data.path,
                  remoteConfig.gitlabExistingProject,
                  remoteConfig.gitlabInstanceUrl || undefined
                );

                if (!linkResult.success) {
                  console.warn('Failed to link GitLab project:', linkResult.error);
                }
              } else {
                // Create new GitLab project
                const createResult = await window.electronAPI.createGitLabProject(
                  sanitizedProjectName,
                  {
                    description: 'Created with Auto Claude',
                    visibility: remoteConfig.gitlabVisibility,
                    projectPath: result.data.path,
                    namespacePath: remoteConfig.gitlabNamespace,
                    instanceUrl: remoteConfig.gitlabInstanceUrl || undefined
                  }
                );

                if (createResult.success && createResult.data) {
                  // Add remote to local git repository
                  await window.electronAPI.addGitLabRemote(
                    result.data.path,
                    createResult.data.pathWithNamespace,
                    remoteConfig.gitlabInstanceUrl || undefined
                  );
                } else {
                  console.warn('Failed to create GitLab remote:', createResult.error);
                }
              }
            } else if (remoteConfig.service === 'github') {
              if (remoteConfig.githubAction === 'link' && remoteConfig.githubExistingRepo) {
                // Link to existing GitHub repository
                const linkResult = await window.electronAPI.addGitRemote(
                  result.data.path,
                  remoteConfig.githubExistingRepo
                );

                if (!linkResult.success) {
                  console.warn('Failed to link GitHub repository:', linkResult.error);
                }
              } else {
                // Create new GitHub repository
                const createResult = await window.electronAPI.createGitHubRepo(
                  sanitizedProjectName,
                  {
                    description: 'Created with Auto Claude',
                    isPrivate: remoteConfig.githubVisibility === 'private',
                    projectPath: result.data.path,
                    owner: remoteConfig.githubOwner
                  }
                );

                if (!createResult.success) {
                  console.warn('Failed to create GitHub remote:', createResult.error);
                }
              }
            }
          } catch (err) {
            // Remote creation failed, but project was created - show warning
            console.warn('Failed to create remote:', err);
          }
        }

        // Mark complete step as done
        setCompletedSteps(prev => new Set(prev).add('complete'));

        onProjectAdded?.(project, true); // New projects always need init
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToCreate'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleDone = () => {
    onOpenChange(false);
  };

  // Render step content based on current step
  const renderStepContent = () => {
    switch (currentStepId) {
      case 'choose':
        return renderChooseStep();
      case 'create-form':
        return renderCreateForm();
      case 'service-auth':
        return renderServiceAuthStep();
      case 'repo-config':
        return renderRepoConfigStep();
      case 'complete':
        return renderCompleteStep();
      default:
        return null;
    }
  };

  // Render step components
  const renderChooseStep = () => {
    return (
      <ChooseStep
        onOpenExisting={handleOpenExisting}
        onCreateNew={() => setCurrentStepIndex(WIZARD_STEPS.findIndex(s => s.id === 'create-form'))}
      />
    );
  };

  const renderCreateForm = () => {
    return (
      <CreateFormStep
        projectName={projectName}
        setProjectName={setProjectName}
        projectLocation={projectLocation}
        setProjectLocation={setProjectLocation}
        remoteConfig={remoteConfig}
        setRemoteConfig={setRemoteConfig}
        onNext={goToNextStep}
        onBrowse={handleSelectLocation}
        isCreating={isCreating}
      />
    );
  };

  const renderCompleteStep = () => {
    const projectPath = projectLocation
      ? `${projectLocation}/${projectName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')}`
      : '';

    return (
      <CompletionStep
        projectName={projectName}
        projectPath={projectPath}
        remoteUrl={undefined} // TODO: Extract from remote config if needed
      />
    );
  };

  // OAuth handlers
  const handleGitHubAuthSuccess = async (token: string, username?: string) => {
    setAuthUsername(username || null);
    // Load GitHub orgs after auth
    try {
      const orgsResult = await window.electronAPI.listGitHubOrgs();
      if (orgsResult.success && orgsResult.data) {
        setGithubOrgs(orgsResult.data.orgs || []);
      }
    } catch {
      // Non-fatal
    }
    // Move to repo config step
    setCurrentStepIndex(WIZARD_STEPS.findIndex(s => s.id === 'repo-config'));
  };

  const handleGitLabAuthSuccess = async (token: string, username?: string) => {
    setAuthUsername(username || null);
    // Load GitLab groups after auth
    try {
      const groupsResult = await window.electronAPI.listGitLabGroups();
      if (groupsResult.success && groupsResult.data) {
        setGitlabGroups(groupsResult.data.groups || []);
      }
    } catch {
      // Non-fatal
    }
    // Move to repo config step
    setCurrentStepIndex(WIZARD_STEPS.findIndex(s => s.id === 'repo-config'));
  };

  const renderServiceAuthStep = () => {
    if (remoteConfig.service === 'github') {
      return (
        <GitHubOAuthFlow
          onSuccess={handleGitHubAuthSuccess}
          onCancel={handleCancel}
        />
      );
    }
    if (remoteConfig.service === 'gitlab') {
      return (
        <GitLabOAuthFlow
          instanceUrl={remoteConfig.gitlabInstanceUrl}
          onSuccess={handleGitLabAuthSuccess}
          onCancel={handleCancel}
        />
      );
    }
    return null;
  };

  // Repo config handlers
  const handleGitHubRepoConfigComplete = async (config: {
    action?: 'create' | 'link';
    visibility?: 'private' | 'public';
    owner?: string;
    existingRepo?: string;
  }) => {
    // Update remote config with GitHub settings
    setRemoteConfig(prev => ({
      ...prev,
      githubAction: config.action || 'create',
      githubVisibility: config.visibility || 'private',
      githubOwner: config.owner,
      githubExistingRepo: config.existingRepo
    }));
    // Proceed to create project
    await handleCreateProject();
  };

  const handleGitLabRepoConfigComplete = async (config: {
    action?: 'create' | 'link';
    visibility?: 'private' | 'internal' | 'public';
    namespace?: string;
    existingProject?: string;
    instanceUrl?: string;
  }) => {
    // Update remote config with GitLab settings
    setRemoteConfig(prev => ({
      ...prev,
      gitlabAction: config.action || 'create',
      gitlabVisibility: config.visibility || 'private',
      gitlabNamespace: config.namespace,
      gitlabExistingProject: config.existingProject,
      gitlabInstanceUrl: config.instanceUrl
    }));
    // Proceed to create project
    await handleCreateProject();
  };

  const renderRepoConfigStep = () => {
    const sanitizedProjectName = projectName.trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (remoteConfig.service === 'github') {
      return (
        <GitHubRepoConfigStep
          projectName={sanitizedProjectName}
          config={{
            visibility: remoteConfig.githubVisibility,
            action: remoteConfig.githubAction,
            existingRepo: remoteConfig.githubExistingRepo,
            owner: remoteConfig.githubOwner
          }}
          onChange={(updates) => setRemoteConfig(prev => ({ ...prev, ...updates }))}
          onComplete={handleGitHubRepoConfigComplete}
          onBack={goToPreviousStep}
          githubUsername={authUsername || undefined}
          organizations={githubOrgs.map((org) => ({
            id: org.login,
            name: org.login,
            path: org.login
          }))}
          isLoadingOrgs={false}
        />
      );
    }
    if (remoteConfig.service === 'gitlab') {
      return (
        <GitLabRepoConfigStep
          projectName={sanitizedProjectName}
          config={{
            instanceUrl: remoteConfig.gitlabInstanceUrl,
            namespace: remoteConfig.gitlabNamespace,
            visibility: remoteConfig.gitlabVisibility,
            action: remoteConfig.gitlabAction,
            existingProject: remoteConfig.gitlabExistingProject
          }}
          onChange={(updates) => setRemoteConfig(prev => ({ ...prev, ...updates }))}
          onComplete={handleGitLabRepoConfigComplete}
          onBack={goToPreviousStep}
          gitlabUsername={authUsername || undefined}
          groups={gitlabGroups.map((g) => ({
            id: g.id,
            name: g.name,
            path: g.path,
            fullPath: g.fullPath
          }))}
          isLoadingGroups={false}
        />
      );
    }
    return null;
  };

  // Render navigation buttons
  const renderNavigation = () => {
    // OAuth and repo config steps have their own navigation
    if (currentStepId === 'service-auth' || currentStepId === 'repo-config') {
      return null;
    }

    return (
      <>
        {/* Back button - steps 2-5 */}
        {currentStepIndex > 0 && currentStepId !== 'complete' && (
          <Button variant="outline" onClick={goToPreviousStep} disabled={isCreating}>
            {t('wizard.navigation.back')}
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Cancel - not on complete */}
        {currentStepId !== 'complete' && (
          <Button variant="ghost" onClick={handleCancel} disabled={isCreating}>
            {t('wizard.navigation.cancel')}
          </Button>
        )}

        {/* Primary action - varies by step */}
        {renderPrimaryAction()}
      </>
    );
  };

  const renderPrimaryAction = () => {
    switch (currentStepId) {
      case 'choose':
        // No primary action - cards handle navigation
        return null;
      case 'create-form':
        return (
          <Button onClick={goToNextStep} disabled={isCreating}>
            {remoteConfig.enabled ? t('wizard.navigation.next') : t('wizard.navigation.create')}
          </Button>
        );
      case 'complete':
        return (
          <Button onClick={handleDone}>
            {t('wizard.navigation.done')}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t(`wizard.steps.${currentStepId}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`wizard.steps.${currentStepId}.description`)}
          </DialogDescription>

          {/* Progress indicator - show for steps 2-4 */}
          {progressIndex >= 0 && (
            <div className="mt-6">
              <WizardProgress currentStep={progressIndex} steps={steps} />
            </div>
          )}
        </DialogHeader>

        {/* Step content */}
        {renderStepContent()}

        {/* Error display */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mt-2" role="alert">
            {error}
          </div>
        )}

        {/* Footer navigation */}
        <DialogFooter>
          {renderNavigation()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
