import { create } from 'zustand';
import type {
  ReleaseableVersion,
  ReleasePreflightStatus,
  ReleaseProgress,
  CreateReleaseResult
} from '../../shared/types';

interface ReleaseState {
  // Available versions from CHANGELOG.md
  releaseableVersions: ReleaseableVersion[];
  isLoadingVersions: boolean;

  // Selected version for release
  selectedVersion: string | null;

  // Pre-flight check state
  preflightStatus: ReleasePreflightStatus | null;
  isRunningPreflight: boolean;

  // Release options
  createAsDraft: boolean;
  markAsPrerelease: boolean;

  // Release progress
  releaseProgress: ReleaseProgress | null;
  isCreatingRelease: boolean;
  lastReleaseResult: CreateReleaseResult | null;

  // Error state
  error: string | null;

  // Actions
  setReleaseableVersions: (versions: ReleaseableVersion[]) => void;
  setIsLoadingVersions: (loading: boolean) => void;
  setSelectedVersion: (version: string | null) => void;
  setPreflightStatus: (status: ReleasePreflightStatus | null) => void;
  setIsRunningPreflight: (running: boolean) => void;
  setCreateAsDraft: (draft: boolean) => void;
  setMarkAsPrerelease: (prerelease: boolean) => void;
  setReleaseProgress: (progress: ReleaseProgress | null) => void;
  setIsCreatingRelease: (creating: boolean) => void;
  setLastReleaseResult: (result: CreateReleaseResult | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  releaseableVersions: [],
  isLoadingVersions: false,
  selectedVersion: null,
  preflightStatus: null,
  isRunningPreflight: false,
  createAsDraft: false,
  markAsPrerelease: false,
  releaseProgress: null,
  isCreatingRelease: false,
  lastReleaseResult: null,
  error: null
};

export const useReleaseStore = create<ReleaseState>((set) => ({
  ...initialState,

  setReleaseableVersions: (versions) => set({ releaseableVersions: versions }),
  setIsLoadingVersions: (loading) => set({ isLoadingVersions: loading }),
  setSelectedVersion: (version) => set({
    selectedVersion: version,
    // Reset preflight when version changes
    preflightStatus: null,
    error: null
  }),
  setPreflightStatus: (status) => set({ preflightStatus: status }),
  setIsRunningPreflight: (running) => set({ isRunningPreflight: running }),
  setCreateAsDraft: (draft) => set({ createAsDraft: draft }),
  setMarkAsPrerelease: (prerelease) => set({ markAsPrerelease: prerelease }),
  setReleaseProgress: (progress) => set({ releaseProgress: progress }),
  setIsCreatingRelease: (creating) => set({ isCreatingRelease: creating }),
  setLastReleaseResult: (result) => set({ lastReleaseResult: result }),
  setError: (error) => set({ error }),
  reset: () => set(initialState)
}));

// ============================================
// Helper functions for loading and actions
// ============================================

/**
 * Load releaseable versions from CHANGELOG.md
 */
export async function loadReleaseableVersions(projectId: string): Promise<void> {
  const store = useReleaseStore.getState();
  store.setIsLoadingVersions(true);
  store.setError(null);

  try {
    const result = await window.electronAPI.getReleaseableVersions(projectId);
    if (result.success && result.data) {
      store.setReleaseableVersions(result.data);

      // Auto-select first unreleased version if none selected
      if (!store.selectedVersion) {
        const firstUnreleased = result.data.find((v: ReleaseableVersion) => !v.isReleased);
        if (firstUnreleased) {
          store.setSelectedVersion(firstUnreleased.version);
        }
      }
    } else {
      store.setError(result.error || 'Failed to load versions');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load versions');
  } finally {
    store.setIsLoadingVersions(false);
  }
}

/**
 * Run pre-flight checks for the selected version
 */
export async function runPreflightCheck(projectId: string): Promise<void> {
  const store = useReleaseStore.getState();
  const version = store.selectedVersion;

  if (!version) {
    store.setError('No version selected');
    return;
  }

  store.setIsRunningPreflight(true);
  store.setError(null);

  try {
    const result = await window.electronAPI.runReleasePreflightCheck(projectId, version);
    if (result.success && result.data) {
      store.setPreflightStatus(result.data);
    } else {
      store.setError(result.error || 'Failed to run pre-flight checks');
    }
  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to run pre-flight checks');
  } finally {
    store.setIsRunningPreflight(false);
  }
}

/**
 * Create a GitHub release
 */
export function createRelease(projectId: string): void {
  const store = useReleaseStore.getState();
  const version = store.selectedVersion;

  if (!version) {
    store.setError('No version selected');
    return;
  }

  // Find the version to get its content
  const versionInfo = store.releaseableVersions.find(v => v.version === version);
  if (!versionInfo) {
    store.setError('Version not found');
    return;
  }

  store.setIsCreatingRelease(true);
  store.setError(null);
  store.setReleaseProgress({
    stage: 'checking',
    progress: 0,
    message: 'Starting release...'
  });

  window.electronAPI.createRelease({
    projectId,
    version,
    body: versionInfo.content,
    draft: store.createAsDraft,
    prerelease: store.markAsPrerelease
  });
}

// ============================================
// Selectors
// ============================================

/**
 * Get unreleased versions only
 */
export function getUnreleasedVersions(): ReleaseableVersion[] {
  const store = useReleaseStore.getState();
  return store.releaseableVersions.filter(v => !v.isReleased);
}

/**
 * Get the currently selected version info
 */
export function getSelectedVersionInfo(): ReleaseableVersion | undefined {
  const store = useReleaseStore.getState();
  return store.releaseableVersions.find(v => v.version === store.selectedVersion);
}

/**
 * Check if release button should be enabled
 */
export function canCreateRelease(): boolean {
  const store = useReleaseStore.getState();
  return (
    !!store.selectedVersion &&
    !!store.preflightStatus?.canRelease &&
    !store.isCreatingRelease
  );
}
