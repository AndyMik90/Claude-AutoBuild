import { FolderOpen } from 'lucide-react';

/**
 * Shows an empty state when no project is selected in settings.
 */
export function EmptyProjectState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-muted-foreground">
        Select a project to view and edit its settings
      </p>
    </div>
  );
}
