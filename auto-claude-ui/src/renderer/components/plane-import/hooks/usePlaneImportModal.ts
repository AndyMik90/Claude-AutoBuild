/**
 * Main orchestration hook that combines all Plane import functionality
 * Manages state coordination between projects, work items, filtering, selection, and import
 */

import { useState, useEffect, useCallback } from 'react';
import { usePlaneProjects } from './usePlaneProjects';
import { usePlaneWorkItems } from './usePlaneWorkItems';
import { usePlaneStates } from './usePlaneStates';
import { useWorkItemFiltering } from './useWorkItemFiltering';
import { useWorkItemSelection } from './useWorkItemSelection';
import { usePlaneImport } from './usePlaneImport';
import type { PlaneImportResult } from '../types';

export interface UsePlaneImportModalProps {
  projectId: string;
  open: boolean;
  defaultWorkspaceSlug?: string;
  onImportComplete?: (result: PlaneImportResult) => void;
}

// LocalStorage keys for persisting selections
const STORAGE_KEYS = {
  WORKSPACE_SLUG: 'plane-import-workspace-slug',
  PROJECT_ID: 'plane-import-project-id',
  FILTER_STATE: 'plane-import-filter-state'
};

export function usePlaneImportModal({
  projectId,
  open,
  defaultWorkspaceSlug = '',
  onImportComplete
}: UsePlaneImportModalProps) {
  // Load persisted values from localStorage
  const getPersistedValue = (key: string, fallback: string) => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  };

  // Workspace and project selection state - restore from localStorage
  const [workspaceSlug, setWorkspaceSlugState] = useState<string>(
    () => getPersistedValue(STORAGE_KEYS.WORKSPACE_SLUG, defaultWorkspaceSlug)
  );
  const [selectedProjectId, setSelectedProjectIdState] = useState<string>(
    () => getPersistedValue(STORAGE_KEYS.PROJECT_ID, '')
  );

  // Filter/search state - restore filter from localStorage
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStateGroup, setFilterStateGroupState] = useState<string>(
    () => getPersistedValue(STORAGE_KEYS.FILTER_STATE, 'all')
  );

  // Persist workspace slug to localStorage
  const setWorkspaceSlug = useCallback((slug: string) => {
    setWorkspaceSlugState(slug);
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_SLUG, slug);
    } catch { /* ignore */ }
  }, []);

  // Persist project ID to localStorage
  const setSelectedProjectId = useCallback((id: string) => {
    setSelectedProjectIdState(id);
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECT_ID, id);
    } catch { /* ignore */ }
  }, []);

  // Persist filter state to localStorage
  const setFilterStateGroup = useCallback((state: string) => {
    setFilterStateGroupState(state);
    try {
      localStorage.setItem(STORAGE_KEYS.FILTER_STATE, state);
    } catch { /* ignore */ }
  }, []);

  // Reset workspace slug when default changes (only if not already set)
  useEffect(() => {
    if (defaultWorkspaceSlug && !workspaceSlug) {
      setWorkspaceSlug(defaultWorkspaceSlug);
    }
  }, [defaultWorkspaceSlug, workspaceSlug, setWorkspaceSlug]);

  // Load projects for workspace
  const {
    projects,
    isLoadingProjects,
    error: projectsError,
    setError: setProjectsError
  } = usePlaneProjects(projectId, workspaceSlug, open);

  // Auto-select project: use persisted if valid, otherwise first if only one
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      // Check if persisted project exists in loaded projects
      const persistedId = getPersistedValue(STORAGE_KEYS.PROJECT_ID, '');
      const persistedExists = projects.some(p => p.id === persistedId);
      if (persistedExists) {
        setSelectedProjectIdState(persistedId);
      } else if (projects.length === 1) {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [projects, selectedProjectId, setSelectedProjectId]);

  // Load work items for selected project
  const {
    workItems,
    isLoadingWorkItems,
    error: workItemsError,
    setError: setWorkItemsError
  } = usePlaneWorkItems(projectId, workspaceSlug, selectedProjectId, () => {
    // Clear selection when work items change
    setSelectedWorkItemIds(new Set());
  });

  // Load states for selected project (for filter dropdown and state name resolution)
  const { states } = usePlaneStates(projectId, workspaceSlug, selectedProjectId);

  // Filter work items based on search and state
  const { filteredWorkItems, uniqueStates } = useWorkItemFiltering(
    workItems,
    states,
    searchQuery,
    filterStateGroup
  );

  // Reset filter if persisted value doesn't match any available state
  useEffect(() => {
    if (filterStateGroup !== 'all' && uniqueStates.length > 0) {
      const filterExists = uniqueStates.some(s => s.id === filterStateGroup);
      if (!filterExists) {
        setFilterStateGroup('all');
      }
    }
  }, [uniqueStates, filterStateGroup, setFilterStateGroup]);

  // Manage work item selection
  const { selectedWorkItemIds, setSelectedWorkItemIds, selectionControls } =
    useWorkItemSelection(filteredWorkItems);

  // Get the selected project's identifier (e.g., "PLAT" for "PLAT-25")
  const selectedProjectIdentifier = projects.find(p => p.id === selectedProjectId)?.identifier || '';

  // Import functionality
  const {
    isImporting,
    importResult,
    error: importError,
    setError: setImportError,
    handleImport
  } = usePlaneImport(projectId, workspaceSlug, selectedProjectId, selectedProjectIdentifier, onImportComplete);

  // Combined error state (prioritize errors in order of importance)
  const error = importError || workItemsError || projectsError;
  const setError = useCallback((err: string | null) => {
    setImportError(err);
    setWorkItemsError(err);
    setProjectsError(err);
  }, [setImportError, setWorkItemsError, setProjectsError]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    // Force re-fetch by temporarily clearing and resetting project
    const currentProjectId = selectedProjectId;
    setSelectedProjectId('');
    setTimeout(() => setSelectedProjectId(currentProjectId), 0);
  }, [selectedProjectId, setSelectedProjectId]);

  // Import handler
  const handleImportClick = useCallback(() => {
    handleImport(selectedWorkItemIds);
  }, [handleImport, selectedWorkItemIds]);

  // Reset state when modal closes - preserve project/filter selections for next time
  const resetState = useCallback(() => {
    // Clear transient state only, keep project/filter persisted
    setSelectedWorkItemIds(new Set());
    setSearchQuery('');
    setError(null);
  }, [setError, setSelectedWorkItemIds]);

  return {
    // Data
    projects,
    workItems: filteredWorkItems,
    uniqueStates,

    // Selection state
    workspaceSlug,
    selectedProjectId,
    selectedWorkItemIds,
    selectionControls,

    // Filter state
    searchQuery,
    filterStateGroup,

    // Loading states
    isLoadingProjects,
    isLoadingWorkItems,
    isImporting,

    // Error state
    error,
    setError,

    // Import result
    importResult,

    // Handlers
    setWorkspaceSlug,
    setSelectedProjectId,
    setSearchQuery,
    setFilterStateGroup,
    handleRefresh,
    handleImport: handleImportClick,
    resetState
  };
}
