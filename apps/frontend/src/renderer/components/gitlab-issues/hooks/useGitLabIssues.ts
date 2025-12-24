import { useEffect, useCallback, useRef } from 'react';
import { useGitLabStore, loadGitLabIssues, checkGitLabConnection } from '../../../stores/gitlab-store';
import type { FilterState } from '../types';

/**
 * Exposes GitLab issue state and related actions scoped to the given project.
 *
 * Provides current issues, sync status, loading/error state, selection and filtering state,
 * helper selectors, and handlers to refresh or change filters for the specified project.
 *
 * @param projectId - The GitLab project identifier used to scope issues; pass `undefined` to disable loading for no project.
 * @returns An object containing:
 *  - `issues` — all issues for the current project and filter
 *  - `syncStatus` — current synchronization/connection status with GitLab
 *  - `isLoading` — `true` when issues are being loaded
 *  - `error` — any error encountered while loading or syncing
 *  - `selectedIssueIid` — the currently selected issue IID, if any
 *  - `filterState` — current issue filter state
 *  - `selectIssue` — function to set the selected issue IID
 *  - `getFilteredIssues` — selector that returns issues after applying filters
 *  - `getOpenIssuesCount` — selector that returns the count of open issues
 *  - `handleRefresh` — reloads connection status and issues for the current project
 *  - `handleFilterChange` — updates the filter state and reloads issues for the new filter
 */
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
    getOpenIssuesCount
  } = useGitLabStore();

  // Track if we've checked connection for this mount
  const hasCheckedRef = useRef(false);

  // Always check connection when component mounts or projectId changes
  useEffect(() => {
    if (projectId) {
      // Always check connection on mount (in case settings changed)
      checkGitLabConnection(projectId);
      hasCheckedRef.current = true;
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

  const handleFilterChange = useCallback((state: FilterState) => {
    setFilterState(state);
    if (projectId) {
      loadGitLabIssues(projectId, state);
    }
  }, [projectId, setFilterState]);

  return {
    issues,
    syncStatus,
    isLoading,
    error,
    selectedIssueIid,
    filterState,
    selectIssue,
    getFilteredIssues,
    getOpenIssuesCount,
    handleRefresh,
    handleFilterChange
  };
}