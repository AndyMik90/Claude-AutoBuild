import { useTranslation } from 'react-i18next';
import { ArrowLeftToLine } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useProjectStore } from '../stores/project-store';

interface ProjectWindowHeaderProps {
  projectId?: string;
}

/**
 * Header component for detached project windows
 * Shows project info and provides button to reattach to main window
 */
export function ProjectWindowHeader({ projectId }: ProjectWindowHeaderProps) {
  const { t } = useTranslation(['common']);
  const project = useProjectStore(state =>
    state.projects.find(p => p.id === projectId)
  );
  const reattachProject = useProjectStore(state => state.reattachProject);

  const handleMoveToMain = () => {
    console.log('[ProjectWindowHeader] Move to main clicked, projectId:', projectId);
    if (projectId) {
      console.log('[ProjectWindowHeader] Calling reattachProject');
      reattachProject(projectId);
    } else {
      console.warn('[ProjectWindowHeader] No projectId available');
    }
  };

  if (!project) return null;

  return (
    <div
      className="flex items-center justify-between px-4 py-2 pt-12 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Project info */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary"></div>
        <h2 className="font-semibold text-lg">{project.name}</h2>
        <span className="text-xs text-muted-foreground truncate max-w-md">
          {project.path}
        </span>
      </div>

      {/* Move to main button - no-drag so it's clickable */}
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMoveToMain}
              className="gap-2"
            >
              <ArrowLeftToLine className="w-4 h-4" />
              {t('common:projectWindow.moveToMain')}
            </Button>
          </TooltipTrigger>
        <TooltipContent>
          {t('common:projectWindow.moveToMainTooltip')} (⌘M)
        </TooltipContent>
      </Tooltip>
      </div>
    </div>
  );
}
