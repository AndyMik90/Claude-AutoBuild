/**
 * List of work items with loading/empty states
 */

import { Loader2 } from 'lucide-react';
import { ScrollArea } from '../../ui/scroll-area';
import { WorkItemCard } from './WorkItemCard';
import type { PlaneWorkItem } from '../types';

interface WorkItemListProps {
  workItems: PlaneWorkItem[];
  selectedWorkItemIds: Set<string>;
  isLoadingWorkItems: boolean;
  selectedProjectId: string;
  projectIdentifier?: string;
  searchQuery: string;
  filterStateGroup: string;
  onToggleWorkItem: (workItemId: string) => void;
}

export function WorkItemList({
  workItems,
  selectedWorkItemIds,
  isLoadingWorkItems,
  selectedProjectId,
  projectIdentifier,
  searchQuery,
  filterStateGroup,
  onToggleWorkItem
}: WorkItemListProps) {
  if (isLoadingWorkItems) {
    return (
      <div className="flex-1 min-h-0 -mx-6 px-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="flex-1 min-h-0 -mx-6 px-6">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Select a project to view work items</p>
        </div>
      </div>
    );
  }

  if (workItems.length === 0) {
    return (
      <div className="flex-1 min-h-0 -mx-6 px-6">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">
            {searchQuery || filterStateGroup !== 'all'
              ? 'No work items match your filters'
              : 'No work items found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-6 overflow-hidden">
      <ScrollArea className="h-[40vh] px-6">
        <div className="space-y-2 py-2">
          {workItems.map(workItem => (
            <WorkItemCard
              key={workItem.id}
              workItem={workItem}
              isSelected={selectedWorkItemIds.has(workItem.id)}
              projectIdentifier={projectIdentifier}
              onToggle={onToggleWorkItem}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
