import { Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '../../ui/scroll-area';
import { IssueListItem } from './IssueListItem';
import { EmptyState } from './EmptyStates';
import type { IssueListProps } from '../types';

/**
 * Render a list of issues with handling for error, loading, and empty states.
 *
 * Renders an error banner when `error` is set, a centered loading indicator when `isLoading` is true, an empty state when `issues` is empty, and otherwise a scrollable list of issue items.
 *
 * @param issues - Array of issue objects to display.
 * @param selectedIssueIid - The IID of the currently selected issue; used to mark an item as selected.
 * @param isLoading - When true, shows a loading indicator instead of the list.
 * @param error - Optional error message to show in an error banner.
 * @param onSelectIssue - Callback invoked with an issue IID when an item is selected.
 * @param onInvestigate - Callback invoked with the full issue object when the investigate action is triggered.
 * @returns The JSX element representing the issue list or an appropriate UI state (error, loading, or empty).
 */
export function IssueList({
  issues,
  selectedIssueIid,
  isLoading,
  error,
  onSelectIssue,
  onInvestigate
}: IssueListProps) {
  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border-b border-destructive/30">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (issues.length === 0) {
    return <EmptyState message="No issues found" />;
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-1">
        {issues.map((issue) => (
          <IssueListItem
            key={issue.id}
            issue={issue}
            isSelected={selectedIssueIid === issue.iid}
            onClick={() => onSelectIssue(issue.iid)}
            onInvestigate={() => onInvestigate(issue)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}