import { useEffect, useCallback, useRef } from 'react';
import { useGitHubStore, loadGitHubIssues, checkGitHubConnection } from '../../../stores/github-store';
import type { FilterState } from '../types';

export function useGitHubIssues(projectId: string | undefined) {
  const {
    issues,
    syncStatus,
    isLoading,
    error,
    selectedIssueNumber,
    filterState,
    selectIssue,
    setFilterState,
    getFilteredIssues,
    getOpenIssuesCount
  } = useGitHubStore();

  // Track if we've checked connection for this mount
  const hasCheckedRef = useRef(false);

  // Always check connection when component mounts or projectId changes
  useEffect(() => {
    if (projectId) {
      // Always check connection on mount (in case settings changed)
      checkGitHubConnection(projectId);
      hasCheckedRef.current = true;
    }
  }, [projectId]);

  // Load issues when filter changes or after connection is established
  useEffect(() => {
    if (projectId && syncStatus?.connected) {
      loadGitHubIssues(projectId, filterState);
    }
  }, [projectId, filterState, syncStatus?.connected]);

  const handleRefresh = useCallback(() => {
    if (projectId) {
      // Re-check connection and reload issues
      checkGitHubConnection(projectId);
      loadGitHubIssues(projectId, filterState);
    }
  }, [projectId, filterState]);

  const handleFilterChange = useCallback((state: FilterState) => {
    setFilterState(state);
    if (projectId) {
      loadGitHubIssues(projectId, state);
    }
  }, [projectId, setFilterState]);

  return {
    issues,
    syncStatus,
    isLoading,
    error,
    selectedIssueNumber,
    filterState,
    selectIssue,
    getFilteredIssues,
    getOpenIssuesCount,
    handleRefresh,
    handleFilterChange
  };
}
