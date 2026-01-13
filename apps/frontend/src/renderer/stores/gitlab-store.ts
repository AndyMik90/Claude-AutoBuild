import { create } from 'zustand';
import type {
  GitLabIssue,
  GitLabSyncStatus,
  GitLabInvestigationStatus,
  GitLabInvestigationResult
} from '../../shared/types';

interface GitLabState {
  // Data
  issues: GitLabIssue[];
  syncStatus: GitLabSyncStatus | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  selectedIssueIid: number | null;
  filterState: 'opened' | 'closed' | 'all';

  // Investigation state
  investigationStatus: GitLabInvestigationStatus;
  lastInvestigationResult: GitLabInvestigationResult | null;

  // Actions
  setIssues: (issues: GitLabIssue[]) => void;
  addIssue: (issue: GitLabIssue) => void;
  updateIssue: (issueIid: number, updates: Partial<GitLabIssue>) => void;
  setSyncStatus: (status: GitLabSyncStatus | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectIssue: (issueIid: number | null) => void;
  setFilterState: (state: 'opened' | 'closed' | 'all') => void;
  setInvestigationStatus: (status: GitLabInvestigationStatus) => void;
  setInvestigationResult: (result: GitLabInvestigationResult | null) => void;
  clearIssues: () => void;

  // Selectors
  getSelectedIssue: () => GitLabIssue | null;
  getFilteredIssues: () => GitLabIssue[];
  getOpenIssuesCount: () => number;
}

export const useGitLabStore = create<GitLabState>((set, get) => ({
  // Initial state
  issues: [],
  syncStatus: null,
  isLoading: false,
  error: null,
  selectedIssueIid: null,
  filterState: 'opened',
  investigationStatus: {
    phase: 'idle',
    progress: 0,
    message: ''
  },
  lastInvestigationResult: null,

  // Actions
  setIssues: (issues) => set({ issues, error: null }),

  addIssue: (issue) => set((state) => ({
    issues: [issue, ...state.issues.filter(i => i.iid !== issue.iid)]
  })),

  updateIssue: (issueIid, updates) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.iid === issueIid ? { ...issue, ...updates } : issue
    )
  })),

  setSyncStatus: (syncStatus) => set({ syncStatus }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  selectIssue: (selectedIssueIid) => set({ selectedIssueIid }),

  setFilterState: (filterState) => set({ filterState }),

  setInvestigationStatus: (investigationStatus) => set({ investigationStatus }),

  setInvestigationResult: (lastInvestigationResult) => set({ lastInvestigationResult }),

  clearIssues: () => set({
    issues: [],
    syncStatus: null,
    selectedIssueIid: null,
    error: null,
    investigationStatus: { phase: 'idle', progress: 0, message: '' },
    lastInvestigationResult: null
  }),

  // Selectors
  getSelectedIssue: () => {
    const { issues, selectedIssueIid } = get();
    return issues.find(i => i.iid === selectedIssueIid) || null;
  },

  getFilteredIssues: () => {
    const { issues, filterState } = get();
    if (filterState === 'all') return issues;
    return issues.filter(issue => issue.state === filterState);
  },

  getOpenIssuesCount: () => {
    const { issues } = get();
    return issues.filter(issue => issue.state === 'opened').length;
  }
}));

// Action functions for use outside of React components
export async function loadGitLabIssues(projectId: string, state?: 'opened' | 'closed' | 'all'): Promise<void> {
  const store = useGitLabStore.getState();
  store.setLoading(true);
  store.setError(null);

  // Sync filterState with the requested state
  if (state) {
    store.setFilterState(state);
  }

  try {
    const result = await window.electronAPI.getGitLabIssues(projectId, state);
    if (result.success && result.data) {
      store.setIssues(result.data);
    } else {
      store.setError(result.error || 'Failed to load GitLab issues');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
  }
}

export async function checkGitLabConnection(projectId: string): Promise<GitLabSyncStatus | null> {
  const store = useGitLabStore.getState();

  try {
    const result = await window.electronAPI.checkGitLabConnection(projectId);
    if (result.success && result.data) {
      store.setSyncStatus(result.data);
      return result.data;
    } else {
      store.setError(result.error || 'Failed to check GitLab connection');
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export function investigateGitLabIssue(projectId: string, issueIid: number, selectedNoteIds?: number[]): void {
  const store = useGitLabStore.getState();
  store.setInvestigationStatus({
    phase: 'fetching',
    issueIid,
    progress: 0,
    message: 'Starting investigation...'
  });
  store.setInvestigationResult(null);

  window.electronAPI.investigateGitLabIssue(projectId, issueIid, selectedNoteIds);
}

export async function importGitLabIssues(
  projectId: string,
  issueIids: number[]
): Promise<boolean> {
  const store = useGitLabStore.getState();
  store.setLoading(true);

  try {
    const result = await window.electronAPI.importGitLabIssues(projectId, issueIids);
    if (result.success) {
      return true;
    } else {
      store.setError(result.error || 'Failed to import GitLab issues');
      return false;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    store.setLoading(false);
  }
}
