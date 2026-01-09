import { create } from 'zustand';
import type {
  ForgejoIssue,
  ForgejoSyncStatus,
  ForgejoInvestigationStatus,
  ForgejoInvestigationResult
} from '../../shared/types';

interface ForgejoState {
  // Data
  issues: ForgejoIssue[];
  syncStatus: ForgejoSyncStatus | null;

  // UI State
  isLoading: boolean;
  error: string | null;
  selectedIssueNumber: number | null;
  filterState: 'open' | 'closed' | 'all';

  // Investigation state
  investigationStatus: ForgejoInvestigationStatus;
  lastInvestigationResult: ForgejoInvestigationResult | null;

  // Actions
  setIssues: (issues: ForgejoIssue[]) => void;
  addIssue: (issue: ForgejoIssue) => void;
  updateIssue: (issueNumber: number, updates: Partial<ForgejoIssue>) => void;
  setSyncStatus: (status: ForgejoSyncStatus | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectIssue: (issueNumber: number | null) => void;
  setFilterState: (state: 'open' | 'closed' | 'all') => void;
  setInvestigationStatus: (status: ForgejoInvestigationStatus) => void;
  setInvestigationResult: (result: ForgejoInvestigationResult | null) => void;
  clearIssues: () => void;

  // Selectors
  getSelectedIssue: () => ForgejoIssue | null;
  getFilteredIssues: () => ForgejoIssue[];
  getOpenIssuesCount: () => number;
}

export const useForgejoStore = create<ForgejoState>((set, get) => ({
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
export async function loadForgejoIssues(projectId: string, state?: 'open' | 'closed' | 'all'): Promise<void> {
  const store = useForgejoStore.getState();
  store.setLoading(true);
  store.setError(null);

  // Sync filterState with the requested state
  if (state) {
    store.setFilterState(state);
  }

  try {
    const result = await window.electronAPI.forgejo.getForgejoIssues(projectId, state);
    if (result.success && result.data) {
      store.setIssues(result.data);
    } else {
      store.setError(result.error || 'Failed to load Forgejo issues');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    store.setLoading(false);
  }
}

export async function checkForgejoConnection(projectId: string): Promise<ForgejoSyncStatus | null> {
  const store = useForgejoStore.getState();

  try {
    const result = await window.electronAPI.forgejo.checkForgejoConnection(projectId);
    if (result.success && result.data) {
      store.setSyncStatus(result.data);
      return result.data;
    } else {
      store.setError(result.error || 'Failed to check Forgejo connection');
      return null;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export function investigateForgejoIssue(projectId: string, issueNumber: number): void {
  const store = useForgejoStore.getState();
  store.setInvestigationStatus({
    phase: 'fetching',
    issueNumber,
    progress: 0,
    message: 'Starting investigation...'
  });
  store.setInvestigationResult(null);

  window.electronAPI.forgejo.investigateForgejoIssue(projectId, issueNumber);
}

export async function importForgejoIssues(
  projectId: string,
  issueNumbers: number[]
): Promise<boolean> {
  const store = useForgejoStore.getState();
  store.setLoading(true);

  try {
    const result = await window.electronAPI.forgejo.importForgejoIssues(projectId, issueNumbers);
    if (result.success) {
      return true;
    } else {
      store.setError(result.error || 'Failed to import Forgejo issues');
      return false;
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Unknown error');
    return false;
  } finally {
    store.setLoading(false);
  }
}
