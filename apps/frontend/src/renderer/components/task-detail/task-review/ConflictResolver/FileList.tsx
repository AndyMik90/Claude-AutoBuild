import { FileCode, Check, AlertTriangle } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { FileConflict } from '../../../../../shared/types';

interface FileListProps {
  files: FileConflict[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  hasResolution: (filePath: string) => boolean;
}

/**
 * Sidebar showing list of conflicting files with resolution status
 */
export function FileList({ files, selectedIndex, onSelect, hasResolution }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No conflicting files
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Conflicting Files ({files.length})
        </h3>
      </div>
      <div className="flex-1 overflow-auto">
        {files.map((file, index) => {
          const isSelected = index === selectedIndex;
          const isResolved = hasResolution(file.filePath);
          const fileName = file.filePath.split('/').pop() || file.filePath;
          const dirPath = file.filePath.split('/').slice(0, -1).join('/');

          return (
            <button
              type="button"
              key={file.filePath}
              onClick={() => onSelect(index)}
              className={cn(
                "w-full px-3 py-2 text-left transition-colors",
                "border-b border-border/50 last:border-b-0",
                "hover:bg-muted/50",
                isSelected && "bg-primary/10 border-l-2 border-l-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  {isResolved ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className={cn(
                      "text-sm font-medium truncate",
                      isSelected ? "text-foreground" : "text-foreground/90"
                    )}>
                      {fileName}
                    </span>
                  </div>
                  {dirPath && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {dirPath}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0 text-xs">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded",
                    isResolved
                      ? "bg-success/10 text-success"
                      : "bg-warning/10 text-warning"
                  )}>
                    {isResolved ? 'Resolved' : 'Pending'}
                  </span>
                </div>
              </div>
              {file.hunks && file.hunks.length > 1 && (
                <div className="mt-1 text-xs text-muted-foreground pl-6">
                  {file.hunks.length} change regions
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
