import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
import type { Project } from '../../shared/types';

type GitLabVisibility = 'private' | 'internal' | 'public';

interface GitLabRemoteOptions {
  enabled: boolean;
  instanceUrl: string;
  visibility: GitLabVisibility;
}

type ModalStep = 'choose' | 'create-form';

interface AddProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded?: (project: Project, needsInit: boolean) => void;
}

export function AddProjectModal({ open, onOpenChange, onProjectAdded }: AddProjectModalProps) {
  const { t } = useTranslation('dialogs');
  const [step, setStep] = useState<ModalStep>('choose');
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [initGit, setInitGit] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitlabOptions, setGitlabOptions] = useState<GitLabRemoteOptions>({
    enabled: false,
    instanceUrl: '',
    visibility: 'private'
  });
  const [isCreatingGitLabRemote, setIsCreatingGitLabRemote] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setProjectName('');
      setProjectLocation('');
      setInitGit(true);
      setError(null);
      setGitlabOptions({
        enabled: false,
        instanceUrl: '',
        visibility: 'private'
      });
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
    setIsCreatingGitLabRemote(true);
    setError(null);

    try {
      // Create the project folder
      const result = await window.electronAPI.createProjectFolder(
        projectLocation,
        projectName.trim(),
        initGit
      );

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to create project folder');
        return;
      }

      // Add the project to our store
      const project = await addProject(result.data.path);
      if (project) {
        // For new projects with git init, set main branch
        // Git init creates 'main' branch by default on modern git
        if (initGit) {
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
        }

        // Create GitLab remote if enabled and git was initialized
        if (initGit && gitlabOptions.enabled) {
          try {
            const sanitizedProjectName = projectName.trim()
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-_]/g, '')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');

            const createResult = await window.electronAPI.createGitLabProject(
              sanitizedProjectName,
              {
                description: `Created with Auto Claude`,
                visibility: gitlabOptions.visibility,
                projectPath: result.data.path,
                hostname: gitlabOptions.instanceUrl || undefined
              }
            );

            if (createResult.success && createResult.data) {
              // Add remote to local git repository
              await window.electronAPI.addGitLabRemote(
                result.data.path,
                createResult.data.pathWithNamespace,
                gitlabOptions.instanceUrl || undefined
              );
            } else {
              // GitLab creation failed, but project was created - show warning
              console.warn('Failed to create GitLab remote:', createResult.error);
            }
          } catch (err) {
            // GitLab remote creation failed, but project was created - show warning
            console.warn('Failed to create GitLab remote:', err);
          }
        }

        onProjectAdded?.(project, true); // New projects always need init
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToCreate'));
    } finally {
      setIsCreating(false);
      setIsCreatingGitLabRemote(false);
    }
  };

  const renderChooseStep = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('addProject.title')}</DialogTitle>
        <DialogDescription>
          {t('addProject.description')}
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-3">
        {/* Open Existing Option */}
        <button
          onClick={handleOpenExisting}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
            'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
            'text-left group'
          )}
          aria-label={t('addProject.openExistingAriaLabel')}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">{t('addProject.openExisting')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('addProject.openExistingDescription')}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* Create New Option */}
        <button
          onClick={() => setStep('create-form')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
            'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
            'text-left group'
          )}
          aria-label={t('addProject.createNewAriaLabel')}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <FolderPlus className="h-6 w-6 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">{t('addProject.createNew')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('addProject.createNewDescription')}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mt-2" role="alert">
          {error}
        </div>
      )}
    </>
  );

  const renderCreateForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('addProject.createNewTitle')}</DialogTitle>
        <DialogDescription>
          {t('addProject.createNewSubtitle')}
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Project Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name">{t('addProject.projectName')}</Label>
          <Input
            id="project-name"
            placeholder={t('addProject.projectNamePlaceholder')}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {t('addProject.projectNameHelp')}
          </p>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="project-location">{t('addProject.location')}</Label>
          <div className="flex gap-2">
            <Input
              id="project-location"
              placeholder={t('addProject.locationPlaceholder')}
              value={projectLocation}
              onChange={(e) => setProjectLocation(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSelectLocation}>
              {t('addProject.browse')}
            </Button>
          </div>
          {projectLocation && projectName && (
            <p className="text-xs text-muted-foreground">
              {t('addProject.willCreate')} <code className="bg-muted px-1 py-0.5 rounded">{projectLocation}/{projectName}</code>
            </p>
          )}
        </div>

        {/* Git Init Checkbox */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="init-git"
            checked={initGit}
            onChange={(e) => setInitGit(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background"
          />
          <Label htmlFor="init-git" className="text-sm font-normal cursor-pointer">
            {t('addProject.initGit')}
          </Label>
        </div>

        {/* GitLab Remote Options (only when git init is enabled) */}
        {initGit && (
          <div className="space-y-3 pl-6 border-l-2 border-border">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="init-gitlab-remote"
                checked={gitlabOptions.enabled}
                onChange={(e) => setGitlabOptions({ ...gitlabOptions, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-background"
              />
              <Label htmlFor="init-gitlab-remote" className="text-sm font-normal cursor-pointer">
                {t('addProject.initGitLabRemote')}
              </Label>
            </div>

            {gitlabOptions.enabled && (
              <>
                {/* GitLab Instance URL */}
                <div className="space-y-2">
                  <Label htmlFor="gitlab-instance-url">{t('addProject.gitLabInstanceUrl')}</Label>
                  <Input
                    id="gitlab-instance-url"
                    placeholder={t('addProject.gitLabInstanceUrlPlaceholder')}
                    value={gitlabOptions.instanceUrl}
                    onChange={(e) => setGitlabOptions({ ...gitlabOptions, instanceUrl: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('addProject.gitLabInstanceUrlHelp')}
                  </p>
                </div>

                {/* Visibility */}
                <div className="space-y-2">
                  <Label htmlFor="gitlab-visibility">{t('addProject.gitLabVisibility')}</Label>
                  <select
                    id="gitlab-visibility"
                    value={gitlabOptions.visibility}
                    onChange={(e) => setGitlabOptions({ ...gitlabOptions, visibility: e.target.value as GitLabVisibility })}
                    className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="private">{t('addProject.gitLabVisibilityPrivate')}</option>
                    <option value="internal">{t('addProject.gitLabVisibilityInternal')}</option>
                    <option value="public">{t('addProject.gitLabVisibilityPublic')}</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t('addProject.gitLabVisibilityHelp')}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3" role="alert">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isCreating || isCreatingGitLabRemote}>
          {t('addProject.back')}
        </Button>
        <Button onClick={handleCreateProject} disabled={isCreating || isCreatingGitLabRemote}>
          {isCreatingGitLabRemote ? t('addProject.creatingGitLabRemote') :
           isCreating ? t('addProject.creating') : t('addProject.createProject')}
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'choose' ? renderChooseStep() : renderCreateForm()}
      </DialogContent>
    </Dialog>
  );
}
