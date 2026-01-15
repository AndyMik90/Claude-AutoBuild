import { useTranslation } from 'react-i18next';
import { AlertTriangle, Play, RotateCcw, Loader2, AlertOctagon, Key, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import type { TaskErrorInfo } from '../../../shared/types/task';

interface TaskWarningsProps {
  isStuck: boolean;
  isIncomplete: boolean;
  isRecovering: boolean;
  taskProgress: { completed: number; total: number };
  errorInfo?: TaskErrorInfo;
  onRecover: () => void;
  onResume: () => void;
}

export function TaskWarnings({
  isStuck,
  isIncomplete,
  isRecovering,
  taskProgress,
  errorInfo,
  onRecover,
  onResume
}: TaskWarningsProps) {
  const { t } = useTranslation(['errors', 'common']);

  // Determine error type for appropriate icon and styling
  const getErrorDetails = () => {
    if (!errorInfo) return null;

    const isAuthError = errorInfo.key === 'errors:task.authenticationError';
    const isRateLimitError = errorInfo.key === 'errors:task.rateLimitError';

    return {
      isAuthError,
      isRateLimitError,
      icon: isAuthError ? Key : isRateLimitError ? Clock : AlertOctagon,
      title: isAuthError ? 'Authentication Error' : isRateLimitError ? 'Rate Limit Exceeded' : 'Task Stopped',
      colorClass: isAuthError ? 'destructive' : isRateLimitError ? 'warning' : 'destructive'
    };
  };

  const errorDetails = getErrorDetails();

  if (!isStuck && !isIncomplete && !errorInfo) return null;

  return (
    <>
      {/* Stuck Task Warning */}
      {isStuck && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Task Appears Stuck
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                This task is marked as running but no active process was found.
                This can happen if the app crashed or the process was terminated unexpectedly.
              </p>
              <Button
                variant="warning"
                size="sm"
                onClick={onRecover}
                disabled={isRecovering}
                className="w-full"
              >
                {isRecovering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recovering...
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Recover & Restart Task
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Incomplete Task Warning */}
      {isIncomplete && !isStuck && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-sm text-foreground mb-1">
                Task Incomplete
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                This task has a spec and implementation plan but never completed any subtasks ({taskProgress.completed}/{taskProgress.total}).
                The process likely crashed during spec creation. Click Resume to continue implementation.
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={onResume}
                className="w-full"
              >
                <Play className="mr-2 h-4 w-4" />
                Resume Task
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Service/Circuit Breaker Error */}
      {errorInfo && errorDetails && !isStuck && !isIncomplete && (
        <div className={`rounded-xl border p-4 ${
          errorDetails.isRateLimitError
            ? 'border-warning/30 bg-warning/10'
            : 'border-destructive/30 bg-destructive/10'
        }`}>
          <div className="flex items-start gap-3">
            <errorDetails.icon className={`h-5 w-5 shrink-0 mt-0.5 ${
              errorDetails.isRateLimitError ? 'text-warning' : 'text-destructive'
            }`} />
            <div className="flex-1">
              <h3 className="font-medium text-sm text-foreground mb-1">
                {errorDetails.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t(errorInfo.key, errorInfo.meta)}
              </p>
              {errorDetails.isAuthError && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 font-mono">
                  claude setup-token
                </div>
              )}
              {errorDetails.isRateLimitError && (
                <p className="text-xs text-muted-foreground mt-2">
                  Wait a few minutes before restarting the task.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
