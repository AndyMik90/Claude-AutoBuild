import { useState, useCallback } from 'react';
import type {
  FileConflict,
  ConflictResolution,
  ConflictResolutionRequest,
  DetailedGitConflictInfo
} from '../../../../../../shared/types';

export interface FileResolutionState {
  filePath: string;
  resolution: ConflictResolution | null;
  customContent?: string;
  hunkResolutions?: Map<string, { resolution: ConflictResolution; customContent?: string }>;
}

export interface ConflictResolverState {
  files: FileConflict[];
  selectedFileIndex: number;
  resolutionMode: 'file' | 'hunk';
  fileResolutions: Map<string, FileResolutionState>;
  isApplying: boolean;
  error: string | null;
}

export function useConflictResolver(taskId: string) {
  const [state, setState] = useState<ConflictResolverState>({
    files: [],
    selectedFileIndex: 0,
    resolutionMode: 'file',
    fileResolutions: new Map(),
    isApplying: false,
    error: null
  });

  const [isLoading, setIsLoading] = useState(false);

  // Load conflict details from backend
  const loadConflictDetails = useCallback(async () => {
    setIsLoading(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const result = await window.electronAPI.getConflictDetails(taskId);
      if (result.success && result.data) {
        const files = result.data.fileContents || [];
        setState(prev => ({
          ...prev,
          files,
          selectedFileIndex: 0,
          fileResolutions: new Map()
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: result.error || 'Failed to load conflict details'
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load conflict details'
      }));
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  // Select a file to view
  const selectFile = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedFileIndex: index
    }));
  }, []);

  // Toggle between file-level and hunk-level resolution mode
  const setResolutionMode = useCallback((mode: 'file' | 'hunk') => {
    setState(prev => ({ ...prev, resolutionMode: mode }));
  }, []);

  // Set resolution for a file
  const setFileResolution = useCallback((
    filePath: string,
    resolution: ConflictResolution,
    customContent?: string
  ) => {
    setState(prev => {
      const newResolutions = new Map(prev.fileResolutions);
      newResolutions.set(filePath, {
        filePath,
        resolution,
        customContent,
        hunkResolutions: undefined // Clear hunk resolutions when setting file-level
      });
      return { ...prev, fileResolutions: newResolutions };
    });
  }, []);

  // Set resolution for a specific hunk
  const setHunkResolution = useCallback((
    filePath: string,
    hunkId: string,
    resolution: ConflictResolution,
    customContent?: string
  ) => {
    setState(prev => {
      const newResolutions = new Map(prev.fileResolutions);
      const existing = newResolutions.get(filePath) || {
        filePath,
        resolution: null,
        hunkResolutions: new Map()
      };

      const hunkResolutions = new Map(existing.hunkResolutions || []);
      hunkResolutions.set(hunkId, { resolution, customContent });

      newResolutions.set(filePath, {
        ...existing,
        resolution: null, // Clear file-level when setting hunk-level
        hunkResolutions
      });

      return { ...prev, fileResolutions: newResolutions };
    });
  }, []);

  // Get resolution for a file
  const getFileResolution = useCallback((filePath: string): FileResolutionState | undefined => {
    return state.fileResolutions.get(filePath);
  }, [state.fileResolutions]);

  // Check if a file has any resolution set
  const hasResolution = useCallback((filePath: string): boolean => {
    const resolution = state.fileResolutions.get(filePath);
    if (!resolution) return false;
    if (resolution.resolution) return true;
    if (resolution.hunkResolutions && resolution.hunkResolutions.size > 0) return true;
    return false;
  }, [state.fileResolutions]);

  // Count resolved files
  const resolvedCount = useCallback((): number => {
    let count = 0;
    state.files.forEach(file => {
      if (hasResolution(file.filePath)) count++;
    });
    return count;
  }, [state.files, hasResolution]);

  // Build resolution request for backend
  const buildResolutionRequest = useCallback((): ConflictResolutionRequest => {
    const resolutions: ConflictResolutionRequest['resolutions'] = [];

    state.fileResolutions.forEach((fileRes, filePath) => {
      if (fileRes.resolution) {
        // File-level resolution
        resolutions.push({
          filePath,
          resolution: fileRes.resolution,
          customContent: fileRes.customContent
        });
      } else if (fileRes.hunkResolutions && fileRes.hunkResolutions.size > 0) {
        // Hunk-level resolutions
        const hunkResolutions: Array<{
          hunkId: string;
          resolution: ConflictResolution;
          customContent?: string;
        }> = [];

        fileRes.hunkResolutions.forEach((hunkRes, hunkId) => {
          hunkResolutions.push({
            hunkId,
            resolution: hunkRes.resolution,
            customContent: hunkRes.customContent
          });
        });

        resolutions.push({
          filePath,
          resolution: 'custom', // Will be built from hunks
          hunkResolutions
        });
      }
    });

    return { taskId, resolutions };
  }, [taskId, state.fileResolutions]);

  // Apply resolutions
  const applyResolutions = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isApplying: true, error: null }));

    try {
      const request = buildResolutionRequest();
      const result = await window.electronAPI.applyResolutions(taskId, request);

      if (result.success && result.data?.success) {
        setState(prev => ({ ...prev, isApplying: false }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isApplying: false,
          error: result.data?.message || result.error || 'Failed to apply resolutions'
        }));
        return false;
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        isApplying: false,
        error: err instanceof Error ? err.message : 'Failed to apply resolutions'
      }));
      return false;
    }
  }, [taskId, buildResolutionRequest]);

  // Apply AI resolution for all files
  const applyAIForAll = useCallback(() => {
    setState(prev => {
      const newResolutions = new Map<string, FileResolutionState>();
      prev.files.forEach(file => {
        newResolutions.set(file.filePath, {
          filePath: file.filePath,
          resolution: 'ai'
        });
      });
      return { ...prev, fileResolutions: newResolutions };
    });
  }, []);

  // Clear all resolutions
  const clearResolutions = useCallback(() => {
    setState(prev => ({
      ...prev,
      fileResolutions: new Map()
    }));
  }, []);

  // Get current file
  const currentFile = state.files[state.selectedFileIndex] || null;

  return {
    // State
    files: state.files,
    currentFile,
    selectedFileIndex: state.selectedFileIndex,
    resolutionMode: state.resolutionMode,
    isLoading,
    isApplying: state.isApplying,
    error: state.error,

    // Counts
    totalFiles: state.files.length,
    resolvedCount: resolvedCount(),

    // Actions
    loadConflictDetails,
    selectFile,
    setResolutionMode,
    setFileResolution,
    setHunkResolution,
    getFileResolution,
    hasResolution,
    applyResolutions,
    applyAIForAll,
    clearResolutions
  };
}
