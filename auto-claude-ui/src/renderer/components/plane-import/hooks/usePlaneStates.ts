/**
 * Hook for loading Plane.so states for a selected project
 */

import { useState, useEffect } from 'react';
import type { PlaneState } from '../types';

export function usePlaneStates(
  projectId: string,
  workspaceSlug: string,
  planeProjectId: string
) {
  const [states, setStates] = useState<PlaneState[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);

  useEffect(() => {
    const loadStates = async () => {
      if (!workspaceSlug || !planeProjectId) {
        setStates([]);
        return;
      }

      setIsLoadingStates(true);

      try {
        const result = await window.electronAPI.getPlaneStates(
          projectId,
          workspaceSlug,
          planeProjectId
        );
        if (result.success && result.data) {
          // Sort by sequence for proper ordering (handle missing sequence)
          const sortedStates = [...result.data].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          setStates(sortedStates);
        } else {
          console.warn('[PlaneStates] Failed to load states:', result.error);
        }
      } catch (err) {
        console.warn('[PlaneStates] Error loading states:', err);
      } finally {
        setIsLoadingStates(false);
      }
    };

    loadStates();
  }, [projectId, workspaceSlug, planeProjectId]);

  return { states, isLoadingStates };
}
