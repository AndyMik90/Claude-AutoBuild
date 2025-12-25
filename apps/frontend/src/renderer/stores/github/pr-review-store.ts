import { create } from 'zustand';
import type {
  PRReviewProgress,
  PRReviewResult,
  NewCommitsCheck
} from '../../../preload/api/modules/github-api';

/**
 * PR review state for a single PR
 */
interface PRReviewState {
  prNumber: number;
  projectId: string;
  isReviewing: boolean;
  progress: PRReviewProgress | null;
  result: PRReviewResult | null;
  error: string | null;
  /** Cached result of new commits check - updated when detail view checks */
  newCommitsCheck: NewCommitsCheck | null;
}

interface PRReviewStoreState {
  // PR Review state - persists across navigation
  // Key: `${projectId}:${prNumber}`
  prReviews: Record<string, PRReviewState>;

  // Actions
  startPRReview: (projectId: string, prNumber: number) => void;
  setPRReviewProgress: (projectId: string, progress: PRReviewProgress) => void;
  setPRReviewResult: (projectId: string, result: PRReviewResult) => void;
  setPRReviewError: (projectId: string, prNumber: number, error: string) => void;
  setNewCommitsCheck: (projectId: string, prNumber: number, check: NewCommitsCheck) => void;
  clearPRReview: (projectId: string, prNumber: number) => void;

  // Selectors
  getPRReviewState: (projectId: string, prNumber: number) => PRReviewState | null;
  getActivePRReviews: (projectId: string) => PRReviewState[];
}

export const usePRReviewStore = create<PRReviewStoreState>((set, get) => ({
  // Initial state
  prReviews: {},

  // Actions
  startPRReview: (projectId: string, prNumber: number) => set((state) => {
    const key = `${projectId}:${prNumber}`;
    const existing = state.prReviews[key];
    return {
      prReviews: {
        ...state.prReviews,
        [key]: {
          prNumber,
          projectId,
          isReviewing: true,
          progress: null,
          result: null,
          error: null,
          newCommitsCheck: existing?.newCommitsCheck ?? null
        }
      }
    };
  }),

  setPRReviewProgress: (projectId: string, progress: PRReviewProgress) => set((state) => {
    const key = `${projectId}:${progress.prNumber}`;
    const existing = state.prReviews[key];
    return {
      prReviews: {
        ...state.prReviews,
        [key]: {
          prNumber: progress.prNumber,
          projectId,
          isReviewing: true,
          progress,
          result: existing?.result ?? null,
          error: null,
          newCommitsCheck: existing?.newCommitsCheck ?? null
        }
      }
    };
  }),

  setPRReviewResult: (projectId: string, result: PRReviewResult) => set((state) => {
    const key = `${projectId}:${result.prNumber}`;
    return {
      prReviews: {
        ...state.prReviews,
        [key]: {
          prNumber: result.prNumber,
          projectId,
          isReviewing: false,
          progress: null,
          result,
          error: result.error ?? null,
          // Clear new commits check when review completes (it was just reviewed)
          newCommitsCheck: null
        }
      }
    };
  }),

  setPRReviewError: (projectId: string, prNumber: number, error: string) => set((state) => {
    const key = `${projectId}:${prNumber}`;
    const existing = state.prReviews[key];
    return {
      prReviews: {
        ...state.prReviews,
        [key]: {
          prNumber,
          projectId,
          isReviewing: false,
          progress: null,
          result: existing?.result ?? null,
          error,
          newCommitsCheck: existing?.newCommitsCheck ?? null
        }
      }
    };
  }),

  setNewCommitsCheck: (projectId: string, prNumber: number, check: NewCommitsCheck) => set((state) => {
    const key = `${projectId}:${prNumber}`;
    const existing = state.prReviews[key];
    if (!existing) {
      // Create a minimal state if none exists
      return {
        prReviews: {
          ...state.prReviews,
          [key]: {
            prNumber,
            projectId,
            isReviewing: false,
            progress: null,
            result: null,
            error: null,
            newCommitsCheck: check
          }
        }
      };
    }
    return {
      prReviews: {
        ...state.prReviews,
        [key]: {
          ...existing,
          newCommitsCheck: check
        }
      }
    };
  }),

  clearPRReview: (projectId: string, prNumber: number) => set((state) => {
    const key = `${projectId}:${prNumber}`;
    const { [key]: _, ...rest } = state.prReviews;
    return { prReviews: rest };
  }),

  // Selectors
  getPRReviewState: (projectId: string, prNumber: number) => {
    const { prReviews } = get();
    const key = `${projectId}:${prNumber}`;
    return prReviews[key] ?? null;
  },

  getActivePRReviews: (projectId: string) => {
    const { prReviews } = get();
    return Object.values(prReviews).filter(
      review => review.projectId === projectId && review.isReviewing
    );
  }
}));

/**
 * Global IPC listener setup for PR reviews.
 * Call this once at app startup to ensure PR review events are captured
 * regardless of which component is mounted.
 */
let prReviewListenersInitialized = false;

export function initializePRReviewListeners(): void {
  if (prReviewListenersInitialized) {
    return;
  }

  const store = usePRReviewStore.getState();

  // Listen for PR review progress events
  window.electronAPI.github.onPRReviewProgress(
    (projectId: string, progress: PRReviewProgress) => {
      store.setPRReviewProgress(projectId, progress);
    }
  );

  // Listen for PR review completion events
  window.electronAPI.github.onPRReviewComplete(
    (projectId: string, result: PRReviewResult) => {
      store.setPRReviewResult(projectId, result);
    }
  );

  // Listen for PR review error events
  window.electronAPI.github.onPRReviewError(
    (projectId: string, data: { prNumber: number; error: string }) => {
      store.setPRReviewError(projectId, data.prNumber, data.error);
    }
  );

  prReviewListenersInitialized = true;
}

/**
 * Start a PR review and track it in the store
 */
export function startPRReview(projectId: string, prNumber: number): void {
  const store = usePRReviewStore.getState();
  store.startPRReview(projectId, prNumber);
  window.electronAPI.github.runPRReview(projectId, prNumber);
}

/**
 * Start a follow-up PR review and track it in the store
 */
export function startFollowupReview(projectId: string, prNumber: number): void {
  const store = usePRReviewStore.getState();
  store.startPRReview(projectId, prNumber);
  window.electronAPI.github.runFollowupReview(projectId, prNumber);
}
