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

/**
 * Load GitLab issues for a project and update the GitLab store accordingly.
 *
 * The function sets the store's loading state and clears any prior error, optionally
 * synchronizes the store's filter state, requests issues via the Electron API,
 * and updates the store with the retrieved issues or an error message. Loading is
 * cleared when the operation completes.
 *
 * @param projectId - The GitLab project identifier to load issues from
 * @param state - Optional issue state to request and to synchronize with the store's filter (`'opened' | 'closed' | 'all'`)
 */
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

/**
 * Checks the GitLab connection for a project and updates the store with the resulting sync status or error.
 *
 * @param projectId - The GitLab project identifier
 * @returns The GitLab sync status when the check succeeds, `null` otherwise
 */
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

/**
 * Starts an investigation for a GitLab issue by updating the investigation state and invoking the backend investigator.
 *
 * Updates the store to a fetching phase (initial progress/message), clears any previous investigation result, and calls the Electron API to perform the investigation.
 *
 * @param projectId - The GitLab project ID containing the issue
 * @param issueIid - The internal ID (IID) of the issue to investigate
 * @param selectedNoteIds - Optional array of note IDs to include in the investigation
 */
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

/**
 * Imports the specified GitLab issues into the application and updates the GitLab store state.
 *
 * This sets the store's loading state while the import runs and updates the store's error on failure.
 *
 * @param projectId - The GitLab project identifier to import issues from
 * @param issueIids - Array of GitLab issue IIDs to import
 * @returns `true` if the import succeeded, `false` otherwise
 */
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