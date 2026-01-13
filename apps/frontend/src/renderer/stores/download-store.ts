import { create } from 'zustand';

export interface DownloadProgress {
  modelName: string;
  status: 'starting' | 'downloading' | 'completed' | 'failed';
  percentage: number;
  speed?: string;
  timeRemaining?: string;
  error?: string;
}

interface DownloadState {
  // Map of modelName -> progress
  downloads: Record<string, DownloadProgress>;

  // Actions
  startDownload: (modelName: string) => void;
  updateProgress: (modelName: string, progress: Partial<DownloadProgress>) => void;
  completeDownload: (modelName: string) => void;
  failDownload: (modelName: string, error: string) => void;
  clearDownload: (modelName: string) => void;

  // Selectors
  hasActiveDownloads: () => boolean;
  getActiveDownloads: () => DownloadProgress[];
}

// Progress tracking state for speed calculation
// Defined before store so cleanup can be called from store actions
const progressTracker: Record<string, { lastCompleted: number; lastUpdate: number }> = {};

/**
 * Clean up progress tracker entry to prevent memory leaks.
 * Called when downloads are cleared.
 */
function cleanupProgressTracker(modelName: string): void {
  delete progressTracker[modelName];
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: {},

  startDownload: (modelName: string) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [modelName]: {
          modelName,
          status: 'starting',
          percentage: 0,
        },
      },
    })),

  updateProgress: (modelName: string, progress: Partial<DownloadProgress>) =>
    set((state) => {
      const existing = state.downloads[modelName];
      if (!existing) return state;

      return {
        downloads: {
          ...state.downloads,
          [modelName]: {
            ...existing,
            ...progress,
            status: progress.percentage !== undefined && progress.percentage > 0
              ? 'downloading'
              : existing.status,
          },
        },
      };
    }),

  completeDownload: (modelName: string) =>
    set((state) => {
      const existing = state.downloads[modelName];
      if (!existing) return state;

      // Clean up progress tracker when download completes
      cleanupProgressTracker(modelName);

      return {
        downloads: {
          ...state.downloads,
          [modelName]: {
            ...existing,
            status: 'completed',
            percentage: 100,
          },
        },
      };
    }),

  failDownload: (modelName: string, error: string) =>
    set((state) => {
      const existing = state.downloads[modelName];
      if (!existing) return state;

      // Clean up progress tracker when download fails
      cleanupProgressTracker(modelName);

      return {
        downloads: {
          ...state.downloads,
          [modelName]: {
            ...existing,
            status: 'failed',
            error,
          },
        },
      };
    }),

  clearDownload: (modelName: string) =>
    set((state) => {
      // Clean up progress tracker to prevent memory leaks
      cleanupProgressTracker(modelName);

      const { [modelName]: _, ...rest } = state.downloads;
      return { downloads: rest };
    }),

  hasActiveDownloads: () => {
    const downloads = get().downloads;
    return Object.values(downloads).some(
      (d) => d.status === 'starting' || d.status === 'downloading'
    );
  },

  getActiveDownloads: () => {
    const downloads = get().downloads;
    return Object.values(downloads).filter(
      (d) => d.status === 'starting' || d.status === 'downloading'
    );
  },
}));

/**
 * Subscribe to download progress events from the main process.
 * Call this once when the app starts.
 */
export function initDownloadProgressListener(): () => void {
  const handleProgress = (data: {
    modelName: string;
    status: string;
    completed: number;
    total: number;
    percentage: number;
  }) => {
    const store = useDownloadStore.getState();
    const now = Date.now();

    // Initialize tracking for this model if needed
    if (!progressTracker[data.modelName]) {
      progressTracker[data.modelName] = {
        lastCompleted: data.completed,
        lastUpdate: now,
      };
    }

    const prevData = progressTracker[data.modelName];
    const timeDelta = now - prevData.lastUpdate;
    const bytesDelta = data.completed - prevData.lastCompleted;

    // Calculate speed only if we have meaningful time delta (> 100ms)
    let speedStr = '';
    let timeStr = '';

    if (timeDelta > 100 && bytesDelta > 0) {
      const speed = (bytesDelta / timeDelta) * 1000; // bytes per second
      const remaining = data.total - data.completed;
      const timeRemaining = speed > 0 ? Math.ceil(remaining / speed) : 0;

      // Format speed (MB/s or KB/s)
      if (speed > 1024 * 1024) {
        speedStr = `${(speed / (1024 * 1024)).toFixed(1)} MB/s`;
      } else if (speed > 1024) {
        speedStr = `${(speed / 1024).toFixed(1)} KB/s`;
      } else if (speed > 0) {
        speedStr = `${Math.round(speed)} B/s`;
      }

      // Format time remaining
      if (timeRemaining > 3600) {
        timeStr = `${Math.ceil(timeRemaining / 3600)}h remaining`;
      } else if (timeRemaining > 60) {
        timeStr = `${Math.ceil(timeRemaining / 60)}m remaining`;
      } else if (timeRemaining > 0) {
        timeStr = `${Math.ceil(timeRemaining)}s remaining`;
      }
    }

    // Update tracking
    progressTracker[data.modelName] = {
      lastCompleted: data.completed,
      lastUpdate: now,
    };

    store.updateProgress(data.modelName, {
      percentage: data.percentage,
      speed: speedStr || undefined,
      timeRemaining: timeStr || undefined,
    });
  };

  // Register the progress listener
  let unsubscribe: (() => void) | undefined;
  if (window.electronAPI?.onDownloadProgress) {
    unsubscribe = window.electronAPI.onDownloadProgress(handleProgress);
  }

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}
