/**
 * Usage Indicator - Real-time Claude usage display in header
 *
 * Displays current session/weekly usage as a badge with color-coded status.
 * Shows detailed breakdown on hover.
 * Shows countdown timer when usage is at 99% or higher.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import type { ClaudeUsageSnapshot } from '../../shared/types/agent';
import { RESETTING_SOON } from '../../shared/types/agent';

export function UsageIndicator() {
  const { t } = useTranslation('navigation');
  const [usage, setUsage] = useState<ClaudeUsageSnapshot | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState<string>('');

  // Calculate countdown from timestamp
  const calculateCountdown = useCallback((timestamp?: number): string => {
    if (!timestamp) return '';

    const now = Date.now();
    const diffMs = timestamp - now;

    if (diffMs <= 0) return '';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`;
    }
    return `${diffHours}h ${diffMins}m`;
  }, []);

  // Format reset time for display, handling sentinel value
  const formatResetTime = useCallback((resetTime?: string): string => {
    if (!resetTime) return '';
    if (resetTime === RESETTING_SOON) {
      return t('usageIndicator.resettingSoon');
    }
    return resetTime;
  }, [t]);

  // Update countdown every second when usage is high
  useEffect(() => {
    if (!usage) return;

    const maxUsage = Math.max(usage.sessionPercent, usage.weeklyPercent);
    if (maxUsage < 99) {
      setCountdown('');
      return;
    }

    // Derive reset timestamp based on limitType
    const resetTimestamp = usage.limitType === 'weekly'
      ? usage.weeklyResetTimestamp
      : usage.sessionResetTimestamp;
    setCountdown(calculateCountdown(resetTimestamp));

    // Update every second
    const intervalId = setInterval(() => {
      setCountdown(calculateCountdown(resetTimestamp));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [usage, calculateCountdown, usage?.limitType, usage?.weeklyResetTimestamp, usage?.sessionResetTimestamp]);

  useEffect(() => {
    // Listen for usage updates from main process
    const unsubscribe = window.electronAPI.onUsageUpdated((snapshot: ClaudeUsageSnapshot) => {
      setUsage(snapshot);
      setIsVisible(true);
    });

    // Request initial usage on mount
    window.electronAPI.requestUsageUpdate().then((result) => {
      if (result.success && result.data) {
        setUsage(result.data);
        setIsVisible(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!isVisible || !usage) {
    return null;
  }

  // Determine color based on highest usage percentage
  const maxUsage = Math.max(usage.sessionPercent, usage.weeklyPercent);
  const showCountdown = maxUsage >= 99;

  const colorClasses =
    maxUsage >= 95 ? 'text-red-500 bg-red-500/10 border-red-500/20' :
    maxUsage >= 91 ? 'text-orange-500 bg-orange-500/10 border-orange-500/20' :
    maxUsage >= 71 ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' :
    'text-green-500 bg-green-500/10 border-green-500/20';

  const Icon =
    maxUsage >= 91 ? AlertCircle :
    maxUsage >= 71 ? TrendingUp :
    Activity;

  // Provider-specific labels
  const isZai = usage.provider === 'zai';
  const sessionLabel = isZai ? t('usageIndicator.tokenUsage') : t('usageIndicator.sessionUsage');
  const weeklyLabel = isZai ? t('usageIndicator.monthlyToolUsage') : t('usageIndicator.weeklyUsage');

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-all hover:opacity-80 ${colorClasses}`}
            aria-label={t('usageIndicator.ariaLabel')}
          >
            {showCountdown ? (
              <Clock className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            <span className="text-xs font-semibold font-mono">
              {Math.round(maxUsage)}%
            </span>
            {showCountdown && countdown && (
              <span className="text-[10px] font-medium opacity-80">
                {countdown}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs w-64">
          <div className="space-y-2">
            {/* Session/Token usage */}
            <div>
              <div className="flex items-center justify-between gap-4 mb-1">
                <span className="text-muted-foreground font-medium">{sessionLabel}</span>
                <span className="font-semibold tabular-nums">{Math.round(usage.sessionPercent)}%</span>
              </div>
              {usage.sessionResetTime && (
                <div className="text-[10px] text-muted-foreground">
                  {t('usageIndicator.resets')}: {formatResetTime(usage.sessionResetTime)}
                </div>
              )}
              {/* Progress bar */}
              <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    usage.sessionPercent >= 95 ? 'bg-red-500' :
                    usage.sessionPercent >= 91 ? 'bg-orange-500' :
                    usage.sessionPercent >= 71 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(usage.sessionPercent, 100)}%` }}
                />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Weekly/Monthly Tool usage */}
            <div>
              <div className="flex items-center justify-between gap-4 mb-1">
                <span className="text-muted-foreground font-medium">{weeklyLabel}</span>
                <span className="font-semibold tabular-nums">{Math.round(usage.weeklyPercent)}%</span>
              </div>
              {usage.weeklyResetTime && (
                <div className="text-[10px] text-muted-foreground">
                  {t('usageIndicator.resets')}: {formatResetTime(usage.weeklyResetTime)}
                </div>
              )}
              {/* Progress bar */}
              <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    usage.weeklyPercent >= 95 ? 'bg-red-500' :
                    usage.weeklyPercent >= 91 ? 'bg-orange-500' :
                    usage.weeklyPercent >= 71 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(usage.weeklyPercent, 100)}%` }}
                />
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Active profile */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{t('usageIndicator.activeAccount')}</span>
              <span className="font-semibold text-primary">{usage.profileName}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
