/**
 * Hook for loading Plane.so projects for a workspace
 */

import { useState, useEffect } from 'react';
import type { PlaneProject } from '../types';

export function usePlaneProjects(
  projectId: string,
  workspaceSlug: string,
  open: boolean
) {
  const [projects, setProjects] = useState<PlaneProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      if (!open || !workspaceSlug) {
        setProjects([]);
        return;
      }

      setIsLoadingProjects(true);
      setError(null);

      try {
        const result = await window.electronAPI.getPlaneProjects(
          projectId,
          workspaceSlug
        );
        if (result.success && result.data) {
          setProjects(result.data);
        } else {
          setError(result.error || 'Failed to load Plane projects');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoadingProjects(false);
      }
    };

    loadProjects();
  }, [open, projectId, workspaceSlug]);

  return { projects, isLoadingProjects, error, setError };
}
