import { create } from 'zustand';
import type {
  GitHubIssue,
  GitHubSyncStatus,
  GitHubInvestigationStatus,
  GitHubInvestigationResult
} from '../../shared/types';

interface GitHubState {
  // Data
  issues: GitHubIssue[];
  syncStatus: GitHubSyncStatus | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  selectedIssueNumber: number | null;
  filterState: 'open' | 'closed' | 'all';

  // Investigation state
  investigationStatus: GitHubInvestigationStatus;
  lastInvestigationResult: GitHubInvestigationResult | null;

  // Actions
  setIssues: (issues: GitHubIssue[]) => void;
  addIssue: (issue: GitHubIssue) => void;
  updateIssue: (issueNumber: number, updates: Partial<GitHubIssue>) => void;
  setSyncStatus: (status: GitHubSyncStatus | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectIssue: (issueNumber: number | null) => void;
  setFilterState: (state: 'open' | 'closed' | 'all') => void;
  setInvestigationStatus: (status: GitHubInvestigationStatus) => void;
  setInvestigationResult: (result: GitHubInvestigationResult | null) => void;
  clearIssues: () => void;

  // Selectors
  getSelectedIssue: () => GitHubIssue | null;
  getFilteredIssues: () => GitHubIssue[];
  getOpenIssuesCount: () => number;
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  // Initial state
  issues: [],
  syncStatus: null,
  isLoading: false,
  error: null,
  selectedIssueNumber: null,
  filterState: 'open',
  investigationStatus: {
    phase: 'idle',
    progress: 0,
    message: ''
  },
  lastInvestigationResult: null,

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

  setSyncStatus: (syncStatus) => set({ syncStatus }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  selectIssue: (selectedIssueNumber) => set({ selectedIssueNumber }),

  setFilterState: (filterState) => set({ filterState }),

  setInvestigationStatus: (investigationStatus) => set({ investigationStatus }),

  setInvestigationResult: (lastInvestigationResult) => set({ lastInvestigationResult }),

  clearIssues: () => set({
    issues: [],
    syncStatus: null,
    selectedIssueNumber: null,
    error: null,
    investigationStatus: { phase: 'idle', progress: 0, message: '' },
    lastInvestigationResult: null
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
export async function loadGitHubIssues(projectId: string, state?: 'open' | 'closed' | 'all'): Promise<void> {
  const store = useGitHubStore.getState();
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

export async function checkGitHubConnection(projectId: string): Promise<GitHubSyncStatus | null> {
  const store = useGitHubStore.getState();

  try {
    const result = await window.electronAPI.checkGitHubConnection(projectId);
    if (result.success && result.data) {
      store.setSyncStatus(result.data);
      return result.data;
    } else {
      store.setError(result.error || 'Failed to check GitHub connection');
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export function investigateGitHubIssue(projectId: string, issueNumber: number, selectedCommentIds?: number[]): void {
  const store = useGitHubStore.getState();
  store.setInvestigationStatus({
    phase: 'fetching',
    issueNumber,
    progress: 0,
    message: 'Starting investigation...'
  });
  store.setInvestigationResult(null);

  window.electronAPI.investigateGitHubIssue(projectId, issueNumber, selectedCommentIds);
}

export async function importGitHubIssues(
  projectId: string,
  issueNumbers: number[]
): Promise<boolean> {
  const store = useGitHubStore.getState();
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
