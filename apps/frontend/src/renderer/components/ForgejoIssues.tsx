import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../stores/project-store";
import { useTaskStore } from "../stores/task-store";
import { useForgejoIssues, useForgejoInvestigation, useIssueFiltering } from "./forgejo-issues/hooks";
import {
  NotConnectedState,
  EmptyState,
  IssueListHeader,
  IssueList,
  IssueDetail,
  InvestigationDialog,
} from "./forgejo-issues/components";
import type { ForgejoIssue } from "../../shared/types";
import type { ForgejoIssuesProps } from "./forgejo-issues/types";

export function ForgejoIssues({ onOpenSettings, onNavigateToTask }: ForgejoIssuesProps) {
  const { t } = useTranslation("forgejo");
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const tasks = useTaskStore((state) => state.tasks);

  const {
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
  } = useForgejoIssues(selectedProject?.id);

  const {
    investigationStatus,
    lastInvestigationResult,
    startInvestigation,
    resetInvestigationStatus,
  } = useForgejoInvestigation(selectedProject?.id);

  const { searchQuery, setSearchQuery, filteredIssues } = useIssueFiltering(getFilteredIssues());

  const [showInvestigateDialog, setShowInvestigateDialog] = useState(false);
  const [selectedIssueForInvestigation, setSelectedIssueForInvestigation] =
    useState<ForgejoIssue | null>(null);

  // Build a map of Forgejo issue numbers to task IDs for quick lookup
  const issueToTaskMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of tasks) {
      if (task.metadata?.forgejoIssueNumber) {
        map.set(task.metadata.forgejoIssueNumber, task.specId || task.id);
      }
    }
    return map;
  }, [tasks]);

  const handleInvestigate = useCallback((issue: ForgejoIssue) => {
    setSelectedIssueForInvestigation(issue);
    setShowInvestigateDialog(true);
  }, []);

  const handleStartInvestigation = useCallback(
    (selectedCommentIds: number[]) => {
      if (selectedIssueForInvestigation) {
        startInvestigation(selectedIssueForInvestigation, selectedCommentIds);
      }
    },
    [selectedIssueForInvestigation, startInvestigation]
  );

  const handleCloseDialog = useCallback(() => {
    setShowInvestigateDialog(false);
    resetInvestigationStatus();
  }, [resetInvestigationStatus]);

  // Not connected state
  if (!syncStatus?.connected) {
    return <NotConnectedState error={syncStatus?.error || null} onOpenSettings={onOpenSettings} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <IssueListHeader
        repoName={syncStatus.repoFullName ?? ""}
        instanceUrl={syncStatus.instanceUrl ?? ""}
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
              linkedTaskId={issueToTaskMap.get(selectedIssue.number)}
              onViewTask={onNavigateToTask}
            />
          ) : (
            <EmptyState message={t("empty.selectIssue")} />
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
        projectId={selectedProject?.id}
      />
    </div>
  );
}
