import { useState } from 'react';
import { Loader2, Plus, ArrowLeft, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { OwnerSelector } from './OwnerSelector';
import { InstanceUrlInput } from './InstanceUrlInput';
import { VisibilitySelector } from './VisibilitySelector';
import { GitLabProjectSelector } from './GitLabProjectSelector';
import type { Owner, RemoteAction, GitLabVisibility } from './types';

interface GitLabRepoConfigStepProps {
  projectName: string;
  config: {
    instanceUrl?: string;
    namespace?: string;
    visibility?: GitLabVisibility;
    action?: RemoteAction;
    existingProject?: string;
  };
  onChange: (updates: Partial<GitLabRepoConfigStepProps['config']>) => void;
  onComplete: (config: GitLabRepoConfigStepProps['config']) => void;
  onBack: () => void;
  gitlabUsername?: string;
  groups?: Owner[];
  isLoadingGroups?: boolean;
}

/**
 * GitLab project configuration step
 * Handles create/link project with namespace and visibility selection
 */
export function GitLabRepoConfigStep({
  projectName,
  config,
  onChange,
  onComplete,
  onBack,
  gitlabUsername,
  groups = [],
  isLoadingGroups = false,
}: GitLabRepoConfigStepProps) {
  const { t } = useTranslation('dialogs');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    instanceUrl = '',
    namespace = gitlabUsername || '',
    visibility = 'private',
    action = 'create',
    existingProject = '',
  } = config;

  const handleNamespaceSelect = (selected: string) => {
    onChange({ namespace: selected });
  };

  const handleVisibilitySelect = (selected: GitLabVisibility) => {
    onChange({ visibility: selected });
  };

  const handleSetAction = (newAction: RemoteAction) => {
    onChange({ action: newAction });
  };

  const handleComplete = async () => {
    if (action === 'link') {
      if (!existingProject.trim()) {
        setError(t('remoteSetup.repoConfig.gitlab.errorProjectRequired'));
        return;
      }
      // Validate format: group/project or just project
      const format = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/;
      if (!format.test(existingProject.trim())) {
        setError(t('remoteSetup.repoConfig.gitlab.errorInvalidFormat'));
        return;
      }
    } else {
      if (!namespace.trim()) {
        setError(t('remoteSetup.repoConfig.gitlab.errorNamespaceRequired'));
        return;
      }
    }

    setError(null);
    setIsCreating(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      onComplete(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure project');
    } finally {
      setIsCreating(false);
    }
  };

  const sanitizedProjectName = projectName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">Configure GitLab Project</h2>
        <p className="text-sm text-muted-foreground">
          Create a new project or link to an existing one
        </p>
      </div>

      {/* Action Selection */}
      {action === 'create' || action === 'link' ? (
        <>
          {action === 'create' ? (
            <>
              {/* Create New Project Form */}
              <div className="space-y-4">
                {/* Instance URL (optional) */}
                <InstanceUrlInput
                  value={instanceUrl}
                  onChange={(value) => onChange({ instanceUrl: value })}
                  disabled={isCreating}
                  id="instance-url"
                />

                {/* Namespace Selection */}
                {gitlabUsername && (
                  <OwnerSelector
                    type="gitlab"
                    personal={{ id: gitlabUsername, name: gitlabUsername, path: gitlabUsername }}
                    organizations={groups}
                    selected={namespace}
                    onSelect={handleNamespaceSelect}
                    isLoading={isLoadingGroups}
                    disabled={isCreating}
                  />
                )}

                {/* Project Name */}
                <div className="space-y-2">
                  <Label>{t('remoteSetup.repoConfig.projectName')}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {namespace || '...'} /
                    </span>
                    <Input
                      value={sanitizedProjectName}
                      readOnly
                      disabled={isCreating}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from project name
                  </p>
                </div>

                {/* Visibility Selection */}
                <VisibilitySelector
                  type="gitlab"
                  value={visibility}
                  onChange={handleVisibilitySelect}
                  disabled={isCreating}
                />

                {/* Switch to Link Existing */}
                <button
                  onClick={() => handleSetAction('link')}
                  className="text-sm text-primary hover:underline"
                >
                  Or link to existing project
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Link Existing Project Form */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetAction('create')}
                    className="h-auto p-0"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <span className="text-sm text-muted-foreground">Link to existing project</span>
                </div>

                {/* Instance URL */}
                <InstanceUrlInput
                  value={instanceUrl}
                  onChange={(value) => onChange({ instanceUrl: value })}
                  disabled={isCreating}
                  id="link-instance-url"
                />

                {/* Project Selection */}
                <GitLabProjectSelector
                  instanceUrl={instanceUrl}
                  value={existingProject}
                  onChange={(value) => onChange({ existingProject: value })}
                  disabled={isCreating}
                />

                {/* Switch to Create New */}
                <button
                  onClick={() => handleSetAction('create')}
                  className="text-sm text-primary hover:underline"
                >
                  Or create a new project
                </button>
              </div>
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} disabled={isCreating}>
              Back
            </Button>
            <Button onClick={handleComplete} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {action === 'link' ? 'Link Project' : 'Create Project'}
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Initial Action Selection */}
          <div className="grid gap-3">
            <button
              onClick={() => handleSetAction('create')}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left',
                'bg-card hover:bg-accent hover:border-accent'
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                <Plus className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground">{t('remoteSetup.repoConfig.createNew')}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Create a new project on GitLab
                </p>
              </div>
            </button>

            <button
              onClick={() => handleSetAction('link')}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left',
                'bg-card hover:bg-accent hover:border-accent'
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Server className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground">{t('remoteSetup.repoConfig.linkExisting')}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Connect to an existing GitLab project
                </p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
