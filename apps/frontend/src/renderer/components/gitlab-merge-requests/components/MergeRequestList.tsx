import { useState } from 'react';
import { Loader2, RefreshCw, GitPullRequest } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { ScrollArea } from '../../ui/scroll-area';
import { MergeRequestItem } from './MergeRequestItem';
import type { GitLabMergeRequest } from '../../../../shared/types';

interface MergeRequestListProps {
  mergeRequests: GitLabMergeRequest[];
  isLoading: boolean;
  selectedMrIid: number | null;
  onSelectMr: (mr: GitLabMergeRequest) => void;
  onRefresh: () => void;
  stateFilter: 'opened' | 'closed' | 'merged' | 'all';
  onStateFilterChange: (state: 'opened' | 'closed' | 'merged' | 'all') => void;
}

export function MergeRequestList({
  mergeRequests,
  isLoading,
  selectedMrIid,
  onSelectMr,
  onRefresh,
  stateFilter,
  onStateFilterChange
}: MergeRequestListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMrs = mergeRequests.filter((mr) => {
    const matchesSearch =
      mr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mr.sourceBranch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mr.targetBranch.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(mr.iid).includes(searchQuery);

    return matchesSearch;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <GitPullRequest className="h-4 w-4" />
            Merge Requests
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Input
          placeholder="Search merge requests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
        />

        <div className="flex gap-1">
          {(['opened', 'merged', 'closed', 'all'] as const).map((state) => (
            <Button
              key={state}
              variant={stateFilter === state ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onStateFilterChange(state)}
              className="h-7 text-xs capitalize"
            >
              {state}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {isLoading && mergeRequests.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMrs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No matching merge requests' : 'No merge requests found'}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredMrs.map((mr) => (
              <MergeRequestItem
                key={mr.id}
                mr={mr}
                isSelected={mr.iid === selectedMrIid}
                onClick={() => onSelectMr(mr)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
