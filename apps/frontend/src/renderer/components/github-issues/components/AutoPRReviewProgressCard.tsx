/**
 * AutoPRReviewProgressCard Component
 *
 * Displays the progress of an Auto-PR-Review operation with:
 * - Progress bar showing iteration progress
 * - Substep indicator showing current activity
 * - CI checks visualization
 * - External bot status badges
 * - Cancel button with confirmation
 *
 * CRITICAL: This component displays progress toward human approval.
 * The system NEVER auto-merges - human approval is always required.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type {
  AutoPRReviewProgress,
  CICheckStatus,
  ExternalBotStatus,
  AutoPRReviewStatus,
} from '../types';

// =============================================================================
// Types
// =============================================================================

export interface AutoPRReviewProgressCardProps {
  /** Progress data for the PR review */
  progress: AutoPRReviewProgress;

  /** Callback to cancel the review */
  onCancel?: (repository: string, prNumber: number, reason?: string) => Promise<void>;

  /** Optional CSS class name */
  className?: string;

  /** Translation function for i18n (defaults to identity) */
  t?: (key: string) => string;
}

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Status configurations for visual styling
 */
const STATUS_CONFIG: Record<AutoPRReviewStatus, StatusConfig> = {
  idle: {
    label: 'autoPRReview.status.idle',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300 dark:border-gray-600',
  },
  awaiting_checks: {
    label: 'autoPRReview.status.awaitingChecks',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
  },
  pr_reviewing: {
    label: 'autoPRReview.status.reviewing',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-900/30',
    borderColor: 'border-purple-300 dark:border-purple-700',
  },
  pr_fixing: {
    label: 'autoPRReview.status.fixing',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
  },
  pr_ready_to_merge: {
    label: 'autoPRReview.status.readyToMerge',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700',
  },
  completed: {
    label: 'autoPRReview.status.completed',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-700',
  },
  failed: {
    label: 'autoPRReview.status.failed',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-700',
  },
  cancelled: {
    label: 'autoPRReview.status.cancelled',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-800',
    borderColor: 'border-gray-300 dark:border-gray-600',
  },
  max_iterations: {
    label: 'autoPRReview.status.maxIterations',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-900/30',
    borderColor: 'border-orange-300 dark:border-orange-700',
  },
  needs_human_review: {
    label: 'autoPRReview.status.needsHumanReview',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
  },
};

/**
 * CI check status configurations
 * Maps both frontend status names and backend status names
 */
const CI_STATUS_CONFIG: Record<string, { icon: string; color: string }> = {
  // Frontend status names
  pending: { icon: '\u23F3', color: 'text-gray-500' }, // Hourglass
  in_progress: { icon: '\u25B6', color: 'text-blue-500' }, // Play
  success: { icon: '\u2714', color: 'text-green-500' }, // Check mark
  failure: { icon: '\u2718', color: 'text-red-500' }, // X mark
  cancelled: { icon: '\u26AA', color: 'text-gray-400' }, // Circle
  skipped: { icon: '\u2192', color: 'text-gray-400' }, // Arrow
  // Backend status names (mapped to same icons)
  running: { icon: '\u25B6', color: 'text-blue-500' }, // Play (same as in_progress)
  passed: { icon: '\u2714', color: 'text-green-500' }, // Check mark (same as success)
  failed: { icon: '\u2718', color: 'text-red-500' }, // X mark (same as failure)
  timed_out: { icon: '\u23F1', color: 'text-orange-500' }, // Stopwatch
  unknown: { icon: '\u2753', color: 'text-gray-400' }, // Question mark
};

// =============================================================================
// Helper Components
// =============================================================================

/**
 * Progress bar component showing iteration progress
 */
