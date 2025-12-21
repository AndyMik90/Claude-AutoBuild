/**
 * Type definitions and constants for Plane.so work item import functionality
 */

import type {
  PlaneWorkItem,
  PlaneProject,
  PlaneState,
  PlaneImportResult
} from '../../../shared/types';

export type { PlaneWorkItem, PlaneProject, PlaneState, PlaneImportResult };

export interface PlaneTaskImportModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (result: PlaneImportResult) => void;
}

export interface PlaneImportState {
  // Data state
  projects: PlaneProject[];
  workItems: PlaneWorkItem[];
  states: PlaneState[];

  // Selection state
  workspaceSlug: string;
  selectedProjectId: string;
  selectedWorkItemIds: Set<string>;

  // UI state
  isLoadingProjects: boolean;
  isLoadingWorkItems: boolean;
  isImporting: boolean;
  error: string | null;
  searchQuery: string;
  expandedWorkItemId: string | null;
  importResult: PlaneImportResult | null;

  // Filter state
  filterStateGroup: string;
}

export interface WorkItemSelectionControls {
  toggleWorkItem: (workItemId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
}

// Priority colors based on Plane's priority strings
export const PRIORITY_COLORS: Record<string, string> = {
  none: 'bg-muted text-muted-foreground',
  urgent: 'bg-destructive/10 text-destructive',
  high: 'bg-warning/10 text-warning',
  medium: 'bg-info/10 text-info',
  low: 'bg-muted text-muted-foreground'
};

// State group colors (similar to Linear state types)
export const STATE_GROUP_COLORS: Record<string, string> = {
  backlog: 'bg-muted text-muted-foreground',
  unstarted: 'bg-info/10 text-info',
  started: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
  cancelled: 'bg-destructive/10 text-destructive'
};

// Priority labels for display
export const PRIORITY_LABELS: Record<string, string> = {
  none: 'No priority',
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};
