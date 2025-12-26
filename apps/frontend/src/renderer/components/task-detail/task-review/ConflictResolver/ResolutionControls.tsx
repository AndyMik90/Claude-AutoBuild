import { ArrowLeft, ArrowRight, GitMerge, Sparkles, Edit2, Check } from 'lucide-react';
import { Button } from '../../../ui/button';
import { cn } from '../../../../lib/utils';
import type { ConflictResolution, FileConflict } from '../../../../../shared/types';
import type { FileResolutionState } from './hooks/useConflictResolver';

interface ResolutionControlsProps {
  file: FileConflict | null;
  currentResolution: FileResolutionState | undefined;
  resolutionMode: 'file' | 'hunk';
  onResolutionModeChange: (mode: 'file' | 'hunk') => void;
  onSetResolution: (resolution: ConflictResolution) => void;
  onEditManually: () => void;
}

/**
 * Resolution action buttons for the current file
 */
export function ResolutionControls({
  file,
  currentResolution,
  resolutionMode,
  onResolutionModeChange,
  onSetResolution,
  onEditManually
}: ResolutionControlsProps) {
  if (!file) {
    return null;
  }

  const activeResolution = currentResolution?.resolution;
  const hasHunks = file.hunks && file.hunks.length > 1;

  return (
    <div className="border-t border-border bg-muted/20 p-4 space-y-4">
      {/* Resolution Mode Toggle */}
      {hasHunks && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Resolution mode:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onResolutionModeChange('file')}
              className={cn(
                "px-3 py-1 text-xs transition-colors",
                resolutionMode === 'file'
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
            >
              Entire File
            </button>
            <button
              type="button"
              onClick={() => onResolutionModeChange('hunk')}
              className={cn(
                "px-3 py-1 text-xs transition-colors border-l border-border",
                resolutionMode === 'hunk'
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              )}
            >
              Per Change
            </button>
          </div>
        </div>
      )}

      {/* Quick Resolution Buttons */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground font-medium">
          {resolutionMode === 'file' ? 'Choose resolution for entire file:' : 'Choose resolution:'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={activeResolution === 'theirs' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSetResolution('theirs')}
            className={cn(
              "justify-start gap-2",
              activeResolution === 'theirs' && "bg-blue-600 hover:bg-blue-700"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Keep Theirs</span>
            <span className="text-xs opacity-70">(main)</span>
          </Button>

          <Button
            variant={activeResolution === 'ours' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSetResolution('ours')}
            className={cn(
              "justify-start gap-2",
              activeResolution === 'ours' && "bg-green-600 hover:bg-green-700"
            )}
          >
            <ArrowRight className="h-4 w-4" />
            <span>Keep Ours</span>
            <span className="text-xs opacity-70">(spec)</span>
          </Button>

          <Button
            variant={activeResolution === 'both' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSetResolution('both')}
            className={cn(
              "justify-start gap-2",
              activeResolution === 'both' && "bg-purple-600 hover:bg-purple-700"
            )}
          >
            <GitMerge className="h-4 w-4" />
            <span>Keep Both</span>
          </Button>

          <Button
            variant={activeResolution === 'ai' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSetResolution('ai')}
            className={cn(
              "justify-start gap-2",
              activeResolution === 'ai' && "bg-amber-600 hover:bg-amber-700"
            )}
          >
            <Sparkles className="h-4 w-4" />
            <span>Use AI</span>
          </Button>
        </div>

        {/* Edit Manually Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onEditManually}
          className="w-full justify-center gap-2 mt-2"
        >
          <Edit2 className="h-4 w-4" />
          Edit Manually
        </Button>
      </div>

      {/* Current Selection Indicator */}
      {activeResolution && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success/20">
          <Check className="h-4 w-4 text-success" />
          <span className="text-sm text-success">
            Resolution selected: <strong className="capitalize">{activeResolution}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
