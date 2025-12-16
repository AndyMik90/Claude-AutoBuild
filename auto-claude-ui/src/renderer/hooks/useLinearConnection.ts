import { useState, useEffect } from 'react';
import type { LinearSyncStatus } from '../../shared/types';

export function useLinearConnection(
  projectId: string,
  linearEnabled: boolean | undefined,
  linearApiKey: string | undefined
) {
  const [linearConnectionStatus, setLinearConnectionStatus] = useState<LinearSyncStatus | null>(null);
  const [isCheckingLinear, setIsCheckingLinear] = useState(false);

  useEffect(() => {
    const checkLinearConnection = async () => {
      if (!linearEnabled || !linearApiKey) {
        setLinearConnectionStatus(null);
        return;
      }

      setIsCheckingLinear(true);
      try {
        const result = await window.electronAPI.checkLinearConnection(projectId);
        if (result.success && result.data) {
          setLinearConnectionStatus(result.data);
        }
      } catch {
        setLinearConnectionStatus({ connected: false, error: 'Failed to check connection' });
      } finally {
        setIsCheckingLinear(false);
      }
    };

    if (linearEnabled && linearApiKey) {
      checkLinearConnection();
    }
  }, [linearEnabled, linearApiKey, projectId]);

  return {
    linearConnectionStatus,
    isCheckingLinear,
  };
}
