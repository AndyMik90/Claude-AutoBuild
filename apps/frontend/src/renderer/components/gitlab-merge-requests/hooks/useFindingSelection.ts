/**
 * Custom hook for managing GitLab MR finding selection state and actions
 */

import { useCallback } from 'react';
import type { GitLabMRReviewFinding } from './useGitLabMRs';
import type { SeverityGroup } from '../constants/severity-config';

interface UseFindingSelectionProps {
  findings: GitLabMRReviewFinding[];
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  groupedFindings: Record<SeverityGroup, GitLabMRReviewFinding[]>;
}

export function useFindingSelection({
  findings,
  selectedIds,
  onSelectionChange,
  groupedFindings,
}: UseFindingSelectionProps) {
  // Toggle individual finding selection
  const toggleFinding = useCallback((id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }, [selectedIds, onSelectionChange]);

  // Select all findings
  const selectAll = useCallback(() => {
    onSelectionChange(new Set(findings.map(f => f.id)));
  }, [findings, onSelectionChange]);

  // Clear all selections
  const selectNone = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // Select only critical and high severity findings
  const selectImportant = useCallback(() => {
    const important = [...groupedFindings.critical, ...groupedFindings.high];
    onSelectionChange(new Set(important.map(f => f.id)));
  }, [groupedFindings, onSelectionChange]);

  // Toggle entire severity group selection
  const toggleSeverityGroup = useCallback((severity: SeverityGroup) => {
    const groupFindings = groupedFindings[severity];
    const allSelected = groupFindings.every(f => selectedIds.has(f.id));

    const next = new Set(selectedIds);
    if (allSelected) {
      // Deselect all in group
      for (const f of groupFindings) {
        next.delete(f.id);
      }
    } else {
      // Select all in group
      for (const f of groupFindings) {
        next.add(f.id);
      }
    }
    onSelectionChange(next);
  }, [groupedFindings, selectedIds, onSelectionChange]);

  // Check if all findings in a group are selected
  const isGroupFullySelected = useCallback((severity: SeverityGroup) => {
    const groupFindings = groupedFindings[severity];
    return groupFindings.length > 0 && groupFindings.every(f => selectedIds.has(f.id));
  }, [groupedFindings, selectedIds]);

  // Check if some (but not all) findings in a group are selected
  const isGroupPartiallySelected = useCallback((severity: SeverityGroup) => {
    const groupFindings = groupedFindings[severity];
    const selectedCount = groupFindings.filter(f => selectedIds.has(f.id)).length;
    return selectedCount > 0 && selectedCount < groupFindings.length;
  }, [groupedFindings, selectedIds]);

  return {
    toggleFinding,
    selectAll,
    selectNone,
    selectImportant,
    toggleSeverityGroup,
    isGroupFullySelected,
    isGroupPartiallySelected,
  };
}
