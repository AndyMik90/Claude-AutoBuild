import { create } from 'zustand';
import type { GitHubIssue } from '../../../shared/types';

export type IssueFilterState = 'open' | 'closed' | 'all';

interface IssuesState {
  // Data
  issues: GitHubIssue[];

  // UI State
  isLoading: boolean;
  error: string | null;
  selectedIssueNumber: number | null;
  filterState: IssueFilterState;

  // Actions
  setIssues: (issues: GitHubIssue[]) => void;
  addIssue: (issue: GitHubIssue) => void;
  updateIssue: (issueNumber: number, updates: Partial<GitHubIssue>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectIssue: (issueNumber: number | null) => void;
  setFilterState: (state: IssueFilterState) => void;
  clearIssues: () => void;

  // Selectors
  getSelectedIssue: () => GitHubIssue | null;
  getFilteredIssues: () => GitHubIssue[];
  getOpenIssuesCount: () => number;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  // Initial state
  issues: [],
  isLoading: false,
  error: null,
  selectedIssueNumber: null,
  filterState: 'open',

  // Actions
  setIssues: (issues) => set({ issues, error: null }),

  addIssue: (issue) => set((state) => ({
    issues: [issue, ...state.issues.filter(i => i.number !== issue.number)]
  })),

  updateIssue: (issueNumber, updates) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.number === issueNumber ? { ...issue, ...updates } : issue
    )
  })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  selectIssue: (selectedIssueNumber) => set({ selectedIssueNumber }),

  setFilterState: (filterState) => set({ filterState }),

  clearIssues: () => set({
    issues: [],
    selectedIssueNumber: null,
    error: null
  }),

  // Selectors
  getSelectedIssue: () => {
    const { issues, selectedIssueNumber } = get();
    return issues.find(i => i.number === selectedIssueNumber) || null;
  },

  getFilteredIssues: () => {
    const { issues, filterState } = get();
    if (filterState === 'all') return issues;
    return issues.filter(issue => issue.state === filterState);
  },

  getOpenIssuesCount: () => {
    const { issues } = get();
    return issues.filter(issue => issue.state === 'open').length;
  }
}));

// Action functions for use outside of React components
export async function loadGitHubIssues(projectId: string, state?: IssueFilterState): Promise<void> {
  const store = useIssuesStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    const result = await window.electronAPI.getGitHubIssues(projectId, state);
    if (result.success && result.data) {
      store.setIssues(result.data);
    } else {
      store.setError(result.error || 'Failed to load GitHub issues');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
  }
}

export async function importGitHubIssues(
  projectId: string,
  issueNumbers: number[]
): Promise<boolean> {
  const store = useIssuesStore.getState();
  store.setLoading(true);

  try {
    const result = await window.electronAPI.importGitHubIssues(projectId, issueNumbers);
    if (result.success) {
      return true;
    } else {
      store.setError(result.error || 'Failed to import GitHub issues');
      return false;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    store.setLoading(false);
  }
}
