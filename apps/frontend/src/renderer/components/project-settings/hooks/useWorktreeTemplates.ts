import { useState, useEffect } from 'react';
import {
  WORKTREE_TEMPLATES,
  filterTemplatesByFiles,
  type WorktreeTemplate
} from '../../../../shared/constants';

export function useWorktreeTemplates(projectPath: string | undefined) {
  const [templates, setTemplates] = useState<WorktreeTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectPath) {
      setTemplates(WORKTREE_TEMPLATES.filter(t => t.alwaysShow));
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const detectTemplates = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.listDirectory(projectPath);
        if (cancelled) return;

        if (result.success && result.data) {
          const fileNames = new Set(result.data.map(f => f.name));
          const filtered = filterTemplatesByFiles(WORKTREE_TEMPLATES, fileNames);
          setTemplates(filtered);
        } else {
          setTemplates(WORKTREE_TEMPLATES.filter(t => t.alwaysShow));
        }
      } catch {
        if (!cancelled) {
          setTemplates(WORKTREE_TEMPLATES.filter(t => t.alwaysShow));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    detectTemplates();

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return { templates, isLoading };
}
