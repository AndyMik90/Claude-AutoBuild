/**
 * Types for Task File Import feature
 *
 * These types define the JSON schema for imported task files
 * and the internal state management types.
 */

import type { TaskCategory, TaskPriority, TaskComplexity } from '../../../shared/types';

/**
 * JSON file format for a single task
 * This matches the schema defined in the auto-claude-generator skill
 */
export interface TaskFileEntry {
  title: string;
  description: string;
  workflow_type?: 'feature' | 'refactor' | 'investigation' | 'migration' | 'simple';
  complexity?: 'simple' | 'standard' | 'complex';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  files?: string[];
  dependencies?: string[];
  phase?: number;
}

/**
 * Parsed task with additional metadata for selection/validation
 */
export interface ParsedTask extends TaskFileEntry {
  /** Unique ID for selection tracking */
  parseId: string;
  /** Original filename */
  sourceFile: string;
  /** Whether the task passed validation */
  isValid: boolean;
  /** List of validation errors if invalid */
  validationErrors: string[];
}

/**
 * Props for the main import modal
 */
export interface TaskFileImportModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (result: TaskFileImportResult) => void;
}

/**
 * Result of the import operation
 */
export interface TaskFileImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

/**
 * State returned by the main orchestration hook
 */
export interface TaskFileImportState {
  // Parsed tasks
  parsedTasks: ParsedTask[];
  // Selection
  selectedTaskIds: Set<string>;
  selectionControls: {
    selectAll: () => void;
    deselectAll: () => void;
    toggleTask: (id: string) => void;
    isAllSelected: boolean;
    isSomeSelected: boolean;
  };
  // Loading states
  isParsing: boolean;
  isImporting: boolean;
  // Results
  error: string | null;
  importResult: TaskFileImportResult | null;
  // Handlers
  handleFileDrop: (files: FileList) => Promise<void>;
  handleFileSelect: (files: FileList) => Promise<void>;
  handleImport: () => Promise<void>;
  resetState: () => void;
}

/**
 * Map workflow_type to TaskCategory
 */
export function mapWorkflowTypeToCategory(workflowType?: string): TaskCategory | undefined {
  const mapping: Record<string, TaskCategory> = {
    feature: 'feature',
    refactor: 'refactoring',
    investigation: 'bug_fix',
    migration: 'infrastructure',
    simple: 'infrastructure'
  };
  return workflowType ? mapping[workflowType] : undefined;
}

/**
 * Map priority string to TaskPriority
 */
export function mapPriority(priority?: string): TaskPriority | undefined {
  const mapping: Record<string, TaskPriority> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'urgent',
    urgent: 'urgent'
  };
  return priority ? mapping[priority] : undefined;
}

/**
 * Map complexity string to TaskComplexity
 */
export function mapComplexity(complexity?: string): TaskComplexity | undefined {
  const mapping: Record<string, TaskComplexity> = {
    simple: 'small',
    standard: 'medium',
    complex: 'complex'
  };
  return complexity ? mapping[complexity] : undefined;
}
