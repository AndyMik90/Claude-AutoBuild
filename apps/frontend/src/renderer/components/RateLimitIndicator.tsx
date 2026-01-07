import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './ui/button';
import { useRateLimitStore } from '../stores/rate-limit-store';

/**
 * Sidebar indicator that shows when there's an active rate limit.
 * Clicking on it reopens the rate limit modal.
 */
export function RateLimitIndicator() {
  const { t } = useTranslation('common');
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
  const sourceLabel = source ? getSourceLabel(source, t) : t('rateLimit.sources.claude');

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
            {t('rateLimit.title')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {resetTime ? (
              t('rateLimit.resetsAt', { time: resetTime })
            ) : (
              t('rateLimit.hitLimit', { source: sourceLabel })
            )}
          </p>
          <p className="text-xs text-primary mt-1">
            {t('rateLimit.clickToManage')}
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
          <span className="sr-only">{t('labels.dismiss')}</span>
        </Button>
      </div>
    </div>
  );
}

function getSourceLabel(source: string, t: (key: string) => string): string {
  switch (source) {
    case 'changelog': return t('rateLimit.sources.changelog');
    case 'task': return t('rateLimit.sources.task');
    case 'roadmap': return t('rateLimit.sources.roadmap');
    case 'ideation': return t('rateLimit.sources.ideation');
    case 'title-generator': return t('rateLimit.sources.titleGenerator');
    default: return t('rateLimit.sources.claude');
  }
}
