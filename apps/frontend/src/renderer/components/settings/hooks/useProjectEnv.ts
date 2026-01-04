import { useState, useCallback, useEffect } from 'react';
import type { GlobalEnvConfig, EnvValueSource } from '../../../../shared/types/settings';
import type { ProjectEnvConfig } from '../../../../shared/types/project';

interface ProjectEnvState {
  // Current values (merged with global)
  config: ProjectEnvConfig;
  // Track which fields are using global vs project values
  sources: Record<string, EnvValueSource>;
  // Staged changes (not yet saved)
  stagedChanges: Partial<ProjectEnvConfig>;
  // Is loading
  isLoading: boolean;
  // Error message
  error: string | null;
}

interface UseProjectEnvResult {
  config: ProjectEnvConfig;
  sources: Record<string, EnvValueSource>;
  stagedChanges: Partial<ProjectEnvConfig>;
  isLoading: boolean;
  error: string | null;
  // Update a field (stages the change)
  updateField: <K extends keyof ProjectEnvConfig>(key: K, value: ProjectEnvConfig[K]) => void;
  // Override a global value with project-specific
  overrideGlobal: (key: string) => void;
  // Use global value instead of project-specific
  useGlobal: (key: string) => void;
  // Save all staged changes
  save: () => Promise<boolean>;
  // Discard staged changes
  discard: () => void;
  // Reload from backend
  reload: () => Promise<void>;
  // Check if there are unsaved changes
  hasChanges: boolean;
}

/**
 * Hook for managing project environment configuration
 * Handles merging with global settings and tracking value sources
 */
export function useProjectEnv(
  projectId: string | null,
  globalConfig: GlobalEnvConfig | null
): UseProjectEnvResult {
  const [state, setState] = useState<ProjectEnvState>({
    config: getDefaultConfig(),
    sources: {},
    stagedChanges: {},
    isLoading: false,
    error: null
  });

  // Load project env from backend
  const loadProjectEnv = useCallback(async () => {
    if (!projectId) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await window.electronAPI.getProjectEnv(projectId);
      if (result.success && result.data) {
        const projectConfig = result.data;

        // Determine sources for each field
        const sources: Record<string, EnvValueSource> = {};

        // Claude OAuth Token
        sources['claudeOAuthToken'] = projectConfig.claudeTokenIsGlobal ? 'global' :
          projectConfig.claudeOAuthToken ? 'project' : 'none';

        // OpenAI API Key
        sources['openaiApiKey'] = projectConfig.openaiKeyIsGlobal ? 'global' :
          projectConfig.openaiApiKey ? 'project' : 'none';

        // Other fields are project-only
        sources['linearApiKey'] = projectConfig.linearApiKey ? 'project' : 'none';
        sources['githubToken'] = projectConfig.githubToken ? 'project' : 'none';
        sources['defaultBranch'] = projectConfig.defaultBranch ? 'project' : 'none';

        setState({
          config: projectConfig,
          sources,
          stagedChanges: {},
          isLoading: false,
          error: null
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to load environment configuration'
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load environment configuration'
      }));
    }
  }, [projectId]);

  // Load on mount and when projectId changes
  useEffect(() => {
    loadProjectEnv();
  }, [loadProjectEnv]);

  // Update a field (stages the change)
  const updateField = useCallback(<K extends keyof ProjectEnvConfig>(
    key: K,
    value: ProjectEnvConfig[K]
  ) => {
    setState(prev => ({
      ...prev,
      stagedChanges: {
        ...prev.stagedChanges,
        [key]: value
      }
    }));
  }, []);

  // Override a global value with project-specific
  const overrideGlobal = useCallback((key: string) => {
    setState(prev => ({
      ...prev,
      sources: {
        ...prev.sources,
        [key]: 'project'
      },
      stagedChanges: {
        ...prev.stagedChanges,
        // Clear the value so user can enter new one
        [key]: ''
      }
    }));
  }, []);

  // Use global value instead of project-specific
  const useGlobal = useCallback((key: string) => {
    setState(prev => {
      const newStagedChanges = { ...prev.stagedChanges };
      delete newStagedChanges[key as keyof ProjectEnvConfig];

      return {
        ...prev,
        sources: {
          ...prev.sources,
          [key]: 'global'
        },
        stagedChanges: newStagedChanges
      };
    });
  }, []);

  // Save all staged changes
  const save = useCallback(async (): Promise<boolean> => {
    if (!projectId || Object.keys(state.stagedChanges).length === 0) {
      return true;
    }

    // Capture the keys being saved to only clear those specific changes
    // This prevents losing changes made during the save operation
    const savedKeys = new Set(Object.keys(state.stagedChanges));
    const changesToSave = { ...state.stagedChanges };

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await window.electronAPI.updateProjectEnv(projectId, changesToSave);

      if (result.success) {
        // Only clear the changes that were actually saved
        // Any new changes made during save are preserved
        setState(prev => {
          const remainingChanges: Partial<ProjectEnvConfig> = {};
          for (const [key, value] of Object.entries(prev.stagedChanges)) {
            if (!savedKeys.has(key)) {
              remainingChanges[key as keyof ProjectEnvConfig] = value as never;
            }
          }
          return {
            ...prev,
            config: { ...prev.config, ...changesToSave },
            stagedChanges: remainingChanges,
            isLoading: false,
            error: null
          };
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to save changes'
        }));
        return false;
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to save changes'
      }));
      return false;
    }
  }, [projectId, state.stagedChanges]);

  // Discard staged changes
  const discard = useCallback(() => {
    setState(prev => ({
      ...prev,
      stagedChanges: {}
    }));
  }, []);

  // Get merged config (current + staged changes)
  const mergedConfig: ProjectEnvConfig = {
    ...state.config,
    ...state.stagedChanges
  };

  return {
    config: mergedConfig,
    sources: state.sources,
    stagedChanges: state.stagedChanges,
    isLoading: state.isLoading,
    error: state.error,
    updateField,
    overrideGlobal,
    useGlobal,
    save,
    discard,
    reload: loadProjectEnv,
    hasChanges: Object.keys(state.stagedChanges).length > 0
  };
}

function getDefaultConfig(): ProjectEnvConfig {
  return {
    claudeAuthStatus: 'not_configured',
    linearEnabled: false,
    githubEnabled: false,
    gitlabEnabled: false,
    graphitiEnabled: false,
    enableFancyUi: true
  };
}
