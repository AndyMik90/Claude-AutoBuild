/**
 * Hook for managing work item selection state
 */

import { useState, useCallback, useMemo } from 'react';
import type { PlaneWorkItem, WorkItemSelectionControls } from '../types';

export function useWorkItemSelection(filteredWorkItems: PlaneWorkItem[]): {
  selectedWorkItemIds: Set<string>;
  setSelectedWorkItemIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectionControls: WorkItemSelectionControls;
} {
  const [selectedWorkItemIds, setSelectedWorkItemIds] = useState<Set<string>>(new Set());

  const toggleWorkItem = useCallback((workItemId: string) => {
    setSelectedWorkItemIds(prev => {
      const next = new Set(prev);
      if (next.has(workItemId)) {
        next.delete(workItemId);
      } else {
        next.add(workItemId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedWorkItemIds(new Set(filteredWorkItems.map(i => i.id)));
  }, [filteredWorkItems]);

  const deselectAll = useCallback(() => {
    setSelectedWorkItemIds(new Set());
  }, []);

  const isAllSelected = useMemo(
    () => filteredWorkItems.length > 0 && filteredWorkItems.every(i => selectedWorkItemIds.has(i.id)),
    [filteredWorkItems, selectedWorkItemIds]
  );

  const isSomeSelected = useMemo(
    () => filteredWorkItems.some(i => selectedWorkItemIds.has(i.id)) && !isAllSelected,
    [filteredWorkItems, selectedWorkItemIds, isAllSelected]
  );

  return {
    selectedWorkItemIds,
    setSelectedWorkItemIds,
    selectionControls: {
      toggleWorkItem,
      selectAll,
      deselectAll,
      isAllSelected,
      isSomeSelected
    }
  };
}
