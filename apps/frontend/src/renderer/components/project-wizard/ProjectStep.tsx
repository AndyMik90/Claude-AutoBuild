import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { Project } from '../../../shared/types';

interface ProjectStepProps {
  onNext: (project: Project, needsGit: boolean, needsAutoClaude: boolean) => void;
  onCreateNew: () => void;
  onBack: () => void;
}

/**
 * Project selection step - choose between opening existing or creating new
 */
export function ProjectStep({ onNext, onCreateNew, onBack }: ProjectStepProps) {
  const { t } = useTranslation('project-wizard');

  const handleOpenExisting = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        // Add the project to our store
        const result = await window.electronAPI.addProject(path);
        if (result.success && result.data) {
          const project = result.data;

          // Auto-detect main branch
          try {
            const mainBranchResult = await window.electronAPI.detectMainBranch(path);
            if (mainBranchResult.success && mainBranchResult.data) {
              await window.electronAPI.updateProjectSettings(project.id, {
                mainBranch: mainBranchResult.data
              });
            }
          } catch (e) {
            // Non-fatal - main branch can be set later
            console.error('Failed to detect or set main branch for existing project:', e);
          }

          // Determine what this project needs
          const needsGit = !project.autoBuildPath; // Needs init if no autoBuildPath
          const needsAutoClaude = !project.autoBuildPath; // Same check

          onNext(project, needsGit, needsAutoClaude);
        }
      }
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            {t('project.title')}
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">
            {t('project.description')}
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {/* Open Existing */}
          <button
            onClick={handleOpenExisting}
            className={cn(
              'flex items-center gap-4 p-6 rounded-xl border-2 border-border',
              'bg-card hover:bg-accent hover:border-primary transition-all duration-200',
              'text-left group'
            )}
            aria-label={t('project.openExistingAriaLabel')}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FolderOpen className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg">
                {t('project.openExisting')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('project.openExistingDescription')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
          </button>

          {/* Create New */}
          <button
            onClick={onCreateNew}
            className={cn(
              'flex items-center gap-4 p-6 rounded-xl border-2 border-border',
              'bg-card hover:bg-accent hover:border-success transition-all duration-200',
              'text-left group'
            )}
            aria-label={t('project.createNewAriaLabel')}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-success/10">
              <FolderPlus className="h-7 w-7 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg">
                {t('project.createNew')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('project.createNewDescription')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-success transition-colors shrink-0" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('wizard.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
