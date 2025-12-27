import * as React from 'react';
import { StatusTabs, type PRStatusFilter } from './StatusTabs';
import { FilterDropdowns, type SortOption } from './FilterDropdowns';
import { cn } from '../../../lib/utils';

export interface PRListControlsProps {
  /** Currently active status tab */
  activeTab: PRStatusFilter;
  /** Number of open PRs */
  openCount: number;
  /** Number of closed PRs */
  closedCount: number;
  /** Callback when status tab is changed */
  onTabChange: (tab: PRStatusFilter) => void;
  /** List of unique authors (usernames) for the Author filter */
  authors?: string[];
  /** List of unique labels for the Label filter */
  labels?: string[];
  /** Currently selected author filter (undefined means "all") */
  selectedAuthor?: string;
  /** Currently selected label filter (undefined means "all") */
  selectedLabel?: string;
  /** Currently selected sort option */
  selectedSort?: SortOption;
  /** Callback when author filter changes */
  onAuthorChange?: (author: string | undefined) => void;
  /** Callback when label filter changes */
  onLabelChange?: (label: string | undefined) => void;
  /** Callback when sort option changes */
  onSortChange?: (sort: SortOption) => void;
  /** Optional additional className */
  className?: string;
}

/**
 * PRListControls component combines StatusTabs and FilterDropdowns.
 * Renders StatusTabs above FilterDropdowns in a compact layout.
 * Styled to match GitHub's PR list UI with dark theme colors.
 */
export function PRListControls({
  activeTab,
  openCount,
  closedCount,
  onTabChange,
  authors,
  labels,
  selectedAuthor,
  selectedLabel,
  selectedSort,
  onAuthorChange,
  onLabelChange,
  onSortChange,
  className,
}: PRListControlsProps) {
  return (
    <div className={cn('shrink-0 px-4 py-2 border-b border-[#30363d]', className)}>
      {/* Status Tabs and Filters Row - compact 8-12px padding */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Status Tabs (Open/Closed) */}
        <StatusTabs
          activeTab={activeTab}
          openCount={openCount}
          closedCount={closedCount}
          onTabChange={onTabChange}
        />

        {/* Filter Dropdowns */}
        <FilterDropdowns
          authors={authors}
          labels={labels}
          selectedAuthor={selectedAuthor}
          selectedLabel={selectedLabel}
          selectedSort={selectedSort}
          onAuthorChange={onAuthorChange}
          onLabelChange={onLabelChange}
          onSortChange={onSortChange}
        />
      </div>
    </div>
  );
}

PRListControls.displayName = 'PRListControls';
