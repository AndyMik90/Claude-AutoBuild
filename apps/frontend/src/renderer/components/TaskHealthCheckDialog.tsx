/**
 * TaskHealthCheckDialog Component
 *
 * Dialog for displaying task health check results.
 * Shows unhealthy tasks with their issues and recovery actions.
 *
 * See ACS-241: https://linear.app/stillknotknown/issue/ACS-241
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import type { TaskHealthCheckResult, HealthIssue, RecoveryAction } from '../../shared/types';
import { recoverStuckTask } from '../stores/task-store';

interface TaskHealthCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

/**
 * Get icon for issue severity
 */
function getSeverityIcon(severity: 'error' | 'warning') {
  return severity === 'error' ? (
    <AlertCircle className="h-4 w-4 text-destructive" />
  ) : (
    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
  );
}

/**
 * Get variant for recovery action button
 */
function getButtonVariant(variant?: RecoveryAction['variant']): 'default' | 'destructive' | 'outline' | 'warning' | 'success' {
  return variant || 'outline';
}

/**
 * Handle recovery action
 */
async function handleRecoveryAction(action: RecoveryAction, taskId: string, onRefresh?: () => void) {
  switch (action.actionType) {
    case 'recover_stuck':
      const result = await recoverStuckTask(taskId, { autoRestart: false });
      if (result.success && onRefresh) {
        onRefresh();
      }
      break;
    case 'view_logs':
      // TODO: Open logs dialog
      console.log('View logs for task:', taskId);
      break;
    case 'view_qa_report':
      // TODO: Open QA report
      console.log('View QA report for task:', taskId);
      break;
    case 'recreate_spec':
      // TODO: Recreate spec from task context
      console.log('Recreate spec for task:', taskId);
      break;
    case 'discard_task':
      // TODO: Discard task
      console.log('Discard task:', taskId);
      break;
    case 'retry':
      // TODO: Retry task
      console.log('Retry task:', taskId);
      break;
  }
}

/**
 * TaskHealthCheckDialog Component
 */
export function TaskHealthCheckDialog({ open, onOpenChange, projectId }: TaskHealthCheckDialogProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const [results, setResults] = useState<TaskHealthCheckResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveringTaskIds, setRecoveringTaskIds] = useState<Set<string>>(new Set());

  // Run health check when dialog opens
  useEffect(() => {
    if (!open) {
      setResults([]);
      setError(null);
      return;
    }

    const runHealthCheck = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await window.electronAPI.checkTaskHealth(projectId);

        if (response.success && response.data) {
          setResults(response.data);
        } else {
          setError(response.error || 'Health check failed');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    runHealthCheck();
  }, [open, projectId]);

  // Refresh health check
  const handleRefresh = () => {
    setIsLoading(true);
    setError(null);

    window.electronAPI
      .checkTaskHealth(projectId)
      .then((response) => {
        if (response.success && response.data) {
          setResults(response.data);
        } else {
          setError(response.error || 'Health check failed');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  // Handle recovery action with loading state
  const handleAction = (action: RecoveryAction, taskId: string) => {
    setRecoveringTaskIds((prev) => new Set(prev).add(taskId));

    handleRecoveryAction(action, taskId, handleRefresh).finally(() => {
      setRecoveringTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    });
  };

  // Group issues by severity
  const errorIssues = results.filter((r) => r.issues.some((i) => i.severity === 'error'));
  const warningIssues = results.filter((r) => r.issues.every((i) => i.severity === 'warning'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : results.length === 0 && !isLoading ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            {t('tasks:kanban.healthCheckDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {isLoading
              ? t('tasks:kanban.checkingHealth')
              : results.length > 0
                ? t('tasks:kanban.healthCheckDialogDescription', { count: results.length })
                : t('tasks:kanban.noHealthIssues')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-1">
          {error && (
            <div className="flex items-center gap-2 p-4 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isLoading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-500 mb-4" />
              <p className="text-lg font-medium">{t('tasks:kanban.noHealthIssues')}</p>
            </div>
          )}

          {!isLoading && !error && results.length > 0 && (
            <div className="space-y-4 py-4">
              {/* Error Issues */}
              {errorIssues.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>
                      {errorIssues.length} {errorIssues.length === 1 ? 'task' : 'tasks'} with critical issues
                    </span>
                  </div>
                  {errorIssues.map((result) => (
                    <TaskIssueCard
                      key={result.taskId}
                      result={result}
                      isRecovering={recoveringTaskIds.has(result.taskId)}
                      onAction={(action) => handleAction(action, result.taskId)}
                    />
                  ))}
                </div>
              )}

              {/* Warning Issues */}
              {warningIssues.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                      {warningIssues.length} {warningIssues.length === 1 ? 'task' : 'tasks'} with warnings
                    </span>
                  </div>
                  {warningIssues.map((result) => (
                    <TaskIssueCard
                      key={result.taskId}
                      result={result}
                      isRecovering={recoveringTaskIds.has(result.taskId)}
                      onAction={(action) => handleAction(action, result.taskId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:buttons.close')}
          </Button>
          <Button
            variant="default"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            {t('common:buttons.refresh')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Task Issue Card Component
 */
interface TaskIssueCardProps {
  result: TaskHealthCheckResult;
  isRecovering: boolean;
  onAction: (action: RecoveryAction) => void;
}

function TaskIssueCard({ result, isRecovering, onAction }: TaskIssueCardProps) {
  const { t } = useTranslation(['tasks']);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Task Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{result.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {result.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{result.taskId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-2">
        {result.issues.map((issue, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            <div className="mt-0.5">{getSeverityIcon(issue.severity)}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{issue.message}</p>
              {issue.details && (
                <p className="text-xs text-muted-foreground mt-0.5">{issue.details}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recovery Actions */}
      {result.recoveryActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.recoveryActions.map((action, index) => (
            <Button
              key={index}
              variant={getButtonVariant(action.variant)}
              size="sm"
              onClick={() => onAction(action)}
              disabled={isRecovering}
              className="h-7 px-2.5"
            >
              {isRecovering && action.actionType === 'recover_stuck' ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  {t('common:buttons.processing')}
                </>
              ) : (
                action.label
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
