import { useEffect, useCallback, useMemo } from "react";
import {
  useGitLabStore,
  loadGitLabIssues,
  checkGitLabConnection,
} from "../../../stores/gitlab-store";
import type { FilterState } from "../types";

export function useGitLabIssues(projectId: string | undefined) {
  const {
    issues,
    syncStatus,
    isLoading,
    error,
    selectedIssueIid,
    filterState,
    selectIssue,
    setFilterState,
    getFilteredIssues,
    getOpenIssuesCount,
  } = useGitLabStore();

  // Always check connection when component mounts or projectId changes
  useEffect(() => {
    if (projectId) {
      // Always check connection on mount (in case settings changed)
      checkGitLabConnection(projectId);
    }
  }, [projectId]);

  // Load issues when filter changes or after connection is established
  useEffect(() => {
    if (projectId && syncStatus?.connected) {
      loadGitLabIssues(projectId, filterState);
    }
  }, [projectId, filterState, syncStatus?.connected]);

  const handleRefresh = useCallback(() => {
    if (projectId) {
      // Re-check connection and reload issues
      checkGitLabConnection(projectId);
      loadGitLabIssues(projectId, filterState);
    }
  }, [projectId, filterState]);

  const handleFilterChange = useCallback(
    (state: FilterState) => {
      setFilterState(state);
      if (projectId) {
        loadGitLabIssues(projectId, state);
      }
    },
    [projectId, setFilterState]
  );

  // Compute selectedIssue from issues array
  const selectedIssue = useMemo(() => {
    return issues.find((i) => i.iid === selectedIssueIid) || null;
  }, [issues, selectedIssueIid]);

  return {
    issues,
    syncStatus,
    isLoading,
    error,
    selectedIssueIid,
    selectedIssue,
    filterState,
    selectIssue,
    getFilteredIssues,
    getOpenIssuesCount,
    handleRefresh,
    handleFilterChange,
  };
}
