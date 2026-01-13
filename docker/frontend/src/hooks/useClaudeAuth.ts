import { useState, useEffect } from 'react';
import type { ProjectEnvConfig } from '../../shared/types';

type AuthStatus = 'checking' | 'authenticated' | 'not_authenticated' | 'error';

export function useClaudeAuth(projectId: string, autoBuildPath: string | null, open: boolean) {
  const [isCheckingClaudeAuth, setIsCheckingClaudeAuth] = useState(false);
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<AuthStatus>('checking');

  // Check Claude authentication status
  useEffect(() => {
    const checkAuth = async () => {
      if (open && autoBuildPath) {
        setIsCheckingClaudeAuth(true);
        try {
          const result = await window.electronAPI.checkClaudeAuth(projectId);
          if (result.success && result.data) {
            setClaudeAuthStatus(result.data.authenticated ? 'authenticated' : 'not_authenticated');
          } else {
            setClaudeAuthStatus('error');
          }
        } catch {
          setClaudeAuthStatus('error');
        } finally {
          setIsCheckingClaudeAuth(false);
        }
      }
    };
    checkAuth();
  }, [open, projectId, autoBuildPath]);

  const handleClaudeSetup = async (
    onSuccess?: (envConfig: ProjectEnvConfig) => void
  ) => {
    setIsCheckingClaudeAuth(true);
    try {
      const result = await window.electronAPI.invokeClaudeSetup(projectId);
      if (result.success && result.data?.authenticated) {
        setClaudeAuthStatus('authenticated');
        // Refresh env config
        const envResult = await window.electronAPI.getProjectEnv(projectId);
        if (envResult.success && envResult.data && onSuccess) {
          onSuccess(envResult.data);
        }
      }
    } catch {
      setClaudeAuthStatus('error');
    } finally {
      setIsCheckingClaudeAuth(false);
    }
  };

  return {
    isCheckingClaudeAuth,
    claudeAuthStatus,
    handleClaudeSetup,
  };
}
