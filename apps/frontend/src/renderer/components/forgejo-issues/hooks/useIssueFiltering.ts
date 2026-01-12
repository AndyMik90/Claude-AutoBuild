import { useState, useMemo } from 'react';
import type { ForgejoIssue } from '../../../../shared/types';
import { filterIssuesBySearch } from '../utils';

export function useIssueFiltering(issues: ForgejoIssue[]) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIssues = useMemo(() => {
    // Ensure issues is always an array
    const safeIssues = issues || [];
    return filterIssuesBySearch(safeIssues, searchQuery);
  }, [issues, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    filteredIssues
  };
}
