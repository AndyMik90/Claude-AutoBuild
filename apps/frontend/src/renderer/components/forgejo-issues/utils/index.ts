import type { ForgejoIssue } from '../../../../shared/types';

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function filterIssuesBySearch(issues: ForgejoIssue[], searchQuery: string): ForgejoIssue[] {
  // Defensive check for null/undefined issues
  if (!issues) {
    return [];
  }

  if (!searchQuery) {
    return issues;
  }

  const query = searchQuery.toLowerCase();
  return issues.filter(issue =>
    issue.title.toLowerCase().includes(query) ||
    issue.body?.toLowerCase().includes(query)
  );
}
