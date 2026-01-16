import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { ServiceSelectStep } from './remote-setup/ServiceSelectStep';
import { GitLabOAuthFlow } from './project-settings/GitLabOAuthFlow';
import { GitHubOAuthFlow } from './project-settings/GitHubOAuthFlow';
import { GitHubRepoConfigStep } from './remote-setup/GitHubRepoConfigStep';
import { GitLabRepoConfigStep } from './remote-setup/GitLabRepoConfigStep';
import type { RemoteConfig, RemoteService, Owner, RemoteAction, GitHubVisibility, GitLabVisibility } from './remote-setup/types';

type Step = 'service-select' | 'auth' | 'repo-config';

// GitHub-specific config state shape
interface GitHubConfigState {
  owner?: string;
  visibility?: GitHubVisibility;
  action?: RemoteAction;
  existingRepo?: string;
}

// GitLab-specific config state shape
interface GitLabConfigState {
  instanceUrl?: string;
  namespace?: string;
  visibility?: GitLabVisibility;
  action?: RemoteAction;
  existingProject?: string;
}

interface RemoteSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectLocation: string;
  onComplete: (config: RemoteConfig) => void;
  /** Pre-selected service to skip service selection step */
  initialService?: RemoteService | null;
}

/**
 * RemoteSetupModal - Main orchestrator for remote repository setup
 *
 * 3-step flow:
 * 1. Service Selection (GitHub / GitLab / None)
 * 2. Authentication (OAuth flow)
 * 3. Repository Configuration (Create/Link, Owner, Visibility)
 */
export function RemoteSetupModal({
  open,
  onOpenChange,
  projectName,
  projectLocation,
  onComplete,
  initialService,
}: RemoteSetupModalProps) {
  const { t } = useTranslation('dialogs');
  const [step, setStep] = useState<Step>(
    initialService ? 'auth' : 'service-select'
  );
  const [selectedService, setSelectedService] = useState<RemoteService | null>(
    initialService ?? null
  );

  // Auth state
  const [authUsername, setAuthUsername] = useState<string | null>(null);

  // GitHub state
  const [githubOrgs, setGithubOrgs] = useState<Owner[]>([]);
  const [isLoadingGithubOrgs, setIsLoadingGithubOrgs] = useState(false);

  // GitLab state
  const [gitlabGroups, setGitlabGroups] = useState<Owner[]>([]);
  const [isLoadingGitlabGroups, setIsLoadingGitlabGroups] = useState(false);

  // Config state - using service-specific types for onChange compatibility
  const [githubConfig, setGithubConfig] = useState<GitHubConfigState>({});
  const [gitlabConfig, setGitlabConfig] = useState<GitLabConfigState>({});

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      const service = initialService ?? null;
      setStep(service ? 'auth' : 'service-select');
      setSelectedService(service);
      setAuthUsername(null);
      setGithubOrgs([]);
      setGitlabGroups([]);
      setGithubConfig({});
      setGitlabConfig({});
    }
  }, [open, initialService]);

  const handleServiceSelect = (service: RemoteService | null) => {
    if (service === null) {
      // Skip remote setup
      onComplete({ service: null, enabled: false });
      onOpenChange(false);
      return;
    }

    setSelectedService(service);
    setStep('auth');
  };

  const handleGitHubAuthComplete = async (token: string, username?: string) => {
    setAuthUsername(username || null);

    // Load GitHub organizations
    setIsLoadingGithubOrgs(true);
    try {
      // TODO: Implement listGitHubOrgs if not available
      // For now, we'll set an empty array
      setGithubOrgs([]);
    } catch (err) {
      console.error('Failed to load GitHub organizations:', err);
    } finally {
      setIsLoadingGithubOrgs(false);
    }

    setStep('repo-config');
  };

  const handleGitLabAuthComplete = async (token: string, username?: string) => {
    setAuthUsername(username || null);

    // Load GitLab groups
    setIsLoadingGitlabGroups(true);
    try {
      const result = await window.electronAPI.listGitLabGroups();
      if (result.success && result.data?.groups) {
        setGitlabGroups(
          result.data.groups.map((g) => ({
            id: g.id,
            name: g.name,
            path: g.fullPath,
            avatarUrl: g.avatarUrl,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load GitLab groups:', err);
    } finally {
      setIsLoadingGitlabGroups(false);
    }

    setStep('repo-config');
  };

  const handleGitHubConfigComplete = (config: GitHubConfigState) => {
    const finalConfig: RemoteConfig = {
      service: 'github',
      enabled: true,
      githubOwner: config.owner,
      githubVisibility: config.visibility,
      githubAction: config.action || 'create',
      githubExistingRepo: config.existingRepo,
    };
    onComplete(finalConfig);
    onOpenChange(false);
  };

  const handleGitLabConfigComplete = (config: GitLabConfigState) => {
    const finalConfig: RemoteConfig = {
      service: 'gitlab',
      enabled: true,
      gitlabInstanceUrl: config.instanceUrl,
      gitlabNamespace: config.namespace,
      gitlabVisibility: config.visibility,
      gitlabAction: config.action || 'create',
      gitlabExistingProject: config.existingProject,
    };
    onComplete(finalConfig);
    onOpenChange(false);
  };

  const handleBack = () => {
    setStep('service-select');
    setSelectedService(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'service-select' && t('remoteSetup.title')}
            {step === 'auth' && t('remoteSetup.auth.title', { service: selectedService === 'github' ? 'GitHub' : 'GitLab' })}
            {step === 'repo-config' && t('remoteSetup.repoConfig.title')}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Service Selection */}
        {step === 'service-select' && (
          <ServiceSelectStep onSelect={handleServiceSelect} />
        )}

        {/* Step 2: Authentication */}
        {step === 'auth' && selectedService === 'github' && (
          <GitHubOAuthFlow
            onSuccess={handleGitHubAuthComplete}
            onCancel={handleBack}
          />
        )}

        {step === 'auth' && selectedService === 'gitlab' && (
          <GitLabOAuthFlow
            onSuccess={handleGitLabAuthComplete}
            onCancel={handleBack}
          />
        )}

        {/* Step 3: Repository Configuration */}
        {step === 'repo-config' && selectedService === 'github' && (
          <GitHubRepoConfigStep
            projectName={projectName}
            config={githubConfig}
            onChange={(updates) => setGithubConfig((prev) => ({ ...prev, ...updates }))}
            onComplete={handleGitHubConfigComplete}
            onBack={handleBack}
            githubUsername={authUsername || undefined}
            organizations={githubOrgs}
            isLoadingOrgs={isLoadingGithubOrgs}
          />
        )}

        {step === 'repo-config' && selectedService === 'gitlab' && (
          <GitLabRepoConfigStep
            projectName={projectName}
            config={gitlabConfig}
            onChange={(updates) => setGitlabConfig((prev) => ({ ...prev, ...updates }))}
            onComplete={handleGitLabConfigComplete}
            onBack={handleBack}
            gitlabUsername={authUsername || undefined}
            groups={gitlabGroups}
            isLoadingGroups={isLoadingGitlabGroups}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
