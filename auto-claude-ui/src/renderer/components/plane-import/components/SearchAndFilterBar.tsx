/**
 * Search input and state filter dropdown
 */

import { Search, Filter } from 'lucide-react';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../ui/select';

interface StateOption {
  id: string;
  name: string;
  group: string;
}

interface SearchAndFilterBarProps {
  searchQuery: string;
  filterStateGroup: string;
  uniqueStates: StateOption[];
  onSearchChange: (query: string) => void;
  onFilterChange: (stateId: string) => void;
}

export function SearchAndFilterBar({
  searchQuery,
  filterStateGroup,
  uniqueStates,
  onSearchChange,
  onFilterChange
}: SearchAndFilterBarProps) {
  return (
    <div className="flex gap-3 items-center shrink-0">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search work items..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={filterStateGroup} onValueChange={onFilterChange}>
        <SelectTrigger className="w-[180px]">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states</SelectItem>
          {uniqueStates.map(state => (
            <SelectItem key={state.id} value={state.id}>
              {state.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
