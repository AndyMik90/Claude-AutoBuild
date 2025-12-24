/**
 * TaskHierarchy Component
 * Shows parent-child task relationships in task detail panel
 */

import { GitBranch, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { Task } from '../../../shared/types';

interface TaskHierarchyProps {
  task: Task;
  allTasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function TaskHierarchy({ task, allTasks, onTaskClick }: TaskHierarchyProps) {
  // Get parent task if this is a child
  const parentTask = task.parentTaskId
    ? allTasks.find((t) => t.id === task.parentTaskId)
    : null;

  // Get child tasks if this is a parent - check both hasChildren flag and childTaskIds array
  const hasChildIndicator = task.hasChildren || (task.childTaskIds && task.childTaskIds.length > 0);
  const childTasks = hasChildIndicator
    ? allTasks
        .filter((t) => t.parentTaskId === task.id || (task.childTaskIds && task.childTaskIds.includes(t.id)))
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    : [];

  // Don't render if no hierarchy
  if (!parentTask && childTasks.length === 0) {
    return null;
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'done':
        return 'bg-success/10 text-success border-success/30';
      case 'in_progress':
        return 'bg-info/10 text-info border-info/30';
      case 'ai_review':
      case 'human_review':
        return 'bg-warning/10 text-warning border-warning/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-4">
      {/* Parent Task Reference */}
      {parentTask && (
        <div>
          <div className="section-divider mb-3">
            <GitBranch className="h-3 w-3" />
            Parent Task
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-left h-auto py-2 px-3 hover:bg-primary/5"
            onClick={() => onTaskClick(parentTask)}
          >
            <div className="flex items-center gap-2 w-full min-w-0">
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{parentTask.title}</div>
                <div className="text-xs text-muted-foreground truncate">{parentTask.specId}</div>
              </div>
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0 flex-shrink-0', getStatusColor(parentTask.status))}
              >
                {parentTask.status.replace('_', ' ')}
              </Badge>
            </div>
          </Button>
        </div>
      )}

      {/* Child Tasks */}
      {childTasks.length > 0 && (
        <div>
          <div className="section-divider mb-3">
            <GitBranch className="h-3 w-3" />
            Child Tasks ({childTasks.length})
          </div>
          <div className="space-y-1.5">
            {childTasks.map((child, index) => {
              const completed = child.status === 'done';
              const inProgress = child.status === 'in_progress';

              return (
                <Button
                  key={child.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-2 px-3 hover:bg-primary/5"
                  onClick={() => onTaskClick(child)}
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-medium" style={{
                      borderColor: completed ? 'rgb(var(--success))' : inProgress ? 'rgb(var(--info))' : 'rgb(var(--border))',
                      backgroundColor: completed ? 'rgb(var(--success) / 0.1)' : inProgress ? 'rgb(var(--info) / 0.1)' : 'transparent',
                      color: completed ? 'rgb(var(--success))' : inProgress ? 'rgb(var(--info))' : 'rgb(var(--muted-foreground))'
                    }}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "font-medium text-sm truncate",
                        completed && "line-through text-muted-foreground"
                      )}>
                        {child.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{child.specId}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0 flex-shrink-0', getStatusColor(child.status))}
                    >
                      {child.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </Button>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {childTasks.filter(c => c.status === 'done').length} of {childTasks.length} completed
          </div>
        </div>
      )}
    </div>
  );
}
