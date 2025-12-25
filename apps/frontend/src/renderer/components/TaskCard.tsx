import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, Clock, Zap, Target, Shield, Gauge, Palette, FileCode, Bug, Wrench, Loader2, AlertTriangle, RotateCcw, Archive } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn, formatRelativeTime, sanitizeMarkdownForDisplay } from '../lib/utils';
import { PhaseProgressIndicator } from './PhaseProgressIndicator';
import {
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
import { startTask, stopTask, checkTaskRunning, recoverStuckTask, isIncompleteHumanReview, archiveTasks } from '../stores/task-store';
import type { Task, TaskCategory, ReviewReason } from '../../shared/types';

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
  const { t } = useTranslation('tasks');
  const [isStuck, setIsStuck] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const isRunning = task.status === 'in_progress';
  const executionPhase = task.executionProgress?.phase;
  const hasActiveExecution = executionPhase && executionPhase !== 'idle' && executionPhase !== 'complete' && executionPhase !== 'failed';

  // Check if task is in human_review but has no completed subtasks (crashed/incomplete)
  const isIncomplete = isIncompleteHumanReview(task);

  // Check if task is stuck (status says in_progress but no actual process)
  // Add a grace period to avoid false positives during process spawn
  useEffect(() => {
    if (!isRunning) {
      setIsStuck(false);
      return;
    }

    // Initial check after 2s grace period
    const initialTimeout = setTimeout(() => {
      checkTaskRunning(task.id).then((actuallyRunning) => {
        setIsStuck(!actuallyRunning);
      });
    }, 2000);

    // Periodic re-check every 15 seconds
    const recheckInterval = setInterval(() => {
      checkTaskRunning(task.id).then((actuallyRunning) => {
        setIsStuck(!actuallyRunning);
      });
    }, 15000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(recheckInterval);
    };
  }, [task.id, isRunning]);

  // Add visibility change handler to re-validate on focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        checkTaskRunning(task.id).then((actuallyRunning) => {
          setIsStuck(!actuallyRunning);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [task.id, isRunning]);

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
    }
    setIsRecovering(false);
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await archiveTasks(task.projectId, [task.id]);
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
        return t('labels.running');
      case 'ai_review':
        return t('labels.aiReview');
      case 'human_review':
        return t('labels.needsReview');
      case 'done':
        return t('status.complete');
      default:
        return t('labels.pending');
    }
  };

  const getReviewReasonLabel = (reason?: ReviewReason): { label: string; variant: 'success' | 'destructive' | 'warning' } | null => {
    if (!reason) return null;
    switch (reason) {
      case 'completed':
        return { label: t('reviewReason.completed'), variant: 'success' };
      case 'errors':
        return { label: t('reviewReason.hasErrors'), variant: 'destructive' };
      case 'qa_rejected':
        return { label: t('reviewReason.qaIssues'), variant: 'warning' };
      case 'plan_review':
        return { label: t('reviewReason.approvePlan'), variant: 'warning' };
      default:
        return null;
    }
  };

  const reviewReasonInfo = task.status === 'human_review' ? getReviewReasonLabel(task.reviewReason) : null;

  const isArchived = !!task.metadata?.archivedAt;

  return (
    <Card
      className={cn(
        'card-surface task-card-enhanced cursor-pointer',
        isRunning && !isStuck && 'ring-2 ring-primary border-primary task-running-pulse',
        isStuck && 'ring-2 ring-warning border-warning task-stuck-pulse',
        isArchived && 'opacity-60 hover:opacity-80'
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
                {t('labels.stuck')}
              </Badge>
            )}
            {/* Incomplete indicator - task in human_review but no subtasks completed */}
            {isIncomplete && !isStuck && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 bg-orange-500/10 text-orange-400 border-orange-500/30"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {t('labels.incomplete')}
              </Badge>
            )}
            {/* Archived indicator - task has been released */}
            {task.metadata?.archivedAt && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0.5 flex items-center gap-1 bg-muted text-muted-foreground border-border"
              >
                <Archive className="h-2.5 w-2.5" />
                {t('status.archived')}
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
            {/* Status badge - hide when execution phase badge is showing */}
            {!hasActiveExecution && (
              <Badge
                variant={isStuck ? 'warning' : isIncomplete ? 'warning' : getStatusBadgeVariant(task.status)}
                className="text-[10px] px-1.5 py-0.5"
              >
                {isStuck ? t('labels.needsRecovery') : isIncomplete ? t('labels.needsResume') : getStatusLabel(task.status)}
              </Badge>
            )}
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

        {/* Description - sanitized to handle markdown content */}
        {task.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
            {sanitizeMarkdownForDisplay(task.description, 150)}
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

        {/* Progress section - Phase-aware with animations */}
        {(task.subtasks.length > 0 || hasActiveExecution || isRunning || isStuck) && (
          <div className="mt-4">
            <PhaseProgressIndicator
              phase={executionPhase}
              subtasks={task.subtasks}
              isStuck={isStuck}
              isRunning={isRunning}
            />
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
                  {t('labels.recovering')}
                </>
              ) : (
                <>
                  <RotateCcw className="mr-1.5 h-3 w-3" />
                  {t('actions.recover')}
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
              {t('actions.resume')}
            </Button>
          ) : task.status === 'done' && !task.metadata?.archivedAt ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 hover:bg-muted-foreground/10"
              onClick={handleArchive}
              title={t('tooltips.archiveTask')}
            >
              <Archive className="mr-1.5 h-3 w-3" />
              {t('actions.archive')}
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
                  {t('actions.stop')}
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-3 w-3" />
                  {t('actions.start')}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
