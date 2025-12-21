/**
 * Hook for filtering and searching Plane work items
 */

import { useMemo } from 'react';
import type { PlaneWorkItem, PlaneState } from '../types';

// Helper to get state ID from work item (handles both string and object state)
function getStateId(item: PlaneWorkItem): string {
  if (typeof item.state === 'object' && item.state !== null) {
    return item.state.id;
  }
  return item.state as string;
}

// Helper to get state details from work item
function getStateDetails(item: PlaneWorkItem): { id: string; name: string; group: string; color: string } | undefined {
  // First check if state is an expanded object
  if (typeof item.state === 'object' && item.state !== null) {
    return item.state;
  }
  // Fall back to state_detail if present
  return item.state_detail;
}

export function useWorkItemFiltering(
  workItems: PlaneWorkItem[],
  states: PlaneState[],
  searchQuery: string,
  filterStateGroup: string
) {
  // Work items already have state embedded in the response
  const enrichedWorkItems = workItems;

  const filteredWorkItems = useMemo(() => {
    return enrichedWorkItems.filter(item => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();

        // Check for ticket ID format (e.g., "PLAT-25" or just "25")
        // Extract the number part if query contains a dash (e.g., "PLAT-25" -> "25")
        const ticketIdMatch = query.match(/^([a-z]+)-?(\d+)$/i);
        const numberOnlyMatch = query.match(/^(\d+)$/);

        let matchesTicketId = false;
        if (ticketIdMatch) {
          // Query is like "PLAT-25" or "PLAT25"
          const queryNumber = parseInt(ticketIdMatch[2], 10);
          matchesTicketId = item.sequence_id === queryNumber;
        } else if (numberOnlyMatch) {
          // Query is just a number like "25"
          const queryNumber = parseInt(numberOnlyMatch[1], 10);
          matchesTicketId = item.sequence_id === queryNumber;
        }

        const matchesName = item.name.toLowerCase().includes(query);
        const matchesSequenceId = item.sequence_id?.toString().includes(query);
        const matchesDescription = item.description_stripped?.toLowerCase().includes(query);

        if (!matchesName && !matchesSequenceId && !matchesDescription && !matchesTicketId) {
          return false;
        }
      }

      // State filter - filter by state ID
      if (filterStateGroup !== 'all') {
        const itemStateId = getStateId(item);
        if (itemStateId !== filterStateGroup) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedWorkItems, searchQuery, filterStateGroup]);

  // Get unique states for the filter dropdown
  // Use fetched states if available, otherwise extract from work items
  const uniqueStates = useMemo(() => {
    if (states.length > 0) {
      return states;
    }
    // Extract unique states from work items
    const stateSet = new Map<string, { id: string; name: string; group: string }>();
    workItems.forEach(item => {
      const stateId = getStateId(item);
      if (!stateSet.has(stateId)) {
        const stateDetails = getStateDetails(item);
        stateSet.set(stateId, {
          id: stateId,
          name: stateDetails?.name || `State ${stateSet.size + 1}`,
          group: stateDetails?.group || 'backlog'
        });
      }
    });
    return Array.from(stateSet.values());
  }, [states, workItems]);

  return { filteredWorkItems, uniqueStates };
}
