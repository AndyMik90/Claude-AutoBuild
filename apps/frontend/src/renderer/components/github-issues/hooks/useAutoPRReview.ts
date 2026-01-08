/**
 * useAutoPRReview Hook
 *
 * React hook for managing the Auto-PR-Review feature, which autonomously
 * reviews PRs, waits for CI checks and external bot reviews, and applies
 * fixes iteratively until the PR is ready for human approval.
 *
 * CRITICAL: This system NEVER auto-merges. Human approval is always required.
 *
 * Features:
 * - Config state management (max iterations, timeouts, allowed users)
 * - Queue management for active PR reviews
 * - IPC listeners for progress updates
 * - Cancellation support with graceful cleanup
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AutoPRReviewConfig,
  AutoPRReviewProgress,
  AutoPRReviewStatus,
  AutoPRReviewStartRequest,
  AutoPRReviewStartResponse,
  AutoPRReviewStopRequest,
  AutoPRReviewStopResponse,
  AutoPRReviewStatusRequest,
  AutoPRReviewStatusResponse,
} from '../../../../preload/api/modules/github-api';
import {
  DEFAULT_AUTO_PR_REVIEW_CONFIG,
  isTerminalStatus,
  isInProgressStatus,
} from '../../../../preload/api/modules/github-api';
import { IPC_CHANNELS } from '../../../../shared/constants';

// =============================================================================
// Types
// =============================================================================

/**
 * Hook return type for useAutoPRReview
 */
export interface UseAutoPRReviewReturn {
  /** Whether the Auto-PR-Review feature is globally enabled */
  isEnabled: boolean;

  /** Current configuration for Auto-PR-Review */
  config: AutoPRReviewConfig;

  /** List of active PR reviews being processed */
  activeReviews: AutoPRReviewProgress[];

  /** Whether the hook is currently loading initial state */
  isLoading: boolean;

  /** Error message if any operation failed */
  error: string | null;

  /** Enable or disable the Auto-PR-Review feature */
  setEnabled: (enabled: boolean) => Promise<void>;

  /** Update Auto-PR-Review configuration */
  updateConfig: (config: Partial<AutoPRReviewConfig>) => Promise<void>;

  /** Start Auto-PR-Review for a specific PR */
  startReview: (request: Omit<AutoPRReviewStartRequest, 'configOverrides'>) => Promise<AutoPRReviewStartResponse>;

  /** Cancel an active Auto-PR-Review */
  cancelReview: (repository: string, prNumber: number, reason?: string) => Promise<AutoPRReviewStopResponse>;

  /** Check if a specific PR is currently being reviewed */
  isReviewActive: (repository: string, prNumber: number) => boolean;

  /** Get progress for a specific PR review */
  getReviewProgress: (repository: string, prNumber: number) => AutoPRReviewProgress | undefined;

  /** Refresh the status of all active reviews */
  refreshStatus: () => Promise<void>;

  /** Clear any error state */
  clearError: () => void;
}

/**
 * Electron IPC API interface for type safety
 */
interface ElectronAPI {
  invoke: <T>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: string, listener: (...args: unknown[]) => void) => void;
  off: (channel: string, listener: (...args: unknown[]) => void) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the Electron IPC API from window
 */
function getElectronAPI(): ElectronAPI | null {
  if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: ElectronAPI }).electronAPI) {
    return (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
  }
  return null;
}

/**
 * Generate a unique key for tracking a PR review
 */
