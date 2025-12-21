import { Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import type { Project } from '../../shared/types';

interface ProjectTabBarProps {
  projects: Project[];
  activeProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
  onProjectClose: (projectId: string) => void;
  onAddProject: () => void;
  className?: string;
}

export function ProjectTabBar({
  projects,
  activeProjectId,
  onProjectSelect,
  onProjectClose,
  onAddProject,
  className
}: ProjectTabBarProps) {
  if (projects.length === 0) {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center border-b border-border bg-background',
      'overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent',
      className
    )}>
      <div className="flex items-center flex-1 min-w-0">
        {projects.map((project) => (
          <div
            key={project.id}
            className={cn(
              'group relative flex items-center min-w-0 max-w-[200px]',
              'border-r border-border last:border-r-0'
            )}
          >
            <button
              onClick={() => onProjectSelect(project.id)}
              className={cn(
                'flex-1 flex items-center gap-2 px-4 py-2.5 text-sm',
                'min-w-0 truncate hover:bg-muted/50 transition-colors',
                'border-b-2 border-transparent',
                activeProjectId === project.id && [
                  'bg-background border-b-primary text-foreground',
                  'hover:bg-background'
                ],
                activeProjectId !== project.id && [
                  'text-muted-foreground',
                  'hover:text-foreground'
                ]
              )}
              title={project.name}
            >
              <span className="truncate font-medium">
                {project.name}
              </span>
            </button>

            {projects.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 p-0 mr-1 opacity-0 group-hover:opacity-100',
                  'transition-opacity duration-200',
                  'hover:bg-destructive hover:text-destructive-foreground',
                  activeProjectId === project.id && 'opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onProjectClose(project.id);
                }}
                title={`Close ${project.name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAddProject}
          title="Add Project"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}