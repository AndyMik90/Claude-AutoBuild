import { useEffect, useCallback, useRef, useMemo } from "react";
import {
  useIssuesStore,
  useSyncStatusStore,
  loadGitHubIssues,
  checkGitHubConnection,
  type IssueFilterState,
} from "../../../stores/github";
import type { FilterState } from "../types";

export function useGitHubIssues(projectId: string | undefined) {
  const {
    issues,
    isLoading,
    error,
    selectedIssueNumber,
    filterState,
    selectIssue,
    setFilterState,
    getFilteredIssues,
    getOpenIssuesCount,
  } = useIssuesStore();

  const { syncStatus } = useSyncStatusStore();

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

  const handleFilterChange = useCallback(
    (state: FilterState) => {
      setFilterState(state);
      if (projectId) {
        loadGitHubIssues(projectId, state);
      }
    },
    [projectId, setFilterState]
  );

  // Compute selectedIssue from issues array
  const selectedIssue = useMemo(() => {
    return issues.find((i) => i.number === selectedIssueNumber) || null;
  }, [issues, selectedIssueNumber]);

  return {
    issues,
    syncStatus,
    isLoading,
    error,
    selectedIssueNumber,
    selectedIssue,
    filterState,
    selectIssue,
    getFilteredIssues,
    getOpenIssuesCount,
    handleRefresh,
    handleFilterChange,
  };
}