function getReviewKey(repository: string, prNumber: number): string {
  return `${repository}#${prNumber}`;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * React hook for managing Auto-PR-Review operations.
 *
 * @param options - Hook configuration options
 * @param options.pollInterval - Interval in ms to poll for status updates (default: 5000)
 * @param options.autoRefresh - Whether to automatically refresh status (default: true)
 * @returns Hook state and actions
 *
 * @example
 * ```tsx
 * function AutoPRReviewPanel() {
 *   const {
 *     isEnabled,
 *     config,
 *     activeReviews,
 *     setEnabled,
 *     startReview,
 *     cancelReview,
 *   } = useAutoPRReview();
 *
 *   return (
 *     <div>
 *       <Toggle checked={isEnabled} onChange={setEnabled} />
 *       {activeReviews.map(review => (
 *         <ReviewCard
 *           key={`${review.repository}#${review.prNumber}`}
 *           review={review}
 *           onCancel={() => cancelReview(review.repository, review.prNumber)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAutoPRReview(options?: {
  pollInterval?: number;
  autoRefresh?: boolean;
}): UseAutoPRReviewReturn {
  const { pollInterval = 5000, autoRefresh = true } = options ?? {};

  // State
  const [isEnabled, setIsEnabledState] = useState<boolean>(false);
  const [config, setConfig] = useState<AutoPRReviewConfig>(DEFAULT_AUTO_PR_REVIEW_CONFIG);
  const [activeReviews, setActiveReviews] = useState<AutoPRReviewProgress[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for tracking mounted state and intervals
  const isMountedRef = useRef<boolean>(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackedReviewsRef = useRef<Set<string>>(new Set());

  // Get Electron API
  const electronAPI = getElectronAPI();

  // ==========================================================================
  // Load Initial State
  // ==========================================================================

  const loadConfig = useCallback(async () => {
    if (!electronAPI) return;

    try {
      const result = await electronAPI.invoke<{ config: AutoPRReviewConfig; enabled: boolean }>(
        IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_GET_CONFIG
      );

      if (isMountedRef.current) {
        setConfig(result.config);
        setIsEnabledState(result.enabled);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to load config';
        setError(message);
      }
    }
  }, [electronAPI]);

  // ==========================================================================
  // Status Refresh
  // ==========================================================================

  const refreshStatus = useCallback(async () => {
    if (!electronAPI) return;

    const reviewsToCheck = Array.from(trackedReviewsRef.current);
    if (reviewsToCheck.length === 0) return;

    const updatedReviews: AutoPRReviewProgress[] = [];
    const reviewsToRemove: string[] = [];

    for (const key of reviewsToCheck) {
      const [repository, prNumberStr] = key.split('#');
      const prNumber = parseInt(prNumberStr, 10);

      if (isNaN(prNumber)) {
        reviewsToRemove.push(key);
        continue;
      }

      try {
        const result = await electronAPI.invoke<AutoPRReviewStatusResponse>(
          IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_GET_STATUS,
          { repository, prNumber } as AutoPRReviewStatusRequest
        );

        if (result.isActive && result.progress) {
          updatedReviews.push(result.progress);

          // Remove from tracking if in terminal state
          if (isTerminalStatus(result.progress.status)) {
            reviewsToRemove.push(key);
          }
        } else {
          // Review is no longer active
          reviewsToRemove.push(key);
        }
      } catch (err) {
        // Don't remove on error - might be temporary network issue
        // Keep tracking and try again on next poll
      }
    }

    // Update tracked reviews
    for (const key of reviewsToRemove) {
      trackedReviewsRef.current.delete(key);
    }

    if (isMountedRef.current) {
      setActiveReviews(updatedReviews);
    }
  }, [electronAPI]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!electronAPI) {
      setError('Electron API not available');
      return;
    }

    try {
      const result = await electronAPI.invoke<{ success: boolean; error?: string }>(
        IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_SAVE_CONFIG,
        { config: {}, enabled }
      );

      if (!result.success) {
        throw new Error(result.error ?? 'Failed to update enabled state');
      }

      if (isMountedRef.current) {
        setIsEnabledState(enabled);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to update enabled state';
        setError(message);
      }
    }
  }, [electronAPI]);

  const updateConfig = useCallback(async (configUpdate: Partial<AutoPRReviewConfig>) => {
    if (!electronAPI) {
      setError('Electron API not available');
      return;
    }

    try {
      // CRITICAL: Never allow disabling human approval
      const safeUpdate = {
        ...configUpdate,
        requireHumanApproval: true as const,
      };

      const result = await electronAPI.invoke<{ success: boolean; error?: string }>(
        IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_SAVE_CONFIG,
        { config: safeUpdate }
      );

      if (!result.success) {
        throw new Error(result.error ?? 'Failed to update config');
      }

      if (isMountedRef.current) {
        setConfig(prev => ({
          ...prev,
          ...safeUpdate,
          requireHumanApproval: true, // Always enforce
        }));
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to update config';
        setError(message);
      }
    }
  }, [electronAPI]);

  const startReview = useCallback(async (
    request: Omit<AutoPRReviewStartRequest, 'configOverrides'>
  ): Promise<AutoPRReviewStartResponse> => {
    if (!electronAPI) {
      return {
        success: false,
        message: 'Electron API not available',
        error: 'IPC communication not available',
      };
    }

    try {
      const fullRequest: AutoPRReviewStartRequest = {
        ...request,
      };

      const result = await electronAPI.invoke<AutoPRReviewStartResponse>(
        IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_START,
        fullRequest
      );

      if (result.success) {
        // Track this review for status polling
        const key = getReviewKey(request.repository, request.prNumber);
        trackedReviewsRef.current.add(key);

        // Immediately refresh to get initial state
        await refreshStatus();
      }

      if (isMountedRef.current && result.error) {
        setError(result.error);
      } else if (isMountedRef.current) {
        setError(null);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start review';
      if (isMountedRef.current) {
        setError(message);
      }
      return {
        success: false,
        message: 'Failed to start review',
        error: message,
      };
    }
  }, [electronAPI, refreshStatus]);

  const cancelReview = useCallback(async (
    repository: string,
    prNumber: number,
    reason?: string
  ): Promise<AutoPRReviewStopResponse> => {
    if (!electronAPI) {
      return {
        success: false,
        message: 'Electron API not available',
        error: 'IPC communication not available',
      };
    }

    try {
      const request: AutoPRReviewStopRequest = {
        repository,
        prNumber,
        reason,
      };

      const result = await electronAPI.invoke<AutoPRReviewStopResponse>(
        IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_STOP,
        request
      );

      if (result.success) {
        // Refresh to update the cancelled state in UI
        await refreshStatus();
      }

      if (isMountedRef.current && result.error) {
        setError(result.error);
      } else if (isMountedRef.current) {
        setError(null);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel review';
      if (isMountedRef.current) {
        setError(message);
      }
      return {
        success: false,
        message: 'Failed to cancel review',
        error: message,
      };
    }
  }, [electronAPI, refreshStatus]);

  const isReviewActive = useCallback((repository: string, prNumber: number): boolean => {
    const key = getReviewKey(repository, prNumber);
    return activeReviews.some(
      review => getReviewKey(review.repository, review.prNumber) === key &&
                isInProgressStatus(review.status)
    );
  }, [activeReviews]);

  const getReviewProgress = useCallback((
    repository: string,
    prNumber: number
  ): AutoPRReviewProgress | undefined => {
    return activeReviews.find(
      review => review.repository === repository && review.prNumber === prNumber
    );
  }, [activeReviews]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Load initial config
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      await loadConfig();
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
    };
  }, [loadConfig]);

  // Set up status polling
  useEffect(() => {
    if (!autoRefresh || !electronAPI) return;

    // Initial refresh
    refreshStatus();

    // Set up polling interval
    pollIntervalRef.current = setInterval(() => {
      if (trackedReviewsRef.current.size > 0) {
        refreshStatus();
      }
    }, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [autoRefresh, pollInterval, refreshStatus, electronAPI]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    isEnabled,
    config,
    activeReviews,
    isLoading,
    error,
    setEnabled,
    updateConfig,
    startReview,
    cancelReview,
    isReviewActive,
    getReviewProgress,
    refreshStatus,
    clearError,
  };
}

// =============================================================================
// Exports
// =============================================================================

export type {
  AutoPRReviewConfig,
  AutoPRReviewProgress,
  AutoPRReviewStatus,
  AutoPRReviewStartRequest,
  AutoPRReviewStartResponse,
  AutoPRReviewStopRequest,
  AutoPRReviewStopResponse,
  AutoPRReviewStatusRequest,
  AutoPRReviewStatusResponse,
};

export { DEFAULT_AUTO_PR_REVIEW_CONFIG, isTerminalStatus, isInProgressStatus };
