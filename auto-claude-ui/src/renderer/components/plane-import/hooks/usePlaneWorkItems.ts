/**
 * Hook for loading Plane.so work items for a selected project
 */

import { useState, useEffect, useRef } from 'react';
import type { PlaneWorkItem } from '../types';

export function usePlaneWorkItems(
  projectId: string,
  workspaceSlug: string,
  planeProjectId: string,
  onWorkItemsChange?: () => void
) {
  const [workItems, setWorkItems] = useState<PlaneWorkItem[]>([]);
  const [isLoadingWorkItems, setIsLoadingWorkItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to store the callback to avoid unnecessary re-renders
  const onWorkItemsChangeRef = useRef(onWorkItemsChange);
  onWorkItemsChangeRef.current = onWorkItemsChange;

  useEffect(() => {
    const loadWorkItems = async () => {
      if (!workspaceSlug || !planeProjectId) {
        setWorkItems([]);
        return;
      }

      setIsLoadingWorkItems(true);
      setError(null);

      try {
        const result = await window.electronAPI.getPlaneWorkItems(
          projectId,
          workspaceSlug,
          planeProjectId
        );
        if (result.success && result.data) {
          setWorkItems(result.data);
          onWorkItemsChangeRef.current?.();
        } else {
          setError(result.error || 'Failed to load work items');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoadingWorkItems(false);
      }
    };

    loadWorkItems();
  }, [projectId, workspaceSlug, planeProjectId]);

  return { workItems, isLoadingWorkItems, error, setError };
}
