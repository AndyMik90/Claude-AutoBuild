import { useState, useMemo } from 'react';
import type { GitLabIssue } from '../../../../shared/types';
import { filterIssuesBySearch } from '../utils';

/**
 * Provides state and memoized filtered results for searching a list of GitLab issues.
 *
 * @param issues - The array of GitLab issues to filter based on the current search query.
 * @returns An object containing:
 *  - `searchQuery`: the current search string.
 *  - `setSearchQuery`: updater function to change the search string.
 *  - `filteredIssues`: the issues filtered according to `searchQuery`.
 */
export function useIssueFiltering(issues: GitLabIssue[]) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredIssues = useMemo(() => {
    return filterIssuesBySearch(issues, searchQuery);
  }, [issues, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    filteredIssues
  };
}