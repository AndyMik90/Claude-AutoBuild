import { useState, useEffect } from 'react';
import type { GitHubSyncStatus } from '../../shared/types';

export function useGitHubConnection(
  projectId: string,
  githubEnabled: boolean | undefined,
  githubToken: string | undefined,
  githubRepo: string | undefined
) {
  const [gitHubConnectionStatus, setGitHubConnectionStatus] = useState<GitHubSyncStatus | null>(null);
  const [isCheckingGitHub, setIsCheckingGitHub] = useState(false);

  useEffect(() => {
    const checkGitHubConnection = async () => {
      if (!githubEnabled || !githubToken || !githubRepo) {
        setGitHubConnectionStatus(null);
        return;
      }

      setIsCheckingGitHub(true);
      try {
        const result = await window.electronAPI.checkGitHubConnection(projectId);
        if (result.success && result.data) {
          setGitHubConnectionStatus(result.data);
        }
      } catch {
        setGitHubConnectionStatus({ connected: false, error: 'Failed to check connection' });
      } finally {
        setIsCheckingGitHub(false);
      }
    };

    if (githubEnabled && githubToken && githubRepo) {
      checkGitHubConnection();
    }
  }, [githubEnabled, githubToken, githubRepo, projectId]);

  return {
    gitHubConnectionStatus,
    isCheckingGitHub,
  };
}
