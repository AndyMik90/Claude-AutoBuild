import { useState, useCallback } from 'react';
import { useProjectStore } from '../stores/project-store';
import { useGitHubIssues, useGitHubInvestigation, useIssueFiltering } from './github-issues/hooks';
import {
  NotConnectedState,
  EmptyState,
  IssueListHeader,
  IssueList,
  IssueDetail,
  InvestigationDialog
} from './github-issues/components';
import type { GitHubIssue } from '../../shared/types';
import type { GitHubIssuesProps } from './github-issues/types';

export function GitHubIssues({ onOpenSettings }: GitHubIssuesProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const {
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
  } = useGitHubIssues(selectedProject?.id);

  const {
    investigationStatus,
    lastInvestigationResult,
    startInvestigation,
    resetInvestigationStatus
  } = useGitHubInvestigation(selectedProject?.id);

  const { searchQuery, setSearchQuery, filteredIssues } = useIssueFiltering(getFilteredIssues());

  const [showInvestigateDialog, setShowInvestigateDialog] = useState(false);
  const [selectedIssueForInvestigation, setSelectedIssueForInvestigation] = useState<GitHubIssue | null>(null);

  const handleInvestigate = useCallback((issue: GitHubIssue) => {
    setSelectedIssueForInvestigation(issue);
    setShowInvestigateDialog(true);
  }, []);

  const handleStartInvestigation = useCallback(() => {
    if (selectedIssueForInvestigation) {
      startInvestigation(selectedIssueForInvestigation);
    }
  }, [selectedIssueForInvestigation, startInvestigation]);

  const handleCloseDialog = useCallback(() => {
    setShowInvestigateDialog(false);
    resetInvestigationStatus();
  }, [resetInvestigationStatus]);

  const selectedIssue = issues.find(i => i.number === selectedIssueNumber);

  // Not connected state
  if (!syncStatus?.connected) {
    return (
      <NotConnectedState
        error={syncStatus?.error || null}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <IssueListHeader
        repoFullName={syncStatus.repoFullName ?? ''}
        openIssuesCount={getOpenIssuesCount()}
        isLoading={isLoading}
        searchQuery={searchQuery}
        filterState={filterState}
        onSearchChange={setSearchQuery}
        onFilterChange={handleFilterChange}
        onRefresh={handleRefresh}
      />

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Issue List */}
        <div className="w-1/2 border-r border-border flex flex-col">
          <IssueList
            issues={filteredIssues}
            selectedIssueNumber={selectedIssueNumber}
            isLoading={isLoading}
            error={error}
            onSelectIssue={selectIssue}
            onInvestigate={handleInvestigate}
          />
        </div>

        {/* Issue Detail */}
        <div className="w-1/2 flex flex-col">
          {selectedIssue ? (
            <IssueDetail
              issue={selectedIssue}
              onInvestigate={() => handleInvestigate(selectedIssue)}
              investigationResult={
                lastInvestigationResult?.issueNumber === selectedIssue.number
                  ? lastInvestigationResult
                  : null
              }
            />
          ) : (
            <EmptyState message="Select an issue to view details" />
          )}
        </div>
      </div>

      {/* Investigation Dialog */}
      <InvestigationDialog
        open={showInvestigateDialog}
        onOpenChange={setShowInvestigateDialog}
        selectedIssue={selectedIssueForInvestigation}
        investigationStatus={investigationStatus}
        onStartInvestigation={handleStartInvestigation}
        onClose={handleCloseDialog}
      />
    </div>
  );
}
