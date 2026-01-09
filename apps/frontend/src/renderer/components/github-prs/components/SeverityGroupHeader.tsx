/**
 * SeverityGroupHeader - Collapsible header for a severity group with selection checkbox
 */

import { ChevronDown, ChevronRight, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { SeverityGroup } from '../constants/severity-config';
import { SEVERITY_CONFIG } from '../constants/severity-config';

interface SeverityGroupHeaderProps {
  severity: SeverityGroup;
  count: number;
  selectedCount: number;
  expanded: boolean;
  onToggle: () => void;
  onSelectAll: (e: React.MouseEvent) => void;
}

export function SeverityGroupHeader({
  severity,
  count,
  selectedCount,
  expanded,
  onToggle,
  onSelectAll,
}: SeverityGroupHeaderProps) {
  const { t } = useTranslation('common');
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  const isFullySelected = selectedCount === count && count > 0;
  const isPartiallySelected = selectedCount > 0 && selectedCount < count;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-t-lg transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Group Checkbox */}
        <div
          onClick={onSelectAll}
          className="cursor-pointer"
        >
          {isFullySelected ? (
            <CheckSquare className={cn("h-4 w-4", config.color)} />
          ) : isPartiallySelected ? (
            <MinusSquare className={cn("h-4 w-4", config.color)} />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <Icon className={cn("h-4 w-4", config.color)} />
        <span className={cn("font-medium text-sm", config.color)}>
          {t(config.labelKey)}
        </span>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {t(config.descriptionKey)}
        </span>
      </div>
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
