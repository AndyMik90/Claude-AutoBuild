import { GitMerge, ExternalLink } from 'lucide-react';
import { Button } from '../../ui/button';
import type { Task } from '../../../../shared/types';

interface StagedSuccessMessageProps {
  stagedSuccess: string;
  stagedProjectPath: string | undefined;
  task: Task;
}

/**
 * Displays success message after changes have been staged in the main project
 */
export function StagedSuccessMessage({
  stagedSuccess,
  stagedProjectPath,
  task
}: StagedSuccessMessageProps) {
  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-success" />
        Changes Staged Successfully
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {stagedSuccess}
      </p>
      <div className="bg-background/50 rounded-lg p-3 mb-3">
        <p className="text-xs text-muted-foreground mb-2">Next steps:</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Open your project in your IDE or terminal</li>
          <li>Review the staged changes with <code className="bg-background px-1 rounded">git status</code> and <code className="bg-background px-1 rounded">git diff --staged</code></li>
          <li>Commit when ready: <code className="bg-background px-1 rounded">git commit -m "your message"</code></li>
        </ol>
      </div>
      {stagedProjectPath && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.electronAPI.createTerminal({
              id: `project-${task.id}`,
              cwd: stagedProjectPath
            });
          }}
          className="w-full"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Open Project in Terminal
        </Button>
      )}
    </div>
  );
}
