import { useState, useEffect } from 'react';
import type { InfrastructureStatus } from '../../shared/types';

export function useInfrastructureStatus(
  graphitiEnabled: boolean | undefined,
  falkorDbPort: number | undefined,
  open: boolean
) {
  const [infrastructureStatus, setInfrastructureStatus] = useState<InfrastructureStatus | null>(null);
  const [isCheckingInfrastructure, setIsCheckingInfrastructure] = useState(false);
  const [isStartingFalkorDB, setIsStartingFalkorDB] = useState(false);
  const [isOpeningDocker, setIsOpeningDocker] = useState(false);

  useEffect(() => {
    const checkInfrastructure = async () => {
      if (!graphitiEnabled) {
        setInfrastructureStatus(null);
        return;
      }

      setIsCheckingInfrastructure(true);
      try {
        const port = falkorDbPort || 6380;
        const result = await window.electronAPI.getInfrastructureStatus(port);
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
  }, [graphitiEnabled, falkorDbPort, open]);

  const handleStartFalkorDB = async () => {
    setIsStartingFalkorDB(true);
    try {
      const port = falkorDbPort || 6380;
      const result = await window.electronAPI.startFalkorDB(port);
      if (result.success && result.data?.success) {
        // Refresh status after starting
        const statusResult = await window.electronAPI.getInfrastructureStatus(port);
        if (statusResult.success && statusResult.data) {
          setInfrastructureStatus(statusResult.data);
        }
      }
    } catch {
      // Error handling is implicit in the status check
    } finally {
      setIsStartingFalkorDB(false);
    }
  };

  const handleOpenDockerDesktop = async () => {
    setIsOpeningDocker(true);
    try {
      await window.electronAPI.openDockerDesktop();
      // Wait a bit then refresh status
      setTimeout(async () => {
        const port = falkorDbPort || 6380;
        const result = await window.electronAPI.getInfrastructureStatus(port);
        if (result.success && result.data) {
          setInfrastructureStatus(result.data);
        }
        setIsOpeningDocker(false);
      }, 3000);
    } catch {
      setIsOpeningDocker(false);
    }
  };

  const handleDownloadDocker = async () => {
    const url = await window.electronAPI.getDockerDownloadUrl();
    window.electronAPI.openExternal(url);
  };

  return {
    infrastructureStatus,
    isCheckingInfrastructure,
    isStartingFalkorDB,
    isOpeningDocker,
    handleStartFalkorDB,
    handleOpenDockerDesktop,
    handleDownloadDocker,
  };
}
