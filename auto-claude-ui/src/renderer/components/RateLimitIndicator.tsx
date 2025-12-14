import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button';
import { useRateLimitStore } from '../stores/rate-limit-store';

/**
 * Sidebar indicator that shows when there's an active rate limit.
 * Clicking on it reopens the rate limit modal.
 */
export function RateLimitIndicator() {
  const {
    hasPendingRateLimit,
    pendingRateLimitType,
    rateLimitInfo,
    sdkRateLimitInfo,
    reopenRateLimitModal,
    clearPendingRateLimit
  } = useRateLimitStore();

  if (!hasPendingRateLimit) {
    return null;
  }

  // Get the reset time to display
  const resetTime = pendingRateLimitType === 'terminal'
    ? rateLimitInfo?.resetTime
    : sdkRateLimitInfo?.resetTime;

  // Get source info for SDK rate limits
  const source = pendingRateLimitType === 'sdk' ? sdkRateLimitInfo?.source : null;
  const sourceLabel = source ? getSourceLabel(source) : 'Claude';

  return (
    <div className="mx-3 mb-3">
      <div
        className="relative flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 cursor-pointer hover:bg-warning/20 transition-colors"
        onClick={reopenRateLimitModal}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            reopenRateLimitModal();
          }
        }}
      >
        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-warning">
            Rate Limited
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {resetTime ? (
              <>Resets {resetTime}</>
            ) : (
              <>{sourceLabel} hit usage limit</>
            )}
          </p>
          <p className="text-xs text-primary mt-1">
            Click to manage →
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 hover:bg-warning/20"
          onClick={(e) => {
            e.stopPropagation();
            clearPendingRateLimit();
          }}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'changelog': return 'Changelog';
    case 'task': return 'Task';
    case 'roadmap': return 'Roadmap';
    case 'ideation': return 'Ideation';
    case 'title-generator': return 'Title Generator';
    default: return 'Claude';
  }
}
