import { useEffect } from 'react';
import {
  AlertTriangle,
  Loader2,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { FileList } from './FileList';
import { DiffViewer } from './DiffViewer';
import { ResolutionControls } from './ResolutionControls';
import { useConflictResolver } from './hooks/useConflictResolver';
import type { ConflictResolution } from '../../../../../shared/types';

interface ConflictResolverDialogProps {
  open: boolean;
  taskId: string;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

/**
 * Main dialog for interactive conflict resolution
 * Features a three-panel layout: file list, diff viewer, and resolution controls
 */
export function ConflictResolverDialog({
  open,
  taskId,
  onOpenChange,
  onResolved
}: ConflictResolverDialogProps) {
  const {
    files,
    currentFile,
    selectedFileIndex,
    resolutionMode,
    isLoading,
    isApplying,
    error,
    totalFiles,
    resolvedCount,
    loadConflictDetails,
    selectFile,
    setResolutionMode,
    setFileResolution,
    getFileResolution,
    hasResolution,
    applyResolutions,
    applyAIForAll
  } = useConflictResolver(taskId);

  // Load conflict details when dialog opens
  useEffect(() => {
    if (open && taskId) {
      loadConflictDetails();
    }
  }, [open, taskId, loadConflictDetails]);

  // Handle setting resolution for current file
  const handleSetResolution = (resolution: ConflictResolution) => {
    if (currentFile) {
      setFileResolution(currentFile.filePath, resolution);
    }
  };

  // Handle applying all resolutions
  const handleApply = async () => {
    const success = await applyResolutions();
    if (success) {
      onResolved();
      onOpenChange(false);
    }
  };

  // Navigate between files
  const goToPrevFile = () => {
    if (selectedFileIndex > 0) {
      selectFile(selectedFileIndex - 1);
    }
  };

  const goToNextFile = () => {
    if (selectedFileIndex < files.length - 1) {
      selectFile(selectedFileIndex + 1);
    }
  };

  const allResolved = resolvedCount === totalFiles && totalFiles > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] max-h-[90vh] h-[800px] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <DialogTitle className="text-lg">Resolve Merge Conflicts</DialogTitle>
                <DialogDescription className="text-sm mt-0.5">
                  Review and resolve conflicts before merging changes
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Progress indicator */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Progress:</span>
                <span className={resolvedCount === totalFiles ? 'text-success' : 'text-foreground'}>
                  {resolvedCount} / {totalFiles} files
                </span>
              </div>
              {/* AI for all button */}
              <Button
                variant="outline"
                size="sm"
                onClick={applyAIForAll}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Use AI for All
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Main content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading conflict details...</span>
              </div>
            </div>
          ) : error && files.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center px-8">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
                <Button variant="outline" size="sm" onClick={loadConflictDetails}>
                  Retry
                </Button>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <Check className="h-8 w-8 text-success" />
                <span className="text-sm text-muted-foreground">No conflicts to resolve</span>
              </div>
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="w-72 border-r border-border flex-shrink-0 overflow-auto bg-muted/10">
                <FileList
                  files={files}
                  selectedIndex={selectedFileIndex}
                  onSelect={selectFile}
                  hasResolution={hasResolution}
                />
              </div>

              {/* Main content area */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* File navigation */}
                <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToPrevFile}
                    disabled={selectedFileIndex === 0}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    File {selectedFileIndex + 1} of {files.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToNextFile}
                    disabled={selectedFileIndex === files.length - 1}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Diff viewer */}
                <div className="flex-1 min-h-0">
                  <DiffViewer file={currentFile} theme="dark" />
                </div>

                {/* Resolution controls */}
                <ResolutionControls
                  file={currentFile}
                  currentResolution={currentFile ? getFileResolution(currentFile.filePath) : undefined}
                  resolutionMode={resolutionMode}
                  onResolutionModeChange={setResolutionMode}
                  onSetResolution={handleSetResolution}
                  onEditManually={() => {}}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {error && <span className="text-destructive">{error}</span>}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant={allResolved ? 'success' : 'default'}
                onClick={handleApply}
                disabled={!allResolved || isApplying}
                className="gap-2"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Apply Resolutions
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
