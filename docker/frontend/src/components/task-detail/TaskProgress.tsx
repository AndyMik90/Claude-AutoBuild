import { Zap, Loader2 } from 'lucide-react';
import { Progress } from '../ui/progress';
import { cn, calculateProgress } from '../../lib/utils';
import { EXECUTION_PHASE_BADGE_COLORS, EXECUTION_PHASE_LABELS } from '../../../shared/constants';
import type { Task, ExecutionPhase } from '../../../shared/types';

interface TaskProgressProps {
  task: Task;
  isRunning: boolean;
  hasActiveExecution: boolean;
  executionPhase?: ExecutionPhase;
  isStuck: boolean;
}

export function TaskProgress({ task, isRunning, hasActiveExecution, executionPhase, isStuck }: TaskProgressProps) {
  const progress = calculateProgress(task.subtasks);

  return (
    <div>
      {/* Execution Phase Indicator */}
      {hasActiveExecution && executionPhase && !isStuck && (
        <div className={cn(
          'rounded-xl border p-3 flex items-center gap-3 mb-5',
          EXECUTION_PHASE_BADGE_COLORS[executionPhase]
        )}>
          <Loader2 className="h-5 w-5 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {EXECUTION_PHASE_LABELS[executionPhase]}
              </span>
              <span className="text-sm">
                {task.executionProgress?.overallProgress || 0}%
              </span>
            </div>
            {task.executionProgress?.message && (
              <p className="text-xs mt-0.5 opacity-80 truncate">
                {task.executionProgress.message}
              </p>
            )}
            {task.executionProgress?.currentSubtask && (
              <p className="text-xs mt-0.5 opacity-70">
                Subtask: {task.executionProgress.currentSubtask}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="section-divider mb-3">
        <Zap className="h-3 w-3" />
        Progress
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {hasActiveExecution && task.executionProgress?.message
            ? task.executionProgress.message
            : task.subtasks.length > 0
              ? `${task.subtasks.filter(c => c.status === 'completed').length}/${task.subtasks.length} subtasks completed`
              : 'No subtasks yet'}
        </span>
        <span className={cn(
          'text-sm font-semibold tabular-nums',
          task.status === 'done' ? 'text-success' : 'text-foreground'
        )}>
          {hasActiveExecution
            ? `${task.executionProgress?.overallProgress || 0}%`
            : `${progress}%`}
        </span>
      </div>
      <div className={cn(
        'rounded-full',
        hasActiveExecution && 'progress-working'
      )}>
        <Progress
          value={hasActiveExecution ? (task.executionProgress?.overallProgress || 0) : progress}
          className={cn(
            'h-2',
            task.status === 'done' && '[&>div]:bg-success',
            hasActiveExecution && '[&>div]:bg-info'
          )}
          animated={isRunning || task.status === 'ai_review'}
        />
      </div>
      {/* Phase Progress Bar Segments */}
      {hasActiveExecution && (
        <div className="mt-2 flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-muted/30">
          <div
            className={cn(
              'transition-all duration-300',
              executionPhase === 'planning' ? 'bg-amber-500' : 'bg-amber-500/30'
            )}
            style={{ width: '20%' }}
            title="Planning (0-20%)"
          />
          <div
            className={cn(
              'transition-all duration-300',
              executionPhase === 'coding' ? 'bg-info' : 'bg-info/30'
            )}
            style={{ width: '60%' }}
            title="Coding (20-80%)"
          />
          <div
            className={cn(
              'transition-all duration-300',
              (executionPhase === 'qa_review' || executionPhase === 'qa_fixing') ? 'bg-purple-500' : 'bg-purple-500/30'
            )}
            style={{ width: '15%' }}
            title="AI Review (80-95%)"
          />
          <div
            className="transition-all duration-300 bg-success/30"
            style={{ width: '5%' }}
            title="Complete (95-100%)"
          />
        </div>
      )}
    </div>
  );
}
