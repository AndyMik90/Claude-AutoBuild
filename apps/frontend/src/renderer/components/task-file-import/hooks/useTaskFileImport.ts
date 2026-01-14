/**
 * useTaskFileImport - Hook for importing tasks into the project
 *
 * Uses the existing createTask function from task-store
 * to create tasks from parsed JSON files
 */

import { useState, useCallback } from 'react';
import { createTask } from '../../../stores/task-store';
import type { ParsedTask, TaskFileImportResult } from '../types';
import { mapWorkflowTypeToCategory, mapPriority, mapComplexity } from '../types';
import type { TaskMetadata } from '../../../../shared/types';

interface UseTaskFileImportOptions {
  projectId: string;
  onImportComplete?: (result: TaskFileImportResult) => void;
}

interface UseTaskFileImportReturn {
  isImporting: boolean;
  importResult: TaskFileImportResult | null;
  importError: string | null;
  handleImport: (tasks: ParsedTask[], selectedIds: Set<string>) => Promise<void>;
  resetImportState: () => void;
}

export function useTaskFileImport(options: UseTaskFileImportOptions): UseTaskFileImportReturn {
  const { projectId, onImportComplete } = options;

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<TaskFileImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = useCallback(async (tasks: ParsedTask[], selectedIds: Set<string>) => {
    if (selectedIds.size === 0) return;

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    const errors: string[] = [];
    let importedCount = 0;
    let failedCount = 0;

    // Get selected tasks in order
    const selectedTasks = tasks
      .filter(t => selectedIds.has(t.parseId) && t.isValid)
      .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));

    for (const task of selectedTasks) {
      try {
        // Build metadata from task fields
        const metadata: TaskMetadata = {
          sourceType: 'imported'
        };

        // Map optional fields
        const category = mapWorkflowTypeToCategory(task.workflow_type);
        if (category) metadata.category = category;

        const priority = mapPriority(task.priority);
        if (priority) metadata.priority = priority;

        const complexity = mapComplexity(task.complexity);
        if (complexity) metadata.complexity = complexity;

        // Create the task
        const created = await createTask(
          projectId,
          task.title,
          task.description,
          metadata
        );

        if (created) {
          importedCount++;
        } else {
          failedCount++;
          errors.push(`Failed to create task: ${task.title}`);
        }
      } catch (error) {
        failedCount++;
        errors.push(`Error creating "${task.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const result: TaskFileImportResult = {
      success: failedCount === 0,
      imported: importedCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    };

    setImportResult(result);

    if (errors.length > 0) {
      setImportError(`${failedCount} task(s) failed to import`);
    }

    onImportComplete?.(result);
    setIsImporting(false);
  }, [projectId, onImportComplete]);

  const resetImportState = useCallback(() => {
    setImportResult(null);
    setImportError(null);
  }, []);

  return {
    isImporting,
    importResult,
    importError,
    handleImport,
    resetImportState
  };
}
