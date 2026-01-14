/**
 * ImportResultBanner - Success/error banner after import
 */

import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { TaskFileImportResult } from '../types';

interface ImportResultBannerProps {
  result: TaskFileImportResult;
  onDismiss?: () => void;
}

export function ImportResultBanner({ result, onDismiss }: ImportResultBannerProps) {
  const { t } = useTranslation(['tasks', 'common']);

  const isSuccess = result.success && result.imported > 0;
  const hasErrors = result.errors && result.errors.length > 0;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border',
        isSuccess
          ? 'bg-success/10 border-success/30 text-success-foreground'
          : 'bg-destructive/10 border-destructive/30 text-destructive'
      )}
      role="alert"
    >
      {/* Icon */}
      {isSuccess ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      )}

      {/* Content */}
      <div className="flex-1 space-y-1">
        <p className="font-medium">
          {isSuccess
            ? t('taskFileImport.success.title')
            : t('taskFileImport.errors.importFailed')
          }
        </p>
        <p className="text-sm opacity-90">
          {t('taskFileImport.success.message', { count: result.imported })}
          {result.failed > 0 && t('taskFileImport.errors.failedCount', { count: result.failed })}
        </p>

        {/* Error details */}
        {hasErrors && (
          <ul className="text-sm opacity-80 mt-2 space-y-1">
            {result.errors!.slice(0, 3).map((error, i) => (
              <li key={i} className="text-xs">
                {error}
              </li>
            ))}
            {result.errors!.length > 3 && (
              <li className="text-xs opacity-70">
                {t('taskFileImport.errors.moreErrors', { count: result.errors!.length - 3 })}
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded hover:bg-black/10 transition-colors"
          aria-label={t('common:ariaLabels.dismissAriaLabel')}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
