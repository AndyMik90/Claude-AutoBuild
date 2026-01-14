/**
 * TaskFileImportModal - Main modal component for bulk task import
 *
 * Flow:
 * 1. Show dropzone for file selection
 * 2. Parse dropped JSON files
 * 3. Show preview list with selection
 * 4. Import selected tasks
 * 5. Show result banner
 */

import { useTranslation } from 'react-i18next';
import { Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { useTaskFileImportModal } from './hooks';
import {
  FileDropzone,
  TaskPreviewList,
  ImportSelectionControls,
  ImportResultBanner
} from './components';
import type { TaskFileImportModalProps, TaskFileImportResult } from './types';

export function TaskFileImportModal({
  projectId,
  open,
  onOpenChange,
  onImportComplete
}: TaskFileImportModalProps) {
  const { t } = useTranslation(['tasks', 'common']);

  const {
    parsedTasks,
    selectedTaskIds,
    selectionControls,
    isParsing,
    isImporting,
    error,
    importResult,
    handleFileDrop,
    handleFileSelect,
    handleImport,
    resetState
  } = useTaskFileImportModal({
    projectId,
    open,
    onImportComplete
  });

  const handleClose = () => {
    if (!isImporting) {
      onOpenChange(false);
    }
  };

  const handleDone = () => {
    resetState();
    onOpenChange(false);
  };

  const showDropzone = parsedTasks.length === 0 && !importResult?.success;
  const showPreview = parsedTasks.length > 0 && !importResult?.success;
  const showResult = importResult !== null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t('taskFileImport.title')}
          </DialogTitle>
          <DialogDescription>
            {t('taskFileImport.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Main content area */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4 py-4">
          {/* Error display */}
          {error && !importResult && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Success/Error result */}
          {showResult && importResult && (
            <ImportResultBanner result={importResult} />
          )}

          {/* Dropzone */}
          {showDropzone && (
            <FileDropzone
              onFileDrop={handleFileDrop}
              onFileSelect={handleFileSelect}
              isParsing={isParsing}
              disabled={isImporting}
            />
          )}

          {/* Preview list */}
          {showPreview && (
            <>
              <ImportSelectionControls
                tasks={parsedTasks}
                selectedCount={selectedTaskIds.size}
                onSelectAll={selectionControls.selectAll}
                onDeselectAll={selectionControls.deselectAll}
                disabled={isImporting}
              />
              <TaskPreviewList
                tasks={parsedTasks}
                selectedIds={selectedTaskIds}
                onToggle={selectionControls.toggleTask}
                disabled={isImporting}
              />
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {/* Cancel / Close */}
          {!importResult?.success ? (
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isImporting}
            >
              {t('common:buttons.cancel')}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleDone}>
              {t('common:buttons.close')}
            </Button>
          )}

          {/* Import button - only show when we have tasks to import */}
          {showPreview && !importResult?.success && (
            <Button
              onClick={handleImport}
              disabled={selectedTaskIds.size === 0 || isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('taskFileImport.importing')}
                </>
              ) : (
                <>
                  {t('taskFileImport.importButton', { count: selectedTaskIds.size })}
                </>
              )}
            </Button>
          )}

          {/* Import more button - after successful import */}
          {importResult?.success && (
            <Button onClick={resetState}>
              {t('taskFileImport.importMore')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
