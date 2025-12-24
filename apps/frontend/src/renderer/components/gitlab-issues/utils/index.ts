import type { GitLabIssue } from '../../../../shared/types';

/**
 * Formats a date string into an en-US short month/day/year representation.
 *
 * @param dateString - A date string accepted by the JavaScript Date constructor
 * @returns The formatted date using short month, numeric day, and numeric year (e.g., "Jan 2, 2006")
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Filter a list of GitLab issues by a case-insensitive search query against title or description.
 *
 * @param issues - The array of issues to filter.
 * @param searchQuery - The search text; when empty, the original `issues` array is returned unchanged.
 * @returns The subset of `issues` whose title or description contains `searchQuery`, matching case-insensitively.
 */
export function filterIssuesBySearch(issues: GitLabIssue[], searchQuery: string): GitLabIssue[] {
  if (!searchQuery) {
    return issues;
  }

  const query = searchQuery.toLowerCase();
  return issues.filter(issue =>
    issue.title.toLowerCase().includes(query) ||
    issue.description?.toLowerCase().includes(query)
  );
}