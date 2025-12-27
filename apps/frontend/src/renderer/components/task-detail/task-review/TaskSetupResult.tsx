import { CheckCircle2, XCircle, Clock, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { WorktreeSetupResult, WorktreeSetupCommandResult } from '../../../../shared/types';
import { cn } from '../../../lib/utils';

interface TaskSetupResultProps {
  setupResult: WorktreeSetupResult;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function CommandResult({ result }: { result: WorktreeSetupCommandResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = result.stdout || result.stderr;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 p-2 text-left",
          hasOutput && "hover:bg-muted/50 cursor-pointer",
          !hasOutput && "cursor-default"
        )}
        disabled={!hasOutput}
      >
        {result.success ? (
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
        )}
        <code className="text-xs font-mono flex-1 truncate">{result.command}</code>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDuration(result.durationMs)}
        </span>
        {hasOutput && (
          expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        )}
      </button>

      {expanded && hasOutput && (
        <div className="border-t border-border bg-muted/30 p-2">
          {result.stdout && (
            <div className="mb-2">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase">stdout</p>
              <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {result.stdout}
              </pre>
            </div>
          )}
          {result.stderr && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase">stderr</p>
              <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto text-destructive">
                {result.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskSetupResult({ setupResult }: TaskSetupResultProps) {
  const successCount = setupResult.commands.filter(c => c.success).length;
  const totalCount = setupResult.commands.length;
  const allSucceeded = setupResult.success && !setupResult.error;

  if (totalCount === 0 && !setupResult.error) {
    return null;
  }

  return (
    <div className={cn(
      "rounded-xl border p-4",
      allSucceeded
        ? "border-success/30 bg-success/5"
        : "border-warning/30 bg-warning/5"
    )}>
      <div className="flex items-center gap-2 mb-3">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm text-foreground">Worktree Setup</h3>
        <div className="flex-1" />
        {allSucceeded ? (
          <span className="text-xs text-success flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            All commands succeeded
          </span>
        ) : setupResult.error ? (
          <span className="text-xs text-destructive flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Setup failed
          </span>
        ) : (
          <span className="text-xs text-warning">
            {successCount}/{totalCount} commands succeeded
          </span>
        )}
      </div>

      {setupResult.error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 mb-3">
          <p className="text-xs text-destructive">{setupResult.error}</p>
        </div>
      )}

      {setupResult.commands.length > 0 && (
        <div className="space-y-2">
          {setupResult.commands.map((cmd, index) => (
            <CommandResult key={index} result={cmd} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Total: {formatDuration(setupResult.totalDurationMs)}</span>
        <span className="text-[10px]">
          ({new Date(setupResult.executedAt).toLocaleTimeString()})
        </span>
      </div>
    </div>
  );
}
