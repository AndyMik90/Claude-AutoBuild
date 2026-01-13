/**
 * Hook for managing issue selection state
 */

import { useState, useCallback, useMemo } from 'react';
import type { LinearIssue, IssueSelectionControls } from '../types';

export function useIssueSelection(filteredIssues: LinearIssue[]): {
  selectedIssueIds: Set<string>;
  setSelectedIssueIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectionControls: IssueSelectionControls;
} {
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());

  const toggleIssue = useCallback((issueId: string) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIssueIds(new Set(filteredIssues.map(i => i.id)));
  }, [filteredIssues]);

  const deselectAll = useCallback(() => {
    setSelectedIssueIds(new Set());
  }, []);

  const isAllSelected = useMemo(
    () => filteredIssues.length > 0 && filteredIssues.every(i => selectedIssueIds.has(i.id)),
    [filteredIssues, selectedIssueIds]
  );

  const isSomeSelected = useMemo(
    () => filteredIssues.some(i => selectedIssueIds.has(i.id)) && !isAllSelected,
    [filteredIssues, selectedIssueIds, isAllSelected]
  );

  return {
    selectedIssueIds,
    setSelectedIssueIds,
    selectionControls: {
      toggleIssue,
      selectAll,
      deselectAll,
      isAllSelected,
      isSomeSelected
    }
  };
}
