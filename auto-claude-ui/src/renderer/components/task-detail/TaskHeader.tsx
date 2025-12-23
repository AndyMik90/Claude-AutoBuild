import { X, Pencil, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { TASK_STATUS_LABELS } from '../../../shared/constants';
import type { Task } from '../../../shared/types';

interface TaskHeaderProps {
  task: Task;
  isStuck: boolean;
  isIncomplete: boolean;
  taskProgress: { completed: number; total: number };
  isRunning: boolean;
  isExpanded?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onToggleExpand?: () => void;
}

export function TaskHeader({
  task,
  isStuck,
  isIncomplete,
  taskProgress,
  isRunning,
  isExpanded,
  onClose,
  onEdit,
  onToggleExpand
}: TaskHeaderProps) {
  return (
    <div className="flex items-start justify-between p-4 pb-3">
      <div className="flex-1 min-w-0 pr-2">
        <h2 className="font-semibold text-lg text-foreground leading-snug break-words hyphens-auto">
          {task.title}
        </h2>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-mono">
            {task.specId}
          </Badge>
          {isStuck ? (
            <Badge variant="warning" className="text-xs flex items-center gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              Stuck
            </Badge>
          ) : isIncomplete ? (
            <>
              <Badge variant="warning" className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Incomplete
              </Badge>
              <Badge variant="outline" className="text-xs text-orange-400">
                {taskProgress.completed}/{taskProgress.total} subtasks
              </Badge>
            </>
          ) : (
            <>
              <Badge
                variant={task.status === 'done' ? 'success' : task.status === 'human_review' ? 'purple' : task.status === 'in_progress' ? 'info' : 'secondary'}
                className={cn('text-xs', (task.status === 'in_progress' && !isStuck) && 'status-running')}
              >
                {TASK_STATUS_LABELS[task.status]}
              </Badge>
              {task.status === 'human_review' && task.reviewReason && (
                <Badge
                  variant={task.reviewReason === 'completed' ? 'success' : task.reviewReason === 'errors' ? 'destructive' : 'warning'}
                  className="text-xs"
                >
                  {task.reviewReason === 'completed' ? 'Completed' :
                   task.reviewReason === 'errors' ? 'Has Errors' :
                   task.reviewReason === 'plan_review' ? 'Approve Plan' : 'QA Issues'}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={onEdit}
                disabled={isRunning && !isStuck}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isRunning && !isStuck ? 'Cannot edit while task is running' : 'Edit task'}
          </TooltipContent>
        </Tooltip>
        {onToggleExpand && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={onToggleExpand}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isExpanded ? 'Collapse panel' : 'Expand panel'}
            </TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" size="icon" className="hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
