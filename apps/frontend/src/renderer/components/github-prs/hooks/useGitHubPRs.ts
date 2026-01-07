import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  PRData,
  PRReviewResult,
  PRReviewProgress,
  NewCommitsCheck
} from '../../../../preload/api/modules/github-api';
import { usePRReviewStore, startPRReview as storeStartPRReview, startFollowupReview as storeStartFollowupReview } from '../../../stores/github';

// Re-export types for consumers
export type { PRData, PRReviewResult, PRReviewProgress };
export type { PRReviewFinding } from '../../../../preload/api/modules/github-api';

interface UseGitHubPRsOptions {
  /** Whether the component is currently active/visible */
  isActive?: boolean;
}

interface UseGitHubPRsResult {
  prs: PRData[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isLoadingPRDetails: boolean; // Loading full PR details including files
  error: string | null;
  selectedPR: PRData | null;
  selectedPRNumber: number | null;
  reviewResult: PRReviewResult | null;
  reviewProgress: PRReviewProgress | null;
  isReviewing: boolean;
  isConnected: boolean;
  repoFullName: string | null;
  activePRReviews: number[]; // PR numbers currently being reviewed
  hasMore: boolean; // Whether there are more PRs to load
  selectPR: (prNumber: number | null) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  runReview: (prNumber: number) => Promise<void>;
  runFollowupReview: (prNumber: number) => Promise<void>;
  checkNewCommits: (prNumber: number) => Promise<NewCommitsCheck>;
  cancelReview: (prNumber: number) => Promise<boolean>;
  postReview: (prNumber: number, selectedFindingIds?: string[], options?: { forceApprove?: boolean }) => Promise<boolean>;
  postComment: (prNumber: number, body: string) => Promise<boolean>;
  mergePR: (prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  assignPR: (prNumber: number, username: string) => Promise<boolean>;
  getReviewStateForPR: (prNumber: number) => { isReviewing: boolean; progress: PRReviewProgress | null; result: PRReviewResult | null; previousResult: PRReviewResult | null; error: string | null; newCommitsCheck?: NewCommitsCheck | null } | null;
}

export function useGitHubPRs(projectId?: string, options: UseGitHubPRsOptions = {}): UseGitHubPRsResult {
  const { isActive = true } = options;
  const [prs, setPrs] = useState<PRData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingPRDetails, setIsLoadingPRDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPRNumber, setSelectedPRNumber] = useState<number | null>(null);
  const [selectedPRDetails, setSelectedPRDetails] = useState<PRData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [repoFullName, setRepoFullName] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Track previous isActive state to detect tab navigation
  const wasActiveRef = useRef(isActive);
  // Track if initial load has happened
  const hasLoadedRef = useRef(false);

  // Get PR review state from the global store
  const prReviews = usePRReviewStore((state) => state.prReviews);
  const getPRReviewState = usePRReviewStore((state) => state.getPRReviewState);
  const getActivePRReviews = usePRReviewStore((state) => state.getActivePRReviews);
  const setNewCommitsCheckAction = usePRReviewStore((state) => state.setNewCommitsCheck);

  // Get review state for the selected PR from the store
  const selectedPRReviewState = useMemo(() => {
    if (!projectId || selectedPRNumber === null) return null;
    return getPRReviewState(projectId, selectedPRNumber);
  }, [projectId, selectedPRNumber, prReviews, getPRReviewState]);

  // Derive values from store state
  const reviewResult = selectedPRReviewState?.result ?? null;
  const reviewProgress = selectedPRReviewState?.progress ?? null;
  const isReviewing = selectedPRReviewState?.isReviewing ?? false;

  // Get list of PR numbers currently being reviewed
  const activePRReviews = useMemo(() => {
    if (!projectId) return [];
    return getActivePRReviews(projectId).map(review => review.prNumber);
  }, [projectId, prReviews, getActivePRReviews]);

  // Helper to get review state for any PR
  const getReviewStateForPR = useCallback((prNumber: number) => {
    if (!projectId) return null;
    const state = getPRReviewState(projectId, prNumber);
    if (!state) return null;
    return {
      isReviewing: state.isReviewing,
      progress: state.progress,
      result: state.result,
      previousResult: state.previousResult,
      error: state.error,
      newCommitsCheck: state.newCommitsCheck
    };
  }, [projectId, prReviews, getPRReviewState]);

  // Use detailed PR data if available (includes files), otherwise fall back to list data
  const selectedPR = selectedPRDetails || prs.find(pr => pr.number === selectedPRNumber) || null;

  // Check connection and fetch PRs
  const fetchPRs = useCallback(async (page: number = 1, append: boolean = false) => {
    if (!projectId) return;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // First check connection
      const connectionResult = await window.electronAPI.github.checkGitHubConnection(projectId);
      if (connectionResult.success && connectionResult.data) {
        setIsConnected(connectionResult.data.connected);
        setRepoFullName(connectionResult.data.repoFullName || null);

        if (connectionResult.data.connected) {
          // Fetch PRs with pagination
          const result = await window.electronAPI.github.listPRs(projectId, page);
          if (result) {
            // Check if there are more PRs to load (GitHub returns up to 100 per page)
            setHasMore(result.length === 100);
            setCurrentPage(page);

            if (append) {
              // Append to existing PRs, deduplicating by PR number
              setPrs(prevPrs => {
                const existingNumbers = new Set(prevPrs.map(pr => pr.number));
                const newPrs = result.filter(pr => !existingNumbers.has(pr.number));
                return [...prevPrs, ...newPrs];
              });
            } else {
              setPrs(result);
            }

            // Batch preload review results for PRs not in store (single IPC call)
            const prsNeedingPreload = result.filter(pr => {
              const existingState = getPRReviewState(projectId, pr.number);
              return !existingState?.result;
            });

            if (prsNeedingPreload.length > 0) {
              const prNumbers = prsNeedingPreload.map(pr => pr.number);
              const batchReviews = await window.electronAPI.github.getPRReviewsBatch(projectId, prNumbers);
              
              // Update store with loaded results
              for (const reviewResult of Object.values(batchReviews)) {
                if (reviewResult) {
                  usePRReviewStore.getState().setPRReviewResult(projectId, reviewResult, { preserveNewCommitsCheck: true });
                }
              }
            }

            // Note: New commits check is now lazy - only done when user selects a PR
            // or explicitly triggers a check. This significantly speeds up list loading.
          }
        }
      } else {
        setIsConnected(false);
        setRepoFullName(null);
        setError(connectionResult.error || 'Failed to check connection');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PRs');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [projectId, getPRReviewState, setNewCommitsCheckAction]);

  // Initial load
  useEffect(() => {
    if (projectId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchPRs(1, false);
    }
  }, [projectId, fetchPRs]);

  // Auto-refresh when tab becomes active (navigating to GitHub PRs tab)
  useEffect(() => {
    // Only refresh if transitioning from inactive to active AND we've loaded before
    if (isActive && !wasActiveRef.current && hasLoadedRef.current) {
      // Reset to first page and refresh
      setCurrentPage(1);
      setHasMore(true);
      fetchPRs(1, false);
    }
    wasActiveRef.current = isActive;
  }, [isActive, fetchPRs]);

  // Reset pagination and selected PR when project changes
  useEffect(() => {
    hasLoadedRef.current = false;
    setCurrentPage(1);
    setHasMore(true);
    setPrs([]);
    setSelectedPRNumber(null);
    setSelectedPRDetails(null);
  }, [projectId]);

  // No need for local IPC listeners - they're handled globally in github-store

  const selectPR = useCallback((prNumber: number | null) => {
    setSelectedPRNumber(prNumber);
    // Note: Don't reset review result - it comes from the store now
    // and persists across navigation

    // Clear previous detailed PR data when deselecting
    if (prNumber === null) {
      setSelectedPRDetails(null);
      return;
    }

    if (prNumber && projectId) {
      // Fetch full PR details including files
      setIsLoadingPRDetails(true);
      window.electronAPI.github.getPR(projectId, prNumber)
        .then(prDetails => {
          if (prDetails) {
            setSelectedPRDetails(prDetails);
          }
        })
        .catch(err => {
          console.warn(`Failed to fetch PR details for #${prNumber}:`, err);
        })
        .finally(() => {
          setIsLoadingPRDetails(false);
        });

      // Load existing review from disk if not already in store
      const existingState = getPRReviewState(projectId, prNumber);
      // Only fetch from disk if we don't have a result in the store
      if (!existingState?.result) {
        window.electronAPI.github.getPRReview(projectId, prNumber).then(result => {
          if (result) {
            // Update store with the loaded result
            // Preserve newCommitsCheck when loading existing review from disk
            usePRReviewStore.getState().setPRReviewResult(projectId, result, { preserveNewCommitsCheck: true });
            
            // Always check for new commits when selecting a reviewed PR
            // This ensures fresh data even if we have a cached check from earlier in the session
            const reviewedCommitSha = result.reviewedCommitSha || (result as any).reviewed_commit_sha;
            if (reviewedCommitSha) {
              window.electronAPI.github.checkNewCommits(projectId, prNumber).then(newCommitsResult => {
                setNewCommitsCheckAction(projectId, prNumber, newCommitsResult);
              }).catch(err => {
                console.warn(`Failed to check new commits for PR #${prNumber}:`, err);
              });
            }
          }
        });
      } else if (existingState?.result) {
        // Review already in store - always check for new commits to get fresh status
        const reviewedCommitSha = existingState.result.reviewedCommitSha || (existingState.result as any).reviewed_commit_sha;
        if (reviewedCommitSha) {
          window.electronAPI.github.checkNewCommits(projectId, prNumber).then(newCommitsResult => {
            setNewCommitsCheckAction(projectId, prNumber, newCommitsResult);
          }).catch(err => {
            console.warn(`Failed to check new commits for PR #${prNumber}:`, err);
          });
        }
      }
    }
  }, [projectId, getPRReviewState, setNewCommitsCheckAction]);

  const refresh = useCallback(async () => {
    setCurrentPage(1);
    setHasMore(true);
    await fetchPRs(1, false);
  }, [fetchPRs]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return;
    await fetchPRs(currentPage + 1, true);
  }, [fetchPRs, hasMore, isLoadingMore, isLoading, currentPage]);

  const runReview = useCallback(async (prNumber: number) => {
    if (!projectId) return;

    // Use the store function which handles both state and IPC
    storeStartPRReview(projectId, prNumber);
  }, [projectId]);

  const runFollowupReview = useCallback(async (prNumber: number) => {
    if (!projectId) return;

    // Use the store function which handles both state and IPC
    storeStartFollowupReview(projectId, prNumber);
  }, [projectId]);

  const checkNewCommits = useCallback(async (prNumber: number): Promise<NewCommitsCheck> => {
    if (!projectId) {
      return { hasNewCommits: false, newCommitCount: 0 };
    }

    try {
      const result = await window.electronAPI.github.checkNewCommits(projectId, prNumber);
      // Cache the result in the store so the list view can use it
      // Use the action from the hook subscription to ensure proper React re-renders
      setNewCommitsCheckAction(projectId, prNumber, result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for new commits');
      return { hasNewCommits: false, newCommitCount: 0 };
    }
  }, [projectId, setNewCommitsCheckAction]);

  const cancelReview = useCallback(async (prNumber: number): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const success = await window.electronAPI.github.cancelPRReview(projectId, prNumber);
      if (success) {
        // Update store to mark review as cancelled
        usePRReviewStore.getState().setPRReviewError(projectId, prNumber, 'Review cancelled by user');
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel review');
      return false;
    }
  }, [projectId]);

  const postReview = useCallback(async (prNumber: number, selectedFindingIds?: string[], options?: { forceApprove?: boolean }): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const success = await window.electronAPI.github.postPRReview(projectId, prNumber, selectedFindingIds, options);
      if (success) {
        // Reload review result to get updated postedAt and finding status
        const result = await window.electronAPI.github.getPRReview(projectId, prNumber);
        if (result) {
          // Preserve newCommitsCheck - posting doesn't change whether there are new commits
          usePRReviewStore.getState().setPRReviewResult(projectId, result, { preserveNewCommitsCheck: true });
        }
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post review');
      return false;
    }
  }, [projectId]);

  const postComment = useCallback(async (prNumber: number, body: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      return await window.electronAPI.github.postPRComment(projectId, prNumber, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
      return false;
    }
  }, [projectId]);

  const mergePR = useCallback(async (prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const success = await window.electronAPI.github.mergePR(projectId, prNumber, mergeMethod);
      if (success) {
        // Refresh PR list after merge
        await fetchPRs();
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge PR');
      return false;
    }
  }, [projectId, fetchPRs]);

  const assignPR = useCallback(async (prNumber: number, username: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const success = await window.electronAPI.github.assignPR(projectId, prNumber, username);
      if (success) {
        // Refresh PR list to update assignees
        await fetchPRs();
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign user');
      return false;
    }
  }, [projectId, fetchPRs]);

  return {
    prs,
    isLoading,
    isLoadingMore,
    isLoadingPRDetails,
    error,
    selectedPR,
    selectedPRNumber,
    reviewResult,
    reviewProgress,
    isReviewing,
    isConnected,
    repoFullName,
    activePRReviews,
    hasMore,
    selectPR,
    refresh,
    loadMore,
    runReview,
    runFollowupReview,
    checkNewCommits,
    cancelReview,
    postReview,
    postComment,
    mergePR,
    assignPR,
    getReviewStateForPR,
  };
}
