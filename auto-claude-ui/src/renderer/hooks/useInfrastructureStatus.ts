import { useState, useEffect } from 'react';
import type { InfrastructureStatus } from '../../shared/types';

/**
 * Hook for checking memory infrastructure status (LadybugDB)
 * No Docker required - uses embedded database
 */
export function useInfrastructureStatus(
  graphitiEnabled: boolean | undefined,
  dbPath: string | undefined,
  open: boolean
) {
  const [infrastructureStatus, setInfrastructureStatus] = useState<InfrastructureStatus | null>(null);
  const [isCheckingInfrastructure, setIsCheckingInfrastructure] = useState(false);

  useEffect(() => {
    const checkInfrastructure = async () => {
      if (!graphitiEnabled) {
        setInfrastructureStatus(null);
        return;
      }

      setIsCheckingInfrastructure(true);
      try {
        const result = await window.electronAPI.getMemoryInfrastructureStatus(dbPath);
        if (result.success && result.data) {
          setInfrastructureStatus(result.data);
        }
      } catch {
        // Silently fail - infrastructure check is optional
      } finally {
        setIsCheckingInfrastructure(false);
      }
    };

    checkInfrastructure();
    // Refresh every 10 seconds while Graphiti is enabled
    let interval: NodeJS.Timeout | undefined;
    if (graphitiEnabled && open) {
      interval = setInterval(checkInfrastructure, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [graphitiEnabled, dbPath, open]);

  return {
    infrastructureStatus,
    isCheckingInfrastructure,
  };
}
