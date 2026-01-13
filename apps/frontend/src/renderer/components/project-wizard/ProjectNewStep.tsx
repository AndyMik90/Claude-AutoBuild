import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { Project } from '../../../shared/types';

interface ProjectNewStepProps {
  onProjectCreated: (project: Project, initWithGit: boolean) => void;
  onBack: () => void;
}

/**
 * Create new project step
 */
export function ProjectNewStep({ onProjectCreated, onBack }: ProjectNewStepProps) {
  const { t } = useTranslation('project-wizard');
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [initGit, setInitGit] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(t('projectNew.nameRequired'));
      return;
    }
    if (!projectLocation.trim()) {
      setError(t('projectNew.locationRequired'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create the project folder
      const result = await window.electronAPI.createProjectFolder(
        projectLocation,
        projectName.trim(),
        initGit
      );

      if (!result.success || !result.data) {
        setError(result.error || t('projectNew.failedToCreate'));
        return;
      }

      // Add the project to our store
      const addResult = await window.electronAPI.addProject(result.data.path);
      if (addResult.success && addResult.data) {
        const project = addResult.data;

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
          } catch (e) {
            // Non-fatal - main branch can be set later
            console.error('Failed to detect or set main branch for new project:', e);
          }
        }

        onProjectCreated(project, initGit);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('projectNew.failedToCreate'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {t('projectNew.title')}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {t('projectNew.description')}
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">{t('projectNew.projectName')}</Label>
            <Input
              id="project-name"
              placeholder={t('projectNew.projectNamePlaceholder')}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('projectNew.projectNameHelp')}
            </p>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="project-location">{t('projectNew.location')}</Label>
            <div className="flex gap-2">
              <Input
                id="project-location"
                placeholder={t('projectNew.locationPlaceholder')}
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectLocation} type="button">
                {t('projectNew.browse')}
              </Button>
            </div>
            {projectLocation && projectName && (
              <p className="text-xs text-muted-foreground">
                {t('projectNew.willCreate')} <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{projectLocation}/{projectName}</code>
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
              {t('projectNew.initGit')}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            {t('projectNew.optionalLabel')}
          </p>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isCreating}
            type="button"
          >
            {t('project.back')}
          </Button>
          <Button
            onClick={handleCreateProject}
            disabled={isCreating}
            type="button"
          >
            {isCreating ? t('projectNew.creating') : t('projectNew.createProject')}
          </Button>
        </div>
      </div>
    </div>
  );
}
