import * as React from 'react';
import { Search, Tag, Milestone, RefreshCw, ExternalLink } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { cn } from '../../../lib/utils';

export interface PRListHeaderProps {
  /** Repository full name (e.g., "owner/repo") */
  repoFullName?: string;
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Number of labels in the repository (placeholder) */
  labelsCount?: number;
  /** Number of milestones in the repository (placeholder) */
  milestonesCount?: number;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Callback when refresh is requested */
  onRefresh?: () => void;
  /** Optional additional className */
  className?: string;
}

/**
 * PRListHeader component displays the header section of the PR list.
 * Includes search bar, metadata badges (Labels, Milestones), and New PR button.
 * Styled to match GitHub's PR list UI with dark theme colors.
 */
export function PRListHeader({
  repoFullName,
  searchQuery,
  onSearchChange,
  labelsCount = 0,
  milestonesCount = 0,
  isLoading = false,
  onRefresh,
  className,
}: PRListHeaderProps) {
  // Construct the GitHub new PR URL
  const newPRUrl = repoFullName
    ? `https://github.com/${repoFullName}/compare`
    : undefined;

  const handleNewPRClick = () => {
    if (newPRUrl) {
      window.open(newPRUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={cn('shrink-0 px-4 py-3 border-b border-[#30363d]', className)}>
      {/* Search and Actions Row */}
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="is:pr is:open"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 rounded-[6px] border-[#30363d] focus:border-[#8b949e]"
          />
        </div>

        {/* Metadata Badges */}
        <div className="flex items-center gap-2">
          <MetadataBadge
            icon={<Tag className="h-3.5 w-3.5" />}
            label="Labels"
            count={labelsCount}
          />
          <MetadataBadge
            icon={<Milestone className="h-3.5 w-3.5" />}
            label="Milestones"
            count={milestonesCount}
          />
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="shrink-0"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        )}

        {/* New Pull Request Button - GitHub green #238636 */}
        <Button
          variant="success"
          size="sm"
          onClick={handleNewPRClick}
          disabled={!newPRUrl}
          className="shrink-0 gap-1.5 bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636] rounded-[6px]"
        >
          New pull request
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface MetadataBadgeProps {
  icon: React.ReactNode;
  label: string;
  count: number;
}

function MetadataBadge({ icon, label, count }: MetadataBadgeProps) {
  return (
    <button
      type="button"
      className={cn(
        // GitHub-style compact sizing: 8-12px padding, 6px border-radius
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-sm',
        'border border-[#30363d] rounded-[6px] bg-transparent',
        'text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:border-[#8b949e]',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      {icon}
      <span>{label}</span>
      <Badge variant="muted" className="ml-0.5 px-1.5 py-0 text-xs min-w-[1.25rem] text-center rounded-[6px]">
        {count.toLocaleString()}
      </Badge>
    </button>
  );
}

PRListHeader.displayName = 'PRListHeader';