function ProgressBar({
  current,
  max,
  className = '',
}: {
  current: number;
  max: number;
  className?: string;
}) {
  const percentage = Math.min(100, Math.round((current / max) * 100));

  return (
    <div
      className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 ${className}`}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`Progress: ${current} of ${max} iterations`}
    >
      <div
        className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-in-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

/**
 * Single CI check item
 */
function CICheckItem({ check, t }: { check: CICheckStatus; t: (key: string) => string }) {
  // Use fallback config for unknown status values to prevent crashes
  const config = CI_STATUS_CONFIG[check.status] ?? {
    icon: '\u2753', // Question mark
    color: 'text-gray-400',
  };

  return (
    <div
      className="flex items-center gap-2 text-sm py-1"
      title={check.conclusion ?? t(`autoPRReview.ciStatus.${check.status}`)}
    >
      <span className={config.color} aria-hidden="true">
        {config.icon}
      </span>
      <span className="truncate flex-1">{check.name}</span>
      {check.detailsUrl && (
        <a
          href={check.detailsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
          aria-label={t('autoPRReview.viewDetails')}
        >
          {t('autoPRReview.details')}
        </a>
      )}
    </div>
  );
}

/**
 * CI checks summary badge
 *
 * Shows CI status in three states:
 * - Running: CI checks are still in progress
 * - Done (passed): CI checks completed and all passed
 * - Done (failed): CI checks completed but some failed
 */
function CISummaryBadge({
  summary,
  status,
  ciCompleted,
  ciPassed,
  t,
}: {
  summary: AutoPRReviewProgress['ciSummary'];
  status: AutoPRReviewStatus;
  ciCompleted?: boolean;
  ciPassed?: boolean;
  t: (key: string) => string;
}) {
  const { total, passed, failed, pending } = summary;

  // Determine CI completion from explicit flag or from phase
  const isPastAwaitingChecks = ['pr_reviewing', 'pr_fixing', 'pr_ready_to_merge', 'completed', 'needs_human_review', 'max_iterations'].includes(status);
  const isCompleted = ciCompleted ?? isPastAwaitingChecks;

  // If CI hasn't completed yet, show running state
  if (!isCompleted) {
    return (
      <span className="text-sm text-blue-500 dark:text-blue-400 flex items-center gap-1">
        <span
          className="animate-spin inline-block w-3 h-3 border-2 border-blue-300 dark:border-blue-600 border-t-blue-500 dark:border-t-blue-400 rounded-full"
          aria-hidden="true"
        />
        {t('autoPRReview.ciRunning')}
      </span>
    );
  }

  // CI is done - show pass/fail status
  // Use explicit ciPassed if available, otherwise infer from summary
  const allPassed = ciPassed ?? (total === 0 || (failed === 0 && pending === 0));

  if (allPassed) {
    return (
      <span className="text-sm text-green-600 dark:text-green-400">
        {'\u2714'} {t('autoPRReview.ciDonePassed')}
      </span>
    );
  }

  // CI done but failed
  return (
    <span className="text-sm text-red-600 dark:text-red-400">
      {'\u2718'} {t('autoPRReview.ciDoneFailed')}
    </span>
  );
}

/**
 * External bot status badge
 */
function BotStatusBadge({ bot, t }: { bot: ExternalBotStatus; t: (key: string) => string }) {
  const statusClass = bot.hasCommented
    ? bot.isVerified
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700'
      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700'
    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600';

  const statusIcon = bot.hasCommented
    ? bot.isVerified
      ? '\u2714' // Check mark
      : '\u26A0' // Warning
    : '\u23F3'; // Hourglass

  const statusLabel = bot.hasCommented
    ? bot.isVerified
      ? t('autoPRReview.botVerified')
      : t('autoPRReview.botUnverified')
    : t('autoPRReview.botPending');

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${statusClass}`}
      title={statusLabel}
      aria-label={`${bot.botName}: ${statusLabel}`}
    >
      <span aria-hidden="true">{statusIcon}</span>
      <span className="font-medium">{bot.botName}</span>
      {bot.findingsCount !== undefined && bot.findingsCount > 0 && (
        <span className="bg-white/50 dark:bg-black/30 px-1.5 rounded-full">
          {bot.findingsCount} {t('autoPRReview.findings')}
        </span>
      )}
    </div>
  );
}

