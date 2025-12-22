/**
 * Hook for managing the Plane import operation
 */

import { useState, useCallback } from 'react';
import type { PlaneImportResult } from '../types';

export function usePlaneImport(
  projectId: string,
  workspaceSlug: string,
  planeProjectId: string,
  planeProjectIdentifier: string,
  onImportComplete?: (result: PlaneImportResult) => void
) {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<PlaneImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = useCallback(
    async (selectedWorkItemIds: Set<string>) => {
      if (selectedWorkItemIds.size === 0) return;

      // Validate required parameters before making the import call
      if (!workspaceSlug) {
        setError('Please enter a workspace slug before importing');
        return;
      }
      if (!planeProjectId) {
        setError('Please select a Plane project before importing');
        return;
      }

      setIsImporting(true);
      setError(null);
      setImportResult(null);

      try {
        const result = await window.electronAPI.importPlaneWorkItems(
          projectId,
          Array.from(selectedWorkItemIds),
          workspaceSlug,
          planeProjectId,
          planeProjectIdentifier
        );

        if (result.success && result.data) {
          setImportResult(result.data);
          if (result.data.success) {
            onImportComplete?.(result.data);
          }
        } else {
          setError(result.error || 'Failed to import work items');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsImporting(false);
      }
    },
    [projectId, workspaceSlug, planeProjectId, planeProjectIdentifier, onImportComplete]
  );

  return {
    isImporting,
    importResult,
    error,
    setError,
    handleImport
  };
}
