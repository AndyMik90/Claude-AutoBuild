import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { EnvCategory } from '../../../../shared/constants/env-registry';
import { ENV_CATEGORY_INFO } from '../../../../shared/constants/env-registry';

interface EnvCategorySectionProps {
  category: EnvCategory;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Custom title (overrides category label) */
  title?: string;
  /** Custom description (overrides category description) */
  description?: string;
  /** Icon to display next to title */
  icon?: React.ReactNode;
}

/**
 * Collapsible section for grouping environment variables by category
 */
export function EnvCategorySection({
  category,
  children,
  defaultOpen = true,
  className,
  title,
  description,
  icon
}: EnvCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const categoryInfo = ENV_CATEGORY_INFO[category];
  const displayTitle = title || categoryInfo.label;
  const displayDescription = description || categoryInfo.description;

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h3 className="font-medium">{displayTitle}</h3>
            <p className="text-sm text-muted-foreground">{displayDescription}</p>
          </div>
        </div>
        <div className="text-muted-foreground">
          {isOpen ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t p-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface SimpleEnvSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

/**
 * Simple collapsible section without category dependency
 */
export function SimpleEnvSection({
  title,
  description,
  children,
  defaultOpen = true,
  className,
  icon
}: SimpleEnvSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h3 className="font-medium">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="text-muted-foreground">
          {isOpen ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t p-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
