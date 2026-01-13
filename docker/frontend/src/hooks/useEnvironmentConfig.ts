import { useState, useEffect } from 'react';
import type { ProjectEnvConfig } from '../../shared/types';

export function useEnvironmentConfig(projectId: string, autoBuildPath: string | null, open: boolean) {
  const [envConfig, setEnvConfig] = useState<ProjectEnvConfig | null>(null);
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  // Load environment config when dialog opens
  useEffect(() => {
    const loadEnvConfig = async () => {
      if (open && autoBuildPath) {
        setIsLoadingEnv(true);
        setEnvError(null);
        try {
          const result = await window.electronAPI.getProjectEnv(projectId);
          if (result.success && result.data) {
            setEnvConfig(result.data);
          } else {
            setEnvError(result.error || 'Failed to load environment config');
          }
        } catch (err) {
          setEnvError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setIsLoadingEnv(false);
        }
      }
    };
    loadEnvConfig();
  }, [open, projectId, autoBuildPath]);

  const updateEnvConfig = (updates: Partial<ProjectEnvConfig>) => {
    if (envConfig) {
      setEnvConfig({ ...envConfig, ...updates });
    }
  };

  const saveEnvConfig = async () => {
    if (!envConfig) return { success: false, error: 'No config to save' };

    setIsSavingEnv(true);
    setEnvError(null);
    try {
      const result = await window.electronAPI.updateProjectEnv(projectId, envConfig);
      if (!result.success) {
        setEnvError(result.error || 'Failed to save environment config');
        return { success: false, error: result.error };
      }
      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      setEnvError(error);
      return { success: false, error };
    } finally {
      setIsSavingEnv(false);
    }
  };

  return {
    envConfig,
    setEnvConfig,
    updateEnvConfig,
    isLoadingEnv,
    envError,
    setEnvError,
    isSavingEnv,
    saveEnvConfig,
  };
}
