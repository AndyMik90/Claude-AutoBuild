import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AutoFixConfig,
  AutoFixQueueItem,
  IssueBatch,
  BatchProgress
} from '../../../../preload/api/modules/github-api';

/**
 * Hook for managing auto-fix state with batching support
 */
export function useAutoFix(projectId: string | undefined) {
  const [config, setConfig] = useState<AutoFixConfig | null>(null);
  const [queue, setQueue] = useState<AutoFixQueueItem[]>([]);
  const [batches, setBatches] = useState<IssueBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // Ref for auto-fix interval
  const autoFixIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load config, queue, and batches
  const loadData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const [configResult, queueResult, batchesResult] = await Promise.all([
        window.electronAPI.github.getAutoFixConfig(projectId),
        window.electronAPI.github.getAutoFixQueue(projectId),
        window.electronAPI.github.getBatches(projectId),
      ]);

      setConfig(configResult);
      setQueue(queueResult);
      setBatches(batchesResult);
    } catch (error) {
      console.error('Failed to load auto-fix data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load on mount and when projectId changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for completion events to refresh queue
  useEffect(() => {
    if (!projectId) return;

    const cleanupComplete = window.electronAPI.github.onAutoFixComplete(
      (eventProjectId: string) => {
        if (eventProjectId === projectId) {
          window.electronAPI.github.getAutoFixQueue(projectId).then(setQueue);
        }
      }
    );

    return cleanupComplete;
  }, [projectId]);

  // Listen for batch events
  useEffect(() => {
    if (!projectId) return;

    const cleanupProgress = window.electronAPI.github.onBatchProgress(
      (eventProjectId: string, progress: BatchProgress) => {
        if (eventProjectId === projectId) {
          setBatchProgress(progress);
          if (progress.phase === 'complete') {
            setIsBatchRunning(false);
          }
        }
      }
    );

    const cleanupComplete = window.electronAPI.github.onBatchComplete(
      (eventProjectId: string, newBatches: IssueBatch[]) => {
        if (eventProjectId === projectId) {
          setBatches(newBatches);
          setIsBatchRunning(false);
          setBatchProgress(null);
        }
      }
    );

    const cleanupError = window.electronAPI.github.onBatchError(
      (eventProjectId: string, _error: { error: string }) => {
        if (eventProjectId === projectId) {
          setIsBatchRunning(false);
          setBatchProgress(null);
        }
      }
    );

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
    };
  }, [projectId]);

  // Get queue item for a specific issue
  const getQueueItem = useCallback(
    (issueNumber: number): AutoFixQueueItem | null => {
      return queue.find(item => item.issueNumber === issueNumber) || null;
    },
    [queue]
  );

  // Save config and optionally start/stop auto-fix
  const saveConfig = useCallback(
    async (newConfig: AutoFixConfig): Promise<boolean> => {
      if (!projectId) return false;

      try {
        const success = await window.electronAPI.github.saveAutoFixConfig(projectId, newConfig);
        if (success) {
          setConfig(newConfig);
        }
        return success;
      } catch (error) {
        console.error('Failed to save auto-fix config:', error);
        return false;
      }
    },
    [projectId]
  );

  // Start batch auto-fix for all open issues or specific issues
  const startBatchAutoFix = useCallback(
    (issueNumbers?: number[]) => {
      if (!projectId) return;

      setIsBatchRunning(true);
      setBatchProgress({
        phase: 'analyzing',
        progress: 0,
        message: 'Starting batch analysis...',
        totalIssues: issueNumbers?.length ?? 0,
        batchCount: 0,
      });
      window.electronAPI.github.batchAutoFix(projectId, issueNumbers);
    },
    [projectId]
  );

  // Toggle auto-fix enabled (polling will handle new issues)
  const toggleAutoFix = useCallback(
    async (enabled: boolean) => {
      if (!config || !projectId) return false;

      const newConfig = { ...config, enabled };
      const success = await saveConfig(newConfig);

      // When enabled, the polling useEffect will automatically start checking
      // for new issues with auto-fix labels every 5 minutes

      return success;
    },
    [config, projectId, saveConfig]
  );

  // Auto-fix polling when enabled
  useEffect(() => {
    if (!projectId || !config?.enabled) {
      if (autoFixIntervalRef.current) {
        clearInterval(autoFixIntervalRef.current);
        autoFixIntervalRef.current = null;
      }
      return;
    }

    // Poll for new issues every 5 minutes when auto-fix is enabled
    const pollInterval = 5 * 60 * 1000; // 5 minutes

    autoFixIntervalRef.current = setInterval(async () => {
      try {
        // Check for new issues (no labels required)
        const newIssues = await window.electronAPI.github.checkNewIssues(projectId);
        if (newIssues.length > 0) {
          console.log(`[AutoFix] Found ${newIssues.length} new issues`);
          // Start individual auto-fix for each new issue (not batching)
          for (const issue of newIssues) {
            console.log(`[AutoFix] Starting auto-fix for issue #${issue.number}`);
            window.electronAPI.github.startAutoFix(projectId, issue.number);
          }
        }
      } catch (error) {
        console.error('[AutoFix] Error checking for new issues:', error);
      }
    }, pollInterval);

    return () => {
      if (autoFixIntervalRef.current) {
        clearInterval(autoFixIntervalRef.current);
        autoFixIntervalRef.current = null;
      }
    };
  }, [projectId, config?.enabled]);

  // Manually check for new issues (no labels required)
  const checkForNewIssues = useCallback(async () => {
    if (!projectId || !config?.enabled) return;

    try {
      const newIssues = await window.electronAPI.github.checkNewIssues(projectId);
      if (newIssues.length > 0) {
        console.log(`[AutoFix] Found ${newIssues.length} new issues`);
        // Start individual auto-fix for each new issue
        for (const issue of newIssues) {
          console.log(`[AutoFix] Starting auto-fix for issue #${issue.number}`);
          window.electronAPI.github.startAutoFix(projectId, issue.number);
        }
      }
    } catch (error) {
      console.error('[AutoFix] Error checking for new issues:', error);
    }
  }, [projectId, config?.enabled]);

  // Count active batches being processed
  const activeBatchCount = batches.filter(
    b => b.status === 'analyzing' || b.status === 'creating_spec' || b.status === 'building' || b.status === 'qa_review'
  ).length;

  return {
    config,
    queue,
    batches,
    isLoading,
    isBatchRunning,
    batchProgress,
    activeBatchCount,
    getQueueItem,
    saveConfig,
    toggleAutoFix,
    startBatchAutoFix,
    checkForNewIssues,
    refresh: loadData,
  };
}
