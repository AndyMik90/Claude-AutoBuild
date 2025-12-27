/**
 * Main orchestration hook that combines all Linear import functionality
 * Manages state coordination between teams, projects, issues, filtering, selection, and import
 */

import { useState, useEffect, useCallback } from 'react';
import { useLinearTeams } from './useLinearTeams';
import { useLinearProjects } from './useLinearProjects';
import { useLinearIssues } from './useLinearIssues';
import { useIssueFiltering } from './useIssueFiltering';
import { useIssueSelection } from './useIssueSelection';
import { useLinearImport } from './useLinearImport';
import type { LinearImportResult } from '../types';

export interface UseLinearImportModalProps {
  projectId: string;
  open: boolean;
  onImportComplete?: (result: LinearImportResult) => void;
}

export function useLinearImportModal({
  projectId,
  open,
  onImportComplete
}: UseLinearImportModalProps) {
  // Selection state
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Filter/search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<string>('all');

  // Load teams
  const {
    teams,
    isLoadingTeams,
    error: teamsError,
    setError: setTeamsError
  } = useLinearTeams(projectId, open);

  // Auto-select first team if only one
  useEffect(() => {
    if (teams.length === 1 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Load projects for selected team
  const {
    projects,
    isLoadingProjects,
    error: projectsError,
    setError: setProjectsError
  } = useLinearProjects(projectId, selectedTeamId);

  // Load issues for selected team/project
  const {
    issues,
    isLoadingIssues,
    error: issuesError,
    setError: setIssuesError
  } = useLinearIssues(projectId, selectedTeamId, selectedProjectId, () => {
    // Clear selection when issues change
    setSelectedIssueIds(new Set());
  });

  // Filter issues based on search and state
  const { filteredIssues, uniqueStateTypes } = useIssueFiltering(
    issues,
    searchQuery,
    filterState
  );

  // Manage issue selection
  const { selectedIssueIds, setSelectedIssueIds, selectionControls } =
    useIssueSelection(filteredIssues);

  // Import functionality
  const {
    isImporting,
    importResult,
    error: importError,
    setError: setImportError,
    handleImport
  } = useLinearImport(projectId, onImportComplete);

  // Combined error state (prioritize errors in order of importance)
  const error = importError || issuesError || projectsError || teamsError;
  const setError = useCallback((err: string | null) => {
    setImportError(err);
    setIssuesError(err);
    setProjectsError(err);
    setTeamsError(err);
  }, [setImportError, setIssuesError, setProjectsError, setTeamsError]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    // Force re-fetch by temporarily clearing and resetting team
    const currentTeamId = selectedTeamId;
    setSelectedTeamId('');
    setTimeout(() => setSelectedTeamId(currentTeamId), 0);
  }, [selectedTeamId]);

  // Import handler
  const handleImportClick = useCallback(() => {
    handleImport(selectedIssueIds);
  }, [handleImport, selectedIssueIds]);

  // Reset state when modal closes
  const resetState = useCallback(() => {
    setSelectedTeamId('');
    setSelectedProjectId('');
    setSelectedIssueIds(new Set());
    setSearchQuery('');
    setFilterState('all');
    setError(null);
  }, [setError, setSelectedIssueIds]);

  return {
    // Data
    teams,
    projects,
    issues: filteredIssues,
    uniqueStateTypes,

    // Selection state
    selectedTeamId,
    selectedProjectId,
    selectedIssueIds,
    selectionControls,

    // Filter state
    searchQuery,
    filterState,

    // Loading states
    isLoadingTeams,
    isLoadingProjects,
    isLoadingIssues,
    isImporting,

    // Error state
    error,
    setError,

    // Import result
    importResult,

    // Handlers
    setSelectedTeamId,
    setSelectedProjectId,
    setSearchQuery,
    setFilterState,
    handleRefresh,
    handleImport: handleImportClick,
    resetState
  };
}
