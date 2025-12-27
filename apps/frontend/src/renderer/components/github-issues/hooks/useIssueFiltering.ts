import { useState, useMemo } from 'react';
import type { GitHubIssue } from '../../../../shared/types';
import { filterIssuesBySearch } from '../utils';

export function useIssueFiltering(issues: GitHubIssue[]) {
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
