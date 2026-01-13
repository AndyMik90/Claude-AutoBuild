import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { ScrollArea } from './scroll-area';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

interface ComboboxProps {
  /** Currently selected value */
  value: string;
  /** Callback when value changes */
  onValueChange: (value: string) => void;
  /** Available options */
  options: ComboboxOption[];
  /** Placeholder text for the trigger button */
  placeholder?: string;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Message shown when no results match the search */
  emptyMessage?: string;
  /** Whether the combobox is disabled */
  disabled?: boolean;
  /** Additional class names for the trigger */
  className?: string;
  /** ID for the trigger element */
  id?: string;
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  disabled = false,
  className,
  id,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();

  // Find the selected option's label
  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || placeholder;

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const searchLower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(searchLower) ||
        opt.description?.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  // Focus input when popover opens
  React.useEffect(() => {
    if (open) {
      // Small delay to ensure the popover is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    } else {
      // Clear search when closing
      setSearch('');
    }
  }, [open]);

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          id={id}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-lg',
            'border border-border bg-card px-3 py-2 text-sm',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-colors duration-200',
            className
          )}
        >
          <span className={cn('truncate', !selectedOption && 'text-muted-foreground')}>
            {displayValue}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              'flex h-10 w-full bg-transparent py-3 px-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          />
        </div>

        {/* Options list */}
        <ScrollArea className="max-h-[300px]">
          <div id={listboxId} role="listbox" aria-label={searchPlaceholder || placeholder} className="p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'relative flex w-full cursor-default select-none items-center',
                    'rounded-md py-2 pl-8 pr-2 text-sm outline-none',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:bg-accent focus:text-accent-foreground',
                    'transition-colors duration-150'
                  )}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {value === option.value && <Check className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

Combobox.displayName = 'Combobox';
