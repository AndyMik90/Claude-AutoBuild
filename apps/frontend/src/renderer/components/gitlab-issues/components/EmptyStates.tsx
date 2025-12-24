import { GitlabIcon, Settings2 } from 'lucide-react';
import { Button } from '../../ui/button';
import type { EmptyStateProps, NotConnectedStateProps } from '../types';

/**
 * Render an empty-state UI that displays a circular icon and a contextual message.
 *
 * When `searchQuery` is provided, the message "No issues match your search" is shown;
 * otherwise the supplied `message` is displayed.
 *
 * @param searchQuery - Current search string that, when non-empty, overrides the displayed message
 * @param icon - Icon component to display inside the circular badge (defaults to `GitlabIcon`)
 * @param message - Message to show when `searchQuery` is empty
 * @returns A JSX element representing the empty-state container with icon and message
 */
export function EmptyState({ searchQuery, icon: Icon = GitlabIcon, message }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        {searchQuery ? 'No issues match your search' : message}
      </p>
    </div>
  );
}

/**
 * Displays a GitLab "not connected" UI with an optional error message and an optional "Open Settings" action.
 *
 * @param error - Optional error message to display; when omitted a default guidance message is shown.
 * @param onOpenSettings - Optional callback invoked when the "Open Settings" button is clicked; when omitted the button is not rendered.
 * @returns A React element rendering the NotConnectedState UI.
 */
export function NotConnectedState({ error, onOpenSettings }: NotConnectedStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <GitlabIcon className="h-8 w-8 text-orange-500" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        GitLab Not Connected
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error || 'Configure your GitLab token and project in project settings to sync issues.'}
      </p>
      {onOpenSettings && (
        <Button onClick={onOpenSettings} variant="outline">
          <Settings2 className="h-4 w-4 mr-2" />
          Open Settings
        </Button>
      )}
    </div>
  );
}