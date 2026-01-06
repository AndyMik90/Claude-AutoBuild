import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, ChevronRight, GitBranch, Github } from 'lucide-react';
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
import { RemoteSetupModal } from './RemoteSetupModal';
import type { Project } from '../../shared/types';
import type { RemoteConfig } from './remote-setup/types';

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
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteConfig, setRemoteConfig] = useState<RemoteConfig>({
    service: null,
    enabled: false
  });
  const [showRemoteSetup, setShowRemoteSetup] = useState(false);
  const [pendingService, setPendingService] = useState<'github' | 'gitlab' | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setProjectName('');
      setProjectLocation('');
      setError(null);
      setRemoteConfig({
        service: null,
        enabled: false
      });
      setPendingService(null);
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
              // Create GitLab remote
              const createResult = await window.electronAPI.createGitLabProject(
                sanitizedProjectName,
                {
                  description: 'Created with Auto Claude',
                  visibility: remoteConfig.gitlabVisibility,
                  projectPath: result.data.path,
                  hostname: remoteConfig.gitlabInstanceUrl || undefined
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
            } else if (remoteConfig.service === 'github') {
              // TODO: Implement GitHub remote creation
              console.log('GitHub remote creation not yet implemented');
            }
          } catch (err) {
            // Remote creation failed, but project was created - show warning
            console.warn('Failed to create remote:', err);
          }
        }

        onProjectAdded?.(project, true); // New projects always need init
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToCreate'));
    } finally {
      setIsCreating(false);
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

        {/* Remote Repository Setup - Cards */}
        <div className="space-y-2">
          <Label>{t('addProject.setupRemote')}</Label>
          <div className="grid gap-2">
            {/* Skip for now */}
            <button
              onClick={() => {
                setRemoteConfig({ service: null, enabled: false });
                setPendingService(null);
              }}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200',
                'hover:bg-accent hover:border-accent',
                !remoteConfig.enabled && !pendingService
                  ? 'bg-accent border-accent'
                  : 'bg-card border-border'
              )}
            >
              <GitBranch className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium text-sm">{t('addProject.remoteSkip')}</div>
                <div className="text-xs text-muted-foreground">{t('addProject.remoteSkipDescription')}</div>
              </div>
              {!remoteConfig.enabled && !pendingService && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </button>

            {/* GitHub */}
            <button
              onClick={() => {
                setPendingService('github');
                setShowRemoteSetup(true);
              }}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200',
                'hover:bg-accent hover:border-accent',
                remoteConfig.service === 'github' && remoteConfig.enabled
                  ? 'bg-accent border-accent'
                  : 'bg-card border-border'
              )}
            >
              <Github className="h-5 w-5" />
              <div className="flex-1">
                <div className="font-medium text-sm">{t('addProject.remoteGitHub')}</div>
                <div className="text-xs text-muted-foreground">{t('addProject.remoteGitHubDescription')}</div>
              </div>
              {(remoteConfig.service === 'github' && remoteConfig.enabled) && (
                <div className="h-2 w-2 rounded-full bg-success" />
              )}
            </button>

            {/* GitLab */}
            <button
              onClick={() => {
                setPendingService('gitlab');
                setShowRemoteSetup(true);
              }}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200',
                'hover:bg-accent hover:border-accent',
                remoteConfig.service === 'gitlab' && remoteConfig.enabled
                  ? 'bg-accent border-accent'
                  : 'bg-card border-border'
              )}
            >
              <GitBranch className="h-5 w-5 text-orange-500" />
              <div className="flex-1">
                <div className="font-medium text-sm">{t('addProject.remoteGitLab')}</div>
                <div className="text-xs text-muted-foreground">{t('addProject.remoteGitLabDescription')}</div>
              </div>
              {(remoteConfig.service === 'gitlab' && remoteConfig.enabled) && (
                <div className="h-2 w-2 rounded-full bg-success" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3" role="alert">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isCreating}>
          {t('addProject.back')}
        </Button>
        <Button onClick={handleCreateProject} disabled={isCreating}>
          {isCreating ? t('addProject.creating') : t('addProject.createProject')}
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'choose' ? renderChooseStep() : renderCreateForm()}
      </DialogContent>

      {/* Remote Setup Modal */}
      <RemoteSetupModal
        open={showRemoteSetup}
        onOpenChange={(open) => {
          setShowRemoteSetup(open);
          if (!open) setPendingService(null);
        }}
        projectName={projectName}
        projectLocation={projectLocation}
        onComplete={(config) => {
          setRemoteConfig(config);
          setPendingService(null);
        }}
        initialService={pendingService}
      />
    </Dialog>
  );
}
