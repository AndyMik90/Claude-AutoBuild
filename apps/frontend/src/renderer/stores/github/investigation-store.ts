import { create } from 'zustand';
import type {
  GitHubInvestigationStatus,
  GitHubInvestigationResult
} from '../../../shared/types';

interface InvestigationState {
  // Investigation state
  investigationStatus: GitHubInvestigationStatus;
  lastInvestigationResult: GitHubInvestigationResult | null;

  // Actions
  setInvestigationStatus: (status: GitHubInvestigationStatus) => void;
  setInvestigationResult: (result: GitHubInvestigationResult | null) => void;
  clearInvestigation: () => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  // Initial state
  investigationStatus: {
    phase: 'idle',
    progress: 0,
    message: ''
  },
  lastInvestigationResult: null,

  // Actions
  setInvestigationStatus: (investigationStatus) => set({ investigationStatus }),

  setInvestigationResult: (lastInvestigationResult) => set({ lastInvestigationResult }),

  clearInvestigation: () => set({
    investigationStatus: { phase: 'idle', progress: 0, message: '' },
    lastInvestigationResult: null
  })
}));

/**
 * Start investigating a GitHub issue
 */
export function investigateGitHubIssue(
  projectId: string,
  issueNumber: number,
  selectedCommentIds?: number[]
): void {
  const store = useInvestigationStore.getState();
  store.setInvestigationStatus({
    phase: 'fetching',
    issueNumber,
    progress: 0,
    message: 'Starting investigation...'
  });
  store.setInvestigationResult(null);

  window.electronAPI.investigateGitHubIssue(projectId, issueNumber, selectedCommentIds);
}
