import * as React from 'react';
import { GitPullRequest, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type PRStatusFilter = 'open' | 'closed';

export interface StatusTabsProps {
  /** Currently active tab */
  activeTab: PRStatusFilter;
  /** Number of open PRs */
  openCount: number;
  /** Number of closed PRs */
  closedCount: number;
  /** Callback when tab is changed */
  onTabChange: (tab: PRStatusFilter) => void;
  /** Optional additional className */
  className?: string;
}

/**
 * StatusTabs component displays Open/Closed toggle buttons with counts.
 * Styled to match GitHub's PR list UI with dark theme colors.
 */
export function StatusTabs({
  activeTab,
  openCount,
  closedCount,
  onTabChange,
  className,
}: StatusTabsProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <StatusTabButton
        isActive={activeTab === 'open'}
        onClick={() => onTabChange('open')}
        icon={<GitPullRequest className="h-4 w-4" />}
        label="Open"
        count={openCount}
      />
      <StatusTabButton
        isActive={activeTab === 'closed'}
        onClick={() => onTabChange('closed')}
        icon={<Check className="h-4 w-4" />}
        label="Closed"
        count={closedCount}
      />
    </div>
  );
}

interface StatusTabButtonProps {
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}

function StatusTabButton({
  isActive,
  onClick,
  icon,
  label,
  count,
}: StatusTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // GitHub-style compact sizing: 8-12px padding, 6px border-radius
        'inline-flex items-center gap-1.5 px-2 py-1 text-sm font-medium',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'rounded-[6px]',
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      <span className="font-semibold">{count.toLocaleString()}</span>
      <span>{label}</span>
    </button>
  );
}

StatusTabs.displayName = 'StatusTabs';
