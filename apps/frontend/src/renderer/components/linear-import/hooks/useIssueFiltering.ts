/**
 * Hook for filtering and searching Linear issues
 */

import { useMemo } from 'react';
import type { LinearIssue } from '../types';

export function useIssueFiltering(
  issues: LinearIssue[],
  searchQuery: string,
  filterState: string
) {
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = issue.title.toLowerCase().includes(query);
        const matchesIdentifier = issue.identifier.toLowerCase().includes(query);
        const matchesDescription = issue.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesIdentifier && !matchesDescription) {
          return false;
        }
      }

      // State filter
      if (filterState !== 'all' && issue.state.type !== filterState) {
        return false;
      }

      return true;
    });
  }, [issues, searchQuery, filterState]);

  // Unique state types from issues for filter
  const uniqueStateTypes = useMemo(() => {
    const types = new Set(issues.map(i => i.state.type));
    return Array.from(types);
  }, [issues]);

  return { filteredIssues, uniqueStateTypes };
}
