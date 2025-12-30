import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { cn } from '../../../lib/utils';

export type SortOption = 'newest' | 'oldest' | 'most-commented' | 'least-commented' | 'recently-updated' | 'least-recently-updated';

export interface FilterDropdownsProps {
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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most-commented', label: 'Most commented' },
  { value: 'least-commented', label: 'Least commented' },
  { value: 'recently-updated', label: 'Recently updated' },
  { value: 'least-recently-updated', label: 'Least recently updated' },
];

/**
 * FilterDropdowns component provides Author, Label, and Sort filter dropdowns.
 * Styled to match GitHub's PR list UI with compact horizontal layout.
 */
export function FilterDropdowns({
  authors = [],
  labels = [],
  selectedAuthor,
  selectedLabel,
  selectedSort = 'newest',
  onAuthorChange,
  onLabelChange,
  onSortChange,
  className,
}: FilterDropdownsProps) {
  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {/* Author Filter */}
      <FilterDropdown
        label="Author"
        value={selectedAuthor}
        options={authors}
        onChange={onAuthorChange}
        placeholder="Author"
      />

      {/* Label Filter */}
      <FilterDropdown
        label="Label"
        value={selectedLabel}
        options={labels}
        onChange={onLabelChange}
        placeholder="Label"
      />

      {/* Sort Dropdown */}
      <SortDropdown
        value={selectedSort}
        onChange={onSortChange}
      />
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  value?: string;
  options: string[];
  onChange?: (value: string | undefined) => void;
  placeholder: string;
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
}: FilterDropdownProps) {
  const handleSelect = (option: string | undefined) => {
    onChange?.(option);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            // GitHub-style compact sizing: 8-12px padding, 6px border-radius
            'inline-flex items-center gap-1 px-2.5 py-1 text-sm',
            'border border-[#30363d] rounded-[6px] bg-transparent',
            'text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:border-[#8b949e]',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value && 'text-foreground'
          )}
        >
          <span>{value || placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-75" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px] max-h-[300px] overflow-y-auto">
        <DropdownMenuLabel className="text-xs text-muted-foreground sticky top-0 bg-popover z-10">
          Filter by {label.toLowerCase()}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Clear option */}
        <DropdownMenuItem
          onClick={() => handleSelect(undefined)}
          className="text-muted-foreground"
        >
          <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
          <span>All {label.toLowerCase()}s</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.length > 0 ? (
          options.map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() => handleSelect(option)}
            >
              <Check className={cn('mr-2 h-4 w-4', value === option ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{option}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground italic">
            No {label.toLowerCase()}s found
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortDropdownProps {
  value: SortOption;
  onChange?: (value: SortOption) => void;
}

function SortDropdown({ value, onChange }: SortDropdownProps) {
  const currentLabel = SORT_OPTIONS.find((opt) => opt.value === value)?.label || 'Sort';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            // GitHub-style compact sizing: 8-12px padding, 6px border-radius
            'inline-flex items-center gap-1 px-2.5 py-1 text-sm',
            'border border-[#30363d] rounded-[6px] bg-transparent',
            'text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:border-[#8b949e]',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <span>Sort: {currentLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-75" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange?.(option.value)}
          >
            <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

FilterDropdowns.displayName = 'FilterDropdowns';
