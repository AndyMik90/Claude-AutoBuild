/**
 * Type definitions and constants for Linear task import functionality
 */

import type {
  LinearIssue,
  LinearTeam,
  LinearProject,
  LinearImportResult
} from '../../../shared/types';

export type { LinearIssue, LinearTeam, LinearProject, LinearImportResult };

export interface LinearTaskImportModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: (result: LinearImportResult) => void;
}

export interface LinearImportState {
  // Data state
  teams: LinearTeam[];
  projects: LinearProject[];
  issues: LinearIssue[];

  // Selection state
  selectedTeamId: string;
  selectedProjectId: string;
  selectedIssueIds: Set<string>;

  // UI state
  isLoadingTeams: boolean;
  isLoadingProjects: boolean;
  isLoadingIssues: boolean;
  isImporting: boolean;
  error: string | null;
  searchQuery: string;
  expandedIssueId: string | null;
  importResult: LinearImportResult | null;

  // Filter state
  filterState: string;
}

export interface IssueSelectionControls {
  toggleIssue: (issueId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
}

// Priority colors based on Linear's priority scale (0-4, where 1 is urgent)
export const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-muted text-muted-foreground',
  1: 'bg-destructive/10 text-destructive',
  2: 'bg-warning/10 text-warning',
  3: 'bg-info/10 text-info',
  4: 'bg-muted text-muted-foreground'
};

// State type colors
export const STATE_TYPE_COLORS: Record<string, string> = {
  backlog: 'bg-muted text-muted-foreground',
  unstarted: 'bg-info/10 text-info',
  started: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
  canceled: 'bg-destructive/10 text-destructive'
};
