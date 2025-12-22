/**
 * Controls for selecting/deselecting all work items and refreshing
 */

import { CheckSquare, Square, Minus, RefreshCw } from 'lucide-react';

interface SelectionControlsProps {
  isAllSelected: boolean;
  isSomeSelected: boolean;
  selectedCount: number;
  filteredCount: number;
  isLoadingWorkItems: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRefresh: () => void;
}

export function SelectionControls({
  isAllSelected,
  isSomeSelected,
  selectedCount,
  filteredCount,
  isLoadingWorkItems,
  onSelectAll,
  onDeselectAll,
  onRefresh
}: SelectionControlsProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={isAllSelected ? onDeselectAll : onSelectAll}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {isAllSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : isSomeSelected ? (
            <Minus className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {isAllSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {filteredCount} selected
        </span>
      </div>

      <button
        onClick={onRefresh}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        disabled={isLoadingWorkItems}
      >
        <RefreshCw className={`h-3 w-3 ${isLoadingWorkItems ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