/**
 * Elapsed time display
 */
function ElapsedTime({ ms, t }: { ms: number; t: (key: string) => string }) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let display: string;
  if (hours > 0) {
    display = `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    display = `${minutes}m ${seconds % 60}s`;
  } else {
    display = `${seconds}s`;
  }

  return (
    <span className="text-sm text-gray-500 dark:text-gray-400" aria-label={t('autoPRReview.elapsedTime')}>
      {display}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * AutoPRReviewProgressCard - Displays Auto-PR-Review progress with rich UI
 *
 * @example
 * ```tsx
 * <AutoPRReviewProgressCard
 *   progress={reviewProgress}
 *   onCancel={handleCancel}
 *   t={t}
 * />
 * ```
 */
export function AutoPRReviewProgressCard({
  progress,
  onCancel,
  className = '',
  t = (key: string) => key.split('.').pop() ?? key, // Fallback: return last key segment
}: AutoPRReviewProgressCardProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCIDetails, setShowCIDetails] = useState(false);

  // Get status configuration
  const statusConfig = STATUS_CONFIG[progress.status];

  // Memoized values
  const isInProgress = useMemo(
    () => ['awaiting_checks', 'pr_reviewing', 'pr_fixing'].includes(progress.status),
    [progress.status]
  );

  const isTerminal = useMemo(
    () => ['completed', 'failed', 'cancelled', 'pr_ready_to_merge', 'max_iterations', 'needs_human_review'].includes(progress.status),
    [progress.status]
  );

  // Handle cancel action
  const handleCancelClick = useCallback(() => {
    if (progress.isCancellable) {
      setShowCancelConfirm(true);
    }
  }, [progress.isCancellable]);

  const handleCancelConfirm = useCallback(async () => {
    if (!onCancel) return;

    setIsCancelling(true);
    try {
      await onCancel(progress.repository, progress.prNumber, 'User requested cancellation');
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  }, [onCancel, progress.repository, progress.prNumber]);

  const handleCancelDismiss = useCallback(() => {
    setShowCancelConfirm(false);
  }, []);

  // Toggle CI details
  const toggleCIDetails = useCallback(() => {
    setShowCIDetails((prev) => !prev);
  }, []);

  return (
    <div
      className={`rounded-lg border ${statusConfig.borderColor} ${statusConfig.bgColor} p-4 ${className}`}
      role="region"
      aria-label={t('autoPRReview.progressCard')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* PR identifier */}
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {progress.repository}#{progress.prNumber}
          </h3>

          {/* Status badge */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              {t(statusConfig.label)}
            </span>
            <ElapsedTime ms={progress.elapsedMs} t={t} />
          </div>
        </div>

        {/* Cancel button */}
        {progress.isCancellable && onCancel && (
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={isCancelling}
            className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('autoPRReview.cancelReview')}
          >
            {isCancelling ? t('autoPRReview.cancelling') : t('autoPRReview.cancel')}
          </button>
        )}
      </div>

      {/* Progress section */}
      <div className="mt-4">
        {/* Iteration progress - shows current cycle in the review→fix→repeat loop */}
        <div className="flex items-center justify-between text-sm mb-2">
          <span
            className="text-gray-600 dark:text-gray-400"
            title={t('autoPRReview.iterationTooltip')}
          >
            {t('autoPRReview.reviewCycle')} {progress.currentIteration}/{progress.maxIterations}
          </span>
          {progress.fixedFindingsCount > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {progress.fixedFindingsCount} {t('autoPRReview.fixed')}
            </span>
          )}
          {progress.remainingFindingsCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {progress.remainingFindingsCount} {t('autoPRReview.remaining')}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <ProgressBar
          current={progress.currentIteration}
          max={progress.maxIterations}
          className="mb-4"
        />

        {/* Current activity */}
        {progress.currentActivity && isInProgress && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
            <span
              className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 rounded-full"
              aria-hidden="true"
            />
            <span>{progress.currentActivity}</span>
          </div>
        )}

        {/* Error message */}
        {progress.errorMessage && (
          <div
            className="p-3 mb-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md text-sm text-red-700 dark:text-red-400"
            role="alert"
          >
            <strong>{t('autoPRReview.error')}:</strong> {progress.errorMessage}
          </div>
        )}
      </div>

      {/* CI Checks section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
        <button
          type="button"
          onClick={toggleCIDetails}
          className="flex items-center justify-between w-full text-left"
          aria-expanded={showCIDetails}
          aria-controls="ci-checks-details"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('autoPRReview.ciChecks')}
          </span>
          <div className="flex items-center gap-2">
            <CISummaryBadge
              summary={progress.ciSummary}
              status={progress.status}
              ciCompleted={progress.ciCompleted}
              ciPassed={progress.ciPassed}
              t={t}
            />
            <span
              className="text-gray-400 transform transition-transform duration-200"
              style={{ transform: showCIDetails ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            >
              {'\u25BC'} {/* Down arrow */}
            </span>
          </div>
        </button>

        {/* CI checks details (expandable) */}
        {showCIDetails && progress.ciChecks.length > 0 && (
          <div
            id="ci-checks-details"
            className="mt-2 pl-2 border-l-2 border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto"
          >
            {progress.ciChecks.map((check, index) => (
              <CICheckItem key={`${check.name}-${index}`} check={check} t={t} />
            ))}
          </div>
        )}

        {showCIDetails && progress.ciChecks.length === 0 && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
            {['pr_reviewing', 'pr_fixing', 'pr_ready_to_merge', 'completed'].includes(progress.status)
              ? t('autoPRReview.ciPassedNoDetails')
              : t('autoPRReview.noChecksYet')}
          </p>
        )}
      </div>

      {/* External Bots section */}
      {progress.externalBots.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
            {t('autoPRReview.externalBots')}
          </span>
          <div className="flex flex-wrap gap-2">
            {progress.externalBots.map((bot) => (
              <BotStatusBadge key={bot.botName} bot={bot} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* SHA info (for debugging/verification) */}
      {progress.currentSha && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span>{t('autoPRReview.sha')}:</span>
            <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              {progress.currentSha.substring(0, 7)}
            </code>
            {progress.originalSha && progress.currentSha !== progress.originalSha && (
              <span className="text-amber-500 dark:text-amber-400" title={t('autoPRReview.shaChanged')}>
                {'\u26A0'} {t('autoPRReview.changed')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ready to merge notice */}
      {progress.status === 'pr_ready_to_merge' && (
        <div
          className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-md text-sm text-green-700 dark:text-green-400"
          role="status"
        >
          <strong>{t('autoPRReview.readyForReview')}</strong>
          <p className="mt-1">{t('autoPRReview.humanApprovalRequired')}</p>
        </div>
      )}

      {/* Needs human review notice */}
      {progress.status === 'needs_human_review' && (
        <div
          className="mt-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-md text-sm text-yellow-700 dark:text-yellow-400"
          role="status"
        >
          <strong>{t('autoPRReview.needsHumanReviewTitle')}</strong>
          <p className="mt-1">{t('autoPRReview.needsHumanReviewMessage')}</p>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h4
              id="cancel-dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2"
            >
              {t('autoPRReview.cancelConfirmTitle')}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('autoPRReview.cancelConfirmMessage')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelDismiss}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                {t('autoPRReview.keepRunning')}
              </button>
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={isCancelling}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50"
              >
                {isCancelling ? t('autoPRReview.cancelling') : t('autoPRReview.confirmCancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Exports
// =============================================================================

export type { AutoPRReviewProgress, CICheckStatus, ExternalBotStatus };

export default AutoPRReviewProgressCard;
