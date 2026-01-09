import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../ui/collapsible';
import { cn } from '../../../lib/utils';

export interface CollapsibleCardProps {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * Reusable Collapsible Card Component
 * Consistent styling for collapsible sections throughout the PR review UI
 */
export function CollapsibleCard({
  title,
  icon,
  badge,
  headerAction,
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
}: CollapsibleCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("border rounded-lg bg-card shadow-sm overflow-hidden", className)}
    >
      <CollapsibleTrigger asChild>
        <div className="p-4 flex items-center justify-between gap-3 bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            {icon && <div className="shrink-0">{icon}</div>}
            <span className="font-medium truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            {badge}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
