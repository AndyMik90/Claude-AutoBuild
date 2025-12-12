import { useState, useEffect } from 'react';
import { Play, Square, Clock, Zap, Target, Shield, Gauge, Palette, FileCode, Bug, Wrench, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { cn, calculateProgress, formatRelativeTime } from '../lib/utils';
import {
  CHUNK_STATUS_COLORS,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_COLORS,
  TASK_COMPLEXITY_COLORS,
  TASK_COMPLEXITY_LABELS,
  TASK_IMPACT_COLORS,
  TASK_IMPACT_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS,
  EXECUTION_PHASE_LABELS,
  EXECUTION_PHASE_BADGE_COLORS
} from '../../shared/constants';
import { startTask, stopTask, checkTaskRunning, recoverStuckTask, isIncompleteHumanReview } from '../stores/task-store';
import type { Task, TaskCategory, ExecutionPhase, ReviewReason } from '../../shared/types';

// Category icon mapping
const CategoryIcon: Record<TaskCategory, typeof Zap> = {
  feature: Target,
  bug_fix: Bug,
  refactoring: Wrench,
  documentation: FileCode,
  security: Shield,
  performance: Gauge,
  ui_ux: Palette,
  infrastructure: Wrench,
  testing: FileCode
};

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const [isStuck, setIsStuck] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [hasCheckedRunning, setHasCheckedRunning] = useState(false);

  const progress = calculateProgress(task.chunks);
  const isRunning = task.status === 'in_progress';
  const executionPhase = task.executionProgress?.phase;
  const hasActiveExecution = executionPhase && executionPhase !== 'idle' && executionPhase !== 'complete' && executionPhase !== 'failed';
  
  // Check if task is in human_review but has no completed chunks (crashed/incomplete)
  const isIncomplete = isIncompleteHumanReview(task);

  // Check if task is stuck (status says in_progress but no actual process)
  useEffect(() => {
    if (isRunning && !hasCheckedRunning) {
      checkTaskRunning(task.id).then((actuallyRunning) => {
        setIsStuck(!actuallyRunning);
        setHasCheckedRunning(true);
      });
    } else if (!isRunning) {
      setIsStuck(false);
      setHasCheckedRunning(false);
    }
  }, [task.id, isRunning, hasCheckedRunning]);

  const handleStartStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning && !isStuck) {
      stopTask(task.id);
    } else {
      startTask(task.id);
    }
  };

  const handleRecover = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRecovering(true);
    // Auto-restart the task after recovery (no need to click Start again)
    const result = await recoverStuckTask(task.id, { autoRestart: true });
    if (result.success) {
      setIsStuck(false);
      // Reset the check flag so it will re-verify running state
      setHasCheckedRunning(false);
    }
    setIsRecovering(false);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'info';
      case 'ai_review':
        return 'warning';
      case 'human_review':
        return 'purple';
      case 'done':
        return 'success';
      default:
        return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'Running';
      case 'ai_review':
        return 'AI Review';
      case 'human_review':
        return 'Needs Review';
      case 'done':
        return 'Complete';
      default:
        return 'Pending';
    }
  };

  const getReviewReasonLabel = (reason?: ReviewReason): { label: string; variant: 'success' | 'destructive' | 'warning' } | null => {
    if (!reason) return null;
    switch (reason) {
      case 'completed':
        return { label: 'Completed', variant: 'success' };
      case 'errors':
        return { label: 'Has Errors', variant: 'destructive' };
      case 'qa_rejected':
        return { label: 'QA Issues', variant: 'warning' };
      default:
        return null;
    }
  };

  const reviewReasonInfo = task.status === 'human_review' ? getReviewReasonLabel(task.reviewReason) : null;

  return (
    <Card
      className={cn(
        'card-surface task-card-enhanced cursor-pointer',
        isRunning && !isStuck && 'ring-2 ring-primary border-primary task-running-pulse',
        isStuck && 'ring-2 ring-warning border-warning task-stuck-pulse'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header - improved visual hierarchy */}
        <div className="flex items-start justify-between gap-3">
          <h3
            className="font-semibold text-sm text-foreground line-clamp-2 leading-snug flex-1 min-w-0"
            title={task.title}
          >
            {task.title}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[160px]">
            {/* Stuck indicator - highest priority */}
            {isStuck && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 bg-warning/10 text-warning border-warning/30 badge-priority-urgent"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Stuck
              </Badge>
            )}
            {/* Incomplete indicator - task in human_review but no chunks completed */}
            {isIncomplete && !isStuck && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 bg-orange-500/10 text-orange-400 border-orange-500/30"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Incomplete
              </Badge>
            )}
            {/* Execution phase badge - shown when actively running */}
            {hasActiveExecution && executionPhase && !isStuck && !isIncomplete && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0.5 flex items-center gap-1',
                  EXECUTION_PHASE_BADGE_COLORS[executionPhase]
                )}
              >
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {EXECUTION_PHASE_LABELS[executionPhase]}
              </Badge>
            )}
            <Badge
              variant={isStuck ? 'warning' : isIncomplete ? 'warning' : getStatusBadgeVariant(task.status)}
              className="text-[10px] px-1.5 py-0.5"
            >
              {isStuck ? 'Needs Recovery' : isIncomplete ? 'Needs Resume' : getStatusLabel(task.status)}
            </Badge>
            {/* Review reason badge - explains why task needs human review */}
            {reviewReasonInfo && !isStuck && !isIncomplete && (
              <Badge
                variant={reviewReasonInfo.variant}
                className="text-[10px] px-1.5 py-0.5"
              >
                {reviewReasonInfo.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Metadata badges */}
        {task.metadata && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {/* Category badge with icon */}
            {task.metadata.category && (
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', TASK_CATEGORY_COLORS[task.metadata.category])}
              >
                {CategoryIcon[task.metadata.category] && (
                  (() => {
                    const Icon = CategoryIcon[task.metadata.category!];
                    return <Icon className="h-2.5 w-2.5 mr-0.5" />;
                  })()
                )}
                {TASK_CATEGORY_LABELS[task.metadata.category]}
              </Badge>
            )}
            {/* Impact badge - high visibility for important tasks */}
            {task.metadata.impact && (task.metadata.impact === 'high' || task.metadata.impact === 'critical') && (
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', TASK_IMPACT_COLORS[task.metadata.impact])}
              >
                {TASK_IMPACT_LABELS[task.metadata.impact]}
              </Badge>
            )}
            {/* Complexity badge */}
            {task.metadata.complexity && (
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', TASK_COMPLEXITY_COLORS[task.metadata.complexity])}
              >
                {TASK_COMPLEXITY_LABELS[task.metadata.complexity]}
              </Badge>
            )}
            {/* Priority badge - only show urgent/high */}
            {task.metadata.priority && (task.metadata.priority === 'urgent' || task.metadata.priority === 'high') && (
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', TASK_PRIORITY_COLORS[task.metadata.priority])}
              >
                {TASK_PRIORITY_LABELS[task.metadata.priority]}
              </Badge>
            )}
            {/* Security severity - always show */}
            {task.metadata.securitySeverity && (
              <Badge
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', TASK_IMPACT_COLORS[task.metadata.securitySeverity])}
              >
                {task.metadata.securitySeverity} severity
              </Badge>
            )}
          </div>
        )}

        {/* Progress section */}
        {(task.chunks.length > 0 || hasActiveExecution) && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">
                {hasActiveExecution && task.executionProgress?.message
                  ? task.executionProgress.message
                  : 'Progress'}
              </span>
              <span className="text-xs font-medium text-foreground">
                {hasActiveExecution
                  ? `${task.executionProgress?.overallProgress || 0}%`
                  : `${progress}%`}
              </span>
            </div>
            <Progress
              value={hasActiveExecution ? (task.executionProgress?.overallProgress || 0) : progress}
              className="h-1.5"
              animated={isRunning || task.status === 'ai_review'}
            />

            {/* Chunk indicators - enhanced with tooltips and animation */}
            {task.chunks.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {task.chunks.slice(0, 10).map((chunk) => (
                  <div
                    key={chunk.id}
                    className={cn(
                      'h-2 w-2 rounded-full chunk-dot',
                      CHUNK_STATUS_COLORS[chunk.status],
                      chunk.status === 'in_progress' && 'chunk-dot-active'
                    )}
                    title={`${chunk.title || chunk.id}: ${chunk.status}`}
                  />
                ))}
                {task.chunks.length > 10 && (
                  <span className="text-[10px] text-muted-foreground font-medium ml-0.5">
                    +{task.chunks.length - 10}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(task.updatedAt)}</span>
          </div>

          {/* Action buttons */}
          {isStuck ? (
            <Button
              variant="warning"
              size="sm"
              className="h-7 px-2.5"
              onClick={handleRecover}
              disabled={isRecovering}
            >
              {isRecovering ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Recovering...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-1.5 h-3 w-3" />
                  Recover
                </>
              )}
            </Button>
          ) : isIncomplete ? (
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2.5"
              onClick={handleStartStop}
            >
              <Play className="mr-1.5 h-3 w-3" />
              Resume
            </Button>
          ) : (task.status === 'backlog' || task.status === 'in_progress') && (
            <Button
              variant={isRunning ? 'destructive' : 'default'}
              size="sm"
              className="h-7 px-2.5"
              onClick={handleStartStop}
            >
              {isRunning ? (
                <>
                  <Square className="mr-1.5 h-3 w-3" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3 w-3" />
                  Start
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
