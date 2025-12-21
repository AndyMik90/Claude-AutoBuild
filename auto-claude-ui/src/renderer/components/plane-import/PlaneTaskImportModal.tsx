/**
 * Plane Task Import Modal
 * Main modal component that orchestrates the import workflow
 * Uses extracted hooks and components for better maintainability
 */

import { Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { usePlaneImportModal } from './hooks';
import {
  ImportSuccessBanner,
  ErrorBanner,
  WorkspaceProjectSelector,
  SearchAndFilterBar,
  SelectionControls,
  WorkItemList
} from './components';
import type { PlaneTaskImportModalProps } from './types';

interface PlaneTaskImportModalFullProps extends PlaneTaskImportModalProps {
  defaultWorkspaceSlug?: string;
}

export function PlaneTaskImportModal({
  projectId,
  open,
  onOpenChange,
  onImportComplete,
  defaultWorkspaceSlug
}: PlaneTaskImportModalFullProps) {
  // Use the orchestration hook to manage all state and handlers
  const {
    projects,
    workItems,
    uniqueStates,
    workspaceSlug,
    selectedProjectId,
    selectedWorkItemIds,
    selectionControls,
    searchQuery,
    filterStateGroup,
    isLoadingProjects,
    isLoadingWorkItems,
    isImporting,
    error,
    importResult,
    setWorkspaceSlug,
    setSelectedProjectId,
    setSearchQuery,
    setFilterStateGroup,
    handleRefresh,
    handleImport,
    resetState
  } = usePlaneImportModal({ projectId, open, defaultWorkspaceSlug, onImportComplete });

  // Handle modal open/close with state reset
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Download className="h-5 w-5" />
            Import Plane Work Items
          </DialogTitle>
          <DialogDescription>
            Select work items from Plane.so to import into AutoBuild
          </DialogDescription>
        </DialogHeader>

        {/* Import Success Banner */}
        {importResult?.success && (
          <ImportSuccessBanner
            importResult={importResult}
            onClose={() => handleOpenChange(false)}
          />
        )}

        {/* Error Banner */}
        {error && <ErrorBanner error={error} />}

        {/* Main Content - Only show when not in success state */}
        {!importResult?.success && (
          <>
            {/* Workspace and Project Selection */}
            <WorkspaceProjectSelector
              workspaceSlug={workspaceSlug}
              projects={projects}
              selectedProjectId={selectedProjectId}
              isLoadingProjects={isLoadingProjects}
              onWorkspaceChange={setWorkspaceSlug}
              onProjectChange={setSelectedProjectId}
            />

            {/* Search and Filter Bar */}
            <SearchAndFilterBar
              searchQuery={searchQuery}
              filterStateGroup={filterStateGroup}
              uniqueStates={uniqueStates}
              onSearchChange={setSearchQuery}
              onFilterChange={setFilterStateGroup}
            />

            {/* Selection Controls */}
            {workItems.length > 0 && (
              <SelectionControls
                isAllSelected={selectionControls.isAllSelected}
                isSomeSelected={selectionControls.isSomeSelected}
                selectedCount={selectedWorkItemIds.size}
                filteredCount={workItems.length}
                isLoadingWorkItems={isLoadingWorkItems}
                onSelectAll={selectionControls.selectAll}
                onDeselectAll={selectionControls.deselectAll}
                onRefresh={handleRefresh}
              />
            )}

            {/* Work Item List */}
            <WorkItemList
              workItems={workItems}
              selectedWorkItemIds={selectedWorkItemIds}
              isLoadingWorkItems={isLoadingWorkItems}
              selectedProjectId={selectedProjectId}
              projectIdentifier={projects.find(p => p.id === selectedProjectId)?.identifier}
              searchQuery={searchQuery}
              filterStateGroup={filterStateGroup}
              onToggleWorkItem={selectionControls.toggleWorkItem}
            />
          </>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {importResult?.success ? 'Done' : 'Cancel'}
          </Button>
          {!importResult?.success && (
            <Button
              onClick={handleImport}
              disabled={selectedWorkItemIds.size === 0 || isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Import {selectedWorkItemIds.size} Work Item
                  {selectedWorkItemIds.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
