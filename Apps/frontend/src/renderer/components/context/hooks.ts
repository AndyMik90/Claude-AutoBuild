import { useEffect } from 'react';
import {
  loadProjectContext,
  refreshProjectIndex,
  searchMemories
} from '../../stores/context-store';

export function useProjectContext(projectId: string) {
  useEffect(() => {
    if (projectId) {
      loadProjectContext(projectId);
    }
  }, [projectId]);
}

export function useRefreshIndex(projectId: string) {
  return async () => {
    await refreshProjectIndex(projectId);
  };
}

export function useMemorySearch(projectId: string) {
  return async (query: string) => {
    if (query.trim()) {
      await searchMemories(projectId, query);
    }
  };
}
