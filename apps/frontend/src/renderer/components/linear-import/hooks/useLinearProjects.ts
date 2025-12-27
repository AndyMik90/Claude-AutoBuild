/**
 * Hook for loading Linear projects for a selected team
 */

import { useState, useEffect } from 'react';
import type { LinearProject } from '../types';

export function useLinearProjects(
  projectId: string,
  selectedTeamId: string
) {
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      if (!selectedTeamId) {
        setProjects([]);
        return;
      }

      setIsLoadingProjects(true);
      setError(null);

      try {
        const result = await window.electronAPI.getLinearProjects(
          projectId,
          selectedTeamId
        );
        if (result.success && result.data) {
          setProjects(result.data);
        } else {
          setError(result.error || 'Failed to load projects');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoadingProjects(false);
      }
    };

    loadProjects();
  }, [projectId, selectedTeamId]);

  return { projects, isLoadingProjects, error, setError };
}
