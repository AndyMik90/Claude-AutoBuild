import { useEffect, useCallback, useMemo } from "react";
import {
  useForgejoStore,
  loadForgejoIssues,
  checkForgejoConnection,
} from "../../../stores/forgejo-store";
import type { FilterState } from "../types";

export function useForgejoIssues(projectId: string | undefined) {
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
    getOpenIssuesCount,
  } = useForgejoStore();

  // Always check connection when component mounts or projectId changes
  useEffect(() => {
    if (projectId) {
      // Always check connection on mount (in case settings changed)
      checkForgejoConnection(projectId);
    }
  }, [projectId]);

  // Load issues when filter changes or after connection is established
  useEffect(() => {
    if (projectId && syncStatus?.connected) {
      loadForgejoIssues(projectId, filterState);
    }
  }, [projectId, filterState, syncStatus?.connected]);

  const handleRefresh = useCallback(() => {
    if (projectId) {
      // Re-check connection and reload issues
      checkForgejoConnection(projectId);
      loadForgejoIssues(projectId, filterState);
    }
  }, [projectId, filterState]);

  const handleFilterChange = useCallback(
    (state: FilterState) => {
      setFilterState(state);
      if (projectId) {
        loadForgejoIssues(projectId, state);
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
