/**
 * useTaskFileImportModal - Main orchestration hook
 *
 * Combines all the sub-hooks into a single interface
 * for the TaskFileImportModal component
 */

import { useCallback, useEffect } from 'react';
import { useFileParser } from './useFileParser';
import { useTaskSelection } from './useTaskSelection';
import { useTaskFileImport } from './useTaskFileImport';
import type { TaskFileImportState, TaskFileImportResult } from '../types';

interface UseTaskFileImportModalOptions {
  projectId: string;
  open: boolean;
  onImportComplete?: (result: TaskFileImportResult) => void;
}

export function useTaskFileImportModal(options: UseTaskFileImportModalOptions): TaskFileImportState {
  const { projectId, open, onImportComplete } = options;

  // File parsing
  const {
    parsedTasks,
    isParsing,
    parseError,
    parseFiles,
    clearParsedTasks
  } = useFileParser();

  // Task selection
  const {
    selectedTaskIds,
    setSelectedTaskIds,
    selectionControls
  } = useTaskSelection(parsedTasks);

  // Import operation
  const {
    isImporting,
    importResult,
    importError,
    handleImport: doImport,
    resetImportState
  } = useTaskFileImport({ projectId, onImportComplete });

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      clearParsedTasks();
      setSelectedTaskIds(new Set());
      resetImportState();
    }
  }, [open, clearParsedTasks, setSelectedTaskIds, resetImportState]);

  // Auto-select all valid tasks when parsed
  useEffect(() => {
    if (parsedTasks.length > 0 && selectedTaskIds.size === 0) {
      selectionControls.selectAll();
    }
  }, [parsedTasks, selectedTaskIds.size, selectionControls]);

  // Handle file drop
  const handleFileDrop = useCallback(async (files: FileList) => {
    clearParsedTasks();
    resetImportState();
    await parseFiles(files);
  }, [clearParsedTasks, resetImportState, parseFiles]);

  // Handle file select (same as drop)
  const handleFileSelect = handleFileDrop;

  // Handle import
  const handleImport = useCallback(async () => {
    await doImport(parsedTasks, selectedTaskIds);
  }, [doImport, parsedTasks, selectedTaskIds]);

  // Reset all state
  const resetState = useCallback(() => {
    clearParsedTasks();
    setSelectedTaskIds(new Set());
    resetImportState();
  }, [clearParsedTasks, setSelectedTaskIds, resetImportState]);

  // Combine errors
  const error = parseError || importError;

  return {
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
  };
}
